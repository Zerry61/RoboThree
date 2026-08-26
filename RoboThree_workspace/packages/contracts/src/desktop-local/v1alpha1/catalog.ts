import { z } from "zod";

import {
  DesktopDisplayTextSchema,
  DesktopResourceIdSchema,
  DesktopRevisionRefSchema,
  DesktopSafeSummarySchema,
  Sha256DigestSchema,
} from "./common.js";

export const ModelCapabilitySchema = z.enum([
  "text",
  "streaming",
  "tool_calling",
  "vision",
]);

export const ModelProjectionSchema = z.object({
  modelId: DesktopResourceIdSchema,
  revision: Sha256DigestSchema,
  name: DesktopDisplayTextSchema,
  source: z.enum(["personal", "enterprise", "official"]),
  capabilities: z.array(ModelCapabilitySchema).max(16),
  available: z.boolean(),
  unavailableReason: DesktopSafeSummarySchema.optional(),
}).strict();

export const CatalogResourceSummarySchema = DesktopRevisionRefSchema.extend({
  name: DesktopDisplayTextSchema,
  available: z.boolean(),
  unavailableReason: DesktopSafeSummarySchema.optional(),
}).strict();

export const AgentProjectionSchema = z.object({
  agentId: DesktopResourceIdSchema,
  revision: Sha256DigestSchema,
  name: DesktopDisplayTextSchema,
  identity: z.string().min(1).max(4096),
  goal: z.string().min(1).max(4096),
  defaultModelId: DesktopResourceIdSchema,
  allowModelOverride: z.boolean(),
  eligibleModels: z.array(ModelProjectionSchema).max(64),
  requiredModelCapabilities: z.array(ModelCapabilitySchema).max(16),
  skills: z.array(CatalogResourceSummarySchema).max(128),
  tools: z.array(CatalogResourceSummarySchema).max(128),
  knowledge: z.array(CatalogResourceSummarySchema).max(128),
  runnable: z.boolean(),
  unavailableReason: DesktopSafeSummarySchema.optional(),
}).strict().superRefine((value, context) => {
  if (!value.runnable && value.unavailableReason === undefined) {
    context.addIssue({
      code: "custom",
      message: "unavailable agents require unavailableReason",
      path: ["unavailableReason"],
    });
  }
});

export type ModelProjection = z.infer<typeof ModelProjectionSchema>;
export type CatalogResourceSummary = z.infer<
  typeof CatalogResourceSummarySchema
>;
export type AgentProjection = z.infer<typeof AgentProjectionSchema>;
