import type { ScheduledTask, Scheduler } from "../ports/scheduler.js";
import type { TaskPersistence } from "../ports/task-persistence.js";

export type ActiveAgentLoopStartupRecoveryReport = Readonly<{
  scanned: number;
  resumed: number;
  skipped: number;
  conflicted: number;
  safeErrorCodes: readonly "agent_loop_startup_recovery.failed"[];
}>;

type StartupRecoverableAgentLoop = Readonly<{
  resumeFromStartup(taskId: string): Promise<void>;
  cancel(taskId: string): void;
}>;

/**
 * One bounded post-ready pass over existing Task checkpoints. The durable
 * starter remains the only execution state machine and revalidates every fact.
 */
export class ActiveAgentLoopStartupRecoveryCoordinator {
  readonly #tasks: TaskPersistence;
  readonly #starter: StartupRecoverableAgentLoop;
  readonly #scheduler: Scheduler;
  readonly #activeTaskIds = new Set<string>();
  #scheduled: ScheduledTask | undefined;
  #stopped = false;

  public constructor(input: Readonly<{
    tasks: TaskPersistence;
    starter: StartupRecoverableAgentLoop;
    scheduler: Scheduler;
  }>) {
    this.#tasks = input.tasks;
    this.#starter = input.starter;
    this.#scheduler = input.scheduler;
  }

  public start(): void {
    if (this.#scheduled !== undefined || this.#stopped) return;
    this.#scheduled = this.#scheduler.schedule(0, () => {
      this.#scheduled = undefined;
      void this.recoverOnce().catch(() => undefined);
    });
  }

  public stop(): void {
    this.#stopped = true;
    this.#scheduled?.cancel();
    this.#scheduled = undefined;
    for (const taskId of this.#activeTaskIds) this.#starter.cancel(taskId);
    this.#activeTaskIds.clear();
  }

  public async recoverOnce(): Promise<ActiveAgentLoopStartupRecoveryReport> {
    const candidates = [...await this.#tasks.listRecoveryCandidates()]
      .sort((left, right) => left.head.taskId.localeCompare(right.head.taskId));
    let resumed = 0;
    let skipped = 0;
    let conflicted = 0;
    const safeErrorCodes: "agent_loop_startup_recovery.failed"[] = [];
    for (const task of candidates) {
      if (this.#stopped) break;
      const state = task.checkpoint.state;
      const run = state.runs.find((candidate) => candidate.runId === state.activeRunId);
      const step = run?.steps.find((candidate) => candidate.stepId === run.activeStepId);
      if (
        state.status !== "running"
        || run?.status !== "running"
        || step?.status !== "running"
        || step.action.kind !== "model.generate"
      ) {
        skipped += 1;
        continue;
      }
      const taskId = task.head.taskId;
      if (this.#activeTaskIds.has(taskId)) {
        conflicted += 1;
        continue;
      }
      this.#activeTaskIds.add(taskId);
      try {
        await this.#starter.resumeFromStartup(taskId);
        resumed += 1;
      } catch {
        safeErrorCodes.push("agent_loop_startup_recovery.failed");
      } finally {
        this.#activeTaskIds.delete(taskId);
      }
    }
    return Object.freeze({
      scanned: candidates.length,
      resumed,
      skipped,
      conflicted,
      safeErrorCodes: Object.freeze(safeErrorCodes),
    });
  }
}
