import { z } from "zod";

import {
  JsonValueSchema,
  TaskAuthorizationSelectionSchema,
  TaskExecutionSelectionIdentitySchema,
} from "@robothree/contracts";
import type { ReadableTaskRuntimeSelection } from
  "@robothree/contracts/runtime-selection/v1alpha2";
import type { ReadableTaskRuntimeSelectionV1Alpha4 } from
  "@robothree/contracts/runtime-selection/v1alpha4";

import type {
  AuthorizationAwareSubmitTurnTaskBundle,
  PersistenceWriteFailure,
  ReasoningAwareAuthorizationSubmitTurnTaskBundle,
  ReasoningAwareSubmitTurnTaskBundle,
  TaskAuthorizationPersistenceRecord,
} from "../ports/task-persistence.js";
import {
  hasValidTaskAuthorizationSelection,
  hasValidTaskExecutionSelectionIdentity,
} from "../application/task-authorization-selection-service.js";
import { parseReadableTaskRuntimeSelection } from
  "../application/runtime-selection-revisions.js";
import { parseReadableTaskRuntimeSelectionV1Alpha4 } from
  "../application/runtime-selection-revisions.js";
import { sha256CanonicalJson } from "./digest.js";
import { failure } from "./validation.js";
import {
  validateSubmitTurnTaskBundle,
  validateReasoningAwareSubmitTurnTaskBundle,
  type ValidatedSubmitTurnTaskBundle,
} from "./submit-turn-bundle-validation.js";

const TaskAuthorizationPersistenceRecordSchema = z.object({
  selection: TaskAuthorizationSelectionSchema,
  executionIdentity: TaskExecutionSelectionIdentitySchema,
}).strict();

export type ValidatedAuthorizationAwareSubmitTurnTaskBundle = Readonly<{
  base: ValidatedSubmitTurnTaskBundle;
  record: TaskAuthorizationPersistenceRecord;
}>;

export type ValidatedReasoningAwareAuthorizationSubmitTurnTaskBundle = Readonly<{
  base: ValidatedSubmitTurnTaskBundle<ReasoningAwareSubmitTurnTaskBundle>;
  record: TaskAuthorizationPersistenceRecord;
}>;

export function parseTaskAuthorizationPersistenceRecord(
  input: unknown,
): TaskAuthorizationPersistenceRecord {
  const parsed = TaskAuthorizationPersistenceRecordSchema.parse(input);
  if (
    !hasValidTaskAuthorizationSelection(parsed.selection)
    || !hasValidTaskExecutionSelectionIdentity(parsed.executionIdentity)
    || parsed.selection.taskId !== parsed.executionIdentity.taskId
    || parsed.selection.runtimeSelectionId
      !== parsed.executionIdentity.runtimeSelectionId
    || parsed.selection.authorizationSelectionDigest
      !== parsed.executionIdentity.authorizationSelectionDigest
  ) {
    throw new Error("Task authorization persistence record is invalid");
  }
  return structuredClone(parsed);
}

export function validateTaskAuthorizationRecordAgainstRuntimeSelection(
  input: unknown,
  runtimeSelection: ReadableTaskRuntimeSelectionV1Alpha4,
): TaskAuthorizationPersistenceRecord {
  const record = parseTaskAuthorizationPersistenceRecord(input);
  const parsedRuntimeSelection = parseReadableTaskRuntimeSelectionV1Alpha4(
    runtimeSelection,
  );
  if (
    record.selection.taskId !== parsedRuntimeSelection.taskId
    || record.selection.runtimeSelectionId
      !== parsedRuntimeSelection.runtimeSelectionId
    || record.executionIdentity.runtimeSelectionDigest
      !== parsedRuntimeSelection.selectionDigest
  ) {
    throw new Error("Task authorization record does not match Runtime Selection");
  }
  return record;
}

export function validateAuthorizationAwareSubmitTurnTaskBundle(
  input: AuthorizationAwareSubmitTurnTaskBundle,
): ValidatedAuthorizationAwareSubmitTurnTaskBundle | PersistenceWriteFailure {
  const base = validateSubmitTurnTaskBundle(input);
  if ("ok" in base) return base;
  try {
    const record = validateTaskAuthorizationRecordAgainstRuntimeSelection(
      {
        selection: input.selection,
        executionIdentity: input.executionIdentity,
      },
      base.input.runtimeSelection,
    );
    return { base, record };
  } catch {
    return failure(
      "persistence.invalid_authorization_selection",
      "Task authorization selection is invalid",
    );
  }
}

export function validateReasoningAwareAuthorizationSubmitTurnTaskBundle(
  input: ReasoningAwareAuthorizationSubmitTurnTaskBundle,
): ValidatedReasoningAwareAuthorizationSubmitTurnTaskBundle
  | PersistenceWriteFailure {
  const base = validateReasoningAwareSubmitTurnTaskBundle(input);
  if ("ok" in base) return base;
  try {
    const record = validateTaskAuthorizationRecordAgainstRuntimeSelection(
      {
        selection: input.selection,
        executionIdentity: input.executionIdentity,
      },
      base.input.runtimeSelection,
    );
    return { base, record };
  } catch {
    return failure(
      "persistence.invalid_authorization_selection",
      "Task authorization selection is invalid",
    );
  }
}

export function taskAuthorizationCoverageDigest(
  runtimeSelections: readonly ReadableTaskRuntimeSelection[],
): string {
  const material = runtimeSelections
    .map((candidate) => parseReadableTaskRuntimeSelection(candidate))
    .map((selection) => ({
      taskId: selection.taskId,
      runtimeSelectionId: selection.runtimeSelectionId,
      selectionDigest: selection.selectionDigest,
    }))
    .sort((left, right) => left.taskId.localeCompare(right.taskId));
  return sha256CanonicalJson(JsonValueSchema.parse(material));
}

export function sameTaskAuthorizationPersistenceRecord(
  left: TaskAuthorizationPersistenceRecord,
  right: TaskAuthorizationPersistenceRecord,
): boolean {
  return sha256CanonicalJson(JsonValueSchema.parse(left))
    === sha256CanonicalJson(JsonValueSchema.parse(right));
}
