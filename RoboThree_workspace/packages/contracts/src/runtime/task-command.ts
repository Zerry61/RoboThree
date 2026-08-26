import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { RuntimeErrorSchema } from "../common/runtime-error.js";
import { TimestampSchema } from "../common/time.js";
import { ActionSchema, ObservationSchema } from "./action.js";
import { ExecutionPlanRevisionRefSchema } from "./definition.js";
import { JsonObjectSchema } from "./json.js";
import { TaskStatusSchema, WaitReasonSchema } from "./task-state.js";

const TaskCommandBaseSchema = z.object({
  commandId: EntityIdSchema,
  taskId: EntityIdSchema,
  issuedAt: TimestampSchema,
});

export const TaskCommandTypeSchema = z.enum([
  "start_run",
  "retry_run",
  "start_step",
  "wait_step",
  "resume_step",
  "record_observation",
  "complete_run",
  "fail_run",
  "cancel_task",
  "expire_deadline",
]);

const StartRunCommandSchema = TaskCommandBaseSchema.extend({
  type: z.literal("start_run"),
  runId: EntityIdSchema,
  deadlineAt: TimestampSchema.optional(),
});

const RetryRunCommandSchema = TaskCommandBaseSchema.extend({
  type: z.literal("retry_run"),
  failedRunId: EntityIdSchema,
  newRunId: EntityIdSchema,
  deadlineAt: TimestampSchema.optional(),
});

const StartStepCommandSchema = TaskCommandBaseSchema.extend({
  type: z.literal("start_step"),
  runId: EntityIdSchema,
  stepId: EntityIdSchema,
  planRevision: ExecutionPlanRevisionRefSchema,
  action: ActionSchema,
  deadlineAt: TimestampSchema.optional(),
});

const WaitStepCommandSchema = TaskCommandBaseSchema.extend({
  type: z.literal("wait_step"),
  runId: EntityIdSchema,
  stepId: EntityIdSchema,
  reason: WaitReasonSchema,
  context: JsonObjectSchema.default({}),
});

const ResumeStepCommandSchema = TaskCommandBaseSchema.extend({
  type: z.literal("resume_step"),
  runId: EntityIdSchema,
  stepId: EntityIdSchema,
});

const RecordObservationCommandSchema = TaskCommandBaseSchema.extend({
  type: z.literal("record_observation"),
  runId: EntityIdSchema,
  stepId: EntityIdSchema,
  observation: ObservationSchema,
});

const CompleteRunCommandSchema = TaskCommandBaseSchema.extend({
  type: z.literal("complete_run"),
  runId: EntityIdSchema,
});

const FailRunCommandSchema = TaskCommandBaseSchema.extend({
  type: z.literal("fail_run"),
  runId: EntityIdSchema,
  error: RuntimeErrorSchema,
});

const CancelTaskCommandSchema = TaskCommandBaseSchema.extend({
  type: z.literal("cancel_task"),
  reason: z.string().min(1).optional(),
});

const ExpireDeadlineCommandSchema = TaskCommandBaseSchema.extend({
  type: z.literal("expire_deadline"),
});

export const TaskCommandSchema = z.discriminatedUnion("type", [
  StartRunCommandSchema,
  RetryRunCommandSchema,
  StartStepCommandSchema,
  WaitStepCommandSchema,
  ResumeStepCommandSchema,
  RecordObservationCommandSchema,
  CompleteRunCommandSchema,
  FailRunCommandSchema,
  CancelTaskCommandSchema,
  ExpireDeadlineCommandSchema,
]);

export const TaskTransitionSchema = z.object({
  commandId: EntityIdSchema,
  commandType: TaskCommandTypeSchema,
  cause: z.enum(["command", "deadline_expired"]),
  previousRevision: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  occurredAt: TimestampSchema,
  taskStatusBefore: TaskStatusSchema,
  taskStatusAfter: TaskStatusSchema,
  runId: EntityIdSchema.optional(),
  stepId: EntityIdSchema.optional(),
});

export type TaskCommand = z.infer<typeof TaskCommandSchema>;
export type TaskCommandType = z.infer<typeof TaskCommandTypeSchema>;
export type TaskTransition = z.infer<typeof TaskTransitionSchema>;
