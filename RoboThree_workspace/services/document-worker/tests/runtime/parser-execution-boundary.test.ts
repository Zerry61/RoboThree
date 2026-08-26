import { EventEmitter } from "node:events";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ParserExecutionBoundary,
} from "../../src/index.js";

import type {
  DocumentCapabilityHandlerError,
  DocumentCapabilityResult,
  ParserExecutionRequest,
  ParserWorkerFactory,
  ParserWorkerHandle,
} from "../../src/index.js";

const DIST_BOOTSTRAP = join(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "dist",
  "runtime",
  "parser-worker-bootstrap.js",
);

function standaloneBytes(input = "hello"): {
  bytes: Uint8Array;
  byteLength: number;
  transferList: [ArrayBuffer];
} {
  const source = Buffer.from(input);
  const arrayBuffer = new ArrayBuffer(source.byteLength);
  const bytes = new Uint8Array(arrayBuffer);
  bytes.set(source);
  return {
    bytes,
    byteLength: bytes.byteLength,
    transferList: [arrayBuffer],
  };
}

function parserRequest(
  overrides: Partial<ParserExecutionRequest> = {},
): ParserExecutionRequest {
  return {
    attemptKey: "req:act:eff",
    capabilityId: "tool.document.pdf.extract_text",
    options: {},
    limits: {
      maxFileBytes: 1024 * 1024,
      maxOutputBytes: 1024 * 1024,
      maxPageCount: 10,
      maxDecompressionRatio: 100,
    },
    extension: "pdf",
    bytes: standaloneBytes(),
    signal: new AbortController().signal,
    ...overrides,
  };
}

function result(label: string): DocumentCapabilityResult {
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

class FakeParserWorker extends EventEmitter implements ParserWorkerHandle {
  public terminated = false;
  public readonly workerData: unknown;
  public readonly transferList: readonly ArrayBuffer[];

  public constructor(workerData: unknown, transferList: readonly ArrayBuffer[]) {
    super();
    this.workerData = workerData;
    this.transferList = transferList;
  }

  public terminate(): Promise<number> {
    this.terminated = true;
    return new Promise((resolve) => {
      setImmediate(() => {
        this.emit("exit", 1);
        resolve(1);
      });
    });
  }
}

function boundaryWithFake(): {
  boundary: ParserExecutionBoundary;
  workers: FakeParserWorker[];
} {
  const workers: FakeParserWorker[] = [];
  const factory: ParserWorkerFactory = (workerData, transferList) => {
    const worker = new FakeParserWorker(workerData, transferList);
    workers.push(worker);
    return worker;
  };
  return {
    boundary: new ParserExecutionBoundary({ workerFactory: factory }),
    workers,
  };
}

describe("ParserExecutionBoundary", () => {
  it("returns parser results and releases listeners", async () => {
    const { boundary, workers } = boundaryWithFake();
    const terminal = boundary.execute(parserRequest());

    workers[0]!.emit("message", {
      type: "result",
      attemptKey: "req:act:eff",
      result: result("ok"),
    });

    await expect(terminal).resolves.toEqual(result("ok"));
    expect(boundary.snapshot()).toMatchObject({
      activeExecutionCount: 0,
      pendingListenerCount: 0,
      spawnedExecutionCount: 1,
    });
  });

  it("terminates and awaits worker exit on cancellation", async () => {
    const { boundary, workers } = boundaryWithFake();
    const controller = new AbortController();
    const terminal = boundary.execute(parserRequest({ signal: controller.signal }));

    controller.abort();

    await expect(terminal).rejects.toMatchObject({
      code: "cancelled",
    });
    expect(workers[0]!.terminated).toBe(true);
    expect(boundary.snapshot()).toMatchObject({
      activeExecutionCount: 0,
      pendingListenerCount: 0,
      terminatedExecutionCount: 1,
    });
  });

  it("rejects parser crashes, malformed messages, and wrong-attempt-only exits", async () => {
    const malformed = boundaryWithFake();
    const malformedPromise = malformed.boundary.execute(parserRequest());
    malformed.workers[0]!.emit("message", { type: "result" });
    await expect(malformedPromise).rejects.toMatchObject({
      code: "internal_failure",
    });
    expect(malformed.boundary.snapshot().malformedMessageCount).toBe(1);

    const wrongAttempt = boundaryWithFake();
    const wrongAttemptPromise = wrongAttempt.boundary.execute(parserRequest());
    wrongAttempt.workers[0]!.emit("message", {
      type: "result",
      attemptKey: "other:act:eff",
      result: result("wrong"),
    });
    wrongAttempt.workers[0]!.emit("exit", 0);
    await expect(wrongAttemptPromise).rejects.toMatchObject({
      code: "internal_failure",
    });
    expect(wrongAttempt.boundary.snapshot().wrongAttemptMessageCount).toBe(1);

    const crash = boundaryWithFake();
    const crashPromise = crash.boundary.execute(parserRequest());
    crash.workers[0]!.emit("exit", 9);
    await expect(crashPromise).rejects.toMatchObject({
      code: "internal_failure",
    });
  });

  it("transfers standalone bytes to the real parser worker", async () => {
    const realWorkerFactory: ParserWorkerFactory = (
      workerData,
      transferList,
      workerOptions,
    ) => new Worker(DIST_BOOTSTRAP, {
      execArgv: [],
      ...workerOptions,
      workerData,
      transferList: [...transferList],
    });
    const boundary = new ParserExecutionBoundary({
      workerFactory: realWorkerFactory,
    });
    const bytes = standaloneBytes("%PDF");
    const promise = boundary.execute(parserRequest({ bytes }));

    expect(bytes.bytes.byteLength).toBe(0);
    await expect(promise).rejects.toMatchObject({
      code: "invalid_format",
    });
    expect(boundary.snapshot()).toMatchObject({
      activeExecutionCount: 0,
      pendingListenerCount: 0,
      spawnedExecutionCount: 1,
    });
  });

  it("keeps listener and execution counters bounded after 1000 parser executions", async () => {
    const { boundary, workers } = boundaryWithFake();
    for (let index = 0; index < 1000; index += 1) {
      const terminal = boundary.execute(parserRequest({
        attemptKey: `req-${index}:act:eff`,
        bytes: standaloneBytes(String(index)),
      }));
      workers[index]!.emit("message", {
        type: "result",
        attemptKey: `req-${index}:act:eff`,
        result: result(String(index)),
      });
      await expect(terminal).resolves.toEqual(result(String(index)));
      expect(boundary.snapshot().activeExecutionCount).toBe(0);
      expect(boundary.snapshot().pendingListenerCount).toBe(0);
    }
    expect(boundary.snapshot().spawnedExecutionCount).toBe(1000);
  });

  it("surfaces typed parser errors without allowing parser terminal ownership", async () => {
    const { boundary, workers } = boundaryWithFake();
    const terminal = boundary.execute(parserRequest());

    workers[0]!.emit("message", {
      type: "error",
      attemptKey: "req:act:eff",
      error: {
        code: "corrupt",
        message: "Parser rejected malformed fixture",
        digest: "sha256:fixture",
      },
    });

    await expect(terminal).rejects.toMatchObject({
      code: "corrupt",
      digest: "sha256:fixture",
    } satisfies Partial<DocumentCapabilityHandlerError>);
  });
});
