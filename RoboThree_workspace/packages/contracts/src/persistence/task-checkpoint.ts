import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { TaskRunStateSchema, TaskStatusSchema } from "../runtime/task-state.js";
import { PersistenceSchemaVersionSchema, Sha256DigestSchema } from "./common.js";

export const TaskCheckpointSchema = z.object({
  schemaVersion: PersistenceSchemaVersionSchema,
  checkpointId: EntityIdSchema,
  taskId: EntityIdSchema,
  stateRevision: z.number().int().nonnegative(),
  lastEventSequence: z.number().int().nonnegative(),
  parentCheckpointId: EntityIdSchema.optional(),
  state: TaskRunStateSchema,
  stateDigest: Sha256DigestSchema,
  createdAt: TimestampSchema,
}).superRefine((checkpoint, context) => {
  if (checkpoint.taskId !== checkpoint.state.taskId) {
    context.addIssue({ code: "custom", message: "checkpoint taskId must match state taskId" });
  }
  if (checkpoint.stateRevision !== checkpoint.state.revision) {
    context.addIssue({ code: "custom", message: "checkpoint revision must match state revision" });
  }
  if (checkpoint.stateRevision === 0 && checkpoint.parentCheckpointId !== undefined) {
    context.addIssue({ code: "custom", message: "initial checkpoint cannot have a parent" });
  }
  if (checkpoint.stateRevision > 0 && checkpoint.parentCheckpointId === undefined) {
    context.addIssue({ code: "custom", message: "non-initial checkpoint requires a parent" });
  }
  if (Date.parse(checkpoint.createdAt) < Date.parse(checkpoint.state.updatedAt)) {
    context.addIssue({ code: "custom", message: "checkpoint cannot predate state" });
  }
});

export const TaskHeadSchema = z.object({
  schemaVersion: PersistenceSchemaVersionSchema,
  taskId: EntityIdSchema,
  initializationDigest: Sha256DigestSchema,
  stateRevision: z.number().int().nonnegative(),
  lastEventSequence: z.number().int().nonnegative(),
  latestCheckpointId: EntityIdSchema,
  status: TaskStatusSchema,
  updatedAt: TimestampSchema,
});

export type TaskCheckpoint = z.infer<typeof TaskCheckpointSchema>;
export type TaskHead = z.infer<typeof TaskHeadSchema>;
