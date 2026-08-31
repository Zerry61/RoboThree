import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  CONTRACT_VERSION,
  JsonValueSchema,
  TaskCapabilityLockSchema,
  type Sha256Digest,
  type TaskCapabilityLock,
} from "@robothree/contracts";

import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
  validateTaskCapabilityLockRevisions,
} from "../registry/capability-revision.js";
import {
  validatePersonalModelDefinition,
  validatePersonalModelOwnerNamespace,
  type PersonalModelDefinition,
  type PersonalModelOwnerIdentity,
  type PersonalModelOwnerNamespace,
} from "./personal-model-domain.js";
import {
  PersonalModelProviderProfileRegistry,
  type PersonalModelProviderProfile,
} from "./personal-model-provider-profile.js";

const CONFIGURATION_REF_DOMAIN = "robothree.personal-model.configuration-ref.v1";
const CONFIGURATION_REF_PREFIX = "pmcfg1:";
const CONFIGURATION_PAYLOAD_BYTES = 101;
const CONFIGURATION_MAC_BYTES = 32;
const PERSONAL_ADAPTER_ID = "adapter.model.local-personal-openai-compatible";
const PERSONAL_PACKAGE_ID = "package.model.local-personal-runtime";
const PERSONAL_PACKAGE_REVISION = sha256CanonicalJson(JsonValueSchema.parse({
  packageId: PERSONAL_PACKAGE_ID,
  revision: "dfi-4a.3.2-v1",
}));

export type PersonalModelConfigurationIdentity = Readonly<{
  ownerIdentity: PersonalModelOwnerIdentity;
  configurationRevision: Sha256Digest;
  executionDefinitionDigest: Sha256Digest;
}>;

export class PersonalModelTaskLockError extends Error {
  public constructor(public readonly code:
    | "personal_model.configuration_ref_invalid"
    | "personal_model.lock_material_invalid"
    | "personal_model.lock_authority_mismatch"
    | "model.personal_id_not_capability_id") {
    super(code);
    this.name = "PersonalModelTaskLockError";
  }
}

export class PersonalModelConfigurationRefCodec {
  public encode(input: Readonly<{
    namespace: PersonalModelOwnerNamespace;
    personalModelId: string;
    ownerIdentity: PersonalModelOwnerIdentity;
    configurationRevision: string;
    executionDefinitionDigest: string;
  }>): string {
    const namespace = validatePersonalModelOwnerNamespace(input.namespace);
    if (namespace.namespaceRevision !== input.ownerIdentity.ownerScopeNamespaceRevision) {
      throw new PersonalModelTaskLockError("personal_model.lock_authority_mismatch");
    }
    const payload = Buffer.alloc(CONFIGURATION_PAYLOAD_BYTES);
    payload.writeUInt8(1, 0);
    payload.writeUInt32BE(input.ownerIdentity.ownerScopeNamespaceRevision, 1);
    writeDigest(payload, 5, input.ownerIdentity.ownerScopeDigest);
    writeDigest(payload, 37, input.configurationRevision);
    writeDigest(payload, 69, input.executionDefinitionDigest);
    const mac = configurationMac(namespace.namespaceKey, input.personalModelId, payload);
    try {
      return `${CONFIGURATION_REF_PREFIX}${Buffer.concat([payload, mac]).toString("base64url")}`;
    } finally {
      payload.fill(0);
      mac.fill(0);
      namespace.namespaceKey.fill(0);
    }
  }

  public decode(input: Readonly<{
    reference: string;
    namespace: PersonalModelOwnerNamespace;
    personalModelId: string;
  }>): PersonalModelConfigurationIdentity {
    if (!input.reference.startsWith(CONFIGURATION_REF_PREFIX)
      || input.reference.length > 512) {
      throw new PersonalModelTaskLockError("personal_model.configuration_ref_invalid");
    }
    const encoded = input.reference.slice(CONFIGURATION_REF_PREFIX.length);
    if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) {
      throw new PersonalModelTaskLockError("personal_model.configuration_ref_invalid");
    }
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.byteLength !== CONFIGURATION_PAYLOAD_BYTES + CONFIGURATION_MAC_BYTES) {
      bytes.fill(0);
      throw new PersonalModelTaskLockError("personal_model.configuration_ref_invalid");
    }
    const namespace = validatePersonalModelOwnerNamespace(input.namespace);
    const payload = bytes.subarray(0, CONFIGURATION_PAYLOAD_BYTES);
    const actualMac = bytes.subarray(CONFIGURATION_PAYLOAD_BYTES);
    const expectedMac = configurationMac(namespace.namespaceKey, input.personalModelId, payload);
    try {
      if (payload.readUInt8(0) !== 1 || !timingSafeEqual(actualMac, expectedMac)) {
        throw new PersonalModelTaskLockError("personal_model.configuration_ref_invalid");
      }
      const ownerScopeNamespaceRevision = payload.readUInt32BE(1);
      if (ownerScopeNamespaceRevision !== namespace.namespaceRevision) {
        throw new PersonalModelTaskLockError("personal_model.configuration_ref_invalid");
      }
      return Object.freeze({
        ownerIdentity: Object.freeze({
          ownerScopeNamespaceRevision,
          ownerScopeDigest: readDigest(payload, 5),
        }),
        configurationRevision: readDigest(payload, 37),
        executionDefinitionDigest: readDigest(payload, 69),
      });
    } finally {
      bytes.fill(0);
      expectedMac.fill(0);
      namespace.namespaceKey.fill(0);
    }
  }
}

export class PersonalModelTaskLockMaterializer {
  readonly #profiles: PersonalModelProviderProfileRegistry;
  readonly #codec: PersonalModelConfigurationRefCodec;

  public constructor(input: Readonly<{
    profiles?: PersonalModelProviderProfileRegistry;
    codec?: PersonalModelConfigurationRefCodec;
  }> = {}) {
    this.#profiles = input.profiles ?? new PersonalModelProviderProfileRegistry();
    this.#codec = input.codec ?? new PersonalModelConfigurationRefCodec();
  }

  public prepare(input: Readonly<{
    taskId: string;
    lockId: string;
    lockedAt: string;
    registryRevision: string;
    namespace: PersonalModelOwnerNamespace;
    definition: PersonalModelDefinition;
  }>): TaskCapabilityLock {
    const definition = validatePersonalModelDefinition(input.definition);
    if (!/^model\.[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(definition.personalModelId)) {
      throw new PersonalModelTaskLockError("model.personal_id_not_capability_id");
    }
    this.#profiles.resolve(
      definition.providerKind,
      definition.providerProfileRevision,
    );
    const configurationRef = this.#codec.encode({
      namespace: input.namespace,
      personalModelId: definition.personalModelId,
      ownerIdentity: {
        ownerScopeNamespaceRevision: definition.ownerScopeNamespaceRevision,
        ownerScopeDigest: definition.ownerScopeDigest,
      },
      configurationRevision: definition.configurationRevision,
      executionDefinitionDigest: definition.executionDefinitionDigest,
    });
    const { source, descriptor, capability } =
      materializePersonalModelRegistryFacts(definition, this.#profiles);
    const binding = createCapabilityBinding({
      schemaVersion: CONTRACT_VERSION,
      bindingId: bindingId(definition.personalModelId, definition.configurationRevision),
      capability: {
        capabilityId: capability.capabilityId,
        capabilityRevision: capability.revision,
      },
      adapterDescriptor: {
        adapterDescriptorId: descriptor.adapterDescriptorId,
        adapterDescriptorRevision: descriptor.revision,
      },
      port: "model_provider",
      source,
      configurationRef,
    });
    const lock = TaskCapabilityLockSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      lockId: input.lockId,
      taskId: input.taskId,
      registryRevision: input.registryRevision,
      definitionSnapshot: capability,
      bindingSnapshot: binding,
      adapterDescriptorSnapshot: descriptor,
      lockedAt: input.lockedAt,
    });
    return validateTaskCapabilityLockRevisions(lock);
  }

  public verify(input: Readonly<{
    lock: TaskCapabilityLock;
    namespace: PersonalModelOwnerNamespace;
  }>): PersonalModelConfigurationIdentity {
    const lock = validateTaskCapabilityLockRevisions(input.lock);
    if (!isPersonalModelLock(lock) || lock.bindingSnapshot.configurationRef === undefined) {
      throw new PersonalModelTaskLockError("personal_model.lock_material_invalid");
    }
    return this.#codec.decode({
      reference: lock.bindingSnapshot.configurationRef,
      namespace: input.namespace,
      personalModelId: lock.definitionSnapshot.capabilityId,
    });
  }

  public profileFor(definition: PersonalModelDefinition): PersonalModelProviderProfile {
    return this.#profiles.resolve(definition.providerKind, definition.providerProfileRevision);
  }
}

export function isPersonalModelLock(lock: TaskCapabilityLock): boolean {
  const source = lock.definitionSnapshot.source;
  return lock.definitionSnapshot.kind === "model"
    && source.trust === "official"
    && source.packageId === PERSONAL_PACKAGE_ID
    && source.packageRevision === PERSONAL_PACKAGE_REVISION
    && lock.bindingSnapshot.source.packageId === PERSONAL_PACKAGE_ID
    && lock.adapterDescriptorSnapshot.source.packageId === PERSONAL_PACKAGE_ID
    && lock.adapterDescriptorSnapshot.adapterDescriptorId === PERSONAL_ADAPTER_ID
    && lock.adapterDescriptorSnapshot.protocol.name === "openai_compatible"
    && lock.adapterDescriptorSnapshot.protocol.version === "v1";
}

export const PERSONAL_MODEL_ADAPTER_DESCRIPTOR_ID = PERSONAL_ADAPTER_ID;

/**
 * Produces the exact Registry facts used by both entitlement projection and
 * Task lock materialization. Keeping this as the single source prevents the
 * production R2D graph from deriving a model revision with a second formula.
 */
export function materializePersonalModelRegistryFacts(
  input: PersonalModelDefinition,
  profiles: PersonalModelProviderProfileRegistry =
    new PersonalModelProviderProfileRegistry(),
) {
  const definition = validatePersonalModelDefinition(input);
  if (!/^model\.[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(definition.personalModelId)) {
    throw new PersonalModelTaskLockError("model.personal_id_not_capability_id");
  }
  profiles.resolve(definition.providerKind, definition.providerProfileRevision);
  const source = Object.freeze({
    trust: "official" as const,
    packageId: PERSONAL_PACKAGE_ID,
    packageRevision: PERSONAL_PACKAGE_REVISION,
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: PERSONAL_ADAPTER_ID,
    source,
    implementationRef: `pmendpoint:${definition.endpointIdentityDigest}`,
    runtimeBoundary: "in_process",
    protocol: { name: "openai_compatible", version: "v1" },
    adapterKind: "model_provider",
  });
  const capability = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: definition.personalModelId,
    name: definition.displayName,
    description: "Owner-scoped personal model executed by the trusted local runtime",
    source,
    kind: "model",
    model: {
      family: `${definition.providerKind}.openai_compatible`,
      inputModalities: [
        "text",
        ...(definition.capabilities.includes("vision") ? ["image" as const] : []),
      ],
      outputModalities: ["text"],
      supportsStreaming: definition.capabilities.includes("streaming"),
    },
  });
  return Object.freeze({ source, descriptor, capability });
}

function configurationMac(
  key: Uint8Array,
  personalModelId: string,
  payload: Uint8Array,
): Buffer {
  return createHmac("sha256", key)
    .update(CONFIGURATION_REF_DOMAIN, "utf8")
    .update("\u0000", "utf8")
    .update(personalModelId.normalize("NFC"), "utf8")
    .update("\u0000", "utf8")
    .update(payload)
    .digest();
}

function writeDigest(target: Buffer, offset: number, value: string): void {
  if (!/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new PersonalModelTaskLockError("personal_model.configuration_ref_invalid");
  }
  Buffer.from(value.slice(7), "hex").copy(target, offset);
}

function readDigest(source: Buffer, offset: number): Sha256Digest {
  return `sha256:${source.subarray(offset, offset + 32).toString("hex")}` as Sha256Digest;
}

function bindingId(modelId: string, configurationRevision: string): string {
  const suffix = createHash("sha256")
    .update("robothree.personal-model.binding-id.v1\u0000", "utf8")
    .update(modelId, "utf8")
    .update("\u0000", "utf8")
    .update(configurationRevision, "utf8")
    .digest("hex")
    .slice(0, 40);
  return `binding.model.local-personal.${suffix}`;
}
