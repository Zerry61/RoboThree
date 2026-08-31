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
import {
  PersonalModelManagementAuthorityKindV1Alpha1Schema,
  PersonalModelManagementPermissionsV1Alpha1Schema,
  PersonalModelManagementReasonCodeV1Alpha1Schema,
} from "../v1alpha1/index.js";

export const PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA2 =
  "personal-model-management.v1alpha2" as const;

const ContractVersionSchema = z.literal(PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA2);
const DeadlineSchema = z.string().datetime({ offset: true });
const SafeTextSchema = DesktopDisplayTextSchema.max(160);

const QueryMetadataSchema = z.object({
  contractVersion: ContractVersionSchema,
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
}).strict();

const CommandMetadataSchema = z.object({
  contractVersion: ContractVersionSchema,
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
  deadlineAt: DeadlineSchema,
}).strict();

export const PersonalModelManagementCompatibilityQueryV1Alpha2Schema =
  QueryMetadataSchema.extend({
    type: z.literal("personal_model_management_compatibility"),
    contractVersion: ContractVersionSchema,
    supportedContractVersions: z.array(z.enum([
      "personal-model-management.v1alpha1",
      PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA2,
    ])).min(1).max(4),
  }).strict();

export const PersonalModelManagementCompatibilityProjectionV1Alpha2Schema =
  z.object({
    contractVersion: ContractVersionSchema,
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
      context.addIssue({ code: "custom", path: ["testIdentityUsed"], message: "test and production identity cannot both be ready" });
    }
    if ((value.mutationAvailable || value.revealAvailable)
      && (value.helperState !== "production_verified"
        || value.transportState !== "ready"
        || !value.productionIdentityReady)) {
      context.addIssue({ code: "custom", message: "sensitive Personal Model capabilities require the complete production graph" });
    }
    if (value.catalogAvailable && value.authorityKind === "unavailable") {
      context.addIssue({ code: "custom", path: ["authorityKind"], message: "available catalog requires a management authority mode" });
    }
    const fullyReady = value.catalogAvailable && value.mutationAvailable && value.revealAvailable;
    if (fullyReady === (value.reasonCode !== undefined)) {
      context.addIssue({ code: "custom", path: ["reasonCode"], message: "reasonCode is required exactly when the management graph is not fully ready" });
    }
  });

export const ListPersonalModelsQueryV1Alpha2Schema = QueryMetadataSchema.extend({
  type: z.literal("list_personal_models"),
  cursor: z.string().min(16).max(2_048).optional(),
  limit: z.number().int().min(1).max(100),
}).strict();

export const GetPersonalModelQueryV1Alpha2Schema = QueryMetadataSchema.extend({
  type: z.literal("get_personal_model"),
  personalModelId: DesktopResourceIdSchema,
}).strict();

export const PersonalModelSafeProjectionV1Alpha2Schema =
  z.object({
    contractVersion: ContractVersionSchema,
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
      context.addIssue({ code: "custom", path: ["unavailableReason"], message: "unavailableReason is required exactly when the model is unavailable" });
    }
    if (value.available !== value.permissions.canUse) {
      context.addIssue({ code: "custom", path: ["permissions", "canUse"], message: "canUse must reflect the safe model availability projection" });
    }
  });

export const PersonalModelPageV1Alpha2Schema = z.object({
    contractVersion: ContractVersionSchema,
    queryRevision: z.string().min(1).max(160),
    items: z.array(PersonalModelSafeProjectionV1Alpha2Schema).max(100),
    nextCursor: z.string().min(16).max(2_048).optional(),
  }).strict();

export const PersonalModelTargetV1Alpha2Schema = z.object({
  providerKind: PersonalModelProviderSchema,
  providerProfileRevision: Sha256DigestSchema,
  protocol: PersonalModelProtocolSchema,
  endpoint: z.string().url().min(8).max(2_048),
  providerModelId: SafeTextSchema,
  displayName: SafeTextSchema,
  capabilities: z.array(ModelCapabilitySchema).max(16),
}).strict();

export const CreatePersonalModelCommandV1Alpha2Schema = CommandMetadataSchema.extend({
  type: z.literal("create_personal_model"),
  target: PersonalModelTargetV1Alpha2Schema,
}).strict();

export const UpdatePersonalModelCommandV1Alpha2Schema = CommandMetadataSchema.extend({
  type: z.literal("update_personal_model"),
  personalModelId: DesktopResourceIdSchema,
  expectedConfigurationRevision: Sha256DigestSchema,
  expectedExecutionDefinitionDigest: Sha256DigestSchema,
  target: PersonalModelTargetV1Alpha2Schema,
  credentialMutation: z.enum(["reuse_existing", "replace_secret"]),
}).strict();

export const DeletePersonalModelCommandV1Alpha2Schema = CommandMetadataSchema.extend({
  type: z.literal("delete_personal_model"),
  personalModelId: DesktopResourceIdSchema,
  expectedConfigurationRevision: Sha256DigestSchema,
  expectedExecutionDefinitionDigest: Sha256DigestSchema,
}).strict();

export const RevealPersonalModelKeyCommandV1Alpha2Schema = CommandMetadataSchema.extend({
  type: z.literal("reveal_personal_model_key"),
  personalModelId: DesktopResourceIdSchema,
  expectedConfigurationRevision: Sha256DigestSchema,
  expectedExecutionDefinitionDigest: Sha256DigestSchema,
}).strict();

export const QueryPersonalModelOperationV1Alpha2Schema = QueryMetadataSchema.extend({
  type: z.literal("query_personal_model_operation"),
  commandId: EntityIdSchema,
}).strict();

export const PersonalModelOperationReceiptV1Alpha2Schema = z.object({
  contractVersion: ContractVersionSchema,
  commandId: EntityIdSchema,
  commandType: z.enum(["create", "update", "delete", "reveal"]),
  personalModelId: DesktopResourceIdSchema,
  state: z.enum(["prepared", "committed", "cleanup_pending", "manual_attention"]),
  replayed: z.boolean(),
  committedConfigurationRevision: Sha256DigestSchema.optional(),
  receiptIdentity: Sha256DigestSchema.optional(),
}).strict();

export const PersonalModelPreparedTransportV1Alpha2Schema = z.object({
  schemaVersion: z.literal("personal-model-transport-preparation.v1alpha2"),
  commandId: EntityIdSchema,
  commandType: z.enum(["create", "update", "reveal"]),
  personalModelId: DesktopResourceIdSchema,
  expectedConfigurationRevision: Sha256DigestSchema,
  expectedExecutionDefinitionDigest: Sha256DigestSchema.optional(),
  requestDigest: Sha256DigestSchema,
  deadlineAt: DeadlineSchema,
  transportMode: z.literal("strm_message_port"),
}).strict().superRefine((value, context) => {
  if ((value.commandType === "reveal")
    !== (value.expectedExecutionDefinitionDigest !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "prepared transport execution identity is invalid",
    });
  }
});

export const PersonalModelCommandPreparationV1Alpha2Schema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("transport_prepared"),
    receipt: PersonalModelOperationReceiptV1Alpha2Schema,
    transport: PersonalModelPreparedTransportV1Alpha2Schema,
  }).strict(),
  z.object({
    state: z.literal("completed"),
    receipt: PersonalModelOperationReceiptV1Alpha2Schema,
  }).strict(),
]);

export const RevealedPersonalModelKeyV1Alpha2Schema = z.object({
  contractVersion: ContractVersionSchema,
  commandId: EntityIdSchema,
  personalModelId: DesktopResourceIdSchema,
  secret: z.instanceof(Uint8Array).refine((value) => value.byteLength > 0 && value.byteLength <= 16_384),
}).strict();

export const PersonalModelManagementErrorCodeV1Alpha2Schema = z.enum([
  "personal_model.contract_invalid", "personal_model.feature_unavailable",
  "personal_model.runtime_changed", "personal_model.permission_denied",
  "personal_model.not_found", "personal_model.revision_conflict",
  "personal_model.cursor_stale", "personal_model.credential_required",
  "personal_model.credential_store_unavailable", "personal_model.transport_unavailable",
  "personal_model.operation_in_progress", "personal_model.in_use",
  "personal_model.usage_unknown", "personal_model.rate_limited",
  "personal_model.operation_uncertain", "personal_model.manual_attention",
  "personal_model.cleanup_pending", "personal_model.reveal_expired",
  "personal_model.internal",
]);

export const PersonalModelManagementErrorEnvelopeV1Alpha2Schema = z.object({
  contractVersion: ContractVersionSchema,
  code: PersonalModelManagementErrorCodeV1Alpha2Schema,
  category: z.enum(["validation", "authorization", "availability", "compatibility", "conflict", "uncertain", "internal"]),
  safeSummary: z.string().min(1).max(512),
  retryable: z.boolean(),
  correlationId: EntityIdSchema,
  receiptIdentity: Sha256DigestSchema.optional(),
}).strict();

export type PersonalModelManagementCompatibilityQueryV1Alpha2 = z.infer<typeof PersonalModelManagementCompatibilityQueryV1Alpha2Schema>;
export type PersonalModelManagementCompatibilityProjectionV1Alpha2 = z.infer<typeof PersonalModelManagementCompatibilityProjectionV1Alpha2Schema>;
export type ListPersonalModelsQueryV1Alpha2 = z.infer<typeof ListPersonalModelsQueryV1Alpha2Schema>;
export type GetPersonalModelQueryV1Alpha2 = z.infer<typeof GetPersonalModelQueryV1Alpha2Schema>;
export type PersonalModelSafeProjectionV1Alpha2 = z.infer<typeof PersonalModelSafeProjectionV1Alpha2Schema>;
export type PersonalModelPageV1Alpha2 = z.infer<typeof PersonalModelPageV1Alpha2Schema>;
export type CreatePersonalModelCommandV1Alpha2 = z.infer<typeof CreatePersonalModelCommandV1Alpha2Schema>;
export type UpdatePersonalModelCommandV1Alpha2 = z.infer<typeof UpdatePersonalModelCommandV1Alpha2Schema>;
export type DeletePersonalModelCommandV1Alpha2 = z.infer<typeof DeletePersonalModelCommandV1Alpha2Schema>;
export type RevealPersonalModelKeyCommandV1Alpha2 = z.infer<typeof RevealPersonalModelKeyCommandV1Alpha2Schema>;
export type QueryPersonalModelOperationV1Alpha2 = z.infer<typeof QueryPersonalModelOperationV1Alpha2Schema>;
export type PersonalModelOperationReceiptV1Alpha2 = z.infer<typeof PersonalModelOperationReceiptV1Alpha2Schema>;
export type PersonalModelCommandPreparationV1Alpha2 = z.infer<typeof PersonalModelCommandPreparationV1Alpha2Schema>;
export type RevealedPersonalModelKeyV1Alpha2 = z.infer<typeof RevealedPersonalModelKeyV1Alpha2Schema>;
export type PersonalModelManagementErrorEnvelopeV1Alpha2 = z.infer<typeof PersonalModelManagementErrorEnvelopeV1Alpha2Schema>;
