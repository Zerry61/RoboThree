import {
  AdapterDescriptorSchema,
  CapabilityBindingSchema,
  CapabilityDefinitionSchema,
  CONTRACT_VERSION,
  RegistrySnapshotSchema,
} from "@robothree/contracts";
import type {
  AdapterDescriptor,
  CapabilityBinding,
  CapabilityDefinition,
  CapabilitySource,
  JsonValue,
  RegistrySnapshot,
  RegistrySnapshotMaterial,
} from "@robothree/contracts";

import {
  calculateRegistryRevision,
  hasValidAdapterDescriptorRevision,
  hasValidCapabilityBindingRevision,
  hasValidCapabilityDefinitionRevision,
} from "./capability-revision.js";

export type RegistryBuildErrorCode =
  | "registry.already_finalized"
  | "registry.duplicate_adapter_descriptor"
  | "registry.duplicate_binding"
  | "registry.duplicate_capability"
  | "registry.duplicate_capability_name"
  | "registry.invalid_adapter_descriptor"
  | "registry.invalid_binding"
  | "registry.invalid_capability"
  | "registry.missing_adapter_descriptor"
  | "registry.missing_binding"
  | "registry.missing_capability"
  | "registry.multiple_bindings"
  | "registry.port_mismatch"
  | "registry.revision_mismatch"
  | "registry.untrusted_source";

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type FinalizedRegistrySnapshot = DeepReadonly<RegistrySnapshot>;

export class RegistryBuildError extends Error {
  public readonly code: RegistryBuildErrorCode;
  public readonly details: Readonly<Record<string, JsonValue>>;

  public constructor(
    code: RegistryBuildErrorCode,
    message: string,
    details: Readonly<Record<string, JsonValue>> = {},
  ) {
    super(message);
    this.name = "RegistryBuildError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export class RegistryBuilder {
  readonly #definitions = new Map<string, CapabilityDefinition>();
  readonly #bindings = new Map<string, CapabilityBinding>();
  readonly #descriptors = new Map<string, AdapterDescriptor>();
  readonly #trustedSources: ReadonlySet<string>;
  #finalized = false;

  public constructor(input: { trustedSources: readonly CapabilitySource[] }) {
    this.#trustedSources = new Set(input.trustedSources.map(sourceKey));
    if (this.#trustedSources.size !== input.trustedSources.length) {
      throw new RegistryBuildError(
        "registry.untrusted_source",
        "trusted source allowlist contains duplicate entries",
      );
    }
  }

  public registerCapability(input: CapabilityDefinition): this {
    this.ensureOpen();
    const parsed = this.parseCapability(input);
    if (this.#definitions.has(parsed.capabilityId)) {
      throw new RegistryBuildError(
        "registry.duplicate_capability",
        `capability ${parsed.capabilityId} is already registered`,
        { capabilityId: parsed.capabilityId },
      );
    }
    this.#definitions.set(parsed.capabilityId, parsed);
    return this;
  }

  public registerBinding(input: CapabilityBinding): this {
    this.ensureOpen();
    const parsed = this.parseBinding(input);
    if (this.#bindings.has(parsed.bindingId)) {
      throw new RegistryBuildError(
        "registry.duplicate_binding",
        `binding ${parsed.bindingId} is already registered`,
        { bindingId: parsed.bindingId },
      );
    }
    this.#bindings.set(parsed.bindingId, parsed);
    return this;
  }

  public registerAdapterDescriptor(input: AdapterDescriptor): this {
    this.ensureOpen();
    const parsed = this.parseAdapterDescriptor(input);
    if (this.#descriptors.has(parsed.adapterDescriptorId)) {
      throw new RegistryBuildError(
        "registry.duplicate_adapter_descriptor",
        `adapter descriptor ${parsed.adapterDescriptorId} is already registered`,
        { adapterDescriptorId: parsed.adapterDescriptorId },
      );
    }
    this.#descriptors.set(parsed.adapterDescriptorId, parsed);
    return this;
  }

  public finalize(): FinalizedRegistrySnapshot {
    this.ensureOpen();
    this.#finalized = true;

    const definitions = sortBy(
      [...this.#definitions.values()],
      (definition) => definition.capabilityId,
    );
    const bindings = sortBy([...this.#bindings.values()], (binding) => binding.bindingId);
    const descriptors = sortBy(
      [...this.#descriptors.values()],
      (descriptor) => descriptor.adapterDescriptorId,
    );

    this.validateLogicalNames(definitions);
    this.validateReferences(definitions, bindings);

    const material: RegistrySnapshotMaterial = {
      schemaVersion: CONTRACT_VERSION,
      agentVisibleCapabilities: {
        models: definitions.filter((definition) => definition.kind === "model"),
        tools: definitions.filter((definition) => definition.kind === "tool"),
      },
      infrastructureResources: {
        capabilityBindings: bindings,
        adapterDescriptors: descriptors,
      },
    };
    const snapshot = RegistrySnapshotSchema.parse({
      ...material,
      registryRevision: calculateRegistryRevision(material),
    });
    return deepFreeze(snapshot);
  }

  private ensureOpen(): void {
    if (this.#finalized) {
      throw new RegistryBuildError(
        "registry.already_finalized",
        "registry builder has already been finalized",
      );
    }
  }

  private parseCapability(input: CapabilityDefinition): CapabilityDefinition {
    const parsed = CapabilityDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      throw new RegistryBuildError(
        "registry.invalid_capability",
        "capability definition failed contract validation",
        { issue: parsed.error.issues[0]?.message ?? "unknown validation error" },
      );
    }
    if (parsed.data.schemaVersion !== CONTRACT_VERSION) {
      throw new RegistryBuildError(
        "registry.invalid_capability",
        "capability definition must use the current Contract version",
        { schemaVersion: parsed.data.schemaVersion },
      );
    }
    if (!hasValidCapabilityDefinitionRevision(parsed.data)) {
      throw new RegistryBuildError(
        "registry.revision_mismatch",
        `capability ${parsed.data.capabilityId} revision does not match its canonical content`,
        { capabilityId: parsed.data.capabilityId },
      );
    }
    this.validateTrustedSource(parsed.data.source);
    return parsed.data;
  }

  private parseBinding(input: CapabilityBinding): CapabilityBinding {
    const parsed = CapabilityBindingSchema.safeParse(input);
    if (!parsed.success) {
      throw new RegistryBuildError(
        "registry.invalid_binding",
        "capability binding failed contract validation",
        { issue: parsed.error.issues[0]?.message ?? "unknown validation error" },
      );
    }
    if (parsed.data.schemaVersion !== CONTRACT_VERSION) {
      throw new RegistryBuildError(
        "registry.invalid_binding",
        "capability binding must use the current Contract version",
        { schemaVersion: parsed.data.schemaVersion },
      );
    }
    if (!hasValidCapabilityBindingRevision(parsed.data)) {
      throw new RegistryBuildError(
        "registry.revision_mismatch",
        `binding ${parsed.data.bindingId} revision does not match its canonical content`,
        { bindingId: parsed.data.bindingId },
      );
    }
    this.validateTrustedSource(parsed.data.source);
    return parsed.data;
  }

  private parseAdapterDescriptor(input: AdapterDescriptor): AdapterDescriptor {
    const parsed = AdapterDescriptorSchema.safeParse(input);
    if (!parsed.success) {
      throw new RegistryBuildError(
        "registry.invalid_adapter_descriptor",
        "adapter descriptor failed contract validation",
        { issue: parsed.error.issues[0]?.message ?? "unknown validation error" },
      );
    }
    if (parsed.data.schemaVersion !== CONTRACT_VERSION) {
      throw new RegistryBuildError(
        "registry.invalid_adapter_descriptor",
        "adapter descriptor must use the current Contract version",
        { schemaVersion: parsed.data.schemaVersion },
      );
    }
    if (!hasValidAdapterDescriptorRevision(parsed.data)) {
      throw new RegistryBuildError(
        "registry.revision_mismatch",
        `adapter descriptor ${parsed.data.adapterDescriptorId} revision does not match its canonical content`,
        { adapterDescriptorId: parsed.data.adapterDescriptorId },
      );
    }
    this.validateTrustedSource(parsed.data.source);
    return parsed.data;
  }

  private validateTrustedSource(source: CapabilitySource): void {
    if (!this.#trustedSources.has(sourceKey(source))) {
      throw new RegistryBuildError(
        "registry.untrusted_source",
        `source ${source.packageId} is not present in the bootstrap trust allowlist`,
        { packageId: source.packageId, packageRevision: source.packageRevision, trust: source.trust },
      );
    }
  }

  private validateLogicalNames(definitions: readonly CapabilityDefinition[]): void {
    const names = new Set<string>();
    for (const definition of definitions) {
      const key = `${definition.kind}:${definition.name.normalize("NFKC").toLowerCase()}`;
      if (names.has(key)) {
        throw new RegistryBuildError(
          "registry.duplicate_capability_name",
          `capability name ${definition.name} is duplicated within kind ${definition.kind}`,
          { kind: definition.kind, name: definition.name },
        );
      }
      names.add(key);
    }
  }

  private validateReferences(
    definitions: readonly CapabilityDefinition[],
    bindings: readonly CapabilityBinding[],
  ): void {
    const bindingsByCapability = new Map<string, CapabilityBinding>();

    for (const binding of bindings) {
      const definition = this.#definitions.get(binding.capability.capabilityId);
      if (definition === undefined) {
        throw new RegistryBuildError(
          "registry.missing_capability",
          `binding ${binding.bindingId} references an unknown capability`,
          { bindingId: binding.bindingId, capabilityId: binding.capability.capabilityId },
        );
      }
      if (definition.revision !== binding.capability.capabilityRevision) {
        throw new RegistryBuildError(
          "registry.revision_mismatch",
          `binding ${binding.bindingId} references a different capability revision`,
          { bindingId: binding.bindingId, capabilityId: definition.capabilityId },
        );
      }
      if (bindingsByCapability.has(definition.capabilityId)) {
        throw new RegistryBuildError(
          "registry.multiple_bindings",
          `capability ${definition.capabilityId} has more than one Alpha binding`,
          { capabilityId: definition.capabilityId },
        );
      }

      const descriptor = this.#descriptors.get(binding.adapterDescriptor.adapterDescriptorId);
      if (descriptor === undefined) {
        throw new RegistryBuildError(
          "registry.missing_adapter_descriptor",
          `binding ${binding.bindingId} references an unknown adapter descriptor`,
          { bindingId: binding.bindingId, adapterDescriptorId: binding.adapterDescriptor.adapterDescriptorId },
        );
      }
      if (descriptor.revision !== binding.adapterDescriptor.adapterDescriptorRevision) {
        throw new RegistryBuildError(
          "registry.revision_mismatch",
          `binding ${binding.bindingId} references a different adapter descriptor revision`,
          { bindingId: binding.bindingId, adapterDescriptorId: descriptor.adapterDescriptorId },
        );
      }
      if (descriptor.adapterKind !== binding.port) {
        throw new RegistryBuildError(
          "registry.port_mismatch",
          `binding ${binding.bindingId} port does not match adapter descriptor kind`,
          { bindingId: binding.bindingId, port: binding.port, adapterKind: descriptor.adapterKind },
        );
      }
      bindingsByCapability.set(definition.capabilityId, binding);
    }

    for (const definition of definitions) {
      if (!bindingsByCapability.has(definition.capabilityId)) {
        throw new RegistryBuildError(
          "registry.missing_binding",
          `capability ${definition.capabilityId} has no Alpha binding`,
          { capabilityId: definition.capabilityId },
        );
      }
    }
  }
}

function sortBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => {
    const leftKey = key(left);
    const rightKey = key(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value as DeepReadonly<T>;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value) as DeepReadonly<T>;
}

function sourceKey(source: CapabilitySource): string {
  return `${source.trust}\u0000${source.packageId}\u0000${source.packageRevision}`;
}
