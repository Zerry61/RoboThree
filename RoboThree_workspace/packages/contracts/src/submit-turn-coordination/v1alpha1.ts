import { z } from "zod";

import { RuntimeErrorSchema } from "../common/runtime-error.js";
import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import {
  DesktopResourceIdSchema,
  Sha256DigestSchema,
} from "../desktop-local/v1alpha1/common.js";
import {
  SubmitTurnReceiptSchema,
  TaskSelectionRequestSchema,
} from "../desktop-local/v1alpha1/submit-turn.js";
import { TaskDisplayStatusSchema } from "../desktop-local/v1alpha1/session.js";

export const SUBMIT_TURN_COORDINATION_SCHEMA_VERSION = "v1alpha1" as const;
export const SubmitTurnCoordinationSchemaVersionSchema = z.literal(
  SUBMIT_TURN_COORDINATION_SCHEMA_VERSION,
);

export const SubmitTurnCoordinationStatusSchema = z.enum([
  "accepted",
  "message_appended",
  "task_committed",
  "completed",
  "failed_terminal",
]);

export const SubmitTurnFailureSchema = z.object({
  code: z.string().min(1).max(160),
  stage: z.enum(["validation", "message", "selection", "task_bundle", "completion"]),
  safeSummary: z.string().min(1).max(4096),
}).strict();

export const SubmitTurnRecordSchema = z.object({
  schemaVersion: SubmitTurnCoordinationSchemaVersionSchema,
  submitTurnCommandId: EntityIdSchema,
  clientTurnId: z.string().min(8).max(160),
  desktopSessionId: DesktopResourceIdSchema,
  internalSessionId: EntityIdSchema,
  requestDigest: Sha256DigestSchema,
  selectionRequest: TaskSelectionRequestSchema,
  lockedAgent: z.object({
    agentDefinitionId: DesktopResourceIdSchema,
    revision: Sha256DigestSchema,
    digest: Sha256DigestSchema,
  }).strict(),
  registryRevision: Sha256DigestSchema,
  platformPromptRevision: Sha256DigestSchema,
  enterpriseConfigRevision: Sha256DigestSchema.optional(),
  plannedSelectionDigest: Sha256DigestSchema,
  capabilityLockIds: z.array(EntityIdSchema).min(1).max(129),
  internalUserMessageId: EntityIdSchema,
  internalTaskId: EntityIdSchema,
  internalRuntimeSelectionId: EntityIdSchema,
  initialCheckpointId: EntityIdSchema,
  status: SubmitTurnCoordinationStatusSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  lastFailure: SubmitTurnFailureSchema.optional(),
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
});

export const TaskSubmitTurnBindingSchema = z.object({
  schemaVersion: SubmitTurnCoordinationSchemaVersionSchema,
  submitTurnCommandId: EntityIdSchema,
  taskId: EntityIdSchema,
  userMessageId: EntityIdSchema,
  runtimeSelectionId: EntityIdSchema,
  bundleDigest: Sha256DigestSchema,
  committedAt: TimestampSchema,
}).strict();

export const DesktopDeliveryRecordSchema = z.object({
  schemaVersion: SubmitTurnCoordinationSchemaVersionSchema,
  deliveryId: EntityIdSchema,
  sequence: z.number().int().positive(),
  submitTurnCommandId: EntityIdSchema,
  type: z.enum([
    "turn.accepted",
    "turn.rejected",
    "message.committed",
    "task.status_changed",
    "tool.activity_changed",
    "user_confirmation.changed",
  ]),
  sessionId: DesktopResourceIdSchema,
  userMessageId: DesktopResourceIdSchema.optional(),
  taskId: DesktopResourceIdSchema.optional(),
  messageId: DesktopResourceIdSchema.optional(),
  messageRevision: z.number().int().nonnegative().optional(),
  messageStatus: z.enum(["completed", "failed"]).optional(),
  taskRevision: z.number().int().nonnegative().optional(),
  taskDisplayStatus: TaskDisplayStatusSchema.optional(),
  activityId: DesktopResourceIdSchema.optional(),
  confirmationId: DesktopResourceIdSchema.optional(),
  createdAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  const accepted = value.type === "turn.accepted";
  const messageCommitted = value.type === "message.committed";
  const taskStatusChanged = value.type === "task.status_changed";
  const toolActivityChanged = value.type === "tool.activity_changed";
  const confirmationChanged = value.type === "user_confirmation.changed";
  if (accepted !== (value.userMessageId !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "only accepted delivery requires userMessageId",
    });
  }
  if (
    (accepted || messageCommitted || taskStatusChanged || toolActivityChanged
      || confirmationChanged)
    !== (value.taskId !== undefined)
  ) {
    context.addIssue({
      code: "custom",
      message: "accepted and message delivery require taskId",
    });
  }
  if (
    messageCommitted !== (
      value.messageId !== undefined
      && value.messageRevision !== undefined
      && value.messageStatus !== undefined
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "only message delivery requires committed Message fields",
    });
  }
  if (
    taskStatusChanged !== (
      value.taskRevision !== undefined
      && value.taskDisplayStatus !== undefined
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "only Task status delivery requires Task revision and display status",
    });
  }
  if (toolActivityChanged !== (value.activityId !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "only Tool Activity delivery requires activityId",
    });
  }
  if (confirmationChanged !== (value.confirmationId !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "only User Confirmation delivery requires confirmationId",
    });
  }
});

export const PersistedSubmitTurnReceiptSchema = SubmitTurnReceiptSchema.extend({
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

export type SubmitTurnCoordinationStatus = z.infer<
  typeof SubmitTurnCoordinationStatusSchema
>;
export type SubmitTurnFailure = z.infer<typeof SubmitTurnFailureSchema>;
export type SubmitTurnRecord = z.infer<typeof SubmitTurnRecordSchema>;
export type TaskSubmitTurnBinding = z.infer<
  typeof TaskSubmitTurnBindingSchema
>;
export type DesktopDeliveryRecord = z.infer<
  typeof DesktopDeliveryRecordSchema
>;
export type PersistedSubmitTurnReceipt = z.infer<
  typeof PersistedSubmitTurnReceiptSchema
>;
