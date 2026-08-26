import { z } from "zod";

import { RuntimeErrorSchema } from "../common/runtime-error.js";
import { TimestampSchema } from "../common/time.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import {
  SubmitTurnReceiptV1Alpha3Schema,
  TaskSelectionRequestV1Alpha3Schema,
} from "../desktop-local/v1alpha3/submit-turn.js";
import { ReasoningModeLockSchema } from "../reasoning-mode/lock.js";
import {
  PersistedSubmitTurnReceiptSchema,
  SubmitTurnRecordSchema,
} from "./v1alpha1.js";
import {
  PersistedSubmitTurnReceiptV1Alpha2Schema,
  SubmitTurnRecordV1Alpha2Schema,
} from "./v1alpha2.js";

export const SUBMIT_TURN_COORDINATION_SCHEMA_VERSION_V1ALPHA3 =
  "v1alpha3" as const;
export const SubmitTurnCoordinationSchemaVersionV1Alpha3Schema = z.literal(
  SUBMIT_TURN_COORDINATION_SCHEMA_VERSION_V1ALPHA3,
);

export const SubmitTurnReasoningPlanV1Alpha3Schema = z.object({
  reasoningModeLock: ReasoningModeLockSchema,
  plannedRuntimeSelectionDigest: Sha256DigestSchema,
}).strict();

export const SubmitTurnRecordV1Alpha3Schema = z.object({
  ...SubmitTurnRecordV1Alpha2Schema.shape,
  schemaVersion: SubmitTurnCoordinationSchemaVersionV1Alpha3Schema,
  transportContractVersion: z.literal("v1alpha3"),
  selectionRequest: TaskSelectionRequestV1Alpha3Schema,
  reasoningPlan: SubmitTurnReasoningPlanV1Alpha3Schema,
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
  if (!value.capabilityLockIds.includes(lock.modelLockRef.lockId)) {
    context.addIssue({
      code: "custom",
      message: "reasoning plan must reference the planned Model capability lock",
      path: ["reasoningPlan", "reasoningModeLock", "modelLockRef", "lockId"],
    });
  }
  if (value.capabilityLockIds.includes(lock.reasoningModeLockId)) {
    context.addIssue({
      code: "custom",
      message: "capabilityLockIds must not include the Reasoning Mode lock ID",
      path: ["capabilityLockIds"],
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
});

export const ReadableSubmitTurnRecordSchema = z.union([
  SubmitTurnRecordSchema,
  SubmitTurnRecordV1Alpha2Schema,
  SubmitTurnRecordV1Alpha3Schema,
]);

export const PersistedSubmitTurnReceiptV1Alpha3Schema =
  SubmitTurnReceiptV1Alpha3Schema.safeExtend({
    requestDigest: Sha256DigestSchema,
    completedAt: TimestampSchema,
    terminalError: RuntimeErrorSchema.optional(),
  }).strict().superRefine((value, context) => {
    if ((value.status === "rejected") !== (value.terminalError !== undefined)) {
      context.addIssue({
        code: "custom",
        message: "only rejected receipts require terminalError",
        path: ["terminalError"],
      });
    }
  });

export const ReadablePersistedSubmitTurnReceiptSchema = z.union([
  PersistedSubmitTurnReceiptSchema,
  PersistedSubmitTurnReceiptV1Alpha2Schema,
  PersistedSubmitTurnReceiptV1Alpha3Schema,
]);

export type SubmitTurnReasoningPlanV1Alpha3 = z.infer<
  typeof SubmitTurnReasoningPlanV1Alpha3Schema
>;
export type SubmitTurnRecordV1Alpha3 = z.infer<
  typeof SubmitTurnRecordV1Alpha3Schema
>;
export type ReadableSubmitTurnRecord = z.infer<
  typeof ReadableSubmitTurnRecordSchema
>;
export type PersistedSubmitTurnReceiptV1Alpha3 = z.infer<
  typeof PersistedSubmitTurnReceiptV1Alpha3Schema
>;
export type ReadablePersistedSubmitTurnReceipt = z.infer<
  typeof ReadablePersistedSubmitTurnReceiptSchema
>;
