import {
  JsonValueSchema,
  NamespacedResourceIdSchema,
  Sha256DigestSchema,
  type Sha256Digest,
} from "@robothree/contracts";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";

export const PROVIDER_RELEASE_CONFORMANCE_MANIFEST_DOMAIN =
  "robothree.provider-release.conformance-manifest.v1\n" as const;
export const PROVIDER_RELEASE_CONFORMANCE_VECTOR_DOMAIN =
  "robothree.provider-release.conformance-vector.v1\n" as const;

const VectorNameSchema = z.enum([
  "default_omission",
  "max_xhigh",
  "streaming",
  "usage",
  "done_terminal",
  "eof_terminal_missing",
  "timeout_winner",
  "tool_continuation",
  "lifecycle_replay",
]);

const ProviderReleaseConformanceManifestMaterialSchema = z.object({
  schemaVersion: z.literal("v1"),
  manifestId: NamespacedResourceIdSchema,
  providerFamily: z.literal("local_openai"),
  apiFamily: z.literal("openai_chat_completions"),
  exactModelId: z.literal("gpt-5.2-2025-12-11"),
  adapterDescriptorContractRevision: Sha256DigestSchema,
  requestProjectorRevision: Sha256DigestSchema,
  timeoutPolicyRevision: z.string().min(1).max(160),
  fixtureProtocolRevision: Sha256DigestSchema,
  testCaRevision: Sha256DigestSchema,
  expectedHostIdentity: z.literal("api.openai.com"),
  vectorDigests: z.array(z.object({
    name: VectorNameSchema,
    digest: Sha256DigestSchema,
  }).strict()).length(9),
  historicalEvidenceRefs: z.array(z.object({
    evidenceId: NamespacedResourceIdSchema,
    evidenceDigest: Sha256DigestSchema,
  }).strict()).min(3).max(16),
  revocationRule: z.literal("explicit_code_owned_revision_only"),
  supersessionRule: z.literal("new_manifest_new_digest_no_current_fallback"),
}).strict().superRefine((value, context) => {
  if (new Set(value.vectorDigests.map((item) => item.name)).size !== 9) {
    context.addIssue({ code: "custom", message: "conformance vectors must be unique" });
  }
});

export const ProviderReleaseConformanceManifestV1Schema =
  ProviderReleaseConformanceManifestMaterialSchema.extend({
    manifestRevision: Sha256DigestSchema,
    manifestDigest: Sha256DigestSchema,
  }).strict().superRefine((value, context) => {
    if (value.manifestRevision !== value.manifestDigest) {
      context.addIssue({ code: "custom", message: "manifest revision and digest must match" });
    }
  });

export type ProviderReleaseConformanceManifestV1 = z.infer<
  typeof ProviderReleaseConformanceManifestV1Schema
>;

export function createProviderReleaseConformanceManifestV1(
  material: z.input<typeof ProviderReleaseConformanceManifestMaterialSchema>,
): ProviderReleaseConformanceManifestV1 {
  const parsed = ProviderReleaseConformanceManifestMaterialSchema.parse(material);
  const digest = domainDigest(PROVIDER_RELEASE_CONFORMANCE_MANIFEST_DOMAIN, parsed);
  return Object.freeze(ProviderReleaseConformanceManifestV1Schema.parse({
    ...parsed,
    manifestRevision: digest,
    manifestDigest: digest,
  }));
}

export function validateProviderReleaseConformanceManifestV1(
  input: ProviderReleaseConformanceManifestV1,
): ProviderReleaseConformanceManifestV1 {
  const parsed = ProviderReleaseConformanceManifestV1Schema.parse(input);
  const { manifestRevision: _revision, manifestDigest, ...material } = parsed;
  if (manifestDigest !== domainDigest(PROVIDER_RELEASE_CONFORMANCE_MANIFEST_DOMAIN, material)) {
    throw new ProviderReleaseConformanceManifestError(
      "provider_release.conformance_manifest_invalid",
    );
  }
  return Object.freeze(parsed);
}

export function createProviderReleaseConformanceVectorDigest(
  name: z.infer<typeof VectorNameSchema>,
  material: unknown,
): Sha256Digest {
  return domainDigest(PROVIDER_RELEASE_CONFORMANCE_VECTOR_DOMAIN, { name, material });
}

function domainDigest(domain: string, material: unknown): Sha256Digest {
  return Sha256DigestSchema.parse(sha256CanonicalJson(JsonValueSchema.parse({ domain, material })));
}

export class ProviderReleaseConformanceManifestError extends Error {
  constructor(readonly code: "provider_release.conformance_manifest_invalid") {
    super(code);
    this.name = "ProviderReleaseConformanceManifestError";
  }
}
