import type { ScheduledTask, Scheduler } from "../../ports/scheduler.js";

type Pending = {
  id: number;
  at: number;
  callback: () => void;
  cancelled: boolean;
};

export class FakeScheduler implements Scheduler {
  #nowMs = 0;
  #nextId = 1;
  readonly #pending: Pending[] = [];

  public schedule(delayMs: number, callback: () => void): ScheduledTask {
    requireDelay(delayMs);
    const entry: Pending = {
      id: this.#nextId,
      at: this.#nowMs + delayMs,
      callback,
      cancelled: false,
    };
    this.#nextId += 1;
    this.#pending.push(entry);
    return { cancel: () => { entry.cancelled = true; } };
  }

  public sleep(delayMs: number, signal?: AbortSignal): Promise<"elapsed" | "cancelled"> {
    if (signal?.aborted === true) {
      return Promise.resolve("cancelled");
    }
    return new Promise((resolve) => {
      const scheduled = this.schedule(delayMs, () => {
        signal?.removeEventListener("abort", abort);
        resolve("elapsed");
      });
      const abort = () => {
        scheduled.cancel();
        signal?.removeEventListener("abort", abort);
        resolve("cancelled");
      };
      signal?.addEventListener("abort", abort, { once: true });
    });
  }

  public advanceBy(delayMs: number): void {
    requireDelay(delayMs);
    this.#nowMs += delayMs;
    while (true) {
      const next = this.#pending
        .filter((entry) => !entry.cancelled && entry.at <= this.#nowMs)
        .sort((left, right) => left.at - right.at || left.id - right.id)[0];
      if (next === undefined) {
        break;
      }
      next.cancelled = true;
      next.callback();
    }
    this.#compact();
  }

  public pendingCount(): number {
    return this.#pending.filter((entry) => !entry.cancelled).length;
  }

  #compact(): void {
    for (let index = this.#pending.length - 1; index >= 0; index -= 1) {
      if (this.#pending[index]?.cancelled === true) {
        this.#pending.splice(index, 1);
      }
    }
  }
}

function requireDelay(delayMs: number): void {
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("fake scheduler delay must be a finite non-negative number");
  }
}
