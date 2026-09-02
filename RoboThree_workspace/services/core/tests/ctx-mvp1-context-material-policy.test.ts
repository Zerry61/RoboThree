import type { ConversationMessage } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  ContextMaterialPolicy,
  WORKSPACE_TEXT_READ_CAPABILITY_ID,
} from "../src/application/context-material-policy.js";

describe("CTX-MVP-1 context material policy", () => {
  it("protects only the current exact WTE read result and keeps older Tool results referenceable", () => {
    const decisions = new ContextMaterialPolicy().classifyToolResults([
      userRecord(1, "first edit"),
      assistantRecord(2, "call-old", WORKSPACE_TEXT_READ_CAPABILITY_ID),
      toolRecord(3, "call-old", "old exact content"),
      assistantRecord(4, "call-doc", "tool.document.docx.read"),
      toolRecord(5, "call-doc", "document preview"),
      userRecord(6, "current edit"),
      assistantRecord(7, "call-current", WORKSPACE_TEXT_READ_CAPABILITY_ID),
      toolRecord(8, "call-current", "current exact content"),
    ]);

    expect(decisions.get("call-old")).toEqual({
      materialClass: "referenceable_preview",
      capabilityId: WORKSPACE_TEXT_READ_CAPABILITY_ID,
    });
    expect(decisions.get("call-doc")).toEqual({
      materialClass: "referenceable_preview",
      capabilityId: "tool.document.docx.read",
    });
    expect(decisions.get("call-current")).toEqual({
      materialClass: "protected_exact",
      capabilityId: WORKSPACE_TEXT_READ_CAPABILITY_ID,
    });
  });

  it("does not infer protected material from result field names or text", () => {
    const decisions = new ContextMaterialPolicy().classifyToolResults([
      userRecord(1, "read something"),
      assistantRecord(2, "call-other", "tool.example.read"),
      toolRecord(3, "call-other", JSON.stringify({
        capabilityId: WORKSPACE_TEXT_READ_CAPABILITY_ID,
        currentExactContent: "untrusted field names",
      })),
    ]);

    expect(decisions.get("call-other")?.materialClass)
      .toBe("referenceable_preview");
  });

  it("fails closed when Tool Result identity is missing or drifts", () => {
    expect(() => new ContextMaterialPolicy().classifyToolResults([
      userRecord(1, "edit"),
      toolRecord(2, "missing-call", "content"),
    ])).toThrowError(expect.objectContaining({
      code: "context.tool_material_identity_invalid",
    }));

    expect(() => new ContextMaterialPolicy().classifyToolResults([
      userRecord(1, "edit"),
      assistantRecord(2, "call-drift", WORKSPACE_TEXT_READ_CAPABILITY_ID),
      { ...toolRecord(3, "call-drift", "content"), message: {
        ...toolRecord(3, "call-drift", "content").message,
        actionId: id(999),
      } } as ConversationMessage,
    ])).toThrowError(expect.objectContaining({
      code: "context.tool_material_identity_invalid",
    }));
  });
});

function userRecord(sequence: number, text: string): ConversationMessage {
  return {
    envelope: {
      schemaVersion: "v1alpha1",
      messageId: id(sequence),
      sessionId: id(100),
      taskId: id(200),
      sequence,
      createdAt: "2026-09-01T00:00:00.000Z",
      messageDigest: digest(sequence),
    },
    message: {
      schemaVersion: "v1alpha1",
      role: "user",
      content: [{ type: "text", text }],
    },
  } as ConversationMessage;
}

function assistantRecord(
  sequence: number,
  toolCallId: string,
  capabilityId: string,
): ConversationMessage {
  return {
    envelope: {
      schemaVersion: "v1alpha1",
      messageId: id(sequence),
      sessionId: id(100),
      taskId: id(200),
      sequence,
      createdAt: "2026-09-01T00:00:00.000Z",
      messageDigest: digest(sequence),
    },
    message: {
      schemaVersion: "v1alpha1",
      role: "assistant",
      content: [],
      toolCalls: [{
        schemaVersion: "v1alpha1",
        toolCallId,
        taskId: id(200),
        actionId: id(sequence + 300),
        capabilityId,
        arguments: {},
      }],
    },
  } as ConversationMessage;
}

function toolRecord(
  sequence: number,
  toolCallId: string,
  text: string,
): ConversationMessage {
  return {
    envelope: {
      schemaVersion: "v1alpha1",
      messageId: id(sequence),
      sessionId: id(100),
      taskId: id(200),
      sequence,
      createdAt: "2026-09-01T00:00:00.000Z",
      messageDigest: digest(sequence),
    },
    message: {
      schemaVersion: "v1alpha1",
      role: "tool",
      toolCallId,
      taskId: id(200),
      actionId: id(sequence + 299),
      observationId: id(sequence + 400),
      outcome: "succeeded",
      resultDigest: digest(sequence + 500),
      content: [{ type: "text", text }],
    },
  } as ConversationMessage;
}

function id(value: number): string {
  return `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
}

function digest(value: number): string {
  return `sha256:${value.toString(16).padStart(64, "0")}`;
}
