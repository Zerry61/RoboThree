import { z } from "zod";

import { ReasoningModeLockSchema } from "../reasoning-mode/lock.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import {
  TaskRuntimeSelectionMaterialSchema,
  TaskRuntimeSelectionSchema,
} from "./runtime-selection.js";

export const RUNTIME_SELECTION_SCHEMA_VERSION_V1ALPHA2 = "v1alpha2" as const;
export const RuntimeSelectionSchemaVersionV1Alpha2Schema = z.literal(
  RUNTIME_SELECTION_SCHEMA_VERSION_V1ALPHA2,
);

export const TaskRuntimeSelectionV1Alpha2MaterialSchema = z.object({
  ...TaskRuntimeSelectionMaterialSchema.shape,
  schemaVersion: RuntimeSelectionSchemaVersionV1Alpha2Schema,
  reasoningModeLock: ReasoningModeLockSchema,
}).strict();

export const TaskRuntimeSelectionV1Alpha2Schema = z.object({
  ...TaskRuntimeSelectionV1Alpha2MaterialSchema.shape,
  selectionDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.agent.revision !== value.agent.digest) {
    context.addIssue({
      code: "custom",
      message: "Task runtime selection requires an exact Agent revision/digest",
      path: ["agent"],
    });
  }
  if (value.resolvedModelLock.capabilityId !== value.requestedModelId
    && value.requestedModelId !== undefined) {
    context.addIssue({
      code: "custom",
      message: "resolved model lock must match the requested model",
      path: ["resolvedModelLock"],
    });
  }
  if (
    value.requestedModelId === undefined
    && value.resolvedModelLock.capabilityId !== value.agentDefaultModelId
  ) {
    context.addIssue({
      code: "custom",
      message: "resolved model lock must match the Agent default model",
      path: ["resolvedModelLock"],
    });
  }
  if (!value.resolvedModelLock.capabilityId.startsWith("model.")) {
    context.addIssue({
      code: "custom",
      message: "resolved model lock must reference a Model capability",
      path: ["resolvedModelLock"],
    });
  }
  if (value.toolLocks.some((lock) => !lock.capabilityId.startsWith("tool."))) {
    context.addIssue({
      code: "custom",
      message: "tool locks must reference Tool capabilities",
      path: ["toolLocks"],
    });
  }
  const capabilityLocks = [value.resolvedModelLock, ...value.toolLocks];
  if (new Set(capabilityLocks.map((lock) => lock.lockId)).size !== capabilityLocks.length) {
    context.addIssue({ code: "custom", message: "runtime selection lock IDs must be unique" });
  }
  if (new Set(capabilityLocks.map((lock) => lock.capabilityId)).size !== capabilityLocks.length) {
    context.addIssue({ code: "custom", message: "runtime selection capabilities must be unique" });
  }
  if (value.reasoningModeLock.taskId !== value.taskId) {
    context.addIssue({
      code: "custom",
      message: "Reasoning Mode lock must belong to the same Task",
      path: ["reasoningModeLock", "taskId"],
    });
  }
  if (
    value.reasoningModeLock.modelLockRef.lockId !== value.resolvedModelLock.lockId
    || value.reasoningModeLock.modelLockRef.lockDigest
      !== value.resolvedModelLock.lockDigest
  ) {
    context.addIssue({
      code: "custom",
      message: "Reasoning Mode lock must reference the exact resolved Model lock",
      path: ["reasoningModeLock", "modelLockRef"],
    });
  }
  if (capabilityLocks.some(
    (lock) => lock.lockId === value.reasoningModeLock.reasoningModeLockId,
  )) {
    context.addIssue({
      code: "custom",
      message: "Reasoning Mode lock identity must remain separate from capability lock IDs",
      path: ["reasoningModeLock", "reasoningModeLockId"],
    });
  }
});

export const ReadableTaskRuntimeSelectionSchema = z.union([
  TaskRuntimeSelectionSchema,
  TaskRuntimeSelectionV1Alpha2Schema,
]);

export type TaskRuntimeSelectionV1Alpha2Material = z.infer<
  typeof TaskRuntimeSelectionV1Alpha2MaterialSchema
>;
export type TaskRuntimeSelectionV1Alpha2 = z.infer<
  typeof TaskRuntimeSelectionV1Alpha2Schema
>;
export type ReadableTaskRuntimeSelection = z.infer<
  typeof ReadableTaskRuntimeSelectionSchema
>;
