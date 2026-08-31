import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { TimestampSchema } from "../../common/time.js";
import { DesktopResourceIdSchema } from "../../desktop-local/v1alpha1/common.js";
import { Sha256DigestSchema } from "../../persistence/common.js";
import { ReasoningModeLockV1Alpha2Schema } from "../../reasoning-mode/v1alpha2/index.js";
import {
  AgentKnowledgeRestrictionRefV1Alpha2Schema,
  AgentSkillRestrictionRefV1Alpha2Schema,
} from "../agent-definition/v1alpha2/index.js";
import {
  RuntimeSelectionCapabilityLockRefSchema,
  TaskRuntimeSelectionSchema,
} from "../runtime-selection.js";
import { TaskRuntimeSelectionV1Alpha2Schema } from "../v1alpha2.js";
import { TaskRuntimeSelectionV1Alpha3Schema } from "../v1alpha3/index.js";

export const RUNTIME_SELECTION_SCHEMA_VERSION_V1ALPHA4 = "v1alpha4" as const;

const Fields = {
  schemaVersion: z.literal(RUNTIME_SELECTION_SCHEMA_VERSION_V1ALPHA4),
  runtimeSelectionId: EntityIdSchema,
  taskId: EntityIdSchema,
  agent: z.object({
    agentDefinitionId: DesktopResourceIdSchema,
    revision: Sha256DigestSchema,
    digest: Sha256DigestSchema,
  }).strict(),
  agentResourceDecisionDigest: Sha256DigestSchema,
  resourceEntitlementSnapshotDigest: Sha256DigestSchema,
  modelSelectionSource: z.enum(["explicit", "user_preference", "stable_fallback"]),
  requestedModelId: DesktopResourceIdSchema.refine((value) =>
    value.startsWith("model.")).optional(),
  resolvedModelLock: RuntimeSelectionCapabilityLockRefSchema,
  activeSkillRevisions: z.array(AgentSkillRestrictionRefV1Alpha2Schema).max(64),
  toolLocks: z.array(RuntimeSelectionCapabilityLockRefSchema).max(128),
  knowledgeRevisions: z.array(AgentKnowledgeRestrictionRefV1Alpha2Schema).max(64),
  reasoningModeLock: ReasoningModeLockV1Alpha2Schema,
  workspaceGrantId: DesktopResourceIdSchema.optional(),
  enterpriseConfigRevision: Sha256DigestSchema.optional(),
  platformPromptRevision: Sha256DigestSchema,
  registryRevision: Sha256DigestSchema,
  createdAt: TimestampSchema,
};

export const TaskRuntimeSelectionV1Alpha4MaterialSchema = z.object(Fields)
  .strict().superRefine(validate);
export const TaskRuntimeSelectionV1Alpha4Schema = z.object({
  ...Fields,
  selectionDigest: Sha256DigestSchema,
}).strict().superRefine(validate);

export const ReadableTaskRuntimeSelectionV1Alpha4Schema = z.union([
  TaskRuntimeSelectionSchema,
  TaskRuntimeSelectionV1Alpha2Schema,
  TaskRuntimeSelectionV1Alpha3Schema,
  TaskRuntimeSelectionV1Alpha4Schema,
]);

function validate(value: z.infer<z.ZodObject<typeof Fields>>, context: z.RefinementCtx) {
  if (value.agent.revision !== value.agent.digest) {
    context.addIssue({ code: "custom", message: "Agent revision and digest must match" });
  }
  const explicit = value.modelSelectionSource === "explicit";
  if (explicit !== (value.requestedModelId !== undefined)
    || (explicit && value.requestedModelId !== value.resolvedModelLock.capabilityId)) {
    context.addIssue({ code: "custom", path: ["requestedModelId"],
      message: "only explicit selection requires the exact requested Model ID" });
  }
  if (!value.resolvedModelLock.capabilityId.startsWith("model.")) {
    context.addIssue({ code: "custom", path: ["resolvedModelLock"],
      message: "resolved model lock must reference a Model capability" });
  }
  if (value.toolLocks.some((lock) => !lock.capabilityId.startsWith("tool."))) {
    context.addIssue({ code: "custom", path: ["toolLocks"],
      message: "tool locks must reference Tool capabilities" });
  }
  const capabilityLocks = [value.resolvedModelLock, ...value.toolLocks];
  if (new Set(capabilityLocks.map((lock) => lock.lockId)).size !== capabilityLocks.length
    || new Set(capabilityLocks.map((lock) => lock.capabilityId)).size
      !== capabilityLocks.length) {
    context.addIssue({ code: "custom", message: "runtime selection locks must be unique" });
  }
  if (value.reasoningModeLock.taskId !== value.taskId
    || value.reasoningModeLock.modelLockRef.lockId !== value.resolvedModelLock.lockId
    || value.reasoningModeLock.modelLockRef.lockDigest
      !== value.resolvedModelLock.lockDigest) {
    context.addIssue({ code: "custom", path: ["reasoningModeLock"],
      message: "Reasoning Mode lock must bind the exact Task and Model lock" });
  }
  if (capabilityLocks.some((lock) =>
    lock.lockId === value.reasoningModeLock.reasoningModeLockId)) {
    context.addIssue({ code: "custom", path: ["reasoningModeLock", "reasoningModeLockId"],
      message: "Reasoning Mode lock identity must remain separate" });
  }
  for (const ids of [
    value.activeSkillRevisions.map((item) => item.skillId),
    value.knowledgeRevisions.map((item) => item.knowledgeId),
  ]) {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "resource revisions must be unique" });
    }
  }
}

export type TaskRuntimeSelectionV1Alpha4Material = z.infer<
  typeof TaskRuntimeSelectionV1Alpha4MaterialSchema
>;
export type TaskRuntimeSelectionV1Alpha4 = z.infer<
  typeof TaskRuntimeSelectionV1Alpha4Schema
>;
export type ReadableTaskRuntimeSelectionV1Alpha4 = z.infer<
  typeof ReadableTaskRuntimeSelectionV1Alpha4Schema
>;
