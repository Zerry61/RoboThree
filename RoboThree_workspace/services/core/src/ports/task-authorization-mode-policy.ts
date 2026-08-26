import { z } from "zod";

import {
  JsonValueSchema,
  Sha256DigestSchema,
  TaskAuthorizationModeSchema,
  TimestampSchema,
} from "@robothree/contracts";
import type {
  TaskAuthorizationMode,
} from "@robothree/contracts";

import { sha256CanonicalJson } from "../persistence/digest.js";

const TaskAuthorizationModePolicyFields = {
  policyId: z.string()
    .min(3)
    .max(160)
    .regex(/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u),
  supportedModes: z.array(TaskAuthorizationModeSchema).min(1).max(3),
  legacyDefaultMode: TaskAuthorizationModeSchema,
  createdAt: TimestampSchema,
};

export const TaskAuthorizationModePolicyMaterialSchema = z.object(
  TaskAuthorizationModePolicyFields,
).strict().superRefine((value, context) => {
  if (new Set(value.supportedModes).size !== value.supportedModes.length) {
    context.addIssue({
      code: "custom",
      path: ["supportedModes"],
      message: "supported authorization modes must be unique",
    });
  }
  if (
    !value.supportedModes.every((mode, index, modes) => (
      index === 0 || modes[index - 1]! < mode
    ))
  ) {
    context.addIssue({
      code: "custom",
      path: ["supportedModes"],
      message: "supported authorization modes must use canonical order",
    });
  }
  if (!value.supportedModes.includes(value.legacyDefaultMode)) {
    context.addIssue({
      code: "custom",
      path: ["legacyDefaultMode"],
      message: "legacy default mode must be supported",
    });
  }
});

export const TaskAuthorizationModePolicySnapshotSchema = z.object({
  ...TaskAuthorizationModePolicyFields,
  policyRevision: Sha256DigestSchema,
}).strict();

export type TaskAuthorizationModePolicyMaterial = z.infer<
  typeof TaskAuthorizationModePolicyMaterialSchema
>;
export type TaskAuthorizationModePolicySnapshot = z.infer<
  typeof TaskAuthorizationModePolicySnapshotSchema
>;

export interface TaskAuthorizationModePolicyProvider {
  loadSnapshot(): Promise<TaskAuthorizationModePolicySnapshot>;
}

export function createTaskAuthorizationModePolicySnapshot(
  material: TaskAuthorizationModePolicyMaterial,
): TaskAuthorizationModePolicySnapshot {
  const parsed = TaskAuthorizationModePolicyMaterialSchema.parse(material);
  return TaskAuthorizationModePolicySnapshotSchema.parse({
    ...parsed,
    policyRevision: sha256CanonicalJson(JsonValueSchema.parse(parsed)),
  });
}

export function hasValidTaskAuthorizationModePolicySnapshot(
  input: unknown,
): input is TaskAuthorizationModePolicySnapshot {
  const parsed = TaskAuthorizationModePolicySnapshotSchema.safeParse(input);
  if (!parsed.success) return false;
  const { policyRevision, ...material } = parsed.data;
  const validMaterial = TaskAuthorizationModePolicyMaterialSchema.safeParse(material);
  return validMaterial.success
    && policyRevision === sha256CanonicalJson(JsonValueSchema.parse(validMaterial.data));
}

export function canonicalAuthorizationModeOrder(
  modes: readonly TaskAuthorizationMode[],
): TaskAuthorizationMode[] {
  return [...modes].sort();
}
