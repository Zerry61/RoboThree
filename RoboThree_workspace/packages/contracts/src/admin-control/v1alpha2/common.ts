import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { TimestampSchema } from "../../common/time.js";
import {
  AdminControlResourceIdSchema,
  AdminControlRevisionSchema,
} from "../v1alpha1/common.js";

export const ADMIN_CONTROL_V1ALPHA2_CONTRACT_VERSION = "admin-control.v1alpha2" as const;

export const AdminControlV1Alpha2ContractVersionSchema = z.literal(
  ADMIN_CONTROL_V1ALPHA2_CONTRACT_VERSION,
);

export const AdminModelIdSchema = AdminControlResourceIdSchema;
export const AdminModelRevisionSchema = AdminControlRevisionSchema;
export const AdminModelDisplayNameSchema = z.string().min(1).max(128)
  .refine((value) => value === value.trim(), "display name must not have outer whitespace");
export const AdminModelProviderFamilySchema = z.literal("openai_compatible");
export const AdminModelProviderModelIdSchema = z.string().min(1).max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u);
export const AdminModelEndpointSchema = z.string().min(1).max(2048).url().superRefine(
  (value, context) => {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:")
      || url.username.length > 0
      || url.password.length > 0
      || url.search.length > 0
      || url.hash.length > 0) {
      context.addIssue({
        code: "custom",
        message: "model endpoint must be an HTTP(S) origin/path without credentials, query, or fragment",
      });
    }
  },
);

export const AdminModelCommandIdentitySchema = z.object({
  contractVersion: AdminControlV1Alpha2ContractVersionSchema,
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
}).strict();

export const AdminModelExpectedRevisionSchema = z.object({
  expectedModelRevision: AdminModelRevisionSchema,
}).strict();

export const AdminControlV1Alpha2EnvelopeMetadataSchema = z.object({
  contractVersion: AdminControlV1Alpha2ContractVersionSchema,
  requestId: EntityIdSchema,
  correlationId: EntityIdSchema,
  serverTime: TimestampSchema,
  testIdentityUsed: z.boolean(),
  productionIdentityReady: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.testIdentityUsed && value.productionIdentityReady) {
    context.addIssue({
      code: "custom",
      path: ["productionIdentityReady"],
      message: "test identity cannot declare production identity ready",
    });
  }
});

export function createAdminControlV1Alpha2SuccessEnvelopeSchema<TData extends z.ZodType>(
  data: TData,
) {
  return AdminControlV1Alpha2EnvelopeMetadataSchema.extend({ data }).strict();
}

export type AdminModelCommandIdentity = z.infer<typeof AdminModelCommandIdentitySchema>;
export type AdminControlV1Alpha2EnvelopeMetadata = z.infer<
  typeof AdminControlV1Alpha2EnvelopeMetadataSchema
>;
