import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { AdminControlV1Alpha2ContractVersionSchema } from "./common.js";

export const AdminControlV1Alpha2ErrorCodeSchema = z.enum([
  "invalid_request",
  "admin_session_required",
  "permission_denied",
  "not_found",
  "revision_conflict",
  "business_rule_unavailable",
  "service_unavailable",
  "internal",
]);

export const AdminControlV1Alpha2HttpStatusSchema = z.enum([
  "400",
  "401",
  "403",
  "404",
  "409",
  "422",
  "503",
]);

const statusByCode = {
  invalid_request: "400",
  admin_session_required: "401",
  permission_denied: "403",
  not_found: "404",
  revision_conflict: "409",
  business_rule_unavailable: "422",
  service_unavailable: "503",
  internal: "503",
} as const satisfies Record<
  z.infer<typeof AdminControlV1Alpha2ErrorCodeSchema>,
  z.infer<typeof AdminControlV1Alpha2HttpStatusSchema>
>;

export const AdminControlV1Alpha2SafeErrorSchema = z.object({
  kind: z.literal("admin_control_error"),
  contractVersion: AdminControlV1Alpha2ContractVersionSchema,
  errorCode: AdminControlV1Alpha2ErrorCodeSchema,
  httpStatus: AdminControlV1Alpha2HttpStatusSchema,
  safeSummary: z.string().min(1).max(512),
  retryable: z.boolean(),
  correlationId: EntityIdSchema,
}).strict().superRefine((value, context) => {
  if (value.httpStatus !== statusByCode[value.errorCode]) {
    context.addIssue({
      code: "custom",
      path: ["httpStatus"],
      message: "admin-control v1alpha2 error code and HTTP status must match",
    });
  }
});

export type AdminControlV1Alpha2ErrorCode = z.infer<
  typeof AdminControlV1Alpha2ErrorCodeSchema
>;
export type AdminControlV1Alpha2SafeError = z.infer<
  typeof AdminControlV1Alpha2SafeErrorSchema
>;
