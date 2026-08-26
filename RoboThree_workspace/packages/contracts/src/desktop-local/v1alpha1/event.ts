import { z } from "zod";

import {
  DesktopLocalContractVersionSchema,
  DesktopResourceIdSchema,
  DesktopSafeSummarySchema,
  TimestampSchema,
} from "./common.js";
import { TaskDisplayStatusSchema } from "./session.js";

export const DurableDesktopPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("submit_turn_status_changed"),
    sessionId: DesktopResourceIdSchema,
    submitTurnCommandId: z.string().uuid(),
    taskId: DesktopResourceIdSchema.optional(),
    status: z.enum(["accepted", "rejected"]),
    queryRef: z.string().min(1).max(512),
  }).strict(),
  z.object({
    type: z.literal("message_committed"),
    sessionId: DesktopResourceIdSchema,
    messageId: DesktopResourceIdSchema,
    messageRevision: z.number().int().nonnegative(),
    status: z.enum(["completed", "failed"]),
    queryRef: z.string().min(1).max(512),
  }).strict(),
  z.object({
    type: z.literal("task_status_changed"),
    sessionId: DesktopResourceIdSchema,
    taskId: DesktopResourceIdSchema,
    taskRevision: z.number().int().nonnegative(),
    displayStatus: TaskDisplayStatusSchema,
    safeSummary: DesktopSafeSummarySchema.optional(),
    queryRef: z.string().min(1).max(512),
  }).strict(),
  z.object({
    type: z.literal("tool_activity_changed"),
    taskId: DesktopResourceIdSchema,
    activityId: DesktopResourceIdSchema,
    queryRef: z.string().min(1).max(512),
  }).strict(),
  z.object({
    type: z.literal("user_confirmation_changed"),
    taskId: DesktopResourceIdSchema,
    confirmationId: DesktopResourceIdSchema,
    queryRef: z.string().min(1).max(512),
  }).strict(),
  z.object({
    type: z.literal("runtime_notice"),
    noticeCode: z.string().min(3).max(128),
    safeSummary: DesktopSafeSummarySchema,
  }).strict(),
]);

export const EphemeralDesktopPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("assistant_token_delta"),
    sessionId: DesktopResourceIdSchema,
    messageId: DesktopResourceIdSchema,
    deltaSequence: z.number().int().nonnegative(),
    delta: z.string().min(1).max(64 * 1024),
  }).strict(),
  z.object({
    type: z.literal("progress_delta"),
    taskId: DesktopResourceIdSchema,
    progressKey: z.string().min(1).max(128),
    safeSummary: DesktopSafeSummarySchema,
  }).strict(),
]);

export const DurableDesktopEventEnvelopeSchema = z.object({
  contractVersion: DesktopLocalContractVersionSchema,
  eventId: z.string().uuid(),
  deliveryKind: z.literal("durable"),
  durableCursor: z.string().min(1).max(512),
  runtimeInstanceId: DesktopResourceIdSchema,
  emittedAt: TimestampSchema,
  payload: DurableDesktopPayloadSchema,
}).strict();

export const EphemeralDesktopEventEnvelopeSchema = z.object({
  contractVersion: DesktopLocalContractVersionSchema,
  eventId: z.string().uuid(),
  deliveryKind: z.literal("ephemeral"),
  runtimeInstanceId: DesktopResourceIdSchema,
  emittedAt: TimestampSchema,
  payload: EphemeralDesktopPayloadSchema,
}).strict();

export const DesktopEventEnvelopeSchema = z.discriminatedUnion(
  "deliveryKind",
  [DurableDesktopEventEnvelopeSchema, EphemeralDesktopEventEnvelopeSchema],
);

export const ReplayResetRequiredSchema = z.object({
  type: z.literal("replay_reset_required"),
  reason: z.enum([
    "unknown_cursor",
    "retention_window_exceeded",
    "old_projection_generation",
    "projection_cleaned",
  ]),
  snapshotQueryRef: z.string().min(1).max(512),
  replacementCursor: z.string().min(1).max(512),
}).strict();

export const DesktopHeartbeatSchema = z.object({
  type: z.literal("heartbeat"),
  runtimeInstanceId: DesktopResourceIdSchema,
  sentAt: TimestampSchema,
}).strict();

export type DesktopEventEnvelope = z.infer<
  typeof DesktopEventEnvelopeSchema
>;
export type EphemeralDesktopPayload = z.infer<
  typeof EphemeralDesktopPayloadSchema
>;
export type DurableDesktopEventEnvelope = z.infer<
  typeof DurableDesktopEventEnvelopeSchema
>;
export type EphemeralDesktopEventEnvelope = z.infer<
  typeof EphemeralDesktopEventEnvelopeSchema
>;
export type ReplayResetRequired = z.infer<
  typeof ReplayResetRequiredSchema
>;
export type DesktopHeartbeat = z.infer<typeof DesktopHeartbeatSchema>;
