import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { CurrentContractVersionSchema } from "../common/version.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { ConfirmationScopeSchema } from "./confirmation-scope.js";
import type { ConfirmationScope } from "./confirmation-scope.js";

export const UserConfirmationDisplaySummarySchema = z.enum([
  "Confirm this exact Tool Action",
  "Confirm this exact external data scope for this Task",
  "Confirm this exact Model external data scope for this Task",
]);

export function userConfirmationDisplaySummary(scope: ConfirmationScope): z.infer<typeof UserConfirmationDisplaySummarySchema> {
  switch (scope.type) {
    case "single_action":
      return "Confirm this exact Tool Action";
    case "task_external_scope":
      return "Confirm this exact external data scope for this Task";
    case "task_model_external_scope":
      return "Confirm this exact Model external data scope for this Task";
  }
}

export const UserConfirmationRequestSchema = z.object({
  schemaVersion: CurrentContractVersionSchema,
  confirmationId: EntityIdSchema,
  runId: EntityIdSchema.optional(),
  stepId: EntityIdSchema.optional(),
  actionId: EntityIdSchema.optional(),
  scope: ConfirmationScopeSchema,
  scopeDigest: Sha256DigestSchema,
  displaySummary: UserConfirmationDisplaySummarySchema,
  requestedAt: TimestampSchema,
  expiresAt: TimestampSchema.optional(),
}).strict().superRefine((request, context) => {
  if (request.displaySummary !== userConfirmationDisplaySummary(request.scope)) {
    context.addIssue({
      code: "custom",
      message: "confirmation display summary must be generated from the typed scope",
      path: ["displaySummary"],
    });
  }
  if (
    request.expiresAt !== undefined
    && Date.parse(request.expiresAt) <= Date.parse(request.requestedAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "confirmation expiry must be later than requestedAt",
      path: ["expiresAt"],
    });
  }
});

export const UserConfirmationDecisionSchema = z.object({
  schemaVersion: CurrentContractVersionSchema,
  decisionId: EntityIdSchema,
  confirmationId: EntityIdSchema,
  scopeDigest: Sha256DigestSchema,
  decision: z.enum(["confirmed", "rejected"]),
  decidedByUserId: EntityIdSchema,
  decidedAt: TimestampSchema,
}).strict();

export const PersistedUserConfirmationSchema = z.object({
  request: UserConfirmationRequestSchema,
  decision: UserConfirmationDecisionSchema.optional(),
}).strict().superRefine((record, context) => {
  if (record.decision !== undefined && (
    record.decision.confirmationId !== record.request.confirmationId
    || record.decision.scopeDigest !== record.request.scopeDigest
  )) {
    context.addIssue({ code: "custom", message: "confirmation decision must reference the exact request" });
  }
});

export type UserConfirmationRequest = z.infer<typeof UserConfirmationRequestSchema>;
export type UserConfirmationDecision = z.infer<typeof UserConfirmationDecisionSchema>;
export type PersistedUserConfirmation = z.infer<typeof PersistedUserConfirmationSchema>;
