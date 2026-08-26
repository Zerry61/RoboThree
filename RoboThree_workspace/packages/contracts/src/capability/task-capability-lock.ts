import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { TimestampSchema } from "../common/time.js";
import { ContractVersionSchema } from "../common/version.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { AdapterDescriptorSchema } from "./adapter-descriptor.js";
import { CapabilityBindingSchema } from "./capability-binding.js";
import { CapabilityDefinitionSchema } from "./capability-definition.js";

export const TaskCapabilityLockSchema = z.object({
  schemaVersion: ContractVersionSchema,
  lockId: EntityIdSchema,
  taskId: EntityIdSchema,
  registryRevision: Sha256DigestSchema,
  definitionSnapshot: CapabilityDefinitionSchema,
  bindingSnapshot: CapabilityBindingSchema,
  adapterDescriptorSnapshot: AdapterDescriptorSchema,
  lockedAt: TimestampSchema,
}).strict().superRefine((lock, context) => {
  const definition = lock.definitionSnapshot;
  const binding = lock.bindingSnapshot;
  const descriptor = lock.adapterDescriptorSnapshot;

  if (
    binding.capability.capabilityId !== definition.capabilityId
    || binding.capability.capabilityRevision !== definition.revision
  ) {
    context.addIssue({
      code: "custom",
      message: "binding snapshot must reference the exact definition snapshot revision",
      path: ["bindingSnapshot", "capability"],
    });
  }
  if (
    binding.adapterDescriptor.adapterDescriptorId !== descriptor.adapterDescriptorId
    || binding.adapterDescriptor.adapterDescriptorRevision !== descriptor.revision
  ) {
    context.addIssue({
      code: "custom",
      message: "binding snapshot must reference the exact adapter descriptor snapshot revision",
      path: ["bindingSnapshot", "adapterDescriptor"],
    });
  }
  const expectedPort = definition.kind === "model" ? "model_provider" : "tool_execution_backend";
  if (binding.port !== expectedPort || descriptor.adapterKind !== expectedPort) {
    context.addIssue({
      code: "custom",
      message: `${definition.kind} capability lock requires ${expectedPort}`,
      path: ["bindingSnapshot", "port"],
    });
  }
});

export type TaskCapabilityLock = z.infer<typeof TaskCapabilityLockSchema>;
