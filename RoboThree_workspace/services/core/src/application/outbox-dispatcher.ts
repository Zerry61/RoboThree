import type { ComponentHealth, RuntimeError } from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type { EventPublisher } from "../ports/event-publisher.js";
import type { RandomSource } from "../ports/random-source.js";
import type { RuntimeComponent } from "../ports/runtime-component.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import { emitReliabilityEvent } from "./reliability-events.js";
import type { ReliabilityObserver } from "./reliability-events.js";
import { addMilliseconds, RetryPolicy } from "./retry-policy.js";

export type OutboxDrainResult = {
  selected: number;
  published: number;
  failed: number;
  errors: readonly RuntimeError[];
};

export type OutboxBacklogDrainResult = OutboxDrainResult & {
  batches: number;
  reachedBatchLimit: boolean;
};

export class OutboxDispatcher implements RuntimeComponent {
  public readonly componentId = "outbox.dispatcher";
  readonly #persistence: TaskPersistence;
  readonly #publisher: EventPublisher;
  readonly #clock: Clock;
  readonly #retryPolicy: RetryPolicy;
  readonly #random: RandomSource;
  readonly #maxBatch: number;
  readonly #observer: ReliabilityObserver | undefined;
  #accepting = true;
  #stopController = new AbortController();
  #inFlight: Promise<OutboxDrainResult> | undefined;

  constructor(input: {
    persistence: TaskPersistence;
    publisher: EventPublisher;
    clock: Clock;
    retryPolicy?: RetryPolicy;
    random?: RandomSource;
    maxBatch?: number;
    observer?: ReliabilityObserver;
  }) {
    this.#persistence = input.persistence;
    this.#publisher = input.publisher;
    this.#clock = input.clock;
    this.#retryPolicy = input.retryPolicy ?? new RetryPolicy();
    this.#random = input.random ?? { next: () => Math.random() };
    this.#maxBatch = positiveInteger(input.maxBatch ?? 100, "maxBatch");
    this.#observer = input.observer;
  }

  public async start(): Promise<void> {
    if (this.#accepting) {
      return;
    }
    if (this.#inFlight !== undefined) {
      throw new Error("cannot start OutboxDispatcher while a previous drain is active");
    }
    this.#stopController = new AbortController();
    this.#accepting = true;
  }

  public async stop(): Promise<void> {
    this.#accepting = false;
    this.#stopController.abort(new Error("OutboxDispatcher stopped"));
    await this.#inFlight;
  }

  public async health(): Promise<ComponentHealth> {
    return {
      componentId: this.componentId,
      status: this.#accepting ? "ready" : "unavailable",
      checkedAt: this.#clock.now(),
      details: {
        activeDrain: this.#inFlight !== undefined,
        maxBatch: this.#maxBatch,
      },
    };
  }

  public drain(limit = this.#maxBatch, signal?: AbortSignal): Promise<OutboxDrainResult> {
    if (!this.#accepting || isAborted(signal)) {
      return Promise.resolve(emptyDrainResult());
    }
    if (this.#inFlight !== undefined) {
      return this.#inFlight;
    }
    const linked = linkAbortSignals(this.#stopController.signal, signal);
    const operation = this.#drainBounded(limit, linked.signal);
    const tracked = operation.finally(() => {
      linked.cleanup();
      if (this.#inFlight === tracked) {
        this.#inFlight = undefined;
      }
    });
    this.#inFlight = tracked;
    return tracked;
  }

  public async drainBacklog(input: {
    maxBatches?: number;
    batchSize?: number;
    signal?: AbortSignal;
  } = {}): Promise<OutboxBacklogDrainResult> {
    const maxBatches = positiveInteger(input.maxBatches ?? 100, "maxBatches");
    const batchSize = Math.min(
      positiveInteger(input.batchSize ?? this.#maxBatch, "batchSize"),
      this.#maxBatch,
    );
    let batches = 0;
    let selected = 0;
    let published = 0;
    let failed = 0;
    let lastSelected = 0;
    const errors: RuntimeError[] = [];
    while (batches < maxBatches && !isAborted(input.signal)) {
      const batch = await this.drain(batchSize, input.signal);
      batches += 1;
      lastSelected = batch.selected;
      selected += batch.selected;
      published += batch.published;
      failed += batch.failed;
      errors.push(...batch.errors);
      if (batch.selected < batchSize || batch.selected === 0) {
        break;
      }
    }
    return {
      batches,
      selected,
      published,
      failed,
      errors,
      reachedBatchLimit: batches === maxBatches && lastSelected === batchSize,
    };
  }

  async #drainBounded(limit: number, signal: AbortSignal): Promise<OutboxDrainResult> {
    const batchLimit = Math.min(positiveInteger(limit, "limit"), this.#maxBatch);
    if (isAborted(signal)) {
      return emptyDrainResult();
    }
    const now = this.#clock.now();
    const records = await this.#persistence.listPendingOutbox(batchLimit, now);
    let published = 0;
    let failed = 0;
    const errors: RuntimeError[] = [];

    for (const record of records) {
      if (isAborted(signal)) {
        break;
      }
      try {
        await this.#publisher.publish(record, signal);
        const acknowledged = await this.#persistence.recordOutboxAttempt({
          outboxId: record.outboxId,
          expectedAttemptCount: record.attemptCount,
          publishedAt: this.#clock.now(),
        });
        if (!acknowledged.ok) {
          failed += 1;
          errors.push(acknowledged.error);
          continue;
        }
        published += 1;
      } catch (error) {
        failed += 1;
        const deliveryError = publisherError(error);
        const failureAt = this.#clock.now();
        const attempt = record.attemptCount + 1;
        const delayMs = this.#retryPolicy.backoffDelay({
          attempt,
          random: this.#random.next(),
        });
        emitReliabilityEvent(this.#observer, {
          type: "retry.scheduled",
          operation: `outbox.publish:${record.outboxId}`,
          attempt,
          delayMs,
          reasonCode: deliveryError.code,
        });
        const recorded = await this.#persistence.recordOutboxAttempt({
          outboxId: record.outboxId,
          expectedAttemptCount: record.attemptCount,
          nextAttemptAt: addMilliseconds(failureAt, delayMs),
        });
        errors.push(recorded.ok
          ? deliveryError
          : recorded.error);
      }
    }

    const result = { selected: records.length, published, failed, errors };
    emitReliabilityEvent(this.#observer, {
      type: "outbox.batch",
      selected: result.selected,
      published,
      failed,
    });
    return result;
  }
}

function emptyDrainResult(): OutboxDrainResult {
  return { selected: 0, published: 0, failed: 0, errors: [] };
}

function linkAbortSignals(
  internal: AbortSignal,
  external: AbortSignal | undefined,
): Readonly<{ signal: AbortSignal; cleanup(): void }> {
  const controller = new AbortController();
  const abortFromInternal = () => controller.abort(internal.reason);
  const abortFromExternal = () => controller.abort(external?.reason);
  if (internal.aborted) {
    abortFromInternal();
  } else {
    internal.addEventListener("abort", abortFromInternal, { once: true });
  }
  if (external?.aborted === true) {
    abortFromExternal();
  } else {
    external?.addEventListener("abort", abortFromExternal, { once: true });
  }
  return Object.freeze({
    signal: controller.signal,
    cleanup: () => {
      internal.removeEventListener("abort", abortFromInternal);
      external?.removeEventListener("abort", abortFromExternal);
    },
  });
}

function publisherError(error: unknown): RuntimeError {
  return {
    code: "publisher.delivery_failed",
    category: "internal",
    message: error instanceof Error ? error.message : "event publisher failed",
    retryable: true,
  };
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}
