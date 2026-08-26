import { describe, expect, it } from "vitest";

import {
  R2D3_COORDINATION_V1ALPHA4_PRODUCTION_CONSUMER_ENABLED,
  R2D3_RUNTIME_SELECTION_V1ALPHA3_PRODUCTION_CONSUMER_ENABLED,
  createSubmitTurnRecordV1Alpha4,
  createTaskRuntimeSelectionV1Alpha3,
  hasValidTaskRuntimeSelectionV1Alpha3,
  parseReadableSubmitTurnRecordV1Alpha4,
  parseReadableTaskRuntimeSelectionV1Alpha3,
} from "../src/index.js";

const id = (suffix: string) =>
  `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const at = "2026-08-26T08:00:00.000Z";

function lock() {
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

function selectionMaterial() {
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
    modelSelectionSource: "explicit",
    requestedModelId: "model.enterprise",
    resolvedModelLock: {
      lockId: id("3"),
      capabilityId: "model.enterprise",
      lockDigest: digest("a"),
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    reasoningModeLock: lock(),
    platformPromptRevision: digest("9"),
    registryRevision: digest("c"),
    createdAt: at,
  } as const;
}

function coordination() {
  const selection = createTaskRuntimeSelectionV1Alpha3(selectionMaterial());
  return {
    schemaVersion: "v1alpha4",
    transportContractVersion: "v1alpha3",
    submitTurnCommandId: id("11"),
    clientTurnId: "client-turn-r2d-3.1-domain",
    desktopSessionId: `session:${id("12")}`,
    internalSessionId: id("12"),
    requestDigest: digest("e"),
    selectionRequest: {
      agentId: "agent.general",
      requestedModelId: "model.enterprise",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      authorizationPreference: {
        schemaVersion: "v1alpha1",
        requestedMode: "task_scoped",
      },
      reasoningPreference: { requestedMode: "default" },
    },
    lockedAgent: selection.agent,
    registryRevision: selection.registryRevision,
    platformPromptRevision: selection.platformPromptRevision,
    plannedSelectionDigest: selection.selectionDigest,
    authorizationPlan: {
      requestedMode: "task_scoped",
      resolvedMode: "task_scoped",
      policyRevision: digest("f"),
      source: "user_selected",
      authorizationSelectionDigest: digest("0"),
      executionSelectionDigest: digest("1"),
    },
    reasoningPlan: {
      reasoningModeLock: lock(),
      plannedRuntimeSelectionDigest: selection.selectionDigest,
    },
    capabilityLockIds: [id("3")],
    resourcePlan: {
      resourceEntitlementSnapshotDigest: selection.resourceEntitlementSnapshotDigest,
      agentResourceDecisionDigest: selection.agentResourceDecisionDigest,
      plannedRuntimeSelectionDigest: selection.selectionDigest,
      authorizationSelectionDigest: digest("0"),
      executionSelectionDigest: digest("1"),
      plannedTaskBundleDigest: digest("2"),
      plannedInstructionBindingDigest: digest("3"),
      modelLockId: id("3"),
      toolLockIds: [],
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

describe("R2D-3.1 private revision helpers", () => {
  it("creates and revalidates the v1alpha3 selection digest", () => {
    const selection = createTaskRuntimeSelectionV1Alpha3(selectionMaterial());
    expect(hasValidTaskRuntimeSelectionV1Alpha3(selection)).toBe(true);
    expect(parseReadableTaskRuntimeSelectionV1Alpha3(selection)).toEqual(selection);
  });

  it("detects v1alpha3 material drift", () => {
    const selection = createTaskRuntimeSelectionV1Alpha3(selectionMaterial());
    expect(hasValidTaskRuntimeSelectionV1Alpha3({
      ...selection,
      registryRevision: digest("f"),
    })).toBe(false);
  });

  it("does not fallback a corrupted v1alpha3 record to older schemas", () => {
    const selection = createTaskRuntimeSelectionV1Alpha3(selectionMaterial());
    expect(() => parseReadableTaskRuntimeSelectionV1Alpha3({
      ...selection,
      selectionDigest: digest("f"),
    })).toThrow("digest is invalid");
  });

  it("fails closed on unknown selection schema versions", () => {
    expect(() => parseReadableTaskRuntimeSelectionV1Alpha3({
      ...createTaskRuntimeSelectionV1Alpha3(selectionMaterial()),
      schemaVersion: "v1alpha4",
    })).toThrow("version is unsupported");
  });

  it("creates and single-dispatches a v1alpha4 coordination record", () => {
    const record = createSubmitTurnRecordV1Alpha4(coordination());
    expect(parseReadableSubmitTurnRecordV1Alpha4(record)).toEqual(record);
  });

  it("does not fallback a corrupted v1alpha4 record to v1alpha3", () => {
    expect(() => parseReadableSubmitTurnRecordV1Alpha4({
      ...coordination(),
      resourcePlan: {
        ...coordination().resourcePlan,
        plannedRuntimeSelectionDigest: digest("f"),
      },
    })).toThrow();
  });

  it("fails closed on unknown coordination schema versions", () => {
    expect(() => parseReadableSubmitTurnRecordV1Alpha4({
      ...coordination(),
      schemaVersion: "v1alpha5",
    })).toThrow("version is unsupported");
  });

  it("keeps both new revisions unreachable from production consumers", () => {
    expect(R2D3_RUNTIME_SELECTION_V1ALPHA3_PRODUCTION_CONSUMER_ENABLED).toBe(false);
    expect(R2D3_COORDINATION_V1ALPHA4_PRODUCTION_CONSUMER_ENABLED).toBe(false);
  });
});
