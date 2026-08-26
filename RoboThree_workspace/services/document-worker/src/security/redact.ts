// Log/error redaction for DTP-0.
// Worker logs and error messages must never carry document body text, cell
// values, absolute file paths, or secrets. Any value that is not a whitelisted
// metadata field is replaced with a digest.

import { createHash } from "node:crypto";

const MAX_LOG_FIELD_LENGTH = 256;

export type LoggableRecord = Record<string, unknown>;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/**
 * Redact a single value for logging. Strings that are not whitelisted metadata
 * are replaced with `content:<digest>`; objects are recursively scrubbed;
 * arrays are length-capped.
 */
export function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > MAX_LOG_FIELD_LENGTH) {
      return `string:${digest(value)}`;
    }
    return `string:${digest(value)}`;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => redactValue(item));
  }
  if (typeof value === "object") {
    const record: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      record[key] = redactValue(item);
    }
    return record;
  }
  return `unsupported:${typeof value}`;
}

/** Build a safe log line from an arbitrary record: only whitelisted keys keep
 * their raw value, everything else is digested. */
const RAW_SAFE_KEYS = new Set([
  "requestId",
  "actionId",
  "effectAttemptId",
  "capabilityId",
  "status",
  "code",
  "count",
  "timingMs",
  "truncated",
]);

export function safeLogLine(record: LoggableRecord): string {
  const scrubbed: LoggableRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (RAW_SAFE_KEYS.has(key)) {
      scrubbed[key] = value;
    } else {
      scrubbed[key] = redactValue(value);
    }
  }
  return JSON.stringify(scrubbed);
}
