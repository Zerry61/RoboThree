import {
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  type AssistantToolCall,
  type ConversationMessage,
  type SessionHead,
} from "@robothree/contracts";

import {
  TOOL_CALL_BATCH_SCHEMA_VERSION,
  calculateToolCallBatchDigest,
  sha256CanonicalJson,
  type AppendAssistantToolCallBatchInput,
  type AppendToolResultAndCompleteDispositionInput,
  type AssistantConversationMessage,
  type ToolCallBatchRecord,
  type ToolCallDispositionRecord,
  type ToolResultConversationMessage,
} from "../src/index.js";

export const batchIds = {
  session: "019f9000-0000-7000-8000-000000000001",
  task: "019f9000-0000-7000-8000-000000000002",
  run: "019f9000-0000-7000-8000-000000000003",
  assistantMessage: "019f9000-0000-7000-8000-000000000004",
  batch: "019f9000-0000-7000-8000-000000000005",
  firstToolCall: "019f9000-0000-7000-8000-000000000006",
  firstAction: "019f9000-0000-7000-8000-000000000007",
  secondToolCall: "019f9000-0000-7000-8000-000000000008",
  secondAction: "019f9000-0000-7000-8000-000000000009",
  effectAttempt: "019f9000-0000-7000-8000-000000000010",
  resultMessage: "019f9000-0000-7000-8000-000000000011",
  observation: "019f9000-0000-7000-8000-000000000012",
  confirmation: "019f9000-0000-7000-8000-000000000013",
  legacyMessage: "019f9000-0000-7000-8000-000000000014",
};

export const batchAt = {
  sessionCreated: "2026-08-02T11:58:00.000Z",
  created: "2026-08-02T12:00:00.000Z",
  linked: "2026-08-02T12:01:00.000Z",
  completed: "2026-08-02T12:02:00.000Z",
  legacy: "2026-08-02T11:59:00.000Z",
};

export function batchSessionHead(): SessionHead {
  return {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    sessionId: batchIds.session,
    messageSequence: 0,
    sessionEventSequence: 0,
    contextRevision: 0,
    createdAt: batchAt.sessionCreated,
    updatedAt: batchAt.sessionCreated,
  };
}

export function assistantToolCalls(): readonly AssistantToolCall[] {
  return [
    {
      toolCallId: batchIds.firstToolCall,
      taskId: batchIds.task,
      actionId: batchIds.firstAction,
      capabilityId: "tool.echo",
      arguments: { text: "first" },
    },
    {
      toolCallId: batchIds.secondToolCall,
      taskId: batchIds.task,
      actionId: batchIds.secondAction,
      capabilityId: "tool.echo",
      arguments: { text: "second" },
    },
  ];
}

export function assistantBatchInput(
  overrides: Partial<AppendAssistantToolCallBatchInput> = {},
): AppendAssistantToolCallBatchInput {
  const calls = assistantToolCalls();
  const providerMessage: AssistantConversationMessage["message"] = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "assistant",
    content: [{ type: "text", text: "I will use two tools." }],
    toolCalls: [...calls],
  };
  const message: AssistantConversationMessage = {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: batchIds.assistantMessage,
      sessionId: batchIds.session,
      sequence: 1,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(providerMessage)),
      taskId: batchIds.task,
      createdAt: batchAt.created,
    },
    message: providerMessage,
  };
  const batch: ToolCallBatchRecord = {
    schemaVersion: TOOL_CALL_BATCH_SCHEMA_VERSION,
    batchId: batchIds.batch,
    sessionId: batchIds.session,
    taskId: batchIds.task,
    runId: batchIds.run,
    assistantMessageId: message.envelope.messageId,
    assistantMessageSequence: message.envelope.sequence,
    assistantMessageDigest: message.envelope.messageDigest,
    batchDigest: calculateToolCallBatchDigest({
      sessionId: batchIds.session,
      taskId: batchIds.task,
      runId: batchIds.run,
      assistantMessageId: message.envelope.messageId,
      assistantMessageSequence: message.envelope.sequence,
      assistantMessageDigest: message.envelope.messageDigest,
      toolCalls: calls,
    }),
    callCount: calls.length,
    createdAt: batchAt.created,
  };
  const dispositions: readonly ToolCallDispositionRecord[] = calls.map((call, ordinal) => ({
    schemaVersion: TOOL_CALL_BATCH_SCHEMA_VERSION,
    batchId: batchIds.batch,
    toolCallId: call.toolCallId,
    actionId: call.actionId,
    ordinal,
    disposition: "ready_to_dispatch",
    revision: 0,
    updatedAt: batchAt.created,
  }));
  return {
    expectedMessageSequence: 0,
    message,
    batch,
    dispositions,
    updatedAt: batchAt.created,
    ...overrides,
  };
}

export function effectLinkedDisposition(): ToolCallDispositionRecord {
  return {
    ...assistantBatchInput().dispositions[0]!,
    disposition: "effect_linked",
    revision: 1,
    effectAttemptId: batchIds.effectAttempt,
    updatedAt: batchAt.linked,
  };
}

export function toolResultCompletion(): AppendToolResultAndCompleteDispositionInput {
  const providerMessage: ToolResultConversationMessage["message"] = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "tool",
    toolCallId: batchIds.firstToolCall,
    taskId: batchIds.task,
    actionId: batchIds.firstAction,
    observationId: batchIds.observation,
    outcome: "succeeded",
    resultDigest: sha256CanonicalJson(JsonValueSchema.parse({ echoed: true })),
    content: [{ type: "text", text: "echoed" }],
  };
  const message: ToolResultConversationMessage = {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: batchIds.resultMessage,
      sessionId: batchIds.session,
      sequence: 2,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(providerMessage)),
      taskId: batchIds.task,
      createdAt: batchAt.completed,
    },
    message: providerMessage,
  };
  return {
    expectedMessageSequence: 1,
    expectedDispositionRevision: 1,
    batchId: batchIds.batch,
    toolCallId: batchIds.firstToolCall,
    message,
    completedDisposition: {
      ...effectLinkedDisposition(),
      disposition: "result_committed",
      revision: 2,
      resultMessageId: batchIds.resultMessage,
      resultDigest: providerMessage.resultDigest,
      updatedAt: batchAt.completed,
    },
    updatedAt: batchAt.completed,
  };
}

export function legacyConversationMessage(sequence = 1): ConversationMessage {
  const message = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user" as const,
    content: [{ type: "text" as const, text: "legacy conversation remains readable" }],
  };
  return {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: batchIds.legacyMessage,
      sessionId: batchIds.session,
      sequence,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      createdAt: batchAt.legacy,
    },
    message,
  };
}
