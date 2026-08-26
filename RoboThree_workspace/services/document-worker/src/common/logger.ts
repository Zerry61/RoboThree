/**
 * Sanitized logger for Document Worker.
 *
 * RULES (from DTP-0):
 * - Log only: Tool ID, status, count, duration, digest
 * - NEVER log: document content, cell values, absolute file paths, secrets
 *
 * Every log method enforces these rules at the type level by only
 * accepting pre-defined safe fields.
 */

export interface SafeLogContext {
  capabilityId?: string;
  status?: string;
  originalCount?: number;
  returnedCount?: number;
  truncated?: boolean;
  resultDigest?: string;
  errorCode?: string;
  durationMs?: number;
  fileSizeBytes?: number;
  requestId?: string;
  actionId?: string;
}

/**
 * Emit a structured, sanitized log line to stderr.
 * Only the SafeLogContext fields are written — never content, paths, or values.
 */
export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  context: SafeLogContext = {},
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...context,
  };
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}

/**
 * Log a lifecycle event (startup, shutdown, request begin/end, etc).
 */
export function logLifecycle(
  event: string,
  context: SafeLogContext = {},
): void {
  logEvent("info", event, context);
}

/**
 * Log a warning that does not include sensitive content.
 */
export function logWarning(
  event: string,
  context: SafeLogContext = {},
): void {
  logEvent("warn", event, context);
}

/**
 * Log an error with its typed code. The `digest` field is used
 * instead of the actual error message to avoid leaking content.
 */
export function logError(
  code: string,
  digest: string,
  context: SafeLogContext = {},
): void {
  logEvent("error", `error.${code}`, {
    ...context,
    errorCode: code,
    resultDigest: digest,
  });
}
