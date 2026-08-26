import type { RuntimeError } from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type { RandomSource } from "../ports/random-source.js";
import type { Scheduler } from "../ports/scheduler.js";
import { emitReliabilityEvent } from "./reliability-events.js";
import type { ReliabilityObserver } from "./reliability-events.js";
import type { RetryPolicy } from "./retry-policy.js";

export type RetryableOperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RuntimeError; retryAfterMs?: number };

export class RetryCoordinator {
  readonly #policy: RetryPolicy;
  readonly #clock: Clock;
  readonly #random: RandomSource;
  readonly #scheduler: Scheduler;
  readonly #observer: ReliabilityObserver | undefined;

  public constructor(input: {
    policy: RetryPolicy;
    clock: Clock;
    random: RandomSource;
    scheduler: Scheduler;
    observer?: ReliabilityObserver;
  }) {
    this.#policy = input.policy;
    this.#clock = input.clock;
    this.#random = input.random;
    this.#scheduler = input.scheduler;
    this.#observer = input.observer;
  }

  public async execute<T>(input: {
    operationName: string;
    safety: "pre_effect" | "idempotent_non_effect" | "outbox_publish";
    operation: (attempt: number) => Promise<RetryableOperationResult<T>>;
    signal?: AbortSignal;
    deadlineAt?: string;
  }): Promise<RetryableOperationResult<T>> {
    let attempt = 1;
    while (true) {
      if (input.signal?.aborted === true) {
        return { ok: false, error: cancellationError() };
      }
      const result = await input.operation(attempt);
      if (result.ok) {
        return result;
      }
      const decision = this.#policy.decide({
        error: result.error,
        attempt,
        random: this.#random.next(),
        now: this.#clock.now(),
        ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt }),
        ...(result.retryAfterMs === undefined ? {} : { retryAfterMs: result.retryAfterMs }),
      });
      if (!decision.retry) {
        emitReliabilityEvent(this.#observer, {
          type: "retry.stopped",
          operation: input.operationName,
          attempt,
          reasonCode: decision.reason,
        });
        return result;
      }
      emitReliabilityEvent(this.#observer, {
        type: "retry.scheduled",
        operation: input.operationName,
        attempt,
        delayMs: decision.delayMs,
        reasonCode: result.error.code,
      });
      if (await this.#scheduler.sleep(decision.delayMs, input.signal) === "cancelled") {
        return { ok: false, error: cancellationError() };
      }
      attempt = decision.nextAttempt;
    }
  }
}

function cancellationError(): RuntimeError {
  return {
    code: "retry.cancelled",
    category: "cancelled",
    message: "retry operation was cancelled",
    retryable: false,
  };
}
