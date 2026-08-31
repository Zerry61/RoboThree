import {
  NamespacedResourceIdSchema,
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

import { validateTaskCapabilityLockRevisions } from "../registry/capability-revision.js";
import {
  LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
  ModelInvocationTimeoutPolicySchema,
  type ModelInvocationTimeoutPolicy,
} from "./model-invocation-timeout-policy.js";
import { parseReadableModelRequest } from "./model-request-revisions.js";
import {
  PERSONAL_MODEL_ADAPTER_DESCRIPTOR_ID,
  isPersonalModelLock,
} from "./personal-model-task-lock.js";
import {
  validatePersonalModelDefinition,
  type PersonalModelDefinition,
} from "./personal-model-domain.js";
import {
  ProviderReasoningMappingIntegrityError,
  ProviderReasoningTimeoutPolicyIdentitySchema,
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

export const LOCAL_PERSONAL_REASONING_TIMEOUT_POLICY_REF =
  "timeout.local-personal.model-invocation.v1" as const;

export const LocalPersonalReasoningProjectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("omit") }).strict(),
  z.object({
    mode: z.literal("apply"),
    providerFamily: z.literal("local_openai"),
    mappingRevision: Sha256DigestSchema,
    mappingDigest: Sha256DigestSchema,
    directive: z.object({
      kind: z.literal("openai_reasoning_effort"),
      effort: z.enum(["high", "xhigh"]),
    }).strict(),
  }).strict().superRefine((value, context) => {
    if (value.mappingRevision !== value.mappingDigest) {
      context.addIssue({
        code: "custom",
        path: ["mappingRevision"],
        message: "Local private mapping revision and digest must match",
      });
    }
  }),
]);

export type LocalPersonalReasoningProjection = z.infer<
  typeof LocalPersonalReasoningProjectionSchema
>;

export function deriveLocalPersonalReasoningProfileSubject(input: Readonly<{
  definition: PersonalModelDefinition;
  modelLock: TaskCapabilityLock;
  adapterDescriptorId: string;
  adapterDescriptorRevision: string;
}>): ReasoningProfileSubject {
  const definition = validatePersonalModelDefinition(input.definition);
  const lock = validateTaskCapabilityLockRevisions(input.modelLock);
  if (
    !isPersonalModelLock(lock)
    || lock.bindingSnapshot.configurationRef === undefined
    || lock.definitionSnapshot.capabilityId !== definition.personalModelId
    || lock.adapterDescriptorSnapshot.adapterDescriptorId
      !== NamespacedResourceIdSchema.parse(input.adapterDescriptorId)
    || lock.adapterDescriptorSnapshot.adapterDescriptorId
      !== PERSONAL_MODEL_ADAPTER_DESCRIPTOR_ID
    || lock.adapterDescriptorSnapshot.revision
      !== Sha256DigestSchema.parse(input.adapterDescriptorRevision)
  ) {
    throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  }
  return ReasoningProfileSubjectSchema.parse({
    authority: "local_personal",
    modelCapabilityId: definition.personalModelId,
    // Capability revision and Personal configuration revision are separate
    // digest domains. DFI-5.3.1 binds this field to the exact Task lock.
    modelCapabilityRevision: lock.definitionSnapshot.revision,
    adapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
    adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
    personalExecutionDefinitionDigest: definition.executionDefinitionDigest,
  });
}

export function localPersonalReasoningTimeoutPolicyIdentity(
  policy: ModelInvocationTimeoutPolicy,
): ProviderReasoningTimeoutPolicyIdentity {
  const parsed = ModelInvocationTimeoutPolicySchema.parse(policy);
  if (
    parsed.policyRevision !== LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.policyRevision
    || parsed.policyDigest !== LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.policyDigest
    || parsed.connectTimeoutMs !== LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.connectTimeoutMs
    || parsed.firstProgressTimeoutMs
      !== LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.firstProgressTimeoutMs
    || parsed.streamIdleTimeoutMs
      !== LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.streamIdleTimeoutMs
    || parsed.defaultOverallTimeoutMs
      !== LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1.defaultOverallTimeoutMs
  ) throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  return ProviderReasoningTimeoutPolicyIdentitySchema.parse({
    timeoutPolicyRef: LOCAL_PERSONAL_REASONING_TIMEOUT_POLICY_REF,
    timeoutPolicyRevision: parsed.policyRevision,
    timeoutPolicyDigest: parsed.policyDigest,
  });
}

export function projectLocalPersonalReasoningMapping(
  mapping: TaskLockedReasoningProviderMapping,
): LocalPersonalReasoningProjection {
  if (mapping.disposition === "omit") return Object.freeze({ mode: "omit" });
  if (
    mapping.providerFamily !== "local_openai"
    || mapping.directive.kind !== "openai_reasoning_effort"
  ) throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  return Object.freeze(LocalPersonalReasoningProjectionSchema.parse({
    mode: "apply",
    providerFamily: mapping.providerFamily,
    mappingRevision: mapping.mappingRevision,
    mappingDigest: mapping.mappingDigest,
    directive: mapping.directive,
  }));
}

/** Raw Adapter defence in depth. It never resolves Profile or mapping material. */
export function validateLocalPersonalReasoningProjection(input: Readonly<{
  request: ReadableModelRequest;
  runtimeSelection: unknown;
  projection: LocalPersonalReasoningProjection;
}>): Readonly<{
  request: ReadableModelRequest;
  projection: LocalPersonalReasoningProjection;
}> {
  const request = parseReadableModelRequest(input.request);
  const projection = LocalPersonalReasoningProjectionSchema.parse(input.projection);
  if (request.schemaVersion === "v1alpha1") {
    if (projection.mode !== "omit") {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
    }
    return Object.freeze({ request, projection });
  }
  const schemaVersion = typeof input.runtimeSelection === "object"
    && input.runtimeSelection !== null
    ? Reflect.get(input.runtimeSelection, "schemaVersion")
    : undefined;
  const selection = schemaVersion === "v1alpha4"
    ? TaskRuntimeSelectionV1Alpha4Schema.parse(input.runtimeSelection)
    : TaskRuntimeSelectionV1Alpha2Schema.parse(input.runtimeSelection);
  const selectionValid = selection.schemaVersion === "v1alpha4"
    ? hasValidTaskRuntimeSelectionV1Alpha4(selection)
    : hasValidTaskRuntimeSelectionV1Alpha2(selection);
  if (!selectionValid) {
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
    request.reasoning.reasoningModeLockId !== lock.reasoningModeLockId
    || request.reasoning.reasoningModeLockDigest !== lock.reasoningModeLockDigest
  ) throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  if (request.reasoning.mode === "default_passthrough") {
    if (projection.mode !== "omit") {
      throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
    }
    return Object.freeze({ request, projection });
  }
  if (projection.mode !== "apply") {
    throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  }
  if (lock.resolution !== "max_applied") {
    throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  }
  if (
    request.reasoning.strategyId !== lock.strategyRef.strategyId
    || request.reasoning.strategyRevision !== lock.strategyRef.strategyRevision
    || request.reasoning.strategyDigest !== lock.strategyRef.strategyDigest
    || request.reasoning.timeoutPolicyRef !== lock.strategyRef.timeoutPolicyRef
  ) throw new ProviderReasoningMappingIntegrityError("reasoning_mapping_conflict");
  return Object.freeze({ request, projection });
}
