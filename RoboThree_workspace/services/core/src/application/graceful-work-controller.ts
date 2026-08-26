import type { RuntimeError } from "@robothree/contracts";

import type {
  GracefulShutdownController,
  GracefulShutdownReport,
} from "../ports/graceful-shutdown.js";
import type { Scheduler } from "../ports/scheduler.js";

export const DEFAULT_GRACEFUL_STOP_TIMEOUT_MS = 5_000;
export const DEFAULT_MAX_TRACKED_ACTIVE_WORK = 24;

type ActiveWork = {
  controller: AbortController;
  settled: Promise<void>;
};

export class WorkNotAcceptedError extends Error {
  public readonly runtimeError: RuntimeError;

  public constructor(runtimeError: RuntimeError) {
    super(runtimeError.message);
    this.name = "WorkNotAcceptedError";
    this.runtimeError = runtimeError;
  }
}

export class GracefulWorkController implements GracefulShutdownController {
  readonly #scheduler: Scheduler;
  readonly #maxActive: number;
  readonly #active = new Map<string, ActiveWork>();
  #accepting = false;
  #shutdownPromise: Promise<GracefulShutdownReport> | undefined;

  public constructor(input: {
    scheduler: Scheduler;
    maxActive?: number;
  }) {
    this.#scheduler = input.scheduler;
    this.#maxActive = positiveInteger(
      input.maxActive ?? DEFAULT_MAX_TRACKED_ACTIVE_WORK,
      "maxActive",
    );
  }

  public startAccepting(): void {
    if (this.#active.size > 0) {
      throw new Error("cannot restart graceful work controller while work is still active");
    }
    this.#shutdownPromise = undefined;
    this.#accepting = true;
  }

  public run<T>(
    workId: string,
    operation: (signal: AbortSignal) => Promise<T>,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    if (workId.length === 0) {
      throw notAccepted("runtime.invalid_work_id", "workId cannot be empty", "validation");
    }
    if (!this.#accepting) {
      throw notAccepted("runtime.stopping", "Core is not accepting new work", "cancelled");
    }
    if (this.#active.has(workId)) {
      throw notAccepted("runtime.duplicate_work", "workId is already active", "validation");
    }
    if (this.#active.size >= this.#maxActive) {
      throw notAccepted("runtime.active_work_full", "active work tracking is full", "internal", true);
    }

    const controller = new AbortController();
    const abortFromExternal = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted === true) {
      abortFromExternal();
    } else {
      externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
    }

    const operationPromise = Promise.resolve().then(() => operation(controller.signal));
    const tracked = operationPromise.finally(() => {
      externalSignal?.removeEventListener("abort", abortFromExternal);
      this.#active.delete(workId);
    });
    const settled = tracked.then(
      () => undefined,
      () => undefined,
    );
    this.#active.set(workId, { controller, settled });
    return tracked;
  }

  public beginShutdown(timeoutMs: number): Promise<GracefulShutdownReport> {
    requireNonNegativeFinite(timeoutMs, "timeoutMs");
    if (this.#shutdownPromise !== undefined) {
      return this.#shutdownPromise;
    }
    this.#accepting = false;
    const snapshot = [...this.#active.entries()];
    for (const [, active] of snapshot) {
      active.controller.abort(new Error("Core graceful shutdown"));
    }
    this.#shutdownPromise = this.#waitForActive(snapshot, timeoutMs);
    return this.#shutdownPromise;
  }

  public stats(): Readonly<{
    accepting: boolean;
    active: number;
    activeWorkIds: readonly string[];
    maxActive: number;
  }> {
    return Object.freeze({
      accepting: this.#accepting,
      active: this.#active.size,
      activeWorkIds: Object.freeze([...this.#active.keys()]),
      maxActive: this.#maxActive,
    });
  }

  async #waitForActive(
    snapshot: readonly (readonly [string, ActiveWork])[],
    timeoutMs: number,
  ): Promise<GracefulShutdownReport> {
    if (snapshot.length === 0) {
      return Object.freeze({
        activeAtStart: 0,
        completedBeforeDeadline: 0,
        timedOutWorkIds: Object.freeze([]),
      });
    }
    let deadlineReached = false;
    let resolveDeadline: (() => void) | undefined;
    const deadline = new Promise<void>((resolve) => {
      resolveDeadline = resolve;
    });
    const scheduled = this.#scheduler.schedule(timeoutMs, () => {
      deadlineReached = true;
      resolveDeadline?.();
    });
    const allSettled = Promise.all(snapshot.map(([, active]) => active.settled));
    await Promise.race([allSettled, deadline]);
    if (!deadlineReached) {
      scheduled.cancel();
    }
    const timedOutWorkIds = deadlineReached
      ? snapshot
        .map(([workId]) => workId)
        .filter((workId) => this.#active.has(workId))
      : [];
    return Object.freeze({
      activeAtStart: snapshot.length,
      completedBeforeDeadline: snapshot.length - timedOutWorkIds.length,
      timedOutWorkIds: Object.freeze(timedOutWorkIds),
    });
  }
}

function notAccepted(
  code: string,
  message: string,
  category: RuntimeError["category"],
  retryable = false,
): WorkNotAcceptedError {
  return new WorkNotAcceptedError({ code, message, category, retryable });
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function requireNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
}
