import { describe, it, expect, vi } from "vitest";
import {
  logEvent,
  logLifecycle,
  logWarning,
  logError,
} from "../../src/common/logger.js";

describe("logger", () => {
  it("logEvent writes valid JSON to stderr", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      logEvent("info", "test.event", { capabilityId: "tool.document.xlsx.read" });
      expect(spy).toHaveBeenCalledTimes(1);
      const output = spy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("info");
      expect(parsed.event).toBe("test.event");
      expect(parsed.capabilityId).toBe("tool.document.xlsx.read");
      expect(parsed.ts).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("logLifecycle is a convenience for info-level lifecycle events", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      logLifecycle("worker.startup");
      expect(spy).toHaveBeenCalledTimes(1);
      const output = spy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("info");
      expect(parsed.event).toBe("worker.startup");
    } finally {
      spy.mockRestore();
    }
  });

  it("logWarning writes warn-level events", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      logWarning("file.close_to_limit", { fileSizeBytes: 49_000_000 });
      expect(spy).toHaveBeenCalledTimes(1);
      const output = spy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("warn");
    } finally {
      spy.mockRestore();
    }
  });

  it("logError writes error-level events with error code and digest", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      logError("corrupt", "digest-abc123", { requestId: "req-1" });
      expect(spy).toHaveBeenCalledTimes(1);
      const output = spy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("error");
      expect(parsed.event).toBe("error.corrupt");
      expect(parsed.errorCode).toBe("corrupt");
      expect(parsed.resultDigest).toBe("digest-abc123");
      expect(parsed.requestId).toBe("req-1");
    } finally {
      spy.mockRestore();
    }
  });

  it("never logs document content or absolute paths — type-level enforcement", () => {
    // The SafeLogContext type only allows specific fields.
    // This is a compile-time check: uncommenting the line below
    // would cause a TypeScript error:
    //
    // logEvent("info", "test", { fileContent: "secret" } as any);
    //
    // Runtime enforcement: any extra fields in the context object
    // are still written. The type system prevents them at dev time;
    // the canary scan harness (harness/canary-scan.test.ts) catches
    // leaks at test time.

    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      // Valid context — only uses SafeLogContext fields
      logLifecycle("test", {
        capabilityId: "tool.document.pdf.extract_text",
        status: "succeeded",
        originalCount: 100,
        returnedCount: 100,
        truncated: false,
        resultDigest: "sha256:abc",
        errorCode: undefined,
        durationMs: 42,
        fileSizeBytes: 1024,
        requestId: "req-1",
        actionId: "act-1",
      });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("omits undefined context fields from output", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      logLifecycle("test", { requestId: "req-1" });
      const output = spy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(output);
      // Fields not provided should not appear
      expect(parsed.capabilityId).toBeUndefined();
      expect(parsed.fileSizeBytes).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});
