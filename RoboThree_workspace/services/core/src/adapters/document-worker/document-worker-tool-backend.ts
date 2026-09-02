import { randomUUID } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import {
  ActionSchema,
  ObservationSchema,
  TaskCapabilityLockSchema,
  JsonObjectSchema,
  type ComponentHealth,
  type JsonObject,
  type Observation,
  type RuntimeError,
} from "@robothree/contracts";
import {
  DOCUMENT_CAPABILITIES,
  DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
  DOCUMENT_WORKER_PROTOCOL_VERSION,
  DocumentCapabilityHandlerError,
  PPTX_WRITE_CAPABILITY_ID,
  TEXT_FILE_READ_CAPABILITY_ID,
  TEXT_FILE_READ_LIMITS_REVISION,
  TEXT_FILE_WRITE_CAPABILITY_ID,
  TEXT_FILE_WRITE_LIMITS_REVISION,
  XLSX_WRITE_CAPABILITY_ID,
  computeTextFileWriteRequestDigest,
  computePptxWriteRequestDigest,
  computeXlsxOverwriteRequestDigest,
  computeXlsxWriteRequestDigest,
  encodeDocumentWorkerMessage,
  normalizePptxWriteOptions,
  normalizeTextFileWriteRequest,
  normalizeXlsxWriteOptions,
  parseDocumentWorkerReady,
  parseDocumentWorkerResult,
  parseDocumentWorkerError,
  parseDocumentWorkerTextWritePostcondition,
  type DocumentCapabilityId,
  type DocumentWorkerErrorCode,
  type DocumentWorkerInvokeMessage,
  type DocumentWorkerLimits,
  type DocumentWorkerTextWriteInspectMessage,
  type DocumentWorkerTextWritePostconditionMessage,
} from "@robothree/document-worker";

import type { Clock } from "../../ports/clock.js";
import type { RuntimeComponent } from "../../ports/runtime-component.js";
import type {
  ToolExecutionBackend,
  ToolExecutionRequest,
} from "../../ports/tool-execution-backend.js";
import { NdjsonFrameDecoder } from "../process-echo/ndjson-frame-decoder.js";

export type DocumentWorkerTransmission = Readonly<{
  requestId: string;
  actionId: string;
  effectAttemptId: string;
  idempotencyKey: string;
  capabilityId: DocumentWorkerCoreCapabilityId;
  protocolVersion: typeof DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION;
  requestDigest?: string;
}>;

export class DocumentWorkerBackendError extends Error {
  public readonly code:
    | "document_worker.child_entry_missing"
    | "document_worker.child_exited"
    | "document_worker.concurrent_execution"
    | "document_worker.handshake_timeout"
    | "document_worker.invalid_request"
    | "document_worker.invalid_response"
    | "document_worker.not_ready"
    | "document_worker.protocol_error"
    | "document_worker.request_timeout"
    | "document_worker.write_failed";
  public readonly deliveryMayHaveOccurred: boolean;

  public constructor(
    code: DocumentWorkerBackendError["code"],
    message: string,
    deliveryMayHaveOccurred: boolean,
  ) {
    super(message);
    this.name = "DocumentWorkerBackendError";
    this.code = code;
    this.deliveryMayHaveOccurred = deliveryMayHaveOccurred;
  }
}

type PendingHandshake = {
  resolve: () => void;
  reject: (error: Error) => void;
};

type PendingExecutionRequest = {
  kind: "execute";
  request: DocumentWorkerInvokeMessage;
  resolve: (observation: Observation) => void;
  reject: (error: Error) => void;
};

type PendingInspectionRequest = {
  kind: "inspect";
  request: DocumentWorkerTextWriteInspectMessage;
  resolve: (result: DocumentWorkerTextWritePostconditionMessage) => void;
  reject: (error: Error) => void;
};

type PendingRequest = PendingExecutionRequest | PendingInspectionRequest;

type DocumentWorkerCoreCapabilityId =
  | DocumentCapabilityId
  | typeof XLSX_WRITE_CAPABILITY_ID
  | typeof PPTX_WRITE_CAPABILITY_ID
  | typeof TEXT_FILE_READ_CAPABILITY_ID
  | typeof TEXT_FILE_WRITE_CAPABILITY_ID;

type ParsedDocumentActionPayload = Readonly<{
  workspaceRoot: string;
  relativePath: string;
  limits: DocumentWorkerLimits;
} & (
  | {
    kind: "read";
    options: Record<string, unknown>;
  }
  | {
    kind: "xlsx_write";
    workbook: unknown;
    options: Record<string, unknown>;
    mode: "create_new" | "overwrite_existing";
    overwrite?: { confirmedOldSha256: string };
  }
  | {
    kind: "pptx_write";
    presentation: unknown;
    options: Record<string, unknown>;
    mode: "create_new";
  }
  | {
    kind: "text_write";
    options: Record<string, unknown>;
    mode: "create_new" | "replace_existing";
  }
)>;

const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 4 * 1024;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 2_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const STOP_GRACE_MS = 500;
const MAX_DIAGNOSTIC_TRANSMISSIONS = 256;
const DOCUMENT_CAPABILITY_SET = new Set<string>([
  ...DOCUMENT_CAPABILITIES,
  XLSX_WRITE_CAPABILITY_ID,
  PPTX_WRITE_CAPABILITY_ID,
]);
const TEXT_WRITE_CAPABILITY_SET = new Set<string>([TEXT_FILE_WRITE_CAPABILITY_ID]);
const TEXT_READ_CAPABILITY_SET = new Set<string>([TEXT_FILE_READ_CAPABILITY_ID]);

class SharedDocumentWorkerToolHandle implements ToolExecutionBackend {
  public readonly adapterKind = "tool_execution_backend" as const;

  public constructor(
    public readonly adapterDescriptorId: string,
    public readonly adapterDescriptorRevision: string,
    readonly owner: DocumentWorkerToolBackend,
    readonly capabilities: ReadonlySet<string>,
  ) {}

  public execute(request: ToolExecutionRequest, signal: AbortSignal): Promise<Observation> {
    return this.owner.executeForHandle(
      request,
      signal,
      this.adapterDescriptorId,
      this.adapterDescriptorRevision,
      this.capabilities,
    );
  }

  public processIdentity(): number | undefined {
    return this.owner.processIdentity();
  }
}

export class DocumentWorkerToolBackend implements ToolExecutionBackend, RuntimeComponent {
  public readonly adapterKind = "tool_execution_backend" as const;
  public readonly adapterDescriptorId: string;
  public readonly adapterDescriptorRevision: string;
  public readonly componentId: string;
  readonly #clock: Clock;
  readonly #workerEntry: string;
  readonly #workerArgs: readonly string[];
  readonly #maxFrameBytes: number;
  readonly #maxStderrBytes: number;
  readonly #handshakeTimeoutMs: number;
  readonly #requestTimeoutMs: number;
  readonly #transmissions: DocumentWorkerTransmission[] = [];
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
    workerEntry?: string;
    workerArgs?: readonly string[];
    handshakeTimeoutMs?: number;
    requestTimeoutMs?: number;
    maxFrameBytes?: number;
    maxStderrBytes?: number;
  }) {
    this.adapterDescriptorId = input.adapterDescriptorId;
    this.adapterDescriptorRevision = input.adapterDescriptorRevision;
    this.componentId = `adapter:${input.adapterDescriptorId}`;
    this.#clock = input.clock;
    this.#workerEntry = resolveTrustedDocumentWorkerEntry(input.workerEntry);
    this.#workerArgs = input.workerArgs ?? [];
    this.#handshakeTimeoutMs = positiveInteger(input.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS, "handshakeTimeoutMs");
    this.#requestTimeoutMs = positiveInteger(input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, "requestTimeoutMs");
    this.#maxFrameBytes = positiveInteger(input.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES, "maxFrameBytes");
    this.#maxStderrBytes = positiveInteger(input.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES, "maxStderrBytes");
  }

  public transmissions(): readonly DocumentWorkerTransmission[] {
    return this.#transmissions.map((transmission) => Object.freeze({ ...transmission }));
  }

  public diagnosticStderrBytes(): number {
    return Buffer.byteLength(this.#stderr, "utf8");
  }

  public processIdentity(): number | undefined {
    return this.#child?.pid;
  }

  public createTextWriteHandle(input: Readonly<{
    adapterDescriptorId: string;
    adapterDescriptorRevision: string;
  }>): ToolExecutionBackend & Readonly<{ processIdentity(): number | undefined }> {
    return new SharedDocumentWorkerToolHandle(
      input.adapterDescriptorId,
      input.adapterDescriptorRevision,
      this,
      TEXT_WRITE_CAPABILITY_SET,
    );
  }

  public createTextReadHandle(input: Readonly<{
    adapterDescriptorId: string;
    adapterDescriptorRevision: string;
  }>): ToolExecutionBackend & Readonly<{ processIdentity(): number | undefined }> {
    return new SharedDocumentWorkerToolHandle(
      input.adapterDescriptorId,
      input.adapterDescriptorRevision,
      this,
      TEXT_READ_CAPABILITY_SET,
    );
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
    this.#rejectPending(new DocumentWorkerBackendError(
      "document_worker.child_exited",
      "Document Worker Backend stopped",
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
        protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
        processState: this.#state,
      },
    };
  }

  public async execute(request: ToolExecutionRequest, signal: AbortSignal): Promise<Observation> {
    return this.executeForHandle(
      request,
      signal,
      this.adapterDescriptorId,
      this.adapterDescriptorRevision,
      DOCUMENT_CAPABILITY_SET,
    );
  }

  public async executeForHandle(
    request: ToolExecutionRequest,
    signal: AbortSignal,
    descriptorId: string,
    descriptorRevision: string,
    capabilities: ReadonlySet<string>,
  ): Promise<Observation> {
    if (this.#executing) {
      throw new DocumentWorkerBackendError(
        "document_worker.concurrent_execution",
        "Document Worker is single-flight; concurrent work must be bounded by RuntimeAdmissionController",
        false,
      );
    }
    this.#executing = true;
    try {
      return await this.#executeSingle(
        request,
        signal,
        descriptorId,
        descriptorRevision,
        capabilities,
      );
    } finally {
      this.#executing = false;
    }
  }

  public async inspectTextWritePostcondition(input: Readonly<{
    request: ToolExecutionRequest;
    adapterDescriptorId: string;
    adapterDescriptorRevision: string;
  }>): Promise<DocumentWorkerTextWritePostconditionMessage> {
    if (this.#executing) {
      throw new DocumentWorkerBackendError(
        "document_worker.concurrent_execution",
        "Document Worker is single-flight; recovery inspection cannot overlap execution",
        false,
      );
    }
    this.#executing = true;
    try {
      return await this.#inspectTextWritePostcondition(input);
    } finally {
      this.#executing = false;
    }
  }

  async #startChild(): Promise<void> {
    if (!existsSync(this.#workerEntry)) {
      this.#state = "failed";
      throw new DocumentWorkerBackendError(
        "document_worker.child_entry_missing",
        "Trusted Document Worker entry is missing; build services/document-worker before startup",
        false,
      );
    }
    this.#state = "starting";
    this.#stderr = "";
    this.#decoder = new NdjsonFrameDecoder(this.#maxFrameBytes);
    const child = spawn(process.execPath, [this.#workerEntry, ...this.#workerArgs], {
      cwd: dirname(this.#workerEntry),
      env: documentWorkerChildEnvironment(),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#child = child;
    child.stdout.on("data", (chunk: Buffer) => this.#onStdout(child, chunk));
    child.stderr.on("data", (chunk: Buffer) => this.#onStderr(child, chunk));
    child.once("error", (error) => this.#onProcessFailure(child, new DocumentWorkerBackendError(
      "document_worker.child_exited",
      `Document Worker child failed to start: ${error.message}`,
      false,
    )));
    child.once("exit", (code, signal) => this.#onProcessFailure(child, new DocumentWorkerBackendError(
      "document_worker.child_exited",
      `Document Worker child exited (${code ?? signal ?? "unknown"})${this.#stderr.length === 0 ? "" : `: ${this.#stderr}`}`,
      this.#pendingRequest !== undefined,
    )));
    const handshake = new Promise<void>((resolveHandshake, rejectHandshake) => {
      this.#pendingHandshake = { resolve: resolveHandshake, reject: rejectHandshake };
    });
    try {
      await withTimeout(
        handshake,
        this.#handshakeTimeoutMs,
        () => new DocumentWorkerBackendError(
          "document_worker.handshake_timeout",
          "Document Worker child did not complete the protocol handshake",
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

  async #executeSingle(
    request: ToolExecutionRequest,
    signal: AbortSignal,
    descriptorId: string,
    descriptorRevision: string,
    capabilities: ReadonlySet<string>,
  ): Promise<Observation> {
    const normalized = validateRequest(
      request,
      descriptorId,
      descriptorRevision,
      capabilities,
    );
    if (signal.aborted) {
      return cancelledObservation(normalized, this.#clock.now());
    }
    if (normalized.deadlineAt === undefined) {
      throw new DocumentWorkerBackendError(
        "document_worker.invalid_request",
        "Document Worker Tool execution requires deadlineAt",
        false,
      );
    }
    const remainingMs = deadlineRemainingMs(normalized.deadlineAt);
    if (remainingMs <= 0) {
      return timedOutObservation(normalized, this.#clock.now(), "Tool execution deadline has expired");
    }
    await this.start();
    const child = this.#child;
    if (this.#state !== "ready" || child === undefined) {
      throw new DocumentWorkerBackendError("document_worker.not_ready", "Document Worker child is not ready", false);
    }
    const payload = parseDocumentActionPayload(
      normalized.action.kind as DocumentWorkerCoreCapabilityId,
      normalized.action.payload,
    );
    const digestMaterial = documentWriteDigestMaterial(normalized, payload);
    const workerOptions = digestMaterial.workerOptions;
    const requestDigest = digestMaterial.requestDigest;
    if ((payload.kind === "xlsx_write" || payload.kind === "pptx_write") && payload.mode === "create_new") {
      const targetExists = await writeTargetExists(payload.workspaceRoot, payload.relativePath);
      if (targetExists) {
        return failedObservation(
          normalized,
          this.#clock.now(),
          runtimeErrorFromWorkerError(
            "invalid_format",
            payload.kind === "pptx_write" ? "PPTX target already exists" : "XLSX target already exists",
            undefined,
            "target_exists",
          ),
        );
      }
    }
    const requestId = randomUUID();
    const message: DocumentWorkerInvokeMessage = {
      type: "invoke",
      protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
      requestId,
      actionId: normalized.action.actionId,
      effectAttemptId: normalized.effectAttemptId,
      capabilityId: normalized.action.kind,
      workspaceRoot: payload.workspaceRoot,
      relativePath: payload.relativePath,
      options: workerOptions,
      limits: payload.limits,
      deadlineAt: normalized.deadlineAt,
      ...(payload.kind === "xlsx_write" || payload.kind === "pptx_write" || payload.kind === "text_write" ? {
        idempotencyKey: normalized.idempotencyKey,
        requestDigest,
      } : {}),
    };
    if (this.#transmissions.length === MAX_DIAGNOSTIC_TRANSMISSIONS) {
      this.#transmissions.shift();
    }
    this.#transmissions.push(Object.freeze({
      requestId,
      actionId: message.actionId,
      effectAttemptId: message.effectAttemptId,
      idempotencyKey: normalized.idempotencyKey,
      capabilityId: message.capabilityId as DocumentWorkerCoreCapabilityId,
      protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
      ...(requestDigest === undefined ? {} : { requestDigest }),
    }));
    const response = new Promise<Observation>((resolveObservation, rejectObservation) => {
      this.#pendingRequest = {
        kind: "execute",
        request: message,
        resolve: resolveObservation,
        reject: rejectObservation,
      };
    });
    const abort = () => {
      const pending = this.#pendingRequest;
      if (pending?.kind === "execute") {
        pending.resolve(cancelledObservation(normalized, this.#clock.now()));
      }
      this.#pendingRequest = undefined;
      void this.#terminateChild();
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      await writeFrame(child, encodeDocumentWorkerMessage(message));
      const timeoutMs = Math.max(1, Math.min(this.#requestTimeoutMs, remainingMs));
      return await withTimeout(response, timeoutMs, () => {
        void this.#terminateChild();
        return new DocumentWorkerBackendError(
          "document_worker.request_timeout",
          "Document Worker child did not return an Observation before the deadline",
          true,
        );
      }).catch((error: unknown) => {
        if (error instanceof DocumentWorkerBackendError && error.code === "document_worker.request_timeout") {
          this.#pendingRequest = undefined;
          return timedOutObservation(normalized, this.#clock.now(), error.message);
        }
        throw error;
      });
    } catch (error) {
      this.#pendingRequest = undefined;
      if (error instanceof DocumentWorkerBackendError) {
        throw error;
      }
      throw new DocumentWorkerBackendError(
        "document_worker.write_failed",
        error instanceof Error ? error.message : "Failed to write Document Worker request",
        false,
      );
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }

  async #inspectTextWritePostcondition(input: Readonly<{
    request: ToolExecutionRequest;
    adapterDescriptorId: string;
    adapterDescriptorRevision: string;
  }>): Promise<DocumentWorkerTextWritePostconditionMessage> {
    const normalized = validateRequest(
      input.request,
      input.adapterDescriptorId,
      input.adapterDescriptorRevision,
      TEXT_WRITE_CAPABILITY_SET,
    );
    await this.start();
    const child = this.#child;
    if (this.#state !== "ready" || child === undefined) {
      throw new DocumentWorkerBackendError("document_worker.not_ready", "Document Worker child is not ready", false);
    }
    const payload = parseDocumentActionPayload(
      normalized.action.kind as DocumentWorkerCoreCapabilityId,
      normalized.action.payload,
    );
    if (payload.kind !== "text_write") {
      throw new DocumentWorkerBackendError(
        "document_worker.invalid_request",
        "Postcondition inspection only accepts the workspace text writer",
        false,
      );
    }
    const digestMaterial = documentWriteDigestMaterial(normalized, payload);
    if (digestMaterial.requestDigest === undefined) {
      throw new DocumentWorkerBackendError(
        "document_worker.invalid_request",
        "Text write recovery requires an exact request digest",
        false,
      );
    }
    const message: DocumentWorkerTextWriteInspectMessage = {
      type: "inspect_text_write_postcondition",
      protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
      requestId: randomUUID(),
      actionId: normalized.action.actionId,
      effectAttemptId: normalized.effectAttemptId,
      capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID,
      workspaceRoot: payload.workspaceRoot,
      relativePath: payload.relativePath,
      options: digestMaterial.workerOptions,
      limits: payload.limits,
      idempotencyKey: normalized.idempotencyKey,
      requestDigest: digestMaterial.requestDigest,
    };
    const response = new Promise<DocumentWorkerTextWritePostconditionMessage>((resolve, reject) => {
      this.#pendingRequest = { kind: "inspect", request: message, resolve, reject };
    });
    try {
      await writeFrame(child, encodeDocumentWorkerMessage(message));
      return await withTimeout(response, this.#requestTimeoutMs, () => {
        void this.#terminateChild();
        return new DocumentWorkerBackendError(
          "document_worker.request_timeout",
          "Document Worker child did not return a recovery inspection result",
          true,
        );
      });
    } finally {
      this.#pendingRequest = undefined;
    }
  }

  #onStdout(child: ChildProcessWithoutNullStreams, chunk: Buffer): void {
    if (this.#child !== child) {
      return;
    }
    try {
      const decoder = this.#decoder;
      if (decoder === undefined) {
        throw new DocumentWorkerBackendError("document_worker.protocol_error", "Received output without a decoder", false);
      }
      for (const frame of decoder.push(chunk)) {
        if (this.#pendingHandshake !== undefined) {
          parseDocumentWorkerReady(frame);
          const handshake = this.#pendingHandshake;
          this.#pendingHandshake = undefined;
          handshake.resolve();
          continue;
        }
        const pending = this.#pendingRequest;
        if (pending === undefined) {
          throw new DocumentWorkerBackendError("document_worker.protocol_error", "Received an unsolicited protocol frame", false);
        }
        const response = pending.kind === "execute"
          ? parseTerminalFrame(frame)
          : parseInspectionFrame(frame);
        if (
          response.requestId !== pending.request.requestId
          || response.actionId !== pending.request.actionId
          || response.effectAttemptId !== pending.request.effectAttemptId
        ) {
          throw new DocumentWorkerBackendError(
            "document_worker.invalid_response",
            "Document Worker response does not match the active request",
            true,
          );
        }
        this.#pendingRequest = undefined;
        if (pending.kind === "execute") {
          pending.resolve(observationFromTerminal(
            pending.request,
            response as TerminalFrame,
            this.#clock.now(),
          ));
        } else {
          const inspection = response as DocumentWorkerTextWritePostconditionMessage;
          pending.resolve(inspection);
        }
      }
    } catch (error) {
      const normalized = error instanceof DocumentWorkerBackendError
        ? error
        : new DocumentWorkerBackendError(
          "document_worker.protocol_error",
          error instanceof Error ? error.message : "Invalid Document Worker protocol output",
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

  #onProcessFailure(child: ChildProcessWithoutNullStreams, error: DocumentWorkerBackendError): void {
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

type TerminalFrame =
  | ReturnType<typeof parseDocumentWorkerResult>
  | ReturnType<typeof parseDocumentWorkerError>;

function parseTerminalFrame(frame: string): TerminalFrame {
  const value = JSON.parse(frame) as { type?: unknown };
  if (value.type === "result") {
    return parseDocumentWorkerResult(frame);
  }
  if (value.type === "error") {
    return parseDocumentWorkerError(frame);
  }
  throw new DocumentWorkerBackendError(
    "document_worker.invalid_response",
    "Expected Document Worker terminal result or error frame",
    true,
  );
}

function parseInspectionFrame(frame: string): DocumentWorkerTextWritePostconditionMessage {
  const value = JSON.parse(frame) as { type?: unknown };
  if (value.type === "text_write_postcondition") {
    return parseDocumentWorkerTextWritePostcondition(frame);
  }
  if (value.type === "error") {
    const error = parseDocumentWorkerError(frame);
    throw new DocumentWorkerBackendError(
      "document_worker.invalid_response",
      `Document Worker recovery inspection failed: ${error.error.message}`,
      false,
    );
  }
  throw new DocumentWorkerBackendError(
    "document_worker.invalid_response",
    "Expected Document Worker text write postcondition or error frame",
    true,
  );
}

function validateRequest(
  request: ToolExecutionRequest,
  descriptorId: string,
  descriptorRevision: string,
  capabilities: ReadonlySet<string>,
): ToolExecutionRequest {
  const lock = TaskCapabilityLockSchema.parse(request.lock);
  const action = ActionSchema.parse(request.action);
  if (lock.definitionSnapshot.kind !== "tool" || !capabilities.has(action.kind)) {
    throw new DocumentWorkerBackendError("document_worker.invalid_request", "Document Worker handle rejected the Tool capability", false);
  }
  if (action.kind !== lock.definitionSnapshot.capabilityId) {
    throw new DocumentWorkerBackendError("document_worker.invalid_request", "Action kind must match the locked Document capability", false);
  }
  if (
    lock.adapterDescriptorSnapshot.runtimeBoundary !== "child_process"
    || lock.adapterDescriptorSnapshot.protocol.name !== "robothree-document-worker"
      || (
        lock.adapterDescriptorSnapshot.protocol.version !== DOCUMENT_WORKER_PROTOCOL_VERSION
        && lock.adapterDescriptorSnapshot.protocol.version !== DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION
      )
  ) {
    throw new DocumentWorkerBackendError(
      "document_worker.invalid_request",
      "Task capability lock does not describe the trusted Document Worker protocol",
      false,
    );
  }
  if (
    lock.adapterDescriptorSnapshot.adapterDescriptorId !== descriptorId
    || lock.adapterDescriptorSnapshot.revision !== descriptorRevision
  ) {
    throw new DocumentWorkerBackendError("document_worker.invalid_request", "Runtime Handle does not match the locked descriptor", false);
  }
  if (request.effectAttemptId.length === 0 || request.idempotencyKey.length === 0) {
    throw new DocumentWorkerBackendError("document_worker.invalid_request", "Effect identity is required", false);
  }
  return Object.freeze({ ...request, lock, action });
}

function parseDocumentActionPayload(
  capabilityId: DocumentWorkerCoreCapabilityId,
  payload: JsonObject,
): ParsedDocumentActionPayload {
  const parsed = JsonObjectSchema.parse(payload);
  const isXlsxWrite = capabilityId === XLSX_WRITE_CAPABILITY_ID;
  const isPptxWrite = capabilityId === PPTX_WRITE_CAPABILITY_ID;
  const isTextWrite = capabilityId === TEXT_FILE_WRITE_CAPABILITY_ID;
  const isTextRead = capabilityId === TEXT_FILE_READ_CAPABILITY_ID;
  requireOnlyKeys(
    parsed,
    isXlsxWrite
      ? ["limits", "mode", "options", "overwrite", "relativePath", "workbook", "workspaceRoot"]
      : isPptxWrite
        ? ["limits", "mode", "options", "presentation", "relativePath", "workspaceRoot"]
        : isTextWrite
          ? [
            "content",
            "expectedPreviousSha256",
            "editReadProofDigest",
            "limits",
            "limitsRevision",
            "mode",
            "ownedArtifactProofDigest",
            "relativePath",
            "workspaceGrantId",
            "workspaceRoot",
          ]
          : isTextRead
            ? ["limits", "limitsRevision", "relativePath", "workspaceGrantId", "workspaceRoot"]
            : ["limits", "options", "relativePath", "workspaceRoot"],
    isXlsxWrite
      ? ["mode", "options", "overwrite"]
      : isPptxWrite
        ? ["mode", "options"]
        : isTextWrite
          ? ["editReadProofDigest", "expectedPreviousSha256", "ownedArtifactProofDigest"]
          : isTextRead
            ? []
            : ["options"],
  );
  const workspaceRoot = requireNonEmptyString(parsed.workspaceRoot, "workspaceRoot", 4096);
  const relativePath = requireNonEmptyString(parsed.relativePath, "relativePath", 4096);
  const limits = parseLimits(parsed.limits);
  if (isTextRead) {
    const limitsRevision = requireNonEmptyString(parsed.limitsRevision, "limitsRevision", 128);
    if (limitsRevision !== TEXT_FILE_READ_LIMITS_REVISION) {
      throw new DocumentWorkerBackendError(
        "document_worker.invalid_request",
        "Text read limits revision is unsupported",
        false,
      );
    }
    requireNonEmptyString(parsed.workspaceGrantId, "workspaceGrantId", 512);
    return { kind: "read", workspaceRoot, relativePath, options: {}, limits };
  }
  if (isTextWrite) {
    const mode = parseTextWriteMode(parsed.mode);
    const limitsRevision = requireNonEmptyString(parsed.limitsRevision, "limitsRevision", 128);
    if (limitsRevision !== TEXT_FILE_WRITE_LIMITS_REVISION) {
      throw new DocumentWorkerBackendError(
        "document_worker.invalid_request",
        "Text write limits revision is unsupported",
        false,
      );
    }
    const options: Record<string, unknown> = {
      content: requireString(parsed.content, "content", limits.maxFileBytes),
      mode,
      workspaceGrantId: requireNonEmptyString(parsed.workspaceGrantId, "workspaceGrantId", 512),
      limitsRevision,
      ...(parsed.expectedPreviousSha256 === undefined
        ? {}
        : { expectedPreviousSha256: requireSha256(parsed.expectedPreviousSha256, "expectedPreviousSha256") }),
      ...(parsed.ownedArtifactProofDigest === undefined
        ? {}
        : { ownedArtifactProofDigest: requireSha256(parsed.ownedArtifactProofDigest, "ownedArtifactProofDigest") }),
      ...(parsed.editReadProofDigest === undefined
        ? {}
        : { editReadProofDigest: requireSha256(parsed.editReadProofDigest, "editReadProofDigest") }),
    };
    return { kind: "text_write", workspaceRoot, relativePath, options, mode, limits };
  }
  const options = parsed.options === undefined
    ? {}
    : requireObject(parsed.options, "options");
  if (isXlsxWrite) {
    const mode = parseXlsxWriteMode(parsed.mode);
    const overwrite = parseXlsxOverwriteForCore(mode, parsed.overwrite);
    return {
      kind: "xlsx_write",
      workspaceRoot,
      relativePath,
      workbook: JsonObjectSchema.parse(parsed.workbook),
      options,
      mode,
      ...(overwrite === undefined ? {} : { overwrite }),
      limits,
    };
  }
  if (isPptxWrite) {
    const mode = parsePptxWriteMode(parsed.mode);
    return {
      kind: "pptx_write",
      workspaceRoot,
      relativePath,
      presentation: JsonObjectSchema.parse(parsed.presentation),
      options,
      mode,
      limits,
    };
  }
  return {
    kind: "read",
    workspaceRoot,
    relativePath,
    options,
    limits,
  };
}

function workerOptionsForPayload(payload: ParsedDocumentActionPayload): Record<string, unknown> {
  if (payload.kind === "read" || payload.kind === "text_write") {
    return payload.options;
  }
  if (payload.kind === "pptx_write") {
    return {
      ...payload.options,
      mode: payload.mode,
      presentation: payload.presentation,
    };
  }
  return {
    ...payload.options,
    mode: payload.mode,
    ...(payload.overwrite === undefined ? {} : { overwrite: payload.overwrite }),
    workbook: payload.workbook,
  };
}

function documentWriteDigestMaterial(
  request: ToolExecutionRequest,
  payload: ParsedDocumentActionPayload,
): {
  workerOptions: Record<string, unknown>;
  requestDigest?: string;
} {
  const workerOptions = workerOptionsForPayload(payload);
  if (payload.kind === "read") {
    return { workerOptions };
  }
  if (payload.kind === "text_write") {
    try {
      const normalized = normalizeTextFileWriteRequest(
        payload.relativePath,
        workerOptions,
        payload.limits,
      );
      return {
        workerOptions,
        requestDigest: computeTextFileWriteRequestDigest({
          idempotencyKey: request.idempotencyKey,
          workspaceGrantId: normalized.options.workspaceGrantId,
          relativePath: normalized.relativePath,
          mode: normalized.options.mode,
          contentSha256: normalized.contentSha256,
          ...(normalized.options.expectedPreviousSha256 === undefined
            ? {}
            : { expectedPreviousSha256: normalized.options.expectedPreviousSha256 }),
          ...(normalized.options.ownedArtifactProofDigest === undefined
            ? {}
            : { ownedArtifactProofDigest: normalized.options.ownedArtifactProofDigest }),
          ...(normalized.options.editReadProofDigest === undefined
            ? {}
            : { editReadProofDigest: normalized.options.editReadProofDigest }),
          limitsRevision: normalized.options.limitsRevision,
        }),
      };
    } catch (error) {
      if (error instanceof DocumentCapabilityHandlerError) {
        throw new DocumentWorkerBackendError(
          "document_worker.invalid_request",
          error.message,
          false,
        );
      }
      throw error;
    }
  }
  if (payload.kind === "pptx_write") {
    try {
      const normalized = normalizePptxWriteOptions(workerOptions, payload.limits);
      return {
        workerOptions,
        requestDigest: computePptxWriteRequestDigest(
          request.idempotencyKey,
          payload.relativePath,
          normalized.presentation,
        ),
      };
    } catch (error) {
      if (error instanceof DocumentCapabilityHandlerError) {
        throw new DocumentWorkerBackendError(
          "document_worker.invalid_request",
          error.message,
          false,
        );
      }
      throw error;
    }
  }
  const overwrite = payload.mode === "overwrite_existing" ? payload.overwrite : undefined;
  if (payload.mode === "overwrite_existing" && overwrite === undefined) {
    throw new DocumentWorkerBackendError(
      "document_worker.invalid_request",
      "XLSX overwrite requires confirmedOldSha256",
      false,
    );
  }
  try {
    const normalized = normalizeXlsxWriteOptions(workerOptions, payload.limits);
    let requestDigest: string;
    if (payload.mode === "overwrite_existing") {
      if (overwrite === undefined) {
        throw new DocumentWorkerBackendError(
          "document_worker.invalid_request",
          "XLSX overwrite requires confirmedOldSha256",
          false,
        );
      }
      requestDigest = computeXlsxOverwriteRequestDigest(
        request.idempotencyKey,
        payload.relativePath,
        normalized.workbook,
        overwrite.confirmedOldSha256,
      );
    } else {
      requestDigest = computeXlsxWriteRequestDigest(
        request.idempotencyKey,
        payload.relativePath,
        normalized.workbook,
      );
    }
    return {
      workerOptions,
      requestDigest,
    };
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError) {
      throw new DocumentWorkerBackendError(
        "document_worker.invalid_request",
        error.message,
        false,
      );
    }
    throw error;
  }
}

function parsePptxWriteMode(value: unknown): "create_new" {
  if (value === undefined || value === "create_new") return "create_new";
  throw new DocumentWorkerBackendError(
    "document_worker.invalid_request",
    "PPTX write mode must be create_new",
    false,
  );
}

function parseTextWriteMode(value: unknown): "create_new" | "replace_existing" {
  if (value === "create_new" || value === "replace_existing") return value;
  throw new DocumentWorkerBackendError(
    "document_worker.invalid_request",
    "Text write mode must be create_new or replace_existing",
    false,
  );
}

function parseXlsxWriteMode(value: unknown): "create_new" | "overwrite_existing" {
  if (value === undefined) return "create_new";
  if (value === "create_new" || value === "overwrite_existing") return value;
  throw new DocumentWorkerBackendError(
    "document_worker.invalid_request",
    "mode must be create_new or overwrite_existing",
    false,
  );
}

function parseXlsxOverwriteForCore(
  mode: "create_new" | "overwrite_existing",
  value: unknown,
): { confirmedOldSha256: string } | undefined {
  if (mode === "create_new") {
    if (value !== undefined) {
      throw new DocumentWorkerBackendError(
        "document_worker.invalid_request",
        "overwrite is only valid when mode is overwrite_existing",
        false,
      );
    }
    return undefined;
  }
  const parsed = requireObject(value, "overwrite");
  requireOnlyKeys(parsed, ["confirmedOldSha256"]);
  const confirmedOldSha256 = parsed.confirmedOldSha256;
  if (typeof confirmedOldSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(confirmedOldSha256)) {
    throw new DocumentWorkerBackendError(
      "document_worker.invalid_request",
      "overwrite.confirmedOldSha256 must be a SHA-256 digest",
      false,
    );
  }
  return { confirmedOldSha256 };
}

function parseLimits(value: unknown): DocumentWorkerLimits {
  const limits = requireObject(value, "limits");
  requireOnlyKeys(limits, [
    "maxDecompressionRatio",
    "maxFileBytes",
    "maxOutputBytes",
    "maxPageCount",
  ]);
  return {
    maxFileBytes: requirePositiveSafeInteger(limits.maxFileBytes, "limits.maxFileBytes"),
    maxOutputBytes: requirePositiveSafeInteger(limits.maxOutputBytes, "limits.maxOutputBytes"),
    maxPageCount: requirePositiveSafeInteger(limits.maxPageCount, "limits.maxPageCount"),
    maxDecompressionRatio: requirePositiveSafeInteger(limits.maxDecompressionRatio, "limits.maxDecompressionRatio"),
  };
}

function observationFromTerminal(
  request: DocumentWorkerInvokeMessage,
  terminal: TerminalFrame,
  observedAt: string,
): Observation {
  if (terminal.type === "result") {
    return ObservationSchema.parse({
      observationId: randomUUID(),
      actionId: request.actionId,
      observedAt,
      outcome: "succeeded",
      output: {
        status: terminal.status,
        result: terminal.output,
        metadata: terminal.metadata,
      },
    });
  }
  const error = runtimeErrorFromWorkerError(
    terminal.error.code,
    terminal.error.message,
    terminal.error.digest,
    terminal.error.detailCode,
  );
  if (terminal.error.code === "cancelled") {
    return ObservationSchema.parse({
      observationId: randomUUID(),
      actionId: request.actionId,
      observedAt,
      outcome: "cancelled",
      error,
    });
  }
  if (terminal.error.code === "timed_out") {
    return ObservationSchema.parse({
      observationId: randomUUID(),
      actionId: request.actionId,
      observedAt,
      outcome: "timed_out",
      error,
    });
  }
  return ObservationSchema.parse({
    observationId: randomUUID(),
    actionId: request.actionId,
    observedAt,
    outcome: "failed",
    error,
  });
}

function runtimeErrorFromWorkerError(
  code: DocumentWorkerErrorCode,
  message: string,
  digest: string | undefined,
  detailCode?: string,
): RuntimeError {
  const workspaceCode = detailCode === "previous_digest_mismatch"
    ? "workspace.file.content_changed"
    : detailCode === "recovery_uncertain"
      ? "workspace.file.write_uncertain"
      : detailCode?.startsWith("workspace.file.") === true
        ? detailCode
        : undefined;
  const normalizedDetailCode = workspaceCode ?? detailCode;
  const details = digest === undefined && normalizedDetailCode === undefined
    ? undefined
    : {
      ...(digest === undefined ? {} : { digest }),
      ...(normalizedDetailCode === undefined ? {} : { detailCode: normalizedDetailCode }),
    };
  const base = {
    code: workspaceCode ?? `document_worker.${code}`,
    message,
    ...(details === undefined ? {} : { details }),
  };
  if (workspaceCode === "workspace.file.content_changed") {
    return { ...base, category: "validation", retryable: true };
  }
  if (workspaceCode === "workspace.file.write_uncertain") {
    return { ...base, category: "internal", retryable: false };
  }
  switch (code) {
    case "cancelled":
      return { ...base, category: "cancelled", retryable: false };
    case "timed_out":
      return { ...base, category: "timeout", retryable: false };
    case "worker_busy":
      return { ...base, category: "rate_limit", retryable: true };
    case "internal_failure":
      return { ...base, category: "internal", retryable: true };
    case "unsupported_feature":
      return { ...base, category: "configuration", retryable: false };
    case "invalid_format":
    case "encrypted":
    case "corrupt":
    case "limit_exceeded":
      return { ...base, category: "validation", retryable: false };
    default:
      return { ...base, category: "internal", retryable: true };
  }
}

function failedObservation(request: ToolExecutionRequest, observedAt: string, error: RuntimeError): Observation {
  return ObservationSchema.parse({
    observationId: randomUUID(),
    actionId: request.action.actionId,
    observedAt,
    outcome: "failed",
    error,
  });
}

function cancelledObservation(request: ToolExecutionRequest, observedAt: string): Observation {
  return ObservationSchema.parse({
    observationId: randomUUID(),
    actionId: request.action.actionId,
    observedAt,
    outcome: "cancelled",
    error: {
      code: "document_worker.cancelled",
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
      code: "document_worker.timed_out",
      category: "timeout",
      message,
      retryable: false,
    },
  });
}

async function writeTargetExists(workspaceRoot: string, relativePath: string): Promise<boolean> {
  if (!isSafeCorePrecheckWritePath(relativePath)) {
    return false;
  }
  const targetPath = join(workspaceRoot, relativePath);
  try {
    await lstat(targetPath);
    return true;
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return false;
    }
    throw new DocumentWorkerBackendError(
      "document_worker.invalid_request",
      "Unable to inspect Document write target before dispatch",
      false,
    );
  }
}

function isSafeCorePrecheckWritePath(relativePath: string): boolean {
  if (
    relativePath.length === 0 ||
    relativePath.length > 1024 ||
    relativePath.includes("\0") ||
    relativePath.includes("\\") ||
    isAbsolute(relativePath) ||
    win32.isAbsolute(relativePath) ||
    relativePath.startsWith("\\\\") ||
    relativePath.includes("://") ||
    !/\.(?:xlsx|pptx)$/iu.test(relativePath)
  ) {
    return false;
  }
  const segments = relativePath.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function resolveTrustedDocumentWorkerEntry(overrideEntry?: string): string {
  const candidates = overrideEntry === undefined
    ? defaultDocumentWorkerEntryCandidates()
    : [overrideEntry];
  const missing = [];
  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) {
        missing.push(candidate);
        continue;
      }
      const resolved = realpathSync(candidate);
      const stats = statSync(resolved);
      if (!stats.isFile()) {
        throw new Error("resolved entry is not a file");
      }
      const entryName = basename(resolved);
      if (!entryName.endsWith(".js") && !entryName.endsWith(".mjs")) {
        throw new Error("resolved entry must be a JavaScript module");
      }
      return resolved;
    } catch (error) {
      throw new Error(
        `Invalid trusted Document Worker entry: ${error instanceof Error ? error.message : "unknown validation failure"}`,
      );
    }
  }
  throw new Error(
    `Trusted Document Worker entry is missing; checked ${missing.length} packaged/development candidate(s).`,
  );
}

function defaultDocumentWorkerEntryCandidates(): string[] {
  const candidates = [
    fileURLToPath(new URL("../../../../document-worker/dist/worker.js", import.meta.url)),
  ];
  const resourcesPathValue = (process as NodeJS.Process & { resourcesPath?: unknown }).resourcesPath;
  const resourcesPath = typeof resourcesPathValue === "string" && resourcesPathValue.length > 0
    ? resourcesPathValue
    : undefined;
  if (resourcesPath !== undefined) {
    candidates.push(
      join(resourcesPath, "services", "document-worker", "dist", "worker.js"),
      join(resourcesPath, "app.asar.unpacked", "services", "document-worker", "dist", "worker.js"),
    );
  }
  return candidates;
}

function documentWorkerChildEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    ROBOTHREE_DOCUMENT_WORKER_CHILD: "1",
  };
  if (process.env.ELECTRON_RUN_AS_NODE === "1") {
    env.ELECTRON_RUN_AS_NODE = "1";
  }
  return env;
}

function deadlineRemainingMs(deadlineAt: string): number {
  return Date.parse(deadlineAt) - Date.now();
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new DocumentWorkerBackendError(
      "document_worker.invalid_request",
      `${name} must be a non-empty string (max ${maxLength} chars)`,
      false,
    );
  }
  return value;
}

function requireString(value: unknown, name: string, maxBytes: number): string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > maxBytes) {
    throw new DocumentWorkerBackendError(
      "document_worker.invalid_request",
      `${name} must be a UTF-8 string no larger than ${maxBytes} bytes`,
      false,
    );
  }
  return value;
}

function requireSha256(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new DocumentWorkerBackendError(
      "document_worker.invalid_request",
      `${name} must be a sha256: digest`,
      false,
    );
  }
  return value;
}

function requirePositiveSafeInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new DocumentWorkerBackendError(
      "document_worker.invalid_request",
      `${name} must be a positive safe integer`,
      false,
    );
  }
  return value;
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DocumentWorkerBackendError(
      "document_worker.invalid_request",
      `${name} must be an object`,
      false,
    );
  }
  return value as Record<string, unknown>;
}

function requireOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): void {
  const allowed = new Set(allowedKeys);
  const optional = new Set(optionalKeys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new DocumentWorkerBackendError(
      "document_worker.invalid_request",
      `Unsupported fields: ${unknown.join(", ")}`,
      false,
    );
  }
  const missing = allowedKeys.filter((key) => !optional.has(key) && !(key in value));
  if (missing.length > 0) {
    throw new DocumentWorkerBackendError(
      "document_worker.invalid_request",
      `Missing required fields: ${missing.join(", ")}`,
      false,
    );
  }
}

async function writeFrame(child: ChildProcessWithoutNullStreams, frame: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    child.stdin.write(frame, (error) => {
      if (error === null || error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  createError: () => Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(createError()), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
