import {
  ActionSchema,
  ObservationSchema,
  type Action,
  type Observation,
} from "@robothree/contracts";

export const PROCESS_ECHO_PROTOCOL_VERSION = "v1alpha1";
export const PROCESS_ECHO_TOOL_ID = "tool.echo";

export type ProcessEchoReadyMessage = Readonly<{
  type: "ready";
  protocolVersion: typeof PROCESS_ECHO_PROTOCOL_VERSION;
  adapter: "process-echo";
}>;

export type ProcessEchoInvokeMessage = Readonly<{
  type: "invoke";
  protocolVersion: typeof PROCESS_ECHO_PROTOCOL_VERSION;
  requestId: string;
  effectAttemptId: string;
  idempotencyKey: string;
  toolId: typeof PROCESS_ECHO_TOOL_ID;
  action: Action;
  deadlineAt?: string;
}>;

export type ProcessEchoObservationMessage = Readonly<{
  type: "observation";
  protocolVersion: typeof PROCESS_ECHO_PROTOCOL_VERSION;
  requestId: string;
  effectAttemptId: string;
  observation: Observation;
}>;

export type ProcessEchoProtocolMessage =
  | ProcessEchoReadyMessage
  | ProcessEchoInvokeMessage
  | ProcessEchoObservationMessage;

export class ProcessEchoProtocolError extends Error {
  public readonly code:
    | "process_echo.invalid_json"
    | "process_echo.invalid_message"
    | "process_echo.protocol_mismatch";

  public constructor(code: ProcessEchoProtocolError["code"], message: string) {
    super(message);
    this.name = "ProcessEchoProtocolError";
    this.code = code;
  }
}

export function encodeProcessEchoMessage(message: ProcessEchoProtocolMessage): Buffer {
  return Buffer.from(`${JSON.stringify(message)}\n`, "utf8");
}

export function parseProcessEchoReady(frame: string): ProcessEchoReadyMessage {
  const value = parseObject(frame);
  requireExactKeys(value, ["adapter", "protocolVersion", "type"]);
  if (value.type !== "ready" || value.adapter !== "process-echo") {
    throw new ProcessEchoProtocolError("process_echo.invalid_message", "Expected process-echo ready message");
  }
  requireProtocolVersion(value.protocolVersion);
  return {
    type: "ready",
    protocolVersion: PROCESS_ECHO_PROTOCOL_VERSION,
    adapter: "process-echo",
  };
}

export function parseProcessEchoInvoke(frame: string): ProcessEchoInvokeMessage {
  const value = parseObject(frame);
  requireExactKeys(value, [
    "action",
    "deadlineAt",
    "effectAttemptId",
    "idempotencyKey",
    "protocolVersion",
    "requestId",
    "toolId",
    "type",
  ], ["deadlineAt"]);
  if (value.type !== "invoke" || value.toolId !== PROCESS_ECHO_TOOL_ID) {
    throw new ProcessEchoProtocolError("process_echo.invalid_message", "Expected tool.echo invoke message");
  }
  requireProtocolVersion(value.protocolVersion);
  const action = ActionSchema.safeParse(value.action);
  if (!action.success || action.data.kind !== PROCESS_ECHO_TOOL_ID) {
    throw new ProcessEchoProtocolError("process_echo.invalid_message", "Invoke message contains an invalid Echo Action");
  }
  const requestId = requireNonEmptyString(value.requestId, "requestId");
  const effectAttemptId = requireNonEmptyString(value.effectAttemptId, "effectAttemptId");
  const idempotencyKey = requireNonEmptyString(value.idempotencyKey, "idempotencyKey");
  const deadlineAt = value.deadlineAt;
  if (deadlineAt !== undefined && (typeof deadlineAt !== "string" || !Number.isFinite(Date.parse(deadlineAt)))) {
    throw new ProcessEchoProtocolError("process_echo.invalid_message", "deadlineAt must be an ISO timestamp");
  }
  return {
    type: "invoke",
    protocolVersion: PROCESS_ECHO_PROTOCOL_VERSION,
    requestId,
    effectAttemptId,
    idempotencyKey,
    toolId: PROCESS_ECHO_TOOL_ID,
    action: action.data,
    ...(deadlineAt === undefined ? {} : { deadlineAt }),
  };
}

export function parseProcessEchoObservation(frame: string): ProcessEchoObservationMessage {
  const value = parseObject(frame);
  requireExactKeys(value, [
    "effectAttemptId",
    "observation",
    "protocolVersion",
    "requestId",
    "type",
  ]);
  if (value.type !== "observation") {
    throw new ProcessEchoProtocolError("process_echo.invalid_message", "Expected observation message");
  }
  requireProtocolVersion(value.protocolVersion);
  const observation = ObservationSchema.safeParse(value.observation);
  if (!observation.success) {
    throw new ProcessEchoProtocolError("process_echo.invalid_message", "Observation message is not schema-valid");
  }
  return {
    type: "observation",
    protocolVersion: PROCESS_ECHO_PROTOCOL_VERSION,
    requestId: requireNonEmptyString(value.requestId, "requestId"),
    effectAttemptId: requireNonEmptyString(value.effectAttemptId, "effectAttemptId"),
    observation: observation.data,
  };
}

function parseObject(frame: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(frame);
  } catch {
    throw new ProcessEchoProtocolError("process_echo.invalid_json", "Process emitted malformed JSON");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProcessEchoProtocolError("process_echo.invalid_message", "Protocol message must be an object");
  }
  return value as Record<string, unknown>;
}

function requireProtocolVersion(value: unknown): void {
  if (value !== PROCESS_ECHO_PROTOCOL_VERSION) {
    throw new ProcessEchoProtocolError(
      "process_echo.protocol_mismatch",
      `Expected protocol ${PROCESS_ECHO_PROTOCOL_VERSION}`,
    );
  }
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new ProcessEchoProtocolError("process_echo.invalid_message", `${name} must be a non-empty string`);
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
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    throw new ProcessEchoProtocolError("process_echo.invalid_message", "Protocol message contains unknown fields");
  }
  if (allowed.some((key) => !optionalSet.has(key) && !(key in value))) {
    throw new ProcessEchoProtocolError("process_echo.invalid_message", "Protocol message is missing required fields");
  }
}
