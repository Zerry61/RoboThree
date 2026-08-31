import {
  OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE,
  createProviderReleaseAdmissionPolicyV2,
  validateProviderReleaseAdmissionPolicyV2,
  type ProviderReleaseAdmissionPolicyV2,
} from "./provider-release-admission-policy.js";
import {
  createProviderReleaseConformanceManifestV1,
  createProviderReleaseConformanceVectorDigest,
  validateProviderReleaseConformanceManifestV1,
} from "./provider-release-conformance-manifest.js";

const vector = (name: Parameters<typeof createProviderReleaseConformanceVectorDigest>[0],
  assertion: string) => ({
  name,
  digest: createProviderReleaseConformanceVectorDigest(name, { assertion }),
});

export const OPENAI_GPT_5_2_CONFORMANCE_MANIFEST =
  createProviderReleaseConformanceManifestV1({
    schemaVersion: "v1",
    manifestId: "provider-release.manifest.openai-gpt-5-2-2025-12-11",
    providerFamily: "local_openai",
    apiFamily: "openai_chat_completions",
    exactModelId: "gpt-5.2-2025-12-11",
    adapterDescriptorContractRevision:
      OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE.adapterDescriptorContractRevision,
    requestProjectorRevision:
      OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE.requestProjectorRevision,
    timeoutPolicyRevision:
      OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE.timeoutPolicyIdentity
        .timeoutPolicyRevision,
    fixtureProtocolRevision: createProviderReleaseConformanceVectorDigest(
      "streaming",
      { protocol: "https_sse_fixture_v1" },
    ),
    testCaRevision: createProviderReleaseConformanceVectorDigest(
      "streaming",
      { ca: "runtime_generated_test_ca_v1" },
    ),
    expectedHostIdentity: "api.openai.com",
    vectorDigests: [
      vector("default_omission", "all reasoning fields absent"),
      vector("max_xhigh", "reasoning_effort equals xhigh"),
      vector("streaming", "role content reasoning tool and finish progress"),
      vector("usage", "final non-null usage projection"),
      vector("done_terminal", "done frame required"),
      vector("eof_terminal_missing", "clean eof without done is terminal missing"),
      vector("timeout_winner", "first timeout cause wins late socket error"),
      vector("tool_continuation", "two rounds reuse release mapping and deadline"),
      vector("lifecycle_replay", "terminal replay performs no upstream work"),
    ],
    historicalEvidenceRefs: [
      {
        evidenceId: "evidence.dfi5-3-4",
        evidenceDigest:
          "sha256:bf89b2fda81f2b11cac63ca0ad58f1962bd309b587b48b0e1e19ba2c493c3a08",
      },
      {
        evidenceId: "evidence.pra1",
        evidenceDigest:
          "sha256:f9aebbf3ec885e4171cdb623013d4f8d1f42e1db84eaba0f3e45398cd515a66b",
      },
      {
        evidenceId: "evidence.pra2",
        evidenceDigest:
          "sha256:1efc27e9a44f3969cbf443ee764c03f1486bf7aeb5c0b47b3bf94b273d894eda",
      },
    ],
    revocationRule: "explicit_code_owned_revision_only",
    supersessionRule: "new_manifest_new_digest_no_current_fallback",
  });

export const OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY =
  createProviderReleaseAdmissionPolicyV2({
    ...copyCandidateMaterial(),
    schemaVersion: "v2",
    admissionState: "production_admitted",
    productionAdmitted: true,
    supersedesPolicyRevision:
      OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE.policyRevision,
    conformanceManifestRef: {
      manifestId: OPENAI_GPT_5_2_CONFORMANCE_MANIFEST.manifestId,
      manifestRevision: OPENAI_GPT_5_2_CONFORMANCE_MANIFEST.manifestRevision,
      manifestDigest: OPENAI_GPT_5_2_CONFORMANCE_MANIFEST.manifestDigest,
    },
  });

export type ProviderReleaseAdmissionLookup = Readonly<{
  providerFamily: "local_openai";
  apiFamily: "openai_chat_completions";
  exactModelId: string;
  endpointIdentity: Readonly<{ protocol: string; host: string; path: string }>;
  adapterContractRevision: string;
  requestProjectorRevision: string;
  timeoutPolicyIdentity: Readonly<{
    timeoutPolicyRef: string;
    timeoutPolicyRevision: string;
    timeoutPolicyDigest: string;
  }>;
}>;

export class CodeOwnedProviderReleaseAdmissionSource {
  readonly #policy: ProviderReleaseAdmissionPolicyV2;

  constructor(policy = OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY) {
    this.#policy = validateProviderReleaseAdmissionPolicyV2(policy);
    validateProviderReleaseConformanceManifestV1(OPENAI_GPT_5_2_CONFORMANCE_MANIFEST);
  }

  loadExact(query: ProviderReleaseAdmissionLookup): ProviderReleaseAdmissionPolicyV2 | undefined {
    const policy = this.#policy;
    return query.providerFamily === policy.providerFamily
      && query.apiFamily === policy.apiFamily
      && policy.exactModelIdAllowlist.length === 1
      && query.exactModelId === policy.exactModelIdAllowlist[0]
      && query.endpointIdentity.protocol === policy.endpointIdentityRule.protocol
      && query.endpointIdentity.host === policy.endpointIdentityRule.host
      && query.endpointIdentity.path === policy.endpointIdentityRule.path
      && query.adapterContractRevision === policy.adapterDescriptorContractRevision
      && query.requestProjectorRevision === policy.requestProjectorRevision
      && query.timeoutPolicyIdentity.timeoutPolicyRef
        === policy.timeoutPolicyIdentity.timeoutPolicyRef
      && query.timeoutPolicyIdentity.timeoutPolicyRevision
        === policy.timeoutPolicyIdentity.timeoutPolicyRevision
      && query.timeoutPolicyIdentity.timeoutPolicyDigest
        === policy.timeoutPolicyIdentity.timeoutPolicyDigest
      ? policy
      : undefined;
  }
}

export function createProviderReleaseInstallerBoundary() {
  return Object.freeze({
    policy: OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY,
    manifest: OPENAI_GPT_5_2_CONFORMANCE_MANIFEST,
  });
}

function copyCandidateMaterial() {
  const candidate = OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE;
  return {
    policyId: candidate.policyId,
    providerFamily: candidate.providerFamily,
    apiFamily: candidate.apiFamily,
    exactModelIdAllowlist: [...candidate.exactModelIdAllowlist],
    endpointIdentityRule: { ...candidate.endpointIdentityRule },
    adapterDescriptorId: candidate.adapterDescriptorId,
    adapterDescriptorContractRevision: candidate.adapterDescriptorContractRevision,
    requestProjectorRevision: candidate.requestProjectorRevision,
    strongestDirective: { ...candidate.strongestDirective },
    defaultOmissionRule: candidate.defaultOmissionRule,
    usageRule: candidate.usageRule,
    sseTerminalRule: candidate.sseTerminalRule,
    toolContinuationRule: candidate.toolContinuationRule,
    timeoutPolicyIdentity: { ...candidate.timeoutPolicyIdentity },
    evidenceSources: candidate.evidenceSources.map((source) => ({
      ...source,
      claims: source.claims.map((claim) => ({ ...claim })),
    })),
    revocationRule: candidate.revocationRule,
    supersessionRule: candidate.supersessionRule,
  };
}
