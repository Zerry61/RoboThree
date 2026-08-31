import { z } from "zod";

export const DesktopErrorEnvelopeV1Alpha5Schema = z.object({
  contractVersion: z.literal("v1alpha5"),
  code: z.string().min(3).max(160),
  category: z.enum([
    "validation", "authorization", "workspace_boundary", "availability", "timeout",
    "cancelled", "compatibility", "conflict", "uncertain", "internal",
  ]),
  safeSummary: z.string().min(1).max(512),
  retryable: z.boolean(),
  correlationId: z.string().uuid(),
}).strict();

export const ReasoningSubmitTurnErrorCodeV1Alpha5Schema = z.enum([
  "reasoning_profile_unavailable",
  "reasoning_lock_integrity_invalid",
  "reasoning_protocol_unavailable",
  "reasoning_admission_integrity_invalid",
]);

export const DesktopSafeErrorCodeV1Alpha5Schema = z.enum([
  "contract.invalid",
  "contract.unsupported_version",
  "contract.feature_unavailable",
  "reasoning.runtime_changed",
  "reasoning.client_mismatch",
  "runtime.request_aborted",
  "reasoning_mode.preference_unavailable",
  "reasoning_mode.preference_conflict",
  "reasoning_profile_unavailable",
  "reasoning_lock_integrity_invalid",
  "reasoning_protocol_unavailable",
  "reasoning_admission_integrity_invalid",
  "submit_turn.not_found",
  "submit_turn.invalid_selection",
  "internal",
]);

export type DesktopErrorEnvelopeV1Alpha5 = z.infer<
  typeof DesktopErrorEnvelopeV1Alpha5Schema
>;
