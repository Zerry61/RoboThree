import { z } from "zod";

import { ContractVersionSchema } from "../common/version.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import {
  AdapterDescriptorSchema,
} from "./adapter-descriptor.js";
import { CapabilityBindingSchema } from "./capability-binding.js";
import {
  ModelCapabilityDefinitionSchema,
  ToolCapabilityDefinitionSchema,
} from "./capability-definition.js";

export const AgentVisibleCapabilitiesSchema = z.object({
  models: z.array(ModelCapabilityDefinitionSchema),
  tools: z.array(ToolCapabilityDefinitionSchema),
}).strict();

export const InfrastructureResourcesSchema = z.object({
  capabilityBindings: z.array(CapabilityBindingSchema),
  adapterDescriptors: z.array(AdapterDescriptorSchema),
}).strict();

const RegistrySnapshotFields = {
  schemaVersion: ContractVersionSchema,
  agentVisibleCapabilities: AgentVisibleCapabilitiesSchema,
  infrastructureResources: InfrastructureResourcesSchema,
};

export const RegistrySnapshotMaterialSchema = z.object(RegistrySnapshotFields).strict();

export const RegistrySnapshotSchema = z.object({
  ...RegistrySnapshotFields,
  registryRevision: Sha256DigestSchema,
}).strict();

export type AgentVisibleCapabilities = z.infer<typeof AgentVisibleCapabilitiesSchema>;
export type InfrastructureResources = z.infer<typeof InfrastructureResourcesSchema>;
export type RegistrySnapshotMaterial = z.infer<typeof RegistrySnapshotMaterialSchema>;
export type RegistrySnapshot = z.infer<typeof RegistrySnapshotSchema>;
