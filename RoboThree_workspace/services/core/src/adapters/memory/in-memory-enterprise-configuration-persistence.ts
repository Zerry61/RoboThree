import type { ComponentHealth } from "@robothree/contracts";

import type { Clock } from "../../ports/clock.js";
import type {
  ActivatedEnterpriseConfiguration,
} from "../../application/enterprise-configuration-types.js";
import {
  PackageMaterializer,
  enterpriseConfigurationCandidateKey,
} from "../../application/package-materializer.js";
import {
  enterpriseConfigurationPersistenceFailure as failure,
  type ActivateEnterpriseConfigurationCandidateInput,
  type BeginEnterpriseConfigurationCandidateInput,
  type EnterpriseConfigurationCandidate,
  type EnterpriseConfigurationDiagnostics,
  type EnterpriseConfigurationPersistence,
  type EnterpriseConfigurationStatusEvent,
  type EnterpriseConfigurationSyncFacts,
  type EnterpriseConfigurationWriteResult,
  type RecordEnterpriseConfigurationSyncOutcomeInput,
  type SealEnterpriseConfigurationCandidateInput,
  type StoreEnterpriseConfigurationPackageInput,
} from "../../ports/enterprise-configuration-persistence.js";
import {
  sameEnterpriseIdentityScope,
  type EnterpriseIdentityScope,
} from "../../ports/enterprise-access-token-provider.js";

export type EnterpriseConfigurationFaultPoint =
  | "before_activation_commit"
  | "after_activation_commit_before_response";

export type EnterpriseConfigurationFaultInjector = (
  point: EnterpriseConfigurationFaultPoint,
) => void;

type ScopePointers = {
  activeCandidateKey?: string;
  previousCandidateKey?: string;
  eventSequence: number;
};

export class InMemoryEnterpriseConfigurationPersistence
implements EnterpriseConfigurationPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.enterprise-configuration.memory";
  readonly #clock: Clock;
  readonly #faultInjector: EnterpriseConfigurationFaultInjector | undefined;
  readonly #candidates = new Map<string, EnterpriseConfigurationCandidate>();
  readonly #activations = new Map<string, ActivatedEnterpriseConfiguration>();
  readonly #scopePointers = new Map<string, ScopePointers>();
  readonly #events = new Map<string, EnterpriseConfigurationStatusEvent[]>();
  readonly #syncFacts = new Map<string, EnterpriseConfigurationSyncFacts>();
  #started = false;

  constructor(input: {
    clock: Clock;
    faultInjector?: EnterpriseConfigurationFaultInjector;
  }) {
    this.#clock = input.clock;
    this.#faultInjector = input.faultInjector;
  }

  async start(): Promise<void> {
    this.#started = true;
  }

  async stop(): Promise<void> {
    this.#started = false;
  }

  async health(): Promise<ComponentHealth> {
    return {
      componentId: this.componentId,
      status: this.#started ? "ready" : "unavailable",
      checkedAt: this.#clock.now(),
    };
  }

  async loadActive(
    scope: EnterpriseIdentityScope,
  ): Promise<ActivatedEnterpriseConfiguration | undefined> {
    this.#requireStarted();
    return this.#loadActivation(this.#scopePointers.get(scopeKey(scope))?.activeCandidateKey);
  }

  async loadPrevious(
    scope: EnterpriseIdentityScope,
  ): Promise<ActivatedEnterpriseConfiguration | undefined> {
    this.#requireStarted();
    return this.#loadActivation(this.#scopePointers.get(scopeKey(scope))?.previousCandidateKey);
  }

  async loadSealedGeneration(
    scope: EnterpriseIdentityScope,
    candidateKey: string,
  ): Promise<ActivatedEnterpriseConfiguration | undefined> {
    this.#requireStarted();
    const candidate = this.#candidates.get(candidateKey);
    if (
      candidate === undefined
      || candidate.status !== "sealed"
      || !sameEnterpriseIdentityScope(candidate.identity.scope, scope)
    ) {
      return undefined;
    }
    return this.#loadActivation(candidateKey);
  }

  async loadCandidate(
    candidateKey: string,
  ): Promise<EnterpriseConfigurationCandidate | undefined> {
    this.#requireStarted();
    return clone(this.#candidates.get(candidateKey));
  }

  async beginOrResumeCandidate(
    input: BeginEnterpriseConfigurationCandidateInput,
  ): Promise<EnterpriseConfigurationWriteResult<EnterpriseConfigurationCandidate>> {
    this.#requireStarted();
    if (!validCandidateInput(input)) {
      return failure(
        "configuration.persistence_conflict",
        "candidate identity does not match the exact validated snapshot",
      );
    }
    const existing = this.#candidates.get(input.identity.candidateKey);
    if (existing !== undefined) {
      return sameCandidateIdentity(existing, input)
        ? success(existing, true)
        : failure(
          "configuration.persistence_conflict",
          "candidate key already represents different immutable snapshot facts",
        );
    }
    const sameRevision = [...this.#candidates.values()].find((candidate) =>
      sameEnterpriseIdentityScope(candidate.identity.scope, input.identity.scope)
      && candidate.identity.snapshotId === input.identity.snapshotId
      && candidate.identity.snapshotRevision === input.identity.snapshotRevision);
    if (sameRevision !== undefined
      && sameRevision.identity.snapshotDigest !== input.identity.snapshotDigest) {
      return failure(
        "configuration.persistence_conflict",
        "snapshot revision already maps to a different digest",
      );
    }
    const candidate: EnterpriseConfigurationCandidate = {
      identity: input.identity,
      status: "staging",
      snapshot: input.snapshot,
      packages: [],
      createdAt: input.createdAt,
    };
    this.#candidates.set(input.identity.candidateKey, cloneRequired(candidate));
    return success(candidate, false);
  }

  async storeValidatedPackage(
    input: StoreEnterpriseConfigurationPackageInput,
  ): Promise<EnterpriseConfigurationWriteResult<EnterpriseConfigurationCandidate>> {
    this.#requireStarted();
    const candidate = this.#candidates.get(input.candidateKey);
    if (candidate === undefined) {
      return failure("configuration.candidate_not_found", "configuration candidate does not exist");
    }
    if (!sameEnterpriseIdentityScope(candidate.identity.scope, input.scope)) {
      return failure("configuration.scope_mismatch", "candidate belongs to another enterprise scope");
    }
    if (candidate.status !== "staging") {
      return failure("configuration.persistence_conflict", "sealed candidate cannot accept packages");
    }
    const packageIndex = candidate.packages.findIndex((current) =>
      current.reference.kind === input.package.reference.kind
      && current.reference.packageId === input.package.reference.packageId);
    if (packageIndex >= 0) {
      const current = candidate.packages[packageIndex];
      return current?.reference.revision === input.package.reference.revision
        && current.reference.digest === input.package.reference.digest
        && current.document.packageDigest === input.package.document.packageDigest
        ? success(candidate, true)
        : failure(
          "configuration.persistence_conflict",
          "candidate package identity already maps to different content",
        );
    }
    const updated: EnterpriseConfigurationCandidate = {
      ...candidate,
      packages: [...candidate.packages, input.package],
    };
    this.#candidates.set(input.candidateKey, cloneRequired(updated));
    return success(updated, false);
  }

  async sealCandidate(
    input: SealEnterpriseConfigurationCandidateInput,
  ): Promise<EnterpriseConfigurationWriteResult<EnterpriseConfigurationCandidate>> {
    this.#requireStarted();
    const candidate = this.#candidates.get(input.candidateKey);
    if (candidate === undefined) {
      return failure("configuration.candidate_not_found", "configuration candidate does not exist");
    }
    if (!sameEnterpriseIdentityScope(candidate.identity.scope, input.scope)
      || !sameEnterpriseIdentityScope(
        input.configuration.identity.scope,
        input.scope,
      )) {
      return failure("configuration.scope_mismatch", "candidate belongs to another enterprise scope");
    }
    if (
      input.configuration.identity.candidateKey !== input.candidateKey
      || candidate.identity.snapshotDigest !== input.configuration.identity.snapshotDigest
    ) {
      return failure(
        "configuration.persistence_conflict",
        "sealed materialization does not match the staged candidate",
      );
    }
    if (candidate.status === "sealed") {
      return candidate.configuration?.materializationDigest
        === input.configuration.materializationDigest
        ? success(candidate, true)
        : failure(
          "configuration.persistence_conflict",
          "candidate is already sealed with a different materialization",
        );
    }
    if (!samePackageClosure(candidate, input.configuration)) {
      return failure(
        "configuration.candidate_incomplete",
        "candidate package set does not match the sealed materialization",
      );
    }
    if (!validSealedMaterialization(candidate, input.configuration)) {
      return failure(
        "configuration.persistence_conflict",
        "sealed materialization digest does not match the staged candidate",
      );
    }
    const sealed: EnterpriseConfigurationCandidate = {
      ...candidate,
      status: "sealed",
      configuration: input.configuration,
    };
    this.#candidates.set(input.candidateKey, cloneRequired(sealed));
    return success(sealed, false);
  }

  async activateSealedCandidate(
    input: ActivateEnterpriseConfigurationCandidateInput,
  ): Promise<EnterpriseConfigurationWriteResult<ActivatedEnterpriseConfiguration>> {
    this.#requireStarted();
    const candidate = this.#candidates.get(input.candidateKey);
    if (candidate === undefined) {
      return failure("configuration.candidate_not_found", "configuration candidate does not exist");
    }
    if (!sameEnterpriseIdentityScope(candidate.identity.scope, input.scope)) {
      return failure("configuration.scope_mismatch", "candidate belongs to another enterprise scope");
    }
    if (candidate.status !== "sealed" || candidate.configuration === undefined) {
      return failure("configuration.candidate_not_sealed", "configuration candidate is not sealed");
    }
    const key = scopeKey(input.scope);
    const pointers = this.#scopePointers.get(key) ?? { eventSequence: 0 };
    if (pointers.activeCandidateKey === input.candidateKey) {
      const active = this.#activations.get(input.candidateKey);
      return active === undefined
        ? failure("configuration.persistence_unavailable", "active configuration record is missing")
        : success(active, true);
    }
    const current = this.#loadActivation(pointers.activeCandidateKey);
    if (current === undefined) {
      if (input.expectedActiveRevision !== undefined) {
        return failure("configuration.activation_conflict", "expected active revision does not exist");
      }
    } else if (
      input.expectedActiveRevision === undefined
      || input.expectedActiveRevision !== current.configuration.identity.snapshotRevision
    ) {
      return failure("configuration.activation_conflict", "active revision changed before activation");
    }
    this.#faultInjector?.("before_activation_commit");
    const activation: ActivatedEnterpriseConfiguration = {
      configuration: candidate.configuration,
      storageActivatedAt: input.activatedAt,
    };
    const sequence = pointers.eventSequence + 1;
    const event: EnterpriseConfigurationStatusEvent = {
      scope: input.scope,
      sequence,
      type: "storage_activated",
      storageActiveRevision: candidate.identity.snapshotRevision,
      storageActiveDigest: candidate.identity.snapshotDigest,
      ...(current === undefined
        ? {}
        : { previousStorageRevision: current.configuration.identity.snapshotRevision }),
      occurredAt: input.activatedAt,
    };
    this.#activations.set(input.candidateKey, cloneRequired(activation));
    this.#scopePointers.set(key, {
      activeCandidateKey: input.candidateKey,
      ...(pointers.activeCandidateKey === undefined
        ? {}
        : { previousCandidateKey: pointers.activeCandidateKey }),
      eventSequence: sequence,
    });
    this.#events.set(key, [...(this.#events.get(key) ?? []), cloneRequired(event)]);
    this.#faultInjector?.("after_activation_commit_before_response");
    return success(activation, false);
  }

  async discardUnsealedCandidate(
    candidateKey: string,
    scope: EnterpriseIdentityScope,
  ): Promise<EnterpriseConfigurationWriteResult<boolean>> {
    this.#requireStarted();
    const candidate = this.#candidates.get(candidateKey);
    if (candidate === undefined) return success(false, true);
    if (!sameEnterpriseIdentityScope(candidate.identity.scope, scope)) {
      return failure("configuration.scope_mismatch", "candidate belongs to another enterprise scope");
    }
    if (candidate.status === "sealed") {
      return failure("configuration.persistence_conflict", "sealed candidate cannot be discarded");
    }
    this.#candidates.delete(candidateKey);
    return success(true, false);
  }

  async loadStatusEventsAfter(
    scope: EnterpriseIdentityScope,
    sequence: number,
  ): Promise<readonly EnterpriseConfigurationStatusEvent[]> {
    this.#requireStarted();
    return cloneRequired(
      (this.#events.get(scopeKey(scope)) ?? []).filter(
        (event) => event.sequence > sequence,
      ),
    );
  }

  async loadSyncFacts(
    scope: EnterpriseIdentityScope,
  ): Promise<EnterpriseConfigurationSyncFacts> {
    this.#requireStarted();
    return cloneRequired(this.#syncFacts.get(scopeKey(scope)) ?? {});
  }

  async recordSyncOutcome(
    input: RecordEnterpriseConfigurationSyncOutcomeInput,
  ): Promise<EnterpriseConfigurationWriteResult<EnterpriseConfigurationSyncFacts>> {
    this.#requireStarted();
    if (input.outcome === "failed" && !validSafeErrorCode(input.errorCode)) {
      return failure(
        "configuration.persistence_conflict",
        "failed synchronization requires a safe typed error code",
      );
    }
    if (input.outcome === "succeeded" && input.errorCode !== undefined) {
      return failure(
        "configuration.persistence_conflict",
        "successful synchronization cannot persist an error code",
      );
    }
    const key = scopeKey(input.scope);
    const previous = this.#syncFacts.get(key) ?? {};
    const facts: EnterpriseConfigurationSyncFacts = input.outcome === "succeeded"
      ? { lastSuccessfulSyncAt: input.occurredAt }
      : {
        ...previous,
        lastErrorCode: input.errorCode as string,
      };
    const pointers = this.#scopePointers.get(key) ?? { eventSequence: 0 };
    const sequence = pointers.eventSequence + 1;
    const event: EnterpriseConfigurationStatusEvent = {
      scope: input.scope,
      sequence,
      type: input.outcome === "succeeded" ? "sync_succeeded" : "sync_failed",
      ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
      occurredAt: input.occurredAt,
    };
    this.#syncFacts.set(key, cloneRequired(facts));
    this.#scopePointers.set(key, { ...pointers, eventSequence: sequence });
    this.#events.set(key, [...(this.#events.get(key) ?? []), cloneRequired(event)]);
    return success(facts, false);
  }

  async diagnostics(
    scope: EnterpriseIdentityScope,
  ): Promise<EnterpriseConfigurationDiagnostics> {
    this.#requireStarted();
    const candidates = [...this.#candidates.values()].filter((candidate) =>
      sameEnterpriseIdentityScope(candidate.identity.scope, scope));
    const sealed = candidates.filter((candidate) =>
      candidate.status === "sealed" && candidate.configuration !== undefined);
    const pointers = this.#scopePointers.get(scopeKey(scope));
    return {
      scope: cloneRequired(scope),
      candidateCount: candidates.length,
      unsealedCandidateCount: candidates.filter(
        (candidate) => candidate.status === "staging",
      ).length,
      sealedGenerationCount: sealed.length,
      materializedBytes: sealed.reduce(
        (total, candidate) =>
          total + (candidate.configuration?.materializedBytes ?? 0),
        0,
      ),
      ...(sealed.length === 0
        ? {}
        : {
          oldestSealedAt: sealed.map(
            (candidate) => candidate.configuration!.sealedAt,
          ).sort()[0]!,
        }),
      ...(pointers?.activeCandidateKey === undefined
        ? {}
        : { activeCandidateKey: pointers.activeCandidateKey }),
      ...(pointers?.previousCandidateKey === undefined
        ? {}
        : { previousCandidateKey: pointers.previousCandidateKey }),
    };
  }

  #loadActivation(
    candidateKey: string | undefined,
  ): ActivatedEnterpriseConfiguration | undefined {
    return candidateKey === undefined
      ? undefined
      : clone(this.#activations.get(candidateKey));
  }

  #requireStarted(): void {
    if (!this.#started) throw new Error("enterprise configuration persistence is not started");
  }
}

function sameCandidateIdentity(
  candidate: EnterpriseConfigurationCandidate,
  input: BeginEnterpriseConfigurationCandidateInput,
): boolean {
  return candidate.identity.snapshotId === input.identity.snapshotId
    && candidate.identity.snapshotRevision === input.identity.snapshotRevision
    && candidate.identity.snapshotDigest === input.identity.snapshotDigest
    && candidate.snapshot.document.digest === input.snapshot.document.digest
    && sameEnterpriseIdentityScope(candidate.identity.scope, input.identity.scope);
}

function validCandidateInput(
  input: BeginEnterpriseConfigurationCandidateInput,
): boolean {
  return input.identity.snapshotId === input.snapshot.document.snapshotId
    && input.identity.snapshotRevision === input.snapshot.document.revision
    && input.identity.snapshotDigest === input.snapshot.document.digest
    && input.identity.candidateKey === enterpriseConfigurationCandidateKey({
      scope: input.identity.scope,
      snapshotId: input.identity.snapshotId,
      snapshotRevision: input.identity.snapshotRevision,
      snapshotDigest: input.identity.snapshotDigest,
    });
}

function validSealedMaterialization(
  candidate: EnterpriseConfigurationCandidate,
  configuration: NonNullable<EnterpriseConfigurationCandidate["configuration"]>,
): boolean {
  try {
    const expected = new PackageMaterializer().materialize({
      scope: candidate.identity.scope,
      snapshot: candidate.snapshot,
      packages: candidate.packages,
      sealedAt: configuration.sealedAt,
    });
    return expected.identity.candidateKey === configuration.identity.candidateKey
      && expected.materializationDigest === configuration.materializationDigest
      && expected.materializedBytes === configuration.materializedBytes;
  } catch {
    return false;
  }
}

function samePackageClosure(
  candidate: EnterpriseConfigurationCandidate,
  configuration: NonNullable<EnterpriseConfigurationCandidate["configuration"]>,
): boolean {
  const staged = [...candidate.packages].sort(comparePackage);
  const sealed = [...configuration.packages].sort(comparePackage);
  return staged.length === sealed.length && staged.every((item, index) => {
    const other = sealed[index];
    return other !== undefined
      && item.reference.kind === other.reference.kind
      && item.reference.packageId === other.reference.packageId
      && item.reference.revision === other.reference.revision
      && item.reference.digest === other.reference.digest
      && item.document.packageDigest === other.document.packageDigest;
  });
}

function comparePackage(
  left: EnterpriseConfigurationCandidate["packages"][number],
  right: EnterpriseConfigurationCandidate["packages"][number],
): number {
  return `${left.reference.kind}:${left.reference.packageId}`.localeCompare(
    `${right.reference.kind}:${right.reference.packageId}`,
  );
}

function scopeKey(scope: EnterpriseIdentityScope): string {
  return [
    scope.enterpriseId,
    scope.userId,
    scope.deviceId,
    scope.clientInstanceId,
  ].map((part) => `${part.length}:${part}`).join("|");
}

function validSafeErrorCode(value: string | undefined): value is string {
  return value !== undefined
    && /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/u.test(value)
    && value.length <= 128;
}

function success<T>(
  value: T,
  replayed: boolean,
): EnterpriseConfigurationWriteResult<T> {
  return { ok: true, replayed, value: cloneRequired(value) };
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : cloneRequired(value);
}

function cloneRequired<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}
