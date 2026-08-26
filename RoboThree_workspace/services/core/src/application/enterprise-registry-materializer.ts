import {
  CONTRACT_VERSION,
  type AgentDefinitionRevision,
  type CapabilitySource,
  type EnterprisePackageReference,
  type EnterpriseResourceDescriptor,
  type ToolRiskFactKind,
} from "@robothree/contracts";

import type {
  EnterpriseIdentityScope,
} from "../ports/enterprise-access-token-provider.js";
import type {
  EnterpriseRuntimeRegistrySource,
  EnterpriseRuntimeSessionVerifier,
} from "../ports/enterprise-runtime-registry-source.js";
import {
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "../registry/capability-revision.js";
import {
  RegistryBuildError,
  RegistryBuilder,
  type FinalizedRegistrySnapshot,
} from "../registry/registry-builder.js";
import {
  ConfigurationValidator,
  EnterpriseConfigurationValidationError,
  canonicalJson,
  rawSha256,
  type EnterpriseConfigurationCompatibility,
} from "./configuration-validator.js";
import type {
  ActivatedEnterpriseConfiguration,
  MaterializedEnterpriseConfiguration,
} from "./enterprise-configuration-types.js";
import {
  PackageMaterializer,
} from "./package-materializer.js";
import {
  sameEnterpriseIdentityScope,
} from "../ports/enterprise-access-token-provider.js";
import {
  hasValidAgentDefinitionRevision,
} from "./runtime-selection-revisions.js";

export type EnterpriseRuntimeGenerationIdentity = Readonly<{
  candidateKey: string;
  snapshotRevision: string;
  snapshotDigest: string;
  materializationDigest: string;
}>;

export type EnterpriseRuntimePackageReference = Readonly<{
  kind: "agent" | "skill";
  packageId: string;
  revision: string;
  digest: string;
  sealed: boolean;
  digestValid: boolean;
}>;

export type EnterpriseRuntimeKnowledgeReference = Readonly<{
  knowledgeId: string;
  revision: string;
  digest: string;
  available: boolean;
  locallyExecutable: boolean;
}>;

export type EnterpriseRegistryMaterialization = Readonly<{
  generation: EnterpriseRuntimeGenerationIdentity;
  storageActivatedAt: string;
  registrySnapshot: FinalizedRegistrySnapshot;
  packages: readonly EnterpriseRuntimePackageReference[];
  knowledge: readonly EnterpriseRuntimeKnowledgeReference[];
  registeredCapabilityIds: readonly string[];
  availableDependencyIds: readonly string[];
  locallyExecutableCapabilityIds: readonly string[];
  locallyExecutableDependencyIds: readonly string[];
}>;

export type EnterpriseRegistryMaterializationErrorCode =
  | "enterprise_registry.active_generation_missing"
  | "enterprise_registry.session_invalid"
  | "enterprise_registry.scope_mismatch"
  | "enterprise_registry.integrity_mismatch"
  | "enterprise_registry.registry_invalid";

export class EnterpriseRegistryMaterializationError extends Error {
  constructor(
    readonly code: EnterpriseRegistryMaterializationErrorCode,
    message: string,
    readonly details: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "EnterpriseRegistryMaterializationError";
    this.details = Object.freeze({ ...details });
  }
}

export type LocalExecutableEnterpriseCapabilityFailure =
  | "agent_definition_invalid"
  | "generation_not_runtime_active"
  | "package_not_found"
  | "package_not_sealed"
  | "package_digest_invalid"
  | "required_dependency_unavailable"
  | "referenced_capability_unusable";

export type LocalExecutableEnterpriseCapabilityDecision = Readonly<{
  executable: boolean;
  checks: Readonly<{
    generationRuntimeActive: boolean;
    packageSealed: boolean;
    packageDigestValid: boolean;
    requiredDependenciesAvailable: boolean;
    referencedCapabilitiesUsable: boolean;
  }>;
  failures: readonly LocalExecutableEnterpriseCapabilityFailure[];
}>;

export class LocalExecutableEnterpriseCapabilityEvaluator {
  evaluate(input: Readonly<{
    materialization: EnterpriseRegistryMaterialization;
    runtimeActiveGeneration: EnterpriseRuntimeGenerationIdentity;
    package: EnterprisePackageReference;
    agentDefinition: AgentDefinitionRevision;
  }>): LocalExecutableEnterpriseCapabilityDecision {
    const failures: LocalExecutableEnterpriseCapabilityFailure[] = [];
    const agentDefinitionValid = isValidAgentDefinition(
      input.agentDefinition,
    );
    if (!agentDefinitionValid) {
      failures.push("agent_definition_invalid");
    }
    const generationRuntimeActive = sameGeneration(
      input.materialization.generation,
      input.runtimeActiveGeneration,
    );
    if (!generationRuntimeActive) {
      failures.push("generation_not_runtime_active");
    }

    const packageReference = input.materialization.packages.find((candidate) =>
      candidate.kind === input.package.kind
      && candidate.packageId === input.package.packageId
      && candidate.revision === input.package.revision
      && candidate.digest === input.package.digest);
    const packageSealed = packageReference?.sealed ?? false;
    const packageDigestValid = packageReference?.digestValid ?? false;
    if (packageReference === undefined) {
      failures.push("package_not_found");
    } else {
      if (!packageSealed) failures.push("package_not_sealed");
      if (!packageDigestValid) failures.push("package_digest_invalid");
    }

    const requiredDependenciesAvailable = agentDefinitionValid
      && dependenciesMatchMaterialization(
        input.agentDefinition,
        input.materialization,
      );
    if (!requiredDependenciesAvailable) {
      failures.push("required_dependency_unavailable");
    }
    const referencedCapabilitiesUsable = agentDefinitionValid
      && capabilitiesMatchLocalRegistry(
        input.agentDefinition,
        input.materialization,
      );
    if (!referencedCapabilitiesUsable) {
      failures.push("referenced_capability_unusable");
    }

    return Object.freeze({
      executable: failures.length === 0,
      checks: Object.freeze({
        generationRuntimeActive,
        packageSealed,
        packageDigestValid,
        requiredDependenciesAvailable,
        referencedCapabilitiesUsable,
      }),
      failures: Object.freeze(failures),
    });
  }
}

function isValidAgentDefinition(agent: AgentDefinitionRevision): boolean {
  try {
    return hasValidAgentDefinitionRevision(agent);
  } catch {
    return false;
  }
}

function dependenciesMatchMaterialization(
  agent: AgentDefinitionRevision,
  materialization: EnterpriseRegistryMaterialization,
): boolean {
  const skills = new Map(
    materialization.packages
      .filter((item) => item.kind === "skill")
      .map((item) => [item.packageId, item]),
  );
  const knowledge = new Map(
    materialization.knowledge.map((item) => [item.knowledgeId, item]),
  );
  return agent.skillReferences.every((reference) => {
    const candidate = skills.get(reference.id);
    return candidate?.sealed === true
      && candidate.digestValid
      && reference.revision === contractDigest(candidate.revision)
      && reference.contentDigest === contractDigest(candidate.digest);
  }) && agent.knowledgeReferences.every((reference) => {
    const candidate = knowledge.get(reference.id);
    return candidate?.available === true
      && reference.revision === contractDigest(candidate.revision)
      && reference.contentDigest === contractDigest(candidate.digest);
  });
}

function capabilitiesMatchLocalRegistry(
  agent: AgentDefinitionRevision,
  materialization: EnterpriseRegistryMaterialization,
): boolean {
  const locallyExecutable = new Set(
    materialization.locallyExecutableCapabilityIds,
  );
  const definitions = new Map(
    [
      ...materialization.registrySnapshot.agentVisibleCapabilities.models,
      ...materialization.registrySnapshot.agentVisibleCapabilities.tools,
    ].map((definition) => [definition.capabilityId, definition]),
  );
  if (
    !locallyExecutable.has(agent.defaultModelId)
    || definitions.get(agent.defaultModelId)?.kind !== "model"
  ) {
    return false;
  }
  return agent.toolReferences.every((reference) => {
    const definition = definitions.get(reference.capabilityId);
    return locallyExecutable.has(reference.capabilityId)
      && definition?.kind === "tool"
      && definition.revision === reference.capabilityRevision;
  });
}

function contractDigest(rawDigest: string): `sha256:${string}` {
  return `sha256:${rawDigest}`;
}

export class EnterpriseRegistryMaterializer {
  readonly #source: EnterpriseRuntimeRegistrySource;
  readonly #sessionVerifier: EnterpriseRuntimeSessionVerifier;
  readonly #validator: ConfigurationValidator;
  readonly #packageMaterializer = new PackageMaterializer();

  constructor(input: Readonly<{
    source: EnterpriseRuntimeRegistrySource;
    sessionVerifier: EnterpriseRuntimeSessionVerifier;
    compatibility: EnterpriseConfigurationCompatibility;
  }>) {
    this.#source = input.source;
    this.#sessionVerifier = input.sessionVerifier;
    this.#validator = new ConfigurationValidator(input.compatibility);
  }

  async materialize(
    scope: EnterpriseIdentityScope,
  ): Promise<EnterpriseRegistryMaterialization> {
    await this.#assertSession(scope);
    const active = await this.#source.loadStorageActive(scope);
    return this.#materializeLoaded(scope, active);
  }

  async materializeExact(
    scope: EnterpriseIdentityScope,
    candidateKey: string,
  ): Promise<EnterpriseRegistryMaterialization> {
    await this.#assertSession(scope);
    const active = await this.#source.loadSealedGeneration(scope, candidateKey);
    return this.#materializeLoaded(scope, active);
  }

  #materializeLoaded(
    scope: EnterpriseIdentityScope,
    active: ActivatedEnterpriseConfiguration | undefined,
  ): EnterpriseRegistryMaterialization {
    if (active === undefined) {
      throw new EnterpriseRegistryMaterializationError(
        "enterprise_registry.active_generation_missing",
        "no exact sealed enterprise generation exists for this scope",
      );
    }
    if (!sameEnterpriseIdentityScope(active.configuration.identity.scope, scope)) {
      throw new EnterpriseRegistryMaterializationError(
        "enterprise_registry.scope_mismatch",
        "Storage Active enterprise generation belongs to another identity scope",
      );
    }

    const exact = this.#revalidateExactGeneration(active);
    return this.#buildRegistry(exact);
  }

  async #assertSession(scope: EnterpriseIdentityScope): Promise<void> {
    try {
      await this.#sessionVerifier.assertCurrentSession(
        scope,
        "configuration.read",
      );
    } catch {
      throw new EnterpriseRegistryMaterializationError(
        "enterprise_registry.session_invalid",
        "enterprise identity or managed-device session is not valid",
      );
    }
  }

  #revalidateExactGeneration(
    active: ActivatedEnterpriseConfiguration,
  ): ActivatedEnterpriseConfiguration {
    try {
      const configuration = active.configuration;
      const snapshot = this.#validator.validateSnapshot({
        rawJson: canonicalJson(configuration.snapshot),
        ...(configuration.snapshotEtag === undefined
          ? {}
          : { etag: configuration.snapshotEtag }),
      });
      const expectedReferences = new Map(
        [...snapshot.document.agents, ...snapshot.document.skills]
          .map((reference) => [
            packageKey(reference.kind, reference.packageId),
            reference,
          ]),
      );
      const packages = configuration.packages.map((item) => {
        const expected = expectedReferences.get(packageKey(
          item.reference.kind,
          item.reference.packageId,
        ));
        if (expected === undefined) {
          throw new EnterpriseConfigurationValidationError(
            "configuration.reference_mismatch",
            "sealed generation contains a package outside its exact snapshot",
          );
        }
        return this.#validator.validatePackage({
          rawJson: canonicalJson(item.document),
          expected,
          ...(item.etag === undefined ? {} : { etag: item.etag }),
        });
      });
      const rebuilt = this.#packageMaterializer.materialize({
        scope: configuration.identity.scope,
        snapshot,
        packages,
        sealedAt: configuration.sealedAt,
      });
      assertExactMaterialization(configuration, rebuilt);
      assertTimestamp(active.storageActivatedAt);
      return deepFreeze({
        configuration: rebuilt,
        storageActivatedAt: active.storageActivatedAt,
      });
    } catch (error) {
      if (error instanceof EnterpriseRegistryMaterializationError) throw error;
      throw new EnterpriseRegistryMaterializationError(
        "enterprise_registry.integrity_mismatch",
        "Storage Active enterprise generation failed exact integrity validation",
        {
          cause: error instanceof EnterpriseConfigurationValidationError
            ? error.code
            : "invalid_persisted_generation",
        },
      );
    }
  }

  #buildRegistry(
    active: ActivatedEnterpriseConfiguration,
  ): EnterpriseRegistryMaterialization {
    const configuration = active.configuration;
    assertDescriptorIdentities([
      ...configuration.snapshot.models,
      ...configuration.snapshot.tools,
      ...configuration.snapshot.knowledge,
    ]);
    const permissions = new Set(configuration.snapshot.fixedPermissions);
    const descriptors = [
      ...configuration.snapshot.models,
      ...configuration.snapshot.tools,
    ]
      .filter((descriptor) => descriptorIsAvailable(descriptor, permissions))
      .sort(compareDescriptor);
    const trustedSources = uniqueSources(descriptors);
    const builder = new RegistryBuilder({ trustedSources });
    const locallyExecutableDependencyIds: string[] = [];
    const locallyExecutableCapabilityIds: string[] = [];

    try {
      for (const descriptor of descriptors) {
        const records = capabilityRecords(
          descriptor,
          configuration.identity.candidateKey,
        );
        builder
          .registerCapability(records.definition)
          .registerAdapterDescriptor(records.adapter)
          .registerBinding(records.binding);
        if (isLocalEndpoint(descriptor.gatewayEndpoint)) {
          locallyExecutableDependencyIds.push(descriptor.id);
          locallyExecutableCapabilityIds.push(descriptor.id);
        }
      }
      const knowledge = [...configuration.snapshot.knowledge]
        .sort(compareDescriptor)
        .map((descriptor): EnterpriseRuntimeKnowledgeReference => {
          const available = descriptorIsAvailable(descriptor, permissions);
          const locallyExecutable = available
            && isLocalEndpoint(descriptor.gatewayEndpoint);
          if (locallyExecutable) {
            locallyExecutableDependencyIds.push(descriptor.id);
          }
          return Object.freeze({
            knowledgeId: descriptor.id,
            revision: descriptor.revision,
            digest: descriptor.digest,
            available,
            locallyExecutable,
          });
        });
      const registrySnapshot = builder.finalize();
      const registeredCapabilityIds = [
        ...registrySnapshot.agentVisibleCapabilities.models,
        ...registrySnapshot.agentVisibleCapabilities.tools,
      ].map((definition) => definition.capabilityId);
      const packageReferences = configuration.packages
        .map((item): EnterpriseRuntimePackageReference => ({
          kind: item.reference.kind,
          packageId: item.reference.packageId,
          revision: item.reference.revision,
          digest: item.reference.digest,
          sealed: true,
          digestValid: true,
        }))
        .sort(comparePackageReference);
      return deepFreeze({
        generation: generationIdentity(configuration),
        storageActivatedAt: active.storageActivatedAt,
        registrySnapshot,
        packages: packageReferences,
        knowledge,
        registeredCapabilityIds,
        availableDependencyIds: [
          ...new Set([
            ...packageReferences.map((item) => item.packageId),
            ...registeredCapabilityIds,
            ...knowledge
              .filter((item) => item.available)
              .map((item) => item.knowledgeId),
          ]),
        ].sort(),
        locallyExecutableCapabilityIds: [
          ...new Set(locallyExecutableCapabilityIds),
        ].sort(),
        locallyExecutableDependencyIds: [
          ...new Set(locallyExecutableDependencyIds),
        ].sort(),
      });
    } catch (error) {
      throw new EnterpriseRegistryMaterializationError(
        "enterprise_registry.registry_invalid",
        "enterprise generation could not produce a valid frozen RegistrySnapshot",
        {
          cause: error instanceof RegistryBuildError
            ? error.code
            : "invalid_enterprise_descriptor",
        },
      );
    }
  }
}

function capabilityRecords(
  descriptor: EnterpriseResourceDescriptor,
  candidateKey: string,
) {
  const source = capabilitySource(descriptor);
  const identityDigest = rawSha256([
    descriptor.kind,
    descriptor.id,
    descriptor.revision,
    descriptor.digest,
  ].join("|"));
  const adapterId = `adapter.enterprise.${descriptor.kind}.${identityDigest.slice(0, 24)}`;
  const bindingId = `binding.enterprise.${descriptor.kind}.${identityDigest.slice(0, 24)}`;
  const configurationRef = `enterprise-config:${candidateKey}/${descriptor.digest}`;
  const implementationRef = implementationReference(descriptor);
  const runtimeBoundary = adapterRuntimeBoundary(descriptor.gatewayEndpoint);
  const common = {
    schemaVersion: CONTRACT_VERSION,
    capabilityId: descriptor.id,
    kind: descriptor.kind,
    name: descriptor.id,
    description: `Enterprise ${descriptor.kind} capability ${descriptor.id}.`,
    source,
  } as const;
  const definition = descriptor.kind === "model"
    ? createCapabilityDefinition({
      ...common,
      kind: "model",
      model: modelFacts(descriptor.capabilities),
    })
    : createCapabilityDefinition({
      ...common,
      kind: "tool",
      tool: toolFacts(descriptor),
    });
  const adapter = descriptor.kind === "model"
    ? createAdapterDescriptor({
      schemaVersion: CONTRACT_VERSION,
      adapterDescriptorId: adapterId,
      adapterKind: "model_provider",
      source,
      implementationRef,
      runtimeBoundary,
      protocol: {
        name: runtimeBoundary === "remote"
          ? "robothree-enterprise-model-gateway"
          : "robothree-local-model-provider",
        version: "v1alpha1",
      },
      configurationRef,
    })
    : createAdapterDescriptor({
      schemaVersion: CONTRACT_VERSION,
      adapterDescriptorId: adapterId,
      adapterKind: "tool_execution_backend",
      source,
      implementationRef,
      runtimeBoundary,
      protocol: {
        name: runtimeBoundary === "remote"
          ? "robothree-enterprise-tool-gateway"
          : "robothree-local-tool-backend",
        version: "v1alpha1",
      },
      configurationRef,
      effectRecoveryMode: effectRecoveryMode(descriptor.capabilities),
    });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId,
    capability: {
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: adapter.adapterDescriptorId,
      adapterDescriptorRevision: adapter.revision,
    },
    port: descriptor.kind === "model"
      ? "model_provider"
      : "tool_execution_backend",
    source,
    configurationRef,
  });
  return { definition, adapter, binding };
}

function modelFacts(capabilities: readonly string[]) {
  const values = new Set(capabilities);
  const inputModalities = [
    "text",
    ...(values.has("vision") || values.has("image") ? ["image"] : []),
    ...(values.has("audio") || values.has("audio_input") ? ["audio"] : []),
  ] as ("text" | "image" | "audio")[];
  const outputModalities = [
    "text",
    ...(values.has("audio_output") ? ["audio"] : []),
    ...(values.has("image_output") ? ["image"] : []),
  ] as ("text" | "image" | "audio")[];
  const contextWindow = capabilities
    .map((value) => /^context_window:(\d+)$/u.exec(value)?.[1])
    .find((value) => value !== undefined);
  return {
    family: capabilityValue(capabilities, "family") ?? "enterprise",
    inputModalities: [...new Set(inputModalities)],
    outputModalities: [...new Set(outputModalities)],
    ...(contextWindow === undefined
      ? {}
      : { contextWindow: Number.parseInt(contextWindow, 10) }),
    supportsStreaming: values.has("streaming"),
  };
}

function toolFacts(descriptor: EnterpriseResourceDescriptor) {
  const riskFacts = descriptor.capabilities
    .map((value) => value.startsWith("risk:") ? value.slice(5) : undefined)
    .filter((value): value is ToolRiskFactKind => isToolRiskFact(value));
  return {
    inputSchema: {
      type: "object",
      additionalProperties: true,
    },
    readOnlyHint: descriptor.capabilities.includes("read_only"),
    risk: {
      schemaVersion: CONTRACT_VERSION,
      sourceRevision: descriptor.revision,
      staticFacts: riskFacts.length === 0
        ? ["unknown" as const]
        : [...new Set(riskFacts)],
    },
  };
}

function capabilitySource(
  descriptor: EnterpriseResourceDescriptor,
): CapabilitySource {
  const sourceDigest = rawSha256(`${descriptor.kind}|${descriptor.id}`);
  return {
    trust: "enterprise",
    packageId: `enterprise.${descriptor.kind}.${sourceDigest.slice(0, 24)}`,
    packageRevision: `sha256:${descriptor.revision}`,
  };
}

function uniqueSources(
  descriptors: readonly EnterpriseResourceDescriptor[],
): CapabilitySource[] {
  const sources = new Map<string, CapabilitySource>();
  for (const descriptor of descriptors) {
    const source = capabilitySource(descriptor);
    sources.set(`${source.packageId}|${source.packageRevision}`, source);
  }
  return [...sources.values()].sort((left, right) =>
    left.packageId.localeCompare(right.packageId));
}

function descriptorIsAvailable(
  descriptor: EnterpriseResourceDescriptor,
  permissions: ReadonlySet<string>,
): boolean {
  return descriptor.enabled
    && descriptor.credentialAvailable
    && descriptor.unavailableReason === undefined
    && descriptor.fixedPermissions.every((permission) => permissions.has(permission));
}

function assertDescriptorIdentities(
  descriptors: readonly EnterpriseResourceDescriptor[],
): void {
  const ids = new Set<string>();
  for (const descriptor of descriptors) {
    if (!descriptor.id.startsWith(`${descriptor.kind}.`)) {
      throw new EnterpriseRegistryMaterializationError(
        "enterprise_registry.registry_invalid",
        "enterprise descriptor ID does not match its declared kind",
        { cause: "descriptor_kind_id_mismatch" },
      );
    }
    if (ids.has(descriptor.id)) {
      throw new EnterpriseRegistryMaterializationError(
        "enterprise_registry.registry_invalid",
        "enterprise generation contains a duplicate resource ID",
        { cause: "duplicate_resource_id" },
      );
    }
    ids.add(descriptor.id);
  }
}

function isLocalEndpoint(endpoint: string): boolean {
  return endpoint.startsWith("local:") || endpoint.startsWith("core:");
}

function adapterRuntimeBoundary(
  endpoint: string,
): "in_process" | "child_process" | "remote" {
  if (endpoint.startsWith("core:")) return "in_process";
  if (endpoint.startsWith("local:")) return "child_process";
  return "remote";
}

function implementationReference(
  descriptor: EnterpriseResourceDescriptor,
): string {
  if (
    descriptor.gatewayEndpoint.startsWith("core:")
    || descriptor.gatewayEndpoint.startsWith("local:")
  ) {
    return descriptor.gatewayEndpoint;
  }
  return [
    "enterprise-gateway:",
    descriptor.kind,
    "/",
    descriptor.id,
    "/",
    descriptor.revision,
  ].join("");
}

function effectRecoveryMode(capabilities: readonly string[]) {
  if (capabilities.includes("effect:idempotent_retry")) {
    return "idempotent_retry" as const;
  }
  if (capabilities.includes("effect:query_then_retry")) {
    return "query_then_retry" as const;
  }
  return "manual_reconciliation" as const;
}

function capabilityValue(
  capabilities: readonly string[],
  key: string,
): string | undefined {
  return capabilities
    .find((value) => value.startsWith(`${key}:`))
    ?.slice(key.length + 1)
    .slice(0, 120);
}

function isToolRiskFact(value: string | undefined): value is ToolRiskFactKind {
  return value === "routine_file"
    || value === "destructive_file"
    || value === "protected_resource"
    || value === "local_execution"
    || value === "external_send"
    || value === "unknown";
}

function generationIdentity(
  configuration: MaterializedEnterpriseConfiguration,
): EnterpriseRuntimeGenerationIdentity {
  return Object.freeze({
    candidateKey: configuration.identity.candidateKey,
    snapshotRevision: configuration.identity.snapshotRevision,
    snapshotDigest: configuration.identity.snapshotDigest,
    materializationDigest: configuration.materializationDigest,
  });
}

function assertExactMaterialization(
  persisted: MaterializedEnterpriseConfiguration,
  rebuilt: MaterializedEnterpriseConfiguration,
): void {
  const exact = persisted.identity.candidateKey === rebuilt.identity.candidateKey
    && persisted.identity.snapshotId === rebuilt.identity.snapshotId
    && persisted.identity.snapshotRevision === rebuilt.identity.snapshotRevision
    && persisted.identity.snapshotDigest === rebuilt.identity.snapshotDigest
    && persisted.materializationDigest === rebuilt.materializationDigest
    && persisted.materializedBytes === rebuilt.materializedBytes
    && persisted.compatibility.contractVersion === rebuilt.compatibility.contractVersion
    && persisted.compatibility.schemaVersion === rebuilt.compatibility.schemaVersion
    && persisted.compatibility.minimumDesktopVersion
      === rebuilt.compatibility.minimumDesktopVersion
    && persisted.compatibility.minimumCoreVersion === rebuilt.compatibility.minimumCoreVersion;
  if (!exact) {
    throw new EnterpriseRegistryMaterializationError(
      "enterprise_registry.integrity_mismatch",
      "persisted enterprise generation does not match its deterministic materialization",
    );
  }
}

function assertTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new EnterpriseRegistryMaterializationError(
      "enterprise_registry.integrity_mismatch",
      "Storage Active timestamp is invalid",
    );
  }
}

function sameGeneration(
  left: EnterpriseRuntimeGenerationIdentity,
  right: EnterpriseRuntimeGenerationIdentity,
): boolean {
  return left.candidateKey === right.candidateKey
    && left.snapshotRevision === right.snapshotRevision
    && left.snapshotDigest === right.snapshotDigest
    && left.materializationDigest === right.materializationDigest;
}

function packageKey(kind: string, packageId: string): string {
  return `${kind}:${packageId}`;
}

function compareDescriptor(
  left: EnterpriseResourceDescriptor,
  right: EnterpriseResourceDescriptor,
): number {
  return `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`);
}

function comparePackageReference(
  left: EnterpriseRuntimePackageReference,
  right: EnterpriseRuntimePackageReference,
): number {
  return `${left.kind}:${left.packageId}`
    .localeCompare(`${right.kind}:${right.packageId}`);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
