import type { RuntimeError } from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type { ScheduledTask, Scheduler } from "../ports/scheduler.js";
import { emitReliabilityEvent } from "./reliability-events.js";
import type { ReliabilityObserver } from "./reliability-events.js";

export const DEFAULT_RUNTIME_ADMISSION_LIMITS = Object.freeze({
  maxActiveRuns: 16,
  maxActiveTools: 8,
  maxQueued: 256,
});

export type AdmissionKind = "run" | "tool";

export type AdmissionRequest = {
  requestId: string;
  kind: AdmissionKind;
  resourceId?: string;
  resourceLimit?: number;
  deadlineAt?: string;
  signal?: AbortSignal;
};

export type AdmissionLease = {
  requestId: string;
  kind: AdmissionKind;
  release(): void;
};

export type AdmissionResult =
  | { ok: true; lease: AdmissionLease }
  | { ok: false; error: RuntimeError };

type QueuedRequest = {
  input: AdmissionRequest;
  resolve: (result: AdmissionResult) => void;
  deadlineTask?: ScheduledTask;
  abort?: () => void;
};

export class RuntimeAdmissionController {
  readonly #clock: Clock;
  readonly #scheduler: Scheduler;
  readonly #maxActive: Readonly<Record<AdmissionKind, number>>;
  readonly #maxQueued: number;
  readonly #observer: ReliabilityObserver | undefined;
  readonly #queue: QueuedRequest[] = [];
  readonly #active = { run: 0, tool: 0 };
  readonly #activeResources = new Map<string, number>();
  readonly #requestIds = new Set<string>();

  public constructor(input: {
    clock: Clock;
    scheduler: Scheduler;
    maxActiveRuns?: number;
    maxActiveTools?: number;
    maxQueued?: number;
    observer?: ReliabilityObserver;
  }) {
    this.#clock = input.clock;
    this.#scheduler = input.scheduler;
    this.#maxActive = Object.freeze({
      run: positiveInteger(input.maxActiveRuns ?? DEFAULT_RUNTIME_ADMISSION_LIMITS.maxActiveRuns, "maxActiveRuns"),
      tool: positiveInteger(input.maxActiveTools ?? DEFAULT_RUNTIME_ADMISSION_LIMITS.maxActiveTools, "maxActiveTools"),
    });
    this.#maxQueued = positiveInteger(input.maxQueued ?? DEFAULT_RUNTIME_ADMISSION_LIMITS.maxQueued, "maxQueued");
    this.#observer = input.observer;
  }

  public acquire(input: AdmissionRequest): Promise<AdmissionResult> {
    const invalid = this.#validate(input);
    if (invalid !== undefined) {
      return Promise.resolve(this.#reject(input, invalid));
    }
    if (input.signal?.aborted === true) {
      return Promise.resolve(this.#reject(input, admissionError(
        "admission.cancelled_before_admission",
        "work was cancelled before admission",
        "cancelled",
        false,
      )));
    }
    if (this.#deadlineExpired(input.deadlineAt)) {
      return Promise.resolve(this.#reject(input, admissionError(
        "admission.deadline_expired",
        "work deadline expired before admission",
        "timeout",
        false,
      )));
    }
    if (this.#queue.length === 0 && this.#canGrant(input)) {
      return Promise.resolve({ ok: true, lease: this.#grant(input) });
    }
    if (this.#queue.length >= this.#maxQueued) {
      return Promise.resolve(this.#reject(input, admissionError(
        "admission.queue_full",
        "runtime admission queue is full",
        "internal",
        true,
      )));
    }
    this.#requestIds.add(input.requestId);
    return new Promise((resolve) => {
      const queued: QueuedRequest = { input, resolve };
      if (input.signal !== undefined) {
        queued.abort = () => this.#removeQueued(queued, admissionError(
          "admission.cancelled_before_admission",
          "queued work was cancelled before admission",
          "cancelled",
          false,
        ));
        input.signal.addEventListener("abort", queued.abort, { once: true });
      }
      if (input.deadlineAt !== undefined) {
        const delayMs = Math.max(0, Date.parse(input.deadlineAt) - Date.parse(this.#clock.now()));
        queued.deadlineTask = this.#scheduler.schedule(delayMs, () => this.#removeQueued(queued, admissionError(
          "admission.deadline_expired",
          "queued work deadline expired before admission",
          "timeout",
          false,
        )));
      }
      this.#queue.push(queued);
      this.#emit("admission.queued", input);
      this.#drain();
    });
  }

  public async run<T>(
    input: AdmissionRequest,
    operation: (lease: AdmissionLease) => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; error: RuntimeError }> {
    const admission = await this.acquire(input);
    if (!admission.ok) {
      return admission;
    }
    try {
      return { ok: true, value: await operation(admission.lease) };
    } finally {
      admission.lease.release();
    }
  }

  public stats(): {
    activeRuns: number;
    activeTools: number;
    queued: number;
    activeResources: Readonly<Record<string, number>>;
  } {
    return {
      activeRuns: this.#active.run,
      activeTools: this.#active.tool,
      queued: this.#queue.length,
      activeResources: Object.freeze(Object.fromEntries(this.#activeResources)),
    };
  }

  #validate(input: AdmissionRequest): RuntimeError | undefined {
    if (input.requestId.length === 0) {
      return admissionError("admission.invalid_request", "admission requestId cannot be empty", "validation", false);
    }
    if (this.#requestIds.has(input.requestId)) {
      return admissionError("admission.duplicate_request", "admission requestId is already active or queued", "validation", false);
    }
    if (input.deadlineAt !== undefined && !Number.isFinite(Date.parse(input.deadlineAt))) {
      return admissionError("admission.invalid_deadline", "admission deadline must be an ISO timestamp", "validation", false);
    }
    if (input.resourceLimit !== undefined && input.resourceId === undefined) {
      return admissionError("admission.invalid_resource", "resourceLimit requires a resourceId", "validation", false);
    }
    if (input.resourceLimit !== undefined
      && (!Number.isSafeInteger(input.resourceLimit) || input.resourceLimit <= 0)) {
      return admissionError("admission.invalid_resource", "resourceLimit must be a positive integer", "validation", false);
    }
    return undefined;
  }

  #canGrant(input: AdmissionRequest): boolean {
    if (this.#active[input.kind] >= this.#maxActive[input.kind]) {
      return false;
    }
    return input.resourceId === undefined || input.resourceLimit === undefined
      || (this.#activeResources.get(input.resourceId) ?? 0) < input.resourceLimit;
  }

  #grant(input: AdmissionRequest): AdmissionLease {
    this.#requestIds.add(input.requestId);
    this.#active[input.kind] += 1;
    if (input.resourceId !== undefined) {
      this.#activeResources.set(input.resourceId, (this.#activeResources.get(input.resourceId) ?? 0) + 1);
    }
    let released = false;
    const lease: AdmissionLease = Object.freeze({
      requestId: input.requestId,
      kind: input.kind,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.#active[input.kind] -= 1;
        this.#requestIds.delete(input.requestId);
        if (input.resourceId !== undefined) {
          const remaining = (this.#activeResources.get(input.resourceId) ?? 1) - 1;
          if (remaining === 0) {
            this.#activeResources.delete(input.resourceId);
          } else {
            this.#activeResources.set(input.resourceId, remaining);
          }
        }
        this.#emit("admission.released", input);
        this.#drain();
      },
    });
    this.#emit("admission.acquired", input);
    return lease;
  }

  #drain(): void {
    while (this.#queue.length > 0) {
      const next = this.#queue[0]!;
      if (!this.#canGrant(next.input)) {
        return;
      }
      this.#queue.shift();
      this.#cleanup(next);
      this.#requestIds.delete(next.input.requestId);
      next.resolve({ ok: true, lease: this.#grant(next.input) });
    }
  }

  #removeQueued(queued: QueuedRequest, error: RuntimeError): void {
    const index = this.#queue.indexOf(queued);
    if (index < 0) {
      return;
    }
    this.#queue.splice(index, 1);
    this.#cleanup(queued);
    this.#requestIds.delete(queued.input.requestId);
    queued.resolve(this.#reject(queued.input, error));
    this.#drain();
  }

  #cleanup(queued: QueuedRequest): void {
    queued.deadlineTask?.cancel();
    if (queued.abort !== undefined) {
      queued.input.signal?.removeEventListener("abort", queued.abort);
    }
  }

  #deadlineExpired(deadlineAt: string | undefined): boolean {
    return deadlineAt !== undefined && Date.parse(deadlineAt) <= Date.parse(this.#clock.now());
  }

  #reject(input: AdmissionRequest, error: RuntimeError): { ok: false; error: RuntimeError } {
    emitReliabilityEvent(this.#observer, {
      type: "admission.rejected",
      requestId: input.requestId,
      kind: input.kind,
      reasonCode: error.code,
      active: this.#active[input.kind],
      queued: this.#queue.length,
      ...(input.resourceId === undefined ? {} : { resourceId: input.resourceId }),
    });
    return { ok: false, error };
  }

  #emit(
    type: "admission.queued" | "admission.acquired" | "admission.released",
    input: AdmissionRequest,
  ): void {
    emitReliabilityEvent(this.#observer, {
      type,
      requestId: input.requestId,
      kind: input.kind,
      active: this.#active[input.kind],
      queued: this.#queue.length,
      ...(input.resourceId === undefined ? {} : { resourceId: input.resourceId }),
    });
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function admissionError(
  code: string,
  message: string,
  category: RuntimeError["category"],
  retryable: boolean,
): RuntimeError {
  return { code, category, message, retryable };
}
