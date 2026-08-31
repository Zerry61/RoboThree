import { z } from "zod";

export const DesktopErrorEnvelopeV1Alpha4Schema = z.object({
  contractVersion: z.literal("v1alpha4"),
  code: z.string().min(3).max(160),
  category: z.enum([
    "validation",
    "authorization",
    "workspace_boundary",
    "availability",
    "timeout",
    "cancelled",
    "compatibility",
    "conflict",
    "uncertain",
    "internal",
  ]),
  safeSummary: z.string().min(1).max(512),
  retryable: z.boolean(),
  correlationId: z.string().uuid(),
}).strict();

export type DesktopErrorEnvelopeV1Alpha4 = z.infer<
  typeof DesktopErrorEnvelopeV1Alpha4Schema
>;
