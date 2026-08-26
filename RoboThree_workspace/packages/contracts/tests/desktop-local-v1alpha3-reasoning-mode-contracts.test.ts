import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  PreviewReasoningModeQuerySchema,
  ReasoningModePreferenceReceiptSchema,
  ReasoningModePreviewSchema,
  UpdateReasoningModePreferenceCommandSchema,
} from "../src/index.js";
import { ReasoningProfileSchema } from "../src/reasoning-mode/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const metadata = {
  contractVersion: "v1alpha3",
  correlationId: "019f7447-a784-77b2-a716-000000005001",
  clientInstanceId: "019f7447-a784-77b2-a716-000000005002",
};

describe("DFI-5.1 safe Reasoning Mode contracts", () => {
  it("keeps the Core-private Reasoning Profile out of the public root export", async () => {
    const rootIndex = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(rootIndex).not.toContain("./reasoning-mode/");
    expect(packageJson.exports?.["./reasoning-mode/v1alpha1"]).toBeDefined();
  });

  it("keeps Preview strict and exposes only safe support facts", () => {
    expect(PreviewReasoningModeQuerySchema.parse({
      ...metadata,
      queryId: "019f7447-a784-77b2-a716-000000005003",
      type: "preview_reasoning_mode",
      agentId: "agent.fixture",
      requestedModelId: "model.fixture",
    }).requestedModelId).toBe("model.fixture");
    expect(ReasoningModePreviewSchema.parse({
      effectiveModelId: "model.fixture",
      effectiveModelRevision: digest("a"),
      maxSupport: "unknown",
      maxSupportRevision: digest("b"),
      safeUnavailableReason: "当前模型的 Max 支持状态尚未验证，将使用模型默认模式。",
      preference: "default",
      preferencePersistence: "unavailable",
      testIdentityUsed: false,
      productionIdentityReady: false,
    }).maxSupport).toBe("unknown");
    expect(ReasoningModePreviewSchema.safeParse({
      effectiveModelId: "model.fixture",
      effectiveModelRevision: digest("a"),
      maxSupport: "supported",
      maxSupportRevision: digest("b"),
      preference: "default",
      preferenceRevision: 0,
      preferencePersistence: "available",
      testIdentityUsed: false,
      productionIdentityReady: true,
      effort: "max",
    }).success).toBe(false);
  });

  it("freezes strict profile cross-field constraints without raw Provider material", () => {
    const subject = {
      modelCapabilityId: "model.fixture",
      modelCapabilityRevision: digest("a"),
      adapterDescriptorId: "adapter.model.fixture",
      adapterDescriptorRevision: digest("b"),
      authority: "central_enterprise",
    };
    expect(ReasoningProfileSchema.safeParse({
      schemaVersion: "v1alpha1",
      profileId: "reasoning.profile.fixture",
      profileRevision: digest("c"),
      profileDigest: digest("c"),
      subject,
      support: "supported",
      maxStrategy: {
        strategyId: "reasoning.strategy.fixture",
        strategyRevision: digest("d"),
        strategyDigest: digest("e"),
        mappingKind: "effort_level",
        timeoutPolicyRef: "timeout.policy.fixture",
      },
    }).success).toBe(true);
    expect(ReasoningProfileSchema.safeParse({
      schemaVersion: "v1alpha1",
      profileId: "reasoning.profile.fixture",
      profileRevision: digest("c"),
      profileDigest: digest("c"),
      subject,
      support: "unknown",
      maxStrategy: { effort: "max" },
    }).success).toBe(false);
    expect(ReasoningProfileSchema.safeParse({
      schemaVersion: "v1alpha1",
      profileId: "reasoning.profile.fixture",
      profileRevision: digest("c"),
      profileDigest: digest("c"),
      subject: { ...subject, authority: "local_personal" },
      support: "unknown",
    }).success).toBe(false);
    expect(ReasoningProfileSchema.safeParse({
      schemaVersion: "v1alpha1",
      profileId: "reasoning.profile.fixture",
      profileRevision: digest("c"),
      profileDigest: digest("c"),
      subject: { ...subject, personalExecutionDefinitionDigest: digest("f") },
      support: "unknown",
    }).success).toBe(false);
  });

  it("freezes CAS commands and durable Receipts", () => {
    const command = {
      ...metadata,
      commandId: "019f7447-a784-77b2-a716-000000005004",
      type: "update_reasoning_mode_preference",
      expectedPreferenceRevision: 0,
      requestedMode: "max",
    };
    expect(UpdateReasoningModePreferenceCommandSchema.parse(command).requestedMode).toBe("max");
    expect(ReasoningModePreferenceReceiptSchema.parse({
      contractVersion: "v1alpha3",
      commandId: command.commandId,
      requestDigest: digest("f"),
      expectedPreferenceRevision: 0,
      committedPreferenceRevision: 1,
      requestedMode: "max",
      outcome: "preference_committed",
      committedAt: "2026-08-25T05:00:00.000Z",
      receiptDigest: digest("1"),
    }).committedPreferenceRevision).toBe(1);
    expect(ReasoningModePreferenceReceiptSchema.safeParse({
      contractVersion: "v1alpha3",
      commandId: command.commandId,
      requestDigest: digest("f"),
      expectedPreferenceRevision: 0,
      committedPreferenceRevision: 2,
      requestedMode: "max",
      outcome: "preference_committed",
      committedAt: "2026-08-25T05:00:00.000Z",
      receiptDigest: digest("1"),
    }).success).toBe(false);
  });
});
