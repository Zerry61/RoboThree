import {
  canonicalJsonStringify,
  JsonObjectSchema,
  PersistenceSchemaVersion,
} from "@robothree/contracts";
import type {
  EffectAttempt,
  EffectRecoveryMode,
  JsonObject,
  OutboxRecord,
  RuntimeError,
  TaskCommand,
  TaskEvent,
} from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type { EffectExecutionResult, EffectExecutor } from "../ports/effect-executor.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import { persistenceError } from "../persistence/validation.js";
import type { DurableTaskCommandResult } from "./durable-task-runtime.js";
import type { DurableTaskRuntime } from "./durable-task-runtime.js";

export type EffectCrashPoint =
  | "before_prepare_commit"
  | "after_prepare_commit"
  | "after_dispatched_commit"
  | "after_execute_before_result_commit"
  | "after_result_commit";

export type EffectCrashInjector = (point: EffectCrashPoint, attempt: EffectAttempt) => void;

export type PrepareEffectInput = {
  taskId: string;
  runId: string;
  stepId: string;
  actionId: string;
  idempotencyKey: string;
  executorCapability: string;
  recoveryMode: EffectRecoveryMode;
  requestRef?: string;
  metadata?: JsonObject;
};

export type PrepareEffectResult =
  | { ok: true; replayed: boolean; attempt: EffectAttempt }
  | { ok: false; error: RuntimeError };

export type BeforeEffectDispatch = (attempt: EffectAttempt) => Promise<RuntimeError | undefined>;

export class EffectCoordinator {
  readonly #runtime: DurableTaskRuntime;
  readonly #persistence: TaskPersistence;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #executors: Map<string, EffectExecutor>;
  readonly #outboxDestination: string;
  readonly #crashInjector: EffectCrashInjector;

  constructor(input: {
    runtime: DurableTaskRuntime;
    persistence: TaskPersistence;
    clock: Clock;
    idGenerator: IdGenerator;
    executors: readonly EffectExecutor[];
    outboxDestination?: string;
    crashInjector?: EffectCrashInjector;
  }) {
    this.#runtime = input.runtime;
    this.#persistence = input.persistence;
    this.#clock = input.clock;
    this.#idGenerator = input.idGenerator;
    this.#executors = new Map(input.executors.map((executor) => [executor.executorCapability, executor]));
    if (this.#executors.size !== input.executors.length) {
      throw new Error("Effect executor capabilities must be unique");
    }
    this.#outboxDestination = input.outboxDestination ?? "runtime.events";
    this.#crashInjector = input.crashInjector ?? (() => undefined);
  }

  async prepare(input: PrepareEffectInput): Promise<PrepareEffectResult> {
    const metadata = JsonObjectSchema.parse(input.metadata ?? {});
    const existing = await this.#persistence.findEffectAttemptByIdempotencyKey(input.idempotencyKey);
    if (existing !== undefined) {
      return sameEffectIntent(existing, input, metadata)
        ? { ok: true, replayed: true, attempt: existing }
        : {
          ok: false,
          error: runtimeError(
            "effect.idempotency_conflict",
            "Effect idempotencyKey already belongs to a different intent",
          ),
        };
    }
    const state = await this.#runtime.snapshot(input.taskId);
    if (state === undefined) {
      return { ok: false, error: persistenceError("persistence.task_not_found", "task does not exist") };
    }
    const run = state.runs.find((candidate) => candidate.runId === input.runId);
    const step = run?.steps.find((candidate) => candidate.stepId === input.stepId);
    if (
      state.activeRunId !== input.runId
      || run?.activeStepId !== input.stepId
      || step?.action.actionId !== input.actionId
      || (step.status !== "running" && step.status !== "waiting")
    ) {
      return { ok: false, error: runtimeError("effect.invalid_active_step", "Effect intent must target the active step") };
    }
    if (!this.#executors.has(input.executorCapability)) {
      return { ok: false, error: runtimeError("effect.executor_not_found", "Effect executor capability is not registered") };
    }
    const now = this.#clock.now();
    const attempt: EffectAttempt = {
      schemaVersion: PersistenceSchemaVersion,
      effectAttemptId: this.#idGenerator.next(),
      taskId: input.taskId,
      runId: input.runId,
      stepId: input.stepId,
      actionId: input.actionId,
      idempotencyKey: input.idempotencyKey,
      executorCapability: input.executorCapability,
      recoveryMode: input.recoveryMode,
      status: "prepared",
      ...(input.requestRef === undefined ? {} : { requestRef: input.requestRef }),
      metadata,
      createdAt: now,
      updatedAt: now,
    };
    this.#crashInjector("before_prepare_commit", attempt);
    const committed = await this.#commitEffectOnly(undefined, attempt);
    if (!committed.ok) {
      const concurrent = await this.#persistence.findEffectAttemptByIdempotencyKey(input.idempotencyKey);
      if (concurrent !== undefined && sameEffectIntent(concurrent, input, metadata)) {
        return { ok: true, replayed: true, attempt: concurrent };
      }
      return { ok: false, error: committed.error };
    }
    this.#crashInjector("after_prepare_commit", committed.value);
    return { ok: true, replayed: committed.replayed, attempt: committed.value };
  }

  async prepareAndDispatch(
    input: PrepareEffectInput,
    signal?: AbortSignal,
    beforeDispatch?: BeforeEffectDispatch,
  ): Promise<DurableTaskCommandResult | PrepareEffectResult> {
    const prepared = await this.prepare(input);
    if (!prepared.ok) {
      return prepared;
    }
    if (prepared.attempt.status === "prepared") {
      const invalidation = await beforeDispatch?.(prepared.attempt);
      if (invalidation !== undefined) {
        return this.#invalidatePrepared(prepared.attempt, invalidation);
      }
      return this.dispatchPrepared(prepared.attempt.effectAttemptId, signal);
    }
    if (prepared.attempt.status === "dispatched") {
      return this.recoverDispatched(prepared.attempt, signal);
    }
    return prepared;
  }

  async #invalidatePrepared(attempt: EffectAttempt, error: RuntimeError): Promise<DurableTaskCommandResult> {
    const now = this.#clock.now();
    const cancelled: EffectAttempt = {
      ...attempt,
      status: "cancelled",
      terminalError: error,
      updatedAt: now,
    };
    const command: TaskCommand = {
      commandId: this.#idGenerator.next(),
      taskId: attempt.taskId,
      type: "record_observation",
      issuedAt: now,
      runId: attempt.runId,
      stepId: attempt.stepId,
      observation: {
        observationId: this.#idGenerator.next(),
        actionId: attempt.actionId,
        observedAt: now,
        outcome: "failed",
        error,
      },
    };
    return this.#runtime.dispatchWithEffectTransition(command, {
      expectedStatus: "prepared",
      attempt: cancelled,
    });
  }

  async dispatchPrepared(effectAttemptId: string, signal?: AbortSignal): Promise<DurableTaskCommandResult> {
    const current = await this.#persistence.loadEffectAttempt(effectAttemptId);
    if (current === undefined) {
      return effectFailure(persistenceError("persistence.effect_not_found", "effect attempt does not exist"));
    }
    if (current.status !== "prepared") {
      return effectFailure(persistenceError("persistence.effect_status_conflict", "effect attempt is not prepared"));
    }
    const dispatched: EffectAttempt = {
      ...current,
      status: "dispatched",
      updatedAt: this.#clock.now(),
    };
    const committed = await this.#commitEffectOnly("prepared", dispatched);
    if (!committed.ok) {
      return effectFailure(committed.error);
    }
    this.#crashInjector("after_dispatched_commit", committed.value);
    return this.#executeAndRecord(committed.value, signal);
  }

  async cancelPrepared(effectAttemptId: string, reason = "Effect cancelled before dispatch"): Promise<DurableTaskCommandResult> {
    const current = await this.#persistence.loadEffectAttempt(effectAttemptId);
    if (current === undefined) {
      return effectFailure(persistenceError("persistence.effect_not_found", "effect attempt does not exist"));
    }
    if (current.status !== "prepared") {
      return effectFailure(persistenceError("persistence.effect_status_conflict", "only a prepared effect can be safely cancelled"));
    }
    const now = this.#clock.now();
    const cancelled: EffectAttempt = {
      ...current,
      status: "cancelled",
      terminalError: {
        code: "effect.cancelled_before_dispatch",
        category: "cancelled",
        message: reason,
        retryable: false,
      },
      updatedAt: now,
    };
    const command: TaskCommand = {
      commandId: this.#idGenerator.next(),
      taskId: current.taskId,
      type: "cancel_task",
      issuedAt: now,
      reason,
    };
    return this.#runtime.dispatchWithEffectTransition(command, {
      expectedStatus: "prepared",
      attempt: cancelled,
    });
  }

  async recoverDispatched(attempt: EffectAttempt, signal?: AbortSignal): Promise<DurableTaskCommandResult> {
    if (attempt.status !== "dispatched") {
      return effectFailure(persistenceError("persistence.effect_status_conflict", "effect attempt is not dispatched"));
    }
    const executor = this.#requireExecutor(attempt.executorCapability);
    switch (attempt.recoveryMode) {
      case "idempotent_retry":
        return this.#executeAndRecord(attempt, signal);
      case "query_then_retry": {
        const queried = await executor.query(attempt);
        if (queried.outcome === "unknown") {
          return this.markUncertain(attempt, "Executor query could not confirm the external result");
        }
        return queried.outcome === "not_found"
          ? this.#executeAndRecord(attempt, signal)
          : this.#recordResult(attempt, queried);
      }
      case "manual_reconciliation":
        return this.markUncertain(attempt, "Executor cannot safely query or retry this external effect");
    }
  }

  async markUncertain(attempt: EffectAttempt, message: string): Promise<DurableTaskCommandResult> {
    const now = this.#clock.now();
    const error: RuntimeError = {
      code: "effect.result_uncertain",
      category: "internal",
      message,
      retryable: false,
      details: { effectAttemptId: attempt.effectAttemptId, idempotencyKey: attempt.idempotencyKey },
    };
    const uncertain: EffectAttempt = {
      ...attempt,
      status: "uncertain",
      terminalError: error,
      updatedAt: now,
    };
    const command: TaskCommand = {
      commandId: this.#idGenerator.next(),
      taskId: attempt.taskId,
      type: "wait_step",
      issuedAt: now,
      runId: attempt.runId,
      stepId: attempt.stepId,
      reason: "external_dependency",
      context: JsonObjectSchema.parse({
        effectAttemptId: attempt.effectAttemptId,
        idempotencyKey: attempt.idempotencyKey,
        reconciliationRequired: true,
      }),
    };
    return this.#runtime.dispatchWithEffectTransition(command, {
      expectedStatus: "dispatched",
      attempt: uncertain,
    });
  }

  async #executeAndRecord(
    attempt: EffectAttempt,
    signal?: AbortSignal,
  ): Promise<DurableTaskCommandResult> {
    const result = await this.#requireExecutor(attempt.executorCapability).execute(attempt, signal);
    this.#crashInjector("after_execute_before_result_commit", attempt);
    return this.#recordResult(attempt, result);
  }

  async #recordResult(
    attempt: EffectAttempt,
    result: EffectExecutionResult,
  ): Promise<DurableTaskCommandResult> {
    const now = this.#clock.now();
    const terminal: EffectAttempt = result.outcome === "succeeded"
      ? {
        ...attempt,
        status: "succeeded",
        resultRef: result.resultRef,
        updatedAt: now,
      }
      : result.outcome === "cancelled"
        ? {
          ...attempt,
          status: "cancelled",
          terminalError: result.error,
          updatedAt: now,
        }
        : {
        ...attempt,
        status: "failed",
        terminalError: result.error,
        updatedAt: now,
        };
    const command: TaskCommand = {
      commandId: this.#idGenerator.next(),
      taskId: attempt.taskId,
      type: "record_observation",
      issuedAt: now,
      runId: attempt.runId,
      stepId: attempt.stepId,
      observation: result.observation ?? (result.outcome === "succeeded"
        ? {
          observationId: this.#idGenerator.next(),
          actionId: attempt.actionId,
          observedAt: now,
          outcome: "succeeded",
          output: result.output,
        }
        : result.outcome === "cancelled"
          ? {
            observationId: this.#idGenerator.next(),
            actionId: attempt.actionId,
            observedAt: now,
            outcome: "cancelled",
            error: result.error,
          }
          : result.outcome === "timed_out"
            ? {
              observationId: this.#idGenerator.next(),
              actionId: attempt.actionId,
              observedAt: now,
              outcome: "timed_out",
              error: result.error,
            }
            : {
          observationId: this.#idGenerator.next(),
          actionId: attempt.actionId,
          observedAt: now,
          outcome: "failed",
          error: result.error,
            }),
    };
    const committed = await this.#runtime.dispatchWithEffectTransition(command, {
      expectedStatus: "dispatched",
      attempt: terminal,
    });
    if (committed.accepted) {
      this.#crashInjector("after_result_commit", terminal);
    }
    return committed;
  }

  async #commitEffectOnly(expectedStatus: "prepared" | undefined, attempt: EffectAttempt) {
    const task = await this.#persistence.loadTask(attempt.taskId);
    if (task === undefined) {
      return { ok: false as const, error: persistenceError("persistence.task_not_found", "task does not exist") };
    }
    const event = effectEvent(attempt, task.head.lastEventSequence + 1, this.#idGenerator.next());
    return this.#persistence.commitEffectTransition({
      expectedEventSequence: task.head.lastEventSequence,
      ...(expectedStatus === undefined ? {} : { expectedStatus }),
      attempt,
      event,
      outbox: [effectOutbox(event, this.#idGenerator.next(), this.#outboxDestination)],
    });
  }

  #requireExecutor(capability: string): EffectExecutor {
    const executor = this.#executors.get(capability);
    if (executor === undefined) {
      throw new Error(`Effect executor ${capability} is not registered`);
    }
    return executor;
  }
}

function effectEvent(attempt: EffectAttempt, sequence: number, eventId: string): TaskEvent {
  return {
    schemaVersion: PersistenceSchemaVersion,
    eventId,
    taskId: attempt.taskId,
    sequence,
    type: attempt.status === "prepared" ? "runtime.effect_intent_recorded" : "runtime.effect_dispatched",
    occurredAt: attempt.updatedAt,
    causationId: attempt.effectAttemptId,
    correlationId: attempt.taskId,
    runId: attempt.runId,
    stepId: attempt.stepId,
    payload: JsonObjectSchema.parse({ attempt }),
  };
}

function effectOutbox(event: TaskEvent, outboxId: string, destination: string): OutboxRecord {
  return {
    schemaVersion: PersistenceSchemaVersion,
    outboxId,
    eventId: event.eventId,
    taskId: event.taskId,
    destination,
    payload: JsonObjectSchema.parse({ event }),
    attemptCount: 0,
    createdAt: event.occurredAt,
  };
}

function effectFailure(error: RuntimeError): DurableTaskCommandResult {
  return { accepted: false, error };
}

function runtimeError(code: string, message: string): RuntimeError {
  return { code, category: "validation", message, retryable: false };
}

function sameEffectIntent(
  attempt: EffectAttempt,
  input: PrepareEffectInput,
  metadata: JsonObject,
): boolean {
  return attempt.taskId === input.taskId
    && attempt.runId === input.runId
    && attempt.stepId === input.stepId
    && attempt.actionId === input.actionId
    && attempt.idempotencyKey === input.idempotencyKey
    && attempt.executorCapability === input.executorCapability
    && attempt.recoveryMode === input.recoveryMode
    && attempt.requestRef === input.requestRef
    && canonicalJsonStringify(attempt.metadata) === canonicalJsonStringify(metadata);
}
