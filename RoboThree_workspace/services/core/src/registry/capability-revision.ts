import {
  AdapterDescriptorMaterialSchema,
  AdapterDescriptorSchema,
  CapabilityBindingMaterialSchema,
  CapabilityBindingSchema,
  CapabilityDefinitionMaterialSchema,
  CapabilityDefinitionSchema,
  JsonValueSchema,
  RegistrySnapshotMaterialSchema,
  RegistrySnapshotSchema,
  TaskCapabilityLockSchema,
} from "@robothree/contracts";
import type {
  AdapterDescriptor,
  AdapterDescriptorMaterial,
  CapabilityBinding,
  CapabilityBindingMaterial,
  CapabilityDefinition,
  CapabilityDefinitionMaterial,
  RegistrySnapshotMaterial,
  Sha256Digest,
  TaskCapabilityLock,
} from "@robothree/contracts";

import { sha256CanonicalJson } from "../persistence/digest.js";

export function createCapabilityDefinition(
  material: CapabilityDefinitionMaterial,
): CapabilityDefinition {
  const parsed = CapabilityDefinitionMaterialSchema.parse(material);
  return CapabilityDefinitionSchema.parse({
    ...parsed,
    revision: digestMaterial(parsed),
  });
}

export function createCapabilityBinding(
  material: CapabilityBindingMaterial,
): CapabilityBinding {
  const parsed = CapabilityBindingMaterialSchema.parse(material);
  return CapabilityBindingSchema.parse({
    ...parsed,
    revision: digestMaterial(parsed),
  });
}

export function createAdapterDescriptor(
  material: AdapterDescriptorMaterial,
): AdapterDescriptor {
  const parsed = AdapterDescriptorMaterialSchema.parse(material);
  return AdapterDescriptorSchema.parse({
    ...parsed,
    revision: digestMaterial(parsed),
  });
}

export function calculateRegistryRevision(material: RegistrySnapshotMaterial): Sha256Digest {
  return digestMaterial(RegistrySnapshotMaterialSchema.parse(material));
}

export function hasValidRegistrySnapshotRevision(snapshot: unknown): boolean {
  const { registryRevision, ...material } = RegistrySnapshotSchema.parse(snapshot);
  return registryRevision === calculateRegistryRevision(material);
}

export function hasValidCapabilityDefinitionRevision(definition: CapabilityDefinition): boolean {
  const { revision, ...material } = CapabilityDefinitionSchema.parse(definition);
  return revision === digestMaterial(CapabilityDefinitionMaterialSchema.parse(material));
}

export function hasValidCapabilityBindingRevision(binding: CapabilityBinding): boolean {
  const { revision, ...material } = CapabilityBindingSchema.parse(binding);
  return revision === digestMaterial(CapabilityBindingMaterialSchema.parse(material));
}

export function hasValidAdapterDescriptorRevision(descriptor: AdapterDescriptor): boolean {
  const { revision, ...material } = AdapterDescriptorSchema.parse(descriptor);
  return revision === digestMaterial(AdapterDescriptorMaterialSchema.parse(material));
}

export function validateTaskCapabilityLockRevisions(lock: TaskCapabilityLock): TaskCapabilityLock {
  const parsed = TaskCapabilityLockSchema.parse(lock);
  if (!hasValidCapabilityDefinitionRevision(parsed.definitionSnapshot)) {
    throw new CapabilityRevisionError(
      "capability.revision_mismatch",
      "task capability lock contains a definition revision mismatch",
    );
  }
  if (!hasValidCapabilityBindingRevision(parsed.bindingSnapshot)) {
    throw new CapabilityRevisionError(
      "capability.revision_mismatch",
      "task capability lock contains a binding revision mismatch",
    );
  }
  if (!hasValidAdapterDescriptorRevision(parsed.adapterDescriptorSnapshot)) {
    throw new CapabilityRevisionError(
      "capability.revision_mismatch",
      "task capability lock contains an adapter descriptor revision mismatch",
    );
  }
  return parsed;
}

export class CapabilityRevisionError extends Error {
  public readonly code: "capability.revision_mismatch";

  public constructor(code: "capability.revision_mismatch", message: string) {
    super(message);
    this.name = "CapabilityRevisionError";
    this.code = code;
  }
}

function digestMaterial(material: unknown): Sha256Digest {
  return sha256CanonicalJson(JsonValueSchema.parse(material));
}
