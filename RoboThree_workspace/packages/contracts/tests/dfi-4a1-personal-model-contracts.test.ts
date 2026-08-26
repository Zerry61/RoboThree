import { describe, expect, it } from "vitest";

import { PersonalModelSafeSummaryV1Alpha2Schema } from "../src/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const base = {
  contractVersion: "v1alpha2",
  personalModelId: "model.personal.deepseek",
  configurationRevision: digest("a"),
  displayName: "我的 DeepSeek",
  provider: "deepseek",
  protocol: "openai_compatible",
  providerModelId: "deepseek-chat",
  endpointDisplayHost: "api.deepseek.com",
  endpointIdentityDigest: digest("b"),
  capabilities: ["text", "streaming"],
  status: "unverified",
  statusRevision: 1,
  available: true,
  credentialState: "present_masked",
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
} as const;

describe("DFI-4A.1 Personal Model safe v1alpha2 Contract", () => {
  it("accepts the strict safe summary and keeps model identifier separate from display name", () => {
    expect(PersonalModelSafeSummaryV1Alpha2Schema.parse(base)).toMatchObject({
      providerModelId: "deepseek-chat",
      displayName: "我的 DeepSeek",
    });
  });

  it.each([
    ["authentication_failed", false, "authentication_failed"],
    ["protocol_incompatible", false, "protocol_incompatible"],
    ["model_not_found", false, "model_not_found"],
    ["unavailable", false, "provider_unavailable"],
    ["permission_denied", false, "permission_denied"],
    ["network_failed", true, undefined],
    ["available", true, undefined],
  ] as const)("enforces %s availability semantics", (status, available, reason) => {
    expect(PersonalModelSafeSummaryV1Alpha2Schema.safeParse({
      ...base,
      status,
      available,
      ...(reason === undefined ? {} : { unavailableReason: reason }),
    }).success).toBe(true);
  });

  it("rejects sensitive and private persistence material", () => {
    for (const field of ["apiKey", "credentialRef", "ownerScopeDigest", "canonicalEndpoint"] as const) {
      expect(PersonalModelSafeSummaryV1Alpha2Schema.safeParse({
        ...base,
        [field]: "must-not-cross-contract",
      }).success, field).toBe(false);
    }
  });

  it("rejects unavailable combinations and absent credentials", () => {
    expect(PersonalModelSafeSummaryV1Alpha2Schema.safeParse({
      ...base,
      status: "authentication_failed",
      available: true,
    }).success).toBe(false);
    expect(PersonalModelSafeSummaryV1Alpha2Schema.safeParse({
      ...base,
      credentialState: "absent",
    }).success).toBe(false);
    for (const credentialState of ["unavailable", "delete_uncertain"] as const) {
      expect(PersonalModelSafeSummaryV1Alpha2Schema.safeParse({
        ...base,
        credentialState,
      }).success).toBe(false);
      expect(PersonalModelSafeSummaryV1Alpha2Schema.safeParse({
        ...base,
        status: "unavailable",
        available: false,
        credentialState,
        unavailableReason: credentialState === "delete_uncertain"
          ? "delete_uncertain"
          : "credential_unavailable",
      }).success).toBe(true);
    }
  });
});
