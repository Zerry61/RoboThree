import type { Clock } from "../ports/clock.js";
import type {
  ControlledCoreRestartPort,
} from "../ports/controlled-core-restart.js";
import type { EnterpriseIdentityScope } from "../ports/enterprise-access-token-provider.js";
import type {
  AdvanceRuntimeActivationInput,
  RuntimeActivationAttempt,
  RuntimeActivationPersistence,
  RuntimeActivationTarget,
  RuntimeActivationWriteResult,
  RuntimeActiveGeneration,
} from "../ports/runtime-activation-persistence.js";
import type {
  RuntimeRegistryInstaller,
} from "../ports/runtime-registry-installer.js";
import type {
  EnterpriseRegistryMaterializer,
  EnterpriseRegistryMaterialization,
} from "./enterprise-registry-materializer.js";

export type RuntimeActivationFaultPoint =
  | "before_activation_intent"
  | "after_activation_intent_before_restart"
  | "after_restart_request_before_new_core"
  | "after_registry_build_before_internal_readiness"
  | "after_internal_readiness_before_runtime_active_commit"
  | "after_runtime_active_commit_before_public_readiness"
  | "after_public_readiness_before_response";

export class RuntimeActivationCrash extends Error {
  constructor(readonly point: RuntimeActivationFaultPoint) {
    super(`injected Runtime Activation crash at ${point}`);
    this.name = "RuntimeActivationCrash";
  }
}

export type RuntimeActivationCoordinatorResult =
  | Readonly<{
    status: "restart_requested";
    attempt: RuntimeActivationAttempt;
  }>
  | Readonly<{
    status: "ready";
    runtimeActive: RuntimeActiveGeneration;
    replayed: boolean;
  }>
  | Readonly<{
    status: "fallback_ready";
    runtimeActive: RuntimeActiveGeneration;
    failedAttempt: RuntimeActivationAttempt;
  }>
  | Readonly<{
    status: "activation_failed";
    failedAttempt: RuntimeActivationAttempt;
  }>
  | Readonly<{ status: "not_configured" }>;

export class RuntimeActivationCoordinatorError extends Error {
  constructor(
    readonly code:
      | "runtime_activation.persistence_rejected"
      | "runtime_activation.restart_failed"
      | "runtime_activation.integrity_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "RuntimeActivationCoordinatorError";
  }
}

export class RuntimeActivationCoordinator {
  readonly #materializer: EnterpriseRegistryMaterializer;
  readonly #persistence: RuntimeActivationPersistence;
  readonly #restart: ControlledCoreRestartPort;
  readonly #installer: RuntimeRegistryInstaller;
  readonly #clock: Clock;
  readonly #faultInjector: ((point: RuntimeActivationFaultPoint) => void)
    | undefined;
  readonly #mailboxes = new Map<string, Promise<void>>();

  constructor(input: Readonly<{
    materializer: EnterpriseRegistryMaterializer;
    persistence: RuntimeActivationPersistence;
    restart: ControlledCoreRestartPort;
    installer: RuntimeRegistryInstaller;
    clock: Clock;
    faultInjector?: (point: RuntimeActivationFaultPoint) => void;
  }>) {
    this.#materializer = input.materializer;
    this.#persistence = input.persistence;
    this.#restart = input.restart;
    this.#installer = input.installer;
    this.#clock = input.clock;
    this.#faultInjector = input.faultInjector;
  }

  requestActivation(input: Readonly<{
    activationAttemptId: string;
    scope: EnterpriseIdentityScope;
  }>): Promise<RuntimeActivationCoordinatorResult> {
    return this.#enqueue(input.scope, () => this.#requestSerialized(input));
  }

  recoverAtStartup(
    scope: EnterpriseIdentityScope,
  ): Promise<RuntimeActivationCoordinatorResult> {
    return this.#enqueue(scope, () => this.#recoverSerialized(scope));
  }

  async #requestSerialized(input: Readonly<{
    activationAttemptId: string;
    scope: EnterpriseIdentityScope;
  }>): Promise<RuntimeActivationCoordinatorResult> {
    const materialization = await this.#materializer.materialize(input.scope);
    const target = activationTarget(materialization);
    this.#fault("before_activation_intent");
    const state = await this.#persistence.loadRuntimeActivationState(input.scope);
    const begun = await this.#persistence.beginRuntimeActivation({
      activationAttemptId: input.activationAttemptId,
      scope: input.scope,
      target,
      ...(state.runtimeActive === undefined
        ? {}
        : { expectedPreviousRuntimeActive: state.runtimeActive }),
      requestedAt: this.#clock.now(),
    });
    const attempt = requireWrite(begun);
    if (attempt.status === "completed") {
      return this.#replayCompleted(attempt);
    }
    if (attempt.status === "failed") {
      return this.#recoverFailed(attempt);
    }
    this.#fault("after_activation_intent_before_restart");
    const restartDecision = attempt.status === "intent_recorded"
      ? requireWrite(await this.#persistence.recordRestartDecision({
        activationAttemptId: attempt.activationAttemptId,
        scope: attempt.scope,
        target: attempt.target,
        occurredAt: this.#clock.now(),
      }))
      : attempt;
    try {
      await this.#restart.requestControlledRestart({
        activationAttemptId: restartDecision.activationAttemptId,
        target: restartDecision.target,
      });
    } catch {
      return this.#failAndMaybeFallback(
        restartDecision,
        "runtime_activation.restart_failed",
      );
    }
    this.#fault("after_restart_request_before_new_core");
    return { status: "restart_requested", attempt: restartDecision };
  }

  async #recoverSerialized(
    scope: EnterpriseIdentityScope,
  ): Promise<RuntimeActivationCoordinatorResult> {
    const state = await this.#persistence.loadRuntimeActivationState(scope);
    const attempt = state.latestAttempt;
    if (attempt === undefined) {
      if (state.runtimeActive === undefined) return { status: "not_configured" };
      return this.#rebuildCommitted(state.runtimeActive, true);
    }
    if (attempt.status === "completed") return this.#replayCompleted(attempt);
    if (attempt.status === "failed") return this.#recoverFailed(attempt);
    if (attempt.status === "intent_recorded") {
      const restartDecision = requireWrite(
        await this.#persistence.recordRestartDecision({
          activationAttemptId: attempt.activationAttemptId,
          scope: attempt.scope,
          target: attempt.target,
          occurredAt: this.#clock.now(),
        }),
      );
      try {
        await this.#restart.requestControlledRestart({
          activationAttemptId: restartDecision.activationAttemptId,
          target: restartDecision.target,
        });
      } catch {
        return this.#failAndMaybeFallback(
          restartDecision,
          "runtime_activation.restart_failed",
        );
      }
      return { status: "restart_requested", attempt: restartDecision };
    }
    const startupIntent = await this.#restart.observeStartupIntent();
    if (
      startupIntent === undefined
      || startupIntent.activationAttemptId !== attempt.activationAttemptId
      || !sameTarget(startupIntent.target, attempt.target)
    ) {
      return this.#failAndMaybeFallback(
        attempt,
        "runtime_activation.startup_target_mismatch",
      );
    }
    return this.#activateInNewCore(attempt);
  }

  async #activateInNewCore(
    attempt: RuntimeActivationAttempt,
  ): Promise<RuntimeActivationCoordinatorResult> {
    try {
      const materialization = await this.#materializer.materializeExact(
        attempt.scope,
        attempt.target.candidateKey,
      );
      assertTarget(attempt.target, materialization);
      this.#fault("after_registry_build_before_internal_readiness");
      await this.#installer.installAndCheckInternalReadiness({
        target: attempt.target,
        materialization,
      });
      const readinessInput = advanceInput(attempt, this.#clock.now());
      if (attempt.status !== "internally_ready") {
        requireWrite(
          await this.#persistence.recordInternalReadiness(readinessInput),
        );
      }
      this.#fault("after_internal_readiness_before_runtime_active_commit");
      const committed = requireWrite(
        await this.#persistence.commitRuntimeActive({
          ...readinessInput,
          occurredAt: this.#clock.now(),
        }),
      );
      this.#fault("after_runtime_active_commit_before_public_readiness");
      await this.#installer.exposePublicReadiness(committed.target);
      this.#fault("after_public_readiness_before_response");
      return { status: "ready", runtimeActive: committed, replayed: false };
    } catch (error) {
      if (error instanceof RuntimeActivationCrash) throw error;
      const current = await this.#persistence.loadRuntimeActivationAttempt(
        attempt.activationAttemptId,
      );
      if (current?.status === "completed") {
        // The durable commit won. Public readiness is replayed by the next
        // startup and the attempt must never be rewritten as failed.
        throw error;
      }
      return this.#failAndMaybeFallback(
        attempt,
        error instanceof RuntimeActivationCoordinatorError
          ? error.code
          : "runtime_activation.target_startup_failed",
      );
    }
  }

  async #replayCompleted(
    attempt: RuntimeActivationAttempt,
  ): Promise<RuntimeActivationCoordinatorResult> {
    const state = await this.#persistence.loadRuntimeActivationState(
      attempt.scope,
    );
    const runtimeActive = state.runtimeActive;
    if (
      runtimeActive === undefined
      || runtimeActive.activationAttemptId !== attempt.activationAttemptId
      || !sameTarget(runtimeActive.target, attempt.target)
    ) {
      await this.#installer.failClosedEnterprisePartition(attempt.target);
      throw new RuntimeActivationCoordinatorError(
        "runtime_activation.integrity_mismatch",
        "completed attempt does not match the persisted runtimeActive fact",
      );
    }
    return this.#rebuildCommitted(runtimeActive, true);
  }

  async #rebuildCommitted(
    runtimeActive: RuntimeActiveGeneration,
    replayed: boolean,
  ): Promise<RuntimeActivationCoordinatorResult> {
    const materialization = await this.#materializer.materializeExact(
      runtimeActive.scope,
      runtimeActive.target.candidateKey,
    );
    assertTarget(runtimeActive.target, materialization);
    await this.#installer.installAndCheckInternalReadiness({
      target: runtimeActive.target,
      materialization,
    });
    await this.#installer.exposePublicReadiness(runtimeActive.target);
    return { status: "ready", runtimeActive, replayed };
  }

  async #failAndMaybeFallback(
    attempt: RuntimeActivationAttempt,
    errorCode: string,
  ): Promise<RuntimeActivationCoordinatorResult> {
    const failed = requireWrite(
      await this.#persistence.recordRuntimeActivationFailure({
        ...advanceInput(attempt, this.#clock.now()),
        errorCode,
      }),
    );
    const persistedAttempt = await this.#persistence.loadRuntimeActivationAttempt(
      attempt.activationAttemptId,
    );
    if (persistedAttempt === undefined) {
      throw new RuntimeActivationCoordinatorError(
        "runtime_activation.persistence_rejected",
        "failed Runtime Activation attempt disappeared after commit",
      );
    }
    const previous = persistedAttempt.expectedPreviousRuntimeActive;
    if (
      previous === undefined
      || failed.fallbackRuntimeActive === undefined
      || !sameRuntimeActive(previous, failed.fallbackRuntimeActive)
    ) {
      await this.#installer.failClosedEnterprisePartition(attempt.target);
      return { status: "activation_failed", failedAttempt: persistedAttempt };
    }
    try {
      const oldMaterialization = await this.#materializer.materializeExact(
        attempt.scope,
        previous.target.candidateKey,
      );
      assertTarget(previous.target, oldMaterialization);
      await this.#installer.installAndCheckInternalReadiness({
        target: previous.target,
        materialization: oldMaterialization,
      });
      requireWrite(await this.#persistence.recordRuntimeFallbackReady({
        ...advanceInput(attempt, this.#clock.now()),
        fallbackRuntimeActive: previous,
      }));
      await this.#installer.exposePublicReadiness(previous.target);
      const updated = await this.#persistence.loadRuntimeActivationAttempt(
        attempt.activationAttemptId,
      );
      return {
        status: "fallback_ready",
        runtimeActive: previous,
        failedAttempt: updated ?? persistedAttempt,
      };
    } catch (error) {
      if (error instanceof RuntimeActivationCrash) throw error;
      await this.#installer.failClosedEnterprisePartition(attempt.target);
      const updated = await this.#persistence.loadRuntimeActivationAttempt(
        attempt.activationAttemptId,
      );
      return {
        status: "activation_failed",
        failedAttempt: updated ?? persistedAttempt,
      };
    }
  }

  async #recoverFailed(
    attempt: RuntimeActivationAttempt,
  ): Promise<RuntimeActivationCoordinatorResult> {
    const fallback = attempt.failure?.fallbackRuntimeActive;
    if (fallback === undefined || attempt.failure?.fallbackReadyAt === undefined) {
      await this.#installer.failClosedEnterprisePartition(attempt.target);
      return { status: "activation_failed", failedAttempt: attempt };
    }
    try {
      const materialization = await this.#materializer.materializeExact(
        attempt.scope,
        fallback.target.candidateKey,
      );
      assertTarget(fallback.target, materialization);
      await this.#installer.installAndCheckInternalReadiness({
        target: fallback.target,
        materialization,
      });
      await this.#installer.exposePublicReadiness(fallback.target);
      return {
        status: "fallback_ready",
        runtimeActive: fallback,
        failedAttempt: attempt,
      };
    } catch {
      await this.#installer.failClosedEnterprisePartition(attempt.target);
      return { status: "activation_failed", failedAttempt: attempt };
    }
  }

  #fault(point: RuntimeActivationFaultPoint): void {
    this.#faultInjector?.(point);
  }

  async #enqueue<T>(
    scope: EnterpriseIdentityScope,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = scopeKey(scope);
    const previous = this.#mailboxes.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => turn);
    this.#mailboxes.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
      if (this.#mailboxes.get(key) === tail) this.#mailboxes.delete(key);
    }
  }
}

function activationTarget(
  materialization: EnterpriseRegistryMaterialization,
): RuntimeActivationTarget {
  return Object.freeze({
    ...materialization.generation,
    registryRevision: materialization.registrySnapshot.registryRevision,
  });
}

function assertTarget(
  target: RuntimeActivationTarget,
  materialization: EnterpriseRegistryMaterialization,
): void {
  const rebuilt = activationTarget(materialization);
  if (!sameTarget(target, rebuilt)) {
    throw new RuntimeActivationCoordinatorError(
      "runtime_activation.integrity_mismatch",
      "rebuilt Registry generation does not match the persisted target",
    );
  }
}

function advanceInput(
  attempt: RuntimeActivationAttempt,
  occurredAt: string,
): AdvanceRuntimeActivationInput {
  return {
    activationAttemptId: attempt.activationAttemptId,
    scope: attempt.scope,
    target: attempt.target,
    occurredAt,
  };
}

function requireWrite<T>(
  result: RuntimeActivationWriteResult<T>,
): T {
  if (!result.ok) {
    throw new RuntimeActivationCoordinatorError(
      "runtime_activation.persistence_rejected",
      `${result.error.code}: ${result.error.message}`,
    );
  }
  return result.value;
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
    && sameTarget(left.target, right.target);
}

function scopeKey(scope: EnterpriseIdentityScope): string {
  return [
    scope.enterpriseId,
    scope.userId,
    scope.deviceId,
    scope.clientInstanceId,
  ].map((part) => `${part.length}:${part}`).join("|");
}
