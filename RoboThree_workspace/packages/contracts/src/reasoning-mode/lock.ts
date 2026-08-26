import { z } from "zod";

import { EntityIdSchema, NamespacedResourceIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { Sha256DigestSchema } from "../persistence/common.js";

export const REASONING_MODE_LOCK_SCHEMA_VERSION = "v1alpha1" as const;
export const ReasoningModeLockSchemaVersionSchema = z.literal(
  REASONING_MODE_LOCK_SCHEMA_VERSION,
);

export const ReasoningModeLockModelRefSchema = z.object({
  lockId: EntityIdSchema,
  lockDigest: Sha256DigestSchema,
}).strict();

export const ReasoningModeLockProfileRefSchema = z.object({
  profileId: NamespacedResourceIdSchema,
  profileRevision: Sha256DigestSchema,
  profileDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.profileRevision !== value.profileDigest) {
    context.addIssue({
      code: "custom",
      path: ["profileRevision"],
      message: "Reasoning Profile revision and digest must identify the same immutable material",
    });
  }
});

export const ReasoningModeLockStrategyRefSchema = z.object({
  strategyId: NamespacedResourceIdSchema,
  strategyRevision: Sha256DigestSchema,
  strategyDigest: Sha256DigestSchema,
  timeoutPolicyRef: NamespacedResourceIdSchema,
}).strict();

const CommonReasoningModeLockFields = {
  schemaVersion: ReasoningModeLockSchemaVersionSchema,
  reasoningModeLockId: EntityIdSchema,
  taskId: EntityIdSchema,
  modelLockRef: ReasoningModeLockModelRefSchema,
  lockedAt: TimestampSchema,
};

export const DefaultPassthroughReasoningModeLockMaterialSchema = z.object({
  ...CommonReasoningModeLockFields,
  requestedMode: z.literal("default"),
  resolution: z.literal("default_passthrough"),
}).strict();

export const MaxAppliedReasoningModeLockMaterialSchema = z.object({
  ...CommonReasoningModeLockFields,
  requestedMode: z.literal("max"),
  observedMaxSupport: z.literal("supported"),
  observedMaxSupportRevision: Sha256DigestSchema,
  resolution: z.literal("max_applied"),
  profileRef: ReasoningModeLockProfileRefSchema,
  strategyRef: ReasoningModeLockStrategyRefSchema,
}).strict();

export const MaxUnsupportedDefaultReasoningModeLockMaterialSchema = z.object({
  ...CommonReasoningModeLockFields,
  requestedMode: z.literal("max"),
  observedMaxSupport: z.literal("unsupported"),
  observedMaxSupportRevision: Sha256DigestSchema,
  resolution: z.literal("max_unsupported_default"),
}).strict();

export const MaxUnknownDefaultReasoningModeLockMaterialSchema = z.object({
  ...CommonReasoningModeLockFields,
  requestedMode: z.literal("max"),
  observedMaxSupport: z.literal("unknown"),
  observedMaxSupportRevision: Sha256DigestSchema,
  resolution: z.literal("max_capability_unknown_default"),
}).strict();

export const ReasoningModeLockMaterialSchema = z.discriminatedUnion("resolution", [
  DefaultPassthroughReasoningModeLockMaterialSchema,
  MaxAppliedReasoningModeLockMaterialSchema,
  MaxUnsupportedDefaultReasoningModeLockMaterialSchema,
  MaxUnknownDefaultReasoningModeLockMaterialSchema,
]);

export const DefaultPassthroughReasoningModeLockSchema =
  DefaultPassthroughReasoningModeLockMaterialSchema.safeExtend({
    reasoningModeLockDigest: Sha256DigestSchema,
  }).strict();

export const MaxAppliedReasoningModeLockSchema =
  MaxAppliedReasoningModeLockMaterialSchema.safeExtend({
    reasoningModeLockDigest: Sha256DigestSchema,
  }).strict();

export const MaxUnsupportedDefaultReasoningModeLockSchema =
  MaxUnsupportedDefaultReasoningModeLockMaterialSchema.safeExtend({
    reasoningModeLockDigest: Sha256DigestSchema,
  }).strict();

export const MaxUnknownDefaultReasoningModeLockSchema =
  MaxUnknownDefaultReasoningModeLockMaterialSchema.safeExtend({
    reasoningModeLockDigest: Sha256DigestSchema,
  }).strict();

export const ReasoningModeLockSchema = z.discriminatedUnion("resolution", [
  DefaultPassthroughReasoningModeLockSchema,
  MaxAppliedReasoningModeLockSchema,
  MaxUnsupportedDefaultReasoningModeLockSchema,
  MaxUnknownDefaultReasoningModeLockSchema,
]);

export type ReasoningModeLockModelRef = z.infer<typeof ReasoningModeLockModelRefSchema>;
export type ReasoningModeLockProfileRef = z.infer<typeof ReasoningModeLockProfileRefSchema>;
export type ReasoningModeLockStrategyRef = z.infer<typeof ReasoningModeLockStrategyRefSchema>;
export type ReasoningModeLockMaterial = z.infer<typeof ReasoningModeLockMaterialSchema>;
export type ReasoningModeLock = z.infer<typeof ReasoningModeLockSchema>;
