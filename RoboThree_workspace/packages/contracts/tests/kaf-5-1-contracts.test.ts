import { describe, expect, it } from "vitest";

import {
  CONVERSATION_SCHEMA_VERSION,
  CONTEXT_SCHEMA_VERSION,
  ConversationMessageSchema,
  MODEL_PROTOCOL_VERSION,
  ProviderNeutralMessageSchema,
  TurnContextSnapshotSchema,
} from "../src/index.js";

const id = (value: number) =>
  `019f7c10-0000-7000-8000-${String(value).padStart(12, "0")}`;
const digest = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;

describe("KAF-5.1 provider-neutral message contracts", () => {
  it("accepts user, assistant tool call, and tool result messages without Provider SDK fields", () => {
    expect(ProviderNeutralMessageSchema.parse({
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user",
      content: [{ type: "text", text: "hello" }],
    })).toBeDefined();
    expect(ProviderNeutralMessageSchema.parse({
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "assistant",
      content: [],
      toolCalls: [{
        toolCallId: id(1),
        taskId: id(2),
        actionId: id(3),
        capabilityId: "tool.echo",
        arguments: { text: "hello" },
      }],
    })).toBeDefined();
    expect(ProviderNeutralMessageSchema.parse({
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "tool",
      toolCallId: id(1),
      taskId: id(2),
      actionId: id(3),
      observationId: id(4),
      outcome: "succeeded",
      resultDigest: digest("a"),
      content: [{ type: "text", text: "hello" }],
    })).toBeDefined();
  });

  it("fails closed for unknown versions, undeclared provider fields, and empty assistant output", () => {
    expect(ProviderNeutralMessageSchema.safeParse({
      schemaVersion: "v1alpha2",
      role: "user",
      content: [{ type: "text", text: "hello" }],
    }).success).toBe(false);
    expect(ProviderNeutralMessageSchema.safeParse({
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user",
      content: [{ type: "text", text: "hello" }],
      providerSdkRequest: { unsafe: true },
    }).success).toBe(false);
    expect(ProviderNeutralMessageSchema.safeParse({
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "assistant",
      content: [],
      toolCalls: [],
    }).success).toBe(false);
  });

  it("requires tool references to agree with the Conversation envelope task", () => {
    expect(ConversationMessageSchema.safeParse({
      envelope: {
        schemaVersion: CONVERSATION_SCHEMA_VERSION,
        messageId: id(10),
        sessionId: id(11),
        sequence: 1,
        messageSchemaVersion: MODEL_PROTOCOL_VERSION,
        messageDigest: digest("b"),
        taskId: id(12),
        createdAt: "2026-07-23T10:00:00.000Z",
      },
      message: {
        schemaVersion: MODEL_PROTOCOL_VERSION,
        role: "assistant",
        content: [],
        toolCalls: [{
          toolCallId: id(13),
          taskId: id(14),
          actionId: id(15),
          capabilityId: "tool.echo",
          arguments: {},
        }],
      },
    }).success).toBe(false);
  });
});

describe("KAF-5.1 TurnContextSnapshot contract", () => {
  it("accepts contiguous deterministic projection metadata", () => {
    expect(TurnContextSnapshotSchema.parse({
      schemaVersion: CONTEXT_SCHEMA_VERSION,
      snapshotId: id(20),
      sessionId: id(21),
      conversation: {
        sessionId: id(21),
        messageSequence: 1,
        contextRevision: 0,
        messageStartSequence: 1,
        messageEndSequence: 1,
        messageDigest: digest("c"),
      },
      tasks: [{
        taskId: id(22),
        stateRevision: 0,
        lastEventSequence: 0,
        checkpointId: id(23),
        stateDigest: digest("d"),
        capabilityLocks: [],
      }],
      projection: [
        {
          type: "conversation_message",
          order: 0,
          sessionId: id(21),
          messageId: id(24),
          messageSequence: 1,
          messageDigest: digest("e"),
        },
        {
          type: "task_state",
          order: 1,
          taskId: id(22),
          stateRevision: 0,
          checkpointId: id(23),
          stateDigest: digest("d"),
        },
      ],
      sourceDigest: digest("f"),
      createdAt: "2026-07-23T10:00:00.000Z",
    })).toBeDefined();
  });

  it("rejects projection gaps, cross-session messages, and unknown task sources", () => {
    const base = {
      schemaVersion: CONTEXT_SCHEMA_VERSION,
      snapshotId: id(30),
      sessionId: id(31),
      conversation: {
        sessionId: id(31),
        messageSequence: 1,
        contextRevision: 0,
        messageStartSequence: 1,
        messageEndSequence: 1,
        messageDigest: digest("1"),
      },
      tasks: [],
      sourceDigest: digest("2"),
      createdAt: "2026-07-23T10:00:00.000Z",
    };
    expect(TurnContextSnapshotSchema.safeParse({
      ...base,
      projection: [{
        type: "conversation_message",
        order: 1,
        sessionId: id(99),
        messageId: id(32),
        messageSequence: 1,
        messageDigest: digest("3"),
      }],
    }).success).toBe(false);
    expect(TurnContextSnapshotSchema.safeParse({
      ...base,
      projection: [{
        type: "task_state",
        order: 0,
        taskId: id(33),
        stateRevision: 0,
        checkpointId: id(34),
        stateDigest: digest("4"),
      }],
    }).success).toBe(false);
  });
});
