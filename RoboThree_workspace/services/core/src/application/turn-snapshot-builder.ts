import {
  CONTEXT_SCHEMA_VERSION,
  JsonValueSchema,
  TurnContextSnapshotSchema,
} from "@robothree/contracts";
import type {
  ConversationMessage,
  TaskEvent,
  TurnContextSnapshot,
  TurnProjectionItem,
} from "@robothree/contracts";

import type { ConversationPersistence } from "../ports/conversation-persistence.js";
import type { TaskPersistence, PersistedTask } from "../ports/task-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

export type BuildTurnSnapshotInput = {
  snapshotId: string;
  sessionId: string;
  fromMessageSequence?: number;
  throughMessageSequence?: number;
  createdAt: string;
};

export class TurnSnapshotBuilder {
  readonly #conversationPersistence: ConversationPersistence;
  readonly #taskPersistence: TaskPersistence;

  constructor(input: {
    conversationPersistence: ConversationPersistence;
    taskPersistence: TaskPersistence;
  }) {
    this.#conversationPersistence = input.conversationPersistence;
    this.#taskPersistence = input.taskPersistence;
  }

  async build(input: BuildTurnSnapshotInput): Promise<TurnContextSnapshot> {
    const head = await this.#conversationPersistence.loadSession(input.sessionId);
    if (head === undefined) throw new Error(`Turn snapshot session not found: ${input.sessionId}`);
    const through = input.throughMessageSequence ?? head.messageSequence;
    const from = input.fromMessageSequence ?? (through === 0 ? 0 : 1);
    if (!Number.isSafeInteger(through) || through < 0 || through > head.messageSequence) {
      throw new Error("Turn snapshot throughMessageSequence is outside the SessionHead");
    }
    if (
      !Number.isSafeInteger(from)
      || from < 0
      || (through === 0 ? from !== 0 : from < 1 || from > through + 1)
    ) throw new Error("Turn snapshot fromMessageSequence is outside the selected range");
    if (from > 1 && head.activeCompactionId === undefined) {
      throw new Error("A raw-tail Turn snapshot requires an active Compaction");
    }
    const messages = through === 0 || from > through
      ? []
      : await this.#conversationPersistence.loadMessageRange(input.sessionId, from, through);
    const expectedMessageCount = through === 0 || from > through ? 0 : through - from + 1;
    if (
      messages.length !== expectedMessageCount
      || messages.some((message, index) => message.envelope.sequence !== from + index)
    ) {
      throw new Error("Turn snapshot conversation range is incomplete or non-contiguous");
    }

    const tasks = [...await this.#taskPersistence.listTasksBySession(input.sessionId)]
      .sort((left, right) => left.head.taskId.localeCompare(right.head.taskId));
    validateMessageTaskReferences(messages, tasks);

    const projection: TurnProjectionItem[] = [];
    for (const message of messages) {
      projection.push({
        type: "conversation_message",
        order: projection.length,
        sessionId: input.sessionId,
        messageId: message.envelope.messageId,
        messageSequence: message.envelope.sequence,
        messageDigest: message.envelope.messageDigest,
      });
    }

    const taskSources = [];
    for (const task of tasks) {
      const events = await this.#taskPersistence.loadEventsAfter(task.head.taskId, 0);
      const capabilityLocks = [
        ...await this.#taskPersistence.listTaskCapabilityLocks(task.head.taskId),
      ].sort((left, right) =>
        left.definitionSnapshot.capabilityId.localeCompare(
          right.definitionSnapshot.capabilityId,
        ));
      validateTaskEventRange(task, events);
      taskSources.push({
        taskId: task.head.taskId,
        stateRevision: task.head.stateRevision,
        lastEventSequence: task.head.lastEventSequence,
        checkpointId: task.checkpoint.checkpointId,
        stateDigest: task.checkpoint.stateDigest,
        capabilityLocks: capabilityLocks.map((lock) => ({
          lockId: lock.lockId,
          capabilityId: lock.definitionSnapshot.capabilityId,
          capabilityRevision: lock.definitionSnapshot.revision,
          registryRevision: lock.registryRevision,
          lockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock)),
        })),
      });
      projection.push({
        type: "task_state",
        order: projection.length,
        taskId: task.head.taskId,
        stateRevision: task.head.stateRevision,
        checkpointId: task.checkpoint.checkpointId,
        stateDigest: task.checkpoint.stateDigest,
      });
      for (const event of events) {
        projection.push({
          type: "task_event",
          order: projection.length,
          taskId: event.taskId,
          eventId: event.eventId,
          eventSequence: event.sequence,
          eventDigest: sha256CanonicalJson(JsonValueSchema.parse(event)),
        });
      }
    }

    const conversation = {
      sessionId: input.sessionId,
      messageSequence: head.messageSequence,
      contextRevision: head.contextRevision,
      ...(head.activeCompactionId === undefined
        ? {}
        : { activeCompactionId: head.activeCompactionId }),
      ...(messages.length === 0
        ? {}
        : {
          messageStartSequence: messages[0]!.envelope.sequence,
          messageEndSequence: messages.at(-1)!.envelope.sequence,
        }),
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(messages)),
    };
    const sourceDigest = sha256CanonicalJson(JsonValueSchema.parse({
      conversation,
      tasks: taskSources,
      projection,
    }));
    return TurnContextSnapshotSchema.parse({
      schemaVersion: CONTEXT_SCHEMA_VERSION,
      snapshotId: input.snapshotId,
      sessionId: input.sessionId,
      conversation,
      tasks: taskSources,
      projection,
      sourceDigest,
      createdAt: input.createdAt,
    });
  }
}

function validateTaskEventRange(task: PersistedTask, events: readonly TaskEvent[]): void {
  if (
    events.length !== task.head.lastEventSequence
    || events.some((event, index) => event.sequence !== index + 1)
  ) {
    throw new Error(`Task ${task.head.taskId} event range is incomplete or non-contiguous`);
  }
}

function validateMessageTaskReferences(
  messages: readonly ConversationMessage[],
  tasks: readonly PersistedTask[],
): void {
  const byTaskId = new Map(tasks.map((task) => [task.head.taskId, task]));
  for (const record of messages) {
    const taskId = record.envelope.taskId;
    if (taskId === undefined) continue;
    const task = byTaskId.get(taskId);
    if (task === undefined) {
      throw new Error(`Conversation message references Task outside the Session snapshot: ${taskId}`);
    }
    if (record.message.role === "assistant") {
      const actions = new Map(
        task.checkpoint.state.runs.flatMap((run) =>
          run.steps.map((step) => [step.action.actionId, step.action] as const)),
      );
      for (const call of record.message.toolCalls) {
        const action = actions.get(call.actionId);
        if (
          action === undefined
          || action.kind !== call.capabilityId
          || sha256CanonicalJson(JsonValueSchema.parse(action.payload))
            !== sha256CanonicalJson(JsonValueSchema.parse(call.arguments))
        ) {
          throw new Error(`Assistant tool call references missing or mismatched Action ${call.actionId}`);
        }
      }
    }
    if (record.message.role === "tool") {
      const observations = new Map(
        task.checkpoint.state.runs.flatMap((run) =>
          run.steps.flatMap((step) =>
            step.observation === undefined
              ? []
              : [[step.observation.observationId, step.observation] as const])),
      );
      const observation = observations.get(record.message.observationId);
      if (
        observation === undefined
        || observation.actionId !== record.message.actionId
        || observation.outcome !== record.message.outcome
        || sha256CanonicalJson(JsonValueSchema.parse(observation)) !== record.message.resultDigest
      ) {
        throw new Error(
          `Tool result references missing or mismatched Observation ${record.message.observationId}`,
        );
      }
    }
  }
}
