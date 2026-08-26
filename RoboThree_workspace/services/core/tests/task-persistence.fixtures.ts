import {
  JsonObjectSchema,
  JsonValueSchema,
  PersistenceSchemaVersion,
} from "@robothree/contracts";
import type {
  AcceptedCommandReceipt,
  OutboxRecord,
  TaskCheckpoint,
  TaskEvent,
  TaskHead,
  TaskRunState,
} from "@robothree/contracts";

import {
  createTaskRunState,
  reduceTaskState,
  sha256CanonicalJson,
} from "../src/index.js";
import type { AcceptedCommandCommit, PersistedTask } from "../src/index.js";

export const persistenceIds = {
  task: "019f7447-a784-77b2-a716-000000001001",
  agent: "019f7447-a784-77b2-a716-000000001002",
  checkpoint0: "019f7447-a784-77b2-a716-000000001003",
  checkpoint1: "019f7447-a784-77b2-a716-000000001004",
  command1: "019f7447-a784-77b2-a716-000000001005",
  event1: "019f7447-a784-77b2-a716-000000001006",
  outbox1: "019f7447-a784-77b2-a716-000000001007",
  run1: "019f7447-a784-77b2-a716-000000001008",
  checkpoint2: "019f7447-a784-77b2-a716-000000001009",
  command2: "019f7447-a784-77b2-a716-000000001010",
  event2: "019f7447-a784-77b2-a716-000000001011",
  outbox2: "019f7447-a784-77b2-a716-000000001012",
};

export const persistenceAt = {
  created: "2026-07-20T13:00:00.000Z",
  command: "2026-07-20T13:01:00.000Z",
  command2: "2026-07-20T13:02:00.000Z",
};

export function initialPersistedTask(): PersistedTask {
  const state = createTaskRunState({
    taskId: persistenceIds.task,
    agentDefinition: { agentDefinitionId: persistenceIds.agent, version: "1.0.0" },
    goal: "verify durable task persistence",
    createdAt: persistenceAt.created,
  });
  const checkpoint: TaskCheckpoint = {
    schemaVersion: PersistenceSchemaVersion,
    checkpointId: persistenceIds.checkpoint0,
    taskId: state.taskId,
    stateRevision: 0,
    lastEventSequence: 0,
    state,
    stateDigest: digestState(state),
    createdAt: persistenceAt.created,
  };
  const head: TaskHead = {
    schemaVersion: PersistenceSchemaVersion,
    taskId: state.taskId,
    initializationDigest: sha256CanonicalJson(JsonValueSchema.parse({
      taskId: state.taskId,
      goal: state.goal,
      agentDefinition: state.agentDefinition,
      createdAt: state.createdAt,
    })),
    stateRevision: 0,
    lastEventSequence: 0,
    latestCheckpointId: checkpoint.checkpointId,
    status: state.status,
    updatedAt: state.updatedAt,
  };
  return { head, checkpoint };
}

export function firstAcceptedCommit(overrides: {
  commandDigest?: AcceptedCommandReceipt["commandDigest"];
  eventSequence?: number;
  outbox?: readonly OutboxRecord[];
} = {}): AcceptedCommandCommit {
  const initial = initialPersistedTask();
  const command = {
    commandId: persistenceIds.command1,
    taskId: persistenceIds.task,
    issuedAt: persistenceAt.command,
    type: "start_run" as const,
    runId: persistenceIds.run1,
  };
  const reduced = reduceTaskState(initial.checkpoint.state, command);
  if (!reduced.accepted) {
    throw new Error(`Fixture reducer rejected command: ${reduced.error.code}`);
  }
  const sequence = overrides.eventSequence ?? 1;
  const event: TaskEvent = {
    schemaVersion: PersistenceSchemaVersion,
    eventId: persistenceIds.event1,
    taskId: persistenceIds.task,
    sequence,
    type: "runtime.command_applied",
    occurredAt: persistenceAt.command,
    causationId: persistenceIds.command1,
    correlationId: persistenceIds.task,
    runId: persistenceIds.run1,
    payload: JsonObjectSchema.parse({ command, transition: reduced.transition }),
  };
  const checkpoint: TaskCheckpoint = {
    schemaVersion: PersistenceSchemaVersion,
    checkpointId: persistenceIds.checkpoint1,
    taskId: persistenceIds.task,
    stateRevision: 1,
    lastEventSequence: sequence,
    parentCheckpointId: persistenceIds.checkpoint0,
    state: reduced.state,
    stateDigest: digestState(reduced.state),
    createdAt: persistenceAt.command,
  };
  const commandDigest = overrides.commandDigest
    ?? sha256CanonicalJson(JsonValueSchema.parse(command));
  const receipt: AcceptedCommandReceipt = {
    schemaVersion: PersistenceSchemaVersion,
    commandId: persistenceIds.command1,
    taskId: persistenceIds.task,
    commandType: "start_run",
    commandDigest,
    receivedAt: persistenceAt.command,
    outcome: "accepted",
    stateRevision: 1,
    eventId: persistenceIds.event1,
    checkpointId: persistenceIds.checkpoint1,
    transition: reduced.transition,
  };
  const defaultOutbox: OutboxRecord[] = [{
    schemaVersion: PersistenceSchemaVersion,
    outboxId: persistenceIds.outbox1,
    eventId: persistenceIds.event1,
    taskId: persistenceIds.task,
    destination: "runtime.events",
    payload: JsonObjectSchema.parse({ eventId: persistenceIds.event1 }),
    attemptCount: 0,
    createdAt: persistenceAt.command,
  }];
  const head: TaskHead = {
    ...initial.head,
    stateRevision: 1,
    lastEventSequence: sequence,
    latestCheckpointId: persistenceIds.checkpoint1,
    status: reduced.state.status,
    updatedAt: persistenceAt.command,
  };
  return {
    expectedRevision: 0,
    head,
    event,
    checkpoint,
    receipt,
    outbox: overrides.outbox ?? defaultOutbox,
  };
}

export function digestState(state: TaskRunState): TaskCheckpoint["stateDigest"] {
  return sha256CanonicalJson(JsonValueSchema.parse(state));
}

export function secondAcceptedCommit(): AcceptedCommandCommit {
  const first = firstAcceptedCommit();
  const command = {
    commandId: persistenceIds.command2,
    taskId: persistenceIds.task,
    issuedAt: persistenceAt.command2,
    type: "complete_run" as const,
    runId: persistenceIds.run1,
  };
  const reduced = reduceTaskState(first.checkpoint.state, command);
  if (!reduced.accepted) {
    throw new Error(`Fixture reducer rejected second command: ${reduced.error.code}`);
  }
  const event: TaskEvent = {
    schemaVersion: PersistenceSchemaVersion,
    eventId: persistenceIds.event2,
    taskId: persistenceIds.task,
    sequence: 2,
    type: "runtime.command_applied",
    occurredAt: persistenceAt.command2,
    causationId: persistenceIds.command2,
    correlationId: persistenceIds.task,
    runId: persistenceIds.run1,
    payload: JsonObjectSchema.parse({ command, transition: reduced.transition }),
  };
  const checkpoint: TaskCheckpoint = {
    schemaVersion: PersistenceSchemaVersion,
    checkpointId: persistenceIds.checkpoint2,
    taskId: persistenceIds.task,
    stateRevision: 2,
    lastEventSequence: 2,
    parentCheckpointId: persistenceIds.checkpoint1,
    state: reduced.state,
    stateDigest: digestState(reduced.state),
    createdAt: persistenceAt.command2,
  };
  const receipt: AcceptedCommandReceipt = {
    schemaVersion: PersistenceSchemaVersion,
    commandId: persistenceIds.command2,
    taskId: persistenceIds.task,
    commandType: "complete_run",
    commandDigest: sha256CanonicalJson(JsonValueSchema.parse(command)),
    receivedAt: persistenceAt.command2,
    outcome: "accepted",
    stateRevision: 2,
    eventId: persistenceIds.event2,
    checkpointId: persistenceIds.checkpoint2,
    transition: reduced.transition,
  };
  return {
    expectedRevision: 1,
    head: {
      ...first.head,
      stateRevision: 2,
      lastEventSequence: 2,
      latestCheckpointId: persistenceIds.checkpoint2,
      status: reduced.state.status,
      updatedAt: persistenceAt.command2,
    },
    event,
    checkpoint,
    receipt,
    outbox: [{
      schemaVersion: PersistenceSchemaVersion,
      outboxId: persistenceIds.outbox2,
      eventId: persistenceIds.event2,
      taskId: persistenceIds.task,
      destination: "runtime.events",
      payload: JsonObjectSchema.parse({ eventId: persistenceIds.event2 }),
      attemptCount: 0,
      createdAt: persistenceAt.command2,
    }],
  };
}
