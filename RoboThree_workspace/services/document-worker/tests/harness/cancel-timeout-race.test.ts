import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import {
  DOCUMENT_WORKER_PROTOCOL_VERSION,
  DocumentWorkerRuntime,
  NdjsonFrameDecoder,
  encodeDocumentWorkerMessage,
  parseDocumentWorkerReady,
} from "../../src/index.js";
import {
  ControlledDeadlineScheduler,
  ControlledDocumentHandler,
} from "../fakes/controlled-document-handler.js";

import type {
  DocumentCapabilityResult,
  DocumentWorkerInvokeMessage,
  DocumentWorkerProtocolMessage,
} from "../../src/index.js";

const WORKER_PATH = join(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "dist",
  "worker.js",
);

const MAX_FRAME_BYTES = 1024 * 1024;
const BASE_TIME = Date.parse("2026-08-03T00:00:00.000Z");

function uid(): string {
  return randomBytes(8).toString("hex");
}

function buildInvoke(
  overrides: Partial<DocumentWorkerInvokeMessage> = {},
): DocumentWorkerInvokeMessage {
  return {
    type: "invoke",
    protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
    requestId: overrides.requestId ?? `req-${uid()}`,
    actionId: overrides.actionId ?? `act-${uid()}`,
    effectAttemptId: overrides.effectAttemptId ?? `eff-${uid()}`,
    capabilityId: overrides.capabilityId ?? "tool.document.xlsx.read",
    workspaceRoot: overrides.workspaceRoot ?? "/tmp/test-workspace",
    relativePath: overrides.relativePath ?? "test.xlsx",
    options: overrides.options ?? {},
    limits: overrides.limits ?? {
      maxFileBytes: 50_000_000,
      maxOutputBytes: 5_000_000,
      maxPageCount: 500,
      maxDecompressionRatio: 100,
    },
    deadlineAt: overrides.deadlineAt ?? new Date(Math.max(BASE_TIME, Date.now()) + 60_000).toISOString(),
  };
}

function successfulResult(label: string): DocumentCapabilityResult {
  return {
    output: { label },
    metadata: {
      originalCount: 1,
      returnedCount: 1,
      truncated: false,
      resultDigest: `sha256:${label}`,
      timingMs: 0,
    },
  };
}

function errorCode(message: DocumentWorkerProtocolMessage): string {
  expect(message.type).toBe("error");
  return message.type === "error" ? message.error.code : "not-error";
}

describe("DocumentWorkerRuntime deterministic terminal handling", () => {
  it("completion-first resolves result and releases timer state", async () => {
    const handler = new ControlledDocumentHandler();
    const scheduler = new ControlledDeadlineScheduler(BASE_TIME);
    const runtime = new DocumentWorkerRuntime(handler, scheduler);
    const completion = handler.enqueue();

    const terminalPromise = runtime.invoke(buildInvoke({ requestId: "req-complete" }));
    completion.resolve(successfulResult("complete"));
    const terminal = await terminalPromise;

    expect(terminal.type).toBe("result");
    expect(runtime.snapshot()).toEqual({
      active: false,
      pendingTimerCount: 0,
      activeAttemptKey: null,
    });
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("cancel-first emits exactly one cancelled terminal and aborts the active handler", async () => {
    const handler = new ControlledDocumentHandler();
    const scheduler = new ControlledDeadlineScheduler(BASE_TIME);
    const runtime = new DocumentWorkerRuntime(handler, scheduler);
    const completion = handler.enqueue();

    const terminalPromise = runtime.invoke(buildInvoke({ requestId: "req-cancel" }));
    expect(runtime.cancelActiveAttempt()).toBe(true);
    completion.resolve(successfulResult("late"));
    const terminal = await terminalPromise;

    expect(errorCode(terminal)).toBe("cancelled");
    expect(handler.requests[0]!.signal.aborted).toBe(true);
    expect(runtime.snapshot().pendingTimerCount).toBe(0);
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("deadline-first emits exactly one timed_out terminal and ignores late completion", async () => {
    const handler = new ControlledDocumentHandler();
    const scheduler = new ControlledDeadlineScheduler(BASE_TIME);
    const runtime = new DocumentWorkerRuntime(handler, scheduler);
    const completion = handler.enqueue();

    const terminalPromise = runtime.invoke(buildInvoke({ requestId: "req-timeout" }));
    scheduler.triggerNext();
    completion.resolve(successfulResult("late"));
    const terminal = await terminalPromise;

    expect(errorCode(terminal)).toBe("timed_out");
    expect(handler.requests[0]!.signal.aborted).toBe(true);
    expect(runtime.snapshot().active).toBe(false);
    expect(runtime.snapshot().pendingTimerCount).toBe(0);
  });

  it("expired deadline fails closed before handler ownership", async () => {
    const handler = new ControlledDocumentHandler();
    const scheduler = new ControlledDeadlineScheduler(BASE_TIME);
    const runtime = new DocumentWorkerRuntime(handler, scheduler);

    const terminal = await runtime.invoke(buildInvoke({
      requestId: "req-expired",
      deadlineAt: new Date(BASE_TIME - 1).toISOString(),
    }));

    expect(errorCode(terminal)).toBe("timed_out");
    expect(handler.requests).toHaveLength(0);
    expect(runtime.snapshot().active).toBe(false);
  });

  it("second invoke returns worker_busy using its own attempt identifiers", async () => {
    const handler = new ControlledDocumentHandler();
    const scheduler = new ControlledDeadlineScheduler(BASE_TIME);
    const runtime = new DocumentWorkerRuntime(handler, scheduler);
    const firstCompletion = handler.enqueue();

    const firstPromise = runtime.invoke(buildInvoke({
      requestId: "req-first",
      actionId: "act-first",
      effectAttemptId: "eff-first",
    }));
    const busy = await runtime.invoke(buildInvoke({
      requestId: "req-second",
      actionId: "act-second",
      effectAttemptId: "eff-second",
    }));

    expect(busy).toMatchObject({
      type: "error",
      requestId: "req-second",
      actionId: "act-second",
      effectAttemptId: "eff-second",
    });
    expect(errorCode(busy)).toBe("worker_busy");
    expect(runtime.snapshot().activeAttemptKey).toBe("req-first:act-first:eff-first");

    firstCompletion.resolve(successfulResult("first"));
    expect((await firstPromise).type).toBe("result");
    expect(handler.requests).toHaveLength(1);
  });

  it("late callback from an old attempt cannot pollute the next attempt", async () => {
    const handler = new ControlledDocumentHandler();
    const scheduler = new ControlledDeadlineScheduler(BASE_TIME);
    const runtime = new DocumentWorkerRuntime(handler, scheduler);
    const firstCompletion = handler.enqueue();
    const secondCompletion = handler.enqueue();

    const firstPromise = runtime.invoke(buildInvoke({ requestId: "req-old" }));
    scheduler.triggerNext();
    firstCompletion.resolve(successfulResult("late-old"));
    expect(errorCode(await firstPromise)).toBe("timed_out");

    const secondPromise = runtime.invoke(buildInvoke({ requestId: "req-new" }));
    secondCompletion.resolve(successfulResult("new"));
    const secondTerminal = await secondPromise;

    expect(secondTerminal).toMatchObject({
      type: "result",
      requestId: "req-new",
    });
    expect(runtime.snapshot()).toEqual({
      active: false,
      pendingTimerCount: 0,
      activeAttemptKey: null,
    });
  });

  it("1000 sequential runtime requests return terminal and bounded state every round", async () => {
    const handler = new ControlledDocumentHandler();
    const scheduler = new ControlledDeadlineScheduler(BASE_TIME);
    const runtime = new DocumentWorkerRuntime(handler, scheduler);

    for (let index = 0; index < 1000; index += 1) {
      const terminal = await runtime.invoke(buildInvoke({ requestId: `req-seq-${index}` }));
      expect(terminal.type).toBe("result");
      expect(runtime.snapshot()).toEqual({
        active: false,
        pendingTimerCount: 0,
        activeAttemptKey: null,
      });
      expect(scheduler.pendingCount()).toBe(0);
    }
    expect(handler.requests).toHaveLength(1000);
  });
});

describe("Document Worker process lifecycle", () => {
  it("worker sends ready and invalid_format for malformed XLSX invoke", async () => {
    const root = mkdtempSync(join(tmpdir(), "dw-process-"));
    try {
      writeFileSync(join(root, "test.xlsx"), Buffer.from("foundation"));
      const result = await runWorker([
        buildInvoke({
          requestId: "req-process",
          workspaceRoot: root,
          relativePath: "test.xlsx",
        }),
      ]);

      expect(result.ready).not.toBeNull();
      expect(parseDocumentWorkerReady(result.ready!).type).toBe("ready");
      expect(result.errorFrames).toEqual([
        { requestId: "req-process", code: "invalid_format" },
      ]);
      expect(result.exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("SIGTERM stops process without sending typed cancelled frame", async () => {
    const proc = spawn("node", [WORKER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test" },
    });
    const decoder = new NdjsonFrameDecoder(MAX_FRAME_BYTES);
    const frames: string[] = [];
    const pid = proc.pid!;

    proc.stdout?.on("data", (chunk: Buffer) => {
      for (const frame of decoder.push(chunk)) {
        frames.push(frame);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    proc.kill("SIGTERM");

    await Promise.race([
      new Promise((resolve) => proc.on("close", resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("worker did not exit")), 5000)),
    ]);

    expect(pidExists(pid)).toBe(false);
    const cancelledFrames = frames.filter((frame) => {
      const parsed = JSON.parse(frame) as Record<string, unknown>;
      return (
        parsed["type"] === "error" &&
        (parsed["error"] as Record<string, unknown>)["code"] === "cancelled"
      );
    });
    expect(cancelledFrames).toHaveLength(0);
  });
});

type WorkerRunResult = {
  ready: string | null;
  errorFrames: Array<{ requestId: string; code: string }>;
  exitCode: number | null;
};

function runWorker(invokes: DocumentWorkerInvokeMessage[]): Promise<WorkerRunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [WORKER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test" },
    });
    const decoder = new NdjsonFrameDecoder(MAX_FRAME_BYTES);
    const result: WorkerRunResult = {
      ready: null,
      errorFrames: [],
      exitCode: null,
    };
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("worker timed out"));
    }, 5000);

    proc.stdout?.on("data", (chunk: Buffer) => {
      for (const frame of decoder.push(chunk)) {
        const parsed = JSON.parse(frame) as Record<string, unknown>;
        if (parsed["type"] === "ready") {
          result.ready = frame;
          for (const invoke of invokes) {
            proc.stdin?.write(encodeDocumentWorkerMessage(invoke));
          }
          proc.stdin?.end();
        } else if (parsed["type"] === "error") {
          result.errorFrames.push({
            requestId: parsed["requestId"] as string,
            code: (parsed["error"] as Record<string, unknown>)["code"] as string,
          });
        }
      }
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      result.exitCode = code;
      resolve(result);
    });
    proc.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function pidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return !(
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ESRCH"
    );
  }
}
