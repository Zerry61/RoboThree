import type { TaskCapabilityLock } from "@robothree/contracts";
import type { ReasoningModeLockV1Alpha2 } from
  "@robothree/contracts/reasoning-mode/v1alpha2";
import type { ReasoningProfileSubject } from
  "@robothree/contracts/reasoning-mode/v1alpha1";
import type { SafeReasoningAdmissionEvidenceV1Alpha5 } from
  "@robothree/contracts/submit-turn-coordination/v1alpha5";

import { createChatCompletionsUrl } from
  "../adapters/https/local-personal-openai-compatible-model-provider.js";
import type { PersonalCredentialStore } from "../ports/personal-credential-store.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";
import type { ReasoningProfileSource } from "../ports/desktop-reasoning-mode.js";
import type { Dfi541ExactSubjectAdmissionInputSource } from
  "./dfi541-provider-release-admission.js";
import {
  deriveExactSubjectProviderReleaseMaterial,
  ExactSubjectBoundProviderReleaseMaterializer,
  type ExactSubjectProviderReleaseMaterializationInput,
} from "./exact-subject-provider-release-materializer.js";
import {
  deriveLocalPersonalReasoningProfileSubject,
  localPersonalReasoningTimeoutPolicyIdentity,
} from "./local-personal-reasoning-mapping.js";
import {
  deriveLocalDesktopSubjectAuthority,
  validateLocalDesktopSubjectAuthority,
} from "./local-desktop-subject-authority.js";
import { LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1 } from
  "./model-invocation-timeout-policy.js";
import {
  validatePersonalModelDefinition,
  validatePersonalModelHead,
} from "./personal-model-domain.js";
import { PersonalModelProviderProfileRegistry } from
  "./personal-model-provider-profile.js";
import { PersonalModelTaskLockMaterializer } from "./personal-model-task-lock.js";
import {
  LOCAL_OPENAI_REASONING_REQUEST_PROJECTOR_REVISION,
  LOCAL_PERSONAL_ADAPTER_CONTRACT_REVISION,
} from "./provider-release-admission-policy.js";
import {
  CodeOwnedProviderReleaseAdmissionSource,
  OPENAI_GPT_5_2_CONFORMANCE_MANIFEST,
} from "./provider-release-admitted-source.js";
import { ReleasePinnedReasoningMappingRegistry } from
  "./release-pinned-reasoning-mapping-registry.js";
import { sameReasoningProfileSubject } from "./desktop-reasoning-mode-domain.js";

export class LocalPersonalAdmittedReasoningProfileSource
implements ReasoningProfileSource {
  readonly #profiles: PersonalModelProviderProfileRegistry;
  readonly #policies: CodeOwnedProviderReleaseAdmissionSource;

  public constructor(private readonly dependencies: Readonly<{
    personal: PersonalModelPersistence;
    profiles?: PersonalModelProviderProfileRegistry;
    policies?: CodeOwnedProviderReleaseAdmissionSource;
  }>) {
    this.#profiles = dependencies.profiles ?? new PersonalModelProviderProfileRegistry();
    this.#policies = dependencies.policies ?? new CodeOwnedProviderReleaseAdmissionSource();
  }

  public async loadExact(subject: ReasoningProfileSubject) {
    if (subject.authority !== "local_personal"
      || subject.personalExecutionDefinitionDigest === undefined) return undefined;
    const namespace = await this.dependencies.personal.loadActiveOwnerNamespace();
    if (namespace === undefined) return undefined;
    const authority = validateLocalDesktopSubjectAuthority(
      namespace,
      deriveLocalDesktopSubjectAuthority(namespace),
    );
    const ownerIdentity = {
      ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
      ownerScopeDigest: authority.ownerScopeDigest,
    };
    const headRecord = await this.dependencies.personal.loadHead(
      ownerIdentity,
      subject.modelCapabilityId,
    );
    if (headRecord === undefined) return undefined;
    const head = validatePersonalModelHead(headRecord);
    if (head.selectionState !== "active"
      || head.currentExecutionDefinitionDigest
        !== subject.personalExecutionDefinitionDigest) return undefined;
    const definitionRecord = await this.dependencies.personal.loadDefinition(
      ownerIdentity,
      subject.modelCapabilityId,
      head.currentConfigurationRevision,
    );
    if (definitionRecord === undefined) return undefined;
    const definition = validatePersonalModelDefinition(definitionRecord);
    if (definition.executionDefinitionDigest
      !== subject.personalExecutionDefinitionDigest) return undefined;
    const providerProfile = this.#profiles.resolve(
      definition.providerKind,
      definition.providerProfileRevision,
    );
    const policy = exactPolicy(this.#policies, definition, providerProfile);
    if (policy === undefined) return undefined;
    return deriveExactSubjectProviderReleaseMaterial({ subject, policy }).release.profile;
  }
}

export class LocalPersonalDfi541AdmissionInputSource
implements Dfi541ExactSubjectAdmissionInputSource {
  readonly #profiles: PersonalModelProviderProfileRegistry;
  readonly #policies: CodeOwnedProviderReleaseAdmissionSource;

  public constructor(private readonly dependencies: Readonly<{
    personal: PersonalModelPersistence;
    credentials: PersonalCredentialStore;
    profiles?: PersonalModelProviderProfileRegistry;
    policies?: CodeOwnedProviderReleaseAdmissionSource;
  }>) {
    this.#profiles = dependencies.profiles ?? new PersonalModelProviderProfileRegistry();
    this.#policies = dependencies.policies ?? new CodeOwnedProviderReleaseAdmissionSource();
  }

  public async loadExact(input: Readonly<{
    subject: ReasoningProfileSubject;
    modelLock: TaskCapabilityLock;
  }>): Promise<ExactSubjectProviderReleaseMaterializationInput | undefined> {
    const namespace = await this.dependencies.personal.loadActiveOwnerNamespace();
    if (namespace === undefined) return undefined;
    const authority = validateLocalDesktopSubjectAuthority(
      namespace,
      deriveLocalDesktopSubjectAuthority(namespace),
    );
    const lockIdentity = new PersonalModelTaskLockMaterializer().verify({
      lock: input.modelLock,
      namespace,
    });
    const ownerIdentity = lockIdentity.ownerIdentity;
    const definition = await this.dependencies.personal.loadDefinition(
      ownerIdentity,
      input.modelLock.definitionSnapshot.capabilityId,
      lockIdentity.configurationRevision,
    );
    const head = await this.dependencies.personal.loadHead(
      ownerIdentity,
      input.modelLock.definitionSnapshot.capabilityId,
    );
    const status = await this.dependencies.personal.loadStatus(
      ownerIdentity,
      input.modelLock.definitionSnapshot.capabilityId,
      lockIdentity.configurationRevision,
    );
    if (definition === undefined || head === undefined || status === undefined) return undefined;
    const parsedDefinition = validatePersonalModelDefinition(definition);
    const exactSubject = deriveLocalPersonalReasoningProfileSubject({
      definition: parsedDefinition,
      modelLock: input.modelLock,
      adapterDescriptorId: input.modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
      adapterDescriptorRevision: input.modelLock.adapterDescriptorSnapshot.revision,
    });
    if (!sameReasoningProfileSubject(exactSubject, input.subject)) return undefined;
    const profile = this.#profiles.resolve(
      parsedDefinition.providerKind,
      parsedDefinition.providerProfileRevision,
    );
    const policy = exactPolicy(this.#policies, parsedDefinition, profile);
    if (policy === undefined) return undefined;
    return Object.freeze({
      namespace,
      authority,
      definition: parsedDefinition,
      head,
      status,
      credentialObservation: await this.dependencies.credentials.inspect(
        parsedDefinition.credentialRef,
      ),
      modelLock: input.modelLock,
      profile,
      policy,
      conformanceManifest: OPENAI_GPT_5_2_CONFORMANCE_MANIFEST,
    });
  }
}

export class TaskPinnedReasoningReleaseResolver {
  readonly #profiles: PersonalModelProviderProfileRegistry;
  readonly #policies: CodeOwnedProviderReleaseAdmissionSource;
  readonly #materializer: ExactSubjectBoundProviderReleaseMaterializer;

  public constructor(private readonly dependencies: Readonly<{
    personal: PersonalModelPersistence;
    profiles?: PersonalModelProviderProfileRegistry;
    policies?: CodeOwnedProviderReleaseAdmissionSource;
    materializer?: ExactSubjectBoundProviderReleaseMaterializer;
  }>) {
    this.#profiles = dependencies.profiles ?? new PersonalModelProviderProfileRegistry();
    this.#policies = dependencies.policies ?? new CodeOwnedProviderReleaseAdmissionSource();
    this.#materializer = dependencies.materializer
      ?? new ExactSubjectBoundProviderReleaseMaterializer();
  }

  public async reconstructForExecution(input: Readonly<{
    modelLock: TaskCapabilityLock;
    reasoningModeLock: ReasoningModeLockV1Alpha2;
    admissionEvidence: SafeReasoningAdmissionEvidenceV1Alpha5;
  }>): Promise<ReleasePinnedReasoningMappingRegistry | undefined> {
    if (input.reasoningModeLock.resolution !== "max_applied") {
      if (input.admissionEvidence.state === "admitted") {
        throw new Error("provider_release.materialization_conflict");
      }
      return undefined;
    }
    if (input.admissionEvidence.state !== "admitted") {
      throw new Error("provider_release.materialization_conflict");
    }
    const namespace = await this.dependencies.personal.loadActiveOwnerNamespace();
    if (namespace === undefined) throw new Error("provider_release.subject_invalid");
    const authority = validateLocalDesktopSubjectAuthority(
      namespace,
      deriveLocalDesktopSubjectAuthority(namespace),
    );
    const lockIdentity = new PersonalModelTaskLockMaterializer().verify({
      lock: input.modelLock,
      namespace,
    });
    const definition = await this.dependencies.personal.loadDefinition(
      lockIdentity.ownerIdentity,
      input.modelLock.definitionSnapshot.capabilityId,
      lockIdentity.configurationRevision,
    );
    if (definition === undefined) throw new Error("provider_release.subject_invalid");
    const parsedDefinition = validatePersonalModelDefinition(definition);
    const profile = this.#profiles.resolve(
      parsedDefinition.providerKind,
      parsedDefinition.providerProfileRevision,
    );
    const policy = exactPolicy(this.#policies, parsedDefinition, profile);
    if (policy === undefined) throw new Error("provider_release.policy_unavailable");
    const materialized = this.#materializer.reconstructForExecution({
      namespace,
      authority,
      definition: parsedDefinition,
      modelLock: input.modelLock,
      profile,
      policy,
      conformanceManifest: OPENAI_GPT_5_2_CONFORMANCE_MANIFEST,
    });
    if (materialized.state !== "production_admitted_materialized") {
      throw new Error(materialized.state === "rejected"
        ? materialized.code
        : "provider_release.policy_not_admitted");
    }
    const envelope = materialized.envelope;
    const evidence = input.admissionEvidence;
    const release = materialized.release;
    if (
      envelope.materializationDigest !== evidence.materializationDigest
      || envelope.policyRef.policyRevision !== evidence.policyRef.revision
      || envelope.policyRef.policyDigest !== evidence.policyRef.digest
      || envelope.profileRef.profileRevision !== evidence.profileRef.revision
      || envelope.profileRef.profileDigest !== evidence.profileRef.digest
      || envelope.strategyRef.strategyRevision !== evidence.strategyRef.revision
      || envelope.strategyRef.strategyDigest !== evidence.strategyRef.digest
      || envelope.mappingRef.mappingRevision !== evidence.mappingRef.revision
      || envelope.mappingRef.mappingDigest !== evidence.mappingRef.digest
      || envelope.conformanceManifestRef.manifestRevision !== evidence.manifestRef.revision
      || envelope.conformanceManifestRef.manifestDigest !== evidence.manifestRef.digest
      || release.mapping.profileRef.profileId !== input.reasoningModeLock.profileRef.profileId
      || release.mapping.profileRef.profileRevision
        !== input.reasoningModeLock.profileRef.profileRevision
      || release.mapping.profileRef.profileDigest
        !== input.reasoningModeLock.profileRef.profileDigest
      || release.mapping.strategyRef.strategyId !== input.reasoningModeLock.strategyRef.strategyId
      || release.mapping.strategyRef.strategyRevision
        !== input.reasoningModeLock.strategyRef.strategyRevision
      || release.mapping.strategyRef.strategyDigest
        !== input.reasoningModeLock.strategyRef.strategyDigest
      || release.mapping.strategyRef.timeoutPolicyRef
        !== input.reasoningModeLock.strategyRef.timeoutPolicyRef
    ) throw new Error("provider_release.materialization_conflict");
    return new ReleasePinnedReasoningMappingRegistry([release]);
  }
}

function exactPolicy(
  policies: CodeOwnedProviderReleaseAdmissionSource,
  definition: ReturnType<typeof validatePersonalModelDefinition>,
  profile: ReturnType<PersonalModelProviderProfileRegistry["resolve"]>,
) {
  const target = new URL(createChatCompletionsUrl(definition.canonicalEndpoint, profile));
  return policies.loadExact({
    providerFamily: "local_openai",
    apiFamily: "openai_chat_completions",
    exactModelId: definition.providerModelId,
    endpointIdentity: {
      protocol: target.protocol,
      host: target.host,
      path: target.pathname,
    },
    adapterContractRevision: LOCAL_PERSONAL_ADAPTER_CONTRACT_REVISION,
    requestProjectorRevision: LOCAL_OPENAI_REASONING_REQUEST_PROJECTOR_REVISION,
    timeoutPolicyIdentity: localPersonalReasoningTimeoutPolicyIdentity(
      LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    ),
  });
}
