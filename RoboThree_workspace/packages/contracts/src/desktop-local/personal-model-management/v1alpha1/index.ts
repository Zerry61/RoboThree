import { z } from "zod";

import { EntityIdSchema } from "../../../common/identifiers.js";
import { Sha256DigestSchema } from "../../../persistence/common.js";
import {
  DesktopDisplayTextSchema,
  DesktopResourceIdSchema,
  ModelCapabilitySchema,
  TimestampSchema,
} from "../../v1alpha1/index.js";
import {
  PersonalModelCredentialStateSchema,
  PersonalModelProtocolSchema,
  PersonalModelProviderSchema,
  PersonalModelStatusSchema,
  PersonalModelUnavailableReasonSchema,
} from "../../v1alpha2/personal-model.js";

export const PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA1 =
  "personal-model-management.v1alpha1" as const;

const QueryMetadataSchema = z.object({
  contractVersion: z.literal(PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA1),
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
}).strict();

export const PersonalModelManagementAuthorityKindV1Alpha1Schema = z.enum([
  "standalone_local_owner",
  "runtime_active_enterprise_identity",
  "unavailable",
]);

export const PersonalModelManagementReasonCodeV1Alpha1Schema = z.enum([
  "ready",
  "personal_model.feature_unavailable",
  "personal_model.permission_denied",
  "personal_model.credential_store_unavailable",
  "personal_model.transport_unavailable",
]);

export const PersonalModelManagementCompatibilityQueryV1Alpha1Schema =
  QueryMetadataSchema.extend({
    type: z.literal("personal_model_management_compatibility"),
    supportedContractVersions: z.array(
      z.literal(PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA1),
    ).min(1).max(4),
  }).strict();

export const PersonalModelManagementCompatibilityProjectionV1Alpha1Schema =
  z.object({
    contractVersion: z.literal(PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA1),
    runtimeInstanceId: z.string().min(3).max(160),
    catalogAvailable: z.boolean(),
    mutationAvailable: z.boolean(),
    revealAvailable: z.boolean(),
    authorityKind: PersonalModelManagementAuthorityKindV1Alpha1Schema,
    helperState: z.enum(["production_verified", "unavailable"]),
    transportState: z.enum(["ready", "unavailable"]),
    productionIdentityReady: z.boolean(),
    testIdentityUsed: z.boolean(),
    reasonCode: PersonalModelManagementReasonCodeV1Alpha1Schema.optional(),
  }).strict().superRefine((value, context) => {
    if (value.testIdentityUsed && value.productionIdentityReady) {
      context.addIssue({
        code: "custom",
        path: ["testIdentityUsed"],
        message: "test and production identity cannot both be ready",
      });
    }
    if ((value.mutationAvailable || value.revealAvailable)
      && (value.helperState !== "production_verified"
        || value.transportState !== "ready"
        || !value.productionIdentityReady)) {
      context.addIssue({
        code: "custom",
        message: "sensitive Personal Model capabilities require the complete production graph",
      });
    }
    if (value.catalogAvailable && value.authorityKind === "unavailable") {
      context.addIssue({
        code: "custom",
        path: ["authorityKind"],
        message: "available catalog requires a management authority mode",
      });
    }
    const fullyReady = value.catalogAvailable && value.mutationAvailable && value.revealAvailable;
    if (fullyReady === (value.reasonCode !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["reasonCode"],
        message: "reasonCode is required exactly when the management graph is not fully ready",
      });
    }
  });

export const ListPersonalModelsQueryV1Alpha1Schema = QueryMetadataSchema.extend({
  type: z.literal("list_personal_models"),
  cursor: z.string().min(16).max(2_048).optional(),
  limit: z.number().int().min(1).max(100),
}).strict();

export const GetPersonalModelQueryV1Alpha1Schema = QueryMetadataSchema.extend({
  type: z.literal("get_personal_model"),
  personalModelId: DesktopResourceIdSchema,
}).strict();

export const PersonalModelManagementPermissionsV1Alpha1Schema = z.object({
  canConfigure: z.boolean(),
  canUse: z.boolean(),
  canReveal: z.boolean(),
  canDelete: z.boolean(),
  safeReason: z.union([
    PersonalModelManagementReasonCodeV1Alpha1Schema,
    PersonalModelUnavailableReasonSchema,
  ]).optional(),
}).strict().superRefine((value, context) => {
  const anyDenied = !value.canConfigure || !value.canUse || !value.canReveal || !value.canDelete;
  if (anyDenied !== (value.safeReason !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["safeReason"],
      message: "safeReason is required exactly when at least one operation is denied",
    });
  }
});

export const PersonalModelSafeProjectionV1Alpha1Schema = z.object({
  contractVersion: z.literal(PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA1),
  personalModelId: DesktopResourceIdSchema,
  configurationRevision: Sha256DigestSchema,
  displayName: DesktopDisplayTextSchema.max(160),
  provider: PersonalModelProviderSchema,
  protocol: PersonalModelProtocolSchema,
  providerModelId: DesktopDisplayTextSchema.max(160),
  endpointDisplayHost: z.string().min(1).max(253),
  capabilities: z.array(ModelCapabilitySchema).max(16),
  status: PersonalModelStatusSchema,
  available: z.boolean(),
  unavailableReason: PersonalModelUnavailableReasonSchema.optional(),
  credentialState: PersonalModelCredentialStateSchema,
  preferenceSelected: z.boolean(),
  permissions: PersonalModelManagementPermissionsV1Alpha1Schema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.available === (value.unavailableReason !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["unavailableReason"],
      message: "unavailableReason is required exactly when the model is unavailable",
    });
  }
  if (value.available !== value.permissions.canUse) {
    context.addIssue({
      code: "custom",
      path: ["permissions", "canUse"],
      message: "canUse must reflect the safe model availability projection",
    });
  }
});

export const PersonalModelPageV1Alpha1Schema = z.object({
  contractVersion: z.literal(PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA1),
  queryRevision: z.string().min(1).max(160),
  items: z.array(PersonalModelSafeProjectionV1Alpha1Schema).max(100),
  nextCursor: z.string().min(16).max(2_048).optional(),
}).strict();

export const PersonalModelManagementErrorCodeV1Alpha1Schema = z.enum([
  "personal_model.contract_invalid",
  "personal_model.feature_unavailable",
  "personal_model.runtime_changed",
  "personal_model.permission_denied",
  "personal_model.not_found",
  "personal_model.revision_conflict",
  "personal_model.cursor_stale",
  "personal_model.credential_store_unavailable",
  "personal_model.transport_unavailable",
  "personal_model.operation_in_progress",
  "personal_model.operation_uncertain",
  "personal_model.manual_attention",
  "personal_model.cleanup_pending",
  "internal",
]);

export const PersonalModelManagementErrorEnvelopeV1Alpha1Schema = z.object({
  contractVersion: z.literal(PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA1),
  code: PersonalModelManagementErrorCodeV1Alpha1Schema,
  category: z.enum([
    "validation",
    "authorization",
    "availability",
    "compatibility",
    "conflict",
    "uncertain",
    "internal",
  ]),
  safeSummary: z.string().min(1).max(512),
  retryable: z.boolean(),
  correlationId: EntityIdSchema,
}).strict();

export type PersonalModelManagementCompatibilityQueryV1Alpha1 = z.infer<
  typeof PersonalModelManagementCompatibilityQueryV1Alpha1Schema
>;
export type PersonalModelManagementCompatibilityProjectionV1Alpha1 = z.infer<
  typeof PersonalModelManagementCompatibilityProjectionV1Alpha1Schema
>;
export type ListPersonalModelsQueryV1Alpha1 = z.infer<
  typeof ListPersonalModelsQueryV1Alpha1Schema
>;
export type GetPersonalModelQueryV1Alpha1 = z.infer<
  typeof GetPersonalModelQueryV1Alpha1Schema
>;
export type PersonalModelSafeProjectionV1Alpha1 = z.infer<
  typeof PersonalModelSafeProjectionV1Alpha1Schema
>;
export type PersonalModelPageV1Alpha1 = z.infer<
  typeof PersonalModelPageV1Alpha1Schema
>;
export type PersonalModelManagementErrorEnvelopeV1Alpha1 = z.infer<
  typeof PersonalModelManagementErrorEnvelopeV1Alpha1Schema
>;
