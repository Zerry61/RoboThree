import {
  CONTRACT_VERSION,
  TaskCapabilityLockSchema,
  type TaskCapabilityLock,
} from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import type {
  CapabilityResolver,
  CapabilityAvailability,
  ResolvedCapability,
} from "../registry/capability-resolver.js";

export type LockedCapability = Readonly<{
  lock: TaskCapabilityLock;
  route: ResolvedCapability;
  replayed: boolean;
}>;

export class TaskCapabilityLockService {
  readonly #resolver: CapabilityResolver;
  readonly #persistence: TaskPersistence;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(input: {
    resolver: CapabilityResolver;
    persistence: TaskPersistence;
    clock: Clock;
    idGenerator: IdGenerator;
  }) {
    this.#resolver = input.resolver;
    this.#persistence = input.persistence;
    this.#clock = input.clock;
    this.#idGenerator = input.idGenerator;
  }

  public async resolveAndLock(input: {
    taskId: string;
    registryRevision: string;
    capabilityId: string;
    availability?: CapabilityAvailability;
  }): Promise<LockedCapability> {
    const existing = await this.#persistence.loadTaskCapabilityLock(input.taskId, input.capabilityId);
    if (existing !== undefined) {
      return {
        lock: existing,
        route: this.#resolver.resolveLocked(existing, input.availability),
        replayed: true,
      };
    }
    const route = this.#resolver.resolveById(
      input.registryRevision,
      input.capabilityId,
      input.availability,
    );
    const lock = TaskCapabilityLockSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      lockId: this.#idGenerator.next(),
      taskId: input.taskId,
      registryRevision: route.registryRevision,
      definitionSnapshot: route.definition,
      bindingSnapshot: route.binding,
      adapterDescriptorSnapshot: route.adapterDescriptor,
      lockedAt: this.#clock.now(),
    });
    const committed = await this.#persistence.commitTaskCapabilityLock(lock);
    if (!committed.ok) {
      const concurrent = await this.#persistence.loadTaskCapabilityLock(input.taskId, input.capabilityId);
      if (concurrent !== undefined) {
        return {
          lock: concurrent,
          route: this.#resolver.resolveLocked(concurrent, input.availability),
          replayed: true,
        };
      }
      throw new Error(`${committed.error.code}: ${committed.error.message}`);
    }
    return { lock: committed.value, route, replayed: committed.replayed };
  }

  public prepare(input: {
    taskId: string;
    registryRevision: string;
    capabilityId: string;
    lockId?: string;
    lockedAt?: string;
    availability?: CapabilityAvailability;
  }): LockedCapability {
    const route = this.#resolver.resolveById(
      input.registryRevision,
      input.capabilityId,
      input.availability,
    );
    const lock = TaskCapabilityLockSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      lockId: input.lockId ?? this.#idGenerator.next(),
      taskId: input.taskId,
      registryRevision: route.registryRevision,
      definitionSnapshot: route.definition,
      bindingSnapshot: route.binding,
      adapterDescriptorSnapshot: route.adapterDescriptor,
      lockedAt: input.lockedAt ?? this.#clock.now(),
    });
    return { lock, route, replayed: false };
  }
}
