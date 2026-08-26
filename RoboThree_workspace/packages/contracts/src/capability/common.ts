import { z } from "zod";

import { Sha256DigestSchema } from "../persistence/common.js";

export const CapabilityKindSchema = z.enum(["model", "tool"]);

export const CapabilityIdSchema = z.string()
  .min(3)
  .max(128)
  .regex(/^(?:model|tool)\.[a-z0-9]+(?:[._-][a-z0-9]+)*$/u);

export const RegistryResourceIdSchema = z.string()
  .min(3)
  .max(128)
  .regex(/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u);

export const StableResourceRefSchema = z.string()
  .min(3)
  .max(512)
  .regex(/^[a-z][a-z0-9+.-]*:[^\s]+$/u);

export const CapabilitySourceSchema = z.object({
  trust: z.enum(["official", "enterprise"]),
  packageId: RegistryResourceIdSchema,
  packageRevision: Sha256DigestSchema,
}).strict();

export const CapabilityRevisionRefSchema = z.object({
  capabilityId: CapabilityIdSchema,
  capabilityRevision: Sha256DigestSchema,
}).strict();

export const AdapterDescriptorRevisionRefSchema = z.object({
  adapterDescriptorId: RegistryResourceIdSchema,
  adapterDescriptorRevision: Sha256DigestSchema,
}).strict();

export type CapabilityKind = z.infer<typeof CapabilityKindSchema>;
export type CapabilityId = z.infer<typeof CapabilityIdSchema>;
export type CapabilitySource = z.infer<typeof CapabilitySourceSchema>;
export type CapabilityRevisionRef = z.infer<typeof CapabilityRevisionRefSchema>;
export type AdapterDescriptorRevisionRef = z.infer<typeof AdapterDescriptorRevisionRefSchema>;
