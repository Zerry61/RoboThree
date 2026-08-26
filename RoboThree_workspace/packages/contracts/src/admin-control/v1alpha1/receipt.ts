import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import {
  AdminControlContractVersionSchema,
  AdminControlOptionalSafeSummarySchema,
  AdminControlResourceIdSchema,
  AdminControlRevisionSchema,
} from "./common.js";

export const AdminControlExpectedRevisionSchema = AdminControlRevisionSchema;

export const AdminControlCommandMetadataSchema = z.object({
  contractVersion: AdminControlContractVersionSchema,
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
  expectedRevision: AdminControlExpectedRevisionSchema.optional(),
}).strict();

export const AdminControlReceiptStateSchema = z.enum([
  "accepted",
  "rejected",
  "unavailable",
  "gated",
]);

export const AdminControlReceiptSchema = z.object({
  kind: z.literal("admin_control_receipt"),
  contractVersion: AdminControlContractVersionSchema,
  receiptId: EntityIdSchema,
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
  resourceId: AdminControlResourceIdSchema.optional(),
  resourceRevision: AdminControlRevisionSchema.optional(),
  receiptState: AdminControlReceiptStateSchema,
  safeSummary: AdminControlOptionalSafeSummarySchema,
}).strict().superRefine((value, context) => {
  if (value.receiptState === "accepted" && value.resourceRevision === undefined) {
    context.addIssue({
      code: "custom",
      path: ["resourceRevision"],
      message: "accepted receipts require the committed resource revision",
    });
  }
});

export type AdminControlCommandMetadata = z.infer<typeof AdminControlCommandMetadataSchema>;
export type AdminControlReceiptState = z.infer<typeof AdminControlReceiptStateSchema>;
export type AdminControlReceipt = z.infer<typeof AdminControlReceiptSchema>;
