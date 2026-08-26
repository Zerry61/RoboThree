import type { ComponentHealth } from "@robothree/contracts";

import type { Clock } from "../../ports/clock.js";
import type {
  EnterpriseConfigurationPersistence,
} from "../../ports/enterprise-configuration-persistence.js";
import {
  sameEnterpriseIdentityScope,
  type EnterpriseIdentityScope,
} from "../../ports/enterprise-access-token-provider.js";
import {
  runtimeActivationPersistenceFailure as failure,
  type AdvanceRuntimeActivationInput,
  type BeginRuntimeActivationInput,
  type FailRuntimeActivationInput,
  type RecordRuntimeFallbackInput,
  type RuntimeActivationAttempt,
  type RuntimeActivationFailureFact,
  type RuntimeActivationPersistence,
  type RuntimeActivationState,
  type RuntimeActivationTarget,
  type RuntimeActivationWriteResult,
  type RuntimeActiveGeneration,
} from "../../ports/runtime-activation-persistence.js";

export class InMemoryRuntimeActivationPersistence
implements RuntimeActivationPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.runtime-activation.memory";
  readonly #configuration: EnterpriseConfigurationPersistence;
  readonly #clock: Clock;
  readonly #attempts = new Map<string, RuntimeActivationAttempt>();
  readonly #attemptOrder = new Map<string, string[]>();
  readonly #runtimeActive = new Map<string, RuntimeActiveGeneration>();
  #started = false;

  constructor(input: {
    configurationPersistence: EnterpriseConfigurationPersistence;
    clock: Clock;
  }) {
    this.#configuration = input.configurationPersistence;
    this.#clock = input.clock;
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

  async loadRuntimeActivationState(
    scope: EnterpriseIdentityScope,
  ): Promise<RuntimeActivationState> {
    this.#requireStarted();
    const key = scopeKey(scope);
    const attemptIds = this.#attemptOrder.get(key) ?? [];
    const latestAttempt = this.#attempts.get(attemptIds.at(-1) ?? "");
    const runtimeActive = this.#runtimeActive.get(key);
    const lastFailure = [...attemptIds].reverse()
      .map((id) => this.#attempts.get(id)?.failure)
      .find((fact) => fact !== undefined);
    return clone({
      ...(runtimeActive === undefined ? {} : { runtimeActive }),
      ...(latestAttempt === undefined ? {} : { latestAttempt }),
      ...(lastFailure === undefined ? {} : { lastFailure }),
    });
  }

  async loadRuntimeActivationAttempt(
    activationAttemptId: string,
  ): Promise<RuntimeActivationAttempt | undefined> {
    this.#requireStarted();
    const attempt = this.#attempts.get(activationAttemptId);
    return attempt === undefined ? undefined : clone(attempt);
  }

  async listRuntimeActivationAttempts(
    scope: EnterpriseIdentityScope,
  ): Promise<readonly RuntimeActivationAttempt[]> {
    this.#requireStarted();
    return (this.#attemptOrder.get(scopeKey(scope)) ?? [])
      .map((id) => this.#attempts.get(id))
      .filter((attempt): attempt is RuntimeActivationAttempt =>
        attempt !== undefined)
      .map((attempt) => clone(attempt));
  }

  async beginRuntimeActivation(
    input: BeginRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationAttempt>> {
    this.#requireStarted();
    const existing = this.#attempts.get(input.activationAttemptId);
    if (existing !== undefined) {
      return sameBegin(existing, input)
        ? success(existing, true)
        : failure(
          "runtime_activation.persistence_conflict",
          "activationAttemptId already represents different immutable facts",
        );
    }
    const key = scopeKey(input.scope);
    const pending = (this.#attemptOrder.get(key) ?? [])
      .map((id) => this.#attempts.get(id))
      .find((attempt) => attempt !== undefined && !terminal(attempt.status));
    if (pending !== undefined) {
      return failure(
        "runtime_activation.persistence_conflict",
        "another Runtime Activation attempt is already pending for this scope",
      );
    }
    const active = await this.#configuration.loadActive(input.scope);
    if (!targetMatchesActivation(input.target, active)) {
      return failure(
        "runtime_activation.target_not_storage_active",
        "activation target is not the exact current Storage Active generation",
      );
    }
    const currentRuntimeActive = this.#runtimeActive.get(key);
    if (!sameOptionalRuntimeActive(
      currentRuntimeActive,
      input.expectedPreviousRuntimeActive,
    )) {
      return failure(
        "runtime_activation.stale_attempt",
        "runtimeActive changed before activation intent was recorded",
      );
    }
    const attempt: RuntimeActivationAttempt = {
      activationAttemptId: input.activationAttemptId,
      scope: input.scope,
      target: input.target,
      ...(input.expectedPreviousRuntimeActive === undefined
        ? {}
        : { expectedPreviousRuntimeActive: input.expectedPreviousRuntimeActive }),
      status: "intent_recorded",
      requestedAt: input.requestedAt,
    };
    this.#attempts.set(input.activationAttemptId, clone(attempt));
    this.#attemptOrder.set(key, [
      ...(this.#attemptOrder.get(key) ?? []),
      input.activationAttemptId,
    ]);
    return success(attempt, false);
  }

  async recordRestartDecision(
    input: AdvanceRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationAttempt>> {
    return this.#advance(input, "intent_recorded", "restart_requested", {
      restartRequestedAt: input.occurredAt,
    });
  }

  async recordInternalReadiness(
    input: AdvanceRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationAttempt>> {
    const active = await this.#configuration.loadActive(input.scope);
    if (!targetMatchesActivation(input.target, active)) {
      return failure(
        "runtime_activation.target_not_storage_active",
        "Storage Active advanced before internal readiness commit",
      );
    }
    return this.#advance(input, "restart_requested", "internally_ready", {
      internallyReadyAt: input.occurredAt,
    });
  }

  async commitRuntimeActive(
    input: AdvanceRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActiveGeneration>> {
    this.#requireStarted();
    const attemptResult = this.#requireAttempt(input);
    if (!attemptResult.ok) return attemptResult;
    const attempt = attemptResult.value;
    if (attempt.status === "completed") {
      const current = this.#runtimeActive.get(scopeKey(input.scope));
      return current !== undefined
        && current.activationAttemptId === input.activationAttemptId
        && sameTarget(current.target, input.target)
        ? success(current, true)
        : failure(
          "runtime_activation.integrity_mismatch",
          "completed attempt does not match the runtimeActive fact",
        );
    }
    if (attempt.status !== "internally_ready") {
      return failure(
        "runtime_activation.stale_attempt",
        "runtimeActive can be committed only after internal readiness",
      );
    }
    const active = await this.#configuration.loadActive(input.scope);
    if (!targetMatchesActivation(input.target, active)) {
      return failure(
        "runtime_activation.target_not_storage_active",
        "Storage Active advanced before runtimeActive commit",
      );
    }
    const runtimeActive: RuntimeActiveGeneration = {
      activationAttemptId: input.activationAttemptId,
      scope: input.scope,
      target: input.target,
      activatedAt: input.occurredAt,
    };
    const completed: RuntimeActivationAttempt = {
      ...attempt,
      status: "completed",
      completedAt: input.occurredAt,
    };
    this.#attempts.set(input.activationAttemptId, clone(completed));
    this.#runtimeActive.set(scopeKey(input.scope), clone(runtimeActive));
    return success(runtimeActive, false);
  }

  async recordRuntimeActivationFailure(
    input: FailRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationFailureFact>> {
    this.#requireStarted();
    if (!validSafeErrorCode(input.errorCode)) {
      return failure(
        "runtime_activation.persistence_conflict",
        "Runtime Activation failure requires a safe typed error code",
      );
    }
    const attemptResult = this.#requireAttempt(input);
    if (!attemptResult.ok) return attemptResult;
    const attempt = attemptResult.value;
    if (attempt.status === "completed") {
      return failure(
        "runtime_activation.stale_attempt",
        "completed Runtime Activation cannot be failed",
      );
    }
    if (attempt.status === "failed") {
      return attempt.failure?.errorCode === input.errorCode
        ? success(attempt.failure, true)
        : failure(
          "runtime_activation.persistence_conflict",
          "failed attempt already records another failure code",
        );
    }
    const runtimeActive = this.#runtimeActive.get(scopeKey(input.scope));
    const fact: RuntimeActivationFailureFact = {
      activationAttemptId: input.activationAttemptId,
      scope: input.scope,
      target: input.target,
      errorCode: input.errorCode,
      failedAt: input.occurredAt,
      ...(runtimeActive === undefined
        ? {}
        : { fallbackRuntimeActive: runtimeActive }),
    };
    this.#attempts.set(input.activationAttemptId, clone({
      ...attempt,
      status: "failed",
      failure: fact,
    }));
    return success(fact, false);
  }

  async recordRuntimeFallbackReady(
    input: RecordRuntimeFallbackInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationFailureFact>> {
    this.#requireStarted();
    const attemptResult = this.#requireAttempt(input);
    if (!attemptResult.ok) return attemptResult;
    const attempt = attemptResult.value;
    const current = this.#runtimeActive.get(scopeKey(input.scope));
    if (
      attempt.status !== "failed"
      || attempt.failure === undefined
      || current === undefined
      || !sameRuntimeActive(current, input.fallbackRuntimeActive)
      || !sameOptionalRuntimeActive(
        attempt.expectedPreviousRuntimeActive,
        input.fallbackRuntimeActive,
      )
    ) {
      return failure(
        "runtime_activation.stale_attempt",
        "fallback does not match the last successful runtimeActive generation",
      );
    }
    const active = await this.#configuration.loadActive(input.scope);
    if (!targetMatchesActivation(input.target, active)) {
      return failure(
        "runtime_activation.target_not_storage_active",
        "Storage Active advanced during fallback recovery",
      );
    }
    if (attempt.failure.fallbackReadyAt !== undefined) {
      return success(attempt.failure, true);
    }
    const fact: RuntimeActivationFailureFact = {
      ...attempt.failure,
      fallbackRuntimeActive: input.fallbackRuntimeActive,
      fallbackReadyAt: input.occurredAt,
    };
    this.#attempts.set(input.activationAttemptId, clone({
      ...attempt,
      failure: fact,
    }));
    return success(fact, false);
  }

  #advance(
    input: AdvanceRuntimeActivationInput,
    expected: RuntimeActivationAttempt["status"],
    next: RuntimeActivationAttempt["status"],
    timestamps: Partial<RuntimeActivationAttempt>,
  ): RuntimeActivationWriteResult<RuntimeActivationAttempt> {
    this.#requireStarted();
    const attemptResult = this.#requireAttempt(input);
    if (!attemptResult.ok) return attemptResult;
    const attempt = attemptResult.value;
    if (attempt.status === next) return success(attempt, true);
    if (attempt.status !== expected) {
      return failure(
        "runtime_activation.stale_attempt",
        `cannot advance Runtime Activation from ${attempt.status} to ${next}`,
      );
    }
    const updated: RuntimeActivationAttempt = {
      ...attempt,
      ...timestamps,
      status: next,
    };
    this.#attempts.set(input.activationAttemptId, clone(updated));
    return success(updated, false);
  }

  #requireAttempt(
    input: Pick<
      AdvanceRuntimeActivationInput,
      "activationAttemptId" | "scope" | "target"
    >,
  ): RuntimeActivationWriteResult<RuntimeActivationAttempt> {
    const attempt = this.#attempts.get(input.activationAttemptId);
    if (
      attempt === undefined
      || !sameEnterpriseIdentityScope(attempt.scope, input.scope)
      || !sameTarget(attempt.target, input.target)
    ) {
      return failure(
        "runtime_activation.stale_attempt",
        "Runtime Activation attempt is missing or does not match target facts",
      );
    }
    return success(attempt, true);
  }

  #requireStarted(): void {
    if (!this.#started) {
      throw new Error("Runtime Activation persistence is not started");
    }
  }
}

function targetMatchesActivation(
  target: RuntimeActivationTarget,
  activation: Awaited<
    ReturnType<EnterpriseConfigurationPersistence["loadActive"]>
  >,
): boolean {
  const identity = activation?.configuration.identity;
  return identity !== undefined
    && identity.candidateKey === target.candidateKey
    && identity.snapshotRevision === target.snapshotRevision
    && identity.snapshotDigest === target.snapshotDigest
    && activation?.configuration.materializationDigest
      === target.materializationDigest;
}

function sameBegin(
  attempt: RuntimeActivationAttempt,
  input: BeginRuntimeActivationInput,
): boolean {
  return sameEnterpriseIdentityScope(attempt.scope, input.scope)
    && sameTarget(attempt.target, input.target)
    && sameOptionalRuntimeActive(
      attempt.expectedPreviousRuntimeActive,
      input.expectedPreviousRuntimeActive,
    )
    && attempt.requestedAt === input.requestedAt;
}

function sameTarget(
  left: RuntimeActivationTarget,
  right: RuntimeActivationTarget,
): boolean {
  return left.candidateKey === right.candidateKey
    && left.snapshotRevision === right.snapshotRevision
    && left.snapshotDigest === right.snapshotDigest
    && left.materializationDigest === right.materializationDigest
    && left.registryRevision === right.registryRevision;
}

function sameRuntimeActive(
  left: RuntimeActiveGeneration,
  right: RuntimeActiveGeneration,
): boolean {
  return left.activationAttemptId === right.activationAttemptId
    && left.activatedAt === right.activatedAt
    && sameEnterpriseIdentityScope(left.scope, right.scope)
    && sameTarget(left.target, right.target);
}

function sameOptionalRuntimeActive(
  left: RuntimeActiveGeneration | undefined,
  right: RuntimeActiveGeneration | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && sameRuntimeActive(left, right);
}

function terminal(status: RuntimeActivationAttempt["status"]): boolean {
  return status === "completed" || status === "failed";
}

function validSafeErrorCode(value: string): boolean {
  return /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/u.test(value)
    && value.length <= 128;
}

function scopeKey(scope: EnterpriseIdentityScope): string {
  return [
    scope.enterpriseId,
    scope.userId,
    scope.deviceId,
    scope.clientInstanceId,
  ].map((part) => `${part.length}:${part}`).join("|");
}

function success<T>(
  value: T,
  replayed: boolean,
): RuntimeActivationWriteResult<T> {
  return { ok: true, replayed, value: clone(value) };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
