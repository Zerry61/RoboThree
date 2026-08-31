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
import {
  TaskRuntimeSelectionV1Alpha3MaterialSchema,
  TaskRuntimeSelectionV1Alpha3Schema,
  type ReadableTaskRuntimeSelectionV1Alpha3,
  type TaskRuntimeSelectionV1Alpha3,
  type TaskRuntimeSelectionV1Alpha3Material,
} from "@robothree/contracts/runtime-selection/v1alpha3";
import {
  TaskRuntimeSelectionV1Alpha4MaterialSchema,
  TaskRuntimeSelectionV1Alpha4Schema,
  type ReadableTaskRuntimeSelectionV1Alpha4,
  type TaskRuntimeSelectionV1Alpha4,
  type TaskRuntimeSelectionV1Alpha4Material,
} from "@robothree/contracts/runtime-selection/v1alpha4";

import { sha256CanonicalJson } from "../persistence/digest.js";
import { validateReasoningModeLock } from "./reasoning-mode-lock-domain.js";
import { validateReasoningModeLockV1Alpha2 } from
  "./reasoning-mode-lock-v1alpha2-domain.js";

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

export function createTaskRuntimeSelectionV1Alpha3(
  material: TaskRuntimeSelectionV1Alpha3Material,
): TaskRuntimeSelectionV1Alpha3 {
  const parsed = TaskRuntimeSelectionV1Alpha3MaterialSchema.parse(material);
  validateReasoningModeLock(parsed.reasoningModeLock, {
    taskId: parsed.taskId,
    modelLockRef: parsed.resolvedModelLock,
  });
  return TaskRuntimeSelectionV1Alpha3Schema.parse({
    ...parsed,
    selectionDigest: sha256CanonicalJson(JsonValueSchema.parse(parsed)),
  });
}

export function createTaskRuntimeSelectionV1Alpha4(
  material: TaskRuntimeSelectionV1Alpha4Material,
): TaskRuntimeSelectionV1Alpha4 {
  const parsed = TaskRuntimeSelectionV1Alpha4MaterialSchema.parse(material);
  validateReasoningModeLockV1Alpha2(parsed.reasoningModeLock, {
    taskId: parsed.taskId,
    modelLockRef: parsed.resolvedModelLock,
  });
  return TaskRuntimeSelectionV1Alpha4Schema.parse({
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

export function hasValidTaskRuntimeSelectionV1Alpha3(
  input: TaskRuntimeSelectionV1Alpha3,
): boolean {
  const parsed = TaskRuntimeSelectionV1Alpha3Schema.parse(input);
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
    JsonValueSchema.parse(TaskRuntimeSelectionV1Alpha3MaterialSchema.parse(material)),
  );
}

export function hasValidTaskRuntimeSelectionV1Alpha4(
  input: TaskRuntimeSelectionV1Alpha4,
): boolean {
  const parsed = TaskRuntimeSelectionV1Alpha4Schema.parse(input);
  try {
    validateReasoningModeLockV1Alpha2(parsed.reasoningModeLock, {
      taskId: parsed.taskId,
      modelLockRef: parsed.resolvedModelLock,
    });
  } catch {
    return false;
  }
  return selectionDigestMatchesV1Alpha4(parsed);
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

export function parseReadableTaskRuntimeSelectionV1Alpha3(
  input: unknown,
): ReadableTaskRuntimeSelectionV1Alpha3 {
  const schemaVersion = readSchemaVersion(input);
  const parsed = schemaVersion === "v1alpha1"
    ? TaskRuntimeSelectionSchema.parse(input)
    : schemaVersion === "v1alpha2"
      ? TaskRuntimeSelectionV1Alpha2Schema.parse(input)
      : schemaVersion === "v1alpha3"
        ? TaskRuntimeSelectionV1Alpha3Schema.parse(input)
        : undefined;
  if (parsed === undefined) {
    throw new Error("TaskRuntimeSelection schema version is unsupported");
  }
  const valid = parsed.schemaVersion === "v1alpha1"
    ? hasValidTaskRuntimeSelection(parsed)
    : parsed.schemaVersion === "v1alpha2"
      ? hasValidTaskRuntimeSelectionV1Alpha2(parsed)
      : hasValidTaskRuntimeSelectionV1Alpha3(parsed);
  if (!valid) throw new Error("TaskRuntimeSelection digest is invalid");
  return parsed;
}

export function parseReadableTaskRuntimeSelectionV1Alpha4(
  input: unknown,
): ReadableTaskRuntimeSelectionV1Alpha4 {
  const schemaVersion = readSchemaVersion(input);
  const parsed = schemaVersion === "v1alpha1"
    ? TaskRuntimeSelectionSchema.parse(input)
    : schemaVersion === "v1alpha2"
      ? TaskRuntimeSelectionV1Alpha2Schema.parse(input)
      : schemaVersion === "v1alpha3"
        ? TaskRuntimeSelectionV1Alpha3Schema.parse(input)
        : schemaVersion === "v1alpha4"
          ? TaskRuntimeSelectionV1Alpha4Schema.parse(input)
          : undefined;
  if (parsed === undefined) {
    throw new Error("TaskRuntimeSelection schema version is unsupported");
  }
  const valid = parsed.schemaVersion === "v1alpha1"
    ? hasValidTaskRuntimeSelection(parsed)
    : parsed.schemaVersion === "v1alpha2"
      ? hasValidTaskRuntimeSelectionV1Alpha2(parsed)
      : parsed.schemaVersion === "v1alpha3"
        ? hasValidTaskRuntimeSelectionV1Alpha3(parsed)
        : hasValidTaskRuntimeSelectionV1Alpha4(parsed);
  if (!valid) throw new Error("TaskRuntimeSelection digest is invalid");
  return parsed;
}

function selectionDigestMatchesV1Alpha4(
  parsed: TaskRuntimeSelectionV1Alpha4,
): boolean {
  const { selectionDigest, ...material } = parsed;
  return selectionDigest === sha256CanonicalJson(
    JsonValueSchema.parse(TaskRuntimeSelectionV1Alpha4MaterialSchema.parse(material)),
  );
}

function readSchemaVersion(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("TaskRuntimeSelection is invalid");
  }
  return Reflect.get(input, "schemaVersion");
}
