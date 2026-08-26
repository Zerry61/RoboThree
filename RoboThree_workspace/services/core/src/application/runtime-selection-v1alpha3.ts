import {
  JsonValueSchema,
  TaskRuntimeSelectionSchema,
  type TaskRuntimeSelection,
} from "@robothree/contracts";
import {
  TaskRuntimeSelectionV1Alpha2Schema,
  type TaskRuntimeSelectionV1Alpha2,
} from "@robothree/contracts/runtime-selection/v1alpha2";
import {
  TaskRuntimeSelectionV1Alpha3MaterialSchema,
  TaskRuntimeSelectionV1Alpha3Schema,
  type ReadableTaskRuntimeSelectionV1Alpha3,
  type TaskRuntimeSelectionV1Alpha3,
  type TaskRuntimeSelectionV1Alpha3Material,
} from "@robothree/contracts/runtime-selection/v1alpha3";

import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  hasValidTaskRuntimeSelection,
  hasValidTaskRuntimeSelectionV1Alpha2,
} from "./runtime-selection-revisions.js";

export const R2D3_RUNTIME_SELECTION_V1ALPHA3_PRODUCTION_CONSUMER_ENABLED = false;

export function createTaskRuntimeSelectionV1Alpha3(
  material: TaskRuntimeSelectionV1Alpha3Material,
): TaskRuntimeSelectionV1Alpha3 {
  const parsed = TaskRuntimeSelectionV1Alpha3MaterialSchema.parse(material);
  return TaskRuntimeSelectionV1Alpha3Schema.parse({
    ...parsed,
    selectionDigest: sha256CanonicalJson(JsonValueSchema.parse(parsed)),
  });
}

export function hasValidTaskRuntimeSelectionV1Alpha3(
  input: TaskRuntimeSelectionV1Alpha3,
): boolean {
  const parsed = TaskRuntimeSelectionV1Alpha3Schema.parse(input);
  const { selectionDigest, ...material } = parsed;
  return selectionDigest === sha256CanonicalJson(
    JsonValueSchema.parse(TaskRuntimeSelectionV1Alpha3MaterialSchema.parse(material)),
  );
}

export function parseReadableTaskRuntimeSelectionV1Alpha3(
  input: unknown,
): ReadableTaskRuntimeSelectionV1Alpha3 {
  const schemaVersion = readSchemaVersion(input);
  if (schemaVersion === "v1alpha1") {
    const parsed: TaskRuntimeSelection = TaskRuntimeSelectionSchema.parse(input);
    if (!hasValidTaskRuntimeSelection(parsed)) throw invalidDigest();
    return parsed;
  }
  if (schemaVersion === "v1alpha2") {
    const parsed: TaskRuntimeSelectionV1Alpha2 =
      TaskRuntimeSelectionV1Alpha2Schema.parse(input);
    if (!hasValidTaskRuntimeSelectionV1Alpha2(parsed)) throw invalidDigest();
    return parsed;
  }
  if (schemaVersion === "v1alpha3") {
    const parsed = TaskRuntimeSelectionV1Alpha3Schema.parse(input);
    if (!hasValidTaskRuntimeSelectionV1Alpha3(parsed)) throw invalidDigest();
    return parsed;
  }
  throw new Error("TaskRuntimeSelection schema version is unsupported");
}

function readSchemaVersion(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("TaskRuntimeSelection is invalid");
  }
  return Reflect.get(input, "schemaVersion");
}

function invalidDigest(): Error {
  return new Error("TaskRuntimeSelection digest is invalid");
}
