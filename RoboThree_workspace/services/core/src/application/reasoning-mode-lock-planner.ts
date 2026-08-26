import {
  JsonValueSchema,
  type RuntimeError,
  type SubmitTurnReasoningPreferenceV1Alpha3,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import type {
  ReasoningModeLock,
  ReasoningProfileSubject,
} from "@robothree/contracts/reasoning-mode/v1alpha1";

import type { PersonalModelOwnerAuthority } from
  "../ports/personal-model-owner-authority.js";
import type { PersonalModelPersistence } from
  "../ports/personal-model-persistence.js";
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
  PersonalModelTaskLockMaterializer,
  isPersonalModelLock,
} from "./personal-model-task-lock.js";
import { createReasoningModeLock } from "./reasoning-mode-lock-domain.js";

export type ReasoningCandidateAuthority =
  | "central_enterprise"
  | "local_personal";

export type ReasoningModeLockPlanResult =
  | Readonly<{ ok: true; lock: ReasoningModeLock }>
  | Readonly<{ ok: false; error: RuntimeError }>;

export class TaskLockedReasoningProfileSubjectResolver {
  readonly #personal: PersonalModelPersistence | undefined;
  readonly #materializer: PersonalModelTaskLockMaterializer;

  public constructor(input: Readonly<{
    personal?: PersonalModelPersistence;
    materializer?: PersonalModelTaskLockMaterializer;
  }> = {}) {
    this.#personal = input.personal;
    this.#materializer = input.materializer ?? new PersonalModelTaskLockMaterializer();
  }

  public async resolve(input: Readonly<{
    candidateAuthority: ReasoningCandidateAuthority;
    modelLock: TaskCapabilityLock;
    personalOwnerAuthority?: PersonalModelOwnerAuthority;
  }>): Promise<ReasoningProfileSubject> {
    const lock = validateTaskCapabilityLockRevisions(input.modelLock);
    const personal = isPersonalModelLock(lock);
    if (input.candidateAuthority === "central_enterprise") {
      if (personal) throw new ReasoningProfileSubjectResolutionError();
      return Object.freeze({
        modelCapabilityId: lock.definitionSnapshot.capabilityId,
        modelCapabilityRevision: lock.definitionSnapshot.revision,
        adapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
        adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
        authority: "central_enterprise",
      });
    }
    if (!personal || this.#personal === undefined
      || input.personalOwnerAuthority === undefined) {
      throw new ReasoningProfileSubjectResolutionError();
    }
    const namespace = await this.#personal.loadActiveOwnerNamespace();
    if (namespace === undefined) throw new ReasoningProfileSubjectResolutionError();
    let identity;
    try {
      identity = this.#materializer.verify({ lock, namespace });
    } catch {
      throw new ReasoningProfileSubjectResolutionError();
    }
    if (
      identity.ownerIdentity.ownerScopeNamespaceRevision
        !== input.personalOwnerAuthority.ownerIdentity.ownerScopeNamespaceRevision
      || identity.ownerIdentity.ownerScopeDigest
        !== input.personalOwnerAuthority.ownerIdentity.ownerScopeDigest
    ) {
      throw new ReasoningProfileSubjectResolutionError();
    }
    return Object.freeze({
      modelCapabilityId: lock.definitionSnapshot.capabilityId,
      modelCapabilityRevision: lock.definitionSnapshot.revision,
      adapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
      adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
      authority: "local_personal",
      personalExecutionDefinitionDigest: identity.executionDefinitionDigest,
    });
  }
}

export class ReasoningModeLockPlanner {
  public constructor(private readonly dependencies: Readonly<{
    profiles: ReasoningProfileSource;
    subjects: TaskLockedReasoningProfileSubjectResolver;
  }>) {}

  public async plan(input: Readonly<{
    reasoningPreference: SubmitTurnReasoningPreferenceV1Alpha3;
    taskId: string;
    reasoningModeLockId: string;
    lockedAt: string;
    modelLock: TaskCapabilityLock;
    candidateAuthority: ReasoningCandidateAuthority;
    personalOwnerAuthority?: PersonalModelOwnerAuthority;
  }>): Promise<ReasoningModeLockPlanResult> {
    let modelLock: TaskCapabilityLock;
    try {
      modelLock = validateTaskCapabilityLockRevisions(input.modelLock);
    } catch {
      return unavailable();
    }
    const common = {
      schemaVersion: "v1alpha1" as const,
      reasoningModeLockId: input.reasoningModeLockId,
      taskId: input.taskId,
      modelLockRef: {
        lockId: modelLock.lockId,
        lockDigest: sha256CanonicalJson(JsonValueSchema.parse(modelLock)),
      },
      lockedAt: input.lockedAt,
    };
    if (input.reasoningPreference.requestedMode === "default") {
      try {
        return {
          ok: true,
          lock: createReasoningModeLock({
            ...common,
            requestedMode: "default",
            resolution: "default_passthrough",
          }),
        };
      } catch {
        return unavailable();
      }
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
      return unavailable();
    }

    let loaded;
    try {
      loaded = await this.dependencies.profiles.loadExact(subject);
    } catch {
      return unavailable();
    }

    let profile;
    let currentSupport: "supported" | "unsupported" | "unknown";
    let currentRevision: string;
    try {
      profile = loaded === undefined ? undefined : validateReasoningProfile(loaded);
      if (profile !== undefined && !sameReasoningProfileSubject(profile.subject, subject)) {
        return unavailable();
      }
      currentSupport = profile?.support ?? "unknown";
      currentRevision = calculateReasoningSupportRevision({
        subject,
        ...(profile === undefined ? {} : { profile }),
      });
    } catch {
      return unavailable();
    }

    if (
      currentSupport !== input.reasoningPreference.observedMaxSupport
      || currentRevision
        !== input.reasoningPreference.observedMaxSupportRevision
    ) return stale();

    try {
      if (currentSupport === "supported") {
        if (profile?.maxStrategy === undefined) return unavailable();
        return {
          ok: true,
          lock: createReasoningModeLock({
            ...common,
            requestedMode: "max",
            observedMaxSupport: "supported",
            observedMaxSupportRevision:
              input.reasoningPreference.observedMaxSupportRevision,
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
          }),
        };
      }
      return currentSupport === "unsupported"
        ? {
          ok: true,
          lock: createReasoningModeLock({
            ...common,
            requestedMode: "max",
            observedMaxSupport: "unsupported",
            observedMaxSupportRevision:
              input.reasoningPreference.observedMaxSupportRevision,
            resolution: "max_unsupported_default",
          }),
        }
        : {
          ok: true,
          lock: createReasoningModeLock({
            ...common,
            requestedMode: "max",
            observedMaxSupport: "unknown",
            observedMaxSupportRevision:
              input.reasoningPreference.observedMaxSupportRevision,
            resolution: "max_capability_unknown_default",
          }),
        };
    } catch {
      return unavailable();
    }
  }
}

export class ReasoningProfileSubjectResolutionError extends Error {
  public constructor() {
    super("reasoning profile subject is unavailable");
    this.name = "ReasoningProfileSubjectResolutionError";
  }
}

function stale(): ReasoningModeLockPlanResult {
  return {
    ok: false,
    error: {
      code: "reasoning_selection_stale",
      category: "configuration",
      message: "The observed reasoning capability is stale",
      retryable: false,
    },
  };
}

function unavailable(): ReasoningModeLockPlanResult {
  return {
    ok: false,
    error: {
      code: "reasoning_profile_unavailable",
      category: "configuration",
      message: "The reasoning profile cannot be verified",
      retryable: true,
    },
  };
}
