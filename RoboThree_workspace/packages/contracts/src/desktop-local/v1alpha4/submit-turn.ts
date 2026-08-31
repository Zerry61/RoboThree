import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import {
  DesktopResourceIdSchema,
  DesktopRevisionRefSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "../v1alpha1/common.js";
import {
  AuthorizationPreferenceV1Alpha2Schema,
  ResolvedTaskAuthorizationV1Alpha2Schema,
} from "../v1alpha2/submit-turn.js";
import { DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA4 } from "./control.js";

export const SubmitTurnReasoningPreferenceV1Alpha4Schema = z.object({
  requestedMode: z.literal("default"),
}).strict();

export const TaskSelectionRequestV1Alpha4Schema = z.object({
  agentId: DesktopResourceIdSchema,
  requestedModelId: DesktopResourceIdSchema.optional(),
  selectedSkillIds: z.array(DesktopResourceIdSchema).max(64),
  selectedKnowledgeIds: z.array(DesktopResourceIdSchema).max(64),
  workspaceGrantId: DesktopResourceIdSchema.optional(),
  authorizationPreference: AuthorizationPreferenceV1Alpha2Schema,
  reasoningPreference: SubmitTurnReasoningPreferenceV1Alpha4Schema,
}).strict();

export const SubmitTurnCommandV1Alpha4Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA4),
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
  type: z.literal("submit_turn"),
  clientTurnId: z.string().min(8).max(160),
  sessionId: DesktopResourceIdSchema,
  userInput: z.string().min(1).max(128 * 1024),
  selectionRequest: TaskSelectionRequestV1Alpha4Schema,
}).strict();

export const RuntimeSelectionSummaryV1Alpha4Schema = z.object({
  runtimeSelectionId: DesktopResourceIdSchema,
  digest: Sha256DigestSchema,
  agent: DesktopRevisionRefSchema,
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

export const SubmitTurnReceiptV1Alpha4Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA4),
  submitTurnCommandId: EntityIdSchema,
  clientTurnId: z.string().min(8).max(160),
  userMessageId: DesktopResourceIdSchema,
  taskId: DesktopResourceIdSchema,
  runtimeSelectionId: DesktopResourceIdSchema,
  status: z.enum(["accepted", "replayed", "rejected"]),
  runtimeSelectionSummary: RuntimeSelectionSummaryV1Alpha4Schema.optional(),
  acceptedAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.status !== "rejected" && value.runtimeSelectionSummary === undefined) {
    context.addIssue({
      code: "custom",
      message: "accepted/replayed receipts require runtimeSelectionSummary",
      path: ["runtimeSelectionSummary"],
    });
  }
});

export const SubmitTurnStatusQueryV1Alpha4Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA4),
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
  type: z.literal("submit_turn_status"),
  submitTurnCommandId: EntityIdSchema,
}).strict();

export type SubmitTurnCommandV1Alpha4 = z.infer<typeof SubmitTurnCommandV1Alpha4Schema>;
export type SubmitTurnReceiptV1Alpha4 = z.infer<typeof SubmitTurnReceiptV1Alpha4Schema>;
export type SubmitTurnStatusQueryV1Alpha4 = z.infer<
  typeof SubmitTurnStatusQueryV1Alpha4Schema
>;
export type RuntimeSelectionSummaryV1Alpha4 = z.infer<
  typeof RuntimeSelectionSummaryV1Alpha4Schema
>;
