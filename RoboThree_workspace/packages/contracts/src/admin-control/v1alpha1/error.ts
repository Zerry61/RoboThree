import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import {
  AdminControlContractVersionSchema,
  ADMIN_CONTROL_CONTRACT_VERSION,
} from "./common.js";

export const AdminControlErrorCodeSchema = z.enum([
  "invalid_request",
  "admin_session_required",
  "permission_denied",
  "not_found",
  "revision_conflict",
  "stale_cursor",
  "business_rule_unavailable",
  "service_unavailable",
  "internal",
]);

export const AdminControlHttpStatusSchema = z.enum([
  "400",
  "401",
  "403",
  "404",
  "409",
  "410",
  "422",
  "503",
]);

const errorStatusByCode = {
  invalid_request: "400",
  admin_session_required: "401",
  permission_denied: "403",
  not_found: "404",
  revision_conflict: "409",
  stale_cursor: "410",
  business_rule_unavailable: "422",
  service_unavailable: "503",
  internal: "503",
} as const satisfies Record<z.infer<typeof AdminControlErrorCodeSchema>, z.infer<typeof AdminControlHttpStatusSchema>>;

export const AdminControlSafeErrorSchema = z.object({
  kind: z.literal("admin_control_error"),
  contractVersion: AdminControlContractVersionSchema,
  errorCode: AdminControlErrorCodeSchema,
  httpStatus: AdminControlHttpStatusSchema,
  safeSummary: z.string().min(1).max(512),
  retryable: z.boolean(),
  correlationId: EntityIdSchema,
}).strict().superRefine((value, context) => {
  if (value.httpStatus !== errorStatusByCode[value.errorCode]) {
    context.addIssue({
      code: "custom",
      path: ["httpStatus"],
      message: "admin-control error code and HTTP status must match",
    });
  }
});

export function createUnknownAdminControlError(input: {
  correlationId: string;
  retryable: boolean;
}): AdminControlSafeError {
  return AdminControlSafeErrorSchema.parse({
    kind: "admin_control_error",
    contractVersion: ADMIN_CONTROL_CONTRACT_VERSION,
    errorCode: "service_unavailable",
    httpStatus: "503",
    safeSummary: input.retryable
      ? "管理能力暂不可用，请稍后重试。"
      : "管理能力暂不可用，请联系管理员处理。",
    retryable: input.retryable,
    correlationId: input.correlationId,
  });
}

export type AdminControlErrorCode = z.infer<typeof AdminControlErrorCodeSchema>;
export type AdminControlHttpStatus = z.infer<typeof AdminControlHttpStatusSchema>;
export type AdminControlSafeError = z.infer<typeof AdminControlSafeErrorSchema>;
