import { z } from "zod";

import {
  AdminControlDisplayTextSchema,
  AdminControlLifecycleSchema,
  AdminControlResourceIdSchema,
  AdminControlRestrictionSummarySchema,
  AdminControlRevisionSchema,
  AdminControlSafeSummarySchema,
} from "./common.js";
import { createAdminControlPageSchema } from "./pagination.js";

export const AdminRobotSourceSchema = z.enum([
  "local_trusted",
  "enterprise_published",
  "official_builtin",
]);

export const AdminRobotSummarySchema = z.object({
  robotId: AdminControlResourceIdSchema,
  publishedRobotRevision: AdminControlRevisionSchema,
  displayName: AdminControlDisplayTextSchema,
  description: AdminControlSafeSummarySchema,
  source: AdminRobotSourceSchema,
  lifecycle: AdminControlLifecycleSchema,
  restrictionSummary: AdminControlRestrictionSummarySchema,
}).strict();

export const AdminRobotDetailSchema = AdminRobotSummarySchema.extend({
  reviewState: z.enum(["not_required", "pending", "approved", "rejected", "unavailable"]),
  policyState: z.enum(["configured", "missing", "unavailable"]),
}).strict();

export const AdminRobotPageSchema = createAdminControlPageSchema(AdminRobotSummarySchema);

export type AdminRobotSource = z.infer<typeof AdminRobotSourceSchema>;
export type AdminRobotSummary = z.infer<typeof AdminRobotSummarySchema>;
export type AdminRobotDetail = z.infer<typeof AdminRobotDetailSchema>;
export type AdminRobotPage = z.infer<typeof AdminRobotPageSchema>;
