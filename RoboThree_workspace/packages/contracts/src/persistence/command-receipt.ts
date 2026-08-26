import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { RuntimeErrorSchema } from "../common/runtime-error.js";
import { TimestampSchema } from "../common/time.js";
import { TaskCommandTypeSchema, TaskTransitionSchema } from "../runtime/task-command.js";
import { PersistenceSchemaVersionSchema, Sha256DigestSchema } from "./common.js";

const CommandReceiptBaseSchema = z.object({
  schemaVersion: PersistenceSchemaVersionSchema,
  commandId: EntityIdSchema,
  taskId: EntityIdSchema,
  commandType: TaskCommandTypeSchema,
  commandDigest: Sha256DigestSchema,
  receivedAt: TimestampSchema,
});

const AcceptedCommandReceiptSchema = CommandReceiptBaseSchema.extend({
  outcome: z.literal("accepted"),
  stateRevision: z.number().int().positive(),
  eventId: EntityIdSchema,
  checkpointId: EntityIdSchema,
  transition: TaskTransitionSchema,
}).superRefine((receipt, context) => {
  if (receipt.transition.commandId !== receipt.commandId) {
    context.addIssue({ code: "custom", message: "receipt transition must reference commandId" });
  }
  if (receipt.transition.commandType !== receipt.commandType) {
    context.addIssue({ code: "custom", message: "receipt transition must match commandType" });
  }
  if (receipt.transition.revision !== receipt.stateRevision) {
    context.addIssue({ code: "custom", message: "receipt revision must match transition" });
  }
});

const RejectedCommandReceiptSchema = CommandReceiptBaseSchema.extend({
  outcome: z.literal("rejected"),
  stateRevision: z.number().int().nonnegative(),
  error: RuntimeErrorSchema,
});

export const CommandReceiptSchema = z.union([
  AcceptedCommandReceiptSchema,
  RejectedCommandReceiptSchema,
]);

export type AcceptedCommandReceipt = z.infer<typeof AcceptedCommandReceiptSchema>;
export type RejectedCommandReceipt = z.infer<typeof RejectedCommandReceiptSchema>;
export type CommandReceipt = z.infer<typeof CommandReceiptSchema>;
