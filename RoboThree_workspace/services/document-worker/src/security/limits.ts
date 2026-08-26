import type { DocumentWorkerLimits } from "../protocol/document-worker-protocol.js";

/**
 * Default resource limits for Document Worker.
 * All limits are fail-closed: exceeding any limit terminates processing.
 */
export const DEFAULT_LIMITS: DocumentWorkerLimits = {
  maxFileBytes: 50 * 1024 * 1024,         // 50 MB
  maxOutputBytes: 5 * 1024 * 1024,        // 5 MB
  maxPageCount: 500,                       // 500 pages
  maxDecompressionRatio: 100,              // 100:1 max compression ratio
};

/**
 * Validate file size against the configured limit.
 * Returns `true` if the file is within the limit.
 */
export function checkFileSize(
  fileBytes: number,
  limits: DocumentWorkerLimits,
): boolean {
  return fileBytes <= limits.maxFileBytes;
}

/**
 * Validate decompression ratio (compressed size / original size).
 * ZIP bombs have extremely high compression ratios.
 * Returns `true` if the ratio is acceptable.
 */
export function checkDecompressionRatio(
  compressedBytes: number,
  decompressedBytes: number,
  limits: DocumentWorkerLimits,
): boolean {
  if (compressedBytes <= 0) return false;
  const ratio = decompressedBytes / compressedBytes;
  return ratio <= limits.maxDecompressionRatio;
}

/**
 * Construct a `limit_exceeded` error message that describes what limit
 * was hit, without including the actual file size or content.
 */
export function limitExceededMessage(reason: string): string {
  return `Resource limit exceeded: ${reason}`;
}

// ── Runtime limit tracker ───────────────────────────────────────

export class LimitTracker {
  readonly #limits: DocumentWorkerLimits;
  #outputBytes = 0;
  #startTime = Date.now();

  public constructor(limits: DocumentWorkerLimits) {
    this.#limits = limits;
  }

  get limits(): DocumentWorkerLimits {
    return this.#limits;
  }

  get elapsedMs(): number {
    return Date.now() - this.#startTime;
  }

  /**
   * Check if adding `bytes` to accumulated output would exceed the limit.
   * Returns `true` if the output is still within bounds.
   */
  public checkOutputBudget(bytes: number): boolean {
    return this.#outputBytes + bytes <= this.#limits.maxOutputBytes;
  }

  /**
   * Track output bytes written. Call this after every output chunk.
   */
  public trackOutput(bytes: number): void {
    this.#outputBytes += bytes;
  }

}
