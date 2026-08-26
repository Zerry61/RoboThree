import { z } from "zod";

import { ContractVersionSchema } from "../common/version.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import {
  AdapterDescriptorRevisionRefSchema,
  CapabilityRevisionRefSchema,
  CapabilitySourceSchema,
  RegistryResourceIdSchema,
  StableResourceRefSchema,
} from "./common.js";

const BindingFields = {
  schemaVersion: ContractVersionSchema,
  bindingId: RegistryResourceIdSchema,
  capability: CapabilityRevisionRefSchema,
  adapterDescriptor: AdapterDescriptorRevisionRefSchema,
  port: z.enum(["model_provider", "tool_execution_backend"]),
  source: CapabilitySourceSchema,
  configurationRef: StableResourceRefSchema.optional(),
};

function validateBinding(
  binding: { capability: { capabilityId: string }; port: "model_provider" | "tool_execution_backend" },
  context: z.RefinementCtx,
): void {
  const expectedPrefix = binding.port === "model_provider" ? "model." : "tool.";
  if (!binding.capability.capabilityId.startsWith(expectedPrefix)) {
    context.addIssue({
      code: "custom",
      message: `${binding.port} binding requires a ${expectedPrefix} capability`,
      path: ["capability", "capabilityId"],
    });
  }
}

export const CapabilityBindingMaterialSchema = z.object(BindingFields)
  .strict()
  .superRefine(validateBinding);

export const CapabilityBindingSchema = z.object({
  ...BindingFields,
  revision: Sha256DigestSchema,
}).strict().superRefine(validateBinding);

export type CapabilityBindingMaterial = z.infer<typeof CapabilityBindingMaterialSchema>;
export type CapabilityBinding = z.infer<typeof CapabilityBindingSchema>;
