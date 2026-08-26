import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { SessionCommandTypeSchema } from "./session-command.js";
import { ConversationSchemaVersionSchema } from "./version.js";

export const SessionCommandRejectionReasonSchema = z.enum([
  "invalid_command",
  "command_digest_conflict",
  "pending_compaction_exists",
  "source_changed",
  "base_view_changed",
  "job_not_pending",
  "summary_invalid",
  "persistence_failed",
]);

const SessionCommandReceiptBaseFields = {
  schemaVersion: ConversationSchemaVersionSchema,
  commandId: EntityIdSchema,
  sessionId: EntityIdSchema,
  commandType: SessionCommandTypeSchema,
  commandDigest: Sha256DigestSchema,
  receivedAt: TimestampSchema,
};

const AcceptedSessionCommandReceiptSchema = z.object({
  ...SessionCommandReceiptBaseFields,
  outcome: z.literal("accepted"),
  contextRevision: z.number().int().nonnegative(),
  sessionEventId: EntityIdSchema,
  compactionJobId: EntityIdSchema,
  compactionId: EntityIdSchema.optional(),
}).strict().superRefine((receipt, context) => {
  if (receipt.commandType === "commit_compaction" && receipt.compactionId === undefined) {
    context.addIssue({
      code: "custom",
      message: "accepted commit_compaction receipt requires compactionId",
      path: ["compactionId"],
    });
  }
});

const RejectedSessionCommandReceiptSchema = z.object({
  ...SessionCommandReceiptBaseFields,
  outcome: z.literal("rejected"),
  contextRevision: z.number().int().nonnegative(),
  reasonCode: SessionCommandRejectionReasonSchema,
  retryable: z.boolean(),
}).strict();

export const SessionCommandReceiptSchema = z.discriminatedUnion("outcome", [
  AcceptedSessionCommandReceiptSchema,
  RejectedSessionCommandReceiptSchema,
]);

export type SessionCommandRejectionReason = z.infer<typeof SessionCommandRejectionReasonSchema>;
export type SessionCommandReceipt = z.infer<typeof SessionCommandReceiptSchema>;
