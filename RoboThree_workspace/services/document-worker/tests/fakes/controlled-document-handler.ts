import type {
  DeadlineScheduler,
  DeadlineTimer,
  DocumentCapabilityHandler,
  DocumentCapabilityRequest,
  DocumentCapabilityResult,
} from "../../src/index.js";

export class Deferred<T> {
  public readonly promise: Promise<T>;
  public resolve!: (value: T) => void;
  public reject!: (reason?: unknown) => void;

  public constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

export class ControlledDocumentHandler implements DocumentCapabilityHandler {
  public readonly requests: DocumentCapabilityRequest[] = [];
  readonly #queue: Array<Deferred<DocumentCapabilityResult>> = [];

  public enqueue(): Deferred<DocumentCapabilityResult> {
    const deferred = new Deferred<DocumentCapabilityResult>();
    this.#queue.push(deferred);
    return deferred;
  }

  public async invoke(
    request: DocumentCapabilityRequest,
  ): Promise<DocumentCapabilityResult> {
    this.requests.push(request);
    const deferred = this.#queue.shift();
    if (deferred === undefined) {
      return {
        output: null,
        metadata: {
          originalCount: 0,
          returnedCount: 0,
          truncated: false,
          resultDigest: "sha256:empty",
          timingMs: 0,
        },
      };
    }
    return deferred.promise;
  }
}

type ScheduledTimer = {
  id: number;
  callback: () => void;
  cleared: boolean;
};

export class ControlledDeadlineScheduler implements DeadlineScheduler {
  #now: number;
  #nextId = 1;
  readonly #timers = new Map<number, ScheduledTimer>();

  public constructor(now = Date.parse("2026-08-03T00:00:00.000Z")) {
    this.#now = now;
  }

  public now(): number {
    return this.#now;
  }

  public setNow(now: number): void {
    this.#now = now;
  }

  public setTimeout(callback: () => void, _delayMs: number): DeadlineTimer {
    const timer: ScheduledTimer = {
      id: this.#nextId++,
      callback,
      cleared: false,
    };
    this.#timers.set(timer.id, timer);
    return timer;
  }

  public clearTimeout(timer: DeadlineTimer): void {
    const scheduled = timer as ScheduledTimer;
    scheduled.cleared = true;
    this.#timers.delete(scheduled.id);
  }

  public triggerNext(): void {
    const timer = [...this.#timers.values()][0];
    if (timer === undefined) {
      throw new Error("No pending timer");
    }
    this.#timers.delete(timer.id);
    timer.cleared = true;
    timer.callback();
  }

  public pendingCount(): number {
    return this.#timers.size;
  }
}
