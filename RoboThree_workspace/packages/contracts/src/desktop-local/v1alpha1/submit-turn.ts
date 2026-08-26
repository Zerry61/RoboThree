import { z } from "zod";

import {
  DesktopCommandMetadataSchema,
  DesktopResourceIdSchema,
  DesktopRevisionRefSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "./common.js";

export const TaskSelectionRequestSchema = z.object({
  agentId: DesktopResourceIdSchema,
  requestedModelId: DesktopResourceIdSchema.optional(),
  selectedSkillIds: z.array(DesktopResourceIdSchema).max(64),
  selectedKnowledgeIds: z.array(DesktopResourceIdSchema).max(64),
  workspaceGrantId: DesktopResourceIdSchema.optional(),
}).strict();

export const SubmitTurnCommandSchema = DesktopCommandMetadataSchema.extend({
  type: z.literal("submit_turn"),
  clientTurnId: z.string().min(8).max(160),
  sessionId: DesktopResourceIdSchema,
  userInput: z.string().min(1).max(128 * 1024),
  selectionRequest: TaskSelectionRequestSchema,
}).strict();

export const RuntimeSelectionSummarySchema = z.object({
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
}).strict();

export const SubmitTurnReceiptSchema = z.object({
  submitTurnCommandId: z.string().uuid(),
  clientTurnId: z.string().min(8).max(160),
  userMessageId: DesktopResourceIdSchema,
  taskId: DesktopResourceIdSchema,
  runtimeSelectionId: DesktopResourceIdSchema,
  status: z.enum(["accepted", "replayed", "rejected"]),
  runtimeSelectionSummary: RuntimeSelectionSummarySchema.optional(),
  acceptedAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  if (
    value.status !== "rejected" &&
    value.runtimeSelectionSummary === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "accepted/replayed receipts require runtimeSelectionSummary",
      path: ["runtimeSelectionSummary"],
    });
  }
});

export type TaskSelectionRequest = z.infer<
  typeof TaskSelectionRequestSchema
>;
export type SubmitTurnCommand = z.infer<typeof SubmitTurnCommandSchema>;
export type RuntimeSelectionSummary = z.infer<
  typeof RuntimeSelectionSummarySchema
>;
export type SubmitTurnReceipt = z.infer<typeof SubmitTurnReceiptSchema>;
