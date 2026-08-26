import { describe, it, expect } from "vitest";
import {
  ERROR_CODES,
  ERROR_LABELS,
  isDeterministicError,
} from "../../src/common/error-taxonomy.js";

describe("error taxonomy", () => {
  it("has the frozen worker-private error codes", () => {
    expect(ERROR_CODES).toEqual([
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
  });

  it("every error code has a label", () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_LABELS[code]).toBeTruthy();
    }
  });

  it("deterministic errors are invalid_format, encrypted, corrupt, unsupported_feature", () => {
    expect(isDeterministicError("invalid_format")).toBe(true);
    expect(isDeterministicError("encrypted")).toBe(true);
    expect(isDeterministicError("corrupt")).toBe(true);
    expect(isDeterministicError("unsupported_feature")).toBe(true);
  });

  it("non-deterministic errors are retryable or runtime-sensitive", () => {
    expect(isDeterministicError("limit_exceeded")).toBe(false);
    expect(isDeterministicError("worker_busy")).toBe(false);
    expect(isDeterministicError("cancelled")).toBe(false);
    expect(isDeterministicError("timed_out")).toBe(false);
    expect(isDeterministicError("internal_failure")).toBe(false);
  });
});
