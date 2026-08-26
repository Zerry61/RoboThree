import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { RuntimeErrorSchema } from "../common/runtime-error.js";
import { TimestampSchema } from "../common/time.js";
import { JsonObjectSchema, JsonValueSchema } from "./json.js";

export const ActionSchema = z.object({
  actionId: EntityIdSchema,
  kind: z.string().min(1),
  payload: JsonObjectSchema.default({}),
});

const ObservationBaseSchema = z.object({
  observationId: EntityIdSchema,
  actionId: EntityIdSchema,
  observedAt: TimestampSchema,
});

const SucceededObservationSchema = ObservationBaseSchema.extend({
  outcome: z.literal("succeeded"),
  output: JsonValueSchema.optional(),
});

const FailedObservationSchema = ObservationBaseSchema.extend({
  outcome: z.literal("failed"),
  error: RuntimeErrorSchema,
});

const CancelledObservationSchema = ObservationBaseSchema.extend({
  outcome: z.literal("cancelled"),
  error: RuntimeErrorSchema,
});

const TimedOutObservationSchema = ObservationBaseSchema.extend({
  outcome: z.literal("timed_out"),
  error: RuntimeErrorSchema,
});

const UserRejectedObservationSchema = ObservationBaseSchema.extend({
  outcome: z.literal("user_rejected"),
  error: RuntimeErrorSchema,
}).superRefine((observation, context) => {
  if (observation.error.category !== "authorization" || observation.error.code !== "authorization.user_rejected") {
    context.addIssue({ code: "custom", message: "user_rejected observation requires the typed authorization error" });
  }
});

export const ObservationSchema = z.discriminatedUnion("outcome", [
  SucceededObservationSchema,
  FailedObservationSchema,
  CancelledObservationSchema,
  TimedOutObservationSchema,
  UserRejectedObservationSchema,
]).superRefine((observation, context) => {
  if (observation.outcome === "cancelled" && observation.error.category !== "cancelled") {
    context.addIssue({ code: "custom", message: "cancelled observation requires a cancelled error" });
  }
  if (observation.outcome === "timed_out" && observation.error.category !== "timeout") {
    context.addIssue({ code: "custom", message: "timed_out observation requires a timeout error" });
  }
  if (
    observation.outcome === "failed"
    && (observation.error.category === "cancelled" || observation.error.category === "timeout")
  ) {
    context.addIssue({ code: "custom", message: "failed observation cannot carry cancellation or timeout" });
  }
});

export type Action = z.infer<typeof ActionSchema>;
export type Observation = z.infer<typeof ObservationSchema>;
