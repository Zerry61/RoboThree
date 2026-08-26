import {
  CapabilityIdSchema,
  EntityIdSchema,
  JsonValueSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "@robothree/contracts";
import { z } from "zod";
import { ReasoningModeLockModelRefSchema } from
  "@robothree/contracts/reasoning-mode/v1alpha1";

import { sha256CanonicalJson } from "./digest.js";

export const COMPACTION_EXECUTION_BINDING_SCHEMA_VERSION = "v1alpha1" as const;
export const COMPACTION_EXECUTION_BINDING_SCHEMA_VERSION_V1ALPHA2 = "v1alpha2" as const;

export const CompactionExecutionBindingMaterialSchema = z.object({
  schemaVersion: z.literal(COMPACTION_EXECUTION_BINDING_SCHEMA_VERSION),
  compactionJobId: EntityIdSchema,
  sessionId: EntityIdSchema,
  taskId: EntityIdSchema,
  runtimeSelectionId: EntityIdSchema,
  runtimeSelectionDigest: Sha256DigestSchema,
  modelLockId: EntityIdSchema,
  modelCapabilityId: CapabilityIdSchema.refine((value) => value.startsWith("model.")),
  modelLockDigest: Sha256DigestSchema,
  registryRevision: Sha256DigestSchema,
  adapterDescriptorId: z.string().trim().min(1).max(256),
  adapterDescriptorRevision: Sha256DigestSchema,
  externalTargetDigest: Sha256DigestSchema,
  summarizerPromptRevision: Sha256DigestSchema,
  createdAt: TimestampSchema,
}).strict();

export const CompactionExecutionBindingSchema = z.object({
  ...CompactionExecutionBindingMaterialSchema.shape,
  bindingDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  const { bindingDigest, ...material } = value;
  if (bindingDigest !== sha256CanonicalJson(JsonValueSchema.parse(material))) {
    context.addIssue({ code: "custom", message: "CompactionExecutionBinding digest mismatch" });
  }
});

export const CompactionExecutionBindingV1Alpha2MaterialSchema = z.object({
  ...CompactionExecutionBindingMaterialSchema.shape,
  schemaVersion: z.literal(COMPACTION_EXECUTION_BINDING_SCHEMA_VERSION_V1ALPHA2),
  reasoningModeLockId: EntityIdSchema,
  reasoningModeLockDigest: Sha256DigestSchema,
  modelRequestProtocolVersion: z.literal("v1alpha2"),
}).strict().superRefine((value, context) => {
  const reference = ReasoningModeLockModelRefSchema.safeParse({
    lockId: value.modelLockId,
    lockDigest: value.modelLockDigest,
  });
  if (!reference.success) {
    context.addIssue({ code: "custom", message: "Compaction binding Model lock reference is invalid" });
  }
});

export const CompactionExecutionBindingV1Alpha2Schema = z.object({
  ...CompactionExecutionBindingV1Alpha2MaterialSchema.shape,
  bindingDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  const { bindingDigest, ...material } = value;
  if (bindingDigest !== sha256CanonicalJson(JsonValueSchema.parse(material))) {
    context.addIssue({ code: "custom", message: "CompactionExecutionBinding v1alpha2 digest mismatch" });
  }
});

export const ReadableCompactionExecutionBindingSchema = z.union([
  CompactionExecutionBindingSchema,
  CompactionExecutionBindingV1Alpha2Schema,
]);

export type CompactionExecutionBindingMaterial = z.infer<
  typeof CompactionExecutionBindingMaterialSchema
>;
export type CompactionExecutionBinding = z.infer<typeof CompactionExecutionBindingSchema>;
export type CompactionExecutionBindingV1Alpha2Material = z.infer<
  typeof CompactionExecutionBindingV1Alpha2MaterialSchema
>;
export type CompactionExecutionBindingV1Alpha2 = z.infer<
  typeof CompactionExecutionBindingV1Alpha2Schema
>;
export type ReadableCompactionExecutionBinding = z.infer<
  typeof ReadableCompactionExecutionBindingSchema
>;

export function createCompactionExecutionBinding(
  material: CompactionExecutionBindingMaterial,
): CompactionExecutionBinding {
  const parsed = CompactionExecutionBindingMaterialSchema.parse(material);
  return CompactionExecutionBindingSchema.parse({
    ...parsed,
    bindingDigest: sha256CanonicalJson(JsonValueSchema.parse(parsed)),
  });
}

export function createCompactionExecutionBindingV1Alpha2(
  material: CompactionExecutionBindingV1Alpha2Material,
): CompactionExecutionBindingV1Alpha2 {
  const parsed = CompactionExecutionBindingV1Alpha2MaterialSchema.parse(material);
  return CompactionExecutionBindingV1Alpha2Schema.parse({
    ...parsed,
    bindingDigest: sha256CanonicalJson(JsonValueSchema.parse(parsed)),
  });
}

export function parseReadableCompactionExecutionBinding(
  input: unknown,
): ReadableCompactionExecutionBinding {
  return ReadableCompactionExecutionBindingSchema.parse(input);
}
