import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { Sha256DigestSchema } from "../../persistence/common.js";
import {
  PersistedSubmitTurnReceiptSchema,
  SubmitTurnRecordSchema,
} from "../v1alpha1.js";
import {
  PersistedSubmitTurnReceiptV1Alpha2Schema,
  SubmitTurnRecordV1Alpha2Schema,
} from "../v1alpha2.js";
import {
  PersistedSubmitTurnReceiptV1Alpha3Schema,
  SubmitTurnRecordV1Alpha3Schema,
} from "../v1alpha3.js";

export const SUBMIT_TURN_COORDINATION_SCHEMA_VERSION_V1ALPHA4 =
  "v1alpha4" as const;
export const SubmitTurnCoordinationSchemaVersionV1Alpha4Schema = z.literal(
  SUBMIT_TURN_COORDINATION_SCHEMA_VERSION_V1ALPHA4,
);

export const SubmitTurnResourcePlanV1Alpha4Schema = z.object({
  resourceEntitlementSnapshotDigest: Sha256DigestSchema,
  agentResourceDecisionDigest: Sha256DigestSchema,
  plannedRuntimeSelectionDigest: Sha256DigestSchema,
  authorizationSelectionDigest: Sha256DigestSchema,
  executionSelectionDigest: Sha256DigestSchema,
  plannedTaskBundleDigest: Sha256DigestSchema,
  plannedInstructionBindingDigest: Sha256DigestSchema,
  modelLockId: EntityIdSchema,
  toolLockIds: z.array(EntityIdSchema).max(128),
  reasoningModeLockId: EntityIdSchema,
  durableAcceptanceRevision: Sha256DigestSchema,
  acceptanceReceiptIdentity: EntityIdSchema,
}).strict().superRefine((value, context) => {
  const capabilityLockIds = [value.modelLockId, ...value.toolLockIds];
  if (new Set(capabilityLockIds).size !== capabilityLockIds.length) {
    context.addIssue({ code: "custom", message: "resource plan lock IDs must be unique" });
  }
  if (capabilityLockIds.includes(value.reasoningModeLockId)) {
    context.addIssue({
      code: "custom",
      message: "Reasoning Mode lock identity must remain separate from capability lock IDs",
      path: ["reasoningModeLockId"],
    });
  }
});

export const SubmitTurnRecordV1Alpha4Schema = z.object({
  ...SubmitTurnRecordV1Alpha3Schema.shape,
  schemaVersion: SubmitTurnCoordinationSchemaVersionV1Alpha4Schema,
  resourcePlan: SubmitTurnResourcePlanV1Alpha4Schema,
}).strict().superRefine((value, context) => {
  if (value.lockedAgent.revision !== value.lockedAgent.digest) {
    context.addIssue({
      code: "custom",
      message: "locked Agent revision and digest must match",
      path: ["lockedAgent"],
    });
  }
  if (new Set(value.capabilityLockIds).size !== value.capabilityLockIds.length) {
    context.addIssue({
      code: "custom",
      message: "capabilityLockIds must be unique",
      path: ["capabilityLockIds"],
    });
  }
  if ((value.status === "failed_terminal") !== (value.lastFailure !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "only failed_terminal records require lastFailure",
      path: ["lastFailure"],
    });
  }
  if (value.loopStartedAt !== undefined && value.status !== "completed") {
    context.addIssue({
      code: "custom",
      message: "only completed records may mark the Agent Loop started",
      path: ["loopStartedAt"],
    });
  }
  if (
    value.authorizationPlan.requestedMode
      !== value.selectionRequest.authorizationPreference.requestedMode
  ) {
    context.addIssue({
      code: "custom",
      message: "authorization plan must match the requested authorization mode",
      path: ["authorizationPlan", "requestedMode"],
    });
  }
  const lock = value.reasoningPlan.reasoningModeLock;
  if (lock.taskId !== value.internalTaskId) {
    context.addIssue({
      code: "custom",
      message: "reasoning plan lock must belong to the planned Task",
      path: ["reasoningPlan", "reasoningModeLock", "taskId"],
    });
  }
  if (value.reasoningPlan.plannedRuntimeSelectionDigest !== value.plannedSelectionDigest) {
    context.addIssue({
      code: "custom",
      message: "reasoning plan must bind the exact planned Runtime Selection digest",
      path: ["reasoningPlan", "plannedRuntimeSelectionDigest"],
    });
  }
  const requested = value.selectionRequest.reasoningPreference;
  if (requested.requestedMode !== lock.requestedMode) {
    context.addIssue({
      code: "custom",
      message: "reasoning plan must match the requested reasoning mode",
      path: ["reasoningPlan", "reasoningModeLock", "requestedMode"],
    });
  } else if (requested.requestedMode === "max" && lock.requestedMode === "max") {
    if (
      requested.observedMaxSupport !== lock.observedMaxSupport
      || requested.observedMaxSupportRevision !== lock.observedMaxSupportRevision
    ) {
      context.addIssue({
        code: "custom",
        message: "reasoning plan must bind the exact observed Max support fact",
        path: ["reasoningPlan", "reasoningModeLock", "observedMaxSupportRevision"],
      });
    }
  }

  const plan = value.resourcePlan;
  if (
    plan.plannedRuntimeSelectionDigest !== value.plannedSelectionDigest
    || plan.plannedRuntimeSelectionDigest
      !== value.reasoningPlan.plannedRuntimeSelectionDigest
  ) {
    context.addIssue({
      code: "custom",
      message: "resource plan must bind the exact planned Runtime Selection digest",
      path: ["resourcePlan", "plannedRuntimeSelectionDigest"],
    });
  }
  if (
    plan.authorizationSelectionDigest
      !== value.authorizationPlan.authorizationSelectionDigest
    || plan.executionSelectionDigest
      !== value.authorizationPlan.executionSelectionDigest
  ) {
    context.addIssue({
      code: "custom",
      message: "resource plan must bind the exact authorization identities",
      path: ["resourcePlan", "authorizationSelectionDigest"],
    });
  }
  if (plan.reasoningModeLockId !== lock.reasoningModeLockId) {
    context.addIssue({
      code: "custom",
      message: "resource plan must bind the exact Reasoning Mode lock identity",
      path: ["resourcePlan", "reasoningModeLockId"],
    });
  }
  const plannedCapabilityLockIds = [plan.modelLockId, ...plan.toolLockIds];
  if (
    plannedCapabilityLockIds.length !== value.capabilityLockIds.length
    || plannedCapabilityLockIds.some(
      (lockId, index) => value.capabilityLockIds[index] !== lockId,
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "resource plan must bind the exact ordered capability lock IDs",
      path: ["resourcePlan", "modelLockId"],
    });
  }
});

export const ReadableSubmitTurnRecordV1Alpha4Schema = z.union([
  SubmitTurnRecordSchema,
  SubmitTurnRecordV1Alpha2Schema,
  SubmitTurnRecordV1Alpha3Schema,
  SubmitTurnRecordV1Alpha4Schema,
]);

export const ReadablePersistedSubmitTurnReceiptV1Alpha4Schema = z.union([
  PersistedSubmitTurnReceiptSchema,
  PersistedSubmitTurnReceiptV1Alpha2Schema,
  PersistedSubmitTurnReceiptV1Alpha3Schema,
]);

export type SubmitTurnResourcePlanV1Alpha4 = z.infer<
  typeof SubmitTurnResourcePlanV1Alpha4Schema
>;
export type SubmitTurnRecordV1Alpha4 = z.infer<
  typeof SubmitTurnRecordV1Alpha4Schema
>;
export type ReadableSubmitTurnRecordV1Alpha4 = z.infer<
  typeof ReadableSubmitTurnRecordV1Alpha4Schema
>;
export type ReadablePersistedSubmitTurnReceiptV1Alpha4 = z.infer<
  typeof ReadablePersistedSubmitTurnReceiptV1Alpha4Schema
>;
