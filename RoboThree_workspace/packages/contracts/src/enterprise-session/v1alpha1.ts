import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import {
  EnterpriseAuthorityPermissionV1Alpha1Schema,
  EnterpriseDeviceTrustDecisionV1Alpha1Schema,
  EnterpriseOwnerIdentityV1Alpha1Schema,
  EnterpriseSessionAssertionV1Alpha1Schema,
  EnterpriseSessionScopeV1Alpha1Schema,
} from "../enterprise-identity-composition/v1alpha1.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { JsonValueSchema } from "../runtime/json.js";
import type { JsonValue } from "../runtime/json.js";

export const ENTERPRISE_SESSION_CONTRACT_VERSION = "enterprise-session.v1alpha1" as const;
export const ENTERPRISE_SESSION_CLAIMS_PROFILE = "eipc.session-token.v1" as const;
export const ENTERPRISE_SESSION_AUDIENCE = "robothree.enterprise-gateway" as const;

export const ENTERPRISE_SESSION_CHALLENGE_BINDING_DOMAIN =
  "robothree.enterprise-session.challenge-binding.v1" as const;
export const ENTERPRISE_SESSION_ASSERTION_REVISION_DOMAIN =
  "robothree.enterprise-session.assertion-revision.v1" as const;
export const ENTERPRISE_SESSION_ASSERTION_DOMAIN =
  "robothree.enterprise-session.assertion.v1" as const;
export const ENTERPRISE_SESSION_DEVICE_TRUST_REVISION_DOMAIN =
  "robothree.enterprise-session.device-trust-revision.v1" as const;
export const ENTERPRISE_SESSION_DEVICE_TRUST_DOMAIN =
  "robothree.enterprise-session.device-trust.v1" as const;
export const ENTERPRISE_SESSION_SOURCE_DECISION_DOMAIN =
  "robothree.enterprise-session.source-decision.v1" as const;

export const EnterpriseSessionDigestDomainSchema = z.enum([
  ENTERPRISE_SESSION_CHALLENGE_BINDING_DOMAIN,
  ENTERPRISE_SESSION_ASSERTION_REVISION_DOMAIN,
  ENTERPRISE_SESSION_ASSERTION_DOMAIN,
  ENTERPRISE_SESSION_DEVICE_TRUST_REVISION_DOMAIN,
  ENTERPRISE_SESSION_DEVICE_TRUST_DOMAIN,
  ENTERPRISE_SESSION_SOURCE_DECISION_DOMAIN,
]);

const BoundedIdentityIdSchema = z.string()
  .min(3)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const BoundedRevisionSchema = z.string().min(1).max(160);
const Base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/u);

export const OpaqueVerifiedIdentityHandleV1Alpha1Schema = Base64UrlSchema
  .min(32)
  .max(512);

export const EnterpriseSessionRequiredPermissionsV1Alpha1Schema = z.array(
  EnterpriseAuthorityPermissionV1Alpha1Schema,
).min(1).max(32).superRefine((permissions, context) => {
  if (new Set(permissions).size !== permissions.length) {
    context.addIssue({ code: "custom", message: "required permissions must be unique" });
  }
  if (!permissions.includes("configuration.read")) {
    context.addIssue({ code: "custom", message: "configuration.read is required" });
  }
  const sorted = [...permissions].sort(asciiCompare);
  if (permissions.some((permission, index) => permission !== sorted[index])) {
    context.addIssue({ code: "custom", message: "required permissions must be ASCII sorted" });
  }
});

export const EnterpriseSessionDeviceProofV1Alpha1Schema = z.object({
  challengeId: EntityIdSchema,
  deviceKeyId: BoundedIdentityIdSchema,
  algorithm: z.string().min(2).max(32).regex(/^[A-Za-z][A-Za-z0-9._-]+$/u),
  signature: Base64UrlSchema.min(32).max(8192),
  signedAt: TimestampSchema,
}).strict();

export const EnterpriseSessionDeviceChallengeRequestV1Alpha1Schema = z.object({
  kind: z.literal("enterprise_session_device_challenge_request"),
  schemaVersion: z.literal(ENTERPRISE_SESSION_CONTRACT_VERSION),
  verifiedIdentityHandle: OpaqueVerifiedIdentityHandleV1Alpha1Schema,
  currentClientInstanceId: EntityIdSchema,
  audience: z.literal(ENTERPRISE_SESSION_AUDIENCE),
  requiredPermissions: EnterpriseSessionRequiredPermissionsV1Alpha1Schema,
  deviceKeyId: BoundedIdentityIdSchema,
  correlationId: EntityIdSchema,
}).strict();

export const EnterpriseSessionDeviceChallengeV1Alpha1Schema = z.object({
  kind: z.literal("enterprise_session_device_challenge"),
  schemaVersion: z.literal(ENTERPRISE_SESSION_CONTRACT_VERSION),
  challengeId: EntityIdSchema,
  nonce: Base64UrlSchema.min(32).max(512),
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
  audience: z.literal(ENTERPRISE_SESSION_AUDIENCE),
  currentClientInstanceId: EntityIdSchema,
  allowedAlgorithms: z.array(
    z.string().min(2).max(32).regex(/^[A-Za-z][A-Za-z0-9._-]+$/u),
  ).min(1).max(8).superRefine((algorithms, context) => {
    if (new Set(algorithms).size !== algorithms.length) {
      context.addIssue({ code: "custom", message: "allowed algorithms must be unique" });
    }
  }),
  challengeDigest: Sha256DigestSchema,
}).strict().superRefine((challenge, context) => {
  if (Date.parse(challenge.expiresAt) <= Date.parse(challenge.issuedAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "challenge expiry must follow issue time" });
  }
});

export const EnterpriseSessionLeaseRequestV1Alpha1Schema = z.object({
  kind: z.literal("enterprise_session_lease_request"),
  schemaVersion: z.literal(ENTERPRISE_SESSION_CONTRACT_VERSION),
  verifiedIdentityHandle: OpaqueVerifiedIdentityHandleV1Alpha1Schema,
  currentClientInstanceId: EntityIdSchema,
  audience: z.literal(ENTERPRISE_SESSION_AUDIENCE),
  requiredPermissions: EnterpriseSessionRequiredPermissionsV1Alpha1Schema,
  deviceProof: EnterpriseSessionDeviceProofV1Alpha1Schema,
  correlationId: EntityIdSchema,
}).strict();

export const EnterpriseSessionTokenClaimsV1Alpha1Schema = z.object({
  claimsProfile: z.literal(ENTERPRISE_SESSION_CLAIMS_PROFILE),
  issuer: BoundedIdentityIdSchema,
  audience: z.literal(ENTERPRISE_SESSION_AUDIENCE),
  enterpriseId: BoundedIdentityIdSchema,
  userId: BoundedIdentityIdSchema,
  deviceId: BoundedIdentityIdSchema,
  clientInstanceId: EntityIdSchema,
  tokenId: EntityIdSchema,
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
  permissions: EnterpriseSessionRequiredPermissionsV1Alpha1Schema,
  sessionAssertionDigest: Sha256DigestSchema,
  deviceTrustDecisionDigest: Sha256DigestSchema,
  compatibilityRevision: BoundedRevisionSchema,
  sourceDecisionDigest: Sha256DigestSchema,
}).strict().superRefine((claims, context) => {
  if (Date.parse(claims.expiresAt) <= Date.parse(claims.issuedAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "token expiry must follow issue time" });
  }
});

export const EnterpriseSessionLeaseResultV1Alpha1Schema = z.object({
  kind: z.literal("enterprise_session_lease_result"),
  schemaVersion: z.literal(ENTERPRISE_SESSION_CONTRACT_VERSION),
  claimsProfile: z.literal(ENTERPRISE_SESSION_CLAIMS_PROFILE),
  tokenType: z.literal("Bearer"),
  accessToken: z.string().min(16).max(16384).regex(/^[A-Za-z0-9._~-]+$/u),
  expiresAt: TimestampSchema,
  sessionAssertion: EnterpriseSessionAssertionV1Alpha1Schema,
  deviceTrustDecision: EnterpriseDeviceTrustDecisionV1Alpha1Schema,
  compatibilityRevision: BoundedRevisionSchema,
  sourceDecisionDigest: Sha256DigestSchema,
}).strict().superRefine((result, context) => {
  if (result.expiresAt !== result.sessionAssertion.expiresAt) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "lease and assertion expiry must match" });
  }
  if (result.sessionAssertion.validity !== "valid") {
    context.addIssue({ code: "custom", path: ["sessionAssertion"], message: "lease requires a valid assertion" });
  }
  if (result.deviceTrustDecision.decision !== "trusted") {
    context.addIssue({ code: "custom", path: ["deviceTrustDecision"], message: "lease requires a trusted device" });
  }
  const scope = result.sessionAssertion.scope;
  const owner = result.deviceTrustDecision.ownerIdentity;
  if (scope.enterpriseId !== owner.enterpriseId
    || scope.userId !== owner.userId
    || scope.deviceId !== owner.deviceId) {
    context.addIssue({ code: "custom", path: ["deviceTrustDecision"], message: "assertion and trust owner must match" });
  }
});

export const EnterpriseSessionErrorCodeV1Alpha1Schema = z.enum([
  "enterprise_identity_handle_invalid",
  "enterprise_identity_handle_drift",
  "device_challenge_expired",
  "device_challenge_replayed",
  "device_signature_invalid",
  "device_context_mismatch",
  "device_not_managed",
  "device_not_compliant",
  "permission_denied",
  "compatibility_incompatible",
  "access_token_invalid",
  "access_token_profile_ambiguous",
  "enterprise_session_unavailable",
  "enterprise_session_conflict",
  "internal",
]);

export const EnterpriseSessionErrorV1Alpha1Schema = z.object({
  kind: z.literal("enterprise_session_error"),
  schemaVersion: z.literal(ENTERPRISE_SESSION_CONTRACT_VERSION),
  errorCode: EnterpriseSessionErrorCodeV1Alpha1Schema,
  message: z.string().min(1).max(512),
  retryable: z.boolean(),
  correlationId: EntityIdSchema,
}).strict();

export const EnterpriseSessionChallengeBindingDigestMaterialSchema = z.object({
  schemaVersion: z.literal(ENTERPRISE_SESSION_CONTRACT_VERSION),
  claimsProfile: z.literal(ENTERPRISE_SESSION_CLAIMS_PROFILE),
  verifiedIdentityId: EntityIdSchema,
  currentClientInstanceId: EntityIdSchema,
  audience: z.literal(ENTERPRISE_SESSION_AUDIENCE),
  requiredPermissions: EnterpriseSessionRequiredPermissionsV1Alpha1Schema,
  deviceKeyId: BoundedIdentityIdSchema,
  correlationId: EntityIdSchema,
  challengeId: EntityIdSchema,
  nonce: Base64UrlSchema.min(32).max(512),
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
}).strict();

export const EnterpriseSessionAssertionRevisionMaterialSchema = z.object({
  claimsProfile: z.literal(ENTERPRISE_SESSION_CLAIMS_PROFILE),
  audience: z.literal(ENTERPRISE_SESSION_AUDIENCE),
  scope: EnterpriseSessionScopeV1Alpha1Schema,
  permissions: EnterpriseSessionRequiredPermissionsV1Alpha1Schema,
  identityDigest: Sha256DigestSchema,
  deviceRevision: Sha256DigestSchema,
  permissionRevision: Sha256DigestSchema,
  compatibilityRevision: BoundedRevisionSchema,
}).strict();

export const EnterpriseSessionDeviceTrustRevisionMaterialSchema = z.object({
  ownerIdentity: EnterpriseOwnerIdentityV1Alpha1Schema,
  deviceRevision: Sha256DigestSchema,
  trustSource: BoundedIdentityIdSchema,
  managedStatus: z.enum(["managed", "not_managed"]),
  complianceStatus: z.enum(["compliant", "not_compliant", "unknown"]),
}).strict();

export const EnterpriseSessionSourceDecisionMaterialSchema = z.object({
  claimsProfile: z.literal(ENTERPRISE_SESSION_CLAIMS_PROFILE),
  sessionAssertionDigest: Sha256DigestSchema,
  deviceTrustDecisionDigest: Sha256DigestSchema,
  compatibilityRevision: BoundedRevisionSchema,
  currentClientInstanceId: EntityIdSchema,
  requiredPermissions: EnterpriseSessionRequiredPermissionsV1Alpha1Schema,
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
}).strict();

export type EnterpriseSessionDeviceChallengeRequestV1Alpha1 = z.infer<typeof EnterpriseSessionDeviceChallengeRequestV1Alpha1Schema>;
export type EnterpriseSessionDeviceChallengeV1Alpha1 = z.infer<typeof EnterpriseSessionDeviceChallengeV1Alpha1Schema>;
export type EnterpriseSessionLeaseRequestV1Alpha1 = z.infer<typeof EnterpriseSessionLeaseRequestV1Alpha1Schema>;
export type EnterpriseSessionLeaseResultV1Alpha1 = z.infer<typeof EnterpriseSessionLeaseResultV1Alpha1Schema>;
export type EnterpriseSessionTokenClaimsV1Alpha1 = z.infer<typeof EnterpriseSessionTokenClaimsV1Alpha1Schema>;
export type EnterpriseSessionErrorV1Alpha1 = z.infer<typeof EnterpriseSessionErrorV1Alpha1Schema>;
export type EnterpriseSessionDigestDomain = z.infer<typeof EnterpriseSessionDigestDomainSchema>;

export function canonicalEnterpriseSessionJson(input: JsonValue): string {
  return JSON.stringify(sortAndNormalizeJson(JsonValueSchema.parse(input)));
}

export function canonicalEnterpriseSessionDigestInput(
  domain: EnterpriseSessionDigestDomain,
  input: JsonValue,
): string {
  return `${EnterpriseSessionDigestDomainSchema.parse(domain)}\n${canonicalEnterpriseSessionJson(input)}`;
}

export function enterpriseSessionAssertionDigestMaterial(
  assertion: z.infer<typeof EnterpriseSessionAssertionV1Alpha1Schema>,
): JsonValue {
  const parsed = EnterpriseSessionAssertionV1Alpha1Schema.parse(assertion);
  const { assertionDigest: _assertionDigest, ...material } = parsed;
  return material;
}

export function enterpriseSessionDeviceTrustDigestMaterial(
  decision: z.infer<typeof EnterpriseDeviceTrustDecisionV1Alpha1Schema>,
): JsonValue {
  const parsed = EnterpriseDeviceTrustDecisionV1Alpha1Schema.parse(decision);
  const { decisionDigest: _decisionDigest, ...material } = parsed;
  return material;
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortAndNormalizeJson(value: JsonValue): JsonValue {
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) return value.map(sortAndNormalizeJson);
  if (typeof value !== "object" || value === null) return value;
  const normalized = new Map<string, JsonValue>();
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.normalize("NFC");
    if (normalized.has(normalizedKey)) {
      throw new Error("canonical JSON contains duplicate keys after NFC normalization");
    }
    normalized.set(normalizedKey, sortAndNormalizeJson(child));
  }
  return Object.fromEntries([...normalized.entries()].sort(([left], [right]) => asciiCompare(left, right)));
}
