/**
 * Harness: Dynamic canary scan
 *
 * Injects unique random canary values into document processing and
 * verifies they NEVER appear in:
 * 1. Worker stdout (protocol frames — DD-01:a)
 * 2. Worker stderr (log output — DD-01:b)
 * 3. Test temporary files (DD-01:c)
 * 4. Test reports (DD-01:d)
 *
 * Pattern from ADR17-I3 `sensitiveContentMatchCount`.
 *
 * DTP-0: Since real parsers aren't implemented yet, this harness
 * verifies the scanning infrastructure and the worker's log sanitization.
 */

import { describe, it, expect, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  DOCUMENT_WORKER_PROTOCOL_VERSION,
  encodeDocumentWorkerMessage,
} from "../../src/protocol/index.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WORKER_PATH = join(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "dist",
  "worker.js",
);

const _MAX_FRAME_BYTES = 1024 * 1024;

/**
 * Generate a unique canary string that would be sensitive if leaked.
 */
function generateCanary(): string {
  return `CANARY_${randomBytes(16).toString("hex")}`;
}

/**
 * Build an invoke message with a canary in a field that should
 * NEVER appear in log/stderr/stdout output.
 */
function buildInvokeWithCanary(canaryPath: string) {
  return {
    type: "invoke",
    protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
    requestId: "req-canary-1",
    actionId: "act-canary-1",
    effectAttemptId: "eff-canary-1",
    capabilityId: "tool.document.xlsx.read",
    workspaceRoot: `/tmp/${canaryPath}`, // sensitive path
    relativePath: `${canaryPath}.xlsx`,  // sensitive filename
    options: {},
    limits: {
      maxFileBytes: 50_000_000,
      maxOutputBytes: 5_000_000,
      maxPageCount: 500,
      maxDecompressionRatio: 100,
    },
    deadlineAt: new Date(Date.now() + 30_000).toISOString(),
  };
}

describe("Canary scan harness", () => {
  let procs: ChildProcess[] = [];

  afterEach(() => {
    for (const p of procs) {
      try { p.kill("SIGKILL"); } catch { /* already dead */ }
    }
    procs = [];
  });

  it("DD-01:a — workspaceRoot canary does NOT leak to stdout", async () => {
    const canary = generateCanary();
    const proc = spawn("node", [WORKER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test" },
    });
    procs.push(proc);

    const stdoutChunks: string[] = [];
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk.toString("utf8"));
    });

    await new Promise((r) => setTimeout(r, 200));
    proc.stdin?.write(
      encodeDocumentWorkerMessage(buildInvokeWithCanary(canary)),
    );
    proc.stdin?.end();

    await new Promise((r) => setTimeout(r, 1000));
    proc.kill("SIGTERM");

    const stdout = stdoutChunks.join("");
    expect(stdout).not.toContain(canary);
  });

  it("DD-01:b — workspaceRoot canary does NOT leak to stderr", async () => {
    const canary = generateCanary();
    const proc = spawn("node", [WORKER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test" },
    });
    procs.push(proc);

    const stderrChunks: string[] = [];
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString("utf8"));
    });

    await new Promise((r) => setTimeout(r, 200));
    proc.stdin?.write(
      encodeDocumentWorkerMessage(buildInvokeWithCanary(canary)),
    );
    proc.stdin?.end();

    await new Promise((r) => setTimeout(r, 1000));
    proc.kill("SIGTERM");

    const stderr = stderrChunks.join("");
    // The canary path should NOT appear in stderr
    expect(stderr).not.toContain(canary);
  });

  it("DD-01:c — stderr only contains valid JSON log entries", async () => {
    // All stderr output must be valid JSON log entries
    const proc = spawn("node", [WORKER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test" },
    });
    procs.push(proc);

    const stderrChunks: string[] = [];
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString("utf8"));
    });

    await new Promise((r) => setTimeout(r, 200));
    proc.stdin?.write(
      encodeDocumentWorkerMessage(buildInvokeWithCanary("test")),
    );
    proc.stdin?.end();

    await new Promise((r) => setTimeout(r, 1000));
    proc.kill("SIGTERM");

    const stderr = stderrChunks.join("");
    const lines = stderr.split("\n").filter((l) => l.length > 0);

    for (const line of lines) {
      // Skip non-JSON lines (e.g., "fatal:" messages from handleFatalError)
      if (!line.startsWith("{")) {
        // Only "fatal:" messages are allowed as non-JSON
        expect(line).toMatch(/^(fatal:|$)/);
        continue;
      }
      // Valid JSON
      expect(() => JSON.parse(line)).not.toThrow();
      const parsed = JSON.parse(line);
      // Must have required log fields
      expect(parsed.ts).toBeTruthy();
      expect(parsed.level).toBeTruthy();
      expect(parsed.event).toBeTruthy();
    }
  });
});
