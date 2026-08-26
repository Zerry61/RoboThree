import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { ConversationSchemaVersionSchema } from "./version.js";

export const SessionHeadSchema = z.object({
  schemaVersion: ConversationSchemaVersionSchema,
  sessionId: EntityIdSchema,
  messageSequence: z.number().int().nonnegative(),
  sessionEventSequence: z.number().int().nonnegative(),
  contextRevision: z.number().int().nonnegative(),
  activeCompactionId: EntityIdSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((head, context) => {
  if (Date.parse(head.updatedAt) < Date.parse(head.createdAt)) {
    context.addIssue({
      code: "custom",
      message: "session head updatedAt cannot predate creation",
      path: ["updatedAt"],
    });
  }
  if (head.activeCompactionId !== undefined && head.contextRevision === 0) {
    context.addIssue({
      code: "custom",
      message: "active compaction requires a positive contextRevision",
      path: ["contextRevision"],
    });
  }
});

export type SessionHead = z.infer<typeof SessionHeadSchema>;
