import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { JsonObjectSchema } from "../runtime/json.js";
import { PersistenceSchemaVersionSchema } from "./common.js";

export const TaskEventTypeSchema = z.enum([
  "runtime.command_applied",
  "runtime.command_rejected",
  "runtime.effect_intent_recorded",
  "runtime.effect_dispatched",
  "runtime.effect_result_recorded",
  "runtime.effect_uncertain",
  "runtime.recovery_decision_recorded",
  "authorization.allowed",
  "authorization.denied",
  "authorization.user_confirmation_requested",
  "authorization.user_confirmation_decided",
  "authorization.invalidated_before_dispatch",
]);

export const TaskEventSchema = z.object({
  schemaVersion: PersistenceSchemaVersionSchema,
  eventId: EntityIdSchema,
  taskId: EntityIdSchema,
  sequence: z.number().int().positive(),
  type: TaskEventTypeSchema,
  occurredAt: TimestampSchema,
  causationId: EntityIdSchema,
  correlationId: EntityIdSchema,
  runId: EntityIdSchema.optional(),
  stepId: EntityIdSchema.optional(),
  payload: JsonObjectSchema,
});

export type TaskEventType = z.infer<typeof TaskEventTypeSchema>;
export type TaskEvent = z.infer<typeof TaskEventSchema>;
