import type { EffectAttempt, RuntimeError } from "@robothree/contracts";

import type { TaskPersistence } from "../ports/task-persistence.js";
import type { DurableTaskCommandResult } from "./durable-task-runtime.js";
import type { EffectCoordinator } from "./effect-coordinator.js";

export type EffectRecoveryDecision = {
  effectAttemptId: string;
  previousStatus: EffectAttempt["status"];
  action: "dispatch_prepared" | "recover_dispatched" | "await_reconciliation";
  result?: DurableTaskCommandResult;
  error?: RuntimeError;
};

export class TaskRecoveryCoordinator {
  readonly #persistence: TaskPersistence;
  readonly #effects: EffectCoordinator;

  constructor(input: { persistence: TaskPersistence; effects: EffectCoordinator }) {
    this.#persistence = input.persistence;
    this.#effects = input.effects;
  }

  async recoverEffects(): Promise<readonly EffectRecoveryDecision[]> {
    const attempts = await this.#persistence.listRecoverableEffectAttempts();
    const decisions: EffectRecoveryDecision[] = [];
    for (const attempt of attempts) {
      if (attempt.status === "uncertain") {
        decisions.push({
          effectAttemptId: attempt.effectAttemptId,
          previousStatus: attempt.status,
          action: "await_reconciliation",
        });
        continue;
      }
      try {
        const result = attempt.status === "prepared"
          ? await this.#effects.dispatchPrepared(attempt.effectAttemptId)
          : await this.#effects.recoverDispatched(attempt);
        decisions.push({
          effectAttemptId: attempt.effectAttemptId,
          previousStatus: attempt.status,
          action: attempt.status === "prepared" ? "dispatch_prepared" : "recover_dispatched",
          result,
        });
      } catch (error) {
        decisions.push({
          effectAttemptId: attempt.effectAttemptId,
          previousStatus: attempt.status,
          action: attempt.status === "prepared" ? "dispatch_prepared" : "recover_dispatched",
          error: {
            code: "recovery.effect_failed",
            category: "internal",
            message: error instanceof Error ? error.message : "effect recovery failed",
            retryable: true,
          },
        });
      }
    }
    return decisions;
  }
}
