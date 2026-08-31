import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { TimestampSchema } from "../../common/time.js";
import { Sha256DigestSchema } from "../../persistence/common.js";

import { PreviewReasoningModeQuerySchema, ReasoningModePreviewSchema,
  GetReasoningModePreferenceQuerySchema } from
  "../v1alpha3/reasoning-mode.js";

export const PreviewReasoningModeQueryV1Alpha5Schema =
  PreviewReasoningModeQuerySchema.extend({ contractVersion: z.literal("v1alpha5") }).strict();
export const ReasoningModePreviewV1Alpha5Schema = ReasoningModePreviewSchema;
export const GetReasoningModePreferenceQueryV1Alpha5Schema =
  GetReasoningModePreferenceQuerySchema.extend({ contractVersion: z.literal("v1alpha5") }).strict();
export const UpdateReasoningModePreferenceCommandV1Alpha5Schema =
  z.object({
    contractVersion: z.literal("v1alpha5"),
    commandId: EntityIdSchema,
    correlationId: EntityIdSchema,
    clientInstanceId: EntityIdSchema,
    type: z.literal("update_reasoning_mode_preference"),
    expectedPreferenceRevision: z.number().int().nonnegative(),
    requestedMode: z.enum(["default", "max"]),
  }).strict();
export const ReasoningModePreferenceReceiptV1Alpha5Schema =
  z.object({
    contractVersion: z.literal("v1alpha5"),
    commandId: EntityIdSchema,
    requestDigest: Sha256DigestSchema,
    expectedPreferenceRevision: z.number().int().nonnegative(),
    committedPreferenceRevision: z.number().int().positive(),
    requestedMode: z.enum(["default", "max"]),
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

export const ReasoningModePreferenceProjectionV1Alpha5Schema = z.object({
  contractVersion: z.literal("v1alpha5"),
  requestedMode: z.enum(["default", "max"]),
  preferenceRevision: z.number().int().nonnegative().optional(),
  preferencePersistence: z.enum(["available", "unavailable"]),
  testIdentityUsed: z.boolean(),
  productionIdentityReady: z.boolean(),
}).strict().superRefine((value, context) => {
  const available = value.preferencePersistence === "available";
  if (available !== (value.preferenceRevision !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["preferenceRevision"],
      message: "available preference persistence requires an exact revision",
    });
  }
  if (!available && value.requestedMode !== "default") {
    context.addIssue({
      code: "custom",
      path: ["requestedMode"],
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

export type PreviewReasoningModeQueryV1Alpha5 = z.infer<
  typeof PreviewReasoningModeQueryV1Alpha5Schema
>;
export type ReasoningModePreviewV1Alpha5 = z.infer<
  typeof ReasoningModePreviewV1Alpha5Schema
>;
export type GetReasoningModePreferenceQueryV1Alpha5 = z.infer<
  typeof GetReasoningModePreferenceQueryV1Alpha5Schema
>;
export type UpdateReasoningModePreferenceCommandV1Alpha5 = z.infer<
  typeof UpdateReasoningModePreferenceCommandV1Alpha5Schema
>;
export type ReasoningModePreferenceReceiptV1Alpha5 = z.infer<
  typeof ReasoningModePreferenceReceiptV1Alpha5Schema
>;
export type ReasoningModePreferenceProjectionV1Alpha5 = z.infer<
  typeof ReasoningModePreferenceProjectionV1Alpha5Schema
>;
