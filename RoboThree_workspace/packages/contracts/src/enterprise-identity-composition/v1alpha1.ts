import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { Sha256DigestSchema } from "../persistence/common.js";

export const ENTERPRISE_IDENTITY_COMPOSITION_CONTRACT_VERSION = "eipc.v1alpha1" as const;

const BoundedIdentityIdSchema = z.string()
  .min(3)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

const BoundedRevisionSchema = z.string()
  .min(1)
  .max(160);

export const EnterpriseOwnerIdentityV1Alpha1Schema = z.object({
  enterpriseId: BoundedIdentityIdSchema,
  userId: BoundedIdentityIdSchema,
  deviceId: BoundedIdentityIdSchema,
}).strict();

export const EnterpriseSessionScopeV1Alpha1Schema = EnterpriseOwnerIdentityV1Alpha1Schema.extend({
  clientInstanceId: EntityIdSchema,
}).strict();

export const EnterpriseAuthorityOfflineStateV1Alpha1Schema = z.enum([
  "online",
  "service_temporarily_unavailable",
  "enterprise_session_invalid",
  "recovered_update_waiting_for_application",
]);

export const EnterpriseAuthorityPermissionV1Alpha1Schema = z.enum([
  "configuration.read",
  "model.use",
  "tool.use",
  "agent.use",
  "skill.use",
  "knowledge.use",
  "personal_model.configure",
]);

export const EnterpriseSessionAssertionV1Alpha1Schema = z.object({
  kind: z.literal("enterprise_session_assertion"),
  schemaVersion: z.literal(ENTERPRISE_IDENTITY_COMPOSITION_CONTRACT_VERSION),
  validity: z.enum(["valid", "invalid"]),
  audience: z.string().min(3).max(256),
  scope: EnterpriseSessionScopeV1Alpha1Schema,
  permissions: z.array(EnterpriseAuthorityPermissionV1Alpha1Schema)
    .max(32)
    .superRefine((permissions, context) => {
      if (new Set(permissions).size !== permissions.length) {
        context.addIssue({ code: "custom", message: "permissions must be unique" });
      }
    }),
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
  assertionRevision: Sha256DigestSchema,
  assertionDigest: Sha256DigestSchema,
}).strict();

export const EnterpriseDeviceTrustDecisionV1Alpha1Schema = z.object({
  kind: z.literal("enterprise_device_trust_decision"),
  schemaVersion: z.literal(ENTERPRISE_IDENTITY_COMPOSITION_CONTRACT_VERSION),
  decision: z.enum(["trusted", "invalid"]),
  ownerIdentity: EnterpriseOwnerIdentityV1Alpha1Schema,
  decisionRevision: Sha256DigestSchema,
  decisionDigest: Sha256DigestSchema,
  evaluatedAt: TimestampSchema,
}).strict();

export const RuntimeActiveAuthoritySourceV1Alpha1Schema = z.object({
  kind: z.literal("runtime_active_authority_source"),
  schemaVersion: z.literal(ENTERPRISE_IDENTITY_COMPOSITION_CONTRACT_VERSION),
  generationId: BoundedIdentityIdSchema,
  activationScope: EnterpriseSessionScopeV1Alpha1Schema,
  registryRevision: Sha256DigestSchema,
  enterpriseConfigurationRevision: BoundedRevisionSchema,
  enterpriseConfigurationDigest: Sha256DigestSchema,
  compatibilityState: z.enum(["compatible", "incompatible"]),
  compatibilityRevision: BoundedRevisionSchema,
  compatibilityDigest: Sha256DigestSchema,
  activatedAt: TimestampSchema,
}).strict();

export const EnterpriseSessionBindingV1Alpha1Schema = z.object({
  kind: z.literal("enterprise_session_binding"),
  schemaVersion: z.literal(ENTERPRISE_IDENTITY_COMPOSITION_CONTRACT_VERSION),
  runtimeInstanceId: EntityIdSchema,
  currentClientInstanceId: EntityIdSchema,
  ownerIdentity: EnterpriseOwnerIdentityV1Alpha1Schema,
  activationClientInstanceId: EntityIdSchema,
  activationGenerationId: BoundedIdentityIdSchema,
  tokenSessionAssertionDigest: Sha256DigestSchema,
  deviceTrustDecisionDigest: Sha256DigestSchema,
  enterpriseConfigurationRevision: BoundedRevisionSchema,
  compatibilityRevision: BoundedRevisionSchema,
  entitlementRevision: Sha256DigestSchema,
  offlineState: EnterpriseAuthorityOfflineStateV1Alpha1Schema,
  sourceFactsDigest: Sha256DigestSchema,
  evaluatedAt: TimestampSchema,
}).strict();

export const RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1Schema = z.object({
  kind: z.literal("runtime_active_enterprise_authority_snapshot"),
  schemaVersion: z.literal(ENTERPRISE_IDENTITY_COMPOSITION_CONTRACT_VERSION),
  binding: EnterpriseSessionBindingV1Alpha1Schema,
  entitlement: z.literal("personal_model.configure"),
  entitlementGranted: z.boolean(),
  entitlementRevision: Sha256DigestSchema,
  offlineState: EnterpriseAuthorityOfflineStateV1Alpha1Schema,
  sourceFactsDigest: Sha256DigestSchema,
  snapshotDigest: Sha256DigestSchema,
  evaluatedAt: TimestampSchema,
}).strict().superRefine((snapshot, context) => {
  if (snapshot.binding.entitlementRevision !== snapshot.entitlementRevision) {
    context.addIssue({ code: "custom", message: "entitlement revision must match the binding" });
  }
  if (snapshot.binding.offlineState !== snapshot.offlineState) {
    context.addIssue({ code: "custom", message: "offline state must match the binding" });
  }
  if (snapshot.binding.sourceFactsDigest !== snapshot.sourceFactsDigest) {
    context.addIssue({ code: "custom", message: "source facts digest must match the binding" });
  }
  if (snapshot.offlineState === "enterprise_session_invalid"
    || snapshot.offlineState === "recovered_update_waiting_for_application") {
    if (snapshot.entitlementGranted) {
      context.addIssue({ code: "custom", message: "invalid or pending sessions cannot grant entitlement" });
    }
  }
});

export type EnterpriseOwnerIdentityV1Alpha1 = z.infer<
  typeof EnterpriseOwnerIdentityV1Alpha1Schema
>;
export type EnterpriseSessionScopeV1Alpha1 = z.infer<
  typeof EnterpriseSessionScopeV1Alpha1Schema
>;
export type EnterpriseAuthorityOfflineStateV1Alpha1 = z.infer<
  typeof EnterpriseAuthorityOfflineStateV1Alpha1Schema
>;
export type EnterpriseSessionAssertionV1Alpha1 = z.infer<
  typeof EnterpriseSessionAssertionV1Alpha1Schema
>;
export type EnterpriseDeviceTrustDecisionV1Alpha1 = z.infer<
  typeof EnterpriseDeviceTrustDecisionV1Alpha1Schema
>;
export type RuntimeActiveAuthoritySourceV1Alpha1 = z.infer<
  typeof RuntimeActiveAuthoritySourceV1Alpha1Schema
>;
export type EnterpriseSessionBindingV1Alpha1 = z.infer<
  typeof EnterpriseSessionBindingV1Alpha1Schema
>;
export type RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1 = z.infer<
  typeof RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1Schema
>;
