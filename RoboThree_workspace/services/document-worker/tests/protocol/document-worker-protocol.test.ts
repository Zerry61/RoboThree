import { describe, it, expect } from "vitest";
import {
  DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
  DOCUMENT_WORKER_PROTOCOL_VERSION,
  DocumentWorkerProtocolError,
  createReadyMessage,
  createResultMessage,
  createErrorMessage,
  encodeDocumentWorkerMessage,
  parseDocumentWorkerReady,
  parseDocumentWorkerInvoke,
  parseDocumentWorkerResult,
  parseDocumentWorkerError,
} from "../../src/protocol/document-worker-protocol.js";

// ── Helpers ─────────────────────────────────────────────────────

const SAMPLE_LIMITS = {
  maxFileBytes: 50_000_000,
  maxOutputBytes: 5_000_000,
  maxPageCount: 500,
  maxDecompressionRatio: 100,
};

const SAMPLE_DEADLINE = new Date(Date.now() + 60_000).toISOString();

const SAMPLE_INVOKE = {
  type: "invoke" as const,
  protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
  requestId: "req-001",
  actionId: "act-001",
  effectAttemptId: "eff-001",
  capabilityId: "tool.document.xlsx.read",
  workspaceRoot: "/tmp/workspace",
  relativePath: "report.xlsx",
  options: { includeHiddenSheets: false },
  limits: SAMPLE_LIMITS,
  deadlineAt: SAMPLE_DEADLINE,
};

// ── Ready message ───────────────────────────────────────────────

describe("parseDocumentWorkerReady", () => {
  it("parses a valid ready message", () => {
    const msg = createReadyMessage();
    const frame = encodeDocumentWorkerMessage(msg).toString("utf8").trim();
    const parsed = parseDocumentWorkerReady(frame);
    expect(parsed.type).toBe("ready");
    expect(parsed.adapter).toBe("document-worker");
    expect(parsed.protocolVersion).toBe(DOCUMENT_WORKER_PROTOCOL_VERSION);
  });

  it("rejects ready with wrong adapter", () => {
    const frame = JSON.stringify({
      type: "ready",
      protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
      adapter: "wrong-adapter",
    });
    expect(() => parseDocumentWorkerReady(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects ready with wrong type", () => {
    const frame = JSON.stringify({
      type: "invoke",
      protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
      adapter: "document-worker",
    });
    expect(() => parseDocumentWorkerReady(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects ready with unknown fields", () => {
    const frame = JSON.stringify({
      type: "ready",
      protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
      adapter: "document-worker",
      extraField: "should not be here",
    });
    expect(() => parseDocumentWorkerReady(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects ready with missing required field", () => {
    const frame = JSON.stringify({
      type: "ready",
      adapter: "document-worker",
      // missing protocolVersion
    });
    expect(() => parseDocumentWorkerReady(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects ready with unsupported protocol version", () => {
    const frame = JSON.stringify({
      type: "ready",
      protocolVersion: "v99",
      adapter: "document-worker",
    });
    expect(() => parseDocumentWorkerReady(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
    try {
      parseDocumentWorkerReady(frame);
    } catch (e) {
      expect((e as DocumentWorkerProtocolError).code).toBe(
        "document_worker.protocol_mismatch",
      );
    }
  });

  it("rejects non-object", () => {
    expect(() => parseDocumentWorkerReady("null")).toThrow(
      DocumentWorkerProtocolError,
    );
    expect(() => parseDocumentWorkerReady("[]")).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects malformed JSON", () => {
    try {
      parseDocumentWorkerReady("{broken");
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentWorkerProtocolError);
      expect((e as DocumentWorkerProtocolError).code).toBe(
        "document_worker.invalid_json",
      );
    }
  });
});

// ── Invoke message ──────────────────────────────────────────────

describe("parseDocumentWorkerInvoke", () => {
  it("parses a valid invoke message", () => {
    const frame = JSON.stringify(SAMPLE_INVOKE);
    const parsed = parseDocumentWorkerInvoke(frame);
    expect(parsed.requestId).toBe("req-001");
    expect(parsed.actionId).toBe("act-001");
    expect(parsed.effectAttemptId).toBe("eff-001");
    expect(parsed.capabilityId).toBe("tool.document.xlsx.read");
    expect(parsed.workspaceRoot).toBe("/tmp/workspace");
    expect(parsed.relativePath).toBe("report.xlsx");
    expect(parsed.options).toEqual({ includeHiddenSheets: false });
    expect(parsed.limits.maxFileBytes).toBe(50_000_000);
  });

  it("parses invoke with required top-level deadlineAt", () => {
    const deadline = new Date(Date.now() + 30_000).toISOString();
    const frame = JSON.stringify({ ...SAMPLE_INVOKE, deadlineAt: deadline });
    const parsed = parseDocumentWorkerInvoke(frame);
    expect(parsed.deadlineAt).toBe(deadline);
  });

  it("parses v1alpha2 invoke ownership fields", () => {
    const requestDigest = "a".repeat(64);
    const frame = JSON.stringify({
      ...SAMPLE_INVOKE,
      protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
      idempotencyKey: "idem-001",
      requestDigest,
    });
    const parsed = parseDocumentWorkerInvoke(frame);
    expect(parsed.idempotencyKey).toBe("idem-001");
    expect(parsed.requestDigest).toBe(requestDigest);
  });

  it("parses the exact private workspace text write capability only on v1alpha2", () => {
    const privateInvoke = {
      ...SAMPLE_INVOKE,
      protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
      capabilityId: "tool.workspace.file.write_text",
      relativePath: "index.html",
      options: {
        content: "<main>ok</main>",
        mode: "create_new",
        workspaceGrantId: "workspace-grant",
        limitsRevision: "workspace-text.v1",
      },
      idempotencyKey: "workspace-text:task:call",
      requestDigest: "a".repeat(64),
    };
    expect(parseDocumentWorkerInvoke(JSON.stringify(privateInvoke)).capabilityId).toBe(
      "tool.workspace.file.write_text",
    );
    expect(() => parseDocumentWorkerInvoke(JSON.stringify({
      ...privateInvoke,
      protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
    }))).toThrow(DocumentWorkerProtocolError);
    expect(() => parseDocumentWorkerInvoke(JSON.stringify({
      ...privateInvoke,
      capabilityId: "tool.workspace.file.delete",
    }))).toThrow(DocumentWorkerProtocolError);
  });

  it("rejects malformed v1alpha2 requestDigest", () => {
    const frame = JSON.stringify({
      ...SAMPLE_INVOKE,
      protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
      idempotencyKey: "idem-001",
      requestDigest: "not-a-sha256",
    });
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects invoke when top-level deadlineAt is absent", () => {
    const invokeWithoutTopLevel = { ...SAMPLE_INVOKE };
    delete (invokeWithoutTopLevel as Record<string, unknown>)["deadlineAt"];
    const frame = JSON.stringify(invokeWithoutTopLevel);
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow("Missing required");
  });

  it("rejects invoke with capabilityId not starting with tool.document.", () => {
    const frame = JSON.stringify({
      ...SAMPLE_INVOKE,
      capabilityId: "tool.echo",
    });
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow("tool.document");
  });

  it("rejects invoke with invalid deadlineAt format", () => {
    const frame = JSON.stringify({
      ...SAMPLE_INVOKE,
      deadlineAt: "not-a-timestamp",
    });
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects invoke with unknown fields", () => {
    const frame = JSON.stringify({
      ...SAMPLE_INVOKE,
      injectedField: "evil",
    });
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow("Unknown fields");
  });

  it("rejects invoke with missing required field", () => {
    const { requestId: _, ...missing } = SAMPLE_INVOKE;
    const frame = JSON.stringify(missing);
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow("Missing required");
  });

  it("rejects invoke with empty requestId", () => {
    const frame = JSON.stringify({ ...SAMPLE_INVOKE, requestId: "" });
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects invoke with non-object options", () => {
    const frame = JSON.stringify({ ...SAMPLE_INVOKE, options: "string" });
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects invoke with non-object limits", () => {
    const frame = JSON.stringify({ ...SAMPLE_INVOKE, limits: null });
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects invoke with negative maxFileBytes", () => {
    const frame = JSON.stringify({
      ...SAMPLE_INVOKE,
      limits: { ...SAMPLE_LIMITS, maxFileBytes: -1 },
    });
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects invoke with unknown deadlineAt in limits", () => {
    const frame = JSON.stringify({
      ...SAMPLE_INVOKE,
      limits: { ...SAMPLE_LIMITS, deadlineAt: "bad" },
    });
    expect(() => parseDocumentWorkerInvoke(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });
});

// ── Result message ──────────────────────────────────────────────

describe("parseDocumentWorkerResult", () => {
  it("parses a valid succeeded result", () => {
    const msg = createResultMessage("req-1", "act-1", "eff-1", { text: "hello" }, {
      originalCount: 10,
      returnedCount: 10,
      truncated: false,
      resultDigest: "abc123",
      locators: [{ page: 1 }],
      timingMs: 42,
    });
    const frame = encodeDocumentWorkerMessage(msg).toString("utf8").trim();
    const parsed = parseDocumentWorkerResult(frame);
    expect(parsed.status).toBe("succeeded");
    expect(parsed.metadata.originalCount).toBe(10);
    expect(parsed.metadata.truncated).toBe(false);
    expect(parsed.metadata.locators).toEqual([{ page: 1 }]);
  });

  it("parses a truncated result", () => {
    const msg = createResultMessage("req-1", "act-1", "eff-1", { text: "par" }, {
      originalCount: 100,
      returnedCount: 50,
      truncated: true,
      resultDigest: "def456",
      timingMs: 100,
    });
    const frame = encodeDocumentWorkerMessage(msg).toString("utf8").trim();
    const parsed = parseDocumentWorkerResult(frame);
    expect(parsed.status).toBe("truncated");
    expect(parsed.metadata.truncated).toBe(true);
  });

  it("rejects result with invalid status", () => {
    const frame = JSON.stringify({
      type: "result",
      protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
      requestId: "r1",
      actionId: "a1",
      effectAttemptId: "e1",
      status: "failed",
      output: null,
      metadata: {
        originalCount: 0,
        returnedCount: 0,
        truncated: false,
        resultDigest: "abc",
        timingMs: 0,
      },
    });
    expect(() => parseDocumentWorkerResult(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects result with non-boolean truncated", () => {
    const frame = JSON.stringify({
      type: "result",
      protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
      requestId: "r1",
      actionId: "a1",
      effectAttemptId: "e1",
      status: "succeeded",
      output: null,
      metadata: {
        originalCount: 0,
        returnedCount: 0,
        truncated: "yes",
        resultDigest: "abc",
        timingMs: 0,
      },
    });
    expect(() => parseDocumentWorkerResult(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });
});

// ── Error message ───────────────────────────────────────────────

describe("parseDocumentWorkerError", () => {
  it("parses a valid error message", () => {
    const msg = createErrorMessage(
      "req-1", "act-1", "eff-1",
      "unsupported_feature",
      "Not implemented",
    );
    const frame = encodeDocumentWorkerMessage(msg).toString("utf8").trim();
    const parsed = parseDocumentWorkerError(frame);
    expect(parsed.error.code).toBe("unsupported_feature");
    expect(parsed.error.message).toBe("Not implemented");
  });

  it("parses error with optional digest", () => {
    const msg = createErrorMessage(
      "req-1", "act-1", "eff-1",
      "corrupt",
      "ZIP structure invalid",
      "sha256:def456",
    );
    const frame = encodeDocumentWorkerMessage(msg).toString("utf8").trim();
    const parsed = parseDocumentWorkerError(frame);
    expect(parsed.error.digest).toBe("sha256:def456");
  });

  it("parses error with optional detailCode", () => {
    const msg = createErrorMessage(
      "req-1", "act-1", "eff-1",
      "invalid_format",
      "XLSX target already exists",
      "sha256:def456",
      "target_exists",
    );
    const frame = encodeDocumentWorkerMessage(msg).toString("utf8").trim();
    const parsed = parseDocumentWorkerError(frame);
    expect(parsed.error.detailCode).toBe("target_exists");
  });

  it("parses worker_busy error tied to the rejected request attempt", () => {
    const msg = createErrorMessage(
      "req-busy", "act-busy", "eff-busy",
      "worker_busy",
      "Document Worker is already processing another request",
    );
    const frame = encodeDocumentWorkerMessage(msg).toString("utf8").trim();
    const parsed = parseDocumentWorkerError(frame);
    expect(parsed.requestId).toBe("req-busy");
    expect(parsed.actionId).toBe("act-busy");
    expect(parsed.effectAttemptId).toBe("eff-busy");
    expect(parsed.error.code).toBe("worker_busy");
  });

  it("rejects error with invalid code", () => {
    const frame = JSON.stringify({
      type: "error",
      protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
      requestId: "r1",
      actionId: "a1",
      effectAttemptId: "e1",
      error: { code: "not_a_real_code", message: "msg" },
    });
    expect(() => parseDocumentWorkerError(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  it("rejects error with non-string digest", () => {
    const frame = JSON.stringify({
      type: "error",
      protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
      requestId: "r1",
      actionId: "a1",
      effectAttemptId: "e1",
      error: { code: "internal_failure", message: "msg", digest: 123 },
    });
    expect(() => parseDocumentWorkerError(frame)).toThrow(
      DocumentWorkerProtocolError,
    );
  });

  // ── P2-01: Frame injection via error message ──────────────────

  it("rejects error message containing raw newline (frame injection defense)", () => {
    // An attacker-controlled error message containing `\n` could inject
    // a new NDJSON frame. The protocol layer relies on JSON.stringify
    // to escape newlines. This test verifies that a message with a raw
    // newline (not JSON-escaped) is rejected as malformed JSON.
    const raw = `{"type":"error","protocolVersion":"${DOCUMENT_WORKER_PROTOCOL_VERSION}","requestId":"r1","actionId":"a1","effectAttemptId":"e1","error":{"code":"internal_failure","message":"line1\nline2"}}`;
    // The raw \n breaks JSON parsing — the JSON parser sees a newline
    // mid-string, which is invalid in JSON (must be \\n).
    try {
      parseDocumentWorkerError(raw);
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentWorkerProtocolError);
      expect((e as DocumentWorkerProtocolError).code).toBe(
        "document_worker.invalid_json",
      );
    }
  });
});

// ── Frame injection (P2-01) ─────────────────────────────────────

describe("NDJSON frame injection defenses", () => {
  it("JSON.stringify escapes newlines in output values", () => {
    // When the worker uses JSON.stringify via encodeDocumentWorkerMessage,
    // any \n in content becomes \\n in the JSON string — safe for NDJSON.
    const msg = createErrorMessage(
      "r1", "a1", "e1",
      "internal_failure",
      "error with\nmultiple\nlines",
    );
    const encoded = encodeDocumentWorkerMessage(msg).toString("utf8");
    // Must be exactly one line ending in \n (the NDJSON delimiter)
    const lines = encoded.split("\n");
    // Last element is empty string after final \n
    expect(lines.length).toBe(2);
    expect(lines[1]).toBe("");
    // The JSON line must contain escaped newlines, not raw ones
    expect(lines[0]).toContain("error with\\nmultiple\\nlines");
  });

  it("JSON.stringify escapes newlines in output data", () => {
    // Document content containing newlines must be JSON-escaped
    const result = createResultMessage("r1", "a1", "e1",
      { text: "page 1\npage 2\npage 3" },
      { originalCount: 3, returnedCount: 3, truncated: false, resultDigest: "abc", timingMs: 0 },
    );
    const encoded = encodeDocumentWorkerMessage(result).toString("utf8");
    const lines = encoded.split("\n");
    expect(lines.length).toBe(2); // exactly one NDJSON frame
    expect(lines[0]).toContain("page 1\\npage 2\\npage 3");
  });

  it("encode-then-parse round-trip preserves newlines", () => {
    const msg = createResultMessage("r1", "a1", "e1",
      { text: "line1\nline2" },
      { originalCount: 2, returnedCount: 2, truncated: false, resultDigest: "abc", timingMs: 0 },
    );
    const frame = encodeDocumentWorkerMessage(msg).toString("utf8").trim();
    const parsed = parseDocumentWorkerResult(frame);
    expect((parsed.output as { text: string }).text).toBe("line1\nline2");
  });
});
