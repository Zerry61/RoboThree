import { z } from "zod";

import { ToolRiskFactKindSchema } from "../../authorization/tool-risk-facts.js";
import {
  AdminControlCredentialStatusSchema,
  AdminControlDisplayTextSchema,
  AdminControlLifecycleSchema,
  AdminControlResourceIdSchema,
  AdminControlRevisionSchema,
  AdminControlSafeSummarySchema,
} from "./common.js";
import { createAdminControlPageSchema } from "./pagination.js";

export const AdminToolSourceSchema = z.enum([
  "enterprise_package",
  "official_package",
]);

export const AdminToolConfigurationStateSchema = z.enum([
  "configured",
  "missing",
  "unavailable",
  "gated",
]);

export const AdminToolSummarySchema = z.object({
  toolId: AdminControlResourceIdSchema.refine((value) => value.startsWith("tool.")),
  toolDefinitionRevision: AdminControlRevisionSchema,
  displayName: AdminControlDisplayTextSchema,
  description: AdminControlSafeSummarySchema,
  source: AdminToolSourceSchema,
  lifecycle: AdminControlLifecycleSchema,
  readOnly: z.boolean(),
  riskSummary: z.array(ToolRiskFactKindSchema).max(6),
  policyState: AdminToolConfigurationStateSchema,
  connectionState: AdminToolConfigurationStateSchema,
  credentialStatus: AdminControlCredentialStatusSchema,
  healthState: AdminToolConfigurationStateSchema,
}).strict();

export const AdminToolDetailSchema = AdminToolSummarySchema.extend({
  inputSummary: AdminControlSafeSummarySchema.optional(),
  outputSummary: AdminControlSafeSummarySchema.optional(),
}).strict();

export const AdminToolPageSchema = createAdminControlPageSchema(AdminToolSummarySchema);

export type AdminToolSource = z.infer<typeof AdminToolSourceSchema>;
export type AdminToolConfigurationState = z.infer<typeof AdminToolConfigurationStateSchema>;
export type AdminToolSummary = z.infer<typeof AdminToolSummarySchema>;
export type AdminToolDetail = z.infer<typeof AdminToolDetailSchema>;
export type AdminToolPage = z.infer<typeof AdminToolPageSchema>;
