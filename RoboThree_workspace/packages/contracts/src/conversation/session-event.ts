import { z } from "zod";

import { CompactionFailureReasonSchema } from "../compaction/compaction-job.js";
import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { ConversationSchemaVersionSchema } from "./version.js";

const SessionEventBaseFields = {
  schemaVersion: ConversationSchemaVersionSchema,
  eventId: EntityIdSchema,
  sessionId: EntityIdSchema,
  sequence: z.number().int().positive(),
  occurredAt: TimestampSchema,
  causationId: EntityIdSchema,
  correlationId: EntityIdSchema,
};

const CompactionRequestedSessionEventSchema = z.object({
  ...SessionEventBaseFields,
  type: z.literal("context.compaction_requested"),
  payload: z.object({
    compactionJobId: EntityIdSchema,
    compactionId: EntityIdSchema,
    sourceStartSequence: z.number().int().positive(),
    sourceEndSequence: z.number().int().positive(),
    sourceDigest: Sha256DigestSchema,
    baseActiveCompactionId: EntityIdSchema.optional(),
    baseContextRevision: z.number().int().nonnegative(),
  }).strict(),
}).strict();

const CompactionCommittedSessionEventSchema = z.object({
  ...SessionEventBaseFields,
  type: z.literal("context.compaction_committed"),
  payload: z.object({
    compactionJobId: EntityIdSchema,
    compactionId: EntityIdSchema,
    previousContextRevision: z.number().int().nonnegative(),
    contextRevision: z.number().int().positive(),
    sourceEndSequence: z.number().int().positive(),
  }).strict(),
}).strict();

const CompactionFailedSessionEventSchema = z.object({
  ...SessionEventBaseFields,
  type: z.literal("context.compaction_failed"),
  payload: z.object({
    compactionJobId: EntityIdSchema,
    failureReason: CompactionFailureReasonSchema,
  }).strict(),
}).strict();

const CompactionStaleSessionEventSchema = z.object({
  ...SessionEventBaseFields,
  type: z.literal("context.compaction_stale"),
  payload: z.object({
    compactionJobId: EntityIdSchema,
    observedContextRevision: z.number().int().nonnegative(),
    observedActiveCompactionId: EntityIdSchema.optional(),
  }).strict(),
}).strict();

export const SessionEventTypeSchema = z.enum([
  "context.compaction_requested",
  "context.compaction_committed",
  "context.compaction_failed",
  "context.compaction_stale",
]);

export const SessionEventSchema = z.discriminatedUnion("type", [
  CompactionRequestedSessionEventSchema,
  CompactionCommittedSessionEventSchema,
  CompactionFailedSessionEventSchema,
  CompactionStaleSessionEventSchema,
]).superRefine((event, context) => {
  if (
    event.type === "context.compaction_requested"
    && event.payload.sourceEndSequence < event.payload.sourceStartSequence
  ) {
    context.addIssue({
      code: "custom",
      message: "compaction sourceEndSequence cannot precede sourceStartSequence",
      path: ["payload", "sourceEndSequence"],
    });
  }
  if (
    event.type === "context.compaction_committed"
    && event.payload.contextRevision !== event.payload.previousContextRevision + 1
  ) {
    context.addIssue({
      code: "custom",
      message: "compaction commit event must increment contextRevision by one",
      path: ["payload", "contextRevision"],
    });
  }
});

export type SessionEventType = z.infer<typeof SessionEventTypeSchema>;
export type SessionEvent = z.infer<typeof SessionEventSchema>;
