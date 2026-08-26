import { fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  FOUNDATION_FIXTURE_SCHEMA,
  type FoundationRuntimeState,
  type FoundationStatus,
} from "../shared/foundation-api.js";
import {
  isCoreHarnessChildMessage,
  type CoreHarnessBootMessage,
  type CoreHarnessReadyMessage,
  type CoreHarnessShutdownMessage,
} from "./core-harness-protocol.js";

const START_TIMEOUT_MS = 5_000;
const STOP_TIMEOUT_MS = 2_000;
const RESTART_DELAY_MS = 100;
const STDERR_LIMIT_BYTES = 4_096;

export interface CoreHarnessSupervisorOptions {
  readonly entryPath: string;
  readonly maxUnexpectedRestarts?: number;
}

export class CoreHarnessSupervisor {
  readonly #entryPath: string;
  readonly #maxUnexpectedRestarts: number;
  #child: ChildProcess | undefined;
  #authorizationToken: string | undefined;
  #port: number | undefined;
  #state: FoundationRuntimeState = "stopped";
  #startPromise: Promise<void> | undefined;
  #stopping = false;
  #unexpectedRestartCount = 0;
  #lastError: string | undefined;

  constructor(options: CoreHarnessSupervisorOptions) {
    this.#entryPath = options.entryPath;
    this.#maxUnexpectedRestarts = options.maxUnexpectedRestarts ?? 1;
  }

  async start(): Promise<void> {
    if (this.#state === "ready") {
      return;
    }
    if (this.#startPromise !== undefined) {
      return this.#startPromise;
    }

    this.#stopping = false;
    this.#unexpectedRestartCount = 0;
    this.#startPromise = this.#launch();
    try {
      await this.#startPromise;
    } finally {
      this.#startPromise = undefined;
    }
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    if (this.#state !== "stopped") this.#state = "stopping";
    const child = this.#child;
    this.#child = undefined;
    this.#authorizationToken = undefined;
    this.#port = undefined;

    if (child === undefined || child.exitCode !== null) {
      this.#state = "stopped";
      return;
    }

    const exited = onceExit(child);
    const message: CoreHarnessShutdownMessage = { type: "fixture.shutdown" };
    child.send(message);

    const stoppedGracefully = await Promise.race([
      exited.then(() => true),
      delay(STOP_TIMEOUT_MS).then(() => false),
    ]);
    if (!stoppedGracefully && child.exitCode === null) {
      child.kill("SIGTERM");
      await onceExit(child);
    }
    this.#state = "stopped";
  }

  snapshot(): FoundationStatus {
    return Object.freeze({
      fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
      fixtureOnly: true,
      runtimeState: this.#state,
      coreReady: this.#state === "ready",
      compatible: this.#state === "ready",
      unexpectedRestartCount: this.#unexpectedRestartCount,
    });
  }

  loopbackBaseUrl(): string | undefined {
    return this.#port === undefined ? undefined : `http://127.0.0.1:${this.#port}`;
  }

  lastFailureSummaryForDiagnostics(): string | undefined {
    return this.#lastError;
  }

  async probe(): Promise<FoundationStatus> {
    if (this.#state !== "ready" || this.#authorizationToken === undefined || this.#port === undefined) {
      return this.snapshot();
    }
    const headers = Object.freeze({
      authorization: `Bearer ${this.#authorizationToken}`,
    });
    const [readiness, compatibility] = await Promise.all([
      fetch(`http://127.0.0.1:${this.#port}/fixture/readiness`, { headers }),
      fetch(`http://127.0.0.1:${this.#port}/fixture/compatibility`, { headers }),
    ]);
    return Object.freeze({
      fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
      fixtureOnly: true,
      runtimeState: this.#state,
      coreReady: readiness.ok,
      compatible: compatibility.ok,
      unexpectedRestartCount: this.#unexpectedRestartCount,
    });
  }

  async #launch(): Promise<void> {
    this.#state = "starting";
    this.#lastError = undefined;
    const authorizationToken = randomBytes(32).toString("base64url");
    const child = fork(this.#entryPath, [], {
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
      },
      serialization: "json",
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    this.#child = child;
    this.#authorizationToken = authorizationToken;

    const stderrChunks: Buffer[] = [];
    let stderrBytes = 0;
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrBytes >= STDERR_LIMIT_BYTES) {
        return;
      }
      const remaining = STDERR_LIMIT_BYTES - stderrBytes;
      const bounded = chunk.subarray(0, remaining);
      stderrChunks.push(bounded);
      stderrBytes += bounded.byteLength;
    });

    child.once("exit", (code, signal) => {
      this.#handleExit(child, code, signal, Buffer.concat(stderrChunks).toString("utf8"));
    });

    const bootMessage: CoreHarnessBootMessage = {
      type: "fixture.boot",
      fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
      authorizationToken,
    };
    child.send(bootMessage);

    const ready = await waitForReady(child);
    if (this.#child !== child || this.#stopping) {
      throw new Error("Core fixture stopped during startup");
    }
    this.#port = ready.port;
    this.#state = "ready";
  }

  #handleExit(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null, stderr: string): void {
    if (this.#child !== child) {
      return;
    }
    this.#child = undefined;
    this.#authorizationToken = undefined;
    this.#port = undefined;

    if (this.#stopping) {
      this.#state = "stopped";
      return;
    }

    this.#lastError = safeExitSummary(code, signal, stderr);
    if (this.#unexpectedRestartCount >= this.#maxUnexpectedRestarts) {
      this.#state = "failed";
      return;
    }

    this.#unexpectedRestartCount += 1;
    this.#state = "restarting";
    void delay(RESTART_DELAY_MS)
      .then(async () => {
        if (!this.#stopping && this.#child === undefined) {
          await this.#launch();
        }
      })
      .catch(() => {
        this.#state = "failed";
      });
  }
}

function waitForReady(child: ChildProcess): Promise<CoreHarnessReadyMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Core fixture readiness timed out"));
    }, START_TIMEOUT_MS);

    const onMessage = (message: unknown): void => {
      if (!isCoreHarnessChildMessage(message)) {
        return;
      }
      if (message.type === "fixture.failed") {
        cleanup();
        reject(new Error(`Core fixture failed: ${message.reason}`));
        return;
      }
      cleanup();
      resolve(message);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanup();
      reject(new Error(`Core fixture exited before readiness: code=${String(code)} signal=${String(signal)}`));
    };

    const cleanup = (): void => {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("exit", onExit);
    };

    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}

function onceExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => child.once("exit", () => resolve()));
}

function safeExitSummary(code: number | null, signal: NodeJS.Signals | null, stderr: string): string {
  const normalizedStderr = stderr.replaceAll(/\s+/gu, " ").trim().slice(0, 512);
  return `code=${String(code)} signal=${String(signal)} stderr=${normalizedStderr || "none"}`;
}
