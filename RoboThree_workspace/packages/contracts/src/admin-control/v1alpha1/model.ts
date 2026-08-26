import { z } from "zod";

import {
  AdminControlCredentialStatusSchema,
  AdminControlDisplayTextSchema,
  AdminControlLifecycleSchema,
  AdminControlResourceIdSchema,
  AdminControlRevisionSchema,
  AdminControlSafeSummarySchema,
} from "./common.js";
import { createAdminControlPageSchema } from "./pagination.js";

export const AdminModelSummarySchema = z.object({
  modelId: AdminControlResourceIdSchema,
  modelRevision: AdminControlRevisionSchema,
  displayName: AdminControlDisplayTextSchema,
  providerLabel: AdminControlDisplayTextSchema,
  lifecycle: AdminControlLifecycleSchema,
  credentialStatus: AdminControlCredentialStatusSchema,
  safeSummary: AdminControlSafeSummarySchema,
}).strict();

export const AdminModelDetailSchema = AdminModelSummarySchema.extend({
  contextWindowState: z.enum(["known", "unknown", "unavailable"]),
  defaultForNewTasks: z.boolean(),
}).strict();

export const AdminModelPageSchema = createAdminControlPageSchema(AdminModelSummarySchema);

export type AdminModelSummary = z.infer<typeof AdminModelSummarySchema>;
export type AdminModelDetail = z.infer<typeof AdminModelDetailSchema>;
export type AdminModelPage = z.infer<typeof AdminModelPageSchema>;
