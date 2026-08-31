import {
  JsonValueSchema,
  NamespacedResourceIdSchema,
  Sha256DigestSchema,
  TimestampSchema,
  type Sha256Digest,
} from "@robothree/contracts";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  LOCAL_PERSONAL_REASONING_TIMEOUT_POLICY_REF,
} from "./local-personal-reasoning-mapping.js";
import {
  LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
} from "./model-invocation-timeout-policy.js";
import {
  PERSONAL_MODEL_ADAPTER_DESCRIPTOR_ID,
} from "./personal-model-task-lock.js";

export const PROVIDER_RELEASE_EVIDENCE_DIGEST_DOMAIN =
  "robothree.provider-release-evidence.v1\n" as const;
export const PROVIDER_RELEASE_ADMISSION_POLICY_DIGEST_DOMAIN =
  "robothree.provider-release-admission-policy.v1\n" as const;
export const PROVIDER_RELEASE_ADMISSION_POLICY_V2_DIGEST_DOMAIN =
  "robothree.provider-release-admission-policy.v2\n" as const;
export const PROVIDER_RELEASE_EXCLUSION_DIGEST_DOMAIN =
  "robothree.provider-release-exclusion.v1\n" as const;
export const PRA1_PRODUCTION_SUPPORTED_RELEASE_COUNT = 0 as const;

export const LOCAL_PERSONAL_ADAPTER_CONTRACT_REVISION = domainDigest(
  PROVIDER_RELEASE_EVIDENCE_DIGEST_DOMAIN,
  { contract: "personal_model_adapter_descriptor", revision: "v1" },
);

export const LOCAL_OPENAI_REASONING_REQUEST_PROJECTOR_REVISION = domainDigest(
  PROVIDER_RELEASE_EVIDENCE_DIGEST_DOMAIN,
  { projector: "local_openai_chat_completions_reasoning", revision: "v1" },
);

const SafeCodeSchema = z.string().min(3).max(160)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/u);

export const ProviderReleaseEvidenceClaimV1Schema = z.object({
  claimId: SafeCodeSchema,
  claimDigest: Sha256DigestSchema,
}).strict();

export const ProviderReleaseEvidenceSourceV1Schema = z.object({
  sourceId: SafeCodeSchema,
  sourceUrl: z.url().refine((value) => value.startsWith("https://")),
  observedAt: TimestampSchema,
  claims: z.array(ProviderReleaseEvidenceClaimV1Schema).min(1).max(16),
}).strict().superRefine((value, context) => {
  if (new Set(value.claims.map((claim) => claim.claimId)).size !== value.claims.length) {
    context.addIssue({ code: "custom", message: "evidence claim IDs must be unique" });
  }
});

const ProviderReleaseAdmissionPolicyV1MaterialSchema = z.object({
  schemaVersion: z.literal("v1"),
  policyId: SafeCodeSchema,
  admissionState: z.literal("pending_conformance"),
  productionAdmitted: z.literal(false),
  providerFamily: z.literal("local_openai"),
  apiFamily: z.literal("openai_chat_completions"),
  exactModelIdAllowlist: z.array(z.string().min(1).max(160)).min(1).max(16),
  endpointIdentityRule: z.object({
    protocol: z.literal("https:"),
    host: z.literal("api.openai.com"),
    path: z.literal("/v1/chat/completions"),
  }).strict(),
  adapterDescriptorId: z.literal(PERSONAL_MODEL_ADAPTER_DESCRIPTOR_ID),
  adapterDescriptorContractRevision: Sha256DigestSchema,
  requestProjectorRevision: Sha256DigestSchema,
  strongestDirective: z.object({
    kind: z.literal("openai_reasoning_effort"),
    effort: z.literal("xhigh"),
  }).strict(),
  defaultOmissionRule: z.literal("omit_all_reasoning_fields"),
  usageRule: z.literal("stream_include_usage_final_non_null_frame"),
  sseTerminalRule: z.literal("done_required"),
  toolContinuationRule: z.literal("chat_completions_tool_messages"),
  timeoutPolicyIdentity: z.object({
    timeoutPolicyRef: z.literal(LOCAL_PERSONAL_REASONING_TIMEOUT_POLICY_REF),
    timeoutPolicyRevision: z.literal(
      LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.policyRevision,
    ),
    timeoutPolicyDigest: z.literal(LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.policyDigest),
  }).strict(),
  evidenceSources: z.array(ProviderReleaseEvidenceSourceV1Schema).min(1).max(8),
  revocationRule: z.literal("explicit_code_owned_revision_only"),
  supersessionRule: z.literal("new_manifest_new_digest_no_current_fallback"),
}).strict().superRefine((value, context) => {
  if (new Set(value.exactModelIdAllowlist).size !== value.exactModelIdAllowlist.length) {
    context.addIssue({ code: "custom", message: "exact Model IDs must be unique" });
  }
  if (new Set(value.evidenceSources.map((source) => source.sourceId)).size
    !== value.evidenceSources.length) {
    context.addIssue({ code: "custom", message: "evidence source IDs must be unique" });
  }
});

export const ProviderReleaseAdmissionPolicyV1Schema =
  ProviderReleaseAdmissionPolicyV1MaterialSchema.extend({
    policyRevision: Sha256DigestSchema,
    policyDigest: Sha256DigestSchema,
  }).strict().superRefine((value, context) => {
    if (value.policyRevision !== value.policyDigest) {
      context.addIssue({
        code: "custom",
        path: ["policyRevision"],
        message: "admission policy revision and digest must identify exact material",
      });
    }
  });

const ProviderReleaseAdmissionPolicyV2MaterialSchema =
  z.object({
    schemaVersion: z.literal("v2"),
    policyId: SafeCodeSchema,
    admissionState: z.literal("production_admitted"),
    productionAdmitted: z.literal(true),
    providerFamily: z.literal("local_openai"),
    apiFamily: z.literal("openai_chat_completions"),
    exactModelIdAllowlist: z.array(z.string().min(1).max(160)).min(1).max(16),
    endpointIdentityRule: z.object({
      protocol: z.literal("https:"),
      host: z.literal("api.openai.com"),
      path: z.literal("/v1/chat/completions"),
    }).strict(),
    adapterDescriptorId: z.literal(PERSONAL_MODEL_ADAPTER_DESCRIPTOR_ID),
    adapterDescriptorContractRevision: Sha256DigestSchema,
    requestProjectorRevision: Sha256DigestSchema,
    strongestDirective: z.object({
      kind: z.literal("openai_reasoning_effort"),
      effort: z.literal("xhigh"),
    }).strict(),
    defaultOmissionRule: z.literal("omit_all_reasoning_fields"),
    usageRule: z.literal("stream_include_usage_final_non_null_frame"),
    sseTerminalRule: z.literal("done_required"),
    toolContinuationRule: z.literal("chat_completions_tool_messages"),
    timeoutPolicyIdentity: z.object({
      timeoutPolicyRef: z.literal(LOCAL_PERSONAL_REASONING_TIMEOUT_POLICY_REF),
      timeoutPolicyRevision: z.literal(LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.policyRevision),
      timeoutPolicyDigest: z.literal(LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.policyDigest),
    }).strict(),
    evidenceSources: z.array(ProviderReleaseEvidenceSourceV1Schema).min(1).max(8),
    revocationRule: z.literal("explicit_code_owned_revision_only"),
    supersessionRule: z.literal("new_manifest_new_digest_no_current_fallback"),
    supersedesPolicyRevision: Sha256DigestSchema,
    conformanceManifestRef: z.object({
      manifestId: NamespacedResourceIdSchema,
      manifestRevision: Sha256DigestSchema,
      manifestDigest: Sha256DigestSchema,
    }).strict(),
  }).strict().superRefine((value, context) => {
    if (new Set(value.exactModelIdAllowlist).size !== value.exactModelIdAllowlist.length) {
      context.addIssue({ code: "custom", message: "exact Model IDs must be unique" });
    }
    if (new Set(value.evidenceSources.map((source) => source.sourceId)).size
      !== value.evidenceSources.length) {
      context.addIssue({ code: "custom", message: "evidence source IDs must be unique" });
    }
    if (value.conformanceManifestRef.manifestRevision
      !== value.conformanceManifestRef.manifestDigest) {
      context.addIssue({
        code: "custom",
        message: "conformance manifest revision and digest must identify exact material",
      });
    }
  });

export const ProviderReleaseAdmissionPolicyV2Schema =
  ProviderReleaseAdmissionPolicyV2MaterialSchema.extend({
    policyRevision: Sha256DigestSchema,
    policyDigest: Sha256DigestSchema,
  }).strict().superRefine((value, context) => {
    if (value.policyRevision !== value.policyDigest) {
      context.addIssue({ code: "custom", message: "policy revision and digest must match" });
    }
  });

export const ReadableProviderReleaseAdmissionPolicySchema = z.discriminatedUnion(
  "schemaVersion",
  [ProviderReleaseAdmissionPolicyV1Schema, ProviderReleaseAdmissionPolicyV2Schema],
);

const ProviderReleaseExclusionV1MaterialSchema = z.object({
  schemaVersion: z.literal("v1"),
  exclusionId: SafeCodeSchema,
  providerFamilyObservation: z.literal("deepseek_thinking_mode"),
  disposition: z.literal("requires_mapping_revision"),
  blockers: z.array(z.enum([
    "directive_variant",
    "tool_continuation_private_state",
    "token_field",
    "gateway_schema",
  ])).min(1).max(4),
  evidenceSources: z.array(ProviderReleaseEvidenceSourceV1Schema).min(1).max(8),
}).strict();

export const ProviderReleaseExclusionV1Schema =
  ProviderReleaseExclusionV1MaterialSchema.extend({
    exclusionDigest: Sha256DigestSchema,
  }).strict();

export type ProviderReleaseAdmissionPolicyV1 = z.infer<
  typeof ProviderReleaseAdmissionPolicyV1Schema
>;
export type ProviderReleaseAdmissionPolicyV2 = z.infer<
  typeof ProviderReleaseAdmissionPolicyV2Schema
>;
export type ReadableProviderReleaseAdmissionPolicy = z.infer<
  typeof ReadableProviderReleaseAdmissionPolicySchema
>;
export type ProviderReleaseExclusionV1 = z.infer<
  typeof ProviderReleaseExclusionV1Schema
>;

export function createProviderReleaseAdmissionPolicyV1(
  material: z.input<typeof ProviderReleaseAdmissionPolicyV1MaterialSchema>,
): ProviderReleaseAdmissionPolicyV1 {
  const parsed = ProviderReleaseAdmissionPolicyV1MaterialSchema.parse(material);
  const digest = domainDigest(PROVIDER_RELEASE_ADMISSION_POLICY_DIGEST_DOMAIN, parsed);
  return Object.freeze(ProviderReleaseAdmissionPolicyV1Schema.parse({
    ...parsed,
    policyRevision: digest,
    policyDigest: digest,
  }));
}

export function validateProviderReleaseAdmissionPolicyV1(
  input: ProviderReleaseAdmissionPolicyV1,
): ProviderReleaseAdmissionPolicyV1 {
  const parsed = ProviderReleaseAdmissionPolicyV1Schema.parse(input);
  const { policyRevision: _revision, policyDigest, ...material } = parsed;
  if (policyDigest !== domainDigest(PROVIDER_RELEASE_ADMISSION_POLICY_DIGEST_DOMAIN, material)) {
    throw new ProviderReleaseAdmissionPolicyError("provider_release.policy_integrity_invalid");
  }
  return Object.freeze(parsed);
}

export function createProviderReleaseAdmissionPolicyV2(
  material: z.input<typeof ProviderReleaseAdmissionPolicyV2MaterialSchema>,
): ProviderReleaseAdmissionPolicyV2 {
  const parsed = ProviderReleaseAdmissionPolicyV2MaterialSchema.parse(material);
  const digest = domainDigest(PROVIDER_RELEASE_ADMISSION_POLICY_V2_DIGEST_DOMAIN, parsed);
  return Object.freeze(ProviderReleaseAdmissionPolicyV2Schema.parse({
    ...parsed,
    policyRevision: digest,
    policyDigest: digest,
  }));
}

export function validateProviderReleaseAdmissionPolicyV2(
  input: ProviderReleaseAdmissionPolicyV2,
): ProviderReleaseAdmissionPolicyV2 {
  const parsed = ProviderReleaseAdmissionPolicyV2Schema.parse(input);
  const { policyRevision: _revision, policyDigest, ...material } = parsed;
  if (policyDigest
    !== domainDigest(PROVIDER_RELEASE_ADMISSION_POLICY_V2_DIGEST_DOMAIN, material)) {
    throw new ProviderReleaseAdmissionPolicyError("provider_release.policy_integrity_invalid");
  }
  return Object.freeze(parsed);
}

export function validateReadableProviderReleaseAdmissionPolicy(
  input: ReadableProviderReleaseAdmissionPolicy,
): ReadableProviderReleaseAdmissionPolicy {
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (version === "v1") return validateProviderReleaseAdmissionPolicyV1(input as ProviderReleaseAdmissionPolicyV1);
  if (version === "v2") return validateProviderReleaseAdmissionPolicyV2(input as ProviderReleaseAdmissionPolicyV2);
  throw new ProviderReleaseAdmissionPolicyError("provider_release.policy_integrity_invalid");
}

export function createProviderReleaseExclusionV1(
  material: z.input<typeof ProviderReleaseExclusionV1MaterialSchema>,
): ProviderReleaseExclusionV1 {
  const parsed = ProviderReleaseExclusionV1MaterialSchema.parse(material);
  return Object.freeze(ProviderReleaseExclusionV1Schema.parse({
    ...parsed,
    exclusionDigest: domainDigest(PROVIDER_RELEASE_EXCLUSION_DIGEST_DOMAIN, parsed),
  }));
}

export function validateProviderReleaseExclusionV1(
  input: ProviderReleaseExclusionV1,
): ProviderReleaseExclusionV1 {
  const parsed = ProviderReleaseExclusionV1Schema.parse(input);
  const { exclusionDigest, ...material } = parsed;
  if (exclusionDigest !== domainDigest(PROVIDER_RELEASE_EXCLUSION_DIGEST_DOMAIN, material)) {
    throw new ProviderReleaseAdmissionPolicyError("provider_release.exclusion_integrity_invalid");
  }
  return Object.freeze(parsed);
}

const observedAt = "2026-08-27T00:00:00.000Z";
const openAiEvidence = ProviderReleaseEvidenceSourceV1Schema.parse({
  sourceId: "official.openai.gpt_5_2_model",
  sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.2",
  observedAt,
  claims: [
    claim("model.snapshot_exact", "gpt-5.2-2025-12-11"),
    claim("reasoning.effort_levels", "none,low,medium,high,xhigh"),
    claim("api.chat_completions", "/v1/chat/completions"),
    claim("capability.streaming", "supported"),
    claim("capability.function_calling", "supported"),
  ],
});

export const OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE =
  createProviderReleaseAdmissionPolicyV1({
    schemaVersion: "v1",
    policyId: "provider_release.openai.gpt_5_2_2025_12_11",
    admissionState: "pending_conformance",
    productionAdmitted: false,
    providerFamily: "local_openai",
    apiFamily: "openai_chat_completions",
    exactModelIdAllowlist: ["gpt-5.2-2025-12-11"],
    endpointIdentityRule: {
      protocol: "https:",
      host: "api.openai.com",
      path: "/v1/chat/completions",
    },
    adapterDescriptorId: PERSONAL_MODEL_ADAPTER_DESCRIPTOR_ID,
    adapterDescriptorContractRevision: LOCAL_PERSONAL_ADAPTER_CONTRACT_REVISION,
    requestProjectorRevision: LOCAL_OPENAI_REASONING_REQUEST_PROJECTOR_REVISION,
    strongestDirective: { kind: "openai_reasoning_effort", effort: "xhigh" },
    defaultOmissionRule: "omit_all_reasoning_fields",
    usageRule: "stream_include_usage_final_non_null_frame",
    sseTerminalRule: "done_required",
    toolContinuationRule: "chat_completions_tool_messages",
    timeoutPolicyIdentity: {
      timeoutPolicyRef: LOCAL_PERSONAL_REASONING_TIMEOUT_POLICY_REF,
      timeoutPolicyRevision: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.policyRevision,
      timeoutPolicyDigest: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.policyDigest,
    },
    evidenceSources: [openAiEvidence],
    revocationRule: "explicit_code_owned_revision_only",
    supersessionRule: "new_manifest_new_digest_no_current_fallback",
  });

export const DEEPSEEK_THINKING_MODE_ADMISSION_EXCLUSION =
  createProviderReleaseExclusionV1({
    schemaVersion: "v1",
    exclusionId: "provider_release.deepseek.thinking_mode_requires_revision",
    providerFamilyObservation: "deepseek_thinking_mode",
    disposition: "requires_mapping_revision",
    blockers: ["directive_variant", "tool_continuation_private_state"],
    evidenceSources: [{
      sourceId: "official.deepseek.thinking_mode",
      sourceUrl: "https://api-docs.deepseek.com/guides/thinking_mode/",
      observedAt,
      claims: [
        claim("protocol.thinking_directive", "not_expressible_by_current_openai_effort_union"),
        claim("protocol.tool_continuation", "requires_private_reasoning_state_review"),
      ],
    }],
  });

function claim(claimId: string, fact: string) {
  return ProviderReleaseEvidenceClaimV1Schema.parse({
    claimId,
    claimDigest: domainDigest(PROVIDER_RELEASE_EVIDENCE_DIGEST_DOMAIN, {
      claimId,
      fact,
    }),
  });
}

function domainDigest(domain: string, material: unknown): Sha256Digest {
  return Sha256DigestSchema.parse(sha256CanonicalJson(JsonValueSchema.parse({
    domain,
    material,
  })));
}

export class ProviderReleaseAdmissionPolicyError extends Error {
  constructor(readonly code:
    | "provider_release.policy_integrity_invalid"
    | "provider_release.exclusion_integrity_invalid") {
    super(code);
    this.name = "ProviderReleaseAdmissionPolicyError";
  }
}
