import { describe, expect, it } from "vitest";

import * as rootContracts from "../src/index.js";
import {
  ReadableTaskRuntimeSelectionV1Alpha3Schema,
  TaskRuntimeSelectionV1Alpha3MaterialSchema,
  TaskRuntimeSelectionV1Alpha3Schema,
} from "../src/runtime-selection/v1alpha3/index.js";
import {
  ReadableSubmitTurnRecordV1Alpha4Schema,
  SubmitTurnRecordV1Alpha4Schema,
  SubmitTurnResourcePlanV1Alpha4Schema,
} from "../src/submit-turn-coordination/v1alpha4/index.js";
import { ReadableTaskRuntimeSelectionSchema } from "../src/runtime-selection/v1alpha2.js";
import { ReadableSubmitTurnRecordSchema } from "../src/submit-turn-coordination/v1alpha3.js";

const id = (suffix: string) =>
  `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const at = "2026-08-26T08:00:00.000Z";

function reasoningLock() {
  return {
    schemaVersion: "v1alpha1",
    reasoningModeLockId: id("10"),
    taskId: id("2"),
    modelLockRef: { lockId: id("3"), lockDigest: digest("a") },
    lockedAt: at,
    requestedMode: "default",
    resolution: "default_passthrough",
    reasoningModeLockDigest: digest("b"),
  } as const;
}

function selection(source: "explicit" | "user_preference" | "stable_fallback" = "explicit") {
  return {
    schemaVersion: "v1alpha3",
    runtimeSelectionId: id("4"),
    taskId: id("2"),
    agent: {
      agentDefinitionId: "agent.general",
      revision: digest("1"),
      digest: digest("1"),
    },
    agentResourceDecisionDigest: digest("2"),
    resourceEntitlementSnapshotDigest: digest("3"),
    modelSelectionSource: source,
    ...(source === "explicit" ? { requestedModelId: "model.enterprise" } : {}),
    resolvedModelLock: {
      lockId: id("3"),
      capabilityId: "model.enterprise",
      lockDigest: digest("a"),
    },
    activeSkillRevisions: [{
      skillId: "skill.review",
      revision: digest("4"),
      contentDigest: digest("5"),
    }],
    toolLocks: [{
      lockId: id("5"),
      capabilityId: "tool.document.read",
      lockDigest: digest("6"),
    }],
    knowledgeRevisions: [{
      knowledgeId: "knowledge.product",
      revision: digest("7"),
      contentDigest: digest("8"),
    }],
    reasoningModeLock: reasoningLock(),
    platformPromptRevision: digest("9"),
    registryRevision: digest("c"),
    createdAt: at,
    selectionDigest: digest("d"),
  } as const;
}

function selectionRequest() {
  return {
    agentId: "agent.general",
    requestedModelId: "model.enterprise",
    selectedSkillIds: ["skill.review"],
    selectedKnowledgeIds: ["knowledge.product"],
    authorizationPreference: {
      schemaVersion: "v1alpha1",
      requestedMode: "task_scoped",
    },
    reasoningPreference: { requestedMode: "default" },
  } as const;
}

function coordination() {
  return {
    schemaVersion: "v1alpha4",
    transportContractVersion: "v1alpha3",
    submitTurnCommandId: id("11"),
    clientTurnId: "client-turn-r2d-3.1",
    desktopSessionId: `session:${id("12")}`,
    internalSessionId: id("12"),
    requestDigest: digest("e"),
    selectionRequest: selectionRequest(),
    lockedAgent: {
      agentDefinitionId: "agent.general",
      revision: digest("1"),
      digest: digest("1"),
    },
    registryRevision: digest("c"),
    platformPromptRevision: digest("9"),
    plannedSelectionDigest: digest("d"),
    authorizationPlan: {
      requestedMode: "task_scoped",
      resolvedMode: "task_scoped",
      policyRevision: digest("f"),
      source: "user_selected",
      authorizationSelectionDigest: digest("0"),
      executionSelectionDigest: digest("1"),
    },
    reasoningPlan: {
      reasoningModeLock: reasoningLock(),
      plannedRuntimeSelectionDigest: digest("d"),
    },
    capabilityLockIds: [id("3"), id("5")],
    resourcePlan: {
      resourceEntitlementSnapshotDigest: digest("3"),
      agentResourceDecisionDigest: digest("2"),
      plannedRuntimeSelectionDigest: digest("d"),
      authorizationSelectionDigest: digest("0"),
      executionSelectionDigest: digest("1"),
      plannedTaskBundleDigest: digest("2"),
      plannedInstructionBindingDigest: digest("3"),
      modelLockId: id("3"),
      toolLockIds: [id("5")],
      reasoningModeLockId: id("10"),
      durableAcceptanceRevision: digest("4"),
      acceptanceReceiptIdentity: id("13"),
    },
    internalUserMessageId: id("14"),
    internalTaskId: id("2"),
    internalRuntimeSelectionId: id("4"),
    initialCheckpointId: id("15"),
    status: "accepted",
    createdAt: at,
    updatedAt: at,
  } as const;
}

describe("R2D-3.1 private Runtime Selection v1alpha3 Contract", () => {
  it("accepts the new material without the legacy Agent default Model field", () => {
    const { selectionDigest: _selectionDigest, ...material } = selection();
    expect(TaskRuntimeSelectionV1Alpha3MaterialSchema.parse(material))
      .not.toHaveProperty("agentDefaultModelId");
    expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse(selection()).success).toBe(true);
  });

  it("requires explicit selection to bind the exact requested Model", () => {
    expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse({
      ...selection(),
      requestedModelId: "model.other",
    }).success).toBe(false);
    expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse({
      ...selection(),
      requestedModelId: undefined,
    }).success).toBe(false);
  });

  it("forbids requested Model IDs on preference and stable fallback", () => {
    for (const source of ["user_preference", "stable_fallback"] as const) {
      expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse(selection(source)).success).toBe(true);
      expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse({
        ...selection(source),
        requestedModelId: "model.enterprise",
      }).success).toBe(false);
    }
  });

  it("requires exact Model and Tool capability kinds", () => {
    expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse({
      ...selection(),
      resolvedModelLock: { ...selection().resolvedModelLock, capabilityId: "tool.wrong" },
    }).success).toBe(false);
    expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse({
      ...selection(),
      toolLocks: [{ ...selection().toolLocks[0], capabilityId: "model.wrong" }],
    }).success).toBe(false);
  });

  it("rejects duplicate capability and lock identities", () => {
    const duplicate = selection().toolLocks[0];
    expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse({
      ...selection(),
      toolLocks: [duplicate, duplicate],
    }).success).toBe(false);
  });

  it("keeps Skill and Knowledge refs portable and unique", () => {
    expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse({
      ...selection(),
      activeSkillRevisions: [{
        ...selection().activeSkillRevisions[0],
        materializedRef: "file:/secret/path",
      }],
    }).success).toBe(false);
    const knowledge = selection().knowledgeRevisions[0];
    expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse({
      ...selection(),
      knowledgeRevisions: [knowledge, knowledge],
    }).success).toBe(false);
  });

  it("binds Reasoning Mode to the same Task and exact Model lock", () => {
    expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse({
      ...selection(),
      reasoningModeLock: { ...reasoningLock(), taskId: id("99") },
    }).success).toBe(false);
    expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse({
      ...selection(),
      reasoningModeLock: {
        ...reasoningLock(),
        modelLockRef: { ...reasoningLock().modelLockRef, lockDigest: digest("9") },
      },
    }).success).toBe(false);
  });

  it("keeps Reasoning identity outside capability lock identities", () => {
    expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse({
      ...selection(),
      reasoningModeLock: { ...reasoningLock(), reasoningModeLockId: id("3") },
    }).success).toBe(false);
  });

  it("keeps raw entitlement, owner and Provider mapping out of the selection", () => {
    for (const forbidden of [
      { entitlement: {} },
      { owner: "user:1" },
      { endpoint: "https://provider.invalid" },
      { effort: "max" },
      { agentDefaultModelId: "model.enterprise" },
    ]) expect(TaskRuntimeSelectionV1Alpha3Schema.safeParse({
      ...selection(),
      ...forbidden,
    }).success).toBe(false);
  });

  it("adds v1alpha3 only to the new private readable union", () => {
    expect(ReadableTaskRuntimeSelectionV1Alpha3Schema.safeParse(selection()).success)
      .toBe(true);
    expect(ReadableTaskRuntimeSelectionSchema.safeParse(selection()).success).toBe(false);
    expect(rootContracts.TaskRuntimeSelectionSchema.safeParse(selection()).success).toBe(false);
  });
});

describe("R2D-3.1 private coordination v1alpha4 Contract", () => {
  it("accepts an exact content-free durable resource plan", () => {
    expect(SubmitTurnRecordV1Alpha4Schema.safeParse(coordination()).success).toBe(true);
  });

  it("binds selection and both authorization identities", () => {
    expect(SubmitTurnRecordV1Alpha4Schema.safeParse({
      ...coordination(),
      plannedSelectionDigest: digest("9"),
    }).success).toBe(false);
    expect(SubmitTurnRecordV1Alpha4Schema.safeParse({
      ...coordination(),
      resourcePlan: {
        ...coordination().resourcePlan,
        executionSelectionDigest: digest("9"),
      },
    }).success).toBe(false);
  });

  it("requires Task bundle, Instruction Binding and durable acceptance identities", () => {
    for (const field of [
      "plannedTaskBundleDigest",
      "plannedInstructionBindingDigest",
      "durableAcceptanceRevision",
      "acceptanceReceiptIdentity",
    ] as const) {
      const resourcePlan = { ...coordination().resourcePlan } as Record<string, unknown>;
      delete resourcePlan[field];
      expect(SubmitTurnRecordV1Alpha4Schema.safeParse({
        ...coordination(),
        resourcePlan,
      }).success).toBe(false);
    }
  });

  it("binds exact ordered Model and Tool lock identities", () => {
    expect(SubmitTurnRecordV1Alpha4Schema.safeParse({
      ...coordination(),
      capabilityLockIds: [id("5"), id("3")],
    }).success).toBe(false);
    expect(SubmitTurnResourcePlanV1Alpha4Schema.safeParse({
      ...coordination().resourcePlan,
      toolLockIds: [id("3")],
    }).success).toBe(false);
  });

  it("keeps the Reasoning lock separate and exact", () => {
    expect(SubmitTurnRecordV1Alpha4Schema.safeParse({
      ...coordination(),
      resourcePlan: {
        ...coordination().resourcePlan,
        reasoningModeLockId: id("3"),
      },
    }).success).toBe(false);
    expect(SubmitTurnRecordV1Alpha4Schema.safeParse({
      ...coordination(),
      resourcePlan: {
        ...coordination().resourcePlan,
        reasoningModeLockId: id("99"),
      },
    }).success).toBe(false);
  });

  it("rejects unknown versions and does not let the old union accept v1alpha4", () => {
    expect(ReadableSubmitTurnRecordV1Alpha4Schema.safeParse(coordination()).success)
      .toBe(true);
    expect(ReadableSubmitTurnRecordV1Alpha4Schema.safeParse({
      ...coordination(),
      schemaVersion: "v1alpha5",
    }).success).toBe(false);
    expect(ReadableSubmitTurnRecordSchema.safeParse(coordination()).success).toBe(false);
  });

  it("rejects raw identity, entitlement, credential and Provider mapping", () => {
    for (const forbidden of [
      { rawEntitlement: {} },
      { subject: "tenant/user/device" },
      { credentialRef: "secret:key" },
      { reasoningParameters: { effort: "max" } },
    ]) expect(SubmitTurnRecordV1Alpha4Schema.safeParse({
      ...coordination(),
      resourcePlan: { ...coordination().resourcePlan, ...forbidden },
    }).success).toBe(false);
  });
});
