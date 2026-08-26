import {
  JsonObjectSchema,
  JsonValueSchema,
  PersistenceSchemaVersion,
  TaskCommandSchema,
  TaskRunStateSchema,
  TaskTransitionSchema,
  canonicalJsonStringify,
} from "@robothree/contracts";
import type {
  AcceptedCommandReceipt,
  CommandReceipt,
  EffectAttempt,
  OutboxRecord,
  RuntimeError,
  TaskCheckpoint,
  TaskCommand,
  TaskEvent,
  TaskHead,
  TaskInitialization,
  TaskRunState,
  TaskTransition,
  UserConfirmationDecision,
} from "@robothree/contracts";

import type { IdGenerator } from "../ports/id-generator.js";
import type { PersistedTask, TaskPersistence } from "../ports/task-persistence.js";
import type { EffectStateTransition } from "../ports/task-persistence.js";
import type { UserConfirmationTransition } from "../ports/task-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import { persistenceError } from "../persistence/validation.js";
import { createTaskRunState, reduceTaskState } from "../kernel/task-state-reducer.js";
import type { TaskCommandAccepted } from "../kernel/task-state-reducer.js";

export type DurableTaskCreateResult =
  | { ok: true; replayed: boolean; state: TaskRunState }
  | { ok: false; error: RuntimeError };

export type DurableTaskCommandResult = TaskCommandAccepted | {
  accepted: false;
  state?: TaskRunState;
  error: RuntimeError;
};

export type DurableTaskRuntimeOptions = {
  persistence: TaskPersistence;
  idGenerator: IdGenerator;
  outboxDestination?: string;
  maxCachedSnapshots?: number;
};

export class DurableTaskRuntime {
  readonly #persistence: TaskPersistence;
  readonly #idGenerator: IdGenerator;
  readonly #outboxDestination: string;
  readonly #maxCachedSnapshots: number;
  readonly #snapshots = new Map<string, TaskRunState>();
  readonly #mailboxes = new Map<string, Promise<void>>();

  constructor(options: DurableTaskRuntimeOptions) {
    if (options.outboxDestination !== undefined && options.outboxDestination.length === 0) {
      throw new Error("DurableTaskRuntime outboxDestination cannot be empty");
    }
    this.#persistence = options.persistence;
    this.#idGenerator = options.idGenerator;
    this.#outboxDestination = options.outboxDestination ?? "runtime.events";
    this.#maxCachedSnapshots = positiveInteger(
      options.maxCachedSnapshots ?? 256,
      "maxCachedSnapshots",
    );
  }

  createTask(input: TaskInitialization): Promise<DurableTaskCreateResult> {
    const initialState = createTaskRunState(input);
    return this.#enqueue(initialState.taskId, async () => {
      const task = createInitialPersistedTask(
        input,
        this.#idGenerator.next(),
      );
      const result = await this.#persistence.createTask(task);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      const state = freezeState(result.value.checkpoint.state);
      this.#remember(state);
      return { ok: true, replayed: result.replayed, state };
    });
  }

  async snapshot(taskId: string): Promise<TaskRunState | undefined> {
    const cached = this.#snapshots.get(taskId);
    if (cached !== undefined) {
      return cached;
    }
    const restored = await this.#restore(taskId);
    if (restored !== undefined) {
      this.#remember(restored);
    }
    return restored;
  }

  dispatch(input: TaskCommand): Promise<DurableTaskCommandResult> {
    const command = TaskCommandSchema.parse(input);
    return this.#enqueue(command.taskId, () => this.#dispatchSerialized(command));
  }

  dispatchWithEffectTransition(
    input: TaskCommand,
    transition: EffectStateTransition,
  ): Promise<DurableTaskCommandResult> {
    const command = TaskCommandSchema.parse(input);
    if (transition.attempt.taskId !== command.taskId) {
      throw new Error("Effect transition and Command must target the same task");
    }
    if (transition.attempt.status === "prepared" || transition.attempt.status === "dispatched") {
      throw new Error("Command-coupled effect transition must be terminal or uncertain");
    }
    return this.#enqueue(command.taskId, () => this.#dispatchSerialized(command, transition));
  }

  dispatchWithUserConfirmationTransition(
    input: TaskCommand,
    transition: UserConfirmationTransition,
  ): Promise<DurableTaskCommandResult> {
    const command = TaskCommandSchema.parse(input);
    if (transition.request.scope.taskId !== command.taskId) {
      throw new Error("User Confirmation transition and Command must target the same task");
    }
    return this.#enqueue(command.taskId, () => this.#dispatchSerialized(command, undefined, transition));
  }

  async #dispatchSerialized(
    command: TaskCommand,
    effectTransition?: EffectStateTransition,
    confirmationTransition?: UserConfirmationTransition,
  ): Promise<DurableTaskCommandResult> {
    const state = await this.snapshot(command.taskId);
    if (state === undefined) {
      return { accepted: false, error: persistenceError("persistence.task_not_found", "task does not exist") };
    }

    const commandDigest = sha256CanonicalJson(JsonValueSchema.parse(command));
    const existing = await this.#persistence.findCommandReceipt(command.commandId);
    if (existing !== undefined) {
      if (effectTransition !== undefined) {
        const persistedEffect = await this.#persistence.loadEffectAttempt(effectTransition.attempt.effectAttemptId);
        if (persistedEffect === undefined || !sameEffectAttempt(persistedEffect, effectTransition.attempt)) {
          return {
            accepted: false,
            state,
            error: persistenceError("persistence.idempotency_conflict", "Command receipt and Effect result disagree"),
          };
        }
      }
      if (confirmationTransition !== undefined) {
        const persistedConfirmation = await this.#persistence.loadUserConfirmation(
          confirmationTransition.request.confirmationId,
        );
        if (persistedConfirmation === undefined
          || canonicalJsonStringify(JsonValueSchema.parse(persistedConfirmation.request))
            !== canonicalJsonStringify(JsonValueSchema.parse(confirmationTransition.request))
          || (confirmationTransition.type === "decision"
            && canonicalJsonStringify(JsonValueSchema.parse(persistedConfirmation.decision))
              !== canonicalJsonStringify(JsonValueSchema.parse(confirmationTransition.decision)))) {
          return {
            accepted: false,
            state,
            error: persistenceError("persistence.idempotency_conflict", "Command receipt and User Confirmation disagree"),
          };
        }
      }
      return this.#replayReceipt(command, commandDigest, existing, state);
    }

    const reduced = reduceTaskState(state, command);
    if (!reduced.accepted) {
      const receipt = rejectedReceipt(command, commandDigest, state.revision, reduced.error);
      if (
        command.type === "record_observation"
        && reduced.error.code === "runtime.stale_run"
      ) {
        const audited = await this.#recordLateObservation(command, reduced.error);
        if (audited !== undefined) {
          return { accepted: false, state, error: audited };
        }
      }
      const committed = await this.#persistence.commitRejectedCommand(receipt);
      return committed.ok
        ? { accepted: false, state, error: reduced.error }
        : { accepted: false, state, error: committed.error };
    }

    const eventId = this.#idGenerator.next();
    const checkpointId = this.#idGenerator.next();
    const outboxId = this.#idGenerator.next();
    const persisted = await this.#persistence.loadTask(command.taskId);
    if (persisted === undefined || persisted.head.stateRevision !== state.revision) {
      return {
        accepted: false,
        state,
        error: persistenceError("persistence.revision_conflict", "persisted task changed before command commit"),
      };
    }
    const event = appliedEvent(command, reduced.transition, persisted.head.lastEventSequence + 1, eventId);
    const effectEvent = effectTransition === undefined
      ? undefined
      : effectEventRecord(
        effectTransition.attempt,
        event.sequence + 1,
        this.#idGenerator.next(),
      );
    const confirmationEvent = confirmationTransition === undefined
      ? undefined
      : confirmationEventRecord(
        confirmationTransition,
        (effectEvent ?? event).sequence + 1,
        this.#idGenerator.next(),
      );
    const finalEvent = confirmationEvent ?? effectEvent ?? event;
    const checkpoint = nextCheckpoint(reduced.state, finalEvent, checkpointId, persisted.checkpoint.checkpointId);
    const receipt = acceptedReceipt(command, commandDigest, reduced.transition, event, checkpoint);
    const head = nextHead(reduced.state, checkpoint, persisted);
    const outbox = outboxRecord(event, outboxId, this.#outboxDestination);
    const additionalEvents = [effectEvent, confirmationEvent].filter(
      (candidate): candidate is TaskEvent => candidate !== undefined,
    );
    const additionalOutbox = additionalEvents.map((candidate) => (
      outboxRecord(candidate, this.#idGenerator.next(), this.#outboxDestination)
    ));
    const committed = await this.#persistence.commitAcceptedCommand({
      expectedRevision: state.revision,
      head,
      event,
      ...(additionalEvents.length === 0 ? {} : { additionalEvents }),
      checkpoint,
      receipt,
      outbox: [outbox, ...additionalOutbox],
      ...(effectTransition === undefined ? {} : { effectTransition }),
      ...(confirmationTransition === undefined ? {} : { confirmationTransition }),
    });
    if (!committed.ok) {
      return { accepted: false, state, error: committed.error };
    }

    const committedState = freezeState(committed.value.checkpoint.state);
    this.#remember(committedState);
    return { accepted: true, state: committedState, transition: receipt.transition };
  }

  async #recordLateObservation(
    command: Extract<TaskCommand, { type: "record_observation" }>,
    error: RuntimeError,
  ): Promise<RuntimeError | undefined> {
    const existingEvents = await this.#persistence.loadEventsAfter(
      command.taskId,
      0,
    );
    if (existingEvents.some((event) =>
      event.type === "runtime.command_rejected"
      && event.causationId === command.commandId)) {
      return undefined;
    }
    let lastError: RuntimeError | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const persisted = await this.#persistence.loadTask(command.taskId);
      if (persisted === undefined) {
        return persistenceError(
          "persistence.task_not_found",
          "task does not exist while recording a late Observation",
        );
      }
      const event: TaskEvent = {
        schemaVersion: PersistenceSchemaVersion,
        eventId: this.#idGenerator.next(),
        taskId: command.taskId,
        sequence: persisted.head.lastEventSequence + 1,
        type: "runtime.command_rejected",
        occurredAt: command.issuedAt,
        causationId: command.commandId,
        correlationId: command.taskId,
        runId: command.runId,
        stepId: command.stepId,
        payload: JsonObjectSchema.parse({
          commandType: command.type,
          observationId: command.observation.observationId,
          actionId: command.observation.actionId,
          observedAt: command.observation.observedAt,
          outcome: command.observation.outcome,
          observationDigest: sha256CanonicalJson(
            JsonValueSchema.parse(command.observation),
          ),
          rejectionCode: error.code,
        }),
      };
      const committed = await this.#persistence.commitRejectedCommandEvent({
        expectedEventSequence: persisted.head.lastEventSequence,
        event,
        outbox: [{
          schemaVersion: PersistenceSchemaVersion,
          outboxId: this.#idGenerator.next(),
          eventId: event.eventId,
          taskId: command.taskId,
          destination: this.#outboxDestination,
          payload: JsonObjectSchema.parse({ event }),
          attemptCount: 0,
          createdAt: event.occurredAt,
        }],
      });
      if (committed.ok) return undefined;
      lastError = committed.error;
      if (lastError.code !== "persistence.sequence_conflict") {
        return lastError;
      }
      const concurrentEvents = await this.#persistence.loadEventsAfter(
        command.taskId,
        persisted.head.lastEventSequence,
      );
      if (concurrentEvents.some((candidate) =>
        candidate.type === "runtime.command_rejected"
        && candidate.causationId === command.commandId)) {
        return undefined;
      }
    }
    return lastError;
  }

  public stats(): Readonly<{
    cachedSnapshots: number;
    activeMailboxes: number;
    maxCachedSnapshots: number;
  }> {
    return Object.freeze({
      cachedSnapshots: this.#snapshots.size,
      activeMailboxes: this.#mailboxes.size,
      maxCachedSnapshots: this.#maxCachedSnapshots,
    });
  }

  public clearCachedSnapshots(): void {
    this.#snapshots.clear();
  }

  async #replayReceipt(
    command: TaskCommand,
    commandDigest: string,
    receipt: CommandReceipt,
    currentState: TaskRunState,
  ): Promise<DurableTaskCommandResult> {
    if (receipt.taskId !== command.taskId || receipt.commandDigest !== commandDigest) {
      return {
        accepted: false,
        state: currentState,
        error: persistenceError(
          "persistence.idempotency_conflict",
          "commandId already exists for another task or command payload",
        ),
      };
    }
    if (receipt.outcome === "accepted") {
      const checkpoint = await this.#persistence.loadCheckpoint(receipt.checkpointId);
      if (checkpoint === undefined) {
        return {
          accepted: false,
          state: currentState,
          error: persistenceError("persistence.integrity_violation", "accepted receipt checkpoint is missing"),
        };
      }
      return {
        accepted: true,
        state: freezeState(checkpoint.state),
        transition: receipt.transition,
      };
    }
    const checkpoint = await this.#persistence.loadCheckpointAtRevision(receipt.taskId, receipt.stateRevision);
    if (checkpoint === undefined) {
      return {
        accepted: false,
        state: currentState,
        error: persistenceError("persistence.integrity_violation", "rejected receipt revision checkpoint is missing"),
      };
    }
    return { accepted: false, state: freezeState(checkpoint.state), error: receipt.error };
  }

  async #restore(taskId: string): Promise<TaskRunState | undefined> {
    const persisted = await this.#persistence.loadTask(taskId);
    if (persisted === undefined) {
      return undefined;
    }
    const tail = await this.#persistence.loadEventsAfter(taskId, persisted.checkpoint.lastEventSequence);
    return replayTaskEvents(persisted, tail);
  }

  #enqueue<T>(taskId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#mailboxes.get(taskId) ?? Promise.resolve();
    const result = previous.then(operation);
    const mailboxRef: { settled: Promise<void> | undefined } = { settled: undefined };
    const tracked = result.finally(() => {
      if (mailboxRef.settled !== undefined
        && this.#mailboxes.get(taskId) === mailboxRef.settled) {
        this.#mailboxes.delete(taskId);
      }
    });
    const settled = tracked.then(
      () => undefined,
      () => undefined,
    );
    mailboxRef.settled = settled;
    this.#mailboxes.set(taskId, settled);
    return tracked;
  }

  #remember(state: TaskRunState): void {
    this.#snapshots.delete(state.taskId);
    this.#snapshots.set(state.taskId, state);
    while (this.#snapshots.size > this.#maxCachedSnapshots) {
      const oldestTaskId = this.#snapshots.keys().next().value;
      if (oldestTaskId === undefined) {
        break;
      }
      this.#snapshots.delete(oldestTaskId);
    }
  }
}

function confirmationEventRecord(
  transition: UserConfirmationTransition,
  sequence: number,
  eventId: string,
): TaskEvent {
  const request = transition.request;
  const decision: UserConfirmationDecision | undefined = transition.type === "decision"
    ? transition.decision
    : undefined;
  return {
    schemaVersion: PersistenceSchemaVersion,
    eventId,
    taskId: request.scope.taskId,
    sequence,
    type: transition.type === "request"
      ? "authorization.user_confirmation_requested"
      : "authorization.user_confirmation_decided",
    occurredAt: decision?.decidedAt ?? request.requestedAt,
    causationId: decision?.decisionId ?? request.confirmationId,
    correlationId: request.scope.taskId,
    ...((request.scope.type === "single_action" || (request.runId !== undefined && request.stepId !== undefined)) ? {
      runId: request.scope.type === "single_action" ? request.scope.runId : request.runId,
      stepId: request.scope.type === "single_action" ? request.scope.stepId : request.stepId,
    } : {}),
    payload: JsonObjectSchema.parse({ request, ...(decision === undefined ? {} : { decision }) }),
  };
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function replayTaskEvents(
  persisted: PersistedTask,
  events: readonly TaskEvent[],
): TaskRunState {
  const checkpointDigest = sha256CanonicalJson(JsonValueSchema.parse(persisted.checkpoint.state));
  if (checkpointDigest !== persisted.checkpoint.stateDigest) {
    throw new Error("Persistence recovery failed: checkpoint digest mismatch");
  }
  let state = TaskRunStateSchema.parse(persisted.checkpoint.state);
  let expectedSequence = persisted.checkpoint.lastEventSequence + 1;
  for (const event of events) {
    if (event.taskId !== persisted.head.taskId || event.sequence !== expectedSequence) {
      throw new Error("Persistence recovery failed: task event sequence is not contiguous");
    }
    expectedSequence += 1;
    if (event.type !== "runtime.command_applied") {
      continue;
    }
    const command = TaskCommandSchema.parse(event.payload.command);
    const declaredTransition = TaskTransitionSchema.parse(event.payload.transition);
    const reduced = reduceTaskState(state, command);
    if (!reduced.accepted) {
      throw new Error(`Persistence recovery failed: replay rejected ${reduced.error.code}`);
    }
    if (canonicalJsonStringify(JsonValueSchema.parse(reduced.transition))
      !== canonicalJsonStringify(JsonValueSchema.parse(declaredTransition))) {
      throw new Error("Persistence recovery failed: replay transition mismatch");
    }
    state = reduced.state;
  }
  if (
    expectedSequence - 1 !== persisted.head.lastEventSequence
    || state.revision !== persisted.head.stateRevision
    || state.status !== persisted.head.status
  ) {
    throw new Error("Persistence recovery failed: reconstructed state does not match task head");
  }
  return freezeState(state);
}

export function createInitialPersistedTask(
  input: TaskInitialization,
  checkpointId: string,
): PersistedTask {
  const state = createTaskRunState(input);
  const checkpoint = initialCheckpoint(state, checkpointId);
  return {
    head: initialHead(state, checkpoint),
    checkpoint,
  };
}

function initialCheckpoint(state: TaskRunState, checkpointId: string): TaskCheckpoint {
  return {
    schemaVersion: PersistenceSchemaVersion,
    checkpointId,
    taskId: state.taskId,
    stateRevision: 0,
    lastEventSequence: 0,
    state,
    stateDigest: sha256CanonicalJson(JsonValueSchema.parse(state)),
    createdAt: state.createdAt,
  };
}

function initialHead(state: TaskRunState, checkpoint: TaskCheckpoint): TaskHead {
  const initialization: TaskInitialization = {
    taskId: state.taskId,
    ...(state.sessionId === undefined ? {} : { sessionId: state.sessionId }),
    agentDefinition: state.agentDefinition,
    goal: state.goal,
    createdAt: state.createdAt,
    ...(state.deadlineAt === undefined ? {} : { deadlineAt: state.deadlineAt }),
  };
  return {
    schemaVersion: PersistenceSchemaVersion,
    taskId: state.taskId,
    initializationDigest: sha256CanonicalJson(JsonValueSchema.parse(initialization)),
    stateRevision: 0,
    lastEventSequence: 0,
    latestCheckpointId: checkpoint.checkpointId,
    status: state.status,
    updatedAt: state.updatedAt,
  };
}

function appliedEvent(
  command: TaskCommand,
  transition: TaskTransition,
  sequence: number,
  eventId: string,
): TaskEvent {
  return {
    schemaVersion: PersistenceSchemaVersion,
    eventId,
    taskId: command.taskId,
    sequence,
    type: "runtime.command_applied",
    occurredAt: transition.occurredAt,
    causationId: command.commandId,
    correlationId: command.taskId,
    ...(transition.runId === undefined ? {} : { runId: transition.runId }),
    ...(transition.stepId === undefined ? {} : { stepId: transition.stepId }),
    payload: JsonObjectSchema.parse({ command, transition }),
  };
}

function nextCheckpoint(
  state: TaskRunState,
  event: TaskEvent,
  checkpointId: string,
  parentCheckpointId: string,
): TaskCheckpoint {
  return {
    schemaVersion: PersistenceSchemaVersion,
    checkpointId,
    taskId: state.taskId,
    stateRevision: state.revision,
    lastEventSequence: event.sequence,
    parentCheckpointId,
    state,
    stateDigest: sha256CanonicalJson(JsonValueSchema.parse(state)),
    createdAt: state.updatedAt,
  };
}

function nextHead(
  state: TaskRunState,
  checkpoint: TaskCheckpoint,
  persisted: PersistedTask,
): TaskHead {
  return {
    ...persisted.head,
    stateRevision: state.revision,
    lastEventSequence: checkpoint.lastEventSequence,
    latestCheckpointId: checkpoint.checkpointId,
    status: state.status,
    updatedAt: state.updatedAt,
  };
}

function acceptedReceipt(
  command: TaskCommand,
  commandDigest: string,
  transition: TaskTransition,
  event: TaskEvent,
  checkpoint: TaskCheckpoint,
): AcceptedCommandReceipt {
  return {
    schemaVersion: PersistenceSchemaVersion,
    commandId: command.commandId,
    taskId: command.taskId,
    commandType: command.type,
    commandDigest,
    receivedAt: command.issuedAt,
    outcome: "accepted",
    stateRevision: transition.revision,
    eventId: event.eventId,
    checkpointId: checkpoint.checkpointId,
    transition,
  };
}

function rejectedReceipt(
  command: TaskCommand,
  commandDigest: string,
  stateRevision: number,
  error: RuntimeError,
): Extract<CommandReceipt, { outcome: "rejected" }> {
  return {
    schemaVersion: PersistenceSchemaVersion,
    commandId: command.commandId,
    taskId: command.taskId,
    commandType: command.type,
    commandDigest,
    receivedAt: command.issuedAt,
    outcome: "rejected",
    stateRevision,
    error,
  };
}

function outboxRecord(event: TaskEvent, outboxId: string, destination: string): OutboxRecord {
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

function effectEventRecord(attempt: EffectAttempt, sequence: number, eventId: string): TaskEvent {
  return {
    schemaVersion: PersistenceSchemaVersion,
    eventId,
    taskId: attempt.taskId,
    sequence,
    type: effectEventType(attempt),
    occurredAt: attempt.updatedAt,
    causationId: attempt.effectAttemptId,
    correlationId: attempt.taskId,
    runId: attempt.runId,
    stepId: attempt.stepId,
    payload: JsonObjectSchema.parse({ attempt }),
  };
}

function effectEventType(attempt: EffectAttempt): "runtime.effect_result_recorded" | "runtime.effect_uncertain" | "authorization.invalidated_before_dispatch" {
  if (attempt.terminalError?.code === "authorization.invalidated_before_dispatch") {
    return "authorization.invalidated_before_dispatch";
  }
  return attempt.status === "uncertain" ? "runtime.effect_uncertain" : "runtime.effect_result_recorded";
}

function sameEffectAttempt(left: EffectAttempt, right: EffectAttempt): boolean {
  return canonicalJsonStringify(JsonValueSchema.parse(left)) === canonicalJsonStringify(JsonValueSchema.parse(right));
}

function freezeState(state: TaskRunState): TaskRunState {
  return deepFreeze(TaskRunStateSchema.parse(state));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
