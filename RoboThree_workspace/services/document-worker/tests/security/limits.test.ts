import { describe, it, expect } from "vitest";
import {
  LimitTracker,
  checkFileSize,
  checkDecompressionRatio,
  limitExceededMessage,
} from "../../src/security/limits.js";

const SAMPLE_LIMITS = {
  maxFileBytes: 1_000_000,
  maxOutputBytes: 100_000,
  maxPageCount: 500,
  maxDecompressionRatio: 100,
};

describe("checkFileSize", () => {
  it("accepts file within limit", () => {
    expect(checkFileSize(500_000, SAMPLE_LIMITS)).toBe(true);
  });

  it("rejects file exceeding limit", () => {
    expect(checkFileSize(2_000_000, SAMPLE_LIMITS)).toBe(false);
  });

  it("accepts file exactly at limit", () => {
    expect(checkFileSize(1_000_000, SAMPLE_LIMITS)).toBe(true);
  });
});

describe("checkDecompressionRatio", () => {
  it("accepts reasonable compression ratio", () => {
    expect(checkDecompressionRatio(1000, 50000, SAMPLE_LIMITS)).toBe(true); // 50:1
  });

  it("rejects ZIP bomb ratio", () => {
    expect(checkDecompressionRatio(100, 50000, SAMPLE_LIMITS)).toBe(false); // 500:1
  });

  it("rejects zero compressed bytes", () => {
    expect(checkDecompressionRatio(0, 100, SAMPLE_LIMITS)).toBe(false);
  });

  it("accepts ratio exactly at limit", () => {
    expect(checkDecompressionRatio(100, 10000, SAMPLE_LIMITS)).toBe(true); // 100:1
  });
});

describe("limitExceededMessage", () => {
  it("returns a message without including actual values", () => {
    const msg = limitExceededMessage("file too large");
    expect(msg).toContain("Resource limit exceeded");
    expect(msg).toContain("file too large");
    // Must NOT contain actual byte counts
    expect(msg).not.toMatch(/\d+/);
  });
});

describe("LimitTracker", () => {
  it("tracks output budget correctly", () => {
    const tracker = new LimitTracker(SAMPLE_LIMITS);
    expect(tracker.checkOutputBudget(50_000)).toBe(true);
    tracker.trackOutput(50_000);
    expect(tracker.checkOutputBudget(50_000)).toBe(true);
    tracker.trackOutput(50_000);
    // Now at 100_000 — next byte exceeds limit
    expect(tracker.checkOutputBudget(1)).toBe(false);
  });

  it("reports elapsed time", () => {
    const tracker = new LimitTracker(SAMPLE_LIMITS);
    expect(tracker.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
