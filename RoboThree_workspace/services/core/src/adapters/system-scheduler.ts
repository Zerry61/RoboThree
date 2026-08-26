import type { ScheduledTask, Scheduler } from "../ports/scheduler.js";

export class SystemScheduler implements Scheduler {
  public schedule(delayMs: number, callback: () => void): ScheduledTask {
    const timer = setTimeout(callback, requireDelay(delayMs));
    return { cancel: () => clearTimeout(timer) };
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
}

function requireDelay(delayMs: number): number {
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("scheduler delay must be a finite non-negative number");
  }
  return delayMs;
}
