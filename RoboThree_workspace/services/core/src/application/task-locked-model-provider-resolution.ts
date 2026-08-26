import { JsonValueSchema, type TaskCapabilityLock } from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type {
  LocalPersonalModelInvocationPersistence,
} from "../ports/local-personal-model-invocation-persistence.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";
import type {
  ResolvedTaskModelProvider,
  TaskLockedModelProviderResolver,
} from "../ports/task-locked-model-provider-resolver.js";
import type { RuntimeAdapterHandles } from "../registry/runtime-adapter-handles.js";
import { validateTaskCapabilityLockRevisions } from "../registry/capability-revision.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type { CompositeModelProviderResolver } from "./composite-personal-model-runtime.js";
import { DurableLocalPersonalModelProvider } from "./durable-local-personal-model-provider.js";
import type { PersonalModelExecutionAuthorityProvider } from
  "./personal-model-execution-authority.js";
import { isPersonalModelLock } from "./personal-model-task-lock.js";
import type { ModelInvocationTimeoutPolicy } from "./model-invocation-timeout-policy.js";

export class RuntimeAdapterTaskLockedModelProviderResolver
implements TaskLockedModelProviderResolver {
  readonly #handles: RuntimeAdapterHandles;

  public constructor(handles: RuntimeAdapterHandles) {
    this.#handles = handles;
  }

  public async resolve(input: Parameters<TaskLockedModelProviderResolver["resolve"]>[0])
  : Promise<ResolvedTaskModelProvider> {
    const lock = validateTaskCapabilityLockRevisions(input.modelLock);
    const provider = this.#handles.modelProvider(
      lock.adapterDescriptorSnapshot.adapterDescriptorId,
      lock.adapterDescriptorSnapshot.revision,
    );
    return resolved(provider, lock, "central_enterprise");
  }

  public async reconcileMessageCommitted(
    input: Parameters<NonNullable<TaskLockedModelProviderResolver["reconcileMessageCommitted"]>>[0],
  ): Promise<void> {
    const lock = validateTaskCapabilityLockRevisions(input.modelLock);
    const provider = this.#handles.modelProvider(
      lock.adapterDescriptorSnapshot.adapterDescriptorId,
      lock.adapterDescriptorSnapshot.revision,
    );
    await provider.reconcileMessageCommitted?.({
      taskId: input.taskId,
      assistantMessageId: input.assistantMessageId,
      committedAt: input.committedAt,
    });
  }
}

export class DurableCompositeTaskModelProviderResolver
implements TaskLockedModelProviderResolver {
  readonly #enterprise: RuntimeAdapterHandles;
  readonly #composite: CompositeModelProviderResolver;
  readonly #authorities: PersonalModelExecutionAuthorityProvider;
  readonly #invocations: LocalPersonalModelInvocationPersistence;
  readonly #personal: PersonalModelPersistence;
  readonly #clock: Clock;
  readonly #timeoutPolicy: ModelInvocationTimeoutPolicy;

  public constructor(input: Readonly<{
    enterprise: RuntimeAdapterHandles;
    composite: CompositeModelProviderResolver;
    authorities: PersonalModelExecutionAuthorityProvider;
    invocations: LocalPersonalModelInvocationPersistence;
    personal: PersonalModelPersistence;
    clock: Clock;
    timeoutPolicy: ModelInvocationTimeoutPolicy;
  }>) {
    this.#enterprise = input.enterprise;
    this.#composite = input.composite;
    this.#authorities = input.authorities;
    this.#invocations = input.invocations;
    this.#personal = input.personal;
    this.#clock = input.clock;
    this.#timeoutPolicy = input.timeoutPolicy;
  }

  public async resolve(input: Parameters<TaskLockedModelProviderResolver["resolve"]>[0])
  : Promise<ResolvedTaskModelProvider> {
    const lock = validateTaskCapabilityLockRevisions(input.modelLock);
    if (!isPersonalModelLock(lock)) {
      const provider = this.#enterprise.modelProvider(
        lock.adapterDescriptorSnapshot.adapterDescriptorId,
        lock.adapterDescriptorSnapshot.revision,
      );
      return resolved(provider, lock, "central_enterprise");
    }
    const authority = await this.#authorities.load();
    const exact = await this.#composite.resolveDetailed({
      lock,
      ownerAuthority: authority,
    });
    if (!("definition" in exact)) {
      throw new Error("personal_model.lock_material_invalid");
    }
    const provider = new DurableLocalPersonalModelProvider({
      raw: exact.provider,
      invocations: this.#invocations,
      personal: this.#personal,
      ownerIdentity: exact.ownerIdentity,
      definition: exact.definition,
      clock: this.#clock,
      timeoutPolicy: this.#timeoutPolicy,
    });
    return resolved(provider, lock, "local_personal");
  }

  public async reconcileMessageCommitted(
    input: Parameters<NonNullable<TaskLockedModelProviderResolver["reconcileMessageCommitted"]>>[0],
  ): Promise<void> {
    const lock = validateTaskCapabilityLockRevisions(input.modelLock);
    if (isPersonalModelLock(lock)) return;
    const provider = this.#enterprise.modelProvider(
      lock.adapterDescriptorSnapshot.adapterDescriptorId,
      lock.adapterDescriptorSnapshot.revision,
    );
    await provider.reconcileMessageCommitted?.({
      taskId: input.taskId,
      assistantMessageId: input.assistantMessageId,
      committedAt: input.committedAt,
    });
  }
}

function resolved(
  provider: ResolvedTaskModelProvider["provider"],
  lock: TaskCapabilityLock,
  authority: ResolvedTaskModelProvider["authority"],
): ResolvedTaskModelProvider {
  return Object.freeze({
    provider,
    authority,
    externalTarget: lock.adapterDescriptorSnapshot.implementationRef,
    exactLockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock)),
  });
}
