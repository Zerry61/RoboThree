import { z } from "zod";

import {
  DesktopLocalContractVersionSchema,
  DesktopQueryMetadataSchema,
  DesktopResourceIdSchema,
} from "./common.js";

export const DesktopFeatureSchema = z.enum([
  "workspace",
  "session",
  "catalog",
  "submit_turn",
  "durable_event_stream",
  "task_projection",
  "task_control",
  "user_confirmation",
  "artifact_preview",
]);

export const CompatibilityQuerySchema = DesktopQueryMetadataSchema.extend({
  type: z.literal("compatibility_query"),
}).strict();

export const CompatibilityProjectionSchema = z.object({
  contractVersion: DesktopLocalContractVersionSchema,
  coreVersion: z.string().min(1).max(64),
  supportedContractVersions: z.array(
    DesktopLocalContractVersionSchema,
  ).min(1).max(8),
  selectedContractVersion: DesktopLocalContractVersionSchema,
  features: z.array(DesktopFeatureSchema).max(32),
  runtimeInstanceId: DesktopResourceIdSchema,
  pendingRuntimeActivation: z.boolean(),
}).strict();

export const RuntimeStatusProjectionSchema = z.object({
  contractVersion: DesktopLocalContractVersionSchema,
  status: z.enum(["starting", "ready", "stopping", "failed"]),
  runtimeInstanceId: DesktopResourceIdSchema,
  pendingRuntimeActivation: z.boolean(),
}).strict();

export type CompatibilityQuery = z.infer<typeof CompatibilityQuerySchema>;
export type CompatibilityProjection = z.infer<
  typeof CompatibilityProjectionSchema
>;
export type RuntimeStatusProjection = z.infer<
  typeof RuntimeStatusProjectionSchema
>;
