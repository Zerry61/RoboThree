import {
  CONVERSATION_SCHEMA_VERSION,
  MODEL_PROTOCOL_VERSION,
  ObservationSchema,
  type AssistantToolCall,
  type ConversationMessage,
} from "@robothree/contracts";
import {
  TEXT_FILE_READ_CAPABILITY_ID,
  TEXT_FILE_WRITE_CAPABILITY_ID,
} from "@robothree/document-worker";
import { describe, expect, it } from "vitest";

import {
  resolveLatestWorkspaceTextMaterial,
  sha256CanonicalJson,
  toolObservationMessage,
} from "../src/index.js";

const id = (tail: number) =>
  `019fa102-0000-7000-8000-${String(tail).padStart(12, "0")}`;
const digest = (character: string) => `sha256:${character.repeat(64)}`;
const taskId = id(1);
const relativePath = "src/large.ts";

describe("WTE-1 round output material", () => {
  it("keeps a maximum-size exact read result across bounded model message parts", () => {
    const content = `${"a".repeat(262_120)}🙂`;
    const call = readCall(10);
    const observation = ObservationSchema.parse({
      observationId: id(12),
      actionId: call.actionId,
      observedAt: "2026-09-01T14:00:00.000Z",
      outcome: "succeeded",
      output: {
        status: "succeeded",
        result: {
          relativePath,
          content,
          mediaType: "text/typescript",
          byteSize: Buffer.byteLength(content, "utf8"),
          sha256: digest("a"),
        },
        metadata: { originalCount: 1, returnedCount: 1, truncated: false },
      },
    });
    const message = toolObservationMessage(call, observation);
    expect(message.content.length).toBeGreaterThan(1);
    expect(message.content.every((part) => part.text.length <= 65_536)).toBe(true);
    const parsed = JSON.parse(message.content.map((part) => part.text).join(""));
    expect(parsed.result.content).toBe(content);
  });

  it("reserves a full replacement only for the round immediately after an exact read", () => {
    const read = readCall(20);
    const readResult = toolRecord(read, 3, {
      status: "succeeded",
      result: {
        relativePath,
        content: "export const value = 1;\n",
        mediaType: "text/typescript",
        byteSize: 24,
        sha256: digest("b"),
      },
      metadata: { originalCount: 1, returnedCount: 1, truncated: false },
    });
    const records = [assistantRecord(read, 2), readResult];
    expect(resolveLatestWorkspaceTextMaterial(taskId, records)).toEqual({
      kind: "workspace_text_full_replacement",
      capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID,
      relativePath,
      expectedPreviousSha256: digest("b"),
      currentExactContent: "export const value = 1;\n",
    });

    const write: AssistantToolCall = {
      toolCallId: id(30),
      taskId,
      actionId: id(31),
      capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID,
      arguments: {
        relativePath,
        content: "export const value = 2;\n",
        mode: "replace_existing",
        expectedPreviousSha256: digest("b"),
      },
    };
    expect(resolveLatestWorkspaceTextMaterial(taskId, [
      ...records,
      assistantRecord(write, 4),
    ])).toBeUndefined();
  });
});

function readCall(tail: number): AssistantToolCall {
  return {
    toolCallId: id(tail),
    taskId,
    actionId: id(tail + 1),
    capabilityId: TEXT_FILE_READ_CAPABILITY_ID,
    arguments: { relativePath },
  };
}

function assistantRecord(call: AssistantToolCall, sequence: number): ConversationMessage {
  const message = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "assistant" as const,
    content: [],
    toolCalls: [call],
  };
  return record(message, sequence);
}

function toolRecord(
  call: AssistantToolCall,
  sequence: number,
  output: unknown,
): ConversationMessage {
  const message = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "tool" as const,
    toolCallId: call.toolCallId,
    taskId,
    actionId: call.actionId,
    observationId: id(40 + sequence),
    outcome: "succeeded" as const,
    resultDigest: digest("c"),
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
  };
  return record(message, sequence);
}

function record(
  message: ConversationMessage["message"],
  sequence: number,
): ConversationMessage {
  return {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: id(100 + sequence),
      sessionId: id(2),
      sequence,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(message),
      taskId,
      createdAt: `2026-09-01T14:00:0${sequence}.000Z`,
    },
    message,
  };
}
