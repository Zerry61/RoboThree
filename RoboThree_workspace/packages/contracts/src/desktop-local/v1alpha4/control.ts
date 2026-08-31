import { z } from "zod";

import { DesktopResourceIdSchema } from "../v1alpha1/common.js";

export const DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA4 = "v1alpha4" as const;

export const CompatibilityQueryV1Alpha4Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA4),
  queryId: z.string().uuid(),
  correlationId: z.string().uuid(),
  clientInstanceId: z.string().uuid(),
  supportedContractVersions: z.array(z.enum([
    "v1alpha1",
    "v1alpha2",
    "v1alpha3",
    "v1alpha4",
  ])).min(1).max(8),
}).strict();

export const R2DSubmitTurnFeatureV1Alpha4Schema = z.object({
  feature: z.literal("r2d_submit_turn_default"),
  state: z.enum(["available", "unavailable"]),
  reasonCode: z.enum([
    "ready",
    "production_gate_disabled",
    "runtime_dependencies_unavailable",
  ]),
}).strict();

export const CompatibilityProjectionV1Alpha4Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA4),
  coreVersion: z.string().min(1).max(64),
  selectedContractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA4),
  runtimeInstanceId: DesktopResourceIdSchema,
  transportClientInstanceId: z.string().uuid(),
  features: z.array(R2DSubmitTurnFeatureV1Alpha4Schema).length(1),
}).strict();

export type CompatibilityQueryV1Alpha4 = z.infer<
  typeof CompatibilityQueryV1Alpha4Schema
>;
export type CompatibilityProjectionV1Alpha4 = z.infer<
  typeof CompatibilityProjectionV1Alpha4Schema
>;
