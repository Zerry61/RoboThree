import { z } from "zod";

import {
  DesktopLocalContractVersionSchema,
  DesktopSafeSummarySchema,
} from "./common.js";

export const DesktopErrorCategorySchema = z.enum([
  "validation",
  "compatibility",
  "authorization",
  "workspace_boundary",
  "user_action_required",
  "availability",
  "timeout",
  "cancelled",
  "conflict",
  "uncertain",
  "internal",
]);

export const DesktopErrorCodeSchema = z.enum([
  "contract.invalid",
  "contract.unsupported_version",
  "command.idempotency_conflict",
  "workspace.selection_invalid",
  "workspace.selection_expired",
  "workspace.selection_consumed",
  "workspace.selection_context_mismatch",
  "session.not_found",
  "session_has_active_task",
  "workspace.boundary_violation",
  "catalog.resource_unavailable",
  "submit_turn.invalid_selection",
  "submit_turn.not_found",
  "task.not_found",
  "task.invalid_state",
  "task.stale_revision",
  "task.permission_denied",
  "artifact.source_unavailable",
  "artifact.source_changed",
  "artifact.delete_confirmation_mismatch",
  "artifact.delete_unsupported",
  "artifact.delete_failed",
  "artifact.delete_uncertain",
  "confirmation.not_found",
  "confirmation.expired",
  "confirmation.duplicate_decision",
  "confirmation.request_digest_conflict",
  "confirmation.permission_denied",
  "replay_reset_required",
  "runtime.unavailable",
]);

export const DesktopErrorEnvelopeSchema = z.object({
  contractVersion: DesktopLocalContractVersionSchema,
  code: DesktopErrorCodeSchema,
  category: DesktopErrorCategorySchema,
  safeSummary: DesktopSafeSummarySchema,
  retryable: z.boolean(),
  correlationId: z.string().uuid(),
}).strict();

export type DesktopErrorEnvelope = z.infer<
  typeof DesktopErrorEnvelopeSchema
>;
