import { z } from "zod";

import { CapabilityIdSchema } from "../capability/common.js";
import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { ContextSchemaVersionSchema } from "./version.js";

export const ConversationSnapshotSourceSchema = z.object({
  sessionId: EntityIdSchema,
  messageSequence: z.number().int().nonnegative(),
  contextRevision: z.number().int().nonnegative(),
  activeCompactionId: EntityIdSchema.optional(),
  messageStartSequence: z.number().int().positive().optional(),
  messageEndSequence: z.number().int().positive().optional(),
  messageDigest: Sha256DigestSchema,
}).strict().superRefine((source, context) => {
  if ((source.messageStartSequence === undefined) !== (source.messageEndSequence === undefined)) {
    context.addIssue({ code: "custom", message: "conversation source range must be complete" });
  }
  if (
    source.messageStartSequence !== undefined
    && source.messageEndSequence !== undefined
    && source.messageEndSequence < source.messageStartSequence
  ) {
    context.addIssue({ code: "custom", message: "conversation source range is reversed" });
  }
  if (source.messageEndSequence !== undefined && source.messageEndSequence > source.messageSequence) {
    context.addIssue({ code: "custom", message: "conversation source range exceeds SessionHead" });
  }
});

export const TaskCapabilityLockSnapshotSourceSchema = z.object({
  lockId: EntityIdSchema,
  capabilityId: CapabilityIdSchema,
  capabilityRevision: Sha256DigestSchema,
  registryRevision: Sha256DigestSchema,
  lockDigest: Sha256DigestSchema,
}).strict();

export const TaskSnapshotSourceSchema = z.object({
  taskId: EntityIdSchema,
  stateRevision: z.number().int().nonnegative(),
  lastEventSequence: z.number().int().nonnegative(),
  checkpointId: EntityIdSchema,
  stateDigest: Sha256DigestSchema,
  capabilityLocks: z.array(TaskCapabilityLockSnapshotSourceSchema),
}).strict().superRefine((source, context) => {
  const lockIds = source.capabilityLocks.map((lock) => lock.lockId);
  if (new Set(lockIds).size !== lockIds.length) {
    context.addIssue({ code: "custom", message: "Task snapshot capability locks must be unique" });
  }
  const capabilityIds = source.capabilityLocks.map((lock) => lock.capabilityId);
  if (new Set(capabilityIds).size !== capabilityIds.length) {
    context.addIssue({
      code: "custom",
      message: "Task snapshot can contain only one lock per capability",
    });
  }
});

const ConversationProjectionItemSchema = z.object({
  type: z.literal("conversation_message"),
  order: z.number().int().nonnegative(),
  sessionId: EntityIdSchema,
  messageId: EntityIdSchema,
  messageSequence: z.number().int().positive(),
  messageDigest: Sha256DigestSchema,
}).strict();

const TaskStateProjectionItemSchema = z.object({
  type: z.literal("task_state"),
  order: z.number().int().nonnegative(),
  taskId: EntityIdSchema,
  stateRevision: z.number().int().nonnegative(),
  checkpointId: EntityIdSchema,
  stateDigest: Sha256DigestSchema,
}).strict();

const TaskEventProjectionItemSchema = z.object({
  type: z.literal("task_event"),
  order: z.number().int().nonnegative(),
  taskId: EntityIdSchema,
  eventId: EntityIdSchema,
  eventSequence: z.number().int().positive(),
  eventDigest: Sha256DigestSchema,
}).strict();

export const TurnProjectionItemSchema = z.discriminatedUnion("type", [
  ConversationProjectionItemSchema,
  TaskStateProjectionItemSchema,
  TaskEventProjectionItemSchema,
]);

export const TurnContextSnapshotSchema = z.object({
  schemaVersion: ContextSchemaVersionSchema,
  snapshotId: EntityIdSchema,
  sessionId: EntityIdSchema,
  conversation: ConversationSnapshotSourceSchema,
  tasks: z.array(TaskSnapshotSourceSchema),
  projection: z.array(TurnProjectionItemSchema),
  sourceDigest: Sha256DigestSchema,
  createdAt: TimestampSchema,
}).strict().superRefine((snapshot, context) => {
  if (snapshot.conversation.sessionId !== snapshot.sessionId) {
    context.addIssue({ code: "custom", message: "conversation source must belong to snapshot sessionId" });
  }
  const taskIds = snapshot.tasks.map((source) => source.taskId);
  if (new Set(taskIds).size !== taskIds.length) {
    context.addIssue({ code: "custom", message: "snapshot task sources must be unique" });
  }
  if (snapshot.projection.some((item, index) => item.order !== index)) {
    context.addIssue({ code: "custom", message: "projection order must be contiguous and zero-based" });
  }
  const taskIdSet = new Set(taskIds);
  for (const item of snapshot.projection) {
    if (item.type === "conversation_message" && item.sessionId !== snapshot.sessionId) {
      context.addIssue({ code: "custom", message: "projected message belongs to another session" });
    }
    if (item.type !== "conversation_message" && !taskIdSet.has(item.taskId)) {
      context.addIssue({ code: "custom", message: "projected Task fact lacks a task source" });
    }
  }
});

export type ConversationSnapshotSource = z.infer<typeof ConversationSnapshotSourceSchema>;
export type TaskCapabilityLockSnapshotSource =
  z.infer<typeof TaskCapabilityLockSnapshotSourceSchema>;
export type TaskSnapshotSource = z.infer<typeof TaskSnapshotSourceSchema>;
export type TurnProjectionItem = z.infer<typeof TurnProjectionItemSchema>;
export type TurnContextSnapshot = z.infer<typeof TurnContextSnapshotSchema>;
