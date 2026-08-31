import {
  JsonValueSchema,
  type RuntimeError,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import type { SubmitTurnReasoningPreferenceV1Alpha5 } from
  "@robothree/contracts/desktop-local/v1alpha5";
import type { ReasoningModeLockV1Alpha2 } from
  "@robothree/contracts/reasoning-mode/v1alpha2";
import type { ReasoningProfileSubject } from
  "@robothree/contracts/reasoning-mode/v1alpha1";
import {
  SafeReasoningAdmissionEvidenceV1Alpha5Schema,
  type SafeReasoningAdmissionEvidenceV1Alpha5,
} from "@robothree/contracts/submit-turn-coordination/v1alpha5";

import type { TaskLockedPersonalOwnerIdentity } from
  "../ports/r2d3-acceptance-authority.js";
import type { ReasoningProfileSource } from "../ports/desktop-reasoning-mode.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import { validateTaskCapabilityLockRevisions } from
  "../registry/capability-revision.js";
import {
  calculateReasoningSupportRevision,
  sameReasoningProfileSubject,
  validateReasoningProfile,
} from "./desktop-reasoning-mode-domain.js";
import {
  createReasoningModeLockV1Alpha2,
  createReasoningResolutionEvidenceV1,
  resolutionEvidenceRef,
  type ReasoningResolutionEvidenceV1,
} from "./reasoning-mode-lock-v1alpha2-domain.js";
import type {
  TaskLockedReasoningProfileSubjectResolver,
  ReasoningCandidateAuthority,
} from "./reasoning-mode-lock-planner.js";

export const DFI541_PROVIDER_RELEASE_FALLBACK_ALLOWLIST = Object.freeze([
  "provider_release.policy_unavailable",
  "provider_release.policy_not_admitted",
] as const);

export type Dfi541ProviderReleaseAdmissionResult =
  | Readonly<{
    state: "admitted";
    evidence: SafeReasoningAdmissionEvidenceV1Alpha5 & { state: "admitted" };
  }>
  | Readonly<{
    state: "unavailable";
    code: typeof DFI541_PROVIDER_RELEASE_FALLBACK_ALLOWLIST[number];
  }>
  | Readonly<{
    state: "rejected";
    code: string;
  }>;

export interface Dfi541ProviderReleaseAdmissionResolver {
  resolve(input: Readonly<{
    subject: ReasoningProfileSubject;
    modelLock: TaskCapabilityLock;
    profileId: string;
    profileRevision: string;
    profileDigest: string;
    strategyId: string;
    strategyRevision: string;
    strategyDigest: string;
    timeoutPolicyRef: string;
  }>): Promise<Dfi541ProviderReleaseAdmissionResult>;
}

export type ReasoningModeLockPlanV1Alpha2Result =
  | Readonly<{
    ok: true;
    lock: ReasoningModeLockV1Alpha2;
    resolutionEvidence?: ReasoningResolutionEvidenceV1;
    admissionEvidence: SafeReasoningAdmissionEvidenceV1Alpha5;
  }>
  | Readonly<{ ok: false; error: RuntimeError }>;

export class ReasoningModeLockPlannerV1Alpha2 {
  public constructor(private readonly dependencies: Readonly<{
    profiles: ReasoningProfileSource;
    subjects: TaskLockedReasoningProfileSubjectResolver;
    admission: Dfi541ProviderReleaseAdmissionResolver;
  }>) {}

  public async plan(input: Readonly<{
    reasoningPreference: SubmitTurnReasoningPreferenceV1Alpha5;
    taskId: string;
    reasoningModeLockId: string;
    lockedAt: string;
    modelLock: TaskCapabilityLock;
    candidateAuthority: ReasoningCandidateAuthority;
    personalOwnerAuthority?: TaskLockedPersonalOwnerIdentity;
  }>): Promise<ReasoningModeLockPlanV1Alpha2Result> {
    let modelLock: TaskCapabilityLock;
    try {
      modelLock = validateTaskCapabilityLockRevisions(input.modelLock);
    } catch {
      return fail("reasoning_profile_unavailable", "The Model lock cannot be verified");
    }
    const common = {
      schemaVersion: "v1alpha2" as const,
      reasoningModeLockId: input.reasoningModeLockId,
      taskId: input.taskId,
      modelLockRef: {
        lockId: modelLock.lockId,
        lockDigest: sha256CanonicalJson(JsonValueSchema.parse(modelLock)),
      },
      lockedAt: input.lockedAt,
    };
    if (input.reasoningPreference.requestedMode === "default") {
      return success(createReasoningModeLockV1Alpha2({
        ...common,
        requestedMode: "default",
        resolution: "default_passthrough",
      }), { state: "not_required" });
    }

    let subject: ReasoningProfileSubject;
    try {
      subject = await this.dependencies.subjects.resolve({
        candidateAuthority: input.candidateAuthority,
        modelLock,
        ...(input.personalOwnerAuthority === undefined
          ? {}
          : { personalOwnerAuthority: input.personalOwnerAuthority }),
      });
    } catch {
      return fail("reasoning_profile_unavailable", "The reasoning subject is unavailable");
    }

    let profile;
    let currentSupport: "supported" | "unsupported" | "unknown";
    let currentRevision: string;
    try {
      const loaded = await this.dependencies.profiles.loadExact(subject);
      profile = loaded === undefined ? undefined : validateReasoningProfile(loaded);
      if (profile !== undefined && !sameReasoningProfileSubject(profile.subject, subject)) {
        return fail("reasoning_profile_unavailable", "The reasoning profile is invalid");
      }
      currentSupport = profile?.support ?? "unknown";
      currentRevision = calculateReasoningSupportRevision({
        subject,
        ...(profile === undefined ? {} : { profile }),
      });
    } catch {
      return fail("reasoning_profile_unavailable", "The reasoning profile is unavailable");
    }

    const observedSupport = input.reasoningPreference.observedMaxSupport;
    const observedRevision = input.reasoningPreference.observedMaxSupportRevision;
    if (observedSupport === "supported"
      && (currentSupport !== observedSupport || currentRevision !== observedRevision)) {
      const evidence = createReasoningResolutionEvidenceV1({
        schemaVersion: "v1",
        taskId: input.taskId,
        reasoningModeLockId: input.reasoningModeLockId,
        modelLockDigest: common.modelLockRef.lockDigest,
        cause: "support_changed",
        observedMaxSupport: "supported",
        observedMaxSupportRevision: observedRevision,
        resolvedMaxSupport: currentSupport,
        resolvedMaxSupportRevision: currentRevision,
      });
      const ref = resolutionEvidenceRef(evidence);
      return success(createReasoningModeLockV1Alpha2({
        ...common,
        requestedMode: "max",
        observedMaxSupport: "supported",
        observedMaxSupportRevision: observedRevision,
        resolution: "max_support_changed_default",
        resolvedMaxSupport: currentSupport,
        resolvedMaxSupportRevision: currentRevision,
        ...ref,
      }), { state: "not_required" }, evidence);
    }
    if (currentSupport !== observedSupport || currentRevision !== observedRevision) {
      return fail("reasoning_selection_stale", "The observed reasoning capability is stale");
    }
    if (currentSupport === "unsupported") {
      return success(createReasoningModeLockV1Alpha2({
        ...common,
        requestedMode: "max",
        observedMaxSupport: "unsupported",
        observedMaxSupportRevision: observedRevision,
        resolution: "max_unsupported_default",
      }), { state: "not_required" });
    }
    if (currentSupport === "unknown") {
      return success(createReasoningModeLockV1Alpha2({
        ...common,
        requestedMode: "max",
        observedMaxSupport: "unknown",
        observedMaxSupportRevision: observedRevision,
        resolution: "max_capability_unknown_default",
      }), { state: "not_required" });
    }
    if (profile?.maxStrategy === undefined) {
      return fail("reasoning_profile_unavailable", "The Max strategy is unavailable");
    }

    const admission = await this.dependencies.admission.resolve({
      subject,
      modelLock,
      profileId: profile.profileId,
      profileRevision: profile.profileRevision,
      profileDigest: profile.profileDigest,
      strategyId: profile.maxStrategy.strategyId,
      strategyRevision: profile.maxStrategy.strategyRevision,
      strategyDigest: profile.maxStrategy.strategyDigest,
      timeoutPolicyRef: profile.maxStrategy.timeoutPolicyRef,
    });
    if (admission.state === "rejected") {
      return fail(
        "reasoning_admission_integrity_invalid",
        "The Max admission evidence cannot be verified",
      );
    }
    if (admission.state === "unavailable") {
      const evidence = createReasoningResolutionEvidenceV1({
        schemaVersion: "v1",
        taskId: input.taskId,
        reasoningModeLockId: input.reasoningModeLockId,
        modelLockDigest: common.modelLockRef.lockDigest,
        cause: admission.code,
        observedMaxSupport: "supported",
        observedMaxSupportRevision: observedRevision,
      });
      const ref = resolutionEvidenceRef(evidence);
      return success(createReasoningModeLockV1Alpha2({
        ...common,
        requestedMode: "max",
        observedMaxSupport: "supported",
        observedMaxSupportRevision: observedRevision,
        resolution: "max_mapping_unavailable_default",
        ...ref,
      }), {
        state: "unavailable",
        ...ref,
        safeCause: admission.code,
      }, evidence);
    }
    const evidence = SafeReasoningAdmissionEvidenceV1Alpha5Schema.parse(
      admission.evidence,
    );
    if (
      evidence.state !== "admitted"
      || evidence.profileRef.revision !== profile.profileRevision
      || evidence.profileRef.digest !== profile.profileDigest
      || evidence.strategyRef.revision !== profile.maxStrategy.strategyRevision
      || evidence.strategyRef.digest !== profile.maxStrategy.strategyDigest
    ) {
      return fail(
        "reasoning_admission_integrity_invalid",
        "The Max admission evidence does not match the exact locked strategy",
      );
    }
    return success(createReasoningModeLockV1Alpha2({
      ...common,
      requestedMode: "max",
      observedMaxSupport: "supported",
      observedMaxSupportRevision: observedRevision,
      resolution: "max_applied",
      profileRef: {
        profileId: profile.profileId,
        profileRevision: profile.profileRevision,
        profileDigest: profile.profileDigest,
      },
      strategyRef: {
        strategyId: profile.maxStrategy.strategyId,
        strategyRevision: profile.maxStrategy.strategyRevision,
        strategyDigest: profile.maxStrategy.strategyDigest,
        timeoutPolicyRef: profile.maxStrategy.timeoutPolicyRef,
      },
    }), evidence);
  }
}

function success(
  lock: ReasoningModeLockV1Alpha2,
  admissionEvidence: SafeReasoningAdmissionEvidenceV1Alpha5,
  resolutionEvidence?: ReasoningResolutionEvidenceV1,
): ReasoningModeLockPlanV1Alpha2Result {
  return Object.freeze({
    ok: true,
    lock,
    admissionEvidence: SafeReasoningAdmissionEvidenceV1Alpha5Schema.parse(
      admissionEvidence,
    ),
    ...(resolutionEvidence === undefined ? {} : { resolutionEvidence }),
  });
}

function fail(code: string, message: string): ReasoningModeLockPlanV1Alpha2Result {
  return Object.freeze({
    ok: false,
    error: { code, category: "configuration" as const, message, retryable: false },
  });
}
