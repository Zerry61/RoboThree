import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { TimestampSchema } from "../../common/time.js";
import { Sha256DigestSchema } from "../../persistence/common.js";
import { ReasoningSupportStateSchema } from "../../reasoning-mode/support-state.js";
import { DesktopResourceIdSchema } from "../v1alpha1/common.js";

export const DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA3 = "v1alpha3" as const;

export const ReasoningModePreferenceSchema = z.enum(["default", "max"]);

const QueryMetadata = {
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA3),
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
};

const CommandMetadata = {
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA3),
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
  clientInstanceId: EntityIdSchema,
};

export const PreviewReasoningModeQuerySchema = z.object({
  ...QueryMetadata,
  type: z.literal("preview_reasoning_mode"),
  agentId: DesktopResourceIdSchema,
  requestedModelId: DesktopResourceIdSchema.optional(),
}).strict();

export const ReasoningModePreviewSchema = z.object({
  effectiveModelId: DesktopResourceIdSchema,
  effectiveModelRevision: Sha256DigestSchema,
  maxSupport: ReasoningSupportStateSchema,
  maxSupportRevision: Sha256DigestSchema,
  safeUnavailableReason: z.string().min(1).max(4096).optional(),
  preference: ReasoningModePreferenceSchema,
  preferenceRevision: z.number().int().nonnegative().optional(),
  preferencePersistence: z.enum(["available", "unavailable"]),
  testIdentityUsed: z.boolean(),
  productionIdentityReady: z.boolean(),
}).strict().superRefine((value, context) => {
  if ((value.maxSupport === "supported") === (value.safeUnavailableReason !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["safeUnavailableReason"],
      message: "only unavailable Max support requires a safe explanation",
    });
  }
  if ((value.preferencePersistence === "available")
    !== (value.preferenceRevision !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["preferenceRevision"],
      message: "available preference persistence requires an exact revision",
    });
  }
  if (value.preferencePersistence === "unavailable" && value.preference !== "default") {
    context.addIssue({
      code: "custom",
      path: ["preference"],
      message: "unavailable preference persistence must project the default mode",
    });
  }
  if (value.testIdentityUsed && value.productionIdentityReady) {
    context.addIssue({
      code: "custom",
      message: "test identity cannot be projected as production ready",
    });
  }
});

export const GetReasoningModePreferenceQuerySchema = z.object({
  ...QueryMetadata,
  type: z.literal("get_reasoning_mode_preference"),
}).strict();

export const UpdateReasoningModePreferenceCommandSchema = z.object({
  ...CommandMetadata,
  type: z.literal("update_reasoning_mode_preference"),
  expectedPreferenceRevision: z.number().int().nonnegative(),
  requestedMode: ReasoningModePreferenceSchema,
}).strict();

export const ReasoningModePreferenceReceiptSchema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA3),
  commandId: EntityIdSchema,
  requestDigest: Sha256DigestSchema,
  expectedPreferenceRevision: z.number().int().nonnegative(),
  committedPreferenceRevision: z.number().int().positive(),
  requestedMode: ReasoningModePreferenceSchema,
  outcome: z.literal("preference_committed"),
  committedAt: TimestampSchema,
  receiptDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.committedPreferenceRevision !== value.expectedPreferenceRevision + 1) {
    context.addIssue({
      code: "custom",
      path: ["committedPreferenceRevision"],
      message: "preference Receipt revision must advance the expected revision exactly once",
    });
  }
});

export type ReasoningModePreference = z.infer<typeof ReasoningModePreferenceSchema>;
export type PreviewReasoningModeQuery = z.infer<typeof PreviewReasoningModeQuerySchema>;
export type ReasoningModePreview = z.infer<typeof ReasoningModePreviewSchema>;
export type GetReasoningModePreferenceQuery = z.infer<
  typeof GetReasoningModePreferenceQuerySchema
>;
export type UpdateReasoningModePreferenceCommand = z.infer<
  typeof UpdateReasoningModePreferenceCommandSchema
>;
export type ReasoningModePreferenceReceipt = z.infer<
  typeof ReasoningModePreferenceReceiptSchema
>;
