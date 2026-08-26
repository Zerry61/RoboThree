import { describe, expect, it } from "vitest";

import { ModelRequestSchema } from "../src/index.js";
import {
  ModelRequestV1Alpha2Schema,
  ReadableModelRequestSchema,
} from "../src/model-protocol/v1alpha2.js";

const id = (suffix: string) =>
  `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;

function request(reasoning: Record<string, unknown>) {
  return {
    schemaVersion: "v1alpha2",
    requestId: id("1"),
    snapshotId: id("2"),
    contextSourceDigest: digest("a"),
    model: {
      capabilityId: "model.default",
      capabilityRevision: digest("b"),
    },
    messages: [{
      schemaVersion: "v1alpha1",
      role: "user",
      content: [{ type: "text", text: "Use the locked reasoning mode." }],
    }],
    tools: [],
    artifacts: [],
    maxOutputTokens: 2_048,
    reasoning,
    requestDigest: digest("c"),
  } as const;
}

describe("DFI-5.2.3 ModelRequest v1alpha2 contracts", () => {
  it("accepts the two strict reasoning envelopes", () => {
    expect(ModelRequestV1Alpha2Schema.safeParse(request({
      mode: "default_passthrough",
      reasoningModeLockId: id("3"),
      reasoningModeLockDigest: digest("d"),
    })).success).toBe(true);
    expect(ModelRequestV1Alpha2Schema.safeParse(request({
      mode: "locked_max_strategy",
      reasoningModeLockId: id("3"),
      reasoningModeLockDigest: digest("d"),
      strategyId: "reasoning.strategy.max",
      strategyRevision: digest("e"),
      strategyDigest: digest("f"),
      timeoutPolicyRef: "timeout.policy.reasoning-max",
    })).success).toBe(true);
  });

  it("rejects strategy leakage into default and incomplete Max material", () => {
    expect(ModelRequestV1Alpha2Schema.safeParse(request({
      mode: "default_passthrough",
      reasoningModeLockId: id("3"),
      reasoningModeLockDigest: digest("d"),
      strategyId: "reasoning.strategy.forbidden",
    })).success).toBe(false);
    expect(ModelRequestV1Alpha2Schema.safeParse(request({
      mode: "locked_max_strategy",
      reasoningModeLockId: id("3"),
      reasoningModeLockDigest: digest("d"),
    })).success).toBe(false);
  });

  it("keeps nested messages on v1alpha1 and the root export v1-only", () => {
    const v2 = request({
      mode: "default_passthrough",
      reasoningModeLockId: id("3"),
      reasoningModeLockDigest: digest("d"),
    });
    expect(ReadableModelRequestSchema.safeParse(v2).success).toBe(true);
    expect(ModelRequestSchema.safeParse(v2).success).toBe(false);
    expect(ModelRequestV1Alpha2Schema.safeParse({
      ...v2,
      messages: [{ ...v2.messages[0], schemaVersion: "v1alpha2" }],
    }).success).toBe(false);
  });
});
