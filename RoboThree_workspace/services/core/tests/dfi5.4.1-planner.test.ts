import {
  CONTRACT_VERSION,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  ReasoningModeLockPlannerV1Alpha2,
  TaskLockedReasoningProfileSubjectResolver,
  calculateReasoningSupportRevision,
  createReasoningProfile,
  type Dfi541ProviderReleaseAdmissionResolver,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "../src/index.js";
import type { InMemoryReasoningProfileSource } from "../src/index.js";

const id = (suffix: string) => `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const at = "2026-08-28T08:00:00.000Z";

describe("DFI-5.4.1 best-effort Reasoning Planner", () => {
  it("keeps default as an immediate zero-load passthrough", async () => {
    const fixture = setup();
    const result = await fixture.planner.plan({
      ...fixture.input,
      reasoningPreference: { requestedMode: "default" },
    });
    expect(result).toMatchObject({ ok: true, lock: {
      resolution: "default_passthrough",
    }, admissionEvidence: { state: "not_required" } });
    expect(fixture.counts).toEqual({ profile: 0, admission: 0 });
  });

  it("applies Max only with exact admitted evidence", async () => {
    const fixture = setup();
    const result = await fixture.planner.plan({
      ...fixture.input,
      reasoningPreference: fixture.supportedPreference,
    });
    expect(result).toMatchObject({ ok: true, lock: {
      resolution: "max_applied",
      profileRef: { profileDigest: fixture.profile.profileDigest },
      strategyRef: { strategyDigest: fixture.profile.maxStrategy?.strategyDigest },
    }, admissionEvidence: { state: "admitted" } });
    expect(fixture.counts).toEqual({ profile: 1, admission: 1 });
  });

  it.each([
    "provider_release.policy_unavailable",
    "provider_release.policy_not_admitted",
  ] as const)("maps only %s to mapping unavailable default", async (code) => {
    const fixture = setup({ admission: { state: "unavailable", code } });
    const result = await fixture.planner.plan({
      ...fixture.input,
      reasoningPreference: fixture.supportedPreference,
    });
    expect(result).toMatchObject({ ok: true, lock: {
      resolution: "max_mapping_unavailable_default",
    }, admissionEvidence: { state: "unavailable", safeCause: code } });
    if (result.ok) expect(result.resolutionEvidence?.cause).toBe(code);
  });

  it("fails closed for every non-allowlisted admission error", async () => {
    for (const code of [
      "provider_release.conformance_manifest_invalid",
      "provider_release.local_authority_invalid",
      "provider_release.subject_invalid",
      "provider_release.credential_observation_invalid",
      "provider_release.endpoint_mismatch",
      "provider_release.model_snapshot_mismatch",
      "provider_release.identity_mismatch",
      "provider_release.materialization_conflict",
    ]) {
      const fixture = setup({ admission: { state: "rejected", code } });
      await expect(fixture.planner.plan({
        ...fixture.input,
        reasoningPreference: fixture.supportedPreference,
      })).resolves.toMatchObject({ ok: false, error: {
        code: "reasoning_admission_integrity_invalid",
      } });
    }
  });

  it("records supported observation drift as a durable safe fallback", async () => {
    const fixture = setup({ support: "unsupported" });
    const result = await fixture.planner.plan({
      ...fixture.input,
      reasoningPreference: {
        requestedMode: "max",
        observedMaxSupport: "supported",
        observedMaxSupportRevision: digest("9"),
      },
    });
    expect(result).toMatchObject({ ok: true, lock: {
      resolution: "max_support_changed_default",
      resolvedMaxSupport: "unsupported",
    }, admissionEvidence: { state: "not_required" } });
    if (result.ok) expect(result.resolutionEvidence?.cause).toBe("support_changed");
    expect(fixture.counts).toEqual({ profile: 1, admission: 0 });
  });

  it("preserves unsupported and unknown as distinct exact fallbacks", async () => {
    for (const support of ["unsupported", "unknown"] as const) {
      const fixture = setup({ support });
      const currentRevision = calculateReasoningSupportRevision({
        subject: fixture.subject,
        ...(support === "unknown" ? {} : { profile: fixture.profile }),
      });
      const result = await fixture.planner.plan({
        ...fixture.input,
        reasoningPreference: {
          requestedMode: "max", observedMaxSupport: support,
          observedMaxSupportRevision: currentRevision,
        },
      });
      expect(result).toMatchObject({ ok: true, lock: {
        resolution: support === "unsupported"
          ? "max_unsupported_default"
          : "max_capability_unknown_default",
      } });
    }
  });
});

function setup(options: Readonly<{
  support?: "supported" | "unsupported" | "unknown";
  admission?: Awaited<ReturnType<Dfi541ProviderReleaseAdmissionResolver["resolve"]>>;
}> = {}) {
  const modelLock = createModelLock();
  const subject = {
    modelCapabilityId: modelLock.definitionSnapshot.capabilityId,
    modelCapabilityRevision: modelLock.definitionSnapshot.revision,
    adapterDescriptorId: modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
    adapterDescriptorRevision: modelLock.adapterDescriptorSnapshot.revision,
    authority: "central_enterprise" as const,
  };
  const support = options.support ?? "supported";
  const profile = createReasoningProfile({
    schemaVersion: "v1alpha1", profileId: "reasoning.profile.dfi541", subject,
    support,
    ...(support === "supported" ? { maxStrategy: {
      strategyId: "reasoning.strategy.dfi541", strategyRevision: digest("6"),
      strategyDigest: digest("7"), mappingKind: "effort_level" as const,
      timeoutPolicyRef: "timeout.policy.local-personal.v1",
    } } : support === "unsupported"
      ? { safeUnavailableReasonCode: "reasoning.max.unsupported" }
      : {}),
  });
  const counts = { profile: 0, admission: 0 };
  const profiles = {
    async loadExact() {
      counts.profile += 1;
      return support === "unknown" ? undefined : profile;
    },
  };
  const admitted = {
    state: "admitted" as const,
    evidence: {
      state: "admitted" as const,
      policyRef: exact("1"), profileRef: {
        revision: profile.profileRevision, digest: profile.profileDigest,
      },
      strategyRef: {
        revision: profile.maxStrategy?.strategyRevision ?? digest("6"),
        digest: profile.maxStrategy?.strategyDigest ?? digest("7"),
      },
      mappingRef: exact("2"), materializationDigest: digest("3"),
      manifestRef: exact("4"),
    },
  };
  const admission: Dfi541ProviderReleaseAdmissionResolver = {
    async resolve() {
      counts.admission += 1;
      return options.admission ?? admitted;
    },
  };
  const planner = new ReasoningModeLockPlannerV1Alpha2({
    profiles: profiles as InMemoryReasoningProfileSource,
    subjects: new TaskLockedReasoningProfileSubjectResolver(),
    admission,
  });
  const observed = calculateReasoningSupportRevision({
    subject, ...(support === "unknown" ? {} : { profile }),
  });
  return {
    planner, profile, subject, counts,
    supportedPreference: {
      requestedMode: "max" as const,
      observedMaxSupport: "supported" as const,
      observedMaxSupportRevision: support === "supported" ? observed : digest("9"),
    },
    input: {
      taskId: modelLock.taskId, reasoningModeLockId: id("4"), lockedAt: at,
      modelLock, candidateAuthority: "central_enterprise" as const,
    },
  };
}

function exact(marker: string) {
  return { revision: digest(marker), digest: digest(marker) };
}

function createModelLock(): TaskCapabilityLock {
  const source = { trust: "official" as const, packageId: "robothree.official.dfi541",
    packageRevision: digest("8") };
  const descriptor = createAdapterDescriptor({ schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.dfi541", adapterKind: "model_provider",
    source, implementationRef: "core:dfi541-fixture", runtimeBoundary: "in_process",
    protocol: { name: "fixture-model", version: "v1alpha1" } });
  const definition = createCapabilityDefinition({ schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.dfi541", kind: "model", name: "DFI-5.4.1 model",
    description: "Exact model fixture", source,
    model: { family: "fixture", inputModalities: ["text"], outputModalities: ["text"],
      contextWindow: 128_000, supportsStreaming: true } });
  const binding = createCapabilityBinding({ schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.dfi541",
    capability: { capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision },
    adapterDescriptor: { adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision },
    port: "model_provider", source });
  return { schemaVersion: CONTRACT_VERSION, lockId: id("3"), taskId: id("2"),
    registryRevision: digest("a"), definitionSnapshot: definition,
    bindingSnapshot: binding, adapterDescriptorSnapshot: descriptor, lockedAt: at };
}
