import {
  AgentDefinitionRevisionMaterialSchema,
  AgentDefinitionRevisionSchema,
  JsonValueSchema,
  ModelDefinitionMaterialSchema,
  ModelDefinitionSchema,
  TaskRuntimeSelectionMaterialSchema,
  TaskRuntimeSelectionSchema,
} from "@robothree/contracts";
import type {
  AgentDefinitionRevision,
  AgentDefinitionRevisionMaterial,
  ModelDefinition,
  ModelDefinitionMaterial,
  TaskRuntimeSelection,
  TaskRuntimeSelectionMaterial,
} from "@robothree/contracts";
import {
  ReadableTaskRuntimeSelectionSchema,
  TaskRuntimeSelectionV1Alpha2MaterialSchema,
  TaskRuntimeSelectionV1Alpha2Schema,
  type ReadableTaskRuntimeSelection,
  type TaskRuntimeSelectionV1Alpha2,
  type TaskRuntimeSelectionV1Alpha2Material,
} from "@robothree/contracts/runtime-selection/v1alpha2";

import { sha256CanonicalJson } from "../persistence/digest.js";
import { validateReasoningModeLock } from "./reasoning-mode-lock-domain.js";

export function createAgentDefinitionRevision(
  material: AgentDefinitionRevisionMaterial,
): AgentDefinitionRevision {
  const parsed = AgentDefinitionRevisionMaterialSchema.parse(material);
  const digest = sha256CanonicalJson(JsonValueSchema.parse(parsed));
  return AgentDefinitionRevisionSchema.parse({
    ...parsed,
    revision: digest,
    digest,
  });
}

export function createModelDefinition(
  material: ModelDefinitionMaterial,
): ModelDefinition {
  const parsed = ModelDefinitionMaterialSchema.parse(material);
  const digest = sha256CanonicalJson(JsonValueSchema.parse(parsed));
  return ModelDefinitionSchema.parse({
    ...parsed,
    revision: digest,
    digest,
  });
}

export function createTaskRuntimeSelection(
  material: TaskRuntimeSelectionMaterial,
): TaskRuntimeSelection {
  const parsed = TaskRuntimeSelectionMaterialSchema.parse(material);
  return TaskRuntimeSelectionSchema.parse({
    ...parsed,
    selectionDigest: sha256CanonicalJson(JsonValueSchema.parse(parsed)),
  });
}

export function createTaskRuntimeSelectionV1Alpha2(
  material: TaskRuntimeSelectionV1Alpha2Material,
): TaskRuntimeSelectionV1Alpha2 {
  const parsed = TaskRuntimeSelectionV1Alpha2MaterialSchema.parse(material);
  validateReasoningModeLock(parsed.reasoningModeLock, {
    taskId: parsed.taskId,
    modelLockRef: parsed.resolvedModelLock,
  });
  return TaskRuntimeSelectionV1Alpha2Schema.parse({
    ...parsed,
    selectionDigest: sha256CanonicalJson(JsonValueSchema.parse(parsed)),
  });
}

export function hasValidAgentDefinitionRevision(
  input: AgentDefinitionRevision,
): boolean {
  const parsed = AgentDefinitionRevisionSchema.parse(input);
  const { revision: _revision, digest, ...material } = parsed;
  return digest === sha256CanonicalJson(
    JsonValueSchema.parse(AgentDefinitionRevisionMaterialSchema.parse(material)),
  );
}

export function hasValidModelDefinition(input: ModelDefinition): boolean {
  const parsed = ModelDefinitionSchema.parse(input);
  const { revision: _revision, digest, ...material } = parsed;
  return digest === sha256CanonicalJson(
    JsonValueSchema.parse(ModelDefinitionMaterialSchema.parse(material)),
  );
}

export function hasValidTaskRuntimeSelection(input: TaskRuntimeSelection): boolean {
  const parsed = TaskRuntimeSelectionSchema.parse(input);
  const { selectionDigest, ...material } = parsed;
  return selectionDigest === sha256CanonicalJson(
    JsonValueSchema.parse(TaskRuntimeSelectionMaterialSchema.parse(material)),
  );
}

export function hasValidTaskRuntimeSelectionV1Alpha2(
  input: TaskRuntimeSelectionV1Alpha2,
): boolean {
  const parsed = TaskRuntimeSelectionV1Alpha2Schema.parse(input);
  try {
    validateReasoningModeLock(parsed.reasoningModeLock, {
      taskId: parsed.taskId,
      modelLockRef: parsed.resolvedModelLock,
    });
  } catch {
    return false;
  }
  const { selectionDigest, ...material } = parsed;
  return selectionDigest === sha256CanonicalJson(
    JsonValueSchema.parse(TaskRuntimeSelectionV1Alpha2MaterialSchema.parse(material)),
  );
}

export function parseReadableTaskRuntimeSelection(
  input: unknown,
): ReadableTaskRuntimeSelection {
  const parsed = ReadableTaskRuntimeSelectionSchema.parse(input);
  const valid = parsed.schemaVersion === "v1alpha1"
    ? hasValidTaskRuntimeSelection(parsed)
    : hasValidTaskRuntimeSelectionV1Alpha2(parsed);
  if (!valid) throw new Error("TaskRuntimeSelection digest is invalid");
  return parsed;
}
