import { z } from "zod";

import {
  DesktopCommandMetadataSchema,
  DesktopDisplayTextSchema,
  DesktopResourceIdSchema,
  DesktopSafeSummarySchema,
  TimestampSchema,
} from "./common.js";

export const CreateSessionCommandSchema = DesktopCommandMetadataSchema.extend({
  type: z.literal("create_session"),
  title: DesktopDisplayTextSchema.optional(),
}).strict();

export const RenameSessionCommandSchema = DesktopCommandMetadataSchema.extend({
  type: z.literal("rename_session"),
  sessionId: DesktopResourceIdSchema,
  title: DesktopDisplayTextSchema,
  expectedRevision: z.number().int().nonnegative(),
}).strict();

export const DeleteSessionCommandSchema = DesktopCommandMetadataSchema.extend({
  type: z.literal("delete_session"),
  sessionId: DesktopResourceIdSchema,
  expectedRevision: z.number().int().nonnegative(),
}).strict();

export const SessionSummarySchema = z.object({
  sessionId: DesktopResourceIdSchema,
  revision: z.number().int().nonnegative(),
  title: DesktopDisplayTextSchema,
  tombstoned: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();

export const MessageProjectionSchema = z.object({
  messageId: DesktopResourceIdSchema,
  sessionId: DesktopResourceIdSchema,
  sequence: z.number().int().positive(),
  role: z.enum(["user", "assistant", "tool"]),
  status: z.enum(["pending", "streaming", "completed", "failed"]),
  content: z.string().max(1024 * 1024),
  safeSummary: DesktopSafeSummarySchema.optional(),
  taskId: DesktopResourceIdSchema.optional(),
  createdAt: TimestampSchema,
}).strict();

export const TaskDisplayStatusSchema = z.enum([
  "preparing",
  "queued",
  "running",
  "waiting_input",
  "waiting_confirmation",
  "recovering",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "manual_attention",
]);

export const TaskSummaryProjectionSchema = z.object({
  taskId: DesktopResourceIdSchema,
  sessionId: DesktopResourceIdSchema,
  userMessageId: DesktopResourceIdSchema,
  revision: z.number().int().nonnegative(),
  displayStatus: TaskDisplayStatusSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  resolvedAgentId: DesktopResourceIdSchema,
  resolvedModelId: DesktopResourceIdSchema,
  failureSummary: DesktopSafeSummarySchema.optional(),
}).strict();

export const ConversationSnapshotSchema = z.object({
  sessionId: DesktopResourceIdSchema,
  sessionRevision: z.number().int().nonnegative(),
  messages: z.array(MessageProjectionSchema).max(500),
  activeTaskSummaries: z.array(TaskSummaryProjectionSchema).max(64),
  latestDurableCursor: z.string().min(1).max(512),
  hasMoreBefore: z.boolean(),
}).strict();

export type CreateSessionCommand = z.infer<typeof CreateSessionCommandSchema>;
export type RenameSessionCommand = z.infer<typeof RenameSessionCommandSchema>;
export type DeleteSessionCommand = z.infer<typeof DeleteSessionCommandSchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type MessageProjection = z.infer<typeof MessageProjectionSchema>;
export type TaskDisplayStatus = z.infer<typeof TaskDisplayStatusSchema>;
export type TaskSummaryProjection = z.infer<
  typeof TaskSummaryProjectionSchema
>;
export type ConversationSnapshot = z.infer<
  typeof ConversationSnapshotSchema
>;
