import {
  EntityIdSchema,
  JsonValueSchema,
  TaskCapabilityLockSchema,
  TaskSubmitTurnBindingSchema,
  type TaskCapabilityLock,
  type TaskSubmitTurnBinding,
} from "@robothree/contracts";
import { TaskRuntimeSelectionV1Alpha3Schema } from
  "@robothree/contracts/runtime-selection/v1alpha3";

import {
  deriveTaskInstructionBindingV1FromValidatedSelection,
  validateTaskInstructionBindingV1,
} from "../application/instruction-bundle-domain.js";
import {
  hasValidTaskRuntimeSelectionV1Alpha3,
} from "../application/runtime-selection-revisions.js";
import {
  hasValidTaskAuthorizationSelection,
  hasValidTaskExecutionSelectionIdentity,
} from "../application/task-authorization-selection-service.js";
import type {
  PersistenceWriteFailure,
  R2D3SubmitTurnTaskBundle,
} from "../ports/task-persistence.js";
import { sha256CanonicalJson } from "./digest.js";
import {
  createR2D3TaskBundleBindingEnvelopeV1,
  type PersistedR2D3TaskBundleBindingEnvelopeV1,
} from "../application/r2d3-durable-acceptance.js";
import {
  failure,
  validateTaskCapabilityLock,
  validateTaskCreation,
} from "./validation.js";

export type ValidatedR2D3SubmitTurnTaskBundle = Readonly<{
  input: R2D3SubmitTurnTaskBundle;
  binding: TaskSubmitTurnBinding;
  bindingEnvelope: PersistedR2D3TaskBundleBindingEnvelopeV1;
}>;

export function validateR2D3SubmitTurnTaskBundle(
  input: R2D3SubmitTurnTaskBundle,
): ValidatedR2D3SubmitTurnTaskBundle | PersistenceWriteFailure {
  try {
    const commandId = EntityIdSchema.parse(input.submitTurnCommandId);
    const userMessageId = EntityIdSchema.parse(input.userMessageId);
    const task = validateTaskCreation(input.task);
    if ("ok" in task) return task;
    const locks: TaskCapabilityLock[] = [];
    for (const candidate of input.capabilityLocks) {
      const lock = validateTaskCapabilityLock(candidate);
      if ("ok" in lock) return lock;
      locks.push(TaskCapabilityLockSchema.parse(lock));
    }
    const selection = TaskRuntimeSelectionV1Alpha3Schema.parse(
      input.runtimeSelection,
    );
    if (!hasValidTaskRuntimeSelectionV1Alpha3(selection)) throw new Error();
    if (!hasValidTaskAuthorizationSelection(input.selection)
      || !hasValidTaskExecutionSelectionIdentity(input.executionIdentity)) {
      throw new Error();
    }
    if (
      locks.length === 0
      || new Set(locks.map((lock) => lock.lockId)).size !== locks.length
      || task.head.taskId !== selection.taskId
      || input.selection.taskId !== selection.taskId
      || input.selection.runtimeSelectionId !== selection.runtimeSelectionId
      || input.executionIdentity.taskId !== selection.taskId
      || input.executionIdentity.runtimeSelectionId !== selection.runtimeSelectionId
      || input.executionIdentity.runtimeSelectionDigest !== selection.selectionDigest
      || input.executionIdentity.authorizationSelectionDigest
        !== input.selection.authorizationSelectionDigest
      || locks.some((lock) => lock.taskId !== selection.taskId)
    ) throw new Error();
    const byId = new Map(locks.map((lock) => [lock.lockId, lock]));
    const orderedRefs = [selection.resolvedModelLock, ...selection.toolLocks];
    if (locks.length !== orderedRefs.length || orderedRefs.some((reference) => {
      const lock = byId.get(reference.lockId);
      return lock === undefined
        || lock.definitionSnapshot.capabilityId !== reference.capabilityId
        || lock.registryRevision !== selection.registryRevision
        || sha256CanonicalJson(JsonValueSchema.parse(lock)) !== reference.lockDigest;
    })) throw new Error();
    const binding = deriveR2D3SubmitTurnBinding({
      submitTurnCommandId: commandId,
      userMessageId,
      task,
      capabilityLocks: locks,
      runtimeSelection: selection,
      committedAt: input.committedAt,
    });
    if (JSON.stringify(binding) !== JSON.stringify(
      TaskSubmitTurnBindingSchema.parse(input.submitTurnBinding),
    )) throw new Error();
    const instruction = validateTaskInstructionBindingV1(
      input.taskInstructionBinding,
    );
    const derivedInstruction = deriveTaskInstructionBindingV1FromValidatedSelection({
      runtimeSelection: selection,
      submitTurnBundleDigest: binding.bundleDigest,
      assemblyRevision: instruction.assemblyRevision,
    });
    if (JSON.stringify(instruction) !== JSON.stringify(derivedInstruction)) {
      return failure(
        "r2d.instruction_binding_invalid",
        "Task instruction binding does not match the exact Task bundle",
      );
    }
    const normalizedInput: R2D3SubmitTurnTaskBundle = {
      ...input,
      submitTurnCommandId: commandId,
      userMessageId,
      task,
      capabilityLocks: locks,
      runtimeSelection: selection,
      submitTurnBinding: binding,
      taskInstructionBinding: instruction,
    };
    return {
      input: normalizedInput,
      binding,
      bindingEnvelope: createR2D3TaskBundleBindingEnvelopeV1({
        submitTurnBinding: binding,
        taskInstructionBinding: instruction,
      }),
    };
  } catch {
    return failure(
      "r2d.task_bundle_invalid",
      "R2D3 Task bundle cannot be verified",
    );
  }
}

export function deriveR2D3SubmitTurnBinding(input: Readonly<{
  submitTurnCommandId: string;
  userMessageId: string;
  task: R2D3SubmitTurnTaskBundle["task"];
  capabilityLocks: readonly TaskCapabilityLock[];
  runtimeSelection: R2D3SubmitTurnTaskBundle["runtimeSelection"];
  committedAt: string;
}>): TaskSubmitTurnBinding {
  const commandId = EntityIdSchema.parse(input.submitTurnCommandId);
  const userMessageId = EntityIdSchema.parse(input.userMessageId);
  const normalized = {
    submitTurnCommandId: commandId,
    userMessageId,
    task: input.task,
    capabilityLocks: input.capabilityLocks,
    runtimeSelection: input.runtimeSelection,
    committedAt: input.committedAt,
  };
  return TaskSubmitTurnBindingSchema.parse({
    schemaVersion: "v1alpha1",
    submitTurnCommandId: commandId,
    taskId: input.task.head.taskId,
    userMessageId,
    runtimeSelectionId: input.runtimeSelection.runtimeSelectionId,
    bundleDigest: sha256CanonicalJson(JsonValueSchema.parse(normalized)),
    committedAt: input.committedAt,
  });
}
