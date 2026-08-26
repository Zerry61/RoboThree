import {
  EnterpriseDeviceTrustDecisionV1Alpha1Schema,
  EnterpriseSessionAssertionV1Alpha1Schema,
  RuntimeActiveAuthoritySourceV1Alpha1Schema,
  RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1Schema,
  Sha256DigestSchema,
  type EnterpriseDeviceTrustDecisionV1Alpha1,
  type EnterpriseSessionAssertionV1Alpha1,
  type RuntimeActiveAuthoritySourceV1Alpha1,
  type RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1,
} from "@robothree/contracts";

import { projectEnterpriseOfflineState } from "./enterprise-configuration-status.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

export type EnterpriseIdentityAuthoritySemanticsInput = Readonly<{
  runtimeInstanceId: string;
  currentClientInstanceId: string;
  sessionAssertion: EnterpriseSessionAssertionV1Alpha1;
  deviceTrustDecision: EnterpriseDeviceTrustDecisionV1Alpha1;
  runtimeActive: RuntimeActiveAuthoritySourceV1Alpha1;
  serviceReachable: boolean;
  recoveredUpdateWaitingForApplication: boolean;
  locallyExecutableCapabilityCount: number;
  policyEntitlementGranted: boolean;
  policyEntitlementRevision: string;
  evaluatedAt: string;
}>;

export type EnterpriseIdentityAuthoritySemanticsErrorCode =
  | "enterprise_identity.session_invalid"
  | "enterprise_identity.scope_mismatch"
  | "enterprise_identity.device_trust_invalid"
  | "enterprise_identity.runtime_activation_mismatch"
  | "enterprise_identity.compatibility_unavailable"
  | "enterprise_identity.snapshot_corrupt";

export class EnterpriseIdentityAuthoritySemanticsError extends Error {
  public constructor(
    public readonly code: EnterpriseIdentityAuthoritySemanticsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EnterpriseIdentityAuthoritySemanticsError";
  }
}

/**
 * Pure EIPC-0 conformance materializer. It performs no token acquisition,
 * Device Trust lookup, persistence, production composition, or I/O.
 */
export function materializeEnterpriseAuthoritySnapshot(
  input: EnterpriseIdentityAuthoritySemanticsInput,
): RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1 {
  const session = EnterpriseSessionAssertionV1Alpha1Schema.parse(input.sessionAssertion);
  const trust = EnterpriseDeviceTrustDecisionV1Alpha1Schema.parse(input.deviceTrustDecision);
  const runtimeActive = RuntimeActiveAuthoritySourceV1Alpha1Schema.parse(input.runtimeActive);
  const evaluatedAtMs = parseTimestamp(input.evaluatedAt);
  const sessionValid = session.validity === "valid"
    && parseTimestamp(session.issuedAt) <= evaluatedAtMs
    && parseTimestamp(session.expiresAt) > evaluatedAtMs;

  assertDigest(session, "assertionDigest");
  assertDigest(trust, "decisionDigest");
  assertOwnerMatches(session.scope, trust.ownerIdentity, "enterprise_identity.scope_mismatch");
  assertOwnerMatches(session.scope, runtimeActive.activationScope, "enterprise_identity.runtime_activation_mismatch");
  if (session.scope.clientInstanceId !== input.currentClientInstanceId) {
    throw new EnterpriseIdentityAuthoritySemanticsError(
      "enterprise_identity.scope_mismatch",
      "current client instance does not match the verified session assertion",
    );
  }

  const trustValid = trust.decision === "trusted";
  const compatibilityAvailable = runtimeActive.compatibilityState === "compatible";
  const offline = projectEnterpriseOfflineState({
    serviceReachable: input.serviceReachable,
    enterpriseSessionValid: sessionValid && trustValid,
    recoveredUpdateWaitingForApplication: input.recoveredUpdateWaitingForApplication,
    runtimeActive: true,
    locallyExecutableCapabilityCount: input.locallyExecutableCapabilityCount,
  });
  const permissionGranted = session.permissions.includes("personal_model.configure");
  const mayUseActiveFacts = offline.state === "online"
    || (offline.state === "service_temporarily_unavailable"
      && offline.locallyExecutableCapabilitiesMayContinue);
  const entitlementGranted = permissionGranted
    && input.policyEntitlementGranted
    && compatibilityAvailable
    && mayUseActiveFacts;
  const policyEntitlementRevision = Sha256DigestSchema.parse(input.policyEntitlementRevision);
  const entitlementRevision = sha256CanonicalJson({
    domain: "robothree.enterprise.identity.entitlement.v1",
    permission: "personal_model.configure",
    permissionGranted,
    policyEntitlementGranted: input.policyEntitlementGranted,
    policyEntitlementRevision,
    sessionAssertionRevision: session.assertionRevision,
    enterpriseConfigurationRevision: runtimeActive.enterpriseConfigurationRevision,
    compatibilityState: runtimeActive.compatibilityState,
    compatibilityRevision: runtimeActive.compatibilityRevision,
  });
  const ownerIdentity = {
    enterpriseId: session.scope.enterpriseId,
    userId: session.scope.userId,
    deviceId: session.scope.deviceId,
  } as const;
  const sourceFactsDigest = sha256CanonicalJson({
    domain: "robothree.enterprise.identity.source-facts.v1",
    runtimeInstanceId: input.runtimeInstanceId,
    currentClientInstanceId: input.currentClientInstanceId,
    ownerIdentity,
    activationClientInstanceId: runtimeActive.activationScope.clientInstanceId,
    activationGenerationId: runtimeActive.generationId,
    registryRevision: runtimeActive.registryRevision,
    tokenSessionAssertionDigest: session.assertionDigest,
    deviceTrustDecisionDigest: trust.decisionDigest,
    enterpriseConfigurationRevision: runtimeActive.enterpriseConfigurationRevision,
    enterpriseConfigurationDigest: runtimeActive.enterpriseConfigurationDigest,
    compatibilityState: runtimeActive.compatibilityState,
    compatibilityRevision: runtimeActive.compatibilityRevision,
    compatibilityDigest: runtimeActive.compatibilityDigest,
    entitlementRevision,
    offlineState: offline.state,
  });
  const binding = {
    kind: "enterprise_session_binding" as const,
    schemaVersion: "eipc.v1alpha1" as const,
    runtimeInstanceId: input.runtimeInstanceId,
    currentClientInstanceId: input.currentClientInstanceId,
    ownerIdentity,
    activationClientInstanceId: runtimeActive.activationScope.clientInstanceId,
    activationGenerationId: runtimeActive.generationId,
    tokenSessionAssertionDigest: session.assertionDigest,
    deviceTrustDecisionDigest: trust.decisionDigest,
    enterpriseConfigurationRevision: runtimeActive.enterpriseConfigurationRevision,
    compatibilityRevision: runtimeActive.compatibilityRevision,
    entitlementRevision,
    offlineState: offline.state,
    sourceFactsDigest,
    evaluatedAt: input.evaluatedAt,
  };
  const snapshotMaterial = {
    kind: "runtime_active_enterprise_authority_snapshot" as const,
    schemaVersion: "eipc.v1alpha1" as const,
    binding,
    entitlement: "personal_model.configure" as const,
    entitlementGranted,
    entitlementRevision,
    offlineState: offline.state,
    sourceFactsDigest,
    evaluatedAt: input.evaluatedAt,
  };
  return RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1Schema.parse({
    ...snapshotMaterial,
    snapshotDigest: sha256CanonicalJson({
      domain: "robothree.enterprise.identity.authority-snapshot.v1",
      ...snapshotMaterial,
    }),
  });
}

function assertDigest(
  value: Record<string, unknown>,
  digestField: "assertionDigest" | "decisionDigest",
): void {
  const { [digestField]: digest, ...material } = value;
  const expected = sha256CanonicalJson({
    domain: digestField === "assertionDigest"
      ? "robothree.enterprise.identity.session-assertion.v1"
      : "robothree.enterprise.identity.device-trust-decision.v1",
    ...material,
  });
  if (digest !== expected) {
    throw new EnterpriseIdentityAuthoritySemanticsError(
      "enterprise_identity.snapshot_corrupt",
      "enterprise identity source fact digest does not match",
    );
  }
}

function assertOwnerMatches(
  left: Readonly<{ enterpriseId: string; userId: string; deviceId: string }>,
  right: Readonly<{ enterpriseId: string; userId: string; deviceId: string }>,
  code: "enterprise_identity.scope_mismatch" | "enterprise_identity.runtime_activation_mismatch",
): void {
  if (left.enterpriseId !== right.enterpriseId
    || left.userId !== right.userId
    || left.deviceId !== right.deviceId) {
    throw new EnterpriseIdentityAuthoritySemanticsError(
      code,
      "enterprise identity owner scope does not match",
    );
  }
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new EnterpriseIdentityAuthoritySemanticsError(
      "enterprise_identity.snapshot_corrupt",
      "enterprise identity timestamp is invalid",
    );
  }
  return parsed;
}
