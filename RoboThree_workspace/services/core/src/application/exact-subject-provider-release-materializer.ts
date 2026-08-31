import {
  JsonValueSchema,
  NamespacedResourceIdSchema,
  Sha256DigestSchema,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import { ReasoningProfileSubjectSchema, type ReasoningProfileSubject } from
  "@robothree/contracts/reasoning-mode/v1alpha1";
import { z } from "zod";

import { createChatCompletionsUrl } from
  "../adapters/https/local-personal-openai-compatible-model-provider.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  deriveLocalPersonalReasoningProfileSubject,
  localPersonalReasoningTimeoutPolicyIdentity,
} from "./local-personal-reasoning-mapping.js";
import {
  validateLocalDesktopSubjectAuthority,
  type LocalDesktopSubjectAuthorityV1,
} from "./local-desktop-subject-authority.js";
import { LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1 } from
  "./model-invocation-timeout-policy.js";
import {
  PersonalCredentialObservationSchema,
  validatePersonalModelDefinition,
  validatePersonalModelHead,
  validatePersonalModelOwnerNamespace,
  validatePersonalModelStatusFact,
  type PersonalCredentialObservation,
  type PersonalModelDefinition,
  type PersonalModelHead,
  type PersonalModelOwnerNamespace,
  type PersonalModelStatusFact,
} from "./personal-model-domain.js";
import {
  PersonalModelProviderProfileRegistry,
  type PersonalModelProviderProfile,
} from "./personal-model-provider-profile.js";
import { PersonalModelTaskLockMaterializer } from "./personal-model-task-lock.js";
import {
  LOCAL_OPENAI_REASONING_REQUEST_PROJECTOR_REVISION,
  LOCAL_PERSONAL_ADAPTER_CONTRACT_REVISION,
  validateReadableProviderReleaseAdmissionPolicy,
  type ReadableProviderReleaseAdmissionPolicy,
} from "./provider-release-admission-policy.js";
import {
  ProviderReleaseConformanceManifestError,
  validateProviderReleaseConformanceManifestV1,
  type ProviderReleaseConformanceManifestV1,
} from "./provider-release-conformance-manifest.js";
import {
  createProviderReasoningMappingRelease,
  validateProviderReasoningMappingRelease,
  type ProviderReasoningMappingRelease,
} from "./provider-reasoning-mapping-domain.js";

export const PROVIDER_RELEASE_SUBJECT_BOUND_ID_DOMAIN =
  "robothree.provider-release.subject-bound-id.v1\n" as const;
export const PROVIDER_RELEASE_MATERIALIZATION_ENVELOPE_DOMAIN =
  "robothree.provider-release.materialization-envelope.v1\n" as const;
export const PRA2_PRODUCTION_SUPPORTED_RELEASE_COUNT = 0 as const;

const ProviderReleaseMaterializationEnvelopeMaterialSchema = z.object({
  schemaVersion: z.literal("v1"),
  materializationId: NamespacedResourceIdSchema,
  policyRef: z.object({
    policyId: NamespacedResourceIdSchema,
    policyRevision: Sha256DigestSchema,
    policyDigest: Sha256DigestSchema,
  }).strict(),
  subjectDigest: Sha256DigestSchema,
  profileRef: z.object({
    profileId: NamespacedResourceIdSchema,
    profileRevision: Sha256DigestSchema,
    profileDigest: Sha256DigestSchema,
  }).strict(),
  strategyRef: z.object({
    strategyId: NamespacedResourceIdSchema,
    strategyRevision: Sha256DigestSchema,
    strategyDigest: Sha256DigestSchema,
    timeoutPolicyRef: NamespacedResourceIdSchema,
  }).strict(),
  mappingRef: z.object({
    mappingId: NamespacedResourceIdSchema,
    mappingRevision: Sha256DigestSchema,
    mappingDigest: Sha256DigestSchema,
  }).strict(),
  admissionState: z.literal("pending_conformance_materialized"),
  createdFromEvidenceRevision: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (
    value.policyRef.policyRevision !== value.policyRef.policyDigest
    || value.profileRef.profileRevision !== value.profileRef.profileDigest
    || value.mappingRef.mappingRevision !== value.mappingRef.mappingDigest
  ) {
    context.addIssue({ code: "custom", message: "release refs must identify exact material" });
  }
});

export const ProviderReleaseMaterializationEnvelopeV1Schema =
  ProviderReleaseMaterializationEnvelopeMaterialSchema.extend({
    materializationDigest: Sha256DigestSchema,
  }).strict();

export type ProviderReleaseMaterializationEnvelopeV1 = z.infer<
  typeof ProviderReleaseMaterializationEnvelopeV1Schema
>;

export const ProviderReleaseMaterializationEnvelopeV2Schema =
  z.object({
    ...ProviderReleaseMaterializationEnvelopeV1Schema.shape,
    schemaVersion: z.literal("v2"),
    admissionState: z.literal("production_admitted_materialized"),
    conformanceManifestRef: z.object({
      manifestId: NamespacedResourceIdSchema,
      manifestRevision: Sha256DigestSchema,
      manifestDigest: Sha256DigestSchema,
    }).strict(),
  }).strict();

export type ProviderReleaseMaterializationEnvelopeV2 = z.infer<
  typeof ProviderReleaseMaterializationEnvelopeV2Schema
>;

export type ExactSubjectProviderReleaseMaterializationInput = Readonly<{
  namespace: PersonalModelOwnerNamespace;
  authority: LocalDesktopSubjectAuthorityV1;
  definition: PersonalModelDefinition;
  head: PersonalModelHead;
  status: PersonalModelStatusFact;
  credentialObservation: PersonalCredentialObservation;
  modelLock: TaskCapabilityLock;
  profile: PersonalModelProviderProfile;
  policy: ReadableProviderReleaseAdmissionPolicy;
  conformanceManifest?: ProviderReleaseConformanceManifestV1;
}>;

export type ExactSubjectProviderReleaseExecutionInput = Readonly<{
  namespace: PersonalModelOwnerNamespace;
  authority: LocalDesktopSubjectAuthorityV1;
  definition: PersonalModelDefinition;
  modelLock: TaskCapabilityLock;
  profile: PersonalModelProviderProfile;
  policy: ReadableProviderReleaseAdmissionPolicy;
  conformanceManifest?: ProviderReleaseConformanceManifestV1;
}>;

declare const productionAdmissionProof: unique symbol;
const productionAdmissionProofRuntime = Symbol(
  "robothree.provider-release.production-admission-proof",
) as typeof productionAdmissionProof;

export type PendingConformanceProviderReleaseMaterialization = Readonly<{
  state: "pending_conformance_materialized";
  envelope: ProviderReleaseMaterializationEnvelopeV1;
  release: ProviderReasoningMappingRelease;
}>;

export type ProductionAdmittedProviderReleaseMaterialization = Readonly<{
  state: "production_admitted_materialized";
  envelope: ProviderReleaseMaterializationEnvelopeV2;
  release: ProviderReasoningMappingRelease;
  /** Only a future code-owned admission path in this module may create this proof. */
  readonly [productionAdmissionProof]: true;
}>;

export type ExactSubjectProviderReleaseMaterializationResult =
  | PendingConformanceProviderReleaseMaterialization
  | ProductionAdmittedProviderReleaseMaterialization
  | Readonly<{
    state: "rejected";
    code: ProviderReleaseMaterializationErrorCode;
    safeSummary: string;
  }>;

export type ProviderReleaseMaterializationErrorCode =
  | "provider_release.conformance_manifest_invalid"
  | "provider_release.local_authority_invalid"
  | "provider_release.subject_invalid"
  | "provider_release.credential_observation_invalid"
  | "provider_release.policy_unavailable"
  | "provider_release.policy_not_admitted"
  | "provider_release.endpoint_mismatch"
  | "provider_release.model_snapshot_mismatch"
  | "provider_release.identity_mismatch"
  | "provider_release.materialization_conflict";

export function deriveExactSubjectProviderReleaseMaterial(input: Readonly<{
  subject: ReasoningProfileSubject;
  policy: ReadableProviderReleaseAdmissionPolicy;
}>): Readonly<{
  release: ProviderReasoningMappingRelease;
  materializationId: string;
}> {
  const subject = ReasoningProfileSubjectSchema.parse(input.subject);
  const policy = validateReadableProviderReleaseAdmissionPolicy(input.policy);
  const timeoutPolicyIdentity = localPersonalReasoningTimeoutPolicyIdentity(
    LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
  );
  const seedDigest = domainDigest(PROVIDER_RELEASE_SUBJECT_BOUND_ID_DOMAIN, {
    policyRevision: policy.policyRevision,
    subject,
    timeoutPolicyIdentity,
    adapterContractRevision: LOCAL_PERSONAL_ADAPTER_CONTRACT_REVISION,
    requestProjectorRevision: LOCAL_OPENAI_REASONING_REQUEST_PROJECTOR_REVISION,
  });
  const suffix = seedDigest.slice("sha256:".length, "sha256:".length + 40);
  const profileId = `profile.provider-release.${suffix}`;
  const strategyId = `strategy.provider-release.${suffix}`;
  const mappingId = `mapping.provider-release.${suffix}`;
  const materializationId = `provider-release.materialization.${suffix}`;
  [profileId, strategyId, mappingId, materializationId].forEach((id) =>
    NamespacedResourceIdSchema.parse(id));
  const release = validateProviderReasoningMappingRelease(
    createProviderReasoningMappingRelease({
      mappingId,
      commitment: {
        authority: "local_personal",
        providerFamily: "local_openai",
        exactSubject: subject,
        profileId,
        strategyId,
        strategyRevision: seedDigest,
        mappingKind: "effort_level",
        timeoutPolicyIdentity,
        requestProjectionRevision: LOCAL_OPENAI_REASONING_REQUEST_PROJECTOR_REVISION,
        evidenceRevision: policy.policyDigest,
        typedPrivateDirective: policy.strongestDirective,
      },
    }),
  );
  return Object.freeze({ release, materializationId });
}

export class ExactSubjectBoundProviderReleaseMaterializer {
  public materialize(
    input: ExactSubjectProviderReleaseMaterializationInput,
  ): ExactSubjectProviderReleaseMaterializationResult {
    try {
      return this.#materialize(input);
    } catch (error) {
      const code = error instanceof ProviderReleaseMaterializationError
        ? error.code
        : "provider_release.subject_invalid";
      return Object.freeze({ state: "rejected", code, safeSummary: safeSummary(code) });
    }
  }

  /**
   * Rebuilds the immutable release used by an already accepted Task. This path
   * intentionally does not read or accept current head, status or Credential
   * observations; those facts were acceptance-time admission inputs only.
   */
  public reconstructForExecution(
    input: ExactSubjectProviderReleaseExecutionInput,
  ): ExactSubjectProviderReleaseMaterializationResult {
    try {
      return this.#materializeExecution(input);
    } catch (error) {
      const code = error instanceof ProviderReleaseMaterializationError
        ? error.code
        : "provider_release.subject_invalid";
      return Object.freeze({ state: "rejected", code, safeSummary: safeSummary(code) });
    }
  }

  #materialize(
    input: ExactSubjectProviderReleaseMaterializationInput,
  ): PendingConformanceProviderReleaseMaterialization
    | ProductionAdmittedProviderReleaseMaterialization {
    const namespace = validatePersonalModelOwnerNamespace(input.namespace);
    const authority = validateLocalDesktopSubjectAuthority(namespace, input.authority);
    const definition = validatePersonalModelDefinition(input.definition);
    const head = validatePersonalModelHead(input.head);
    const status = validatePersonalModelStatusFact(input.status);
    requireOwnerAndExecutionChain(authority, definition, head, status);
    requireCredential(definition, input.credentialObservation);

    return this.#materializeExecution({
      namespace,
      authority,
      definition,
      modelLock: input.modelLock,
      profile: input.profile,
      policy: input.policy,
      ...(input.conformanceManifest === undefined
        ? {}
        : { conformanceManifest: input.conformanceManifest }),
    });
  }

  #materializeExecution(
    input: ExactSubjectProviderReleaseExecutionInput,
  ): PendingConformanceProviderReleaseMaterialization
    | ProductionAdmittedProviderReleaseMaterialization {
    const namespace = validatePersonalModelOwnerNamespace(input.namespace);
    const authority = validateLocalDesktopSubjectAuthority(namespace, input.authority);
    const definition = validatePersonalModelDefinition(input.definition);

    const lockIdentity = new PersonalModelTaskLockMaterializer().verify({
      lock: input.modelLock,
      namespace,
    });
    if (
      lockIdentity.ownerIdentity.ownerScopeNamespaceRevision
        !== authority.ownerScopeNamespaceRevision
      || lockIdentity.ownerIdentity.ownerScopeDigest !== authority.ownerScopeDigest
      || lockIdentity.configurationRevision !== definition.configurationRevision
      || lockIdentity.executionDefinitionDigest !== definition.executionDefinitionDigest
    ) {
      throw new ProviderReleaseMaterializationError("provider_release.subject_invalid");
    }

    const profile = new PersonalModelProviderProfileRegistry([input.profile]).resolve(
      definition.providerKind,
      definition.providerProfileRevision,
    );
    const policy = validateReadableProviderReleaseAdmissionPolicy(input.policy);
    if (
      policy.adapterDescriptorContractRevision !== LOCAL_PERSONAL_ADAPTER_CONTRACT_REVISION
      || policy.requestProjectorRevision
        !== LOCAL_OPENAI_REASONING_REQUEST_PROJECTOR_REVISION
    ) {
      throw new ProviderReleaseMaterializationError("provider_release.identity_mismatch");
    }
    if (!policy.exactModelIdAllowlist.includes(definition.providerModelId)) {
      throw new ProviderReleaseMaterializationError(
        "provider_release.model_snapshot_mismatch",
      );
    }
    requireEndpoint(policy, createChatCompletionsUrl(definition.canonicalEndpoint, profile));
    const timeoutPolicyIdentity = localPersonalReasoningTimeoutPolicyIdentity(
      LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    );
    if (
      policy.timeoutPolicyIdentity.timeoutPolicyRef
        !== timeoutPolicyIdentity.timeoutPolicyRef
      || policy.timeoutPolicyIdentity.timeoutPolicyRevision
        !== timeoutPolicyIdentity.timeoutPolicyRevision
      || policy.timeoutPolicyIdentity.timeoutPolicyDigest
        !== timeoutPolicyIdentity.timeoutPolicyDigest
    ) {
      throw new ProviderReleaseMaterializationError("provider_release.identity_mismatch");
    }
    const subject = ReasoningProfileSubjectSchema.parse(
      deriveLocalPersonalReasoningProfileSubject({
        definition,
        modelLock: input.modelLock,
        adapterDescriptorId: input.modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
        adapterDescriptorRevision: input.modelLock.adapterDescriptorSnapshot.revision,
      }),
    );
    const { release, materializationId } =
      deriveExactSubjectProviderReleaseMaterial({ subject, policy });
    const baseMaterial = {
      materializationId,
      policyRef: {
        policyId: policy.policyId,
        policyRevision: policy.policyRevision,
        policyDigest: policy.policyDigest,
      },
      subjectDigest: domainDigest(PROVIDER_RELEASE_SUBJECT_BOUND_ID_DOMAIN, subject),
      profileRef: release.mapping.profileRef,
      strategyRef: release.mapping.strategyRef,
      mappingRef: {
        mappingId: release.mapping.mappingId,
        mappingRevision: release.mapping.mappingRevision,
        mappingDigest: release.mapping.mappingDigest,
      },
    } as const;
    if (policy.schemaVersion === "v2") {
      if (input.conformanceManifest === undefined) {
        throw new ProviderReleaseMaterializationError("provider_release.policy_not_admitted");
      }
      let manifest: ProviderReleaseConformanceManifestV1;
      try {
        manifest = validateProviderReleaseConformanceManifestV1(
          input.conformanceManifest,
        );
      } catch (error) {
        if (error instanceof ProviderReleaseConformanceManifestError
          || error instanceof z.ZodError) {
          throw new ProviderReleaseMaterializationError(
            "provider_release.conformance_manifest_invalid",
          );
        }
        throw error;
      }
      if (
        policy.conformanceManifestRef.manifestId !== manifest.manifestId
        || policy.conformanceManifestRef.manifestRevision !== manifest.manifestRevision
        || policy.conformanceManifestRef.manifestDigest !== manifest.manifestDigest
        || manifest.exactModelId !== definition.providerModelId
        || manifest.adapterDescriptorContractRevision
          !== policy.adapterDescriptorContractRevision
        || manifest.requestProjectorRevision !== policy.requestProjectorRevision
        || manifest.timeoutPolicyRevision
          !== policy.timeoutPolicyIdentity.timeoutPolicyRevision
      ) {
        throw new ProviderReleaseMaterializationError(
          "provider_release.conformance_manifest_invalid",
        );
      }
      const admittedMaterial = {
        schemaVersion: "v2" as const,
        ...baseMaterial,
        admissionState: "production_admitted_materialized" as const,
        createdFromEvidenceRevision: manifest.manifestDigest,
        conformanceManifestRef: policy.conformanceManifestRef,
      };
      const envelope = Object.freeze(ProviderReleaseMaterializationEnvelopeV2Schema.parse({
        ...admittedMaterial,
        materializationDigest: domainDigest(
          PROVIDER_RELEASE_MATERIALIZATION_ENVELOPE_DOMAIN,
          admittedMaterial,
        ),
      }));
      return Object.freeze({
        state: "production_admitted_materialized",
        envelope,
        release,
        [productionAdmissionProofRuntime]: true,
      }) as ProductionAdmittedProviderReleaseMaterialization;
    }
    const material = ProviderReleaseMaterializationEnvelopeMaterialSchema.parse({
      schemaVersion: "v1",
      ...baseMaterial,
      admissionState: "pending_conformance_materialized",
      createdFromEvidenceRevision: policy.policyDigest,
    });
    const envelope = Object.freeze(ProviderReleaseMaterializationEnvelopeV1Schema.parse({
      ...material,
      materializationDigest: domainDigest(
        PROVIDER_RELEASE_MATERIALIZATION_ENVELOPE_DOMAIN,
        material,
      ),
    }));
    return Object.freeze({
      state: "pending_conformance_materialized",
      envelope,
      release,
    });
  }
}

function requireOwnerAndExecutionChain(
  authority: LocalDesktopSubjectAuthorityV1,
  definition: PersonalModelDefinition,
  head: PersonalModelHead,
  status: PersonalModelStatusFact,
): void {
  const ownerMatches = [definition, head, status].every((item) =>
    item.ownerScopeNamespaceRevision === authority.ownerScopeNamespaceRevision
    && item.ownerScopeDigest === authority.ownerScopeDigest);
  if (
    !ownerMatches
    || head.selectionState !== "active"
    || head.personalModelId !== definition.personalModelId
    || head.currentConfigurationRevision !== definition.configurationRevision
    || head.currentExecutionDefinitionDigest !== definition.executionDefinitionDigest
    || status.personalModelId !== definition.personalModelId
    || status.configurationRevision !== definition.configurationRevision
    || status.executionDefinitionDigest !== definition.executionDefinitionDigest
  ) {
    throw new ProviderReleaseMaterializationError("provider_release.subject_invalid");
  }
}

function requireCredential(
  definition: PersonalModelDefinition,
  input: PersonalCredentialObservation,
): void {
  const observation = PersonalCredentialObservationSchema.parse(input);
  if (
    observation.state !== "present"
    || observation.credentialRef !== definition.credentialRef
    || observation.credentialRevision !== definition.credentialRevision
    || observation.credentialBindingDigest !== definition.credentialBindingDigest
  ) {
    throw new ProviderReleaseMaterializationError(
      "provider_release.credential_observation_invalid",
    );
  }
}

function requireEndpoint(
  policy: ReadableProviderReleaseAdmissionPolicy,
  endpoint: URL,
): void {
  const expected = policy.endpointIdentityRule;
  const effectivePort = endpoint.port || (endpoint.protocol === "https:" ? "443" : "80");
  if (
    endpoint.protocol !== expected.protocol
    || endpoint.hostname.toLowerCase() !== expected.host
    || effectivePort !== "443"
    || endpoint.pathname !== expected.path
    || endpoint.username !== ""
    || endpoint.password !== ""
    || endpoint.search !== ""
    || endpoint.hash !== ""
  ) {
    throw new ProviderReleaseMaterializationError("provider_release.endpoint_mismatch");
  }
}

function domainDigest(domain: string, material: unknown) {
  return Sha256DigestSchema.parse(sha256CanonicalJson(JsonValueSchema.parse({ domain, material })));
}

function safeSummary(code: ProviderReleaseMaterializationErrorCode): string {
  switch (code) {
    case "provider_release.conformance_manifest_invalid":
      return "Max 准入验证材料不完整";
    case "provider_release.local_authority_invalid":
      return "本地模型身份校验失败";
    case "provider_release.subject_invalid":
      return "模型运行身份不一致";
    case "provider_release.credential_observation_invalid":
      return "模型凭据状态不可用";
    case "provider_release.policy_unavailable":
      return "当前模型没有可用的 Max 准入策略";
    case "provider_release.policy_not_admitted":
      return "当前模型尚未完成 Max 准入验证";
    case "provider_release.endpoint_mismatch":
      return "模型接入地址与准入策略不一致";
    case "provider_release.model_snapshot_mismatch":
      return "当前模型版本未通过 Max 准入";
    case "provider_release.identity_mismatch":
      return "模型适配身份校验失败";
    case "provider_release.materialization_conflict":
      return "Max 准入材料发生冲突";
  }
}

export class ProviderReleaseMaterializationError extends Error {
  public constructor(readonly code: ProviderReleaseMaterializationErrorCode) {
    super(code);
    this.name = "ProviderReleaseMaterializationError";
  }
}
