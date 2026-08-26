import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { RuntimeErrorSchema } from "../common/runtime-error.js";
import { TimestampSchema } from "../common/time.js";
import { JsonObjectSchema } from "../runtime/json.js";
import { PersistenceSchemaVersionSchema } from "./common.js";

export const EffectAttemptStatusSchema = z.enum([
  "prepared",
  "dispatched",
  "succeeded",
  "failed",
  "cancelled",
  "uncertain",
]);

export const EffectRecoveryModeSchema = z.enum([
  "idempotent_retry",
  "query_then_retry",
  "manual_reconciliation",
]);

export const EffectAttemptSchema = z.object({
  schemaVersion: PersistenceSchemaVersionSchema,
  effectAttemptId: EntityIdSchema,
  taskId: EntityIdSchema,
  runId: EntityIdSchema,
  stepId: EntityIdSchema,
  actionId: EntityIdSchema,
  idempotencyKey: z.string().min(1).max(512),
  executorCapability: z.string().min(1),
  recoveryMode: EffectRecoveryModeSchema,
  status: EffectAttemptStatusSchema,
  requestRef: EntityIdSchema.optional(),
  resultRef: EntityIdSchema.optional(),
  metadata: JsonObjectSchema.default({}),
  terminalError: RuntimeErrorSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).superRefine((attempt, context) => {
  const terminal = attempt.status === "succeeded"
    || attempt.status === "failed"
    || attempt.status === "cancelled"
    || attempt.status === "uncertain";
  if (!terminal && (attempt.resultRef !== undefined || attempt.terminalError !== undefined)) {
    context.addIssue({ code: "custom", message: "active effect attempt cannot contain terminal result" });
  }
  if (attempt.status === "succeeded" && attempt.resultRef === undefined) {
    context.addIssue({ code: "custom", message: "succeeded effect attempt requires resultRef" });
  }
  if ((attempt.status === "failed" || attempt.status === "cancelled" || attempt.status === "uncertain")
    && attempt.terminalError === undefined) {
    context.addIssue({ code: "custom", message: "unsuccessful effect attempt requires terminalError" });
  }
  if (attempt.status !== "succeeded" && attempt.resultRef !== undefined) {
    context.addIssue({ code: "custom", message: "only a succeeded effect attempt can reference resultRef" });
  }
  if (Date.parse(attempt.updatedAt) < Date.parse(attempt.createdAt)) {
    context.addIssue({ code: "custom", message: "effect attempt updatedAt cannot predate creation" });
  }
});

export type EffectAttemptStatus = z.infer<typeof EffectAttemptStatusSchema>;
export type EffectRecoveryMode = z.infer<typeof EffectRecoveryModeSchema>;
export type EffectAttempt = z.infer<typeof EffectAttemptSchema>;
