import { z } from "zod";

import { ContractVersionSchema } from "../common/version.js";
import { EffectRecoveryModeSchema } from "../persistence/effect-attempt.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import {
  CapabilitySourceSchema,
  RegistryResourceIdSchema,
  StableResourceRefSchema,
} from "./common.js";

const AdapterDescriptorCommonFields = {
  schemaVersion: ContractVersionSchema,
  adapterDescriptorId: RegistryResourceIdSchema,
  source: CapabilitySourceSchema,
  implementationRef: StableResourceRefSchema,
  runtimeBoundary: z.enum(["in_process", "child_process", "remote"]),
  protocol: z.object({
    name: z.string().trim().min(1).max(120),
    version: z.string().trim().min(1).max(80),
  }).strict(),
  configurationRef: StableResourceRefSchema.optional(),
  credentialRef: StableResourceRefSchema.optional(),
};

export const ModelProviderDescriptorMaterialSchema = z.object({
  ...AdapterDescriptorCommonFields,
  adapterKind: z.literal("model_provider"),
}).strict();

export const ToolCatalogProviderDescriptorMaterialSchema = z.object({
  ...AdapterDescriptorCommonFields,
  adapterKind: z.literal("tool_catalog_provider"),
}).strict();

export const ToolExecutionBackendDescriptorMaterialSchema = z.object({
  ...AdapterDescriptorCommonFields,
  adapterKind: z.literal("tool_execution_backend"),
  effectRecoveryMode: EffectRecoveryModeSchema,
  maxConcurrency: z.number().int().positive().max(1024).optional(),
}).strict();

export const AdapterDescriptorMaterialSchema = z.discriminatedUnion("adapterKind", [
  ModelProviderDescriptorMaterialSchema,
  ToolCatalogProviderDescriptorMaterialSchema,
  ToolExecutionBackendDescriptorMaterialSchema,
]);

export const ModelProviderDescriptorSchema = z.object({
  ...AdapterDescriptorCommonFields,
  adapterKind: z.literal("model_provider"),
  revision: Sha256DigestSchema,
}).strict();

export const ToolCatalogProviderDescriptorSchema = z.object({
  ...AdapterDescriptorCommonFields,
  adapterKind: z.literal("tool_catalog_provider"),
  revision: Sha256DigestSchema,
}).strict();

export const ToolExecutionBackendDescriptorSchema = z.object({
  ...AdapterDescriptorCommonFields,
  adapterKind: z.literal("tool_execution_backend"),
  effectRecoveryMode: EffectRecoveryModeSchema,
  maxConcurrency: z.number().int().positive().max(1024).optional(),
  revision: Sha256DigestSchema,
}).strict();

export const AdapterDescriptorSchema = z.discriminatedUnion("adapterKind", [
  ModelProviderDescriptorSchema,
  ToolCatalogProviderDescriptorSchema,
  ToolExecutionBackendDescriptorSchema,
]);

export type AdapterDescriptorMaterial = z.infer<typeof AdapterDescriptorMaterialSchema>;
export type AdapterDescriptor = z.infer<typeof AdapterDescriptorSchema>;
export type ModelProviderDescriptor = z.infer<typeof ModelProviderDescriptorSchema>;
export type ToolCatalogProviderDescriptor = z.infer<typeof ToolCatalogProviderDescriptorSchema>;
export type ToolExecutionBackendDescriptor = z.infer<typeof ToolExecutionBackendDescriptorSchema>;
