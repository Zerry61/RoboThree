import { describe, expect, it } from "vitest";

import {
  ReasoningModeLockV1Alpha2Schema,
} from "../src/reasoning-mode/v1alpha2/index.js";
import { TaskRuntimeSelectionV1Alpha4Schema } from
  "../src/runtime-selection/v1alpha4/index.js";
import {
  SafeReasoningAdmissionEvidenceV1Alpha5Schema,
  SubmitTurnReasoningPlanV1Alpha5Schema,
} from "../src/submit-turn-coordination/v1alpha5/index.js";
import {
  SubmitTurnReasoningSummaryV1Alpha5Schema,
} from "../src/desktop-local/v1alpha5/submit-turn.js";

const id = (suffix: string) => `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const at = "2026-08-28T08:00:00.000Z";

function baseLock() {
  return {
    schemaVersion: "v1alpha2",
    reasoningModeLockId: id("1"),
    taskId: id("2"),
    modelLockRef: { lockId: id("3"), lockDigest: digest("a") },
    lockedAt: at,
    reasoningModeLockDigest: digest("b"),
  } as const;
}

function supportChangedLock() {
  return {
    ...baseLock(),
    requestedMode: "max",
    observedMaxSupport: "supported",
    observedMaxSupportRevision: digest("c"),
    resolution: "max_support_changed_default",
    resolvedMaxSupport: "unknown",
    resolvedMaxSupportRevision: digest("d"),
    resolutionEvidenceRevision: digest("e"),
    resolutionEvidenceDigest: digest("e"),
  } as const;
}

function mappingUnavailableLock() {
  return {
    ...baseLock(),
    requestedMode: "max",
    observedMaxSupport: "supported",
    observedMaxSupportRevision: digest("c"),
    resolution: "max_mapping_unavailable_default",
    resolutionEvidenceRevision: digest("e"),
    resolutionEvidenceDigest: digest("e"),
  } as const;
}

describe("DFI-5.4.1 additive Contract chain", () => {
  it("accepts both new fallback lock variants", () => {
    expect(ReasoningModeLockV1Alpha2Schema.safeParse(supportChangedLock()).success)
      .toBe(true);
    expect(ReasoningModeLockV1Alpha2Schema.safeParse(mappingUnavailableLock()).success)
      .toBe(true);
  });

  it("rejects Profile and Strategy refs on fallback locks", () => {
    expect(ReasoningModeLockV1Alpha2Schema.safeParse({
      ...mappingUnavailableLock(),
      profileRef: { profileId: "profile.bad", profileRevision: digest("1"),
        profileDigest: digest("1") },
    }).success).toBe(false);
    expect(ReasoningModeLockV1Alpha2Schema.safeParse({
      ...supportChangedLock(),
      strategyRef: { strategyId: "strategy.bad", strategyRevision: digest("2"),
        strategyDigest: digest("2"), timeoutPolicyRef: "timeout.bad" },
    }).success).toBe(false);
  });

  it("requires exact resolution evidence revision and digest", () => {
    expect(ReasoningModeLockV1Alpha2Schema.safeParse({
      ...supportChangedLock(),
      resolutionEvidenceDigest: digest("f"),
    }).success).toBe(false);
  });

  it("binds Runtime Selection v1alpha4 to the exact new lock", () => {
    const selection = runtimeSelection(supportChangedLock());
    expect(TaskRuntimeSelectionV1Alpha4Schema.safeParse(selection).success).toBe(true);
    expect(TaskRuntimeSelectionV1Alpha4Schema.safeParse({
      ...selection,
      reasoningModeLock: { ...selection.reasoningModeLock, taskId: id("99") },
    }).success).toBe(false);
  });

  it("keeps the Reasoning lock identity outside capability lock IDs", () => {
    const selection = runtimeSelection({
      ...supportChangedLock(),
      reasoningModeLockId: id("3"),
    });
    expect(TaskRuntimeSelectionV1Alpha4Schema.safeParse(selection).success).toBe(false);
  });

  it("accepts only two content-free unavailable causes", () => {
    const ref = {
      resolutionEvidenceRevision: digest("e"),
      resolutionEvidenceDigest: digest("e"),
    };
    for (const safeCause of [
      "provider_release.policy_unavailable",
      "provider_release.policy_not_admitted",
    ]) expect(SafeReasoningAdmissionEvidenceV1Alpha5Schema.safeParse({
      state: "unavailable", ...ref, safeCause,
    }).success).toBe(true);
    expect(SafeReasoningAdmissionEvidenceV1Alpha5Schema.safeParse({
      state: "unavailable", ...ref,
      safeCause: "provider_release.credential_observation_invalid",
    }).success).toBe(false);
  });

  it("requires admitted evidence only for max_applied", () => {
    expect(SubmitTurnReasoningPlanV1Alpha5Schema.safeParse({
      reasoningModeLock: mappingUnavailableLock(),
      plannedRuntimeSelectionDigest: digest("9"),
      resolutionEvidence: {
        resolutionEvidenceRevision: digest("e"),
        resolutionEvidenceDigest: digest("e"),
      },
      admissionEvidence: {
        state: "unavailable",
        resolutionEvidenceRevision: digest("e"),
        resolutionEvidenceDigest: digest("e"),
        safeCause: "provider_release.policy_unavailable",
      },
    }).success).toBe(true);
  });

  it("enforces all six safe Receipt reason/mode pairs", () => {
    const cases = [
      ["default", "requested_default", "model_default"],
      ["max", "applied", "max"],
      ["max", "unsupported", "model_default"],
      ["max", "capability_unknown", "model_default"],
      ["max", "support_changed_default", "model_default"],
      ["max", "mapping_unavailable_default", "model_default"],
    ] as const;
    for (const [requestedMode, resolutionReason, resolvedMode] of cases) {
      const evidence = resolutionReason.endsWith("_default")
        && resolutionReason !== "requested_default"
        ? { reasoningResolutionRevision: digest("e"),
          reasoningResolutionDigest: digest("e") }
        : {};
      expect(SubmitTurnReasoningSummaryV1Alpha5Schema.safeParse({
        requestedMode, resolutionReason, resolvedMode,
        reasoningModeLockId: id("1"), reasoningModeLockDigest: digest("b"),
        ...evidence,
      }).success).toBe(true);
    }
  });

  it("rejects default request reported as applied and Max reported as requested_default", () => {
    expect(summary("default", "applied", "max")).toBe(false);
    expect(summary("max", "requested_default", "model_default")).toBe(false);
  });
});

function runtimeSelection(reasoningModeLock: ReturnType<typeof supportChangedLock>) {
  return {
    schemaVersion: "v1alpha4",
    runtimeSelectionId: id("4"), taskId: id("2"),
    agent: { agentDefinitionId: "agent.general", revision: digest("1"),
      digest: digest("1") },
    agentResourceDecisionDigest: digest("2"),
    resourceEntitlementSnapshotDigest: digest("3"),
    modelSelectionSource: "stable_fallback",
    resolvedModelLock: { lockId: id("3"), capabilityId: "model.default",
      lockDigest: digest("a") },
    activeSkillRevisions: [], toolLocks: [], knowledgeRevisions: [],
    reasoningModeLock,
    platformPromptRevision: digest("4"), registryRevision: digest("5"),
    createdAt: at, selectionDigest: digest("6"),
  } as const;
}

function summary(requestedMode: string, resolutionReason: string, resolvedMode: string) {
  return SubmitTurnReasoningSummaryV1Alpha5Schema.safeParse({
    requestedMode, resolutionReason, resolvedMode,
    reasoningModeLockId: id("1"), reasoningModeLockDigest: digest("b"),
  }).success;
}
