import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { JsonObjectSchema } from "../runtime/json.js";
import { PersistenceSchemaVersionSchema } from "./common.js";

export const OutboxRecordSchema = z.object({
  schemaVersion: PersistenceSchemaVersionSchema,
  outboxId: EntityIdSchema,
  eventId: EntityIdSchema,
  taskId: EntityIdSchema,
  destination: z.string().min(1),
  payload: JsonObjectSchema,
  attemptCount: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
  nextAttemptAt: TimestampSchema.optional(),
  publishedAt: TimestampSchema.optional(),
}).superRefine((record, context) => {
  if (record.publishedAt !== undefined && Date.parse(record.publishedAt) < Date.parse(record.createdAt)) {
    context.addIssue({ code: "custom", message: "outbox publishedAt cannot predate creation" });
  }
  if (record.nextAttemptAt !== undefined && Date.parse(record.nextAttemptAt) < Date.parse(record.createdAt)) {
    context.addIssue({ code: "custom", message: "outbox nextAttemptAt cannot predate creation" });
  }
  if (record.publishedAt !== undefined && record.nextAttemptAt !== undefined) {
    context.addIssue({ code: "custom", message: "published outbox cannot retain a next attempt time" });
  }
});

export type OutboxRecord = z.infer<typeof OutboxRecordSchema>;
