import type { TaskCapabilityLock } from "@robothree/contracts";

import { LocalPersonalOpenAiCompatibleModelProvider } from "../adapters/https/local-personal-openai-compatible-model-provider.js";
import type { LocalPersonalProviderTransportOptions } from "../adapters/https/local-personal-openai-compatible-model-provider.js";
import type { PersonalCredentialStore } from "../ports/personal-credential-store.js";
import type { PersonalModelOwnerAuthority } from "../ports/personal-model-owner-authority.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";
import type { ModelProvider } from "../ports/model-provider.js";
import type { Clock } from "../ports/clock.js";
import type { Scheduler } from "../ports/scheduler.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import type { ResolvedCapability } from "../registry/capability-resolver.js";
import type { CapabilityAvailability } from "../registry/capability-resolver.js";
import { validateTaskCapabilityLockRevisions } from "../registry/capability-revision.js";
import type { RuntimeAdapterHandles } from "../registry/runtime-adapter-handles.js";
import {
  PersonalModelTaskLockMaterializer,
  isPersonalModelLock,
} from "./personal-model-task-lock.js";
import { PersonalModelProviderProfileRegistry } from "./personal-model-provider-profile.js";
import type { PersonalModelRuntimeRegistry } from "./personal-model-runtime-registry.js";
import type { TaskCapabilityLockService } from "./task-capability-lock-service.js";
import type { UnifiedModelCandidate } from "./unified-model-selection.js";
import type {
  PersonalModelDefinition,
  PersonalModelOwnerIdentity,
  PersonalModelStatusFact,
} from "./personal-model-domain.js";
import type { ModelInvocationTimeoutPolicy } from "./model-invocation-timeout-policy.js";
import type { TaskLockedPersonalModelExecutionAuthority } from
  "./personal-model-execution-authority.js";

export type ResolvedPersonalModelProvider = Readonly<{
  provider: LocalPersonalOpenAiCompatibleModelProvider;
  ownerIdentity: PersonalModelOwnerIdentity;
  definition: PersonalModelDefinition;
  status: PersonalModelStatusFact;
}>;

export class CompositeModelRuntimeError extends Error {
  public constructor(public readonly code:
    | "personal_model.lock_material_invalid"
    | "personal_model.lock_authority_mismatch"
    | "personal_model.credential_unavailable"
    | "personal_model.in_use_or_usage_unknown"
    | "model.identity_ambiguous") {
    super(code);
    this.name = "CompositeModelRuntimeError";
  }
}

export class CompositeModelTaskLockPlanner {
  readonly #enterprise: TaskCapabilityLockService;
  readonly #personal: PersonalModelPersistence;
  readonly #tasks: TaskPersistence;
  readonly #materializer: PersonalModelTaskLockMaterializer;

  public constructor(input: Readonly<{
    enterprise: TaskCapabilityLockService;
    personal: PersonalModelPersistence;
    tasks: TaskPersistence;
    materializer?: PersonalModelTaskLockMaterializer;
  }>) {
    this.#enterprise = input.enterprise;
    this.#personal = input.personal;
    this.#tasks = input.tasks;
    this.#materializer = input.materializer ?? new PersonalModelTaskLockMaterializer();
  }

  public async prepare(input: Readonly<{
    candidate: UnifiedModelCandidate;
    ownerAuthority?: PersonalModelOwnerAuthority;
    taskId: string;
    registryRevision: string;
    lockId: string;
    lockedAt: string;
    availability?: CapabilityAvailability;
  }>): Promise<TaskCapabilityLock> {
    if (input.candidate.authority === "central_enterprise") {
      return this.#enterprise.prepare({
        taskId: input.taskId,
        registryRevision: input.registryRevision,
        capabilityId: input.candidate.modelId,
        lockId: input.lockId,
        lockedAt: input.lockedAt,
        ...(input.availability === undefined ? {} : { availability: input.availability }),
      }).lock;
    }
    if (input.ownerAuthority === undefined) {
      throw new CompositeModelRuntimeError("personal_model.lock_authority_mismatch");
    }
    const head = await this.#personal.loadHead(
      input.ownerAuthority.ownerIdentity,
      input.candidate.modelId,
    );
    if (head === undefined
      || head.selectionState !== "active"
      || head.currentConfigurationRevision !== input.candidate.exactRevision) {
      throw new CompositeModelRuntimeError("personal_model.lock_material_invalid");
    }
    const definition = await this.#personal.loadDefinition(
      input.ownerAuthority.ownerIdentity,
      input.candidate.modelId,
      input.candidate.exactRevision,
    );
    const namespace = await this.#personal.loadActiveOwnerNamespace();
    if (definition === undefined || namespace === undefined
      || namespace.namespaceRevision
        !== input.ownerAuthority.ownerIdentity.ownerScopeNamespaceRevision
      || definition.executionDefinitionDigest !== head.currentExecutionDefinitionDigest) {
      throw new CompositeModelRuntimeError("personal_model.lock_material_invalid");
    }
    return this.#materializer.prepare({
      taskId: input.taskId,
      lockId: input.lockId,
      lockedAt: input.lockedAt,
      registryRevision: input.registryRevision,
      namespace,
      definition,
    });
  }

  public async resolveAndLock(input: Readonly<{
    candidate: UnifiedModelCandidate;
    ownerAuthority?: PersonalModelOwnerAuthority;
    taskId: string;
    registryRevision: string;
    lockId: string;
    lockedAt: string;
    availability?: CapabilityAvailability;
  }>): Promise<TaskCapabilityLock> {
    const existing = await this.#tasks.loadTaskCapabilityLock(
      input.taskId,
      input.candidate.modelId,
    );
    if (existing !== undefined) return validateTaskCapabilityLockRevisions(existing);
    const prepared = await this.prepare(input);
    const committed = await this.#tasks.commitTaskCapabilityLock(prepared);
    if (committed.ok) return committed.value;
    const concurrent = await this.#tasks.loadTaskCapabilityLock(
      input.taskId,
      input.candidate.modelId,
    );
    if (concurrent !== undefined) return validateTaskCapabilityLockRevisions(concurrent);
    throw new CompositeModelRuntimeError("personal_model.lock_material_invalid");
  }
}

export class CompositeModelProviderResolver {
  readonly #enterprise: RuntimeAdapterHandles;
  readonly #personal: PersonalModelPersistence;
  readonly #runtime: PersonalModelRuntimeRegistry;
  readonly #credentials: PersonalCredentialStore;
  readonly #profiles: PersonalModelProviderProfileRegistry;
  readonly #materializer: PersonalModelTaskLockMaterializer;
  readonly #clock: Clock;
  readonly #scheduler: Scheduler;
  readonly #timeoutPolicy: ModelInvocationTimeoutPolicy;
  readonly #transport: LocalPersonalProviderTransportOptions | undefined;

  public constructor(input: Readonly<{
    enterprise: RuntimeAdapterHandles;
    personal: PersonalModelPersistence;
    runtime: PersonalModelRuntimeRegistry;
    credentials: PersonalCredentialStore;
    profiles?: PersonalModelProviderProfileRegistry;
    materializer?: PersonalModelTaskLockMaterializer;
    clock: Clock;
    scheduler: Scheduler;
    timeoutPolicy: ModelInvocationTimeoutPolicy;
    transport?: LocalPersonalProviderTransportOptions;
  }>) {
    this.#enterprise = input.enterprise;
    this.#personal = input.personal;
    this.#runtime = input.runtime;
    this.#credentials = input.credentials;
    this.#profiles = input.profiles ?? new PersonalModelProviderProfileRegistry();
    this.#materializer = input.materializer ?? new PersonalModelTaskLockMaterializer({
      profiles: this.#profiles,
    });
    this.#clock = input.clock;
    this.#scheduler = input.scheduler;
    this.#timeoutPolicy = input.timeoutPolicy;
    this.#transport = input.transport;
  }

  public async resolve(input: Readonly<{
    lock: TaskCapabilityLock;
    ownerAuthority?: TaskLockedPersonalModelExecutionAuthority;
  }>): Promise<ModelProvider> {
    const resolved = await this.resolveDetailed(input);
    return "provider" in resolved ? resolved.provider : resolved;
  }

  public async resolveDetailed(input: Readonly<{
    lock: TaskCapabilityLock;
    ownerAuthority?: TaskLockedPersonalModelExecutionAuthority;
  }>): Promise<ModelProvider | ResolvedPersonalModelProvider> {
    const lock = validateTaskCapabilityLockRevisions(input.lock);
    if (!isPersonalModelLock(lock)) {
      if (lock.adapterDescriptorSnapshot.source.packageId
        === "package.model.local-personal-runtime") {
        throw new CompositeModelRuntimeError("personal_model.lock_material_invalid");
      }
      return this.#enterprise.modelProvider(
        lock.adapterDescriptorSnapshot.adapterDescriptorId,
        lock.adapterDescriptorSnapshot.revision,
      );
    }
    if (input.ownerAuthority === undefined
      || (input.ownerAuthority.authorityKind === "runtime_active_enterprise_identity"
        && input.ownerAuthority.offlineState === "enterprise_session_invalid")) {
      throw new CompositeModelRuntimeError("personal_model.lock_authority_mismatch");
    }
    const namespace = await this.#personal.loadActiveOwnerNamespace();
    if (namespace === undefined) {
      throw new CompositeModelRuntimeError("personal_model.lock_authority_mismatch");
    }
    const identity = this.#materializer.verify({ lock, namespace });
    if (identity.ownerIdentity.ownerScopeNamespaceRevision
        !== input.ownerAuthority.ownerIdentity.ownerScopeNamespaceRevision
      || identity.ownerIdentity.ownerScopeDigest
        !== input.ownerAuthority.ownerIdentity.ownerScopeDigest) {
      throw new CompositeModelRuntimeError("personal_model.lock_authority_mismatch");
    }
    const candidate = await this.#runtime.resolve({
      ownerIdentity: identity.ownerIdentity,
      personalModelId: lock.definitionSnapshot.capabilityId,
      configurationRevision: identity.configurationRevision,
      executionDefinitionDigest: identity.executionDefinitionDigest,
    });
    const profile = this.#profiles.resolve(
      candidate.definition.providerKind,
      candidate.definition.providerProfileRevision,
    );
    const observation = await this.#credentials.inspect(candidate.definition.credentialRef);
    if (observation.state !== "present"
      || observation.credentialRevision !== candidate.definition.credentialRevision
      || observation.credentialBindingDigest !== candidate.definition.credentialBindingDigest) {
      throw new CompositeModelRuntimeError("personal_model.credential_unavailable");
    }
    if (candidate.status.status === "authentication_failed"
      || candidate.status.status === "protocol_incompatible"
      || candidate.status.status === "model_not_found"
      || candidate.status.status === "unavailable"
      || candidate.status.status === "permission_denied") {
      throw new CompositeModelRuntimeError("personal_model.credential_unavailable");
    }
    const provider = new LocalPersonalOpenAiCompatibleModelProvider({
      definition: candidate.definition,
      credentialStore: this.#credentials,
      profileRegistry: this.#profiles,
      lockedCapabilityRevision: lock.definitionSnapshot.revision,
      lockedAdapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
      lockedAdapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
      clock: this.#clock,
      scheduler: this.#scheduler,
      timeoutPolicy: this.#timeoutPolicy,
      ...(this.#transport === undefined ? {} : { transport: this.#transport }),
    });
    if (provider.adapterDescriptorRevision !== lock.adapterDescriptorSnapshot.revision
      || provider.adapterDescriptorId !== lock.adapterDescriptorSnapshot.adapterDescriptorId
      || profile.profileRevision !== candidate.definition.providerProfileRevision) {
      throw new CompositeModelRuntimeError("personal_model.lock_material_invalid");
    }
    return Object.freeze({
      provider,
      ownerIdentity: identity.ownerIdentity,
      definition: candidate.definition,
      status: candidate.status,
    });
  }
}

export function resolvedCapabilityFromPersonalLock(lock: TaskCapabilityLock): ResolvedCapability {
  const validated = validateTaskCapabilityLockRevisions(lock);
  if (!isPersonalModelLock(validated)) {
    throw new CompositeModelRuntimeError("personal_model.lock_material_invalid");
  }
  return Object.freeze({
    registryRevision: validated.registryRevision,
    definition: validated.definitionSnapshot,
    binding: validated.bindingSnapshot,
    adapterDescriptor: validated.adapterDescriptorSnapshot,
  });
}
