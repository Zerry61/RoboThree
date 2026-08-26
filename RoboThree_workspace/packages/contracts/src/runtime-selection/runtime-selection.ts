import { z } from "zod";

import { CapabilityIdSchema, CapabilityRevisionRefSchema } from "../capability/common.js";
import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { DesktopResourceIdSchema } from "../desktop-local/v1alpha1/common.js";
import { Sha256DigestSchema } from "../persistence/common.js";

export const RUNTIME_SELECTION_SCHEMA_VERSION = "v1alpha1" as const;
export const RuntimeSelectionSchemaVersionSchema = z.literal(
  RUNTIME_SELECTION_SCHEMA_VERSION,
);

export const ModelModalitySchema = z.enum(["text", "image", "audio"]);

export const ModelCapabilityFactsSchema = z.object({
  inputModalities: z.array(ModelModalitySchema).min(1).max(8),
  outputModalities: z.array(ModelModalitySchema).min(1).max(8),
  supportsToolCalling: z.boolean(),
  supportsStreaming: z.boolean(),
  contextWindow: z.number().int().positive(),
}).strict();

export const RequiredModelCapabilitiesSchema = z.object({
  inputModalities: z.array(ModelModalitySchema).max(8),
  outputModalities: z.array(ModelModalitySchema).max(8),
  supportsToolCalling: z.boolean(),
  supportsStreaming: z.boolean(),
  minimumContextWindow: z.number().int().positive().optional(),
}).strict();

export const MaterializedResourceRevisionSchema = z.object({
  id: DesktopResourceIdSchema,
  revision: Sha256DigestSchema,
  contentDigest: Sha256DigestSchema,
  materializedRef: z.string().min(3).max(1024),
}).strict();

const AgentDefinitionRevisionFields = {
  schemaVersion: RuntimeSelectionSchemaVersionSchema,
  agentDefinitionId: DesktopResourceIdSchema,
  name: z.string().min(1).max(512),
  identity: z.string().min(1).max(4096),
  goal: z.string().min(1).max(4096),
  instructions: z.string().min(1).max(128 * 1024),
  defaultModelId: CapabilityIdSchema.refine((id) => id.startsWith("model.")),
  allowModelOverride: z.boolean(),
  skillReferences: z.array(MaterializedResourceRevisionSchema).max(64),
  toolReferences: z.array(CapabilityRevisionRefSchema).max(128),
  knowledgeReferences: z.array(MaterializedResourceRevisionSchema).max(64),
  requiredModelCapabilities: RequiredModelCapabilitiesSchema,
  createdAt: TimestampSchema,
};

export const AgentDefinitionRevisionMaterialSchema = z.object(
  AgentDefinitionRevisionFields,
).strict();

export const AgentDefinitionRevisionSchema = z.object({
  ...AgentDefinitionRevisionFields,
  revision: Sha256DigestSchema,
  digest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.revision !== value.digest) {
    context.addIssue({
      code: "custom",
      message: "Agent definition revision and digest must identify the same immutable material",
    });
  }
});

const ModelDefinitionFields = {
  schemaVersion: RuntimeSelectionSchemaVersionSchema,
  modelId: CapabilityIdSchema.refine((id) => id.startsWith("model.")),
  name: z.string().min(1).max(512),
  source: z.enum(["personal", "enterprise", "official"]),
  capability: CapabilityRevisionRefSchema,
  capabilities: ModelCapabilityFactsSchema,
  createdAt: TimestampSchema,
};

export const ModelDefinitionMaterialSchema = z.object(ModelDefinitionFields)
  .strict()
  .superRefine((value, context) => {
    if (value.capability.capabilityId !== value.modelId) {
      context.addIssue({
        code: "custom",
        message: "Model definition must reference its own exact capability",
        path: ["capability"],
      });
    }
  });

export const ModelDefinitionSchema = z.object({
  ...ModelDefinitionFields,
  revision: Sha256DigestSchema,
  digest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.capability.capabilityId !== value.modelId) {
    context.addIssue({
      code: "custom",
      message: "Model definition must reference its own exact capability",
      path: ["capability"],
    });
  }
  if (value.revision !== value.digest) {
    context.addIssue({
      code: "custom",
      message: "Model definition revision and digest must identify the same immutable material",
    });
  }
});

export const RuntimeSelectionCapabilityLockRefSchema = z.object({
  lockId: EntityIdSchema,
  capabilityId: CapabilityIdSchema,
  lockDigest: Sha256DigestSchema,
}).strict();

const TaskRuntimeSelectionFields = {
  schemaVersion: RuntimeSelectionSchemaVersionSchema,
  runtimeSelectionId: EntityIdSchema,
  taskId: EntityIdSchema,
  agent: z.object({
    agentDefinitionId: DesktopResourceIdSchema,
    revision: Sha256DigestSchema,
    digest: Sha256DigestSchema,
  }).strict(),
  agentDefaultModelId: CapabilityIdSchema.refine((id) => id.startsWith("model.")),
  requestedModelId: CapabilityIdSchema.refine((id) => id.startsWith("model.")).optional(),
  resolvedModelLock: RuntimeSelectionCapabilityLockRefSchema,
  activeSkillRevisions: z.array(MaterializedResourceRevisionSchema).max(64),
  toolLocks: z.array(RuntimeSelectionCapabilityLockRefSchema).max(128),
  knowledgeRevisions: z.array(MaterializedResourceRevisionSchema).max(64),
  workspaceGrantId: DesktopResourceIdSchema.optional(),
  enterpriseConfigRevision: Sha256DigestSchema.optional(),
  platformPromptRevision: Sha256DigestSchema,
  registryRevision: Sha256DigestSchema,
  createdAt: TimestampSchema,
};

export const TaskRuntimeSelectionMaterialSchema = z.object(
  TaskRuntimeSelectionFields,
).strict();

export const TaskRuntimeSelectionSchema = z.object({
  ...TaskRuntimeSelectionFields,
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
  const allLocks = [value.resolvedModelLock, ...value.toolLocks];
  if (new Set(allLocks.map((lock) => lock.lockId)).size !== allLocks.length) {
    context.addIssue({ code: "custom", message: "runtime selection lock IDs must be unique" });
  }
  if (new Set(allLocks.map((lock) => lock.capabilityId)).size !== allLocks.length) {
    context.addIssue({ code: "custom", message: "runtime selection capabilities must be unique" });
  }
});

export type ModelCapabilityFacts = z.infer<typeof ModelCapabilityFactsSchema>;
export type RequiredModelCapabilities = z.infer<typeof RequiredModelCapabilitiesSchema>;
export type MaterializedResourceRevision = z.infer<typeof MaterializedResourceRevisionSchema>;
export type AgentDefinitionRevisionMaterial = z.infer<typeof AgentDefinitionRevisionMaterialSchema>;
export type AgentDefinitionRevision = z.infer<typeof AgentDefinitionRevisionSchema>;
export type ModelDefinitionMaterial = z.infer<typeof ModelDefinitionMaterialSchema>;
export type ModelDefinition = z.infer<typeof ModelDefinitionSchema>;
export type RuntimeSelectionCapabilityLockRef = z.infer<typeof RuntimeSelectionCapabilityLockRefSchema>;
export type TaskRuntimeSelectionMaterial = z.infer<typeof TaskRuntimeSelectionMaterialSchema>;
export type TaskRuntimeSelection = z.infer<typeof TaskRuntimeSelectionSchema>;
