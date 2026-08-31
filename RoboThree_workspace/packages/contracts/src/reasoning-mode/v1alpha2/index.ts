import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { TimestampSchema } from "../../common/time.js";
import { Sha256DigestSchema } from "../../persistence/common.js";
import {
  ReasoningModeLockModelRefSchema,
  ReasoningModeLockProfileRefSchema,
  ReasoningModeLockStrategyRefSchema,
} from "../lock.js";
import { ReasoningSupportStateSchema } from "../support-state.js";

export const REASONING_MODE_LOCK_SCHEMA_VERSION_V1ALPHA2 = "v1alpha2" as const;

const CommonFields = {
  schemaVersion: z.literal(REASONING_MODE_LOCK_SCHEMA_VERSION_V1ALPHA2),
  reasoningModeLockId: EntityIdSchema,
  taskId: EntityIdSchema,
  modelLockRef: ReasoningModeLockModelRefSchema,
  lockedAt: TimestampSchema,
};

export const ReasoningResolutionEvidenceRefV1Alpha2Schema = z.object({
  resolutionEvidenceRevision: Sha256DigestSchema,
  resolutionEvidenceDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.resolutionEvidenceRevision !== value.resolutionEvidenceDigest) {
    context.addIssue({
      code: "custom",
      message: "reasoning resolution evidence revision and digest must match",
    });
  }
});

const SupportedObservationFields = {
  observedMaxSupport: z.literal("supported"),
  observedMaxSupportRevision: Sha256DigestSchema,
};

export const DefaultPassthroughReasoningModeLockMaterialV1Alpha2Schema = z.object({
  ...CommonFields,
  requestedMode: z.literal("default"),
  resolution: z.literal("default_passthrough"),
}).strict();

export const MaxAppliedReasoningModeLockMaterialV1Alpha2Schema = z.object({
  ...CommonFields,
  requestedMode: z.literal("max"),
  ...SupportedObservationFields,
  resolution: z.literal("max_applied"),
  profileRef: ReasoningModeLockProfileRefSchema,
  strategyRef: ReasoningModeLockStrategyRefSchema,
}).strict();

export const MaxUnsupportedDefaultReasoningModeLockMaterialV1Alpha2Schema = z.object({
  ...CommonFields,
  requestedMode: z.literal("max"),
  observedMaxSupport: z.literal("unsupported"),
  observedMaxSupportRevision: Sha256DigestSchema,
  resolution: z.literal("max_unsupported_default"),
}).strict();

export const MaxUnknownDefaultReasoningModeLockMaterialV1Alpha2Schema = z.object({
  ...CommonFields,
  requestedMode: z.literal("max"),
  observedMaxSupport: z.literal("unknown"),
  observedMaxSupportRevision: Sha256DigestSchema,
  resolution: z.literal("max_capability_unknown_default"),
}).strict();

export const MaxSupportChangedDefaultReasoningModeLockMaterialV1Alpha2Schema = z.object({
  ...CommonFields,
  requestedMode: z.literal("max"),
  ...SupportedObservationFields,
  resolution: z.literal("max_support_changed_default"),
  resolvedMaxSupport: ReasoningSupportStateSchema,
  resolvedMaxSupportRevision: Sha256DigestSchema,
  ...ReasoningResolutionEvidenceRefV1Alpha2Schema.shape,
}).strict();

export const MaxMappingUnavailableDefaultReasoningModeLockMaterialV1Alpha2Schema = z.object({
  ...CommonFields,
  requestedMode: z.literal("max"),
  ...SupportedObservationFields,
  resolution: z.literal("max_mapping_unavailable_default"),
  ...ReasoningResolutionEvidenceRefV1Alpha2Schema.shape,
}).strict();

export const ReasoningModeLockMaterialV1Alpha2Schema = z.discriminatedUnion(
  "resolution",
  [
    DefaultPassthroughReasoningModeLockMaterialV1Alpha2Schema,
    MaxAppliedReasoningModeLockMaterialV1Alpha2Schema,
    MaxUnsupportedDefaultReasoningModeLockMaterialV1Alpha2Schema,
    MaxUnknownDefaultReasoningModeLockMaterialV1Alpha2Schema,
    MaxSupportChangedDefaultReasoningModeLockMaterialV1Alpha2Schema,
    MaxMappingUnavailableDefaultReasoningModeLockMaterialV1Alpha2Schema,
  ],
).superRefine(validateResolutionEvidencePair);

const withDigest = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.extend({ reasoningModeLockDigest: Sha256DigestSchema }).strict();

export const DefaultPassthroughReasoningModeLockV1Alpha2Schema =
  withDigest(DefaultPassthroughReasoningModeLockMaterialV1Alpha2Schema);
export const MaxAppliedReasoningModeLockV1Alpha2Schema =
  withDigest(MaxAppliedReasoningModeLockMaterialV1Alpha2Schema);
export const MaxUnsupportedDefaultReasoningModeLockV1Alpha2Schema =
  withDigest(MaxUnsupportedDefaultReasoningModeLockMaterialV1Alpha2Schema);
export const MaxUnknownDefaultReasoningModeLockV1Alpha2Schema =
  withDigest(MaxUnknownDefaultReasoningModeLockMaterialV1Alpha2Schema);
export const MaxSupportChangedDefaultReasoningModeLockV1Alpha2Schema =
  withDigest(MaxSupportChangedDefaultReasoningModeLockMaterialV1Alpha2Schema);
export const MaxMappingUnavailableDefaultReasoningModeLockV1Alpha2Schema =
  withDigest(MaxMappingUnavailableDefaultReasoningModeLockMaterialV1Alpha2Schema);

export const ReasoningModeLockV1Alpha2Schema = z.discriminatedUnion("resolution", [
  DefaultPassthroughReasoningModeLockV1Alpha2Schema,
  MaxAppliedReasoningModeLockV1Alpha2Schema,
  MaxUnsupportedDefaultReasoningModeLockV1Alpha2Schema,
  MaxUnknownDefaultReasoningModeLockV1Alpha2Schema,
  MaxSupportChangedDefaultReasoningModeLockV1Alpha2Schema,
  MaxMappingUnavailableDefaultReasoningModeLockV1Alpha2Schema,
]).superRefine(validateResolutionEvidencePair);

function validateResolutionEvidencePair(
  value: z.infer<typeof ReasoningModeLockMaterialV1Alpha2Schema.options[number]>,
  context: z.RefinementCtx,
): void {
  if ("resolutionEvidenceRevision" in value
    && value.resolutionEvidenceRevision !== value.resolutionEvidenceDigest) {
    context.addIssue({
      code: "custom",
      path: ["resolutionEvidenceDigest"],
      message: "reasoning resolution evidence revision and digest must match",
    });
  }
}

export type ReasoningModeLockMaterialV1Alpha2 = z.infer<
  typeof ReasoningModeLockMaterialV1Alpha2Schema
>;
export type ReasoningModeLockV1Alpha2 = z.infer<typeof ReasoningModeLockV1Alpha2Schema>;
export type ReasoningResolutionEvidenceRefV1Alpha2 = z.infer<
  typeof ReasoningResolutionEvidenceRefV1Alpha2Schema
>;
