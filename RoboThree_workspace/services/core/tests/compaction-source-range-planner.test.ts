import {
  COMPACTION_SCHEMA_VERSION,
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  type CompactionRecord,
  type ConversationMessage,
  type ProviderNeutralMessage,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  CompactionSourceRangePlanner,
  sha256CanonicalJson,
  type ToolCallBatchEvidence,
} from "../src/index.js";
import {
  assistantBatchInput,
  batchIds,
} from "./tool-call-batch-persistence.fixtures.js";

const id = (value: number) =>
  `019f9200-0000-7000-8000-${String(value).padStart(12, "0")}`;

describe("CompactionSourceRangePlanner", () => {
  it("selects only old closed groups and always retains the latest user group", () => {
    const plan = new CompactionSourceRangePlanner().plan({
      rawMessages: [
        record(1, user("one")),
        record(2, assistant("answer one")),
        record(3, user("two")),
        record(4, assistant("answer two")),
        record(5, user("latest")),
      ],
      toolCallBatches: [],
    });
    expect(plan).toEqual({
      sourceStartSequence: 1,
      sourceEndSequence: 4,
      rawExtensionStartSequence: 1,
      rawExtensionEndSequence: 4,
      retainedRawStartSequence: 5,
      compactedGroupCount: 2,
    });
  });

  it("keeps an open confirmation group and all later causal input in the raw tail", () => {
    const fixture = assistantBatchInput();
    const assistantMessage = {
      ...fixture.message,
      envelope: {
        ...fixture.message.envelope,
        sessionId: id(1),
        messageId: id(12),
        sequence: 4,
      },
    };
    const evidence: ToolCallBatchEvidence = {
      batch: {
        ...fixture.batch,
        sessionId: id(1),
        assistantMessageId: id(12),
        assistantMessageSequence: 4,
      },
      dispositions: fixture.dispositions.map((disposition, ordinal) => ordinal === 0
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
    const plan = new CompactionSourceRangePlanner().plan({
      rawMessages: [
        record(1, user("old")),
        record(2, assistant("old answer")),
        record(3, user("dangerous action")),
        assistantMessage,
        record(5, user("confirmation details")),
      ],
      toolCallBatches: [evidence],
    });
    expect(plan).toMatchObject({ sourceEndSequence: 2, retainedRawStartSequence: 3 });
  });

  it("plans rolling compaction as base summary plus only the new raw extension", () => {
    const active = compactionRecord(4);
    const plan = new CompactionSourceRangePlanner().plan({
      activeCompaction: active,
      rawMessages: [
        record(5, user("extension one")),
        record(6, assistant("answer")),
        record(7, user("latest")),
      ],
      toolCallBatches: [],
    });
    expect(plan).toEqual({
      sourceStartSequence: 1,
      sourceEndSequence: 6,
      rawExtensionStartSequence: 5,
      rawExtensionEndSequence: 6,
      retainedRawStartSequence: 7,
      compactedGroupCount: 1,
    });
  });

  it("does not invent a range when no old closed prefix exists", () => {
    expect(new CompactionSourceRangePlanner().plan({
      rawMessages: [record(1, user("only latest turn"))],
      toolCallBatches: [],
    })).toBeUndefined();
  });
});

function record(sequence: number, message: ProviderNeutralMessage): ConversationMessage {
  return {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: id(100 + sequence),
      sessionId: id(1),
      sequence,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      ...(message.role === "assistant" && message.toolCalls.length > 0
        ? { taskId: batchIds.task }
        : {}),
      createdAt: new Date(Date.UTC(2026, 7, 12, 9, 0, sequence)).toISOString(),
    },
    message,
  };
}

function user(text: string): ProviderNeutralMessage {
  return { schemaVersion: MODEL_PROTOCOL_VERSION, role: "user", content: [{ type: "text", text }] };
}

function assistant(text: string): ProviderNeutralMessage {
  return {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "assistant",
    content: [{ type: "text", text }],
    toolCalls: [],
  };
}

function compactionRecord(sourceEndSequence: number): CompactionRecord {
  return {
    schemaVersion: COMPACTION_SCHEMA_VERSION,
    compactionId: id(2),
    compactionJobId: id(3),
    sessionId: id(1),
    sourceStartSequence: 1,
    sourceEndSequence,
    sourceDigest: `sha256:${"1".repeat(64)}`,
    baseContextRevision: 0,
    summary: "base summary",
    summarySchemaVersion: "v1alpha1",
    summarizerModelRef: "model.fixture",
    summarizerPromptRevision: `sha256:${"2".repeat(64)}`,
    estimatedTokensBefore: 100,
    estimatedTokensAfter: 20,
    createdAt: "2026-08-12T09:00:00.000Z",
  };
}
