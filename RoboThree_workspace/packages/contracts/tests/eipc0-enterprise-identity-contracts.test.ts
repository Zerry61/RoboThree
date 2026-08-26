import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EnterpriseDeviceTrustDecisionV1Alpha1Schema,
  EnterpriseSessionAssertionV1Alpha1Schema,
  EnterpriseSessionBindingV1Alpha1Schema,
  RuntimeActiveAuthoritySourceV1Alpha1Schema,
  RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1Schema,
} from "../src/index.js";

const digest = `sha256:${"a".repeat(64)}`;
const otherDigest = `sha256:${"b".repeat(64)}`;

describe("EIPC-0 enterprise identity composition Contracts", () => {
  it("accepts and rejects the canonical shared fixture corpus", () => {
    const root = resolve(process.cwd(), "contracts/enterprise-identity-composition/v1alpha1");
    const manifest = JSON.parse(readFileSync(
      resolve(root, "fixtures/manifest.json"),
      "utf8",
    )) as { contractVersion: string; cases: { file: string; valid: boolean }[] };
    expect(manifest.contractVersion).toBe("eipc.v1alpha1");
    for (const fixtureCase of manifest.cases) {
      const value: unknown = JSON.parse(readFileSync(
        resolve(root, "fixtures", fixtureCase.file),
        "utf8",
      ));
      expect(
        parseCanonicalFixture(value),
        fixtureCase.file,
      ).toBe(fixtureCase.valid);
    }
  });

  it("accepts a strict non-secret session assertion with personal-model entitlement", () => {
    expect(EnterpriseSessionAssertionV1Alpha1Schema.parse(sessionAssertion())).toEqual(
      sessionAssertion(),
    );
  });

  it("rejects raw bearer and token identifiers", () => {
    expect(EnterpriseSessionAssertionV1Alpha1Schema.safeParse({
      ...sessionAssertion(),
      compactToken: "not-a-real-token",
    }).success).toBe(false);
    expect(EnterpriseSessionAssertionV1Alpha1Schema.safeParse({
      ...sessionAssertion(),
      tokenId: "11111111-1111-4111-8111-111111111111",
    }).success).toBe(false);
  });

  it("rejects duplicate and unknown permissions", () => {
    expect(EnterpriseSessionAssertionV1Alpha1Schema.safeParse({
      ...sessionAssertion(),
      permissions: ["personal_model.configure", "personal_model.configure"],
    }).success).toBe(false);
    expect(EnterpriseSessionAssertionV1Alpha1Schema.safeParse({
      ...sessionAssertion(),
      permissions: ["personal_model.admin"],
    }).success).toBe(false);
  });

  it("keeps Device Trust decisions strict and free of raw proof", () => {
    expect(EnterpriseDeviceTrustDecisionV1Alpha1Schema.safeParse(deviceTrust()).success).toBe(true);
    expect(EnterpriseDeviceTrustDecisionV1Alpha1Schema.safeParse({
      ...deviceTrust(),
      deviceProof: "forbidden-proof",
    }).success).toBe(false);
  });

  it("separates activation and current client identities", () => {
    const source = RuntimeActiveAuthoritySourceV1Alpha1Schema.parse(runtimeActive());
    const binding = EnterpriseSessionBindingV1Alpha1Schema.parse(sessionBinding());
    expect(source.activationScope.clientInstanceId).not.toBe(binding.currentClientInstanceId);
    expect(binding.ownerIdentity).toEqual({
      enterpriseId: "enterprise.acme",
      userId: "user.alice",
      deviceId: "device.managed-one",
    });
  });

  it("rejects snapshots whose binding facts drift", () => {
    expect(RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1Schema.safeParse({
      ...snapshot(),
      offlineState: "enterprise_session_invalid",
    }).success).toBe(false);
    expect(RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1Schema.safeParse({
      ...snapshot(),
      entitlementRevision: otherDigest,
    }).success).toBe(false);
  });

  it("forbids entitlement grant for invalid or pending enterprise sessions", () => {
    for (const offlineState of [
      "enterprise_session_invalid",
      "recovered_update_waiting_for_application",
    ] as const) {
      expect(RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1Schema.safeParse({
        ...snapshot(),
        binding: { ...sessionBinding(), offlineState },
        offlineState,
        entitlementGranted: true,
      }).success).toBe(false);
    }
  });
});

function parseCanonicalFixture(value: unknown): boolean {
  if (typeof value !== "object" || value === null || !("kind" in value)) return false;
  switch ((value as { kind?: unknown }).kind) {
    case "enterprise_session_assertion":
      return EnterpriseSessionAssertionV1Alpha1Schema.safeParse(value).success;
    case "enterprise_device_trust_decision":
      return EnterpriseDeviceTrustDecisionV1Alpha1Schema.safeParse(value).success;
    case "runtime_active_authority_source":
      return RuntimeActiveAuthoritySourceV1Alpha1Schema.safeParse(value).success;
    case "enterprise_session_binding":
      return EnterpriseSessionBindingV1Alpha1Schema.safeParse(value).success;
    case "runtime_active_enterprise_authority_snapshot":
      return RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1Schema.safeParse(value).success;
    default:
      return false;
  }
}

function sessionAssertion() {
  return {
    kind: "enterprise_session_assertion" as const,
    schemaVersion: "eipc.v1alpha1" as const,
    validity: "valid" as const,
    audience: "robothree.enterprise-gateway",
    scope: {
      enterpriseId: "enterprise.acme",
      userId: "user.alice",
      deviceId: "device.managed-one",
      clientInstanceId: "11111111-1111-4111-8111-111111111111",
    },
    permissions: ["configuration.read", "personal_model.configure"] as const,
    issuedAt: "2026-08-22T01:00:00.000Z",
    expiresAt: "2026-08-22T03:00:00.000Z",
    assertionRevision: digest,
    assertionDigest: otherDigest,
  };
}

function deviceTrust() {
  return {
    kind: "enterprise_device_trust_decision" as const,
    schemaVersion: "eipc.v1alpha1" as const,
    decision: "trusted" as const,
    ownerIdentity: {
      enterpriseId: "enterprise.acme",
      userId: "user.alice",
      deviceId: "device.managed-one",
    },
    decisionRevision: digest,
    decisionDigest: otherDigest,
    evaluatedAt: "2026-08-22T01:30:00.000Z",
  };
}

function runtimeActive() {
  return {
    kind: "runtime_active_authority_source" as const,
    schemaVersion: "eipc.v1alpha1" as const,
    generationId: "activation.enterprise-one",
    activationScope: {
      enterpriseId: "enterprise.acme",
      userId: "user.alice",
      deviceId: "device.managed-one",
      clientInstanceId: "22222222-2222-4222-8222-222222222222",
    },
    registryRevision: digest,
    enterpriseConfigurationRevision: "configuration.revision-one",
    enterpriseConfigurationDigest: digest,
    compatibilityState: "compatible" as const,
    compatibilityRevision: "compatibility.revision-one",
    compatibilityDigest: otherDigest,
    activatedAt: "2026-08-22T00:30:00.000Z",
  };
}

function sessionBinding() {
  return {
    kind: "enterprise_session_binding" as const,
    schemaVersion: "eipc.v1alpha1" as const,
    runtimeInstanceId: "33333333-3333-4333-8333-333333333333",
    currentClientInstanceId: "11111111-1111-4111-8111-111111111111",
    ownerIdentity: {
      enterpriseId: "enterprise.acme",
      userId: "user.alice",
      deviceId: "device.managed-one",
    },
    activationClientInstanceId: "22222222-2222-4222-8222-222222222222",
    activationGenerationId: "activation.enterprise-one",
    tokenSessionAssertionDigest: digest,
    deviceTrustDecisionDigest: otherDigest,
    enterpriseConfigurationRevision: "configuration.revision-one",
    compatibilityRevision: "compatibility.revision-one",
    entitlementRevision: digest,
    offlineState: "online" as const,
    sourceFactsDigest: otherDigest,
    evaluatedAt: "2026-08-22T02:00:00.000Z",
  };
}

function snapshot() {
  return {
    kind: "runtime_active_enterprise_authority_snapshot" as const,
    schemaVersion: "eipc.v1alpha1" as const,
    binding: sessionBinding(),
    entitlement: "personal_model.configure" as const,
    entitlementGranted: true,
    entitlementRevision: digest,
    offlineState: "online" as const,
    sourceFactsDigest: otherDigest,
    snapshotDigest: digest,
    evaluatedAt: "2026-08-22T02:00:00.000Z",
  };
}
