import {
  EntityIdSchema,
  JsonValueSchema,
  TaskCapabilityLockSchema,
  TaskSubmitTurnBindingSchema,
  type TaskCapabilityLock,
  type TaskSubmitTurnBinding,
} from "@robothree/contracts";
import { TaskRuntimeSelectionV1Alpha4Schema } from
  "@robothree/contracts/runtime-selection/v1alpha4";
import { SafeReasoningAdmissionEvidenceV1Alpha5Schema } from
  "@robothree/contracts/submit-turn-coordination/v1alpha5";

import {
  createDfi541TaskBundleEnvelopeV1,
  type PersistedDfi541TaskBundleEnvelopeV1,
} from "../application/dfi541-durable-acceptance.js";
import {
  deriveTaskInstructionBindingV1FromValidatedSelectionV1Alpha4,
  validateTaskInstructionBindingV1,
} from "../application/instruction-bundle-domain.js";
import { validateReasoningModeLockV1Alpha2 } from
  "../application/reasoning-mode-lock-v1alpha2-domain.js";
import { hasValidTaskRuntimeSelectionV1Alpha4 } from
  "../application/runtime-selection-revisions.js";
import {
  hasValidTaskAuthorizationSelection,
  hasValidTaskExecutionSelectionIdentity,
} from "../application/task-authorization-selection-service.js";
import type {
  Dfi541SubmitTurnTaskBundle,
  PersistenceWriteFailure,
} from "../ports/task-persistence.js";
import { sha256CanonicalJson } from "./digest.js";
import {
  failure,
  validateTaskCapabilityLock,
  validateTaskCreation,
} from "./validation.js";

export type ValidatedDfi541SubmitTurnTaskBundle = Readonly<{
  input: Dfi541SubmitTurnTaskBundle;
  binding: TaskSubmitTurnBinding;
  bindingEnvelope: PersistedDfi541TaskBundleEnvelopeV1;
}>;

export function validateDfi541SubmitTurnTaskBundle(
  input: Dfi541SubmitTurnTaskBundle,
): ValidatedDfi541SubmitTurnTaskBundle | PersistenceWriteFailure {
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
    const runtimeSelection = TaskRuntimeSelectionV1Alpha4Schema.parse(
      input.runtimeSelection,
    );
    if (!hasValidTaskRuntimeSelectionV1Alpha4(runtimeSelection)
      || !hasValidTaskAuthorizationSelection(input.selection)
      || !hasValidTaskExecutionSelectionIdentity(input.executionIdentity)) {
      throw new Error();
    }
    validateReasoningModeLockV1Alpha2(runtimeSelection.reasoningModeLock, {
      taskId: task.head.taskId,
      modelLockRef: runtimeSelection.resolvedModelLock,
      ...(input.resolutionEvidence === undefined
        ? {}
        : { resolutionEvidence: input.resolutionEvidence }),
    });
    const admitted = input.admissionEvidence.state === "admitted";
    if (admitted !== (runtimeSelection.reasoningModeLock.resolution === "max_applied")) {
      throw new Error();
    }
    const byId = new Map(locks.map((lock) => [lock.lockId, lock]));
    const orderedRefs = [runtimeSelection.resolvedModelLock, ...runtimeSelection.toolLocks];
    if (
      locks.length === 0
      || locks.length !== orderedRefs.length
      || task.head.taskId !== runtimeSelection.taskId
      || input.selection.taskId !== runtimeSelection.taskId
      || input.executionIdentity.runtimeSelectionDigest
        !== runtimeSelection.selectionDigest
      || locks.some((lock) => lock.taskId !== runtimeSelection.taskId)
      || orderedRefs.some((reference) => {
        const lock = byId.get(reference.lockId);
        return lock === undefined
          || lock.definitionSnapshot.capabilityId !== reference.capabilityId
          || lock.registryRevision !== runtimeSelection.registryRevision
          || sha256CanonicalJson(JsonValueSchema.parse(lock)) !== reference.lockDigest;
      })
    ) throw new Error();
    const binding = deriveBinding({
      submitTurnCommandId: commandId,
      userMessageId,
      task,
      capabilityLocks: locks,
      runtimeSelection,
      committedAt: input.committedAt,
    });
    if (JSON.stringify(binding) !== JSON.stringify(
      TaskSubmitTurnBindingSchema.parse(input.submitTurnBinding),
    )) throw new Error();
    const instruction = validateTaskInstructionBindingV1(input.taskInstructionBinding);
    const expectedInstruction =
      deriveTaskInstructionBindingV1FromValidatedSelectionV1Alpha4({
        runtimeSelection,
        submitTurnBundleDigest: binding.bundleDigest,
        assemblyRevision: instruction.assemblyRevision,
      });
    if (JSON.stringify(instruction) !== JSON.stringify(expectedInstruction)) {
      return failure("dfi541.instruction_binding_invalid",
        "Task instruction binding does not match the exact DFI-5.4.1 bundle");
    }
    const admissionEvidence = SafeReasoningAdmissionEvidenceV1Alpha5Schema.parse(
      input.admissionEvidence,
    );
    const normalized: Dfi541SubmitTurnTaskBundle = {
      ...input,
      submitTurnCommandId: commandId,
      userMessageId,
      task,
      capabilityLocks: locks,
      runtimeSelection,
      selection: input.selection,
      executionIdentity: input.executionIdentity,
      submitTurnBinding: binding,
      taskInstructionBinding: instruction,
      admissionEvidence,
      ...(input.resolutionEvidence === undefined
        ? {}
        : { resolutionEvidence: input.resolutionEvidence }),
    };
    return {
      input: normalized,
      binding,
      bindingEnvelope: createDfi541TaskBundleEnvelopeV1({
        submitTurnBinding: binding,
        taskInstructionBinding: instruction,
        admissionEvidence,
        ...(input.resolutionEvidence === undefined
          ? {}
          : { resolutionEvidence: input.resolutionEvidence }),
      }),
    };
  } catch {
    return failure("dfi541.task_bundle_invalid",
      "DFI-5.4.1 Task bundle cannot be verified");
  }
}

function deriveBinding(input: Readonly<{
  submitTurnCommandId: string;
  userMessageId: string;
  task: Dfi541SubmitTurnTaskBundle["task"];
  capabilityLocks: readonly TaskCapabilityLock[];
  runtimeSelection: Dfi541SubmitTurnTaskBundle["runtimeSelection"];
  committedAt: string;
}>): TaskSubmitTurnBinding {
  return TaskSubmitTurnBindingSchema.parse({
    schemaVersion: "v1alpha1",
    submitTurnCommandId: input.submitTurnCommandId,
    taskId: input.task.head.taskId,
    userMessageId: input.userMessageId,
    runtimeSelectionId: input.runtimeSelection.runtimeSelectionId,
    bundleDigest: sha256CanonicalJson(JsonValueSchema.parse(input)),
    committedAt: input.committedAt,
  });
}
