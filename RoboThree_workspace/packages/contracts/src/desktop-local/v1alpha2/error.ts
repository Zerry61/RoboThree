import { z } from "zod";

import {
  DesktopLocalContractVersionV1Alpha2Schema,
  DesktopTypedErrorCodeSchema,
  EntityIdSchema,
} from "./common.js";

export const DesktopErrorCategoryV1Alpha2Schema = z.enum([
  "validation",
  "compatibility",
  "authorization",
  "workspace_boundary",
  "availability",
  "timeout",
  "cancelled",
  "conflict",
  "uncertain",
  "internal",
]);

export const DesktopErrorEnvelopeV1Alpha2Schema = z.object({
  contractVersion: DesktopLocalContractVersionV1Alpha2Schema,
  code: DesktopTypedErrorCodeSchema,
  category: DesktopErrorCategoryV1Alpha2Schema,
  safeSummary: z.string().max(4096),
  retryable: z.boolean(),
  correlationId: EntityIdSchema,
}).strict();

export type DesktopErrorEnvelopeV1Alpha2 = z.infer<
  typeof DesktopErrorEnvelopeV1Alpha2Schema
>;
