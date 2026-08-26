import { describe, expect, it } from "vitest";

import {
  materializeEnterpriseAuthoritySnapshot,
  EnterpriseIdentityAuthoritySemanticsError,
  type EnterpriseIdentityAuthoritySemanticsInput,
} from "../src/application/enterprise-identity-authority-semantics.js";
import { sha256CanonicalJson } from "../src/persistence/digest.js";

describe("EIPC-0 enterprise identity authority semantics", () => {
  it("materializes an online authority snapshot from exact source facts", () => {
    const result = materializeEnterpriseAuthoritySnapshot(fixture());
    expect(result.offlineState).toBe("online");
    expect(result.entitlementGranted).toBe(true);
    expect(result.binding.ownerIdentity).toEqual(owner());
  });

  it("keeps activation and current client instances separate during explicit rebind", () => {
    const result = materializeEnterpriseAuthoritySnapshot(fixture());
    expect(result.binding.activationClientInstanceId).toBe(ACTIVATION_CLIENT);
    expect(result.binding.currentClientInstanceId).toBe(CURRENT_CLIENT);
    expect(result.binding.activationClientInstanceId).not.toBe(
      result.binding.currentClientInstanceId,
    );
  });

  it("allows existing locally executable facts in CGF-1.3 state 2", () => {
    const result = materializeEnterpriseAuthoritySnapshot(fixture({
      serviceReachable: false,
    }));
    expect(result.offlineState).toBe("service_temporarily_unavailable");
    expect(result.entitlementGranted).toBe(true);
  });

  it("does not grant state 2 when no locally executable capability remains", () => {
    const result = materializeEnterpriseAuthoritySnapshot(fixture({
      serviceReachable: false,
      locallyExecutableCapabilityCount: 0,
    }));
    expect(result.offlineState).toBe("service_temporarily_unavailable");
    expect(result.entitlementGranted).toBe(false);
  });

  it("projects an expired token session to state 3 without inventing a new lease", () => {
    const input = fixture();
    const result = materializeEnterpriseAuthoritySnapshot({
      ...input,
      evaluatedAt: "2026-08-22T04:00:00.000Z",
    });
    expect(result.offlineState).toBe("enterprise_session_invalid");
    expect(result.entitlementGranted).toBe(false);
  });

  it("projects invalid Device Trust to state 3", () => {
    const input = fixture();
    const result = materializeEnterpriseAuthoritySnapshot({
      ...input,
      deviceTrustDecision: trustDecision("invalid"),
    });
    expect(result.offlineState).toBe("enterprise_session_invalid");
    expect(result.entitlementGranted).toBe(false);
  });

  it("does not silently apply recovered enterprise configuration", () => {
    const result = materializeEnterpriseAuthoritySnapshot(fixture({
      recoveredUpdateWaitingForApplication: true,
    }));
    expect(result.offlineState).toBe("recovered_update_waiting_for_application");
    expect(result.entitlementGranted).toBe(false);
  });

  it("requires both token permission and activated policy entitlement", () => {
    const noPolicy = materializeEnterpriseAuthoritySnapshot(fixture({
      policyEntitlementGranted: false,
    }));
    const input = fixture();
    const noPermission = materializeEnterpriseAuthoritySnapshot({
      ...input,
      sessionAssertion: sessionAssertion(["configuration.read"]),
    });
    expect(noPolicy.entitlementGranted).toBe(false);
    expect(noPermission.entitlementGranted).toBe(false);
  });

  it("requires an explicit compatible Runtime Active fact", () => {
    const input = fixture();
    const result = materializeEnterpriseAuthoritySnapshot({
      ...input,
      runtimeActive: {
        ...input.runtimeActive,
        compatibilityState: "incompatible",
      },
    });
    expect(result.offlineState).toBe("online");
    expect(result.entitlementGranted).toBe(false);
  });

  it("rejects a current client that was not bound by the verified session", () => {
    expect(() => materializeEnterpriseAuthoritySnapshot(fixture({
      currentClientInstanceId: "44444444-4444-4444-8444-444444444444",
    }))).toThrowError(expect.objectContaining({
      code: "enterprise_identity.scope_mismatch",
    }));
  });

  it("rejects Runtime Active owner drift", () => {
    const input = fixture();
    expect(() => materializeEnterpriseAuthoritySnapshot({
      ...input,
      runtimeActive: runtimeActive({ userId: "user.mallory" }),
    })).toThrowError(expect.objectContaining({
      code: "enterprise_identity.runtime_activation_mismatch",
    }));
  });

  it("rejects Device Trust owner drift", () => {
    const input = fixture();
    expect(() => materializeEnterpriseAuthoritySnapshot({
      ...input,
      deviceTrustDecision: trustDecision("trusted", { deviceId: "device.other" }),
    })).toThrowError(expect.objectContaining({
      code: "enterprise_identity.scope_mismatch",
    }));
  });

  it("rejects tampered session and trust facts", () => {
    const input = fixture();
    expect(() => materializeEnterpriseAuthoritySnapshot({
      ...input,
      sessionAssertion: { ...input.sessionAssertion, audience: "tampered.audience" },
    })).toThrow(EnterpriseIdentityAuthoritySemanticsError);
    expect(() => materializeEnterpriseAuthoritySnapshot({
      ...input,
      deviceTrustDecision: {
        ...input.deviceTrustDecision,
        decisionRevision: DIGEST_B,
      },
    })).toThrow(EnterpriseIdentityAuthoritySemanticsError);
  });

  it("keeps sourceFactsDigest stable across evaluation time but snapshotDigest distinct", () => {
    const first = materializeEnterpriseAuthoritySnapshot(fixture());
    const second = materializeEnterpriseAuthoritySnapshot(fixture({
      evaluatedAt: "2026-08-22T02:05:00.000Z",
    }));
    expect(first.sourceFactsDigest).toBe(second.sourceFactsDigest);
    expect(first.snapshotDigest).not.toBe(second.snapshotDigest);
  });
});

const CURRENT_CLIENT = "11111111-1111-4111-8111-111111111111";
const ACTIVATION_CLIENT = "22222222-2222-4222-8222-222222222222";
const RUNTIME = "33333333-3333-4333-8333-333333333333";
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function owner(override: Partial<ReturnType<typeof owner>> = {}) {
  return {
    enterpriseId: "enterprise.acme",
    userId: "user.alice",
    deviceId: "device.managed-one",
    ...override,
  };
}

function sessionAssertion(
  permissions: readonly ("configuration.read" | "personal_model.configure")[] = [
    "configuration.read",
    "personal_model.configure",
  ],
) {
  const material = {
    kind: "enterprise_session_assertion" as const,
    schemaVersion: "eipc.v1alpha1" as const,
    validity: "valid" as const,
    audience: "robothree.enterprise-gateway",
    scope: { ...owner(), clientInstanceId: CURRENT_CLIENT },
    permissions: [...permissions],
    issuedAt: "2026-08-22T01:00:00.000Z",
    expiresAt: "2026-08-22T03:00:00.000Z",
    assertionRevision: DIGEST_A,
  };
  return {
    ...material,
    assertionDigest: sha256CanonicalJson({
      domain: "robothree.enterprise.identity.session-assertion.v1",
      ...material,
    }),
  };
}

function trustDecision(
  decision: "trusted" | "invalid" = "trusted",
  identity: Partial<ReturnType<typeof owner>> = {},
) {
  const material = {
    kind: "enterprise_device_trust_decision" as const,
    schemaVersion: "eipc.v1alpha1" as const,
    decision,
    ownerIdentity: owner(identity),
    decisionRevision: DIGEST_A,
    evaluatedAt: "2026-08-22T01:30:00.000Z",
  };
  return {
    ...material,
    decisionDigest: sha256CanonicalJson({
      domain: "robothree.enterprise.identity.device-trust-decision.v1",
      ...material,
    }),
  };
}

function runtimeActive(identity: Partial<ReturnType<typeof owner>> = {}) {
  return {
    kind: "runtime_active_authority_source" as const,
    schemaVersion: "eipc.v1alpha1" as const,
    generationId: "activation.enterprise-one",
    activationScope: {
      ...owner(identity),
      clientInstanceId: ACTIVATION_CLIENT,
    },
    registryRevision: DIGEST_A,
    enterpriseConfigurationRevision: "configuration.revision-one",
    enterpriseConfigurationDigest: DIGEST_A,
    compatibilityState: "compatible" as const,
    compatibilityRevision: "compatibility.revision-one",
    compatibilityDigest: DIGEST_B,
    activatedAt: "2026-08-22T00:30:00.000Z",
  };
}

function fixture(
  override: Partial<EnterpriseIdentityAuthoritySemanticsInput> = {},
): EnterpriseIdentityAuthoritySemanticsInput {
  return {
    runtimeInstanceId: RUNTIME,
    currentClientInstanceId: CURRENT_CLIENT,
    sessionAssertion: sessionAssertion(),
    deviceTrustDecision: trustDecision(),
    runtimeActive: runtimeActive(),
    serviceReachable: true,
    recoveredUpdateWaitingForApplication: false,
    locallyExecutableCapabilityCount: 1,
    policyEntitlementGranted: true,
    policyEntitlementRevision: DIGEST_A,
    evaluatedAt: "2026-08-22T02:00:00.000Z",
    ...override,
  };
}
