import { describe, expect, it } from "vitest";

import {
  DEEPSEEK_THINKING_MODE_ADMISSION_EXCLUSION,
  OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE,
  PRA1_PRODUCTION_SUPPORTED_RELEASE_COUNT,
  ProviderReleaseAdmissionPolicyError,
  ProviderReleaseAdmissionPolicyV1Schema,
  validateProviderReleaseAdmissionPolicyV1,
  validateProviderReleaseExclusionV1,
} from "../src/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}`;

describe("PRA-1 immutable evidence and admission policy", () => {
  it("freezes an exact GPT-5.2 snapshot candidate without admitting production", () => {
    const candidate = validateProviderReleaseAdmissionPolicyV1(
      OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE,
    );
    expect(candidate).toMatchObject({
      admissionState: "pending_conformance",
      productionAdmitted: false,
      providerFamily: "local_openai",
      apiFamily: "openai_chat_completions",
      exactModelIdAllowlist: ["gpt-5.2-2025-12-11"],
      strongestDirective: {
        kind: "openai_reasoning_effort",
        effort: "xhigh",
      },
      defaultOmissionRule: "omit_all_reasoning_fields",
      sseTerminalRule: "done_required",
    });
    expect(candidate.policyRevision).toBe(candidate.policyDigest);
    expect(PRA1_PRODUCTION_SUPPORTED_RELEASE_COUNT).toBe(0);
  });

  it("keeps official URLs as provenance while binding immutable claim digests", () => {
    const [source] = OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE.evidenceSources;
    expect(source?.sourceUrl).toBe(
      "https://developers.openai.com/api/docs/models/gpt-5.2",
    );
    expect(source?.claims.length).toBe(5);
    expect(new Set(source?.claims.map((claim) => claim.claimDigest)).size).toBe(5);
  });

  it("fails closed when policy material drifts", () => {
    const candidate = OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE;
    expect(() => validateProviderReleaseAdmissionPolicyV1({
      ...candidate,
      requestProjectorRevision: digest("f"),
    })).toThrow(ProviderReleaseAdmissionPolicyError);
    expect(() => ProviderReleaseAdmissionPolicyV1Schema.parse({
      ...candidate,
      productionAdmitted: true,
    })).toThrow();
  });

  it("records DeepSeek as requiring a separately reviewed mapping revision", () => {
    const exclusion = validateProviderReleaseExclusionV1(
      DEEPSEEK_THINKING_MODE_ADMISSION_EXCLUSION,
    );
    expect(exclusion.disposition).toBe("requires_mapping_revision");
    expect(exclusion.blockers).toEqual([
      "directive_variant",
      "tool_continuation_private_state",
    ]);
  });

  it("contains no Credential, user Secret or runtime exact subject material", () => {
    const serialized = JSON.stringify({
      candidate: OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE,
      exclusion: DEEPSEEK_THINKING_MODE_ADMISSION_EXCLUSION,
    });
    expect(serialized).not.toMatch(/credentialRef|api[_-]?key|bearer|ownerScopeDigest|executionDefinitionDigest/iu);
  });
});
