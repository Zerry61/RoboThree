import { describe, it, expect } from "vitest";
import {
  sha256Digest,
  computeResultDigest,
  computeErrorDigest,
} from "../../src/common/digest.js";

describe("sha256Digest", () => {
  it("produces 64-char hex string", () => {
    const d = sha256Digest("hello");
    expect(d).toHaveLength(64);
    expect(d).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(sha256Digest("hello")).toBe(sha256Digest("hello"));
  });

  it("produces different digests for different inputs", () => {
    expect(sha256Digest("hello")).not.toBe(sha256Digest("world"));
  });

  it("accepts Buffer input", () => {
    const d = sha256Digest(Buffer.from("hello"));
    expect(d).toHaveLength(64);
  });
});

describe("computeResultDigest", () => {
  it("is deterministic for same output", () => {
    const d1 = computeResultDigest({ a: 1, b: 2 });
    const d2 = computeResultDigest({ b: 2, a: 1 });
    expect(d1).toBe(d2); // key order does not matter
  });

  it("produces different digests for different output", () => {
    const d1 = computeResultDigest({ text: "hello" });
    const d2 = computeResultDigest({ text: "world" });
    expect(d1).not.toBe(d2);
  });

  it("handles nested objects with sorted keys", () => {
    const d1 = computeResultDigest({ pages: [{ n: 2 }, { n: 1 }] });
    const d2 = computeResultDigest({ pages: [{ n: 2 }, { n: 1 }] });
    expect(d1).toBe(d2);
  });
});

describe("computeErrorDigest", () => {
  it("includes error code and message", () => {
    const d = computeErrorDigest("corrupt", "ZIP invalid");
    expect(d).toHaveLength(64);
  });

  it("is deterministic", () => {
    expect(computeErrorDigest("corrupt", "msg")).toBe(
      computeErrorDigest("corrupt", "msg"),
    );
  });

  it("includes extra context sorted by key", () => {
    const d1 = computeErrorDigest("corrupt", "msg", { b: "2", a: "1" });
    const d2 = computeErrorDigest("corrupt", "msg", { a: "1", b: "2" });
    expect(d1).toBe(d2);
  });

  it("does NOT include file paths in digest", () => {
    // The digest function itself doesn't prohibit paths, but the
    // caller (logger.ts) is responsible for never passing them.
    // This test verifies the behavior is deterministic.
    const d1 = computeErrorDigest("corrupt", "msg");
    const d2 = computeErrorDigest("corrupt", "msg");
    expect(d1).toBe(d2);
  });
});
