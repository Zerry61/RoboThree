import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import {
  AdminControlContractVersionSchema,
  AdminControlModuleSchema,
  AdminControlRevisionSchema,
} from "./common.js";

export const AdminControlCursorSchema = z.string()
  .min(48)
  .max(4096)
  .regex(/^r3admin1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);

export const AdminControlListLimitSchema = z.number().int().min(1).max(100);

export const AdminControlListQueryMetadataSchema = z.object({
  contractVersion: AdminControlContractVersionSchema,
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  module: AdminControlModuleSchema,
  cursor: AdminControlCursorSchema.optional(),
  limit: AdminControlListLimitSchema.optional(),
}).strict();

export const AdminControlDetailQueryMetadataSchema = z.object({
  contractVersion: AdminControlContractVersionSchema,
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
  module: AdminControlModuleSchema,
}).strict();

export function createAdminControlPageSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    contractVersion: AdminControlContractVersionSchema,
    queryRevision: AdminControlRevisionSchema,
    items: z.array(item).max(100),
    nextCursor: AdminControlCursorSchema.optional(),
  }).strict();
}

export type AdminControlCursor = z.infer<typeof AdminControlCursorSchema>;
export type AdminControlListQueryMetadata = z.infer<typeof AdminControlListQueryMetadataSchema>;
export type AdminControlDetailQueryMetadata = z.infer<typeof AdminControlDetailQueryMetadataSchema>;
