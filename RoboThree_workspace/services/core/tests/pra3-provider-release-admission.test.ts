import { describe, expect, it } from "vitest";

import {
  CodeOwnedProviderReleaseAdmissionSource,
  DEEPSEEK_THINKING_MODE_ADMISSION_EXCLUSION,
  OPENAI_GPT_5_2_CONFORMANCE_MANIFEST,
  OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY,
  OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE,
  createProviderReleaseInstallerBoundary,
  validateProviderReleaseAdmissionPolicyV1,
  validateProviderReleaseAdmissionPolicyV2,
  validateProviderReleaseConformanceManifestV1,
} from "../src/index.js";

describe("PRA-3 admitted policy and immutable conformance manifest", () => {
  it("keeps V1 pending while admitting one exact V2 snapshot", () => {
    expect(validateProviderReleaseAdmissionPolicyV1(
      OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE,
    ).admissionState).toBe("pending_conformance");
    const policy = validateProviderReleaseAdmissionPolicyV2(
      OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY,
    );
    expect(policy).toMatchObject({
      schemaVersion: "v2",
      admissionState: "production_admitted",
      productionAdmitted: true,
      exactModelIdAllowlist: ["gpt-5.2-2025-12-11"],
    });
    expect(policy.supersedesPolicyRevision)
      .toBe(OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE.policyRevision);
    expect(DEEPSEEK_THINKING_MODE_ADMISSION_EXCLUSION.disposition)
      .toBe("requires_mapping_revision");
  });

  it("validates a content-free manifest and rejects material drift", () => {
    const manifest = validateProviderReleaseConformanceManifestV1(
      OPENAI_GPT_5_2_CONFORMANCE_MANIFEST,
    );
    expect(manifest.vectorDigests).toHaveLength(9);
    expect(JSON.stringify(manifest)).not.toMatch(
      /authorization|bearer|secret|private[_-]?key|reasoning_effort/iu,
    );
    expect(() => validateProviderReleaseConformanceManifestV1({
      ...manifest,
      expectedHostIdentity: "example.invalid",
    })).toThrow();
  });

  it("loads only the exact identity and exposes no current/latest fallback", () => {
    const policy = OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY;
    const source = new CodeOwnedProviderReleaseAdmissionSource();
    const query = {
      providerFamily: policy.providerFamily,
      apiFamily: policy.apiFamily,
      exactModelId: policy.exactModelIdAllowlist[0]!,
      endpointIdentity: policy.endpointIdentityRule,
      adapterContractRevision: policy.adapterDescriptorContractRevision,
      requestProjectorRevision: policy.requestProjectorRevision,
      timeoutPolicyIdentity: policy.timeoutPolicyIdentity,
    };
    expect(source.loadExact(query)?.policyDigest).toBe(policy.policyDigest);
    expect(source.loadExact({ ...query, exactModelId: "gpt-5.2" })).toBeUndefined();
    expect(Object.keys(source)).not.toContain("current");
    expect(createProviderReleaseInstallerBoundary().policy.policyDigest)
      .toBe(policy.policyDigest);
  });
});
