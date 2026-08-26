import {
  EntityIdSchema,
  JsonValueSchema,
  TaskSubmitTurnBindingSchema,
} from "@robothree/contracts";
import type {
  TaskCapabilityLock,
  TaskSubmitTurnBinding,
} from "@robothree/contracts";

import type {
  PersistenceWriteFailure,
  ReasoningAwareSubmitTurnTaskBundle,
  SubmitTurnTaskBundle,
} from "../ports/task-persistence.js";
import { parseReadableTaskRuntimeSelection } from
  "../application/runtime-selection-revisions.js";
import { sha256CanonicalJson } from "./digest.js";
import {
  failure,
  validateTaskCapabilityLock,
  validateTaskCreation,
} from "./validation.js";

type ReadableSubmitTurnTaskBundle =
  | SubmitTurnTaskBundle
  | ReasoningAwareSubmitTurnTaskBundle;

export type ValidatedSubmitTurnTaskBundle<
  T extends ReadableSubmitTurnTaskBundle = SubmitTurnTaskBundle,
> = {
  input: T;
  binding: TaskSubmitTurnBinding;
};

export function validateSubmitTurnTaskBundle(
  input: SubmitTurnTaskBundle,
): ValidatedSubmitTurnTaskBundle | PersistenceWriteFailure {
  return validateReadableSubmitTurnTaskBundle(input);
}

export function validateReasoningAwareSubmitTurnTaskBundle(
  input: ReasoningAwareSubmitTurnTaskBundle,
): ValidatedSubmitTurnTaskBundle<ReasoningAwareSubmitTurnTaskBundle>
  | PersistenceWriteFailure {
  const validated = validateReadableSubmitTurnTaskBundle(input);
  if ("ok" in validated) return validated;
  return validated.input.runtimeSelection.schemaVersion === "v1alpha2"
    ? validated
    : failure(
      "persistence.invalid_submit_turn_bundle",
      "Reasoning-aware Task bundle requires Runtime Selection v1alpha2",
    );
}

function validateReadableSubmitTurnTaskBundle<T extends ReadableSubmitTurnTaskBundle>(
  input: T,
): ValidatedSubmitTurnTaskBundle<T> | PersistenceWriteFailure {
  const commandId = EntityIdSchema.safeParse(input.submitTurnCommandId);
  const userMessageId = EntityIdSchema.safeParse(input.userMessageId);
  if (!commandId.success || !userMessageId.success) {
    return failure(
      "persistence.invalid_submit_turn_bundle",
      "SubmitTurn bundle IDs are invalid",
    );
  }
  const task = validateTaskCreation(input.task);
  if ("ok" in task) return task;
  const locks: TaskCapabilityLock[] = [];
  for (const candidate of input.capabilityLocks) {
    const lock = validateTaskCapabilityLock(candidate);
    if ("ok" in lock) return lock;
    locks.push(lock);
  }
  if (locks.length === 0) {
    return failure(
      "persistence.invalid_submit_turn_bundle",
      "SubmitTurn bundle requires at least the resolved Model lock",
    );
  }
  if (
    new Set(locks.map((lock) => lock.lockId)).size !== locks.length
    || new Set(locks.map((lock) => lock.definitionSnapshot.capabilityId)).size
      !== locks.length
  ) {
    return failure(
      "persistence.invalid_submit_turn_bundle",
      "SubmitTurn bundle capability locks must be unique",
    );
  }
  let selection;
  try {
    selection = parseReadableTaskRuntimeSelection(input.runtimeSelection);
  } catch {
    return failure(
      "persistence.invalid_submit_turn_bundle",
      "SubmitTurn bundle runtime selection is invalid",
    );
  }
  if (
    task.head.taskId !== selection.taskId
    || locks.some((lock) => lock.taskId !== task.head.taskId)
    || task.checkpoint.state.sessionId === undefined
  ) {
    return failure(
      "persistence.invalid_submit_turn_bundle",
      "SubmitTurn bundle facts must target one Task with a Session",
    );
  }
  const byId = new Map(locks.map((lock) => [lock.lockId, lock]));
  if (![selection.resolvedModelLock, ...selection.toolLocks].every((reference) => {
    const lock = byId.get(reference.lockId);
    return lock !== undefined
      && lock.registryRevision === selection.registryRevision
      && lock.definitionSnapshot.capabilityId === reference.capabilityId
      && sha256CanonicalJson(JsonValueSchema.parse(lock)) === reference.lockDigest;
  })) {
    return failure(
      "persistence.invalid_submit_turn_bundle",
      "SubmitTurn selection does not reference the exact bundled locks",
    );
  }
  const normalized = {
    submitTurnCommandId: commandId.data,
    userMessageId: userMessageId.data,
    task,
    capabilityLocks: locks,
    runtimeSelection: structuredClone(selection),
    committedAt: input.committedAt,
  } as unknown as T;
  const bundleDigest = sha256CanonicalJson(JsonValueSchema.parse(normalized));
  const binding = TaskSubmitTurnBindingSchema.parse({
    schemaVersion: "v1alpha1",
    submitTurnCommandId: commandId.data,
    taskId: task.head.taskId,
    userMessageId: userMessageId.data,
    runtimeSelectionId: selection.runtimeSelectionId,
    bundleDigest,
    committedAt: input.committedAt,
  });
  return { input: normalized, binding };
}
