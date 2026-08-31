import type { ChildProcess, Serializable } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { CorePrivateSupervisor } from "../src/main/core-private-supervisor.js";
import type { CorePrivateClient } from "../src/main/core-private-client.js";

describe("DCF-1.3A CorePrivateSupervisor lifecycle", () => {
  it("retains the lifecycle token only in a Main Buffer across Core restart and zeroes it on stop", async () => {
    const environmentName = "ROBOTHREE_INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN";
    const secret = "header.payload.signature";
    process.env[environmentName] = secret;
    const first = new FakeCoreChild("ready", "runtime.instance-first");
    const second = new FakeCoreChild("ready", "runtime.instance-second");
    const children = [first, second];
    const captured: Buffer[] = [];
    let tokenSequence = 0;
    const supervisor = new CorePrivateSupervisor({
      entryPath: "/fixed/core-entry.js",
      databasePath: "/fixed/robothree.sqlite",
      maxUnexpectedRestarts: 1,
      dependencies: {
        startTimeoutMs: 100,
        stopTimeoutMs: 100,
        restartDelayMs: 1,
        wait: async () => undefined,
        spawnChild: (_entryPath, internalTrial) => {
          const lease = internalTrial?.agentLifecycleAccessToken;
          if (lease !== undefined) captured.push(lease);
          const child = children.shift();
          if (child === undefined) throw new Error("unexpected extra Core spawn");
          return child as unknown as ChildProcess;
        },
        createAuthorizationToken: () =>
          `token-${String(tokenSequence++).padStart(40, "0")}`,
        createClient: () => ({} as CorePrivateClient),
      },
    });

    expect(process.env).not.toHaveProperty(environmentName);
    await supervisor.start();
    await supervisor.restart();
    expect(captured).toHaveLength(2);
    expect(captured[0]).toBe(captured[1]);
    expect(captured[0]?.toString("utf8")).toBe(secret);

    await supervisor.stop();
    expect(captured[0]?.every((byte) => byte === 0)).toBe(true);
    delete process.env[environmentName];
  });

  it("uses the single automatic restart budget when startup fails before ready", async () => {
    const first = new FakeCoreChild("fail_before_ready", "runtime.instance-first");
    const second = new FakeCoreChild("ready", "runtime.instance-second");
    const children = [first, second];
    const supervisor = fakeSupervisor(children);

    await supervisor.start();

    expect(supervisor.snapshot()).toMatchObject({
      runtimeState: "ready",
      coreReady: true,
      unexpectedRestartCount: 1,
    });
    expect(children).toHaveLength(0);
    expect(first.authorizationTokens).toHaveLength(1);
    expect(second.authorizationTokens).toHaveLength(1);
    expect(second.authorizationTokens[0]).not.toBe(first.authorizationTokens[0]);
    await supervisor.stop();
    expect(supervisor.snapshot().runtimeState).toBe("stopped");
  });

  it("transitions ready to restarting, recovers once, then fails closed", async () => {
    const first = new FakeCoreChild("ready", "runtime.instance-first");
    const second = new FakeCoreChild("ready", "runtime.instance-second");
    const children = [first, second];
    let releaseRestart: (() => void) | undefined;
    const restartGate = new Promise<void>((resolve) => {
      releaseRestart = resolve;
    });
    const supervisor = fakeSupervisor(children, async () => restartGate);
    await supervisor.start();

    first.exitUnexpectedly();
    expect(supervisor.snapshot()).toMatchObject({
      runtimeState: "restarting",
      unexpectedRestartCount: 1,
    });

    releaseRestart?.();
    await eventually(() => supervisor.snapshot().runtimeState === "ready");
    expect(children).toHaveLength(0);

    second.exitUnexpectedly();
    await eventually(() => supervisor.snapshot().runtimeState === "failed");
    expect(supervisor.snapshot()).toMatchObject({
      runtimeState: "failed",
      coreReady: false,
      unexpectedRestartCount: 1,
    });
    await expect(supervisor.start()).rejects.toThrow(
      "restart the Desktop application",
    );
    expect(supervisor.lastFailureSummaryForDiagnostics()).not.toContain("/Users/");
    expect(supervisor.lastFailureSummaryForDiagnostics()).not.toContain("Bearer");
    await supervisor.stop();
  });

  it("coalesces concurrent starts and stops a child that has not reached ready", async () => {
    const child = new FakeCoreChild("manual", "runtime.instance-pending");
    const supervisor = fakeSupervisor([child]);

    const starts = [supervisor.start(), supervisor.start(), supervisor.start()];
    expect(supervisor.snapshot().runtimeState).toBe("starting");
    await supervisor.stop();

    const results = await Promise.allSettled(starts);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(supervisor.snapshot()).toMatchObject({
      runtimeState: "stopped",
      coreReady: false,
    });
  });

  it("performs a controlled restart without consuming the automatic budget", async () => {
    const first = new FakeCoreChild("ready", "runtime.instance-first");
    const second = new FakeCoreChild("ready", "runtime.instance-second");
    const children = [first, second];
    const supervisor = fakeSupervisor(children);
    await supervisor.start();

    await supervisor.restart();

    expect(first.receivedShutdown).toBe(true);
    expect(supervisor.snapshot()).toMatchObject({
      runtimeState: "ready",
      unexpectedRestartCount: 0,
    });
    expect(children).toHaveLength(0);
    await supervisor.stop();
  });

  it("waits for an in-flight stop before starting a replacement child", async () => {
    const first = new FakeCoreChild("ready", "runtime.instance-first");
    const second = new FakeCoreChild("ready", "runtime.instance-second");
    const children = [first, second];
    const supervisor = fakeSupervisor(children);
    await supervisor.start();

    const stopping = supervisor.stop();
    const duplicateStop = supervisor.stop();
    const starting = supervisor.start();
    await Promise.all([stopping, duplicateStop, starting]);

    expect(first.receivedShutdown).toBe(true);
    expect(supervisor.snapshot()).toMatchObject({
      runtimeState: "ready",
      coreReady: true,
      unexpectedRestartCount: 0,
    });
    expect(children).toHaveLength(0);
    await supervisor.stop();
  });

  it("escalates Core shutdown from IPC to SIGTERM and SIGKILL", async () => {
    const child = new FakeCoreChild("ignore_shutdown", "runtime.instance-stuck");
    const supervisor = fakeSupervisor([child]);
    await supervisor.start();

    await supervisor.stop();

    expect(child.receivedShutdown).toBe(true);
    expect(child.killSignals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(supervisor.snapshot()).toMatchObject({
      runtimeState: "stopped",
      coreReady: false,
    });
  });
});

function fakeSupervisor(
  children: FakeCoreChild[],
  wait: (milliseconds: number) => Promise<void> = async () => undefined,
): CorePrivateSupervisor {
  let tokenSequence = 0;
  return new CorePrivateSupervisor({
    entryPath: "/fixed/core-entry.js",
    databasePath: "/fixed/robothree.sqlite",
    maxUnexpectedRestarts: 1,
    dependencies: {
      startTimeoutMs: 100,
      stopTimeoutMs: 100,
      restartDelayMs: 1,
      wait,
      spawnChild: () => {
        const child = children.shift();
        if (child === undefined) throw new Error("unexpected extra Core spawn");
        return child as unknown as ChildProcess;
      },
      createAuthorizationToken: () =>
        `token-${String(tokenSequence++).padStart(40, "0")}`,
      createClient: () => ({} as CorePrivateClient),
    },
  });
}

type FakeChildMode = "ready" | "fail_before_ready" | "manual" | "ignore_shutdown";

class FakeCoreChild extends EventEmitter {
  readonly stderr = new PassThrough();
  connected = true;
  exitCode: number | null = null;
  receivedShutdown = false;
  readonly killSignals: string[] = [];
  readonly authorizationTokens: string[] = [];
  readonly #mode: FakeChildMode;
  readonly #runtimeInstanceId: string;

  constructor(mode: FakeChildMode, runtimeInstanceId: string) {
    super();
    this.#mode = mode;
    this.#runtimeInstanceId = runtimeInstanceId;
  }

  send(
    message: Serializable,
    callback?: (error: Error | null) => void,
  ): boolean {
    if (isRecord(message) && message.type === "desktop.core.shutdown") {
      this.receivedShutdown = true;
      if (this.#mode !== "ignore_shutdown") {
        queueMicrotask(() => this.exit(0, null));
      }
    } else if (isRecord(message) && message.type === "desktop.core.boot") {
      if (typeof message.authorizationToken === "string") {
        this.authorizationTokens.push(message.authorizationToken);
      }
      if (this.#mode === "ready" || this.#mode === "ignore_shutdown") {
        queueMicrotask(() => {
          this.emit("message", {
            type: "desktop.core.ready",
            host: "127.0.0.1",
            port: 43_100,
            runtimeInstanceId: this.#runtimeInstanceId,
            coreVersion: "0.0.0-dcf.1.3c",
          });
        });
      } else if (this.#mode === "fail_before_ready") {
        queueMicrotask(() => this.exit(1, null));
      }
    }
    callback?.(null);
    return true;
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    const normalized = typeof signal === "string" ? signal : "SIGTERM";
    this.killSignals.push(normalized);
    if (this.#mode !== "ignore_shutdown" || normalized === "SIGKILL") {
      this.exit(0, normalized);
    }
    return true;
  }

  exitUnexpectedly(): void {
    this.exit(1, null);
  }

  private exit(
    code: number,
    signal: NodeJS.Signals | null,
  ): void {
    if (this.exitCode !== null) return;
    this.exitCode = code;
    this.connected = false;
    this.emit("exit", code, signal);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function eventually(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condition was not reached");
}
