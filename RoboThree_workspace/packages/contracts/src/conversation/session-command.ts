import { z } from "zod";

import { CompactionFailureReasonSchema } from "../compaction/compaction-job.js";
import { CompactionRecordSchema } from "../compaction/compaction-record.js";
import { CompactionSchemaVersionSchema } from "../compaction/version.js";
import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { Sha256DigestSchema, canonicalJsonStringify } from "../persistence/common.js";
import { JsonValueSchema } from "../runtime/json.js";
import { ConversationSchemaVersionSchema } from "./version.js";

const SessionCommandBaseFields = {
  schemaVersion: ConversationSchemaVersionSchema,
  commandId: EntityIdSchema,
  sessionId: EntityIdSchema,
  issuedAt: TimestampSchema,
};

const RequestCompactionSessionCommandSchema = z.object({
  ...SessionCommandBaseFields,
  type: z.literal("request_compaction"),
  compactionSchemaVersion: CompactionSchemaVersionSchema,
  compactionJobId: EntityIdSchema,
  compactionId: EntityIdSchema,
  sourceStartSequence: z.number().int().positive(),
  sourceEndSequence: z.number().int().positive(),
  sourceDigest: Sha256DigestSchema,
  baseActiveCompactionId: EntityIdSchema.optional(),
  baseContextRevision: z.number().int().nonnegative(),
}).strict();

const CommitCompactionSessionCommandSchema = z.object({
  ...SessionCommandBaseFields,
  type: z.literal("commit_compaction"),
  compactionJobId: EntityIdSchema,
  compactionId: EntityIdSchema,
  record: CompactionRecordSchema,
}).strict();

const FailCompactionSessionCommandSchema = z.object({
  ...SessionCommandBaseFields,
  type: z.literal("fail_compaction"),
  compactionJobId: EntityIdSchema,
  failureReason: CompactionFailureReasonSchema,
}).strict();

const MarkCompactionStaleSessionCommandSchema = z.object({
  ...SessionCommandBaseFields,
  type: z.literal("mark_compaction_stale"),
  compactionJobId: EntityIdSchema,
  observedContextRevision: z.number().int().nonnegative(),
  observedActiveCompactionId: EntityIdSchema.optional(),
}).strict();

export const SessionCommandTypeSchema = z.enum([
  "request_compaction",
  "commit_compaction",
  "fail_compaction",
  "mark_compaction_stale",
]);

export const SessionCommandSchema = z.discriminatedUnion("type", [
  RequestCompactionSessionCommandSchema,
  CommitCompactionSessionCommandSchema,
  FailCompactionSessionCommandSchema,
  MarkCompactionStaleSessionCommandSchema,
]).superRefine((command, context) => {
  if (
    command.type === "request_compaction"
    && command.sourceEndSequence < command.sourceStartSequence
  ) {
    context.addIssue({
      code: "custom",
      message: "compaction sourceEndSequence cannot precede sourceStartSequence",
      path: ["sourceEndSequence"],
    });
  }
  if (command.type === "commit_compaction") {
    if (command.record.sessionId !== command.sessionId) {
      context.addIssue({
        code: "custom",
        message: "compaction record must reference command sessionId",
        path: ["record", "sessionId"],
      });
    }
    if (command.record.compactionJobId !== command.compactionJobId) {
      context.addIssue({
        code: "custom",
        message: "compaction record must reference command compactionJobId",
        path: ["record", "compactionJobId"],
      });
    }
    if (command.record.compactionId !== command.compactionId) {
      context.addIssue({
        code: "custom",
        message: "compaction record must reference command compactionId",
        path: ["record", "compactionId"],
      });
    }
  }
});

export function canonicalSessionCommandStringify(input: SessionCommand): string {
  const parsed = SessionCommandSchema.parse(input);
  return canonicalJsonStringify(JsonValueSchema.parse(parsed));
}

export type SessionCommandType = z.infer<typeof SessionCommandTypeSchema>;
export type SessionCommand = z.infer<typeof SessionCommandSchema>;
