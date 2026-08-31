import {
  JsonValueSchema,
  ModelRequestSchema,
  type ModelRequest,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import type {
  ModelRequestV1Alpha2,
  ModelReasoningV1Alpha2,
} from "@robothree/contracts/model-protocol/v1alpha2";
import {
  TaskRuntimeSelectionV1Alpha2Schema,
  type TaskRuntimeSelectionV1Alpha2,
} from "@robothree/contracts/runtime-selection/v1alpha2";
import {
  TaskRuntimeSelectionV1Alpha4Schema,
  type TaskRuntimeSelectionV1Alpha4,
} from "@robothree/contracts/runtime-selection/v1alpha4";

import { sha256CanonicalJson } from "../persistence/digest.js";
import type { ContextAssemblyReceipt } from "./context-types.js";
import { createModelRequestV1Alpha2 } from "./model-request-revisions.js";
import { validateReasoningModeLock } from "./reasoning-mode-lock-domain.js";
import { validateReasoningModeLockV1Alpha2 } from
  "./reasoning-mode-lock-v1alpha2-domain.js";
import {
  hasValidTaskRuntimeSelectionV1Alpha2,
  hasValidTaskRuntimeSelectionV1Alpha4,
} from "./runtime-selection-revisions.js";

type ReasoningRuntimeSelection = TaskRuntimeSelectionV1Alpha2 | TaskRuntimeSelectionV1Alpha4;

export type ReasoningAwareContextRequest = Readonly<{
  request: ModelRequestV1Alpha2;
  receipt: ContextAssemblyReceipt;
}>;

export class TaskReasoningRequestMaterializer {
  materialize(input: Readonly<{
    baseRequest: ModelRequest;
    runtimeSelection: ReasoningRuntimeSelection;
    modelLock: TaskCapabilityLock;
  }>): ModelRequestV1Alpha2 {
    const base = ModelRequestSchema.parse(input.baseRequest);
    const selection = input.runtimeSelection.schemaVersion === "v1alpha2"
      ? TaskRuntimeSelectionV1Alpha2Schema.parse(input.runtimeSelection)
      : TaskRuntimeSelectionV1Alpha4Schema.parse(input.runtimeSelection);
    const selectionValid = selection.schemaVersion === "v1alpha2"
      ? hasValidTaskRuntimeSelectionV1Alpha2(selection)
      : hasValidTaskRuntimeSelectionV1Alpha4(selection);
    if (!selectionValid) {
      throw new ReasoningRequestMaterializationError(
        "reasoning_lock_integrity_invalid",
        "Task Runtime Selection digest is invalid",
      );
    }
    const modelLockDigest = sha256CanonicalJson(JsonValueSchema.parse(input.modelLock));
    if (
      input.modelLock.lockId !== selection.resolvedModelLock.lockId
      || input.modelLock.definitionSnapshot.capabilityId
        !== selection.resolvedModelLock.capabilityId
      || modelLockDigest !== selection.resolvedModelLock.lockDigest
    ) {
      throw new ReasoningRequestMaterializationError(
        "reasoning_lock_integrity_invalid",
        "Model lock does not match the exact Runtime Selection",
      );
    }
    const lock = selection.schemaVersion === "v1alpha2"
      ? validateReasoningModeLock(selection.reasoningModeLock, {
        taskId: selection.taskId,
        modelLockRef: selection.resolvedModelLock,
      })
      : validateReasoningModeLockV1Alpha2(selection.reasoningModeLock, {
        taskId: selection.taskId,
        modelLockRef: selection.resolvedModelLock,
      });
    const reasoning: ModelReasoningV1Alpha2 = lock.resolution === "max_applied"
      ? {
        mode: "locked_max_strategy",
        reasoningModeLockId: lock.reasoningModeLockId,
        reasoningModeLockDigest: lock.reasoningModeLockDigest,
        strategyId: lock.strategyRef.strategyId,
        strategyRevision: lock.strategyRef.strategyRevision,
        strategyDigest: lock.strategyRef.strategyDigest,
        timeoutPolicyRef: lock.strategyRef.timeoutPolicyRef,
      }
      : {
        mode: "default_passthrough",
        reasoningModeLockId: lock.reasoningModeLockId,
        reasoningModeLockDigest: lock.reasoningModeLockDigest,
      };
    const { schemaVersion: _schemaVersion, requestDigest: _requestDigest, ...material } = base;
    return createModelRequestV1Alpha2({
      ...material,
      schemaVersion: "v1alpha2",
      reasoning,
    });
  }
}

export class ReasoningAwareContextRequestFinalizer {
  readonly #materializer: TaskReasoningRequestMaterializer;

  constructor(materializer: TaskReasoningRequestMaterializer = new TaskReasoningRequestMaterializer()) {
    this.#materializer = materializer;
  }

  finalize(input: Readonly<{
    request: ModelRequest;
    receipt: ContextAssemblyReceipt;
    runtimeSelection: ReasoningRuntimeSelection;
    modelLock: TaskCapabilityLock;
  }>): ReasoningAwareContextRequest {
    const request = this.#materializer.materialize({
      baseRequest: input.request,
      runtimeSelection: input.runtimeSelection,
      modelLock: input.modelLock,
    });
    return Object.freeze({
      request,
      receipt: Object.freeze({
        ...input.receipt,
        modelRequestDigest: request.requestDigest,
      }),
    });
  }
}

export class ReasoningRequestMaterializationError extends Error {
  readonly retryable = false;

  constructor(
    readonly code: "reasoning_lock_integrity_invalid",
    readonly safeSummary: string,
  ) {
    super(safeSummary);
    this.name = "ReasoningRequestMaterializationError";
  }
}
