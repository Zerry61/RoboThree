import {
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
} from "@robothree/contracts";
import type {
  ConversationMessage,
  Observation,
  ProviderNeutralMessage,
  TaskCommand,
} from "@robothree/contracts";

import {
  DurableTaskRuntime,
  FakeIdGenerator,
  sha256CanonicalJson,
} from "../src/index.js";
import type {
  ConversationPersistence,
  TaskPersistence,
} from "../src/index.js";

const entityId = (value: number) =>
  `019f7c00-0000-7000-8000-${String(value).padStart(12, "0")}`;

export const turnIds = {
  session: entityId(1),
  otherSession: entityId(2),
  task1: entityId(3),
  task2: entityId(4),
  agent: entityId(5),
  run: entityId(6),
  step: entityId(7),
  action: entityId(8),
  observation: entityId(9),
  plan: entityId(10),
  planRevision: entityId(11),
  startRunCommand: entityId(12),
  startStepCommand: entityId(13),
  observationCommand: entityId(14),
  toolCall: entityId(15),
  snapshot: entityId(16),
};

export const turnAt = {
  created: "2026-07-23T10:00:00.000Z",
  run: "2026-07-23T10:01:00.000Z",
  step: "2026-07-23T10:02:00.000Z",
  observation: "2026-07-23T10:03:00.000Z",
  messageBase: Date.parse("2026-07-23T10:10:00.000Z"),
  snapshot: "2026-07-23T10:20:00.000Z",
};

export const toolObservation: Observation = {
  observationId: turnIds.observation,
  actionId: turnIds.action,
  observedAt: turnAt.observation,
  outcome: "succeeded",
  output: { echo: "hello" },
};

export async function seedTurnFixture(
  conversation: ConversationPersistence,
  tasks: TaskPersistence,
): Promise<readonly ConversationMessage[]> {
  const task1Ids = Array.from({ length: 10 }, (_, index) => entityId(100 + index));
  const task1Runtime = new DurableTaskRuntime({
    persistence: tasks,
    idGenerator: new FakeIdGenerator(task1Ids),
  });
  await task1Runtime.createTask({
    taskId: turnIds.task1,
    sessionId: turnIds.session,
    agentDefinition: { agentDefinitionId: turnIds.agent, version: "1.0.0" },
    goal: "execute the fixture tool",
    createdAt: turnAt.created,
  });
  for (const command of task1Commands()) {
    const result = await task1Runtime.dispatch(command);
    if (!result.accepted) throw new Error(`Fixture task command rejected: ${result.error.code}`);
  }

  const task2Runtime = new DurableTaskRuntime({
    persistence: tasks,
    idGenerator: new FakeIdGenerator([entityId(200)]),
  });
  await task2Runtime.createTask({
    taskId: turnIds.task2,
    sessionId: turnIds.session,
    agentDefinition: { agentDefinitionId: turnIds.agent, version: "1.0.0" },
    goal: "hold the second fixture task",
    createdAt: turnAt.created,
  });

  await conversation.createSession({
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    sessionId: turnIds.session,
    messageSequence: 0,
    sessionEventSequence: 0,
    contextRevision: 0,
    createdAt: turnAt.created,
    updatedAt: turnAt.created,
  });
  const messages = turnMessages();
  for (const message of messages) {
    await conversation.appendMessage({
      expectedMessageSequence: message.envelope.sequence - 1,
      message,
      updatedAt: message.envelope.createdAt,
    });
  }
  return messages;
}

export function turnMessages(): readonly ConversationMessage[] {
  return [
    richMessage(1, {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user",
      content: [{ type: "text", text: "Start the first request." }],
    }),
    richMessage(2, {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "assistant",
      content: [{ type: "text", text: "The second task is noted." }],
      toolCalls: [],
    }, turnIds.task2),
    richMessage(3, {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user",
      content: [{ type: "text", text: "Use the echo tool." }],
    }),
    richMessage(4, {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "assistant",
      content: [],
      toolCalls: [{
        toolCallId: turnIds.toolCall,
        taskId: turnIds.task1,
        actionId: turnIds.action,
        capabilityId: "tool.echo",
        arguments: { text: "hello" },
      }],
    }, turnIds.task1),
    richMessage(5, {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "tool",
      toolCallId: turnIds.toolCall,
      taskId: turnIds.task1,
      actionId: turnIds.action,
      observationId: turnIds.observation,
      outcome: "succeeded",
      resultDigest: sha256CanonicalJson(JsonValueSchema.parse(toolObservation)),
      content: [{ type: "text", text: "hello" }],
    }, turnIds.task1),
    richMessage(6, {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user",
      content: [{ type: "text", text: "Finish the turn." }],
    }),
    richMessage(7, {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "assistant",
      content: [{ type: "text", text: "The echo action succeeded." }],
      toolCalls: [],
    }, turnIds.task1),
  ];
}

function task1Commands(): readonly TaskCommand[] {
  return [
    {
      commandId: turnIds.startRunCommand,
      taskId: turnIds.task1,
      issuedAt: turnAt.run,
      type: "start_run",
      runId: turnIds.run,
    },
    {
      commandId: turnIds.startStepCommand,
      taskId: turnIds.task1,
      issuedAt: turnAt.step,
      type: "start_step",
      runId: turnIds.run,
      stepId: turnIds.step,
      planRevision: {
        executionPlanId: turnIds.plan,
        planRevisionId: turnIds.planRevision,
        revision: 1,
      },
      action: {
        actionId: turnIds.action,
        kind: "tool.echo",
        payload: { text: "hello" },
      },
    },
    {
      commandId: turnIds.observationCommand,
      taskId: turnIds.task1,
      issuedAt: turnAt.observation,
      type: "record_observation",
      runId: turnIds.run,
      stepId: turnIds.step,
      observation: toolObservation,
    },
  ];
}

function richMessage(
  sequence: number,
  message: ProviderNeutralMessage,
  taskId?: string,
): ConversationMessage {
  const envelope = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    messageId: entityId(300 + sequence),
    sessionId: turnIds.session,
    sequence,
    messageSchemaVersion: MODEL_PROTOCOL_VERSION,
    messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
    ...(taskId === undefined ? {} : { taskId }),
    createdAt: new Date(turnAt.messageBase + sequence * 60_000).toISOString(),
  };
  return { envelope, message };
}
