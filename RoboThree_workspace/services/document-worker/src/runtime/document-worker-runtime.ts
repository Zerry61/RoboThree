import {
  createErrorMessage,
  createResultMessage,
} from "../protocol/index.js";
import { computeErrorDigest } from "../common/index.js";
import {
  DocumentCapabilityHandlerError,
  UnsupportedDocumentCapabilityHandler,
} from "./document-capability-handler.js";

import type {
  DocumentWorkerErrorCode,
  DocumentWorkerInvokeMessage,
  DocumentWorkerProtocolMessage,
} from "../protocol/index.js";
import type {
  DocumentCapabilityHandler,
  DocumentCapabilityResult,
} from "./document-capability-handler.js";

export type DeadlineTimer = unknown;

export interface DeadlineScheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): DeadlineTimer;
  clearTimeout(timer: DeadlineTimer): void;
}

export type DocumentWorkerRuntimeSnapshot = Readonly<{
  active: boolean;
  pendingTimerCount: number;
  activeAttemptKey: string | null;
}>;

type Attempt = {
  readonly key: string;
  readonly invoke: DocumentWorkerInvokeMessage;
  readonly abortController: AbortController;
  timer: DeadlineTimer | null;
  terminalSent: boolean;
  requestedTerminal:
    | {
        code: DocumentWorkerErrorCode;
        message: string;
        digest?: string;
        detailCode?: string;
      }
    | null;
  resolve: (message: DocumentWorkerProtocolMessage) => void;
};

const REAL_DEADLINE_SCHEDULER: DeadlineScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export class DocumentWorkerRuntime {
  readonly #handler: DocumentCapabilityHandler;
  readonly #scheduler: DeadlineScheduler;
  #activeAttempt: Attempt | null = null;
  #pendingTimerCount = 0;

  public constructor(
    handler: DocumentCapabilityHandler = new UnsupportedDocumentCapabilityHandler(),
    scheduler: DeadlineScheduler = REAL_DEADLINE_SCHEDULER,
  ) {
    this.#handler = handler;
    this.#scheduler = scheduler;
  }

  public invoke(
    invoke: DocumentWorkerInvokeMessage,
  ): Promise<DocumentWorkerProtocolMessage> {
    if (this.#activeAttempt !== null) {
      return Promise.resolve(
        createErrorMessage(
          invoke.requestId,
          invoke.actionId,
          invoke.effectAttemptId,
          "worker_busy",
          "Document Worker is already processing another request",
          undefined,
          undefined,
          invoke.protocolVersion,
        ),
      );
    }

    const deadlineMs = Date.parse(invoke.deadlineAt) - this.#scheduler.now();
    if (deadlineMs <= 0) {
      return Promise.resolve(
        createErrorMessage(
          invoke.requestId,
          invoke.actionId,
          invoke.effectAttemptId,
          "timed_out",
          "Deadline already expired at invoke",
          undefined,
          undefined,
          invoke.protocolVersion,
        ),
      );
    }

    return new Promise((resolve) => {
      const attempt: Attempt = {
        key: attemptKey(invoke),
        invoke,
        abortController: new AbortController(),
        timer: null,
        terminalSent: false,
        requestedTerminal: null,
        resolve,
      };

      this.#activeAttempt = attempt;
      attempt.timer = this.#scheduler.setTimeout(() => {
        this.#requestTerminalError(
          attempt,
          "timed_out",
          "Processing exceeded the deadline",
        );
      }, deadlineMs);
      this.#pendingTimerCount += 1;

      void this.#handler.invoke({
        invoke,
        signal: attempt.abortController.signal,
      }).then(
        (result) => this.#finishWithResult(attempt, result),
        (error) => this.#finishWithThrown(attempt, error),
      );
    });
  }

  public cancelActiveAttempt(): boolean {
    const attempt = this.#activeAttempt;
    if (attempt === null) {
      return false;
    }
    return this.#requestTerminalError(
      attempt,
      "cancelled",
      "Processing was cancelled",
    );
  }

  public cleanup(): void {
    const attempt = this.#activeAttempt;
    if (attempt !== null) {
      attempt.abortController.abort();
      this.#clearAttemptTimer(attempt);
      this.#activeAttempt = null;
    }
  }

  public snapshot(): DocumentWorkerRuntimeSnapshot {
    return {
      active: this.#activeAttempt !== null,
      pendingTimerCount: this.#pendingTimerCount,
      activeAttemptKey: this.#activeAttempt?.key ?? null,
    };
  }

  #finishWithResult(
    attempt: Attempt,
    result: DocumentCapabilityResult,
  ): boolean {
    if (attempt.requestedTerminal !== null) {
      return this.#finishWithError(
        attempt,
        attempt.requestedTerminal.code,
        attempt.requestedTerminal.message,
        attempt.requestedTerminal.digest,
        attempt.requestedTerminal.detailCode,
      );
    }

    return this.#finish(
      attempt,
      createResultMessage(
        attempt.invoke.requestId,
        attempt.invoke.actionId,
        attempt.invoke.effectAttemptId,
        result.output,
        result.metadata,
        attempt.invoke.protocolVersion,
      ),
    );
  }

  #finishWithThrown(attempt: Attempt, error: unknown): boolean {
    if (attempt.requestedTerminal !== null) {
      return this.#finishWithError(
        attempt,
        attempt.requestedTerminal.code,
        attempt.requestedTerminal.message,
        attempt.requestedTerminal.digest,
        attempt.requestedTerminal.detailCode,
      );
    }

    if (error instanceof DocumentCapabilityHandlerError) {
      return this.#finishWithError(
        attempt,
        error.code,
        error.message,
        error.digest,
        error.detailCode,
      );
    }

    const message = error instanceof Error ? error.message : "Unknown internal error";
    return this.#finishWithError(
      attempt,
      "internal_failure",
      "An unexpected error occurred",
      computeErrorDigest("internal_failure", message),
    );
  }

  #requestTerminalError(
    attempt: Attempt,
    code: DocumentWorkerErrorCode,
    message: string,
    digest?: string,
    detailCode?: string,
  ): boolean {
    if (this.#activeAttempt !== attempt || attempt.terminalSent) {
      return false;
    }
    if (attempt.requestedTerminal !== null) {
      return true;
    }

    attempt.requestedTerminal =
      digest === undefined && detailCode === undefined
        ? { code, message }
        : {
            code,
            message,
            ...(digest === undefined ? {} : { digest }),
            ...(detailCode === undefined ? {} : { detailCode }),
          };
    attempt.abortController.abort();
    this.#clearAttemptTimer(attempt);
    return true;
  }

  #finishWithError(
    attempt: Attempt,
    code: DocumentWorkerErrorCode,
    message: string,
    digest?: string,
    detailCode?: string,
  ): boolean {
    return this.#finish(
      attempt,
      createErrorMessage(
        attempt.invoke.requestId,
        attempt.invoke.actionId,
        attempt.invoke.effectAttemptId,
        code,
        message,
        digest,
        detailCode,
        attempt.invoke.protocolVersion,
      ),
    );
  }

  #finish(attempt: Attempt, message: DocumentWorkerProtocolMessage): boolean {
    if (this.#activeAttempt !== attempt || attempt.terminalSent) {
      return false;
    }

    attempt.terminalSent = true;
    this.#clearAttemptTimer(attempt);
    this.#activeAttempt = null;
    attempt.resolve(message);
    return true;
  }

  #clearAttemptTimer(attempt: Attempt): void {
    if (attempt.timer !== null) {
      this.#scheduler.clearTimeout(attempt.timer);
      attempt.timer = null;
      this.#pendingTimerCount -= 1;
    }
  }
}

function attemptKey(invoke: DocumentWorkerInvokeMessage): string {
  return `${invoke.requestId}:${invoke.actionId}:${invoke.effectAttemptId}`;
}
