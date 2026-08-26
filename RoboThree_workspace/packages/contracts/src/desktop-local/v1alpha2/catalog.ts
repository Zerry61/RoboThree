import { z } from "zod";

import { ToolRiskFactKindSchema } from "../../authorization/tool-risk-facts.js";
import {
  DesktopDisplayTextSchema,
  DesktopResourceIdSchema,
  DesktopSafeSummarySchema,
  Sha256DigestSchema,
} from "../v1alpha1/common.js";
import { DesktopQueryMetadataV1Alpha2Schema } from "./common.js";

export const CatalogCursorV1Alpha2Schema = z.string()
  .min(48)
  .max(4096)
  .regex(/^r3cat1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);

export const CatalogRestrictionStateSchema = z.enum([
  "unrestricted",
  "restricted_nonempty",
  "restricted_empty",
]);

export const CatalogAvailabilitySchema = z.enum([
  "available",
  "unavailable",
  "unknown",
]);

export const CatalogUnavailableReasonSchema = z.enum([
  "catalog.availability_unknown",
  "catalog.credential_unavailable",
  "catalog.disabled",
  "catalog.health_unavailable",
  "catalog.model_unavailable",
  "catalog.revision_unavailable",
  "catalog.revoked",
]);

export const RobotCatalogSourceSchema = z.enum([
  "local_trusted",
  "enterprise_published",
  "official_builtin",
]);

export const ToolCatalogSourceSchema = z.enum([
  "enterprise_package",
  "official_package",
]);

export const RobotRestrictionSummarySchema = z.object({
  models: CatalogRestrictionStateSchema,
  skills: CatalogRestrictionStateSchema,
  tools: CatalogRestrictionStateSchema,
  knowledge: CatalogRestrictionStateSchema,
}).strict();

const CatalogItemAvailabilityFields = {
  availability: CatalogAvailabilitySchema,
  unavailableReason: CatalogUnavailableReasonSchema.optional(),
};

function validateAvailability(
  value: {
    availability: "available" | "unavailable" | "unknown";
    unavailableReason?: string | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (value.availability === "available" && value.unavailableReason !== undefined) {
    context.addIssue({
      code: "custom",
      message: "available catalog items cannot include an unavailable reason",
      path: ["unavailableReason"],
    });
  }
  if (value.availability === "unavailable" && value.unavailableReason === undefined) {
    context.addIssue({
      code: "custom",
      message: "unavailable catalog items require a safe reason",
      path: ["unavailableReason"],
    });
  }
  if (
    value.availability === "unknown"
    && value.unavailableReason !== "catalog.availability_unknown"
  ) {
    context.addIssue({
      code: "custom",
      message: "unknown catalog items require catalog.availability_unknown",
      path: ["unavailableReason"],
    });
  }
}

export const CatalogResourceSummaryV1Alpha2Schema = z.object({
  resourceId: DesktopResourceIdSchema,
  revision: Sha256DigestSchema.optional(),
  displayName: DesktopDisplayTextSchema,
  ...CatalogItemAvailabilityFields,
}).strict().superRefine((value, context) => {
  validateAvailability(value, context);
  if (value.availability !== "unavailable" && value.revision === undefined) {
    context.addIssue({
      code: "custom",
      message: "available or unknown resources require an exact trusted revision",
      path: ["revision"],
    });
  }
});

export const RobotCatalogSummarySchema = z.object({
  robotId: DesktopResourceIdSchema,
  configurationRevision: Sha256DigestSchema,
  displayName: DesktopDisplayTextSchema,
  description: DesktopSafeSummarySchema,
  source: RobotCatalogSourceSchema,
  restrictionSummary: RobotRestrictionSummarySchema,
  runnable: z.boolean(),
  unavailableReason: CatalogUnavailableReasonSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.runnable === (value.unavailableReason !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "runnable and unavailableReason must describe one consistent state",
      path: ["unavailableReason"],
    });
  }
});

export const RobotCatalogDetailSchema = RobotCatalogSummarySchema.extend({
  defaultModel: CatalogResourceSummaryV1Alpha2Schema,
  allowModelOverride: z.boolean(),
  eligibleModels: z.array(CatalogResourceSummaryV1Alpha2Schema).max(128),
  skills: z.array(CatalogResourceSummaryV1Alpha2Schema).max(64),
  tools: z.array(CatalogResourceSummaryV1Alpha2Schema).max(128),
  knowledge: z.array(CatalogResourceSummaryV1Alpha2Schema).max(64),
}).strict();

export const ToolCatalogSummarySchema = z.object({
  toolId: DesktopResourceIdSchema.refine((value) => value.startsWith("tool.")),
  capabilityRevision: Sha256DigestSchema,
  registryRevision: Sha256DigestSchema,
  displayName: DesktopDisplayTextSchema,
  description: DesktopSafeSummarySchema,
  source: ToolCatalogSourceSchema,
  readOnly: z.boolean(),
  riskSummary: z.array(ToolRiskFactKindSchema).max(6),
  ...CatalogItemAvailabilityFields,
}).strict().superRefine(validateAvailability);

export const ToolCatalogDetailSchema = ToolCatalogSummarySchema.extend({
  inputShape: z.literal("structured_object"),
  outputShape: z.enum(["structured_object", "unspecified"]),
}).strict();

export const ListRobotCatalogQuerySchema = DesktopQueryMetadataV1Alpha2Schema.extend({
  type: z.literal("list_robot_catalog"),
  cursor: CatalogCursorV1Alpha2Schema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

export const GetRobotCatalogQuerySchema = DesktopQueryMetadataV1Alpha2Schema.extend({
  type: z.literal("get_robot_catalog"),
  robotId: DesktopResourceIdSchema,
}).strict();

export const ListToolCatalogQuerySchema = DesktopQueryMetadataV1Alpha2Schema.extend({
  type: z.literal("list_tool_catalog"),
  cursor: CatalogCursorV1Alpha2Schema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

export const GetToolCatalogQuerySchema = DesktopQueryMetadataV1Alpha2Schema.extend({
  type: z.literal("get_tool_catalog"),
  toolId: DesktopResourceIdSchema.refine((value) => value.startsWith("tool.")),
}).strict();

export const RobotCatalogPageSchema = z.object({
  contractVersion: z.literal("v1alpha2"),
  queryRevision: Sha256DigestSchema,
  items: z.array(RobotCatalogSummarySchema).max(100),
  nextCursor: CatalogCursorV1Alpha2Schema.optional(),
}).strict();

export const ToolCatalogPageSchema = z.object({
  contractVersion: z.literal("v1alpha2"),
  queryRevision: Sha256DigestSchema,
  items: z.array(ToolCatalogSummarySchema).max(100),
  nextCursor: CatalogCursorV1Alpha2Schema.optional(),
}).strict();

export type CatalogRestrictionState = z.infer<typeof CatalogRestrictionStateSchema>;
export type CatalogAvailability = z.infer<typeof CatalogAvailabilitySchema>;
export type CatalogUnavailableReason = z.infer<typeof CatalogUnavailableReasonSchema>;
export type CatalogResourceSummaryV1Alpha2 = z.infer<
  typeof CatalogResourceSummaryV1Alpha2Schema
>;
export type RobotCatalogSummary = z.infer<typeof RobotCatalogSummarySchema>;
export type RobotCatalogDetail = z.infer<typeof RobotCatalogDetailSchema>;
export type ToolCatalogSummary = z.infer<typeof ToolCatalogSummarySchema>;
export type ToolCatalogDetail = z.infer<typeof ToolCatalogDetailSchema>;
export type ListRobotCatalogQuery = z.infer<typeof ListRobotCatalogQuerySchema>;
export type GetRobotCatalogQuery = z.infer<typeof GetRobotCatalogQuerySchema>;
export type ListToolCatalogQuery = z.infer<typeof ListToolCatalogQuerySchema>;
export type GetToolCatalogQuery = z.infer<typeof GetToolCatalogQuerySchema>;
export type RobotCatalogPage = z.infer<typeof RobotCatalogPageSchema>;
export type ToolCatalogPage = z.infer<typeof ToolCatalogPageSchema>;
