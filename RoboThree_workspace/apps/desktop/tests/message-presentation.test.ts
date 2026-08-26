import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { MessageProjection } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  messageAuthorName,
  messageAvatar,
  messageStatusLabel,
  presentDurableMessage,
  presentStreamingAssistant,
} from "../src/renderer/presentation/message-presentation.js";

const presentationSource = resolve(
  "apps/desktop/src/renderer/presentation/message-presentation.ts",
);

function message(
  role: MessageProjection["role"],
  overrides: Partial<MessageProjection> = {},
): MessageProjection {
  return {
    messageId: "message-1",
    sessionId: "session-1",
    sequence: 1,
    role,
    status: "completed",
    content: "Hello",
    createdAt: "2026-07-29T01:00:00.000Z",
    ...overrides,
  };
}

describe("Message presentation", () => {
  it("covers user, assistant, and tool durable message identity", () => {
    expect(["user", "assistant", "tool"].map((role) => [
      role,
      messageAvatar(role as MessageProjection["role"]),
      messageAuthorName(role as MessageProjection["role"]),
      presentDurableMessage(message(role as MessageProjection["role"])).roleClass,
    ])).toEqual([
      ["user", "你", "你", "message-user"],
      ["assistant", "R3", "RoboThree", "message-assistant"],
      ["tool", "T", "RoboThree", "message-tool"],
    ]);
  });

  it("maps completed durable messages to persisted status copy", () => {
    expect(messageStatusLabel("completed")).toBe("已持久化");
    expect(presentDurableMessage(message("assistant", {
      status: "completed",
      content: "Done",
    }))).toEqual({
      roleClass: "message-assistant",
      avatar: "R3",
      authorName: "RoboThree",
      statusLabel: "已持久化",
      content: "Done",
      isStreaming: false,
    });
  });

  it("keeps non-completed durable status text unchanged", () => {
    expect(["pending", "streaming", "failed"].map((status) =>
      messageStatusLabel(status as MessageProjection["status"]))).toEqual([
      "pending",
      "streaming",
      "failed",
    ]);
  });

  it("presents streaming assistant without moving stream sequencing logic", () => {
    expect(presentStreamingAssistant({ text: "partial response" })).toEqual({
      roleClass: "message-assistant",
      avatar: "R3",
      authorName: "RoboThree",
      statusLabel: "生成中",
      content: "partial response",
      isStreaming: true,
    });
  });

  it("does not expose sensitive fields from wider message-like inputs", () => {
    const sensitiveMessage: MessageProjection & {
      Token: string;
      Credential: string;
      CapabilityLock: string;
      Observation: string;
      resultPayload: string;
    } = {
      ...message("tool", { content: "Safe content" }),
      Token: "token-should-not-render",
      Credential: "credential-should-not-render",
      CapabilityLock: "lock-should-not-render",
      Observation: "observation-should-not-render",
      resultPayload: "payload-should-not-render",
    };
    const output = JSON.stringify(presentDurableMessage(sensitiveMessage));

    expect(output).toContain("Safe content");
    expect(output).not.toContain("token-should-not-render");
    expect(output).not.toContain("credential-should-not-render");
    expect(output).not.toContain("lock-should-not-render");
    expect(output).not.toContain("observation-should-not-render");
    expect(output).not.toContain("payload-should-not-render");
  });

  it("keeps presentation source pure and free of stream/runtime internals", async () => {
    const source = await readFile(presentationSource, "utf8");
    expect(source).toContain("assertNever(");
    expect(source).not.toMatch(/\bh\s*\(/);
    for (const forbidden of [
      "from \"vue\"",
      "document.",
      "window.",
      "robothreeDesktop",
      "deltaSequence",
      "lastDeltaSequence",
      "dedupe",
      "reconnect",
      "Token",
      "Credential",
      "CapabilityLock",
      "Observation",
      "resultPayload",
      "executionReceipt",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
