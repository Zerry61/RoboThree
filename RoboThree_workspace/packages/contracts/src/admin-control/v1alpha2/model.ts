import { z } from "zod";

import { TimestampSchema } from "../../common/time.js";
import {
  AdminModelCommandIdentitySchema,
  AdminModelDisplayNameSchema,
  AdminModelEndpointSchema,
  AdminModelExpectedRevisionSchema,
  AdminModelIdSchema,
  AdminModelProviderFamilySchema,
  AdminModelProviderModelIdSchema,
  AdminModelRevisionSchema,
} from "./common.js";

export const AdminManagedModelLifecycleSchema = z.enum(["enabled", "disabled"]);
export const AdminManagedModelCredentialStatusSchema = z.enum(["configured", "missing"]);
export const AdminModelConnectionStateSchema = z.enum([
  "unverified",
  "success",
  "auth_failed",
  "network_failed",
  "protocol_incompatible",
  "model_not_found",
  "service_error",
]);

export const AdminModelConnectionCheckSchema = z.object({
  status: AdminModelConnectionStateSchema,
  safeReason: z.string().min(1).max(512).optional(),
  durationMs: z.number().int().min(0).max(300_000).optional(),
  testedAt: TimestampSchema.optional(),
  correlationId: z.string().uuid().optional(),
}).strict().superRefine((value, context) => {
  const neverTested = value.status === "unverified";
  for (const [field, present] of [
    ["durationMs", value.durationMs !== undefined],
    ["testedAt", value.testedAt !== undefined],
    ["correlationId", value.correlationId !== undefined],
  ] as const) {
    if (neverTested === present) {
      context.addIssue({
        code: "custom",
        path: [field],
        message: neverTested
          ? "unverified connection state cannot contain test facts"
          : "verified connection state requires complete test facts",
      });
    }
  }
  if (value.status === "success" && value.safeReason !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["safeReason"],
      message: "successful connection check cannot contain a failure reason",
    });
  }
  if (value.status !== "success" && value.status !== "unverified"
    && value.safeReason === undefined) {
    context.addIssue({
      code: "custom",
      path: ["safeReason"],
      message: "failed connection check requires a safe reason",
    });
  }
});

export const AdminManagedModelSummarySchema = z.object({
  modelId: AdminModelIdSchema,
  modelRevision: AdminModelRevisionSchema,
  displayName: AdminModelDisplayNameSchema,
  providerFamily: AdminModelProviderFamilySchema,
  lifecycle: AdminManagedModelLifecycleSchema,
  defaultForNewTasks: z.boolean(),
  credentialStatus: AdminManagedModelCredentialStatusSchema,
  lastConnectionCheck: AdminModelConnectionCheckSchema,
}).strict().superRefine((value, context) => {
  if (value.defaultForNewTasks && value.lifecycle !== "enabled") {
    context.addIssue({
      code: "custom",
      path: ["defaultForNewTasks"],
      message: "only enabled models can be default for new tasks",
    });
  }
});

export const AdminManagedModelDetailSchema = AdminManagedModelSummarySchema.extend({
  endpoint: AdminModelEndpointSchema,
  providerModelId: AdminModelProviderModelIdSchema,
}).strict();

export const AdminManagedModelPageSchema = z.object({
  contractVersion: z.literal("admin-control.v1alpha2"),
  queryRevision: AdminModelRevisionSchema,
  items: z.array(AdminManagedModelSummarySchema).max(200),
}).strict();

export const AdminModelSecretSchema = z.string().min(1).max(16_384)
  .regex(/^[\x21-\x7e]+$/u);

export const AdminModelCredentialDirectiveSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("retain") }).strict(),
  z.object({
    mode: z.literal("replace"),
    secret: AdminModelSecretSchema,
  }).strict(),
]);

export const CreateAdminModelCommandSchema = AdminModelCommandIdentitySchema.extend({
  kind: z.literal("create_admin_model"),
  displayName: AdminModelDisplayNameSchema,
  providerFamily: AdminModelProviderFamilySchema,
  endpoint: AdminModelEndpointSchema,
  providerModelId: AdminModelProviderModelIdSchema,
  credential: z.object({
    mode: z.literal("replace"),
    secret: AdminModelSecretSchema,
  }).strict(),
}).strict();

export const UpdateAdminModelCommandSchema = AdminModelCommandIdentitySchema
  .merge(AdminModelExpectedRevisionSchema)
  .extend({
    kind: z.literal("update_admin_model"),
    modelId: AdminModelIdSchema,
    changes: z.object({
      displayName: AdminModelDisplayNameSchema.optional(),
      endpoint: AdminModelEndpointSchema.optional(),
      providerModelId: AdminModelProviderModelIdSchema.optional(),
      credential: AdminModelCredentialDirectiveSchema.optional(),
    }).strict().refine(
      (value) => Object.values(value).some((item) => item !== undefined),
      "update command requires at least one change",
    ),
  }).strict();

export const TestAdminModelConnectionCommandSchema = AdminModelCommandIdentitySchema
  .merge(AdminModelExpectedRevisionSchema)
  .extend({
    kind: z.literal("test_admin_model_connection"),
    modelId: AdminModelIdSchema,
  }).strict();

export const AdminModelDefaultDispositionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("unchanged") }).strict(),
  z.object({ mode: z.literal("no_default") }).strict(),
  z.object({
    mode: z.literal("replace"),
    replacementModelId: AdminModelIdSchema,
    expectedReplacementModelRevision: AdminModelRevisionSchema,
  }).strict(),
]);

export const SetAdminModelLifecycleCommandSchema = AdminModelCommandIdentitySchema
  .merge(AdminModelExpectedRevisionSchema)
  .extend({
    kind: z.literal("set_admin_model_lifecycle"),
    modelId: AdminModelIdSchema,
    lifecycle: AdminManagedModelLifecycleSchema,
    defaultDisposition: AdminModelDefaultDispositionSchema,
  }).strict().superRefine((value, context) => {
    if (value.lifecycle === "enabled" && value.defaultDisposition.mode !== "unchanged") {
      context.addIssue({
        code: "custom",
        path: ["defaultDisposition"],
        message: "enabling a model cannot alter the default selection",
      });
    }
  });

export const AdminModelExpectedCurrentDefaultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("none") }).strict(),
  z.object({
    state: z.literal("model"),
    modelId: AdminModelIdSchema,
    modelRevision: AdminModelRevisionSchema,
  }).strict(),
]);

export const SetDefaultAdminModelCommandSchema = AdminModelCommandIdentitySchema
  .merge(AdminModelExpectedRevisionSchema)
  .extend({
    kind: z.literal("set_default_admin_model"),
    modelId: AdminModelIdSchema,
    expectedCurrentDefault: AdminModelExpectedCurrentDefaultSchema,
  }).strict();

export const AdminModelMutationCommandSchema = z.discriminatedUnion("kind", [
  CreateAdminModelCommandSchema,
  UpdateAdminModelCommandSchema,
  TestAdminModelConnectionCommandSchema,
  SetAdminModelLifecycleCommandSchema,
  SetDefaultAdminModelCommandSchema,
]);

export type AdminManagedModelLifecycle = z.infer<typeof AdminManagedModelLifecycleSchema>;
export type AdminModelConnectionState = z.infer<typeof AdminModelConnectionStateSchema>;
export type AdminModelConnectionCheck = z.infer<typeof AdminModelConnectionCheckSchema>;
export type AdminManagedModelSummary = z.infer<typeof AdminManagedModelSummarySchema>;
export type AdminManagedModelDetail = z.infer<typeof AdminManagedModelDetailSchema>;
export type AdminManagedModelPage = z.infer<typeof AdminManagedModelPageSchema>;
export type AdminModelCredentialDirective = z.infer<typeof AdminModelCredentialDirectiveSchema>;
export type CreateAdminModelCommand = z.infer<typeof CreateAdminModelCommandSchema>;
export type UpdateAdminModelCommand = z.infer<typeof UpdateAdminModelCommandSchema>;
export type TestAdminModelConnectionCommand = z.infer<
  typeof TestAdminModelConnectionCommandSchema
>;
export type SetAdminModelLifecycleCommand = z.infer<
  typeof SetAdminModelLifecycleCommandSchema
>;
export type SetDefaultAdminModelCommand = z.infer<typeof SetDefaultAdminModelCommandSchema>;
export type AdminModelMutationCommand = z.infer<typeof AdminModelMutationCommandSchema>;
