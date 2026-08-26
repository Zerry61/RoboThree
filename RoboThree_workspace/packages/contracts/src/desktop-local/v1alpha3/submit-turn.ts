import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { Sha256DigestSchema } from "../../persistence/common.js";
import {
  DesktopResourceIdSchema,
  TimestampSchema,
} from "../v1alpha1/common.js";
import {
  AuthorizationPreferenceV1Alpha2Schema,
  RuntimeSelectionSummaryV1Alpha2Schema,
  TaskSelectionRequestV1Alpha2Schema,
} from "../v1alpha2/submit-turn.js";
import { DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA3 } from "./reasoning-mode.js";

export const SubmitTurnReasoningPreferenceV1Alpha3Schema = z.discriminatedUnion(
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

export const TaskSelectionRequestV1Alpha3Schema = z.object({
  ...TaskSelectionRequestV1Alpha2Schema.shape,
  authorizationPreference: AuthorizationPreferenceV1Alpha2Schema,
  reasoningPreference: SubmitTurnReasoningPreferenceV1Alpha3Schema,
}).strict();

export const SubmitTurnCommandV1Alpha3Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA3),
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
  type: z.literal("submit_turn"),
  clientTurnId: z.string().min(8).max(160),
  sessionId: DesktopResourceIdSchema,
  userInput: z.string().min(1).max(128 * 1024),
  selectionRequest: TaskSelectionRequestV1Alpha3Schema,
}).strict();

export const SubmitTurnReasoningSummaryV1Alpha3Schema = z.object({
  requestedMode: z.enum(["default", "max"]),
  resolvedMode: z.enum(["model_default", "max"]),
  resolutionReason: z.enum([
    "requested_default",
    "applied",
    "unsupported",
    "capability_unknown",
  ]),
  reasoningModeLockId: EntityIdSchema,
  reasoningModeLockDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  const expected = value.requestedMode === "default"
    ? ["model_default", "requested_default"]
    : value.resolutionReason === "applied"
      ? ["max", "applied"]
      : value.resolutionReason === "unsupported"
        ? ["model_default", "unsupported"]
        : ["model_default", "capability_unknown"];
  if (value.resolvedMode !== expected[0] || value.resolutionReason !== expected[1]) {
    context.addIssue({
      code: "custom",
      message: "reasoning summary mode and safe resolution reason must agree",
    });
  }
});

export const RuntimeSelectionSummaryV1Alpha3Schema = z.object({
  ...RuntimeSelectionSummaryV1Alpha2Schema.shape,
  reasoning: SubmitTurnReasoningSummaryV1Alpha3Schema,
}).strict();

export const SubmitTurnReceiptV1Alpha3Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA3),
  submitTurnCommandId: EntityIdSchema,
  clientTurnId: z.string().min(8).max(160),
  userMessageId: DesktopResourceIdSchema,
  taskId: DesktopResourceIdSchema,
  runtimeSelectionId: DesktopResourceIdSchema,
  status: z.enum(["accepted", "replayed", "rejected"]),
  runtimeSelectionSummary: RuntimeSelectionSummaryV1Alpha3Schema.optional(),
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

export const SubmitTurnStatusQueryV1Alpha3Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA3),
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
  type: z.literal("submit_turn_status"),
  submitTurnCommandId: EntityIdSchema,
}).strict();

export const ReasoningSubmitTurnErrorCodeV1Alpha3Schema = z.enum([
  "reasoning_selection_stale",
  "reasoning_profile_unavailable",
  "reasoning_lock_integrity_invalid",
  "reasoning_protocol_unavailable",
]);

export type SubmitTurnReasoningPreferenceV1Alpha3 = z.infer<
  typeof SubmitTurnReasoningPreferenceV1Alpha3Schema
>;
export type TaskSelectionRequestV1Alpha3 = z.infer<
  typeof TaskSelectionRequestV1Alpha3Schema
>;
export type SubmitTurnCommandV1Alpha3 = z.infer<typeof SubmitTurnCommandV1Alpha3Schema>;
export type SubmitTurnReasoningSummaryV1Alpha3 = z.infer<
  typeof SubmitTurnReasoningSummaryV1Alpha3Schema
>;
export type RuntimeSelectionSummaryV1Alpha3 = z.infer<
  typeof RuntimeSelectionSummaryV1Alpha3Schema
>;
export type SubmitTurnReceiptV1Alpha3 = z.infer<typeof SubmitTurnReceiptV1Alpha3Schema>;
export type SubmitTurnStatusQueryV1Alpha3 = z.infer<
  typeof SubmitTurnStatusQueryV1Alpha3Schema
>;
export type ReasoningSubmitTurnErrorCodeV1Alpha3 = z.infer<
  typeof ReasoningSubmitTurnErrorCodeV1Alpha3Schema
>;
