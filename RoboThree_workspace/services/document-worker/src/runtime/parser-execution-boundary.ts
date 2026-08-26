import { Worker } from "node:worker_threads";

import { computeErrorDigest } from "../common/index.js";
import { DocumentCapabilityHandlerError } from "./document-capability-handler.js";

import type { WorkerOptions } from "node:worker_threads";
import type { StandaloneDocumentBytes } from "../source/index.js";
import type {
  DocumentWorkerLimits,
  DocumentWorkerErrorCode,
  DocumentWorkerResultMetadata,
} from "../protocol/index.js";
import type { DocumentCapabilityResult } from "./document-capability-handler.js";

export type ParserExecutionBoundarySnapshot = Readonly<{
  activeExecutionCount: number;
  pendingListenerCount: number;
  spawnedExecutionCount: number;
  terminatedExecutionCount: number;
  lateMessageCount: number;
  wrongAttemptMessageCount: number;
  malformedMessageCount: number;
}>;

export type ParserExecutionRequest = Readonly<{
  attemptKey: string;
  capabilityId: string;
  options: Record<string, unknown>;
  limits: DocumentWorkerLimits;
  extension: string;
  bytes: StandaloneDocumentBytes;
  signal: AbortSignal;
}>;

export interface ParserExecutionBoundaryLike {
  execute(request: ParserExecutionRequest): Promise<DocumentCapabilityResult>;
  snapshot?(): ParserExecutionBoundarySnapshot;
}

export type ParserWorkerHandle = {
  threadId?: number;
  on(event: "message", listener: (message: unknown) => void): ParserWorkerHandle;
  on(event: "error", listener: (error: Error) => void): ParserWorkerHandle;
  on(event: "exit", listener: (code: number) => void): ParserWorkerHandle;
  off(event: "message", listener: (message: unknown) => void): ParserWorkerHandle;
  off(event: "error", listener: (error: Error) => void): ParserWorkerHandle;
  off(event: "exit", listener: (code: number) => void): ParserWorkerHandle;
  terminate(): Promise<number>;
};

export type ParserWorkerFactory = (
  workerData: ParserWorkerData,
  transferList: readonly ArrayBuffer[],
  workerOptions: WorkerOptions,
) => ParserWorkerHandle;

type ParserWorkerData = Readonly<{
  attemptKey: string;
  capabilityId: string;
  options: Record<string, unknown>;
  limits: DocumentWorkerLimits;
  extension: string;
  bytes: Uint8Array;
  byteLength: number;
}>;

type ParserWorkerTerminal =
  | Readonly<{
      type: "result";
      attemptKey: string;
      result: {
        output: unknown;
        metadata: DocumentWorkerResultMetadata;
      };
    }>
  | Readonly<{
      type: "error";
      attemptKey: string;
      error: {
        code: DocumentWorkerErrorCode;
        message: string;
        digest?: string;
        detailCode?: string;
      };
    }>;

const DEFAULT_RESOURCE_LIMITS: WorkerOptions["resourceLimits"] = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  stackSizeMb: 4,
};

const DEFAULT_WORKER_URL = new URL("./parser-worker-bootstrap.js", import.meta.url);

export class ParserExecutionBoundary implements ParserExecutionBoundaryLike {
  readonly #workerFactory: ParserWorkerFactory;
  readonly #resourceLimits: WorkerOptions["resourceLimits"];
  #activeExecutionCount = 0;
  #pendingListenerCount = 0;
  #spawnedExecutionCount = 0;
  #terminatedExecutionCount = 0;
  #lateMessageCount = 0;
  #wrongAttemptMessageCount = 0;
  #malformedMessageCount = 0;

  public constructor(options: {
    workerFactory?: ParserWorkerFactory;
    resourceLimits?: WorkerOptions["resourceLimits"];
  } = {}) {
    this.#workerFactory = options.workerFactory ?? defaultWorkerFactory;
    this.#resourceLimits = options.resourceLimits ?? DEFAULT_RESOURCE_LIMITS;
  }

  public execute(
    request: ParserExecutionRequest,
  ): Promise<DocumentCapabilityResult> {
    if (request.signal.aborted) {
      return Promise.reject(
        new DocumentCapabilityHandlerError(
          "cancelled",
          "Parser execution was cancelled before start",
        ),
      );
    }

    const bytes = request.bytes.bytes;
    const workerData: ParserWorkerData = {
      attemptKey: request.attemptKey,
      capabilityId: request.capabilityId,
      options: request.options,
      limits: request.limits,
      extension: request.extension,
      bytes,
      byteLength: request.bytes.byteLength,
    };
    const worker = this.#workerFactory(
      workerData,
      request.bytes.transferList,
      {
        resourceLimits: this.#resourceLimits,
      },
    );

    this.#activeExecutionCount += 1;
    this.#spawnedExecutionCount += 1;
    this.#pendingListenerCount += 4;

    return new Promise((resolve, reject) => {
      let settled = false;
      let terminating = false;

      const settleResolve = (result: DocumentCapabilityResult): void => {
        settle(() => resolve(result));
      };
      const settleReject = (error: DocumentCapabilityHandlerError): void => {
        settle(() => reject(error));
      };
      const settle = (complete: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        complete();
      };

      const onMessage = (message: unknown): void => {
        if (settled) {
          this.#lateMessageCount += 1;
          return;
        }
        const terminal = parseParserWorkerTerminal(message);
        if (terminal === null) {
          this.#malformedMessageCount += 1;
          settleReject(internalFailure("Parser worker sent malformed message"));
          return;
        }
        if (terminal.attemptKey !== request.attemptKey) {
          this.#wrongAttemptMessageCount += 1;
          return;
        }
        if (terminal.type === "result") {
          settleResolve(terminal.result);
          return;
        }
        settleReject(
          new DocumentCapabilityHandlerError(
            terminal.error.code,
            terminal.error.message,
            terminal.error.digest,
            terminal.error.detailCode,
          ),
        );
      };

      const onError = (error: Error): void => {
        if (settled) {
          return;
        }
        settleReject(
          internalFailure(
            `Parser worker failed: ${error.message}`,
          ),
        );
      };

      const onExit = (code: number): void => {
        if (settled) {
          return;
        }
        if (terminating) {
          settleReject(
            new DocumentCapabilityHandlerError(
              "cancelled",
              "Parser execution was cancelled",
            ),
          );
          return;
        }
        settleReject(
          internalFailure(
            code === 0
              ? "Parser worker exited before terminal message"
              : "Parser worker crashed",
          ),
        );
      };

      const onAbort = (): void => {
        if (settled || terminating) {
          return;
        }
        terminating = true;
        this.#terminatedExecutionCount += 1;
        void worker.terminate().then(
          () => {
            if (!settled) {
              settleReject(
                new DocumentCapabilityHandlerError(
                  "cancelled",
                  "Parser execution was cancelled",
                ),
              );
            }
          },
          (error: unknown) => {
            if (!settled) {
              const message = error instanceof Error ? error.message : "unknown";
              settleReject(
                internalFailure(`Parser worker termination failed: ${message}`),
              );
            }
          },
        );
      };

      const cleanup = (): void => {
        worker.off("message", onMessage);
        worker.off("error", onError);
        worker.off("exit", onExit);
        request.signal.removeEventListener("abort", onAbort);
        this.#activeExecutionCount -= 1;
        this.#pendingListenerCount -= 4;
      };

      worker.on("message", onMessage);
      worker.on("error", onError);
      worker.on("exit", onExit);
      request.signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  public snapshot(): ParserExecutionBoundarySnapshot {
    return {
      activeExecutionCount: this.#activeExecutionCount,
      pendingListenerCount: this.#pendingListenerCount,
      spawnedExecutionCount: this.#spawnedExecutionCount,
      terminatedExecutionCount: this.#terminatedExecutionCount,
      lateMessageCount: this.#lateMessageCount,
      wrongAttemptMessageCount: this.#wrongAttemptMessageCount,
      malformedMessageCount: this.#malformedMessageCount,
    };
  }
}

function defaultWorkerFactory(
  workerData: ParserWorkerData,
  transferList: readonly ArrayBuffer[],
  workerOptions: WorkerOptions,
): ParserWorkerHandle {
  return new Worker(DEFAULT_WORKER_URL, {
    execArgv: [],
    ...workerOptions,
    workerData,
    transferList: [...transferList],
  });
}

function parseParserWorkerTerminal(
  message: unknown,
): ParserWorkerTerminal | null {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return null;
  }
  const obj = message as Record<string, unknown>;
  if (
    typeof obj.type !== "string" ||
    typeof obj.attemptKey !== "string" ||
    obj.attemptKey.length === 0
  ) {
    return null;
  }
  if (obj.type === "result") {
    if (!isResultPayload(obj.result)) {
      return null;
    }
    return {
      type: "result",
      attemptKey: obj.attemptKey,
      result: obj.result,
    };
  }
  if (obj.type === "error") {
    if (!isErrorPayload(obj.error)) {
      return null;
    }
    return {
      type: "error",
      attemptKey: obj.attemptKey,
      error: obj.error,
    };
  }
  return null;
}

function isResultPayload(value: unknown): value is DocumentCapabilityResult {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "output" in value &&
    "metadata" in value &&
    isResultMetadata((value as { metadata?: unknown }).metadata)
  );
}

function isResultMetadata(value: unknown): value is DocumentWorkerResultMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.originalCount === "number" &&
    Number.isSafeInteger(obj.originalCount) &&
    typeof obj.returnedCount === "number" &&
    Number.isSafeInteger(obj.returnedCount) &&
    typeof obj.truncated === "boolean" &&
    typeof obj.resultDigest === "string" &&
    typeof obj.timingMs === "number" &&
    Number.isSafeInteger(obj.timingMs)
  );
}

function isErrorPayload(value: unknown): value is {
  code: DocumentWorkerErrorCode;
  message: string;
  digest?: string;
  detailCode?: string;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    isDocumentWorkerErrorCode(obj.code) &&
    typeof obj.message === "string" &&
    (obj.digest === undefined || typeof obj.digest === "string") &&
    (obj.detailCode === undefined || typeof obj.detailCode === "string")
  );
}

function isDocumentWorkerErrorCode(
  value: unknown,
): value is DocumentWorkerErrorCode {
  return (
    value === "invalid_format" ||
    value === "encrypted" ||
    value === "corrupt" ||
    value === "limit_exceeded" ||
    value === "unsupported_feature" ||
    value === "worker_busy" ||
    value === "cancelled" ||
    value === "timed_out" ||
    value === "internal_failure"
  );
}

function internalFailure(message: string): DocumentCapabilityHandlerError {
  return new DocumentCapabilityHandlerError(
    "internal_failure",
    "An unexpected error occurred",
    computeErrorDigest("internal_failure", message),
  );
}
