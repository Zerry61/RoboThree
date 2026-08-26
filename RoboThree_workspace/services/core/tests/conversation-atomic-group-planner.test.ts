import {
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  type ConversationMessage,
  type ProviderNeutralMessage,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  conversationEntries,
  planConversationAtomicGroups,
  sha256CanonicalJson,
  type ToolCallBatchEvidence,
} from "../src/index.js";
import {
  assistantBatchInput,
  batchIds,
  toolResultCompletion,
} from "./tool-call-batch-persistence.fixtures.js";

const sessionId = batchIds.session;
const entityId = (value: number) =>
  `019f9100-0000-7000-8000-${String(value).padStart(12, "0")}`;

describe("ConversationAtomicGroupPlanner", () => {
  it("keeps a multi-Tool batch and all committed results in one closed group", () => {
    const assistant = assistantBatchInput();
    const secondResult = toolResult(4, 1);
    const firstResult = {
      ...toolResultCompletion().message,
      envelope: { ...toolResultCompletion().message.envelope, sequence: 3 },
    };
    const evidence: ToolCallBatchEvidence = {
      batch: { ...assistant.batch, assistantMessageSequence: 2 },
      dispositions: assistant.dispositions.map((disposition, ordinal) => ({
        ...disposition,
        disposition: "result_committed" as const,
        revision: 2,
        effectAttemptId: entityId(20 + ordinal),
        resultMessageId: ordinal === 0
          ? firstResult.envelope.messageId
          : secondResult.envelope.messageId,
        resultDigest: ordinal === 0
          ? firstResult.message.resultDigest
          : secondResult.message.resultDigest,
      })),
    };
    const entries = conversationEntries([
      message(1, user("start")),
      { ...assistant.message, envelope: { ...assistant.message.envelope, sequence: 2 } },
      firstResult,
      secondResult,
      message(5, user("next")),
    ]);
    const groups = planConversationAtomicGroups({ entries, toolCallBatches: [evidence] });
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      startSequence: 1,
      endSequence: 4,
      closed: true,
      containsToolBatch: true,
    });
    expect(groups[0]!.entries.map((entry) => entry.sequence)).toEqual([1, 2, 3, 4]);
  });

  it("keeps waiting confirmation and its supplemental user turn open across replay", () => {
    const assistant = assistantBatchInput();
    const waiting: ToolCallBatchEvidence = {
      batch: { ...assistant.batch, assistantMessageSequence: 2 },
      dispositions: assistant.dispositions.map((disposition, ordinal) => ordinal === 0
        ? {
          ...disposition,
          disposition: "waiting_user_confirmation" as const,
          confirmationId: batchIds.confirmation,
          revision: 1,
        }
        : {
          ...disposition,
          disposition: "blocked_by_prior_confirmation" as const,
          revision: 1,
        }),
    };
    const input = {
      entries: conversationEntries([
        message(1, user("start")),
        { ...assistant.message, envelope: { ...assistant.message.envelope, sequence: 2 } },
        message(3, user("extra details while waiting")),
      ]),
      toolCallBatches: [waiting],
    };
    const first = planConversationAtomicGroups(input);
    const replay = planConversationAtomicGroups(structuredClone(input));
    expect(first).toEqual(replay);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ startSequence: 1, endSequence: 3, closed: false });
  });

  it("allows denied and cancelled calls to close without fabricated Tool Results", () => {
    const assistant = assistantBatchInput();
    const evidence: ToolCallBatchEvidence = {
      batch: { ...assistant.batch, assistantMessageSequence: 2 },
      dispositions: assistant.dispositions.map((disposition, ordinal) => ({
        ...disposition,
        disposition: ordinal === 0
          ? "denied_before_dispatch" as const
          : "cancelled_before_dispatch" as const,
        revision: 1,
      })),
    };
    const groups = planConversationAtomicGroups({
      entries: conversationEntries([
        message(1, user("start")),
        { ...assistant.message, envelope: { ...assistant.message.envelope, sequence: 2 } },
        message(3, user("next")),
      ]),
      toolCallBatches: [evidence],
    });
    expect(groups.map((group) => group.closed)).toEqual([true, true]);
  });

  it("closes each completed Tool cycle so a long single user turn can compact old cycles", () => {
    const first = completedBatchCycle(1, 2, 3, 0);
    const second = completedBatchCycle(4, 4, 5, 1);
    const groups = planConversationAtomicGroups({
      entries: conversationEntries([
        first.userMessage,
        first.assistantMessage,
        first.resultMessage,
        second.assistantMessage,
        second.resultMessage,
        message(6, assistant("final")),
      ]),
      toolCallBatches: [first.evidence, second.evidence],
    });
    expect(groups.map((group) => ({
      start: group.startSequence,
      end: group.endSequence,
      closed: group.closed,
      tool: group.containsToolBatch,
    }))).toEqual([
      { start: 1, end: 3, closed: true, tool: true },
      { start: 4, end: 5, closed: true, tool: true },
      { start: 6, end: 6, closed: true, tool: false },
    ]);
  });

  it("fails closed for orphan and identity-drifted Tool Results", () => {
    expect(() => planConversationAtomicGroups({
      entries: conversationEntries([message(1, toolResultCompletion().message.message)]),
      toolCallBatches: [],
    })).toThrow("orphan Tool Result");

    const assistant = assistantBatchInput();
    const committed: ToolCallBatchEvidence = {
      batch: { ...assistant.batch, assistantMessageSequence: 1 },
      dispositions: assistant.dispositions.map((disposition, ordinal) => ordinal === 0
        ? {
          ...disposition,
          disposition: "result_committed" as const,
          revision: 2,
          effectAttemptId: batchIds.effectAttempt,
          resultMessageId: batchIds.resultMessage,
          resultDigest: toolResultCompletion().message.message.resultDigest,
        }
        : { ...disposition, disposition: "denied_before_dispatch" as const, revision: 1 }),
    };
    const drifted = structuredClone(toolResultCompletion().message);
    drifted.envelope.sequence = 2;
    drifted.message.actionId = entityId(99);
    expect(() => planConversationAtomicGroups({
      entries: conversationEntries([assistant.message, drifted]),
      toolCallBatches: [committed],
    })).toThrow("drifted");
  });
});

function user(text: string): ProviderNeutralMessage {
  return {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user",
    content: [{ type: "text", text }],
  };
}

function assistant(text: string): ProviderNeutralMessage {
  return {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "assistant",
    content: [{ type: "text", text }],
    toolCalls: [],
  };
}

function completedBatchCycle(
  userSequence: number,
  assistantSequence: number,
  resultSequence: number,
  suffix: number,
) {
  const base = assistantBatchInput();
  const assistantMessageId = entityId(500 + suffix);
  const assistantMessage = {
    ...base.message,
    envelope: {
      ...base.message.envelope,
      messageId: assistantMessageId,
      sequence: assistantSequence,
    },
    message: {
      ...base.message.message,
      toolCalls: [{
        ...base.message.message.toolCalls[0]!,
        toolCallId: entityId(800 + suffix * 2),
        actionId: entityId(801 + suffix * 2),
      }],
    },
  };
  const resultMessage = toolResult(resultSequence, 0);
  const call = assistantMessage.message.toolCalls[0]!;
  resultMessage.message.toolCallId = call.toolCallId;
  resultMessage.message.actionId = call.actionId;
  return {
    userMessage: message(userSequence, user(`turn-${suffix}`)),
    assistantMessage,
    resultMessage,
    evidence: {
      batch: {
        ...base.batch,
        batchId: entityId(600 + suffix),
        assistantMessageId,
        assistantMessageSequence: assistantSequence,
        callCount: 1,
      },
      dispositions: [{
        ...base.dispositions[0]!,
        batchId: entityId(600 + suffix),
        toolCallId: call.toolCallId,
        actionId: call.actionId,
        ordinal: 0,
        disposition: "result_committed" as const,
        effectAttemptId: entityId(700 + suffix),
        resultMessageId: resultMessage.envelope.messageId,
        resultDigest: resultMessage.message.resultDigest,
        revision: 2,
      }],
    } satisfies ToolCallBatchEvidence,
  };
}

function message(sequence: number, providerMessage: ProviderNeutralMessage): ConversationMessage {
  return {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: entityId(100 + sequence),
      sessionId,
      sequence,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(providerMessage)),
      ...(providerMessage.role === "tool" ? { taskId: providerMessage.taskId } : {}),
      createdAt: new Date(Date.UTC(2026, 7, 12, 8, 0, sequence)).toISOString(),
    },
    message: providerMessage,
  };
}

function toolResult(sequence: number, ordinal: number): ConversationMessage & {
  message: Extract<ProviderNeutralMessage, { role: "tool" }>;
} {
  const call = assistantBatchInput().message.message.toolCalls[ordinal]!;
  const providerMessage: Extract<ProviderNeutralMessage, { role: "tool" }> = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "tool",
    toolCallId: call.toolCallId,
    taskId: call.taskId,
    actionId: call.actionId,
    observationId: entityId(30 + ordinal),
    outcome: "succeeded",
    resultDigest: `sha256:${String(ordinal + 7).repeat(64)}`,
    content: [{ type: "text", text: `result-${ordinal}` }],
  };
  return message(sequence, providerMessage) as ConversationMessage & {
    message: Extract<ProviderNeutralMessage, { role: "tool" }>;
  };
}
