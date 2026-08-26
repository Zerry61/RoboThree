import type {
  AdapterDescriptor,
  CapabilityBinding,
  CapabilityDefinition,
  JsonValue,
  RegistrySnapshot,
  TaskCapabilityLock,
} from "@robothree/contracts";

import {
  hasValidRegistrySnapshotRevision,
  validateTaskCapabilityLockRevisions,
} from "./capability-revision.js";

export type CapabilityAvailability = Readonly<{
  capabilityId: string;
  bindingId: string;
  adapterDescriptorId: string;
  revoked?: boolean;
  disabled?: boolean;
  credentialStatus?: "available" | "unavailable";
  healthStatus?: "healthy" | "degraded" | "unhealthy";
}>;

export type ResolvedCapability = Readonly<{
  registryRevision: string;
  definition: CapabilityDefinition;
  binding: CapabilityBinding;
  adapterDescriptor: AdapterDescriptor;
}>;

export type CapabilityResolutionErrorCode =
  | "capability.ambiguous"
  | "capability.binding_not_found"
  | "capability.credential_unavailable"
  | "capability.disabled"
  | "capability.health_unavailable"
  | "capability.integrity_violation"
  | "capability.not_found"
  | "capability.registry_revision_mismatch"
  | "capability.revoked"
  | "capability.revision_mismatch"
  | "capability.state_subject_mismatch";

export class CapabilityResolutionError extends Error {
  public readonly code: CapabilityResolutionErrorCode;
  public readonly details: Readonly<Record<string, JsonValue>>;

  public constructor(
    code: CapabilityResolutionErrorCode,
    message: string,
    details: Readonly<Record<string, JsonValue>> = {},
  ) {
    super(message);
    this.name = "CapabilityResolutionError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export class CapabilityResolver {
  readonly #snapshot: RegistrySnapshot;
  readonly #definitions = new Map<string, readonly CapabilityDefinition[]>();
  readonly #bindings = new Map<string, readonly CapabilityBinding[]>();
  readonly #descriptors = new Map<string, AdapterDescriptor>();

  public constructor(snapshot: RegistrySnapshot) {
    if (!hasValidRegistrySnapshotRevision(snapshot)) {
      throw new CapabilityResolutionError(
        "capability.integrity_violation",
        "registry snapshot revision does not match its canonical content",
      );
    }
    this.#snapshot = snapshot;
    for (const definition of [
      ...snapshot.agentVisibleCapabilities.models,
      ...snapshot.agentVisibleCapabilities.tools,
    ]) {
      this.#definitions.set(
        definition.capabilityId,
        [...(this.#definitions.get(definition.capabilityId) ?? []), definition],
      );
    }
    for (const binding of snapshot.infrastructureResources.capabilityBindings) {
      this.#bindings.set(
        binding.capability.capabilityId,
        [...(this.#bindings.get(binding.capability.capabilityId) ?? []), binding],
      );
    }
    for (const descriptor of snapshot.infrastructureResources.adapterDescriptors) {
      this.#descriptors.set(descriptor.adapterDescriptorId, descriptor);
    }
  }

  public resolveById(
    registryRevision: string,
    capabilityId: string,
    availability?: CapabilityAvailability,
  ): ResolvedCapability {
    if (registryRevision !== this.#snapshot.registryRevision) {
      throw new CapabilityResolutionError(
        "capability.registry_revision_mismatch",
        "requested registry revision is not the frozen registry revision",
        { expectedRegistryRevision: this.#snapshot.registryRevision, registryRevision },
      );
    }
    const definitions = this.#definitions.get(capabilityId) ?? [];
    if (definitions.length === 0) {
      throw new CapabilityResolutionError(
        "capability.not_found",
        `capability ${capabilityId} is not registered`,
        { capabilityId },
      );
    }
    if (definitions.length !== 1) {
      throw new CapabilityResolutionError(
        "capability.ambiguous",
        `capability ${capabilityId} has more than one definition`,
        { capabilityId },
      );
    }
    const bindings = this.#bindings.get(capabilityId) ?? [];
    if (bindings.length !== 1) {
      throw new CapabilityResolutionError(
        bindings.length === 0 ? "capability.binding_not_found" : "capability.ambiguous",
        `capability ${capabilityId} does not have exactly one binding`,
        { capabilityId, bindingCount: bindings.length },
      );
    }
    const definition = definitions[0]!;
    const binding = bindings[0]!;
    if (binding.capability.capabilityRevision !== definition.revision) {
      throw new CapabilityResolutionError(
        "capability.revision_mismatch",
        "binding does not reference the resolved definition revision",
        { capabilityId },
      );
    }
    const descriptor = this.#descriptors.get(binding.adapterDescriptor.adapterDescriptorId);
    if (
      descriptor === undefined
      || descriptor.revision !== binding.adapterDescriptor.adapterDescriptorRevision
    ) {
      throw new CapabilityResolutionError(
        "capability.revision_mismatch",
        "binding does not reference an available exact adapter descriptor revision",
        { capabilityId },
      );
    }
    const route = Object.freeze({
      registryRevision: this.#snapshot.registryRevision,
      definition,
      binding,
      adapterDescriptor: descriptor,
    });
    applyRestrictiveAvailability(route, availability);
    return route;
  }

  public resolveLocked(
    lock: TaskCapabilityLock,
    availability?: CapabilityAvailability,
  ): ResolvedCapability {
    let validated: TaskCapabilityLock;
    try {
      validated = validateTaskCapabilityLockRevisions(lock);
    } catch (error) {
      throw new CapabilityResolutionError(
        "capability.revision_mismatch",
        error instanceof Error ? error.message : "task capability lock revision is invalid",
        { lockId: lock.lockId },
      );
    }
    const route = Object.freeze({
      registryRevision: validated.registryRevision,
      definition: validated.definitionSnapshot,
      binding: validated.bindingSnapshot,
      adapterDescriptor: validated.adapterDescriptorSnapshot,
    });
    applyRestrictiveAvailability(route, availability);
    return route;
  }
}

function applyRestrictiveAvailability(
  route: ResolvedCapability,
  availability?: CapabilityAvailability,
): void {
  if (availability === undefined) {
    return;
  }
  if (
    availability.capabilityId !== route.definition.capabilityId
    || availability.bindingId !== route.binding.bindingId
    || availability.adapterDescriptorId !== route.adapterDescriptor.adapterDescriptorId
  ) {
    throw new CapabilityResolutionError(
      "capability.state_subject_mismatch",
      "live availability state does not describe the resolved static route",
      { capabilityId: route.definition.capabilityId },
    );
  }
  const denial: readonly [boolean | undefined, CapabilityResolutionErrorCode, string][] = [
    [availability.revoked, "capability.revoked", "capability has been revoked"],
    [availability.disabled, "capability.disabled", "capability has been disabled"],
    [availability.credentialStatus === "unavailable", "capability.credential_unavailable", "capability credential is unavailable"],
    [availability.healthStatus === "unhealthy", "capability.health_unavailable", "capability adapter is unhealthy"],
  ];
  for (const [denied, code, message] of denial) {
    if (denied) {
      throw new CapabilityResolutionError(code, message, {
        capabilityId: route.definition.capabilityId,
        bindingId: route.binding.bindingId,
      });
    }
  }
}
