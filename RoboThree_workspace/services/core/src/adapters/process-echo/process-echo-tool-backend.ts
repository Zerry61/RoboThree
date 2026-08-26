import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import {
  ActionSchema,
  ObservationSchema,
  TaskCapabilityLockSchema,
  type ComponentHealth,
  type Observation,
} from "@robothree/contracts";

import type { Clock } from "../../ports/clock.js";
import type { RuntimeComponent } from "../../ports/runtime-component.js";
import type {
  ToolExecutionBackend,
  ToolExecutionRequest,
} from "../../ports/tool-execution-backend.js";
import { NdjsonFrameDecoder } from "./ndjson-frame-decoder.js";
import {
  PROCESS_ECHO_PROTOCOL_VERSION,
  PROCESS_ECHO_TOOL_ID,
  encodeProcessEchoMessage,
  parseProcessEchoObservation,
  parseProcessEchoReady,
  type ProcessEchoInvokeMessage,
} from "./process-echo-protocol.js";

export type ProcessEchoDiagnosticScenario =
  | "normal"
  | "crash_after_request"
  | "hang_after_request"
  | "malformed_observation"
  | "protocol_mismatch"
  | "split_observation"
  | "stderr_flood"
  | "wrong_request_id";

export type ProcessEchoTransmission = Readonly<{
  requestId: string;
  effectAttemptId: string;
  idempotencyKey: string;
}>;

export class ProcessEchoBackendError extends Error {
  public readonly code:
    | "process_echo.child_entry_missing"
    | "process_echo.child_exited"
    | "process_echo.concurrent_execution"
    | "process_echo.handshake_timeout"
    | "process_echo.invalid_response"
    | "process_echo.not_ready"
    | "process_echo.protocol_error"
    | "process_echo.request_timeout"
    | "process_echo.write_failed";
  public readonly deliveryMayHaveOccurred: boolean;

  public constructor(
    code: ProcessEchoBackendError["code"],
    message: string,
    deliveryMayHaveOccurred: boolean,
  ) {
    super(message);
    this.name = "ProcessEchoBackendError";
    this.code = code;
    this.deliveryMayHaveOccurred = deliveryMayHaveOccurred;
  }
}

type PendingRequest = {
  request: ProcessEchoInvokeMessage;
  resolve: (observation: Observation) => void;
  reject: (error: Error) => void;
};

type PendingHandshake = {
  resolve: () => void;
  reject: (error: Error) => void;
};

const DEFAULT_MAX_FRAME_BYTES = 64 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 4 * 1024;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 2_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_000;
const STOP_GRACE_MS = 500;
const MAX_DIAGNOSTIC_TRANSMISSIONS = 256;

export class ProcessEchoToolBackend implements ToolExecutionBackend, RuntimeComponent {
  public readonly adapterKind = "tool_execution_backend" as const;
  public readonly adapterDescriptorId: string;
  public readonly adapterDescriptorRevision: string;
  public readonly componentId: string;
  readonly #clock: Clock;
  readonly #childEntry: string;
  readonly #maxFrameBytes: number;
  readonly #maxStderrBytes: number;
  readonly #handshakeTimeoutMs: number;
  readonly #requestTimeoutMs: number;
  readonly #diagnosticScenario: ProcessEchoDiagnosticScenario;
  readonly #transmissions: ProcessEchoTransmission[] = [];
  #diagnosticConsumed = false;
  #child: ChildProcessWithoutNullStreams | undefined;
  #decoder: NdjsonFrameDecoder | undefined;
  #pendingHandshake: PendingHandshake | undefined;
  #pendingRequest: PendingRequest | undefined;
  #startPromise: Promise<void> | undefined;
  #executing = false;
  #stderr = "";
  #state: "stopped" | "starting" | "ready" | "failed" = "stopped";

  public constructor(input: {
    adapterDescriptorId: string;
    adapterDescriptorRevision: string;
    clock: Clock;
    diagnosticScenario?: ProcessEchoDiagnosticScenario;
    handshakeTimeoutMs?: number;
    requestTimeoutMs?: number;
    maxFrameBytes?: number;
    maxStderrBytes?: number;
  }) {
    this.adapterDescriptorId = input.adapterDescriptorId;
    this.adapterDescriptorRevision = input.adapterDescriptorRevision;
    this.componentId = `adapter:${input.adapterDescriptorId}`;
    this.#clock = input.clock;
    this.#childEntry = resolveTrustedChildEntry();
    this.#diagnosticScenario = input.diagnosticScenario ?? "normal";
    this.#handshakeTimeoutMs = positiveInteger(input.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS, "handshakeTimeoutMs");
    this.#requestTimeoutMs = positiveInteger(input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, "requestTimeoutMs");
    this.#maxFrameBytes = positiveInteger(input.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES, "maxFrameBytes");
    this.#maxStderrBytes = positiveInteger(input.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES, "maxStderrBytes");
  }

  public transmissions(): readonly ProcessEchoTransmission[] {
    return this.#transmissions.map((transmission) => Object.freeze({ ...transmission }));
  }

  public diagnosticStderrBytes(): number {
    return Buffer.byteLength(this.#stderr, "utf8");
  }

  public async start(): Promise<void> {
    if (this.#state === "ready" && this.#child !== undefined) {
      return;
    }
    if (this.#startPromise !== undefined) {
      return this.#startPromise;
    }
    this.#startPromise = this.#startChild();
    try {
      await this.#startPromise;
    } finally {
      this.#startPromise = undefined;
    }
  }

  public async stop(): Promise<void> {
    const child = this.#child;
    this.#child = undefined;
    this.#decoder = undefined;
    this.#state = "stopped";
    this.#rejectPending(new ProcessEchoBackendError(
      "process_echo.child_exited",
      "Process Echo Backend stopped",
      this.#pendingRequest !== undefined,
    ));
    if (child === undefined || child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    child.kill("SIGTERM");
    await waitForExit(child, STOP_GRACE_MS);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await waitForExit(child, STOP_GRACE_MS);
    }
  }

  public async health(): Promise<ComponentHealth> {
    return {
      componentId: this.componentId,
      status: this.#state === "ready" && this.#child !== undefined ? "ready" : "unavailable",
      checkedAt: this.#clock.now(),
      details: {
        protocolVersion: PROCESS_ECHO_PROTOCOL_VERSION,
        processState: this.#state,
      },
    };
  }

  public async execute(request: ToolExecutionRequest, signal: AbortSignal): Promise<Observation> {
    if (this.#executing) {
      throw new ProcessEchoBackendError(
        "process_echo.concurrent_execution",
        "Process Echo is single-flight; concurrent work must be bounded by RuntimeAdmissionController",
        false,
      );
    }
    this.#executing = true;
    try {
      return await this.#executeSingle(request, signal);
    } finally {
      this.#executing = false;
    }
  }

  async #startChild(): Promise<void> {
    if (!existsSync(this.#childEntry)) {
      this.#state = "failed";
      throw new ProcessEchoBackendError(
        "process_echo.child_entry_missing",
        "Trusted Process Echo child entry is missing; build services/core before startup",
        false,
      );
    }
    this.#state = "starting";
    this.#stderr = "";
    this.#decoder = new NdjsonFrameDecoder(this.#maxFrameBytes);
    const scenario = this.#diagnosticConsumed ? "normal" : this.#diagnosticScenario;
    this.#diagnosticConsumed = true;
    const child = spawn(process.execPath, [this.#childEntry, `--diagnostic=${scenario}`], {
      cwd: dirname(this.#childEntry),
      env: { ROBOTHREE_PROCESS_ECHO_CHILD: "1" },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#child = child;
    child.stdout.on("data", (chunk: Buffer) => this.#onStdout(child, chunk));
    child.stderr.on("data", (chunk: Buffer) => this.#onStderr(child, chunk));
    child.once("error", (error) => this.#onProcessFailure(child, new ProcessEchoBackendError(
      "process_echo.child_exited",
      `Process Echo child failed to start: ${error.message}`,
      false,
    )));
    child.once("exit", (code, signal) => this.#onProcessFailure(child, new ProcessEchoBackendError(
      "process_echo.child_exited",
      `Process Echo child exited (${code ?? signal ?? "unknown"})${this.#stderr.length === 0 ? "" : `: ${this.#stderr}`}`,
      this.#pendingRequest !== undefined,
    )));
    const handshake = new Promise<void>((resolveHandshake, rejectHandshake) => {
      this.#pendingHandshake = { resolve: resolveHandshake, reject: rejectHandshake };
    });
    try {
      await withTimeout(
        handshake,
        this.#handshakeTimeoutMs,
        () => new ProcessEchoBackendError(
          "process_echo.handshake_timeout",
          "Process Echo child did not complete the protocol handshake",
          false,
        ),
      );
      this.#state = "ready";
    } catch (error) {
      await this.#terminateChild();
      this.#state = "failed";
      throw error;
    }
  }

  async #executeSingle(request: ToolExecutionRequest, signal: AbortSignal): Promise<Observation> {
    const normalized = validateRequest(request, this.adapterDescriptorId, this.adapterDescriptorRevision);
    if (signal.aborted) {
      return cancelledObservation(normalized, this.#clock.now());
    }
    const remainingMs = deadlineRemainingMs(normalized.deadlineAt);
    if (remainingMs !== undefined && remainingMs <= 0) {
      return timedOutObservation(normalized, this.#clock.now(), "Tool execution deadline has expired");
    }
    await this.start();
    const child = this.#child;
    if (this.#state !== "ready" || child === undefined) {
      throw new ProcessEchoBackendError("process_echo.not_ready", "Process Echo child is not ready", false);
    }
    const requestId = randomUUID();
    const message: ProcessEchoInvokeMessage = {
      type: "invoke",
      protocolVersion: PROCESS_ECHO_PROTOCOL_VERSION,
      requestId,
      effectAttemptId: normalized.effectAttemptId,
      idempotencyKey: normalized.idempotencyKey,
      toolId: PROCESS_ECHO_TOOL_ID,
      action: normalized.action,
      ...(normalized.deadlineAt === undefined ? {} : { deadlineAt: normalized.deadlineAt }),
    };
    if (this.#transmissions.length === MAX_DIAGNOSTIC_TRANSMISSIONS) {
      this.#transmissions.shift();
    }
    this.#transmissions.push(Object.freeze({
      requestId,
      effectAttemptId: normalized.effectAttemptId,
      idempotencyKey: normalized.idempotencyKey,
    }));
    const response = new Promise<Observation>((resolveObservation, rejectObservation) => {
      this.#pendingRequest = {
        request: message,
        resolve: resolveObservation,
        reject: rejectObservation,
      };
    });
    const abort = () => {
      this.#pendingRequest?.resolve(cancelledObservation(normalized, this.#clock.now()));
      this.#pendingRequest = undefined;
      void this.#terminateChild();
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      await writeFrame(child, encodeProcessEchoMessage(message));
      const timeoutMs = Math.max(1, Math.min(this.#requestTimeoutMs, remainingMs ?? this.#requestTimeoutMs));
      return await withTimeout(response, timeoutMs, () => {
        void this.#terminateChild();
        return new ProcessEchoBackendError(
          "process_echo.request_timeout",
          "Process Echo child did not return an Observation before the deadline",
          true,
        );
      }).catch((error: unknown) => {
        if (error instanceof ProcessEchoBackendError && error.code === "process_echo.request_timeout") {
          this.#pendingRequest = undefined;
          return timedOutObservation(normalized, this.#clock.now(), error.message);
        }
        throw error;
      });
    } catch (error) {
      this.#pendingRequest = undefined;
      if (error instanceof ProcessEchoBackendError) {
        throw error;
      }
      throw new ProcessEchoBackendError(
        "process_echo.write_failed",
        error instanceof Error ? error.message : "Failed to write Process Echo request",
        false,
      );
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }

  #onStdout(child: ChildProcessWithoutNullStreams, chunk: Buffer): void {
    if (this.#child !== child) {
      return;
    }
    try {
      const decoder = this.#decoder;
      if (decoder === undefined) {
        throw new ProcessEchoBackendError("process_echo.protocol_error", "Received output without a decoder", false);
      }
      for (const frame of decoder.push(chunk)) {
        if (this.#pendingHandshake !== undefined) {
          parseProcessEchoReady(frame);
          const handshake = this.#pendingHandshake;
          this.#pendingHandshake = undefined;
          handshake.resolve();
          continue;
        }
        const pending = this.#pendingRequest;
        if (pending === undefined) {
          throw new ProcessEchoBackendError("process_echo.protocol_error", "Received an unsolicited protocol frame", false);
        }
        const response = parseProcessEchoObservation(frame);
        if (
          response.requestId !== pending.request.requestId
          || response.effectAttemptId !== pending.request.effectAttemptId
          || response.observation.actionId !== pending.request.action.actionId
        ) {
          throw new ProcessEchoBackendError(
            "process_echo.invalid_response",
            "Process Echo response does not match the active request",
            true,
          );
        }
        this.#pendingRequest = undefined;
        pending.resolve(ObservationSchema.parse({
          ...response.observation,
          observedAt: this.#clock.now(),
        }));
      }
    } catch (error) {
      const normalized = error instanceof ProcessEchoBackendError
        ? error
        : new ProcessEchoBackendError(
          "process_echo.protocol_error",
          error instanceof Error ? error.message : "Invalid Process Echo protocol output",
          this.#pendingRequest !== undefined,
        );
      this.#onProcessFailure(child, normalized);
      void this.#terminateChild();
    }
  }

  #onStderr(child: ChildProcessWithoutNullStreams, chunk: Buffer): void {
    if (this.#child !== child) {
      return;
    }
    if (this.#stderr.length >= this.#maxStderrBytes) {
      return;
    }
    const remaining = this.#maxStderrBytes - Buffer.byteLength(this.#stderr, "utf8");
    this.#stderr += chunk.subarray(0, Math.max(0, remaining)).toString("utf8");
  }

  #onProcessFailure(child: ChildProcessWithoutNullStreams, error: ProcessEchoBackendError): void {
    if (this.#child !== child) {
      return;
    }
    if (this.#state !== "stopped") {
      this.#state = "failed";
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      this.#child = undefined;
    }
    this.#decoder = undefined;
    this.#rejectPending(error);
  }

  #rejectPending(error: Error): void {
    const handshake = this.#pendingHandshake;
    const request = this.#pendingRequest;
    this.#pendingHandshake = undefined;
    this.#pendingRequest = undefined;
    handshake?.reject(error);
    request?.reject(error);
  }

  async #terminateChild(): Promise<void> {
    const child = this.#child;
    this.#child = undefined;
    this.#decoder = undefined;
    if (child === undefined || child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    child.kill("SIGKILL");
    await waitForExit(child, STOP_GRACE_MS);
  }
}

function validateRequest(
  request: ToolExecutionRequest,
  descriptorId: string,
  descriptorRevision: string,
): ToolExecutionRequest {
  const lock = TaskCapabilityLockSchema.parse(request.lock);
  const action = ActionSchema.parse(request.action);
  if (lock.definitionSnapshot.kind !== "tool" || action.kind !== PROCESS_ECHO_TOOL_ID) {
    throw new ProcessEchoBackendError("process_echo.invalid_response", "Process Echo only accepts tool.echo", false);
  }
  if (
    lock.adapterDescriptorSnapshot.runtimeBoundary !== "child_process"
    || lock.adapterDescriptorSnapshot.protocol.name !== "robothree-process-echo"
    || lock.adapterDescriptorSnapshot.protocol.version !== PROCESS_ECHO_PROTOCOL_VERSION
  ) {
    throw new ProcessEchoBackendError(
      "process_echo.invalid_response",
      "Task capability lock does not describe the trusted Process Echo protocol",
      false,
    );
  }
  if (
    lock.adapterDescriptorSnapshot.adapterDescriptorId !== descriptorId
    || lock.adapterDescriptorSnapshot.revision !== descriptorRevision
  ) {
    throw new ProcessEchoBackendError("process_echo.invalid_response", "Runtime Handle does not match the locked descriptor", false);
  }
  if (request.effectAttemptId.length === 0 || request.idempotencyKey.length === 0) {
    throw new ProcessEchoBackendError("process_echo.invalid_response", "Effect identity is required", false);
  }
  return Object.freeze({ ...request, lock, action });
}

function cancelledObservation(request: ToolExecutionRequest, observedAt: string): Observation {
  return ObservationSchema.parse({
    observationId: randomUUID(),
    actionId: request.action.actionId,
    observedAt,
    outcome: "cancelled",
    error: {
      code: "tool.cancelled",
      category: "cancelled",
      message: "Tool execution was cancelled",
      retryable: false,
    },
  });
}

function timedOutObservation(request: ToolExecutionRequest, observedAt: string, message: string): Observation {
  return ObservationSchema.parse({
    observationId: randomUUID(),
    actionId: request.action.actionId,
    observedAt,
    outcome: "timed_out",
    error: {
      code: "tool.deadline_expired",
      category: "timeout",
      message,
      retryable: false,
    },
  });
}

function resolveTrustedChildEntry(): string {
  const sibling = fileURLToPath(new URL("./echo-child.js", import.meta.url));
  if (existsSync(sibling)) {
    return sibling;
  }
  return fileURLToPath(new URL("../../../dist/adapters/process-echo/echo-child.js", import.meta.url));
}

function deadlineRemainingMs(deadlineAt: string | undefined): number | undefined {
  return deadlineAt === undefined ? undefined : Date.parse(deadlineAt) - Date.now();
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

async function writeFrame(child: ChildProcessWithoutNullStreams, frame: Buffer): Promise<void> {
  await new Promise<void>((resolveWrite, rejectWrite) => {
    child.stdin.write(frame, (error) => error === null || error === undefined ? resolveWrite() : rejectWrite(error));
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, error: () => Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, rejectTimeout) => {
        timer = setTimeout(() => rejectTimeout(error()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await Promise.race([
    new Promise<void>((resolveExit) => child.once("exit", () => resolveExit())),
    new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, timeoutMs)),
  ]);
}
