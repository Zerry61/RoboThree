import {
  JsonValueSchema,
  NamespacedResourceIdSchema,
  Sha256DigestSchema,
  type Sha256Digest,
} from "@robothree/contracts";
import {
  ReasoningMappingKindSchema,
  ReasoningProfileSubjectSchema,
  type ReasoningProfile,
} from "@robothree/contracts/reasoning-mode/v1alpha1";
import {
  ReasoningModeLockProfileRefSchema,
  ReasoningModeLockStrategyRefSchema,
} from "@robothree/contracts/reasoning-mode/v1alpha1";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  createReasoningProfile,
  sameReasoningProfileSubject,
  validateReasoningProfile,
} from "./desktop-reasoning-mode-domain.js";

const STRATEGY_COMMITMENT_DOMAIN = "robothree.provider-reasoning-strategy.v1\n";
const PRIVATE_MAPPING_DOMAIN = "robothree.provider-reasoning-mapping.v1\n";

export const ProviderReasoningAuthoritySchema = z.enum([
  "central_enterprise",
  "local_personal",
]);

export const ProviderReasoningFamilySchema = z.enum([
  "enterprise_openai",
  "enterprise_anthropic",
  "local_openai",
]);

export const ProviderReasoningTimeoutPolicyIdentitySchema = z.object({
  timeoutPolicyRef: NamespacedResourceIdSchema,
  timeoutPolicyRevision: z.string()
    .min(3)
    .max(120)
    .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/u),
  timeoutPolicyDigest: Sha256DigestSchema,
}).strict();

export const OpenAiReasoningEffortDirectiveSchema = z.object({
  kind: z.literal("openai_reasoning_effort"),
  effort: z.enum(["high", "xhigh"]),
}).strict();

export const AnthropicThinkingBudgetDirectiveSchema = z.object({
  kind: z.literal("anthropic_thinking_budget"),
  budgetTokens: z.number().int().min(1_024).max(131_072),
}).strict();

export const ProviderReasoningPrivateDirectiveSchema = z.discriminatedUnion("kind", [
  OpenAiReasoningEffortDirectiveSchema,
  AnthropicThinkingBudgetDirectiveSchema,
]);

export const ProviderReasoningStrategyCommitmentMaterialSchema = z.object({
  authority: ProviderReasoningAuthoritySchema,
  providerFamily: ProviderReasoningFamilySchema,
  exactSubject: ReasoningProfileSubjectSchema,
  profileId: NamespacedResourceIdSchema,
  strategyId: NamespacedResourceIdSchema,
  strategyRevision: Sha256DigestSchema,
  mappingKind: ReasoningMappingKindSchema,
  timeoutPolicyIdentity: ProviderReasoningTimeoutPolicyIdentitySchema,
  requestProjectionRevision: Sha256DigestSchema,
  evidenceRevision: Sha256DigestSchema,
  typedPrivateDirective: ProviderReasoningPrivateDirectiveSchema,
}).strict().superRefine(validatePrivateCombination);

export const ProviderReasoningMappingMaterialSchema = z.object({
  mappingId: NamespacedResourceIdSchema,
  authority: ProviderReasoningAuthoritySchema,
  providerFamily: ProviderReasoningFamilySchema,
  exactSubject: ReasoningProfileSubjectSchema,
  profileRef: ReasoningModeLockProfileRefSchema,
  strategyRef: ReasoningModeLockStrategyRefSchema,
  mappingKind: ReasoningMappingKindSchema,
  timeoutPolicyIdentity: ProviderReasoningTimeoutPolicyIdentitySchema,
  requestProjectionRevision: Sha256DigestSchema,
  evidenceRevision: Sha256DigestSchema,
  typedPrivateDirective: ProviderReasoningPrivateDirectiveSchema,
}).strict().superRefine(validatePrivateCombination);

export const ProviderReasoningMappingSchema = ProviderReasoningMappingMaterialSchema.extend({
  mappingRevision: Sha256DigestSchema,
  mappingDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.mappingRevision !== value.mappingDigest) {
    context.addIssue({
      code: "custom",
      path: ["mappingRevision"],
      message: "private mapping revision and digest must identify the same immutable material",
    });
  }
});

export type ProviderReasoningAuthority = z.infer<typeof ProviderReasoningAuthoritySchema>;
export type ProviderReasoningFamily = z.infer<typeof ProviderReasoningFamilySchema>;
export type ProviderReasoningTimeoutPolicyIdentity = z.infer<
  typeof ProviderReasoningTimeoutPolicyIdentitySchema
>;
export type ProviderReasoningPrivateDirective = z.infer<
  typeof ProviderReasoningPrivateDirectiveSchema
>;
export type ProviderReasoningStrategyCommitmentMaterial = z.infer<
  typeof ProviderReasoningStrategyCommitmentMaterialSchema
>;
export type ProviderReasoningMappingMaterial = z.infer<
  typeof ProviderReasoningMappingMaterialSchema
>;
export type ProviderReasoningMapping = z.infer<typeof ProviderReasoningMappingSchema>;
export type ProviderReasoningMappingRelease = Readonly<{
  profile: ReasoningProfile;
  mapping: ProviderReasoningMapping;
}>;

export function calculateProviderReasoningStrategyDigest(
  input: ProviderReasoningStrategyCommitmentMaterial,
): Sha256Digest {
  const material = ProviderReasoningStrategyCommitmentMaterialSchema.parse(input);
  return domainDigest(STRATEGY_COMMITMENT_DOMAIN, material);
}

export function calculateProviderReasoningMappingDigest(
  input: ProviderReasoningMappingMaterial,
): Sha256Digest {
  const material = ProviderReasoningMappingMaterialSchema.parse(input);
  return domainDigest(PRIVATE_MAPPING_DOMAIN, material);
}

export function createProviderReasoningMappingRelease(input: Readonly<{
  mappingId: string;
  commitment: ProviderReasoningStrategyCommitmentMaterial;
}>): ProviderReasoningMappingRelease {
  const commitment = ProviderReasoningStrategyCommitmentMaterialSchema.parse(input.commitment);
  const strategyDigest = calculateProviderReasoningStrategyDigest(commitment);
  const profile = createReasoningProfile({
    schemaVersion: "v1alpha1",
    profileId: commitment.profileId,
    subject: commitment.exactSubject,
    support: "supported",
    maxStrategy: {
      strategyId: commitment.strategyId,
      strategyRevision: commitment.strategyRevision,
      strategyDigest,
      mappingKind: commitment.mappingKind,
      timeoutPolicyRef: commitment.timeoutPolicyIdentity.timeoutPolicyRef,
    },
  });
  const material = ProviderReasoningMappingMaterialSchema.parse({
    mappingId: input.mappingId,
    authority: commitment.authority,
    providerFamily: commitment.providerFamily,
    exactSubject: commitment.exactSubject,
    profileRef: {
      profileId: profile.profileId,
      profileRevision: profile.profileRevision,
      profileDigest: profile.profileDigest,
    },
    strategyRef: {
      strategyId: commitment.strategyId,
      strategyRevision: commitment.strategyRevision,
      strategyDigest,
      timeoutPolicyRef: commitment.timeoutPolicyIdentity.timeoutPolicyRef,
    },
    mappingKind: commitment.mappingKind,
    timeoutPolicyIdentity: commitment.timeoutPolicyIdentity,
    requestProjectionRevision: commitment.requestProjectionRevision,
    evidenceRevision: commitment.evidenceRevision,
    typedPrivateDirective: commitment.typedPrivateDirective,
  });
  const mappingDigest = calculateProviderReasoningMappingDigest(material);
  return validateProviderReasoningMappingRelease(Object.freeze({
    profile,
    mapping: ProviderReasoningMappingSchema.parse({
      ...material,
      mappingRevision: mappingDigest,
      mappingDigest,
    }),
  }));
}

export function validateProviderReasoningMapping(
  input: ProviderReasoningMapping,
): ProviderReasoningMapping {
  const parsed = ProviderReasoningMappingSchema.parse(input);
  const { mappingRevision: _revision, mappingDigest, ...material } = parsed;
  if (mappingDigest !== calculateProviderReasoningMappingDigest(material)) {
    throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  }
  return parsed;
}

export function validateProviderReasoningMappingRelease(
  input: ProviderReasoningMappingRelease,
): ProviderReasoningMappingRelease {
  const profile = validateReasoningProfile(input.profile);
  const mapping = validateProviderReasoningMapping(input.mapping);
  const commitment = commitmentFromMapping(mapping);
  const strategyDigest = calculateProviderReasoningStrategyDigest(commitment);
  if (
    mapping.strategyRef.strategyDigest !== strategyDigest
    || profile.maxStrategy === undefined
    || profile.profileId !== mapping.profileRef.profileId
    || profile.profileRevision !== mapping.profileRef.profileRevision
    || profile.profileDigest !== mapping.profileRef.profileDigest
    || profile.maxStrategy.strategyId !== mapping.strategyRef.strategyId
    || profile.maxStrategy.strategyRevision !== mapping.strategyRef.strategyRevision
    || profile.maxStrategy.strategyDigest !== mapping.strategyRef.strategyDigest
    || profile.maxStrategy.mappingKind !== mapping.mappingKind
    || profile.maxStrategy.timeoutPolicyRef !== mapping.strategyRef.timeoutPolicyRef
    || !sameReasoningProfileSubject(profile.subject, mapping.exactSubject)
  ) {
    throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  }
  return Object.freeze({ profile, mapping });
}

export function commitmentFromMapping(
  input: ProviderReasoningMapping,
): ProviderReasoningStrategyCommitmentMaterial {
  const mapping = ProviderReasoningMappingSchema.parse(input);
  return ProviderReasoningStrategyCommitmentMaterialSchema.parse({
    authority: mapping.authority,
    providerFamily: mapping.providerFamily,
    exactSubject: mapping.exactSubject,
    profileId: mapping.profileRef.profileId,
    strategyId: mapping.strategyRef.strategyId,
    strategyRevision: mapping.strategyRef.strategyRevision,
    mappingKind: mapping.mappingKind,
    timeoutPolicyIdentity: mapping.timeoutPolicyIdentity,
    requestProjectionRevision: mapping.requestProjectionRevision,
    evidenceRevision: mapping.evidenceRevision,
    typedPrivateDirective: mapping.typedPrivateDirective,
  });
}

export class ProviderReasoningMappingIntegrityError extends Error {
  public constructor(public readonly code:
    | "reasoning_mapping_conflict"
    | "reasoning_mapping_unavailable") {
    super(code === "reasoning_mapping_conflict"
      ? "The locked reasoning mapping cannot be verified"
      : "The locked reasoning mapping is unavailable");
    this.name = "ProviderReasoningMappingIntegrityError";
  }
}

export const ProviderReasoningMappingDomainConstants = Object.freeze({
  strategyCommitmentDomain: STRATEGY_COMMITMENT_DOMAIN,
  privateMappingDomain: PRIVATE_MAPPING_DOMAIN,
});

function validatePrivateCombination(
  value: Readonly<{
    authority: ProviderReasoningAuthority;
    providerFamily: ProviderReasoningFamily;
    exactSubject: z.infer<typeof ReasoningProfileSubjectSchema>;
    mappingKind: z.infer<typeof ReasoningMappingKindSchema>;
    typedPrivateDirective: ProviderReasoningPrivateDirective;
    timeoutPolicyIdentity: ProviderReasoningTimeoutPolicyIdentity;
  }>,
  context: z.RefinementCtx,
): void {
  if (value.exactSubject.authority !== value.authority) {
    context.addIssue({ code: "custom", path: ["exactSubject"], message: "authority mismatch" });
  }
  const local = value.providerFamily === "local_openai";
  if (local !== (value.authority === "local_personal")) {
    context.addIssue({ code: "custom", path: ["providerFamily"], message: "family mismatch" });
  }
  const anthropic = value.providerFamily === "enterprise_anthropic";
  if (
    anthropic !== (value.typedPrivateDirective.kind === "anthropic_thinking_budget")
    || (anthropic && value.mappingKind !== "bounded_budget_preset")
    || (!anthropic && value.mappingKind !== "effort_level")
  ) {
    context.addIssue({ code: "custom", path: ["typedPrivateDirective"], message: "directive mismatch" });
  }
  if (value.timeoutPolicyIdentity.timeoutPolicyRef.length === 0) {
    context.addIssue({ code: "custom", path: ["timeoutPolicyIdentity"], message: "timeout mismatch" });
  }
}

function domainDigest(domain: string, material: unknown): Sha256Digest {
  return sha256CanonicalJson(JsonValueSchema.parse({ domain, material }));
}
