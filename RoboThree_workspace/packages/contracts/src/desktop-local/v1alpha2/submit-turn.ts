import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import {
  DesktopResourceIdSchema,
  DesktopRevisionRefSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "../v1alpha1/common.js";
import { DesktopCommandMetadataV1Alpha2Schema } from "./common.js";

export const TASK_AUTHORIZATION_SCHEMA_VERSION = "v1alpha1" as const;
export const TaskAuthorizationSchemaVersionSchema = z.literal(
  TASK_AUTHORIZATION_SCHEMA_VERSION,
);

export const TaskAuthorizationModeSchema = z.enum([
  "manual_review",
  "smart_confirm",
  "task_scoped",
]);

export const TaskAuthorizationSelectionSourceSchema = z.enum([
  "user_selected",
  "legacy_default",
]);

export const AuthorizationPreferenceV1Alpha2Schema = z.object({
  schemaVersion: TaskAuthorizationSchemaVersionSchema,
  requestedMode: TaskAuthorizationModeSchema,
}).strict();

export const ResolvedTaskAuthorizationV1Alpha2Schema = z.object({
  requestedMode: TaskAuthorizationModeSchema,
  resolvedMode: TaskAuthorizationModeSchema,
  policyRevision: Sha256DigestSchema,
  source: TaskAuthorizationSelectionSourceSchema,
  authorizationSelectionDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.requestedMode !== value.resolvedMode) {
    context.addIssue({
      code: "custom",
      path: ["resolvedMode"],
      message: "DFI-2A does not allow silent authorization mode downgrade",
    });
  }
});

export const TaskSelectionRequestV1Alpha2Schema = z.object({
  agentId: DesktopResourceIdSchema,
  requestedModelId: DesktopResourceIdSchema.optional(),
  selectedSkillIds: z.array(DesktopResourceIdSchema).max(64),
  selectedKnowledgeIds: z.array(DesktopResourceIdSchema).max(64),
  workspaceGrantId: DesktopResourceIdSchema.optional(),
  authorizationPreference: AuthorizationPreferenceV1Alpha2Schema,
}).strict();

export const SubmitTurnCommandV1Alpha2Schema =
  DesktopCommandMetadataV1Alpha2Schema.extend({
    type: z.literal("submit_turn"),
    clientTurnId: z.string().min(8).max(160),
    sessionId: DesktopResourceIdSchema,
    userInput: z.string().min(1).max(128 * 1024),
    selectionRequest: TaskSelectionRequestV1Alpha2Schema,
  }).strict();

export const RuntimeSelectionSummaryV1Alpha2Schema = z.object({
  runtimeSelectionId: DesktopResourceIdSchema,
  digest: Sha256DigestSchema,
  agent: DesktopRevisionRefSchema,
  defaultModelId: DesktopResourceIdSchema,
  requestedModelId: DesktopResourceIdSchema.optional(),
  resolvedModel: DesktopRevisionRefSchema,
  activeSkills: z.array(DesktopRevisionRefSchema).max(64),
  allowedTools: z.array(DesktopRevisionRefSchema).max(128),
  knowledge: z.array(DesktopRevisionRefSchema).max(64),
  workspaceGrantId: DesktopResourceIdSchema.optional(),
  enterpriseConfigRevision: Sha256DigestSchema.optional(),
  resolvedAuthorization: ResolvedTaskAuthorizationV1Alpha2Schema,
  executionSelectionDigest: Sha256DigestSchema,
}).strict();

export const SubmitTurnReceiptV1Alpha2Schema = z.object({
  contractVersion: z.literal("v1alpha2"),
  submitTurnCommandId: z.string().uuid(),
  clientTurnId: z.string().min(8).max(160),
  userMessageId: DesktopResourceIdSchema,
  taskId: DesktopResourceIdSchema,
  runtimeSelectionId: DesktopResourceIdSchema,
  status: z.enum(["accepted", "replayed", "rejected"]),
  runtimeSelectionSummary: RuntimeSelectionSummaryV1Alpha2Schema.optional(),
  acceptedAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  if (
    value.status !== "rejected"
    && value.runtimeSelectionSummary === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "accepted/replayed receipts require runtimeSelectionSummary",
      path: ["runtimeSelectionSummary"],
    });
  }
});

export const SubmitTurnStatusQueryV1Alpha2Schema = z.object({
  contractVersion: z.literal("v1alpha2"),
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
  type: z.literal("submit_turn_status"),
  submitTurnCommandId: EntityIdSchema,
}).strict();

const TaskAuthorizationSelectionFields = {
  schemaVersion: TaskAuthorizationSchemaVersionSchema,
  taskId: EntityIdSchema,
  runtimeSelectionId: EntityIdSchema,
  requestedMode: TaskAuthorizationModeSchema,
  resolvedMode: TaskAuthorizationModeSchema,
  policyRevision: Sha256DigestSchema,
  source: TaskAuthorizationSelectionSourceSchema,
  createdAt: TimestampSchema,
};

export const TaskAuthorizationSelectionMaterialSchema = z.object(
  TaskAuthorizationSelectionFields,
).strict();

export const TaskAuthorizationSelectionSchema = z.object({
  ...TaskAuthorizationSelectionFields,
  authorizationSelectionDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.requestedMode !== value.resolvedMode) {
    context.addIssue({
      code: "custom",
      path: ["resolvedMode"],
      message: "DFI-2A does not allow silent authorization mode downgrade",
    });
  }
});

const TaskExecutionSelectionIdentityFields = {
  schemaVersion: TaskAuthorizationSchemaVersionSchema,
  taskId: EntityIdSchema,
  runtimeSelectionId: EntityIdSchema,
  runtimeSelectionDigest: Sha256DigestSchema,
  authorizationSelectionDigest: Sha256DigestSchema,
};

export const TaskExecutionSelectionIdentityMaterialSchema = z.object(
  TaskExecutionSelectionIdentityFields,
).strict();

export const TaskExecutionSelectionIdentitySchema = z.object({
  ...TaskExecutionSelectionIdentityFields,
  executionSelectionDigest: Sha256DigestSchema,
}).strict();

export type TaskAuthorizationMode = z.infer<
  typeof TaskAuthorizationModeSchema
>;
export type TaskAuthorizationSelectionSource = z.infer<
  typeof TaskAuthorizationSelectionSourceSchema
>;
export type AuthorizationPreferenceV1Alpha2 = z.infer<
  typeof AuthorizationPreferenceV1Alpha2Schema
>;
export type ResolvedTaskAuthorizationV1Alpha2 = z.infer<
  typeof ResolvedTaskAuthorizationV1Alpha2Schema
>;
export type TaskSelectionRequestV1Alpha2 = z.infer<
  typeof TaskSelectionRequestV1Alpha2Schema
>;
export type SubmitTurnCommandV1Alpha2 = z.infer<
  typeof SubmitTurnCommandV1Alpha2Schema
>;
export type RuntimeSelectionSummaryV1Alpha2 = z.infer<
  typeof RuntimeSelectionSummaryV1Alpha2Schema
>;
export type SubmitTurnReceiptV1Alpha2 = z.infer<
  typeof SubmitTurnReceiptV1Alpha2Schema
>;
export type SubmitTurnStatusQueryV1Alpha2 = z.infer<
  typeof SubmitTurnStatusQueryV1Alpha2Schema
>;
export type TaskAuthorizationSelectionMaterial = z.infer<
  typeof TaskAuthorizationSelectionMaterialSchema
>;
export type TaskAuthorizationSelection = z.infer<
  typeof TaskAuthorizationSelectionSchema
>;
export type TaskExecutionSelectionIdentityMaterial = z.infer<
  typeof TaskExecutionSelectionIdentityMaterialSchema
>;
export type TaskExecutionSelectionIdentity = z.infer<
  typeof TaskExecutionSelectionIdentitySchema
>;
