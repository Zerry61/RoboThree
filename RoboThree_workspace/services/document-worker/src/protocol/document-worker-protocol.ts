// ── Protocol version ────────────────────────────────────────────
export const DOCUMENT_WORKER_PROTOCOL_VERSION = "v1alpha1";
export const DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION = "v1alpha2";
export type DocumentWorkerProtocolVersion =
  | typeof DOCUMENT_WORKER_PROTOCOL_VERSION
  | typeof DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION;
export const DOCUMENT_WORKER_ADAPTER = "document-worker";

// ── Message types ───────────────────────────────────────────────

/** Sent by the worker immediately after startup. */
export type DocumentWorkerReadyMessage = Readonly<{
  type: "ready";
  protocolVersion: DocumentWorkerProtocolVersion;
  adapter: typeof DOCUMENT_WORKER_ADAPTER;
}>;

/** Sent by the host (Core Adapter) to request document processing. */
export type DocumentWorkerInvokeMessage = Readonly<{
  type: "invoke";
  protocolVersion: DocumentWorkerProtocolVersion;
  requestId: string;
  actionId: string;
  effectAttemptId: string;
  capabilityId: string;
  workspaceRoot: string;
  relativePath: string;
  options: Record<string, unknown>;
  limits: DocumentWorkerLimits;
  deadlineAt: string;
  idempotencyKey?: string;
  requestDigest?: string;
}>;

/** Core-private, read-only postcondition inspection for WFW recovery. */
export type DocumentWorkerTextWriteInspectMessage = Readonly<{
  type: "inspect_text_write_postcondition";
  protocolVersion: typeof DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION;
  requestId: string;
  actionId: string;
  effectAttemptId: string;
  capabilityId: "tool.workspace.file.write_text";
  workspaceRoot: string;
  relativePath: string;
  options: Record<string, unknown>;
  limits: DocumentWorkerLimits;
  idempotencyKey: string;
  requestDigest: string;
}>;

export type DocumentWorkerTextWritePostconditionMessage = Readonly<{
  type: "text_write_postcondition";
  protocolVersion: typeof DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION;
  requestId: string;
  actionId: string;
  effectAttemptId: string;
  decision: "not_found" | "safe_retry" | "recovered_success" | "unknown";
  output?: unknown;
  metadata?: DocumentWorkerResultMetadata;
}>;

/** Sent by the worker when processing succeeds (possibly truncated). */
export type DocumentWorkerResultMessage = Readonly<{
  type: "result";
  protocolVersion: DocumentWorkerProtocolVersion;
  requestId: string;
  actionId: string;
  effectAttemptId: string;
  status: "succeeded" | "truncated";
  output: unknown;
  metadata: DocumentWorkerResultMetadata;
}>;

/** Sent by the worker when processing fails with a typed error. */
export type DocumentWorkerErrorMessage = Readonly<{
  type: "error";
  protocolVersion: DocumentWorkerProtocolVersion;
  requestId: string;
  actionId: string;
  effectAttemptId: string;
  error: DocumentWorkerTypedError;
}>;

export type DocumentWorkerProtocolMessage =
  | DocumentWorkerReadyMessage
  | DocumentWorkerInvokeMessage
  | DocumentWorkerTextWriteInspectMessage
  | DocumentWorkerTextWritePostconditionMessage
  | DocumentWorkerResultMessage
  | DocumentWorkerErrorMessage;

// ── Shared types ────────────────────────────────────────────────

export type DocumentWorkerLimits = Readonly<{
  maxFileBytes: number;
  maxOutputBytes: number;
  maxPageCount: number;
  maxDecompressionRatio: number;
}>;

export type DocumentWorkerResultMetadata = Readonly<{
  originalCount: number;
  returnedCount: number;
  truncated: boolean;
  resultDigest: string;
  locators?: readonly unknown[];
  timingMs: number;
}>;

export type DocumentWorkerErrorCode =
  | "invalid_format"
  | "encrypted"
  | "corrupt"
  | "limit_exceeded"
  | "unsupported_feature"
  | "worker_busy"
  | "cancelled"
  | "timed_out"
  | "internal_failure";

export type DocumentWorkerTypedError = Readonly<{
  code: DocumentWorkerErrorCode;
  message: string;
  digest?: string;
  detailCode?: string;
}>;

// ── Protocol error ──────────────────────────────────────────────

export class DocumentWorkerProtocolError extends Error {
  public readonly code:
    | "document_worker.invalid_json"
    | "document_worker.invalid_message"
    | "document_worker.protocol_mismatch";

  public constructor(code: DocumentWorkerProtocolError["code"], message: string) {
    super(message);
    this.name = "DocumentWorkerProtocolError";
    this.code = code;
  }
}

// ── Encode ──────────────────────────────────────────────────────

export function encodeDocumentWorkerMessage(
  message: DocumentWorkerProtocolMessage,
): Buffer {
  return Buffer.from(`${JSON.stringify(message)}\n`, "utf8");
}

// ── Parse helpers ───────────────────────────────────────────────

const VALID_ERROR_CODES = new Set<string>([
  "invalid_format",
  "encrypted",
  "corrupt",
  "limit_exceeded",
  "unsupported_feature",
  "worker_busy",
  "cancelled",
  "timed_out",
  "internal_failure",
]);

const VALID_STATUSES = new Set<string>(["succeeded", "truncated"]);

const REQUIRED_LIMITS_KEYS = [
  "maxFileBytes",
  "maxOutputBytes",
  "maxPageCount",
  "maxDecompressionRatio",
] as const;

function parseObject(frame: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(frame);
  } catch {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_json",
      "Worker emitted malformed JSON",
    );
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "Protocol message must be an object",
    );
  }
  return value as Record<string, unknown>;
}

function requireProtocolVersion(value: unknown): DocumentWorkerProtocolVersion {
  if (
    value !== DOCUMENT_WORKER_PROTOCOL_VERSION &&
    value !== DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION
  ) {
    throw new DocumentWorkerProtocolError(
      "document_worker.protocol_mismatch",
      `Expected protocol ${DOCUMENT_WORKER_PROTOCOL_VERSION} or ${DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION}, got ${String(value)}`,
    );
  }
  return value;
}

function requireNonEmptyString(
  value: unknown,
  name: string,
  maxLength = 512,
): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      `${name} must be a non-empty string (max ${maxLength} chars)`,
    );
  }
  return value;
}

function requireSafeInteger(value: unknown, name: string, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      `${name} must be a safe integer >= ${min}`,
    );
  }
  return value;
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowedSet = new Set(allowed);
  const optionalSet = new Set(optional);
  const unknownKeys = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknownKeys.length > 0) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      `Unknown fields: ${unknownKeys.join(", ")}`,
    );
  }
  const missingKeys = allowed.filter(
    (key) => !optionalSet.has(key) && !(key in value),
  );
  if (missingKeys.length > 0) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      `Missing required fields: ${missingKeys.join(", ")}`,
    );
  }
}

// ── Parse ready ─────────────────────────────────────────────────

export function parseDocumentWorkerReady(
  frame: string,
): DocumentWorkerReadyMessage {
  const value = parseObject(frame);
  requireExactKeys(value, ["adapter", "protocolVersion", "type"]);
  if (value.type !== "ready" || value.adapter !== DOCUMENT_WORKER_ADAPTER) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "Expected document-worker ready message",
    );
  }
  const protocolVersion = requireProtocolVersion(value.protocolVersion);
  return {
    type: "ready",
    protocolVersion,
    adapter: DOCUMENT_WORKER_ADAPTER,
  };
}

// ── Parse invoke ────────────────────────────────────────────────

export function parseDocumentWorkerInvoke(
  frame: string,
): DocumentWorkerInvokeMessage {
  const value = parseObject(frame);
  requireExactKeys(
    value,
    [
      "actionId",
      "capabilityId",
      "deadlineAt",
      "effectAttemptId",
      "limits",
      "options",
      "protocolVersion",
      "relativePath",
      "idempotencyKey",
      "requestId",
      "requestDigest",
      "type",
      "workspaceRoot",
    ],
    ["idempotencyKey", "requestDigest"],
  );

  if (value.type !== "invoke") {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "Expected invoke message",
    );
  }
  const protocolVersion = requireProtocolVersion(value.protocolVersion);

  const requestId = requireNonEmptyString(value.requestId, "requestId");
  const actionId = requireNonEmptyString(value.actionId, "actionId");
  const effectAttemptId = requireNonEmptyString(
    value.effectAttemptId,
    "effectAttemptId",
  );
  const capabilityId = requireNonEmptyString(value.capabilityId, "capabilityId");

  const privateWorkspaceTextCapability =
    protocolVersion === DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION
    && (capabilityId === "tool.workspace.file.write_text"
      || capabilityId === "tool.workspace.file.read_text");
  if (!capabilityId.startsWith("tool.document.") && !privateWorkspaceTextCapability) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      `capabilityId must use tool.document.* or an exact private workspace capability, got ${capabilityId}`,
    );
  }

  const workspaceRoot = requireNonEmptyString(
    value.workspaceRoot,
    "workspaceRoot",
    4096,
  );
  const relativePath = requireNonEmptyString(
    value.relativePath,
    "relativePath",
    4096,
  );

  if (
    typeof value.options !== "object" ||
    value.options === null ||
    Array.isArray(value.options)
  ) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "options must be an object",
    );
  }

  const limits = parseLimits(value.limits);

  const deadlineAt = value.deadlineAt;
  if (
    (typeof deadlineAt !== "string" ||
      !Number.isFinite(Date.parse(deadlineAt)))
  ) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "deadlineAt must be an ISO timestamp",
    );
  }

  return {
    type: "invoke",
    protocolVersion,
    requestId,
    actionId,
    effectAttemptId,
    capabilityId,
    workspaceRoot,
    relativePath,
    options: value.options as Record<string, unknown>,
    limits,
    deadlineAt,
    ...(value.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: requireNonEmptyString(value.idempotencyKey, "idempotencyKey", 240) }),
    ...(value.requestDigest === undefined
      ? {}
      : { requestDigest: requireSha256Hex(value.requestDigest, "requestDigest") }),
  };
}

export function parseDocumentWorkerTextWriteInspect(
  frame: string,
): DocumentWorkerTextWriteInspectMessage {
  const value = parseObject(frame);
  requireExactKeys(value, [
    "actionId",
    "capabilityId",
    "effectAttemptId",
    "idempotencyKey",
    "limits",
    "options",
    "protocolVersion",
    "relativePath",
    "requestDigest",
    "requestId",
    "type",
    "workspaceRoot",
  ]);
  if (value.type !== "inspect_text_write_postcondition") {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "Expected text write postcondition inspection message",
    );
  }
  if (value.protocolVersion !== DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION) {
    throw new DocumentWorkerProtocolError(
      "document_worker.protocol_mismatch",
      "Text write postcondition inspection requires the private protocol",
    );
  }
  if (value.capabilityId !== "tool.workspace.file.write_text") {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "Text write postcondition inspection requires the exact WFW capability",
    );
  }
  if (typeof value.options !== "object" || value.options === null || Array.isArray(value.options)) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "options must be an object",
    );
  }
  return {
    type: "inspect_text_write_postcondition",
    protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
    requestId: requireNonEmptyString(value.requestId, "requestId"),
    actionId: requireNonEmptyString(value.actionId, "actionId"),
    effectAttemptId: requireNonEmptyString(value.effectAttemptId, "effectAttemptId"),
    capabilityId: "tool.workspace.file.write_text",
    workspaceRoot: requireNonEmptyString(value.workspaceRoot, "workspaceRoot", 4096),
    relativePath: requireNonEmptyString(value.relativePath, "relativePath", 4096),
    options: value.options as Record<string, unknown>,
    limits: parseLimits(value.limits),
    idempotencyKey: requireNonEmptyString(value.idempotencyKey, "idempotencyKey", 240),
    requestDigest: requireSha256Hex(value.requestDigest, "requestDigest"),
  };
}

function parseLimits(value: unknown): DocumentWorkerLimits {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "limits must be an object",
    );
  }
  const obj = value as Record<string, unknown>;
  requireExactKeys(obj, [...REQUIRED_LIMITS_KEYS]);

  const maxFileBytes = requireSafeInteger(obj.maxFileBytes, "maxFileBytes", 1);
  const maxOutputBytes = requireSafeInteger(
    obj.maxOutputBytes,
    "maxOutputBytes",
    1,
  );
  const maxPageCount = requireSafeInteger(obj.maxPageCount, "maxPageCount", 1);
  const maxDecompressionRatio = requireSafeInteger(
    obj.maxDecompressionRatio,
    "maxDecompressionRatio",
    1,
  );

  return {
    maxFileBytes,
    maxOutputBytes,
    maxPageCount,
    maxDecompressionRatio,
  };
}

// ── Parse result ────────────────────────────────────────────────

export function parseDocumentWorkerResult(
  frame: string,
): DocumentWorkerResultMessage {
  const value = parseObject(frame);
  requireExactKeys(value, [
    "actionId",
    "effectAttemptId",
    "metadata",
    "output",
    "protocolVersion",
    "requestId",
    "status",
    "type",
  ]);

  if (value.type !== "result") {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "Expected result message",
    );
  }
  const protocolVersion = requireProtocolVersion(value.protocolVersion);

  const requestId = requireNonEmptyString(value.requestId, "requestId");
  const actionId = requireNonEmptyString(value.actionId, "actionId");
  const effectAttemptId = requireNonEmptyString(
    value.effectAttemptId,
    "effectAttemptId",
  );

  if (typeof value.status !== "string" || !VALID_STATUSES.has(value.status)) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      'status must be "succeeded" or "truncated"',
    );
  }

  const metadata = parseResultMetadata(value.metadata);

  return {
    type: "result",
    protocolVersion,
    requestId,
    actionId,
    effectAttemptId,
    status: value.status as "succeeded" | "truncated",
    output: value.output,
    metadata,
  };
}

export function parseDocumentWorkerTextWritePostcondition(
  frame: string,
): DocumentWorkerTextWritePostconditionMessage {
  const value = parseObject(frame);
  requireExactKeys(value, [
    "actionId",
    "decision",
    "effectAttemptId",
    "metadata",
    "output",
    "protocolVersion",
    "requestId",
    "type",
  ], ["metadata", "output"]);
  if (value.type !== "text_write_postcondition") {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "Expected text write postcondition result",
    );
  }
  if (value.protocolVersion !== DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION) {
    throw new DocumentWorkerProtocolError(
      "document_worker.protocol_mismatch",
      "Text write postcondition result requires the private protocol",
    );
  }
  const decisions = new Set(["not_found", "safe_retry", "recovered_success", "unknown"]);
  if (typeof value.decision !== "string" || !decisions.has(value.decision)) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "Invalid text write postcondition decision",
    );
  }
  const metadata = value.metadata === undefined ? undefined : parseResultMetadata(value.metadata);
  if (value.decision === "recovered_success" && (value.output === undefined || metadata === undefined)) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "Recovered text write result requires output and metadata",
    );
  }
  if (value.decision !== "recovered_success" && (value.output !== undefined || metadata !== undefined)) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "Non-success postcondition must not contain output or metadata",
    );
  }
  return {
    type: "text_write_postcondition",
    protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
    requestId: requireNonEmptyString(value.requestId, "requestId"),
    actionId: requireNonEmptyString(value.actionId, "actionId"),
    effectAttemptId: requireNonEmptyString(value.effectAttemptId, "effectAttemptId"),
    decision: value.decision as DocumentWorkerTextWritePostconditionMessage["decision"],
    ...(value.output === undefined ? {} : { output: value.output }),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function parseResultMetadata(value: unknown): DocumentWorkerResultMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "metadata must be an object",
    );
  }
  const obj = value as Record<string, unknown>;
  requireExactKeys(obj, [
    "locators",
    "originalCount",
    "resultDigest",
    "returnedCount",
    "timingMs",
    "truncated",
  ], ["locators"]);

  const originalCount = requireSafeInteger(obj.originalCount, "originalCount");
  const returnedCount = requireSafeInteger(obj.returnedCount, "returnedCount");
  const timingMs = requireSafeInteger(obj.timingMs, "timingMs");

  if (typeof obj.truncated !== "boolean") {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "metadata.truncated must be a boolean",
    );
  }

  const resultDigest = requireNonEmptyString(
    obj.resultDigest,
    "resultDigest",
    128,
  );

  const locators = obj.locators;
  if (locators !== undefined && !Array.isArray(locators)) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "metadata.locators must be an array",
    );
  }

  const result: DocumentWorkerResultMetadata = {
    originalCount,
    returnedCount,
    truncated: obj.truncated,
    resultDigest,
    timingMs,
  };
  if (locators !== undefined) {
    (result as { locators?: readonly unknown[] }).locators = locators as readonly unknown[];
  }
  return result;
}

// ── Parse error ─────────────────────────────────────────────────

export function parseDocumentWorkerError(
  frame: string,
): DocumentWorkerErrorMessage {
  const value = parseObject(frame);
  requireExactKeys(value, [
    "actionId",
    "effectAttemptId",
    "error",
    "protocolVersion",
    "requestId",
    "type",
  ]);

  if (value.type !== "error") {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "Expected error message",
    );
  }
  const protocolVersion = requireProtocolVersion(value.protocolVersion);

  const requestId = requireNonEmptyString(value.requestId, "requestId");
  const actionId = requireNonEmptyString(value.actionId, "actionId");
  const effectAttemptId = requireNonEmptyString(
    value.effectAttemptId,
    "effectAttemptId",
  );

  if (typeof value.error !== "object" || value.error === null || Array.isArray(value.error)) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "error must be an object",
    );
  }

  const errObj = value.error as Record<string, unknown>;
  requireExactKeys(errObj, ["code", "detailCode", "digest", "message"], ["detailCode", "digest"]);

  if (
    typeof errObj.code !== "string" ||
    !VALID_ERROR_CODES.has(errObj.code)
  ) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      `error.code must be one of: ${[...VALID_ERROR_CODES].join(", ")}`,
    );
  }

  const message = requireNonEmptyString(errObj.message, "error.message", 1024);
  const digest = errObj.digest;
  if (digest !== undefined && typeof digest !== "string") {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      "error.digest must be a string",
    );
  }

  const detailCode = errObj.detailCode;
  if (detailCode !== undefined) {
    requireNonEmptyString(detailCode, "error.detailCode", 120);
  }

  return {
    type: "error",
    protocolVersion,
    requestId,
    actionId,
    effectAttemptId,
    error: {
      code: errObj.code as DocumentWorkerErrorCode,
      message,
      ...(digest === undefined ? {} : { digest }),
      ...(detailCode === undefined ? {} : { detailCode: detailCode as string }),
    },
  };
}

// ── Factory helpers (for Worker process) ────────────────────────

export function createReadyMessage(): DocumentWorkerReadyMessage {
  return {
    type: "ready",
    protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
    adapter: DOCUMENT_WORKER_ADAPTER,
  };
}

export function createResultMessage(
  requestId: string,
  actionId: string,
  effectAttemptId: string,
  output: unknown,
  metadata: DocumentWorkerResultMetadata,
  protocolVersion: DocumentWorkerProtocolVersion = DOCUMENT_WORKER_PROTOCOL_VERSION,
): DocumentWorkerResultMessage {
  return {
    type: "result",
    protocolVersion,
    requestId,
    actionId,
    effectAttemptId,
    status: metadata.truncated ? "truncated" : "succeeded",
    output,
    metadata,
  };
}

export function createDocumentWorkerTextWritePostconditionMessage(input: Readonly<{
  request: DocumentWorkerTextWriteInspectMessage;
  decision: DocumentWorkerTextWritePostconditionMessage["decision"];
  output?: unknown;
  metadata?: DocumentWorkerResultMetadata;
}>): DocumentWorkerTextWritePostconditionMessage {
  return {
    type: "text_write_postcondition",
    protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
    requestId: input.request.requestId,
    actionId: input.request.actionId,
    effectAttemptId: input.request.effectAttemptId,
    decision: input.decision,
    ...(input.output === undefined ? {} : { output: input.output }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}

export function createErrorMessage(
  requestId: string,
  actionId: string,
  effectAttemptId: string,
  code: DocumentWorkerErrorCode,
  message: string,
  digest?: string,
  detailCode?: string,
  protocolVersion: DocumentWorkerProtocolVersion = DOCUMENT_WORKER_PROTOCOL_VERSION,
): DocumentWorkerErrorMessage {
  return {
    type: "error",
    protocolVersion,
    requestId,
    actionId,
    effectAttemptId,
    error: {
      code,
      message,
      ...(digest === undefined ? {} : { digest }),
      ...(detailCode === undefined ? {} : { detailCode }),
    },
  };
}

function requireSha256Hex(value: unknown, name: string): string {
  const text = requireNonEmptyString(value, name, 64);
  if (!/^[a-f0-9]{64}$/u.test(text)) {
    throw new DocumentWorkerProtocolError(
      "document_worker.invalid_message",
      `${name} must be a lowercase SHA-256 hex digest`,
    );
  }
  return text;
}
