import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { TimestampSchema } from "../../common/time.js";
import {
  AdminControlDisplayTextSchema,
  AdminControlResourceIdSchema,
  AdminControlRevisionSchema,
  AdminControlSafeSummarySchema,
} from "./common.js";
import { createAdminControlPageSchema } from "./pagination.js";

export const AdminSystemUserSummarySchema = z.object({
  userId: AdminControlResourceIdSchema,
  displayName: AdminControlDisplayTextSchema,
  permissionState: z.enum(["configured", "missing", "unavailable"]),
}).strict();

export const AdminAuditEventSummarySchema = z.object({
  auditEventId: EntityIdSchema,
  auditRevision: AdminControlRevisionSchema,
  occurredAt: TimestampSchema,
  actorSummary: AdminControlDisplayTextSchema,
  actionSummary: AdminControlSafeSummarySchema,
  result: z.enum(["allowed", "denied", "failed", "unavailable"]),
}).strict();

export const AdminFeedbackSummarySchema = z.object({
  feedbackId: EntityIdSchema,
  feedbackRevision: AdminControlRevisionSchema,
  createdAt: TimestampSchema,
  safeSummary: AdminControlSafeSummarySchema,
  state: z.enum(["open", "reviewing", "closed", "gated", "unavailable"]),
}).strict();

export const AdminSystemUserPageSchema = createAdminControlPageSchema(AdminSystemUserSummarySchema);
export const AdminAuditEventPageSchema = createAdminControlPageSchema(AdminAuditEventSummarySchema);
export const AdminFeedbackPageSchema = createAdminControlPageSchema(AdminFeedbackSummarySchema);

export type AdminSystemUserSummary = z.infer<typeof AdminSystemUserSummarySchema>;
export type AdminAuditEventSummary = z.infer<typeof AdminAuditEventSummarySchema>;
export type AdminFeedbackSummary = z.infer<typeof AdminFeedbackSummarySchema>;
