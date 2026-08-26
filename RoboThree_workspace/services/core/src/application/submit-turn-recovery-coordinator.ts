import type { RuntimeError } from "@robothree/contracts";

import type { Scheduler, ScheduledTask } from "../ports/scheduler.js";
import type { SubmitTurnPersistence } from "../ports/submit-turn-persistence.js";
import type { SubmitTurnCoordinator } from "./submit-turn-coordinator.js";

export type SubmitTurnRecoveryReport = Readonly<{
  scanned: number;
  recovered: number;
  pending: number;
  failures: readonly Readonly<{
    submitTurnCommandId: string;
    error: RuntimeError;
  }>[];
}>;

export class SubmitTurnRecoveryCoordinator {
  readonly #coordination: SubmitTurnPersistence;
  readonly #submitTurns: SubmitTurnCoordinator;
  readonly #scheduler: Scheduler;
  readonly #batchSize: number;
  readonly #retryDelayMs: number;
  #scheduled: ScheduledTask | undefined;
  #running: Promise<SubmitTurnRecoveryReport> | undefined;
  #stopped = false;

  constructor(input: {
    coordination: SubmitTurnPersistence;
    submitTurns: SubmitTurnCoordinator;
    scheduler: Scheduler;
    batchSize?: number;
    retryDelayMs?: number;
  }) {
    this.#coordination = input.coordination;
    this.#submitTurns = input.submitTurns;
    this.#scheduler = input.scheduler;
    this.#batchSize = positiveInteger(input.batchSize ?? 32, "batchSize", 256);
    this.#retryDelayMs = nonNegativeInteger(
      input.retryDelayMs ?? 1_000,
      "retryDelayMs",
    );
  }

  async recoverOnce(): Promise<SubmitTurnRecoveryReport> {
    if (this.#running !== undefined) return this.#running;
    const operation = this.#recoverOnce();
    this.#running = operation;
    try {
      return await operation;
    } finally {
      if (this.#running === operation) this.#running = undefined;
    }
  }

  start(): void {
    this.#stopped = false;
    this.#schedule(0);
  }

  stop(): void {
    this.#stopped = true;
    this.#scheduled?.cancel();
    this.#scheduled = undefined;
  }

  async #recoverOnce(): Promise<SubmitTurnRecoveryReport> {
    const candidates = await this.#coordination.listRecoverable(this.#batchSize);
    const failures: Array<{
      submitTurnCommandId: string;
      error: RuntimeError;
    }> = [];
    let recovered = 0;
    for (const candidate of candidates) {
      const result = await this.#submitTurns.resume(
        candidate.submitTurnCommandId,
      );
      if (result.ok) {
        const after = await this.#coordination.loadRecord(
          candidate.submitTurnCommandId,
        );
        if (
          after?.status === "failed_terminal"
          || (after?.status === "completed" && after.loopStartedAt !== undefined)
        ) recovered += 1;
      } else {
        failures.push({
          submitTurnCommandId: candidate.submitTurnCommandId,
          error: result.error,
        });
      }
    }
    const pending = (await this.#coordination.listRecoverable(1)).length;
    return {
      scanned: candidates.length,
      recovered,
      pending,
      failures,
    };
  }

  #schedule(delayMs: number): void {
    if (this.#stopped || this.#scheduled !== undefined) return;
    this.#scheduled = this.#scheduler.schedule(delayMs, () => {
      this.#scheduled = undefined;
      void this.recoverOnce()
        .then((report) => {
          if (report.pending > 0 || report.failures.length > 0) {
            this.#schedule(this.#retryDelayMs);
          }
        })
        .catch(() => {
          this.#schedule(this.#retryDelayMs);
        });
    });
  }
}

function positiveInteger(
  value: number,
  name: string,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}
