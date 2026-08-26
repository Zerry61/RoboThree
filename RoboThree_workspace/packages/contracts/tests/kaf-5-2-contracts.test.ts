import { describe, expect, it } from "vitest";

import {
  MODEL_PROTOCOL_VERSION,
  ModelRequestSchema,
} from "../src/index.js";

const id = (value: number) =>
  `019f7c20-0000-7000-8000-${String(value).padStart(12, "0")}`;
const digest = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}`;

function request() {
  return {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    requestId: id(1),
    snapshotId: id(2),
    contextSourceDigest: digest("a"),
    model: {
      capabilityId: "model.fake",
      capabilityRevision: digest("b"),
    },
    messages: [
      {
        schemaVersion: MODEL_PROTOCOL_VERSION,
        role: "system" as const,
        sourceId: "agent.system",
        sourceRevision: "1",
        sourceDigest: digest("c"),
        content: [{ type: "text" as const, text: "Follow the system instruction." }],
      },
      {
        schemaVersion: MODEL_PROTOCOL_VERSION,
        role: "tool" as const,
        toolCallId: id(3),
        taskId: id(4),
        actionId: id(5),
        observationId: id(6),
        outcome: "succeeded" as const,
        resultDigest: digest("d"),
        content: [{ type: "text" as const, text: "bounded preview" }],
      },
    ],
    tools: [{
      taskId: id(4),
      lockId: id(7),
      capabilityId: "tool.echo",
      capabilityRevision: digest("e"),
      name: "Echo",
      description: "Echoes input.",
      inputSchema: { type: "object" },
    }],
    artifacts: [{
      type: "tool_result" as const,
      toolCallId: id(3),
      taskId: id(4),
      actionId: id(5),
      observationId: id(6),
      resultDigest: digest("d"),
      originalBytes: 32,
      previewBytes: 15,
      truncated: true,
    }],
    maxOutputTokens: 1_024,
    requestDigest: digest("f"),
  };
}

describe("KAF-5.2 provider-neutral ModelRequest", () => {
  it("accepts versioned instructions, locked Tool schemas, and bounded artifact references", () => {
    expect(ModelRequestSchema.parse(request())).toBeDefined();
  });

  it("fails closed for Provider SDK fields, unknown versions, and non-Tool capabilities", () => {
    expect(ModelRequestSchema.safeParse({
      ...request(),
      provider: { cacheControl: "vendor-specific" },
    }).success).toBe(false);
    expect(ModelRequestSchema.safeParse({
      ...request(),
      schemaVersion: "v1alpha2",
    }).success).toBe(false);
    expect(ModelRequestSchema.safeParse({
      ...request(),
      tools: [{ ...request().tools[0], capabilityId: "model.fake" }],
    }).success).toBe(false);
  });

  it("requires exact artifact references and consistent preview byte metadata", () => {
    expect(ModelRequestSchema.safeParse({
      ...request(),
      artifacts: [],
    }).success).toBe(false);
    expect(ModelRequestSchema.safeParse({
      ...request(),
      artifacts: [{
        ...request().artifacts[0],
        previewBytes: 33,
      }],
    }).success).toBe(false);
    expect(ModelRequestSchema.safeParse({
      ...request(),
      artifacts: [{
        ...request().artifacts[0],
        truncated: false,
      }],
    }).success).toBe(false);
  });
});
