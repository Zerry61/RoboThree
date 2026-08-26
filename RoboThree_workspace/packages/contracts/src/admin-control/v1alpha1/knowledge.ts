import { z } from "zod";

import {
  AdminControlDisplayTextSchema,
  AdminControlResourceIdSchema,
  AdminControlRevisionSchema,
  AdminControlSafeSummarySchema,
} from "./common.js";
import { createAdminControlPageSchema } from "./pagination.js";

export const AdminKnowledgeStateSchema = z.enum([
  "unconfigured",
  "unavailable",
  "gated",
  "partial",
  "ready",
]);

export const AdminKnowledgeSummarySchema = z.object({
  knowledgeId: AdminControlResourceIdSchema,
  knowledgeRevision: AdminControlRevisionSchema.optional(),
  displayName: AdminControlDisplayTextSchema,
  safeSummary: AdminControlSafeSummarySchema,
  state: AdminKnowledgeStateSchema,
}).strict().superRefine((value, context) => {
  if (value.state === "ready" && value.knowledgeRevision === undefined) {
    context.addIssue({
      code: "custom",
      path: ["knowledgeRevision"],
      message: "ready knowledge projections require a revision",
    });
  }
});

export const AdminKnowledgeDetailSchema = AdminKnowledgeSummarySchema.extend({
  retrievalState: AdminKnowledgeStateSchema,
}).strict();

export const AdminKnowledgePageSchema = createAdminControlPageSchema(AdminKnowledgeSummarySchema);

export type AdminKnowledgeState = z.infer<typeof AdminKnowledgeStateSchema>;
export type AdminKnowledgeSummary = z.infer<typeof AdminKnowledgeSummarySchema>;
export type AdminKnowledgeDetail = z.infer<typeof AdminKnowledgeDetailSchema>;
export type AdminKnowledgePage = z.infer<typeof AdminKnowledgePageSchema>;
