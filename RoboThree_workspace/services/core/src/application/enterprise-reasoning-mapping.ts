import {
  JsonValueSchema,
  Sha256DigestSchema,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import type { ReadableModelRequest } from "@robothree/contracts/model-protocol/v1alpha2";
import {
  ReasoningProfileSubjectSchema,
  type ReasoningProfileSubject,
} from "@robothree/contracts/reasoning-mode/v1alpha1";
import { TaskRuntimeSelectionV1Alpha2Schema } from
  "@robothree/contracts/runtime-selection/v1alpha2";
import { TaskRuntimeSelectionV1Alpha4Schema } from
  "@robothree/contracts/runtime-selection/v1alpha4";
import { z } from "zod";

import type { ModelProviderInvocation } from "../ports/model-provider-invocation.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import { validateTaskCapabilityLockRevisions } from "../registry/capability-revision.js";
import {
  ProviderReasoningMappingIntegrityError,
  ProviderReasoningTimeoutPolicyIdentitySchema,
  type ProviderReasoningFamily,
  type ProviderReasoningTimeoutPolicyIdentity,
} from "./provider-reasoning-mapping-domain.js";
import { validateReasoningModeLock } from "./reasoning-mode-lock-domain.js";
import { validateReasoningModeLockV1Alpha2 } from
  "./reasoning-mode-lock-v1alpha2-domain.js";
import {
  hasValidTaskRuntimeSelectionV1Alpha2,
  hasValidTaskRuntimeSelectionV1Alpha4,
} from "./runtime-selection-revisions.js";
import type { TaskLockedReasoningProviderMapping } from
  "./task-locked-reasoning-provider-mapper.js";

export const EnterpriseReasoningSafeSidecarSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("default_passthrough"),
    reasoningModeLockId: z.uuid(),
    reasoningModeLockDigest: Sha256DigestSchema,
  }).strict(),
  z.object({
    mode: z.literal("locked_max_strategy"),
    reasoningModeLockId: z.uuid(),
    reasoningModeLockDigest: Sha256DigestSchema,
    profileId: z.string().min(3).max(160),
    profileRevision: Sha256DigestSchema,
    profileDigest: Sha256DigestSchema,
    strategyId: z.string().min(3).max(160),
    strategyRevision: Sha256DigestSchema,
    strategyDigest: Sha256DigestSchema,
    mappingRevision: Sha256DigestSchema,
    mappingDigest: Sha256DigestSchema,
    timeoutPolicyRef: z.string().min(3).max(160),
  }).strict().superRefine((value, context) => {
    if (value.profileRevision !== value.profileDigest) {
      context.addIssue({ code: "custom", path: ["profileRevision"], message: "profile mismatch" });
    }
    if (value.mappingRevision !== value.mappingDigest) {
      context.addIssue({ code: "custom", path: ["mappingRevision"], message: "mapping mismatch" });
    }
  }),
]);

export type EnterpriseReasoningSafeSidecar = z.infer<
  typeof EnterpriseReasoningSafeSidecarSchema
>;

export type EnterpriseReasoningMappingInstallation = Readonly<{
  mapper: Readonly<{
    map(input: Readonly<{
      invocation: ModelProviderInvocation;
      providerFamily?: ProviderReasoningFamily;
      exactSubject?: ReasoningProfileSubject;
      timeoutPolicyIdentity?: ProviderReasoningTimeoutPolicyIdentity;
    }>): Promise<TaskLockedReasoningProviderMapping>;
  }>;
  providerFamily: "enterprise_openai" | "enterprise_anthropic";
  timeoutPolicyIdentity: ProviderReasoningTimeoutPolicyIdentity;
}>;

export function createEnterpriseReasoningTimeoutPolicyIdentity(input: Readonly<{
  timeoutPolicyRef: string;
  timeoutPolicyRevision: string;
  streamIdleTimeoutMillis: number;
}>): ProviderReasoningTimeoutPolicyIdentity {
  if (
    !Number.isInteger(input.streamIdleTimeoutMillis)
    || input.streamIdleTimeoutMillis < 1
    || input.streamIdleTimeoutMillis > 300_000
  ) throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  const timeoutPolicyDigest = sha256CanonicalJson(JsonValueSchema.parse({
    timeoutPolicyRef: input.timeoutPolicyRef,
    timeoutPolicyRevision: input.timeoutPolicyRevision,
    providerStreamIdleTimeoutMillis: input.streamIdleTimeoutMillis,
  }));
  return ProviderReasoningTimeoutPolicyIdentitySchema.parse({
    timeoutPolicyRef: input.timeoutPolicyRef,
    timeoutPolicyRevision: input.timeoutPolicyRevision,
    timeoutPolicyDigest,
  });
}

export function deriveEnterpriseReasoningProfileSubject(input: Readonly<{
  modelLock: TaskCapabilityLock;
  adapterDescriptorId: string;
  adapterDescriptorRevision: string;
}>): ReasoningProfileSubject {
  const lock = validateTaskCapabilityLockRevisions(input.modelLock);
  if (
    lock.adapterDescriptorSnapshot.adapterDescriptorId !== input.adapterDescriptorId
    || lock.adapterDescriptorSnapshot.revision !== input.adapterDescriptorRevision
  ) throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  return ReasoningProfileSubjectSchema.parse({
    authority: "central_enterprise",
    modelCapabilityId: lock.definitionSnapshot.capabilityId,
    modelCapabilityRevision: lock.definitionSnapshot.revision,
    adapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
    adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
  });
}

export function projectEnterpriseReasoningSidecar(input: Readonly<{
  request: ReadableModelRequest;
  invocation: ModelProviderInvocation;
  mapping: TaskLockedReasoningProviderMapping;
}>): EnterpriseReasoningSafeSidecar {
  if (input.request.schemaVersion !== "v1alpha2") {
    throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  }
  const selection = input.invocation.runtimeSelection.schemaVersion === "v1alpha4"
    ? TaskRuntimeSelectionV1Alpha4Schema.parse(input.invocation.runtimeSelection)
    : TaskRuntimeSelectionV1Alpha2Schema.parse(input.invocation.runtimeSelection);
  const valid = selection.schemaVersion === "v1alpha4"
    ? hasValidTaskRuntimeSelectionV1Alpha4(selection)
    : hasValidTaskRuntimeSelectionV1Alpha2(selection);
  if (!valid) {
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
  if (
    input.request.reasoning.reasoningModeLockId !== lock.reasoningModeLockId
    || input.request.reasoning.reasoningModeLockDigest !== lock.reasoningModeLockDigest
  ) throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  if (input.mapping.disposition === "omit") {
    if (input.request.reasoning.mode !== "default_passthrough") {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
    }
    return EnterpriseReasoningSafeSidecarSchema.parse({
      mode: "default_passthrough",
      reasoningModeLockId: lock.reasoningModeLockId,
      reasoningModeLockDigest: lock.reasoningModeLockDigest,
    });
  }
  if (
    input.request.reasoning.mode !== "locked_max_strategy"
    || lock.resolution !== "max_applied"
    || input.mapping.providerFamily === "local_openai"
  ) throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  return EnterpriseReasoningSafeSidecarSchema.parse({
    mode: "locked_max_strategy",
    reasoningModeLockId: lock.reasoningModeLockId,
    reasoningModeLockDigest: lock.reasoningModeLockDigest,
    profileId: lock.profileRef.profileId,
    profileRevision: lock.profileRef.profileRevision,
    profileDigest: lock.profileRef.profileDigest,
    strategyId: lock.strategyRef.strategyId,
    strategyRevision: lock.strategyRef.strategyRevision,
    strategyDigest: lock.strategyRef.strategyDigest,
    mappingRevision: input.mapping.mappingRevision,
    mappingDigest: input.mapping.mappingDigest,
    timeoutPolicyRef: lock.strategyRef.timeoutPolicyRef,
  });
}
