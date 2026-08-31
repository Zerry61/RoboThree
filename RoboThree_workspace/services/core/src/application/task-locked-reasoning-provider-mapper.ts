import { JsonValueSchema } from "@robothree/contracts";
import type { ModelRequestV1Alpha2 } from "@robothree/contracts/model-protocol/v1alpha2";
import type {
  ReasoningProfile,
  ReasoningProfileSubject,
} from "@robothree/contracts/reasoning-mode/v1alpha1";
import {
  TaskRuntimeSelectionV1Alpha2Schema,
} from "@robothree/contracts/runtime-selection/v1alpha2";
import { TaskRuntimeSelectionV1Alpha4Schema } from
  "@robothree/contracts/runtime-selection/v1alpha4";

import type { ModelProviderInvocation } from "../ports/model-provider-invocation.js";
import type { ReasoningProfileSource } from "../ports/desktop-reasoning-mode.js";
import type { ProviderReasoningMappingSource } from
  "../ports/provider-reasoning-mapping-source.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import { validateTaskCapabilityLockRevisions } from "../registry/capability-revision.js";
import { parseReadableModelRequest } from "./model-request-revisions.js";
import {
  ProviderReasoningMappingIntegrityError,
  type ProviderReasoningFamily,
  type ProviderReasoningMapping,
  type ProviderReasoningPrivateDirective,
  type ProviderReasoningTimeoutPolicyIdentity,
  validateProviderReasoningMapping,
  validateProviderReasoningMappingRelease,
} from "./provider-reasoning-mapping-domain.js";
import { validateReasoningModeLock } from "./reasoning-mode-lock-domain.js";
import { validateReasoningModeLockV1Alpha2 } from
  "./reasoning-mode-lock-v1alpha2-domain.js";
import {
  hasValidTaskRuntimeSelectionV1Alpha2,
  hasValidTaskRuntimeSelectionV1Alpha4,
} from "./runtime-selection-revisions.js";

export type TaskLockedReasoningProviderMapping =
  | Readonly<{ disposition: "omit" }>
  | Readonly<{
    disposition: "apply";
    providerFamily: ProviderReasoningFamily;
    mappingRevision: string;
    mappingDigest: string;
    directive: ProviderReasoningPrivateDirective;
  }>;

export class TaskLockedReasoningProviderMapper {
  public constructor(private readonly dependencies: Readonly<{
    profiles: ReasoningProfileSource;
    mappings: ProviderReasoningMappingSource;
  }>) {}

  public async map(input: Readonly<{
    invocation: ModelProviderInvocation;
    providerFamily?: ProviderReasoningFamily;
    exactSubject?: ReasoningProfileSubject;
    timeoutPolicyIdentity?: ProviderReasoningTimeoutPolicyIdentity;
  }>): Promise<TaskLockedReasoningProviderMapping> {
    let request: ModelRequestV1Alpha2;
    let selection: ReturnType<typeof TaskRuntimeSelectionV1Alpha2Schema.parse>
      | ReturnType<typeof TaskRuntimeSelectionV1Alpha4Schema.parse>;
    try {
      const readable = parseReadableModelRequest(input.invocation.modelRequest);
      if (readable.schemaVersion !== "v1alpha2") throw new Error("unsupported request");
      request = readable;
      selection = input.invocation.runtimeSelection.schemaVersion === "v1alpha4"
        ? TaskRuntimeSelectionV1Alpha4Schema.parse(input.invocation.runtimeSelection)
        : TaskRuntimeSelectionV1Alpha2Schema.parse(input.invocation.runtimeSelection);
      const selectionValid = selection.schemaVersion === "v1alpha4"
        ? hasValidTaskRuntimeSelectionV1Alpha4(selection)
        : hasValidTaskRuntimeSelectionV1Alpha2(selection);
      if (!selectionValid) throw new Error("invalid selection");
      validateInvocationIdentity(input.invocation, request, selection);
    } catch {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
    }

    const lock = selection.schemaVersion === "v1alpha4"
      ? validateReasoningModeLockV1Alpha2(selection.reasoningModeLock, {
        taskId: selection.taskId,
        modelLockRef: selection.resolvedModelLock,
      })
      : validateReasoningModeLock(selection.reasoningModeLock, {
        taskId: selection.taskId,
        modelLockRef: selection.resolvedModelLock,
      });
    validateRequestReasoning(request, lock);
    if (request.reasoning.mode === "default_passthrough") {
      return Object.freeze({ disposition: "omit" });
    }
    if (
      input.providerFamily === undefined
      || input.exactSubject === undefined
      || input.timeoutPolicyIdentity === undefined
      || lock.resolution !== "max_applied"
    ) {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_unavailable");
    }

    const modelLock = validateTaskCapabilityLockRevisions(input.invocation.modelLock);
    if (
      input.exactSubject.modelCapabilityId !== modelLock.definitionSnapshot.capabilityId
      || input.exactSubject.modelCapabilityRevision !== modelLock.definitionSnapshot.revision
      || input.exactSubject.adapterDescriptorId
        !== modelLock.adapterDescriptorSnapshot.adapterDescriptorId
      || input.exactSubject.adapterDescriptorRevision
        !== modelLock.adapterDescriptorSnapshot.revision
    ) {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
    }

    let profile: ReasoningProfile | undefined;
    let matches: readonly ProviderReasoningMapping[];
    try {
      profile = await this.dependencies.profiles.loadExact(input.exactSubject);
      matches = await this.dependencies.mappings.loadExact({
        authority: input.exactSubject.authority,
        providerFamily: input.providerFamily,
        exactSubject: input.exactSubject,
        profileRef: lock.profileRef,
        strategyRef: lock.strategyRef,
      });
    } catch {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_unavailable");
    }
    if (profile === undefined) {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_unavailable");
    }
    if (matches.length === 0) {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_unavailable");
    }
    if (matches.length !== 1) {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
    }
    const mapping = validateProviderReasoningMapping(matches[0]!);
    if (
      mapping.timeoutPolicyIdentity.timeoutPolicyRef
        !== input.timeoutPolicyIdentity.timeoutPolicyRef
      || mapping.timeoutPolicyIdentity.timeoutPolicyRevision
        !== input.timeoutPolicyIdentity.timeoutPolicyRevision
      || mapping.timeoutPolicyIdentity.timeoutPolicyDigest
        !== input.timeoutPolicyIdentity.timeoutPolicyDigest
    ) {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
    }
    validateProviderReasoningMappingRelease({
      profile,
      mapping,
    });
    return Object.freeze({
      disposition: "apply",
      providerFamily: mapping.providerFamily,
      mappingRevision: mapping.mappingRevision,
      mappingDigest: mapping.mappingDigest,
      directive: mapping.typedPrivateDirective,
    });
  }
}

function validateInvocationIdentity(
  invocation: ModelProviderInvocation,
  request: ModelRequestV1Alpha2,
  selection: ReturnType<typeof TaskRuntimeSelectionV1Alpha2Schema.parse>
    | ReturnType<typeof TaskRuntimeSelectionV1Alpha4Schema.parse>,
): void {
  const lock = validateTaskCapabilityLockRevisions(invocation.modelLock);
  const lockDigest = sha256CanonicalJson(JsonValueSchema.parse(lock));
  if (
    invocation.taskId !== selection.taskId
    || invocation.modelRequest.requestId !== request.requestId
    || invocation.modelRequest.requestDigest !== request.requestDigest
    || request.model.capabilityId !== lock.definitionSnapshot.capabilityId
    || request.model.capabilityRevision !== lock.definitionSnapshot.revision
    || selection.resolvedModelLock.lockId !== lock.lockId
    || selection.resolvedModelLock.capabilityId !== lock.definitionSnapshot.capabilityId
    || selection.resolvedModelLock.lockDigest !== lockDigest
  ) throw new Error("invocation identity mismatch");
}

function validateRequestReasoning(
  request: ModelRequestV1Alpha2,
  lock: ReturnType<typeof validateReasoningModeLock>
    | ReturnType<typeof validateReasoningModeLockV1Alpha2>,
): void {
  if (
    request.reasoning.reasoningModeLockId !== lock.reasoningModeLockId
    || request.reasoning.reasoningModeLockDigest !== lock.reasoningModeLockDigest
  ) throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  if (request.reasoning.mode === "default_passthrough") {
    if (lock.resolution === "max_applied") {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
    }
    return;
  }
  if (
    lock.resolution !== "max_applied"
    || request.reasoning.strategyId !== lock.strategyRef.strategyId
    || request.reasoning.strategyRevision !== lock.strategyRef.strategyRevision
    || request.reasoning.strategyDigest !== lock.strategyRef.strategyDigest
    || request.reasoning.timeoutPolicyRef !== lock.strategyRef.timeoutPolicyRef
  ) throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
}
