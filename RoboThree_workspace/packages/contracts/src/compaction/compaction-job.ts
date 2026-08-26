import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { CompactionSchemaVersionSchema } from "./version.js";

export const CompactionFailureReasonSchema = z.enum([
  "summary_generation_failed",
  "summary_invalid",
  "source_changed",
  "base_view_changed",
  "cancelled",
  "recovery_exhausted",
]);

const CompactionJobBaseFields = {
  schemaVersion: CompactionSchemaVersionSchema,
  compactionJobId: EntityIdSchema,
  compactionId: EntityIdSchema,
  sessionId: EntityIdSchema,
  requestCommandId: EntityIdSchema,
  sourceStartSequence: z.number().int().positive(),
  sourceEndSequence: z.number().int().positive(),
  sourceDigest: Sha256DigestSchema,
  baseActiveCompactionId: EntityIdSchema.optional(),
  baseContextRevision: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};

const PendingCompactionJobSchema = z.object({
  ...CompactionJobBaseFields,
  status: z.literal("pending"),
}).strict();

const CompletedCompactionJobSchema = z.object({
  ...CompactionJobBaseFields,
  status: z.literal("completed"),
  commitCommandId: EntityIdSchema,
  completedAt: TimestampSchema,
}).strict();

const FailedCompactionJobSchema = z.object({
  ...CompactionJobBaseFields,
  status: z.literal("failed"),
  terminalCommandId: EntityIdSchema,
  failureReason: CompactionFailureReasonSchema,
  failedAt: TimestampSchema,
}).strict();

const StaleCompactionJobSchema = z.object({
  ...CompactionJobBaseFields,
  status: z.literal("stale"),
  terminalCommandId: EntityIdSchema,
  observedContextRevision: z.number().int().nonnegative(),
  observedActiveCompactionId: EntityIdSchema.optional(),
  staleAt: TimestampSchema,
}).strict();

export const CompactionJobSchema = z.discriminatedUnion("status", [
  PendingCompactionJobSchema,
  CompletedCompactionJobSchema,
  FailedCompactionJobSchema,
  StaleCompactionJobSchema,
]).superRefine((job, context) => {
  if (job.sourceEndSequence < job.sourceStartSequence) {
    context.addIssue({
      code: "custom",
      message: "compaction sourceEndSequence cannot precede sourceStartSequence",
      path: ["sourceEndSequence"],
    });
  }
  if (Date.parse(job.updatedAt) < Date.parse(job.createdAt)) {
    context.addIssue({
      code: "custom",
      message: "compaction job updatedAt cannot predate creation",
      path: ["updatedAt"],
    });
  }
  const terminalAt = job.status === "completed"
    ? job.completedAt
    : job.status === "failed"
      ? job.failedAt
      : job.status === "stale"
        ? job.staleAt
        : undefined;
  if (terminalAt !== undefined && Date.parse(terminalAt) < Date.parse(job.createdAt)) {
    context.addIssue({
      code: "custom",
      message: "compaction job terminal timestamp cannot predate creation",
    });
  }
});

export type CompactionFailureReason = z.infer<typeof CompactionFailureReasonSchema>;
export type CompactionJob = z.infer<typeof CompactionJobSchema>;
