import { z } from "zod";

import {
  AdminControlDisplayTextSchema,
  AdminControlLifecycleSchema,
  AdminControlResourceIdSchema,
  AdminControlRevisionSchema,
  AdminControlSafeSummarySchema,
} from "./common.js";
import { createAdminControlPageSchema } from "./pagination.js";

export const AdminSkillPackageValidationStateSchema = z.enum([
  "not_started",
  "valid",
  "invalid",
  "unavailable",
]);

export const AdminSkillSummarySchema = z.object({
  skillId: AdminControlResourceIdSchema,
  skillRevision: AdminControlRevisionSchema,
  displayName: AdminControlDisplayTextSchema,
  description: AdminControlSafeSummarySchema,
  lifecycle: AdminControlLifecycleSchema,
  packageValidationState: AdminSkillPackageValidationStateSchema,
}).strict();

export const AdminSkillDetailSchema = AdminSkillSummarySchema.extend({
  packageDigest: AdminControlRevisionSchema.optional(),
  validationSummary: AdminControlSafeSummarySchema.optional(),
}).strict();

export const AdminSkillPageSchema = createAdminControlPageSchema(AdminSkillSummarySchema);

export type AdminSkillPackageValidationState = z.infer<typeof AdminSkillPackageValidationStateSchema>;
export type AdminSkillSummary = z.infer<typeof AdminSkillSummarySchema>;
export type AdminSkillDetail = z.infer<typeof AdminSkillDetailSchema>;
export type AdminSkillPage = z.infer<typeof AdminSkillPageSchema>;
