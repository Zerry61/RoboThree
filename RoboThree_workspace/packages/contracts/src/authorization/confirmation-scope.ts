import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { CurrentContractVersionSchema } from "../common/version.js";
import { Sha256DigestSchema } from "../persistence/common.js";

const CapabilityRevisionFields = {
  toolCapabilityRevision: Sha256DigestSchema,
  bindingRevision: Sha256DigestSchema,
  adapterDescriptorRevision: Sha256DigestSchema,
};

export const ModelExternalDataCategorySchema = z.enum([
  "user_text",
  "platform_agent_instructions",
  "tool_schema",
  "workspace_content",
  "skill_content",
  "knowledge_content",
  "tool_result",
]);

export const SingleActionConfirmationScopeSchema = z.object({
  schemaVersion: CurrentContractVersionSchema,
  type: z.literal("single_action"),
  taskId: EntityIdSchema,
  runId: EntityIdSchema,
  stepId: EntityIdSchema,
  actionId: EntityIdSchema,
  actionDigest: Sha256DigestSchema,
  ...CapabilityRevisionFields,
}).strict();

export const TaskExternalConfirmationScopeSchema = z.object({
  schemaVersion: CurrentContractVersionSchema,
  type: z.literal("task_external_scope"),
  taskId: EntityIdSchema,
  externalTarget: z.string().trim().min(1).max(500),
  dataScopeDigest: Sha256DigestSchema,
  ...CapabilityRevisionFields,
}).strict();

export const TaskModelExternalConfirmationScopeSchema = z.object({
  schemaVersion: CurrentContractVersionSchema,
  type: z.literal("task_model_external_scope"),
  taskId: EntityIdSchema,
  runtimeSelectionDigest: Sha256DigestSchema,
  modelCapabilityRevision: Sha256DigestSchema,
  bindingRevision: Sha256DigestSchema,
  adapterDescriptorRevision: Sha256DigestSchema,
  externalTarget: z.string().trim().min(3).max(500),
  dataCategories: z.array(ModelExternalDataCategorySchema).min(1).max(7),
  dataScopeDigest: Sha256DigestSchema,
}).strict().superRefine((scope, context) => {
  if (new Set(scope.dataCategories).size !== scope.dataCategories.length) {
    context.addIssue({
      code: "custom",
      message: "model external data categories must be unique",
      path: ["dataCategories"],
    });
  }
});

export const ConfirmationScopeSchema = z.discriminatedUnion("type", [
  SingleActionConfirmationScopeSchema,
  TaskExternalConfirmationScopeSchema,
  TaskModelExternalConfirmationScopeSchema,
]);

export type SingleActionConfirmationScope = z.infer<typeof SingleActionConfirmationScopeSchema>;
export type TaskExternalConfirmationScope = z.infer<typeof TaskExternalConfirmationScopeSchema>;
export type TaskModelExternalConfirmationScope = z.infer<typeof TaskModelExternalConfirmationScopeSchema>;
export type ModelExternalDataCategory = z.infer<typeof ModelExternalDataCategorySchema>;
export type ConfirmationScope = z.infer<typeof ConfirmationScopeSchema>;
