import {
  CONTRACT_VERSION,
  JsonValueSchema,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  createReasoningModeLockV1Alpha2,
  createReasoningResolutionEvidenceV1,
  createTaskRuntimeSelectionV1Alpha4,
  hasValidTaskRuntimeSelectionV1Alpha4,
  resolutionEvidenceRef,
  sha256CanonicalJson,
  validateReasoningModeLockV1Alpha2,
  validateReasoningResolutionEvidenceV1,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "../src/index.js";

const id = (suffix: string) => `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const at = "2026-08-28T08:00:00.000Z";

describe("DFI-5.4.1 Lock v1alpha2 domain", () => {
  it("creates and validates a deterministic default lock", () => {
    const { lock, ref } = modelLock();
    const first = createReasoningModeLockV1Alpha2({
      schemaVersion: "v1alpha2", reasoningModeLockId: id("4"), taskId: lock.taskId,
      modelLockRef: ref, lockedAt: at, requestedMode: "default",
      resolution: "default_passthrough",
    });
    const second = createReasoningModeLockV1Alpha2({
      schemaVersion: "v1alpha2", reasoningModeLockId: id("4"), taskId: lock.taskId,
      modelLockRef: ref, lockedAt: at, requestedMode: "default",
      resolution: "default_passthrough",
    });
    expect(first).toEqual(second);
    expect(validateReasoningModeLockV1Alpha2(first, {
      taskId: lock.taskId, modelLockRef: ref,
    })).toEqual(first);
  });

  it("rejects lock digest tamper", () => {
    const { lock, ref } = modelLock();
    const value = createReasoningModeLockV1Alpha2({
      schemaVersion: "v1alpha2", reasoningModeLockId: id("4"), taskId: lock.taskId,
      modelLockRef: ref, lockedAt: at, requestedMode: "default",
      resolution: "default_passthrough",
    });
    expect(() => validateReasoningModeLockV1Alpha2({
      ...value, reasoningModeLockDigest: digest("9"),
    })).toThrow("reasoning_lock.digest_invalid");
  });

  it("binds independent resolution evidence to Task, Model lock and lock ID", () => {
    const { lock, ref } = modelLock();
    const evidence = createReasoningResolutionEvidenceV1({
      schemaVersion: "v1", taskId: lock.taskId, reasoningModeLockId: id("4"),
      modelLockDigest: ref.lockDigest, cause: "support_changed",
      observedMaxSupport: "supported", observedMaxSupportRevision: digest("5"),
      resolvedMaxSupport: "unknown", resolvedMaxSupportRevision: digest("6"),
    });
    const value = createReasoningModeLockV1Alpha2({
      schemaVersion: "v1alpha2", reasoningModeLockId: id("4"), taskId: lock.taskId,
      modelLockRef: ref, lockedAt: at, requestedMode: "max",
      observedMaxSupport: "supported", observedMaxSupportRevision: digest("5"),
      resolution: "max_support_changed_default", resolvedMaxSupport: "unknown",
      resolvedMaxSupportRevision: digest("6"), ...resolutionEvidenceRef(evidence),
    });
    expect(validateReasoningModeLockV1Alpha2(value, {
      taskId: lock.taskId, modelLockRef: ref, resolutionEvidence: evidence,
    })).toEqual(value);
  });

  it("rejects evidence byte drift", () => {
    const { lock, ref } = modelLock();
    const evidence = createReasoningResolutionEvidenceV1({
      schemaVersion: "v1", taskId: lock.taskId, reasoningModeLockId: id("4"),
      modelLockDigest: ref.lockDigest, cause: "provider_release.policy_unavailable",
      observedMaxSupport: "supported", observedMaxSupportRevision: digest("5"),
    });
    expect(() => validateReasoningResolutionEvidenceV1({
      ...evidence, cause: "provider_release.policy_not_admitted",
    })).toThrow("reasoning_resolution_evidence.digest_invalid");
  });

  it("creates Runtime Selection v1alpha4 with the full lock in its digest", () => {
    const { lock, ref } = modelLock();
    const reasoning = createReasoningModeLockV1Alpha2({
      schemaVersion: "v1alpha2", reasoningModeLockId: id("4"), taskId: lock.taskId,
      modelLockRef: ref, lockedAt: at, requestedMode: "default",
      resolution: "default_passthrough",
    });
    const selection = createTaskRuntimeSelectionV1Alpha4({
      schemaVersion: "v1alpha4", runtimeSelectionId: id("5"), taskId: lock.taskId,
      agent: { agentDefinitionId: "agent.general", revision: digest("1"),
        digest: digest("1") },
      agentResourceDecisionDigest: digest("2"),
      resourceEntitlementSnapshotDigest: digest("3"),
      modelSelectionSource: "stable_fallback", resolvedModelLock: {
        lockId: lock.lockId, capabilityId: lock.definitionSnapshot.capabilityId,
        lockDigest: ref.lockDigest,
      }, activeSkillRevisions: [], toolLocks: [], knowledgeRevisions: [],
      reasoningModeLock: reasoning, platformPromptRevision: digest("4"),
      registryRevision: lock.registryRevision, createdAt: at,
    });
    expect(hasValidTaskRuntimeSelectionV1Alpha4(selection)).toBe(true);
    expect(hasValidTaskRuntimeSelectionV1Alpha4({
      ...selection, selectionDigest: digest("9"),
    })).toBe(false);
  });
});

function modelLock(): { lock: TaskCapabilityLock; ref: { lockId: string; lockDigest: string } } {
  const source = { trust: "official" as const, packageId: "robothree.official.dfi541",
    packageRevision: digest("8") };
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.dfi541",
    adapterKind: "model_provider",
    source, implementationRef: "core:dfi541-fixture", runtimeBoundary: "in_process",
    protocol: { name: "fixture-model", version: "v1alpha1" },
  });
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION, capabilityId: "model.dfi541", kind: "model",
    name: "DFI-5.4.1 model", description: "Exact model fixture", source,
    model: { family: "fixture", inputModalities: ["text"], outputModalities: ["text"],
      contextWindow: 128_000, supportsStreaming: true },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.dfi541",
    capability: { capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision },
    adapterDescriptor: { adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision },
    port: "model_provider",
    source,
  });
  const lock: TaskCapabilityLock = {
    schemaVersion: CONTRACT_VERSION, lockId: id("3"), taskId: id("2"),
    registryRevision: digest("a"), definitionSnapshot: definition,
    bindingSnapshot: binding, adapterDescriptorSnapshot: descriptor, lockedAt: at,
  };
  return { lock, ref: { lockId: lock.lockId,
    lockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock)) } };
}
