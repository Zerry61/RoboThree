import type { DocumentWorkerErrorCode } from "../protocol/document-worker-protocol.js";

/** Document Worker typed error taxonomy. */
export const ERROR_CODES = [
  "invalid_format",
  "encrypted",
  "corrupt",
  "limit_exceeded",
  "unsupported_feature",
  "worker_busy",
  "cancelled",
  "timed_out",
  "internal_failure",
] as const satisfies readonly DocumentWorkerErrorCode[];

/** Human-readable labels for each error code (safe for logs). */
export const ERROR_LABELS: Record<DocumentWorkerErrorCode, string> = {
  invalid_format: "File format not recognized or mismatched",
  encrypted: "File is encrypted / password-protected",
  corrupt: "File is corrupt or structurally invalid",
  limit_exceeded: "File exceeds configured resource limits",
  unsupported_feature: "File uses a feature this worker does not support",
  worker_busy: "Worker is already processing another request",
  cancelled: "Processing was cancelled before completion",
  timed_out: "Processing exceeded the deadline",
  internal_failure: "Unexpected internal worker error",
};

/**
 * Returns true if the error code represents a terminal condition where
 * retrying with the same file and options would produce the same result.
 */
export function isDeterministicError(code: DocumentWorkerErrorCode): boolean {
  switch (code) {
    case "invalid_format":
    case "encrypted":
    case "corrupt":
    case "unsupported_feature":
      return true;
    case "worker_busy":
    case "limit_exceeded":
    case "cancelled":
    case "timed_out":
    case "internal_failure":
      return false;
  }
}
