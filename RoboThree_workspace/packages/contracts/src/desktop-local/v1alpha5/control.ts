import { z } from "zod";

import { DesktopResourceIdSchema } from "../v1alpha1/common.js";

export const DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA5 = "v1alpha5" as const;

export const CompatibilityQueryV1Alpha5Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA5),
  queryId: z.string().uuid(),
  correlationId: z.string().uuid(),
  clientInstanceId: z.string().uuid(),
  supportedContractVersions: z.array(z.enum([
    "v1alpha1", "v1alpha2", "v1alpha3", "v1alpha4", "v1alpha5",
  ])).min(1).max(8),
}).strict();

export const MaxReasoningCoreFeatureV1Alpha5Schema = z.object({
  feature: z.literal("max_reasoning_mode_core"),
  state: z.enum(["available", "unavailable"]),
  reasonCode: z.enum([
    "ready",
    "production_gate_disabled",
    "runtime_dependencies_unavailable",
  ]),
}).strict();

export const CompatibilityProjectionV1Alpha5Schema = z.object({
  contractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA5),
  coreVersion: z.string().min(1).max(64),
  selectedContractVersion: z.literal(DESKTOP_LOCAL_CONTRACT_VERSION_V1ALPHA5),
  runtimeInstanceId: DesktopResourceIdSchema,
  transportClientInstanceId: z.string().uuid(),
  features: z.array(MaxReasoningCoreFeatureV1Alpha5Schema).length(1),
}).strict();

export type CompatibilityQueryV1Alpha5 = z.infer<typeof CompatibilityQueryV1Alpha5Schema>;
export type CompatibilityProjectionV1Alpha5 = z.infer<
  typeof CompatibilityProjectionV1Alpha5Schema
>;
