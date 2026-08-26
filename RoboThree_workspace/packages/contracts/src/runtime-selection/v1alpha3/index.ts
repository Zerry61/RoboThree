import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { TimestampSchema } from "../../common/time.js";
import { DesktopResourceIdSchema } from "../../desktop-local/v1alpha1/common.js";
import { Sha256DigestSchema } from "../../persistence/common.js";
import { ReasoningModeLockSchema } from "../../reasoning-mode/lock.js";
import {
  AgentKnowledgeRestrictionRefV1Alpha2Schema,
  AgentSkillRestrictionRefV1Alpha2Schema,
} from "../agent-definition/v1alpha2/index.js";
import {
  RuntimeSelectionCapabilityLockRefSchema,
  TaskRuntimeSelectionSchema,
} from "../runtime-selection.js";
import { TaskRuntimeSelectionV1Alpha2Schema } from "../v1alpha2.js";

export const RUNTIME_SELECTION_SCHEMA_VERSION_V1ALPHA3 = "v1alpha3" as const;
export const RuntimeSelectionSchemaVersionV1Alpha3Schema = z.literal(
  RUNTIME_SELECTION_SCHEMA_VERSION_V1ALPHA3,
);

export const ModelSelectionSourceV1Alpha3Schema = z.enum([
  "explicit",
  "user_preference",
  "stable_fallback",
]);

const TaskRuntimeSelectionV1Alpha3Fields = {
  schemaVersion: RuntimeSelectionSchemaVersionV1Alpha3Schema,
  runtimeSelectionId: EntityIdSchema,
  taskId: EntityIdSchema,
  agent: z.object({
    agentDefinitionId: DesktopResourceIdSchema,
    revision: Sha256DigestSchema,
    digest: Sha256DigestSchema,
  }).strict(),
  agentResourceDecisionDigest: Sha256DigestSchema,
  resourceEntitlementSnapshotDigest: Sha256DigestSchema,
  modelSelectionSource: ModelSelectionSourceV1Alpha3Schema,
  requestedModelId: DesktopResourceIdSchema.refine(
    (value) => value.startsWith("model."),
  ).optional(),
  resolvedModelLock: RuntimeSelectionCapabilityLockRefSchema,
  activeSkillRevisions: z.array(AgentSkillRestrictionRefV1Alpha2Schema).max(64),
  toolLocks: z.array(RuntimeSelectionCapabilityLockRefSchema).max(128),
  knowledgeRevisions: z.array(AgentKnowledgeRestrictionRefV1Alpha2Schema).max(64),
  reasoningModeLock: ReasoningModeLockSchema,
  workspaceGrantId: DesktopResourceIdSchema.optional(),
  enterpriseConfigRevision: Sha256DigestSchema.optional(),
  platformPromptRevision: Sha256DigestSchema,
  registryRevision: Sha256DigestSchema,
  createdAt: TimestampSchema,
};

export const TaskRuntimeSelectionV1Alpha3MaterialSchema = z.object(
  TaskRuntimeSelectionV1Alpha3Fields,
).strict().superRefine(validateTaskRuntimeSelectionV1Alpha3);

export const TaskRuntimeSelectionV1Alpha3Schema = z.object({
  ...TaskRuntimeSelectionV1Alpha3Fields,
  selectionDigest: Sha256DigestSchema,
}).strict().superRefine(validateTaskRuntimeSelectionV1Alpha3);

export const ReadableTaskRuntimeSelectionV1Alpha3Schema = z.union([
  TaskRuntimeSelectionSchema,
  TaskRuntimeSelectionV1Alpha2Schema,
  TaskRuntimeSelectionV1Alpha3Schema,
]);

function validateTaskRuntimeSelectionV1Alpha3(
  value: z.infer<z.ZodObject<typeof TaskRuntimeSelectionV1Alpha3Fields>>,
  context: z.RefinementCtx,
): void {
  if (value.agent.revision !== value.agent.digest) {
    context.addIssue({
      code: "custom",
      message: "Task runtime selection requires an exact Agent revision/digest",
      path: ["agent"],
    });
  }
  if (!value.resolvedModelLock.capabilityId.startsWith("model.")) {
    context.addIssue({
      code: "custom",
      message: "resolved model lock must reference a Model capability",
      path: ["resolvedModelLock"],
    });
  }
  const isExplicit = value.modelSelectionSource === "explicit";
  if (
    isExplicit !== (value.requestedModelId !== undefined)
    || (isExplicit && value.requestedModelId !== value.resolvedModelLock.capabilityId)
  ) {
    context.addIssue({
      code: "custom",
      message: "only explicit selection requires the exact requested Model ID",
      path: ["requestedModelId"],
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
  if (
    new Set(capabilityLocks.map((lock) => lock.capabilityId)).size
      !== capabilityLocks.length
  ) {
    context.addIssue({ code: "custom", message: "runtime selection capabilities must be unique" });
  }
  requireUnique(
    value.activeSkillRevisions.map((reference) => reference.skillId),
    context,
    "active Skill revisions",
  );
  requireUnique(
    value.knowledgeRevisions.map((reference) => reference.knowledgeId),
    context,
    "Knowledge revisions",
  );
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
}

function requireUnique(
  ids: readonly string[],
  context: z.RefinementCtx,
  label: string,
): void {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: `${label} must be unique` });
  }
}

export type ModelSelectionSourceV1Alpha3 = z.infer<
  typeof ModelSelectionSourceV1Alpha3Schema
>;
export type TaskRuntimeSelectionV1Alpha3Material = z.infer<
  typeof TaskRuntimeSelectionV1Alpha3MaterialSchema
>;
export type TaskRuntimeSelectionV1Alpha3 = z.infer<
  typeof TaskRuntimeSelectionV1Alpha3Schema
>;
export type ReadableTaskRuntimeSelectionV1Alpha3 = z.infer<
  typeof ReadableTaskRuntimeSelectionV1Alpha3Schema
>;
