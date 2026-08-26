import { z } from "zod";

import { CapabilityIdSchema } from "../capability/common.js";
import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { CompactionSchemaVersionSchema } from "./version.js";

export const CompactionSourceRangeSchema = z.object({
  sourceStartSequence: z.number().int().positive(),
  sourceEndSequence: z.number().int().positive(),
  sourceDigest: Sha256DigestSchema,
}).strict().superRefine((source, context) => {
  if (source.sourceEndSequence < source.sourceStartSequence) {
    context.addIssue({
      code: "custom",
      message: "compaction sourceEndSequence cannot precede sourceStartSequence",
      path: ["sourceEndSequence"],
    });
  }
});

const SummarizerModelRefSchema = CapabilityIdSchema.refine(
  (capabilityId) => capabilityId.startsWith("model."),
  "summarizerModelRef must reference a model capability",
);

export const CompactionRecordSchema = z.object({
  schemaVersion: CompactionSchemaVersionSchema,
  compactionId: EntityIdSchema,
  compactionJobId: EntityIdSchema,
  sessionId: EntityIdSchema,
  sourceStartSequence: z.number().int().positive(),
  sourceEndSequence: z.number().int().positive(),
  sourceDigest: Sha256DigestSchema,
  baseActiveCompactionId: EntityIdSchema.optional(),
  baseContextRevision: z.number().int().nonnegative(),
  summary: z.string().min(1).max(262_144),
  summarySchemaVersion: z.string().trim().min(1).max(80),
  summarizerModelRef: SummarizerModelRefSchema,
  summarizerPromptRevision: Sha256DigestSchema,
  estimatedTokensBefore: z.number().int().positive(),
  estimatedTokensAfter: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
}).strict().superRefine((record, context) => {
  if (record.sourceEndSequence < record.sourceStartSequence) {
    context.addIssue({
      code: "custom",
      message: "compaction sourceEndSequence cannot precede sourceStartSequence",
      path: ["sourceEndSequence"],
    });
  }
  if (record.estimatedTokensAfter >= record.estimatedTokensBefore) {
    context.addIssue({
      code: "custom",
      message: "committed compaction must reduce estimated tokens",
      path: ["estimatedTokensAfter"],
    });
  }
});

export type CompactionSourceRange = z.infer<typeof CompactionSourceRangeSchema>;
export type CompactionRecord = z.infer<typeof CompactionRecordSchema>;
