import { createHash } from "node:crypto";

/**
 * SHA-256 digest of arbitrary data.
 * Used for resultDigest and error context digests.
 * Never includes file paths or document content in the logged digest context.
 */
export function sha256Digest(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Compute a deterministic digest from structured output for comparison.
 * Uses JSON.stringify with sorted keys for stability.
 */
export function computeResultDigest(output: unknown): string {
  const serialized = JSON.stringify(output, stableStringifyReplacer);
  return sha256Digest(serialized);
}

/**
 * Compute a safe error context digest that does NOT include the file path
 * or document content. Only includes the error code, sanitized message,
 * and operation metadata.
 */
export function computeErrorDigest(
  code: string,
  message: string,
  extra?: Record<string, string>,
): string {
  const parts = [code, message];
  if (extra) {
    for (const key of Object.keys(extra).sort()) {
      parts.push(`${key}=${extra[key]}`);
    }
  }
  return sha256Digest(parts.join("|"));
}

/**
 * JSON.stringify replacer that sorts object keys for deterministic output.
 */
function stableStringifyReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[k] = (value as Record<string, unknown>)[k];
  }
  return sorted;
}
