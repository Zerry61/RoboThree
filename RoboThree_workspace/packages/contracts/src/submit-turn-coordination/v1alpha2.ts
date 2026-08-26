import { z } from "zod";

import { RuntimeErrorSchema } from "../common/runtime-error.js";
import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import {
  DesktopResourceIdSchema,
  Sha256DigestSchema,
} from "../desktop-local/v1alpha1/common.js";
import {
  ResolvedTaskAuthorizationV1Alpha2Schema,
  SubmitTurnReceiptV1Alpha2Schema,
  TaskSelectionRequestV1Alpha2Schema,
} from "../desktop-local/v1alpha2/submit-turn.js";
import {
  PersistedSubmitTurnReceiptSchema,
  SubmitTurnRecordSchema,
} from "./v1alpha1.js";

export const SUBMIT_TURN_COORDINATION_SCHEMA_VERSION_V1ALPHA2 =
  "v1alpha2" as const;
export const SubmitTurnCoordinationSchemaVersionV1Alpha2Schema = z.literal(
  SUBMIT_TURN_COORDINATION_SCHEMA_VERSION_V1ALPHA2,
);

export const SubmitTurnCoordinationStatusV1Alpha2Schema = z.enum([
  "accepted",
  "message_appended",
  "task_committed",
  "completed",
  "failed_terminal",
]);

export const SubmitTurnFailureV1Alpha2Schema = z.object({
  code: z.string().min(1).max(160),
  stage: z.enum([
    "validation",
    "message",
    "selection",
    "task_bundle",
    "completion",
  ]),
  safeSummary: z.string().min(1).max(4096),
}).strict();

export const SubmitTurnAuthorizationPlanV1Alpha2Schema =
  ResolvedTaskAuthorizationV1Alpha2Schema.safeExtend({
    executionSelectionDigest: Sha256DigestSchema,
  }).strict();

export const SubmitTurnRecordV1Alpha2Schema = z.object({
  schemaVersion: SubmitTurnCoordinationSchemaVersionV1Alpha2Schema,
  transportContractVersion: z.enum(["v1alpha1", "v1alpha2"]),
  submitTurnCommandId: EntityIdSchema,
  clientTurnId: z.string().min(8).max(160),
  desktopSessionId: DesktopResourceIdSchema,
  internalSessionId: EntityIdSchema,
  requestDigest: Sha256DigestSchema,
  selectionRequest: TaskSelectionRequestV1Alpha2Schema,
  lockedAgent: z.object({
    agentDefinitionId: DesktopResourceIdSchema,
    revision: Sha256DigestSchema,
    digest: Sha256DigestSchema,
  }).strict(),
  registryRevision: Sha256DigestSchema,
  platformPromptRevision: Sha256DigestSchema,
  enterpriseConfigRevision: Sha256DigestSchema.optional(),
  plannedSelectionDigest: Sha256DigestSchema,
  authorizationPlan: SubmitTurnAuthorizationPlanV1Alpha2Schema,
  capabilityLockIds: z.array(EntityIdSchema).min(1).max(129),
  internalUserMessageId: EntityIdSchema,
  internalTaskId: EntityIdSchema,
  internalRuntimeSelectionId: EntityIdSchema,
  initialCheckpointId: EntityIdSchema,
  status: SubmitTurnCoordinationStatusV1Alpha2Schema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  lastFailure: SubmitTurnFailureV1Alpha2Schema.optional(),
  loopStartedAt: TimestampSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.lockedAgent.revision !== value.lockedAgent.digest) {
    context.addIssue({
      code: "custom",
      message: "locked Agent revision and digest must match",
      path: ["lockedAgent"],
    });
  }
  if (
    new Set(value.capabilityLockIds).size !== value.capabilityLockIds.length
  ) {
    context.addIssue({
      code: "custom",
      message: "capabilityLockIds must be unique",
      path: ["capabilityLockIds"],
    });
  }
  if (
    (value.status === "failed_terminal") !== (value.lastFailure !== undefined)
  ) {
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
});

export const ReadableSubmitTurnRecordSchema = z.union([
  SubmitTurnRecordSchema,
  SubmitTurnRecordV1Alpha2Schema,
]);

export const PersistedSubmitTurnReceiptV1Alpha2Schema =
  SubmitTurnReceiptV1Alpha2Schema.safeExtend({
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
]);

export type SubmitTurnAuthorizationPlanV1Alpha2 = z.infer<
  typeof SubmitTurnAuthorizationPlanV1Alpha2Schema
>;
export type SubmitTurnRecordV1Alpha2 = z.infer<
  typeof SubmitTurnRecordV1Alpha2Schema
>;
export type ReadableSubmitTurnRecord = z.infer<
  typeof ReadableSubmitTurnRecordSchema
>;
export type PersistedSubmitTurnReceiptV1Alpha2 = z.infer<
  typeof PersistedSubmitTurnReceiptV1Alpha2Schema
>;
export type ReadablePersistedSubmitTurnReceipt = z.infer<
  typeof ReadablePersistedSubmitTurnReceiptSchema
>;
