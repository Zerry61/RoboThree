import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { Sha256DigestSchema } from "../../persistence/common.js";
import { DesktopResourceIdSchema, TimestampSchema } from "../v1alpha1/common.js";
import { AuthorizationPreferenceV1Alpha2Schema } from "../v1alpha2/submit-turn.js";
import { RuntimeSelectionSummaryV1Alpha4Schema } from "../v1alpha4/submit-turn.js";
import { DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA5 } from "./control.js";

export const SubmitTurnReasoningPreferenceV1Alpha5Schema = z.discriminatedUnion(
  "requestedMode",
  [
    z.object({ requestedMode: z.literal("default") }).strict(),
    z.object({
      requestedMode: z.literal("max"),
      observedMaxSupport: z.enum(["supported", "unsupported", "unknown"]),
      observedMaxSupportRevision: Sha256DigestSchema,
    }).strict(),
  ],
);

export const TaskSelectionRequestV1Alpha5Schema = z.object({
  agentId: DesktopResourceIdSchema,
  requestedModelId: DesktopResourceIdSchema.optional(),
  selectedSkillIds: z.array(DesktopResourceIdSchema).max(64),
  selectedKnowledgeIds: z.array(DesktopResourceIdSchema).max(64),
  workspaceGrantId: DesktopResourceIdSchema.optional(),
  authorizationPreference: AuthorizationPreferenceV1Alpha2Schema,
  reasoningPreference: SubmitTurnReasoningPreferenceV1Alpha5Schema,
}).strict();

export const SubmitTurnCommandV1Alpha5Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA5),
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
  type: z.literal("submit_turn"),
  clientTurnId: z.string().min(8).max(160),
  sessionId: DesktopResourceIdSchema,
  userInput: z.string().min(1).max(128 * 1024),
  selectionRequest: TaskSelectionRequestV1Alpha5Schema,
}).strict();

export const SubmitTurnReasoningSummaryV1Alpha5Schema = z.object({
  requestedMode: z.enum(["default", "max"]),
  resolvedMode: z.enum(["model_default", "max"]),
  resolutionReason: z.enum([
    "requested_default", "applied", "unsupported", "capability_unknown",
    "support_changed_default", "mapping_unavailable_default",
  ]),
  reasoningModeLockId: EntityIdSchema,
  reasoningModeLockDigest: Sha256DigestSchema,
  reasoningResolutionRevision: Sha256DigestSchema.optional(),
  reasoningResolutionDigest: Sha256DigestSchema.optional(),
}).strict().superRefine((value, context) => {
  const defaultReason = value.resolutionReason === "requested_default";
  const applied = value.resolutionReason === "applied";
  if (
    (value.requestedMode === "default" && !defaultReason)
    || (value.requestedMode === "max" && defaultReason)
    || value.resolvedMode !== (applied ? "max" : "model_default")
  ) {
    context.addIssue({ code: "custom", message: "reasoning summary is inconsistent" });
  }
  const needsEvidence = value.resolutionReason === "support_changed_default"
    || value.resolutionReason === "mapping_unavailable_default";
  if (needsEvidence !== (value.reasoningResolutionRevision !== undefined)
    || needsEvidence !== (value.reasoningResolutionDigest !== undefined)
    || (needsEvidence
      && value.reasoningResolutionRevision !== value.reasoningResolutionDigest)) {
    context.addIssue({ code: "custom", path: ["reasoningResolutionDigest"],
      message: "fallback summaries require exact reasoning resolution evidence" });
  }
});

export const RuntimeSelectionSummaryV1Alpha5Schema = z.object({
  ...RuntimeSelectionSummaryV1Alpha4Schema.shape,
  reasoning: SubmitTurnReasoningSummaryV1Alpha5Schema,
}).strict();

export const SubmitTurnReceiptV1Alpha5Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA5),
  submitTurnCommandId: EntityIdSchema,
  clientTurnId: z.string().min(8).max(160),
  userMessageId: DesktopResourceIdSchema,
  taskId: DesktopResourceIdSchema,
  runtimeSelectionId: DesktopResourceIdSchema,
  status: z.enum(["accepted", "replayed", "rejected"]),
  runtimeSelectionSummary: RuntimeSelectionSummaryV1Alpha5Schema.optional(),
  acceptedAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.status !== "rejected" && value.runtimeSelectionSummary === undefined) {
    context.addIssue({ code: "custom", path: ["runtimeSelectionSummary"],
      message: "accepted/replayed receipts require runtimeSelectionSummary" });
  }
});

export const SubmitTurnStatusQueryV1Alpha5Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA5),
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
  type: z.literal("submit_turn_status"),
  submitTurnCommandId: EntityIdSchema,
}).strict();

export type SubmitTurnReasoningPreferenceV1Alpha5 = z.infer<
  typeof SubmitTurnReasoningPreferenceV1Alpha5Schema
>;
export type SubmitTurnCommandV1Alpha5 = z.infer<typeof SubmitTurnCommandV1Alpha5Schema>;
export type SubmitTurnReceiptV1Alpha5 = z.infer<typeof SubmitTurnReceiptV1Alpha5Schema>;
export type SubmitTurnStatusQueryV1Alpha5 = z.infer<
  typeof SubmitTurnStatusQueryV1Alpha5Schema
>;
