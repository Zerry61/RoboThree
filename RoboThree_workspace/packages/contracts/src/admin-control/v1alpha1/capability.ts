import { z } from "zod";

import {
  AdminControlCapabilityStateSchema,
  AdminControlResourceIdSchema,
  AdminControlSafeSummarySchema,
} from "./common.js";

export const AdminControlCapabilityProjectionSchema = z.object({
  capabilityKey: AdminControlResourceIdSchema,
  state: AdminControlCapabilityStateSchema,
  safeReason: AdminControlSafeSummarySchema.optional(),
}).strict();

export type AdminControlCapabilityProjection = z.infer<typeof AdminControlCapabilityProjectionSchema>;
