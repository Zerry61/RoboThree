import {
  ActionSchema,
  ObservationSchema,
  type Action,
  type EffectAttempt,
  type Observation,
} from "@robothree/contracts";

import type { Clock } from "../../ports/clock.js";
import type {
  EffectExecutionResult,
  EffectExecutor,
  EffectQueryResult,
} from "../../ports/effect-executor.js";
import type { TaskPersistence } from "../../ports/task-persistence.js";
import type { RuntimeAdapterHandles } from "../../registry/runtime-adapter-handles.js";

export type ToolEffectActionHydrator = (input: Readonly<{
  attempt: EffectAttempt;
  action: Action;
}>) => Promise<Action> | Action;

export class ToolEffectExecutor implements EffectExecutor {
  public readonly executorCapability: string;
  readonly #persistence: TaskPersistence;
  readonly #handles: RuntimeAdapterHandles;
  readonly #clock: Clock;
  readonly #hydrateAction: ToolEffectActionHydrator | undefined;

  public constructor(input: {
    adapterDescriptorId: string;
    persistence: TaskPersistence;
    handles: RuntimeAdapterHandles;
    clock: Clock;
    hydrateAction?: ToolEffectActionHydrator;
  }) {
    this.executorCapability = input.adapterDescriptorId;
    this.#persistence = input.persistence;
    this.#handles = input.handles;
    this.#clock = input.clock;
    this.#hydrateAction = input.hydrateAction;
  }

  public async execute(attempt: EffectAttempt, signal?: AbortSignal): Promise<EffectExecutionResult> {
    const capabilityId = requireMetadataString(attempt, "capabilityId");
    const lock = await this.#persistence.loadTaskCapabilityLock(attempt.taskId, capabilityId);
    if (lock === undefined) {
      return failed("tool.capability_lock_not_found", "Task capability lock is missing");
    }
    if (lock.adapterDescriptorSnapshot.adapterDescriptorId !== attempt.executorCapability) {
      return failed("tool.locked_adapter_mismatch", "Effect executor does not match the task capability lock");
    }
    const persistedAction = ActionSchema.safeParse(attempt.metadata.action);
    if (!persistedAction.success || persistedAction.data.actionId !== attempt.actionId) {
      return failed("tool.invalid_effect_metadata", "Effect metadata does not contain the exact Action");
    }
    const action = ActionSchema.parse(await this.#hydrateAction?.({
      attempt,
      action: persistedAction.data,
    }) ?? persistedAction.data);
    if (
      action.actionId !== attempt.actionId ||
      action.kind !== persistedAction.data.kind
    ) {
      return failed("tool.invalid_effect_metadata", "Hydrated Tool Action changed the locked identity");
    }
    const backend = this.#handles.toolExecutionBackend(
      lock.adapterDescriptorSnapshot.adapterDescriptorId,
      lock.adapterDescriptorSnapshot.revision,
    );
    const observation = ObservationSchema.safeParse(await backend.execute({
      lock,
      action,
      effectAttemptId: attempt.effectAttemptId,
      idempotencyKey: attempt.idempotencyKey,
      requestedAt: this.#clock.now(),
      ...(typeof attempt.metadata.deadlineAt === "string"
        ? { deadlineAt: attempt.metadata.deadlineAt }
        : {}),
    }, signal ?? new AbortController().signal));
    if (!observation.success || observation.data.actionId !== attempt.actionId) {
      throw new Error(
        "tool.invalid_observation: ToolExecutionBackend returned an invalid Observation for another Action",
      );
    }
    return toEffectResult(observation.data);
  }

  public async query(_attempt: EffectAttempt): Promise<EffectQueryResult> {
    return { outcome: "unknown" };
  }
}

function requireMetadataString(attempt: EffectAttempt, key: string): string {
  const value = attempt.metadata[key];
  if (typeof value !== "string") {
    throw new Error(`Effect metadata ${key} must be a string`);
  }
  return value;
}

function toEffectResult(observation: Observation): EffectExecutionResult {
  switch (observation.outcome) {
    case "succeeded":
      return {
        outcome: "succeeded",
        resultRef: observation.observationId,
        output: observation.output ?? null,
        observation,
      };
    case "failed":
      return { outcome: "failed", error: observation.error, observation };
    case "cancelled":
      return { outcome: "cancelled", error: observation.error, observation };
    case "timed_out":
      return { outcome: "timed_out", error: observation.error, observation };
    case "user_rejected":
      throw new Error("tool.invalid_observation: ToolExecutionBackend cannot return a user confirmation decision");
  }
}

function failed(code: string, message: string): EffectExecutionResult {
  return {
    outcome: "failed",
    error: { code, category: "validation", message, retryable: false },
  };
}
