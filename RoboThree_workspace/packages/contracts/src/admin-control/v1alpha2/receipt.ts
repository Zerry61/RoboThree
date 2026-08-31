import { z } from "zod";

import {
  AdminControlV1Alpha2ContractVersionSchema,
  AdminModelIdSchema,
  AdminModelRevisionSchema,
} from "./common.js";
import { AdminModelConnectionCheckSchema } from "./model.js";

export const AdminModelMutationReceiptSchema = z.object({
  kind: z.literal("admin_model_mutation_receipt"),
  contractVersion: AdminControlV1Alpha2ContractVersionSchema,
  commandId: z.string().uuid(),
  correlationId: z.string().uuid(),
  modelId: AdminModelIdSchema,
  modelRevision: AdminModelRevisionSchema,
  result: z.literal("committed"),
  replayed: z.boolean(),
}).strict();

export const AdminModelConnectionTestReceiptSchema = AdminModelMutationReceiptSchema.extend({
  kind: z.literal("admin_model_connection_test_receipt"),
  connectionCheck: AdminModelConnectionCheckSchema,
}).strict();

export type AdminModelMutationReceipt = z.infer<typeof AdminModelMutationReceiptSchema>;
export type AdminModelConnectionTestReceipt = z.infer<
  typeof AdminModelConnectionTestReceiptSchema
>;
