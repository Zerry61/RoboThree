import { JsonValueSchema, type TaskCapabilityLock } from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type {
  LocalPersonalModelInvocationPersistence,
} from "../ports/local-personal-model-invocation-persistence.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
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
import type { TaskPinnedReasoningReleaseResolver } from
  "./dfi543a-local-personal-release.js";
import { deriveLocalPersonalReasoningProfileSubject } from
  "./local-personal-reasoning-mapping.js";
import { TaskLockedReasoningProviderMapper } from
  "./task-locked-reasoning-provider-mapper.js";

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
  readonly #tasks: TaskPersistence | undefined;
  readonly #reasoningReleases: TaskPinnedReasoningReleaseResolver | undefined;

  public constructor(input: Readonly<{
    enterprise: RuntimeAdapterHandles;
    composite: CompositeModelProviderResolver;
    authorities: PersonalModelExecutionAuthorityProvider;
    invocations: LocalPersonalModelInvocationPersistence;
    personal: PersonalModelPersistence;
    clock: Clock;
    timeoutPolicy: ModelInvocationTimeoutPolicy;
    tasks?: TaskPersistence;
    reasoningReleases?: TaskPinnedReasoningReleaseResolver;
  }>) {
    this.#enterprise = input.enterprise;
    this.#composite = input.composite;
    this.#authorities = input.authorities;
    this.#invocations = input.invocations;
    this.#personal = input.personal;
    this.#clock = input.clock;
    this.#timeoutPolicy = input.timeoutPolicy;
    this.#tasks = input.tasks;
    this.#reasoningReleases = input.reasoningReleases;
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
    let reasoningMapper: TaskLockedReasoningProviderMapper | undefined;
    if (input.runtimeSelection.schemaVersion === "v1alpha4") {
      if (this.#tasks === undefined || this.#reasoningReleases === undefined) {
        throw new Error("provider_release.runtime_dependencies_unavailable");
      }
      const binding = await this.#tasks.loadSubmitTurnBindingByTaskId(input.taskId);
      const bundle = binding === undefined
        ? undefined
        : await this.#tasks.loadDfi541SubmitTurnTaskBundle(
          binding.submitTurnCommandId,
        );
      if (
        bundle === undefined
        || bundle.runtimeSelection.selectionDigest
          !== input.runtimeSelection.selectionDigest
      ) throw new Error("provider_release.materialization_conflict");
      const registry = await this.#reasoningReleases.reconstructForExecution({
        modelLock: lock,
        reasoningModeLock: input.runtimeSelection.reasoningModeLock,
        admissionEvidence: bundle.admissionEvidence,
      });
      if (registry !== undefined) {
        if (input.runtimeSelection.reasoningModeLock.resolution !== "max_applied") {
          throw new Error("provider_release.materialization_conflict");
        }
        const subject = deriveLocalPersonalReasoningProfileSubject({
          definition: exact.definition,
          modelLock: lock,
          adapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
          adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
        });
        reasoningMapper = new TaskLockedReasoningProviderMapper({
          profiles: registry.pinnedProfileSource([{
            subject,
            profileRef: input.runtimeSelection.reasoningModeLock.profileRef,
          }]),
          mappings: registry,
        });
      }
    }
    const provider = new DurableLocalPersonalModelProvider({
      raw: exact.provider,
      invocations: this.#invocations,
      personal: this.#personal,
      ownerIdentity: exact.ownerIdentity,
      definition: exact.definition,
      clock: this.#clock,
      timeoutPolicy: this.#timeoutPolicy,
      ...(reasoningMapper === undefined ? {} : { reasoningMapper }),
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
