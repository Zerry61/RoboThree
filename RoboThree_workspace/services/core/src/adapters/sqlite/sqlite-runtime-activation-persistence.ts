import { DatabaseSync } from "node:sqlite";

import type { ComponentHealth } from "@robothree/contracts";

import type { Clock } from "../../ports/clock.js";
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
import {
  configureEnterpriseConfigurationSqlite,
  migrateAndPreflightEnterpriseConfiguration,
} from "./enterprise-configuration-schema-preflight.js";

export type SqliteRuntimeActivationFaultPoint =
  | "before_intent_commit"
  | "after_intent_commit_before_response"
  | "before_runtime_active_commit"
  | "after_runtime_active_commit_before_response";

export class SqliteRuntimeActivationPersistence
implements RuntimeActivationPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.runtime-activation.sqlite";
  readonly #databasePath: string;
  readonly #clock: Clock;
  readonly #faultInjector: ((
    point: SqliteRuntimeActivationFaultPoint,
  ) => void) | undefined;
  #database: DatabaseSync | undefined;
  #startupError: string | undefined;

  constructor(input: {
    databasePath: string;
    clock: Clock;
    faultInjector?: (point: SqliteRuntimeActivationFaultPoint) => void;
  }) {
    this.#databasePath = input.databasePath;
    this.#clock = input.clock;
    this.#faultInjector = input.faultInjector;
  }

  async start(): Promise<void> {
    if (this.#database !== undefined) return;
    const database = new DatabaseSync(this.#databasePath, {
      allowExtension: false,
    });
    try {
      configureEnterpriseConfigurationSqlite(database);
      migrateAndPreflightEnterpriseConfiguration(database, this.#clock);
      database.enableDefensive(true);
      this.#database = database;
      this.#startupError = undefined;
    } catch (error) {
      this.#startupError = "runtime_activation_schema_preflight_failed";
      database.close();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.#database?.close();
    this.#database = undefined;
  }

  async health(): Promise<ComponentHealth> {
    return {
      componentId: this.componentId,
      status: this.#database === undefined ? "unavailable" : "ready",
      checkedAt: this.#clock.now(),
      ...(this.#startupError === undefined
        ? {}
        : { details: { startupError: this.#startupError } }),
    };
  }

  async loadRuntimeActivationState(
    scope: EnterpriseIdentityScope,
  ): Promise<RuntimeActivationState> {
    const database = this.#requireDatabase();
    const latestAttempt = selectLatestAttempt(database, scope);
    const runtimeActive = selectRuntimeActive(database, scope);
    const failureRow = database.prepare(`
      SELECT attempt_json FROM enterprise_runtime_activation_attempts
      WHERE scope_key = ? AND status = 'failed'
      ORDER BY attempt_sequence DESC LIMIT 1
    `).get(scopeKey(scope)) as Record<string, unknown> | undefined;
    const lastFailure = failureRow === undefined
      ? undefined
      : parseAttempt(failureRow).failure;
    return {
      ...(runtimeActive === undefined ? {} : { runtimeActive }),
      ...(latestAttempt === undefined ? {} : { latestAttempt }),
      ...(lastFailure === undefined ? {} : { lastFailure }),
    };
  }

  async loadRuntimeActivationAttempt(
    activationAttemptId: string,
  ): Promise<RuntimeActivationAttempt | undefined> {
    return selectAttempt(this.#requireDatabase(), activationAttemptId);
  }

  async listRuntimeActivationAttempts(
    scope: EnterpriseIdentityScope,
  ): Promise<readonly RuntimeActivationAttempt[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT attempt_json FROM enterprise_runtime_activation_attempts
      WHERE scope_key = ? ORDER BY attempt_sequence ASC
    `).all(scopeKey(scope)) as Record<string, unknown>[];
    return rows.map((row) => parseAttempt(row));
  }

  async beginRuntimeActivation(
    input: BeginRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationAttempt>> {
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const existing = selectAttempt(database, input.activationAttemptId);
        if (existing !== undefined) {
          return sameBegin(existing, input)
            ? success(existing, true)
            : failure(
              "runtime_activation.persistence_conflict",
              "activationAttemptId already represents different immutable facts",
            );
        }
        const pending = database.prepare(`
          SELECT activation_attempt_id
          FROM enterprise_runtime_activation_attempts
          WHERE scope_key = ?
            AND status NOT IN ('completed', 'failed')
          LIMIT 1
        `).get(scopeKey(input.scope));
        if (pending !== undefined) {
          return failure(
            "runtime_activation.persistence_conflict",
            "another Runtime Activation attempt is already pending for this scope",
          );
        }
        if (!targetMatchesStorageActive(database, input.scope, input.target)) {
          return failure(
            "runtime_activation.target_not_storage_active",
            "activation target is not the exact current Storage Active generation",
          );
        }
        const currentRuntimeActive = selectRuntimeActive(database, input.scope);
        if (!sameOptionalRuntimeActive(
          currentRuntimeActive,
          input.expectedPreviousRuntimeActive,
        )) {
          return failure(
            "runtime_activation.stale_attempt",
            "runtimeActive changed before activation intent was recorded",
          );
        }
        const sequenceRow = database.prepare(`
          SELECT COALESCE(MAX(attempt_sequence), 0) + 1 AS next_sequence
          FROM enterprise_runtime_activation_attempts WHERE scope_key = ?
        `).get(scopeKey(input.scope)) as Record<string, unknown>;
        const attempt: RuntimeActivationAttempt = {
          activationAttemptId: input.activationAttemptId,
          scope: input.scope,
          target: input.target,
          ...(input.expectedPreviousRuntimeActive === undefined
            ? {}
            : {
              expectedPreviousRuntimeActive:
                input.expectedPreviousRuntimeActive,
            }),
          status: "intent_recorded",
          requestedAt: input.requestedAt,
        };
        this.#faultInjector?.("before_intent_commit");
        database.prepare(`
          INSERT INTO enterprise_runtime_activation_attempts (
            activation_attempt_id, scope_key, attempt_sequence,
            target_candidate_key, status, attempt_json, requested_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.activationAttemptId,
          scopeKey(input.scope),
          requireInteger(sequenceRow.next_sequence, "next_sequence"),
          input.target.candidateKey,
          attempt.status,
          JSON.stringify(attempt),
          input.requestedAt,
          input.requestedAt,
        );
        return success(attempt, false);
      }, () => this.#faultInjector?.(
        "after_intent_commit_before_response",
      ));
    } catch (error) {
      if (error instanceof InjectedPostCommitFailure) throw error.cause;
      return sqliteFailure();
    }
  }

  async recordRestartDecision(
    input: AdvanceRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationAttempt>> {
    return this.#advance(
      input,
      "intent_recorded",
      "restart_requested",
      { restartRequestedAt: input.occurredAt },
    );
  }

  async recordInternalReadiness(
    input: AdvanceRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationAttempt>> {
    const database = this.#requireDatabase();
    if (!targetMatchesStorageActive(database, input.scope, input.target)) {
      return failure(
        "runtime_activation.target_not_storage_active",
        "Storage Active advanced before internal readiness commit",
      );
    }
    return this.#advance(
      input,
      "restart_requested",
      "internally_ready",
      { internallyReadyAt: input.occurredAt },
    );
  }

  async commitRuntimeActive(
    input: AdvanceRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActiveGeneration>> {
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const attemptResult = requireAttempt(database, input);
        if (!attemptResult.ok) return attemptResult;
        const attempt = attemptResult.value;
        if (attempt.status === "completed") {
          const current = selectRuntimeActive(database, input.scope);
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
        if (!targetMatchesStorageActive(database, input.scope, input.target)) {
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
        this.#faultInjector?.("before_runtime_active_commit");
        updateAttempt(database, completed, input.occurredAt);
        database.prepare(`
          INSERT INTO enterprise_runtime_active_generations (
            scope_key, candidate_key, activation_attempt_id,
            runtime_active_json, activated_at
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(scope_key) DO UPDATE SET
            candidate_key = excluded.candidate_key,
            activation_attempt_id = excluded.activation_attempt_id,
            runtime_active_json = excluded.runtime_active_json,
            activated_at = excluded.activated_at
        `).run(
          scopeKey(input.scope),
          input.target.candidateKey,
          input.activationAttemptId,
          JSON.stringify(runtimeActive),
          input.occurredAt,
        );
        return success(runtimeActive, false);
      }, () => this.#faultInjector?.(
        "after_runtime_active_commit_before_response",
      ));
    } catch (error) {
      if (error instanceof InjectedPostCommitFailure) throw error.cause;
      return sqliteFailure();
    }
  }

  async recordRuntimeActivationFailure(
    input: FailRuntimeActivationInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationFailureFact>> {
    if (!validSafeErrorCode(input.errorCode)) {
      return failure(
        "runtime_activation.persistence_conflict",
        "Runtime Activation failure requires a safe typed error code",
      );
    }
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const attemptResult = requireAttempt(database, input);
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
        const runtimeActive = selectRuntimeActive(database, input.scope);
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
        updateAttempt(database, {
          ...attempt,
          status: "failed",
          failure: fact,
        }, input.occurredAt);
        return success(fact, false);
      });
    } catch {
      return sqliteFailure();
    }
  }

  async recordRuntimeFallbackReady(
    input: RecordRuntimeFallbackInput,
  ): Promise<RuntimeActivationWriteResult<RuntimeActivationFailureFact>> {
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const attemptResult = requireAttempt(database, input);
        if (!attemptResult.ok) return attemptResult;
        const attempt = attemptResult.value;
        const current = selectRuntimeActive(database, input.scope);
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
        if (!targetMatchesStorageActive(database, input.scope, input.target)) {
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
        updateAttempt(database, {
          ...attempt,
          failure: fact,
        }, input.occurredAt);
        return success(fact, false);
      });
    } catch {
      return sqliteFailure();
    }
  }

  #advance(
    input: AdvanceRuntimeActivationInput,
    expected: RuntimeActivationAttempt["status"],
    next: RuntimeActivationAttempt["status"],
    timestamps: Partial<RuntimeActivationAttempt>,
  ): RuntimeActivationWriteResult<RuntimeActivationAttempt> {
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const attemptResult = requireAttempt(database, input);
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
        updateAttempt(database, updated, input.occurredAt);
        return success(updated, false);
      });
    } catch {
      return sqliteFailure();
    }
  }

  #requireDatabase(): DatabaseSync {
    if (this.#database === undefined) {
      throw new Error("Runtime Activation SQLite persistence is not started");
    }
    return this.#database;
  }
}

function selectAttempt(
  database: DatabaseSync,
  activationAttemptId: string,
): RuntimeActivationAttempt | undefined {
  const row = database.prepare(`
    SELECT attempt_json FROM enterprise_runtime_activation_attempts
    WHERE activation_attempt_id = ?
  `).get(activationAttemptId) as Record<string, unknown> | undefined;
  return row === undefined ? undefined : parseAttempt(row);
}

function selectLatestAttempt(
  database: DatabaseSync,
  scope: EnterpriseIdentityScope,
): RuntimeActivationAttempt | undefined {
  const row = database.prepare(`
    SELECT attempt_json FROM enterprise_runtime_activation_attempts
    WHERE scope_key = ? ORDER BY attempt_sequence DESC LIMIT 1
  `).get(scopeKey(scope)) as Record<string, unknown> | undefined;
  return row === undefined ? undefined : parseAttempt(row);
}

function parseAttempt(row: Record<string, unknown>): RuntimeActivationAttempt {
  return JSON.parse(requireString(row.attempt_json, "attempt_json")) as
    RuntimeActivationAttempt;
}

function selectRuntimeActive(
  database: DatabaseSync,
  scope: EnterpriseIdentityScope,
): RuntimeActiveGeneration | undefined {
  const row = database.prepare(`
    SELECT runtime_active_json FROM enterprise_runtime_active_generations
    WHERE scope_key = ?
  `).get(scopeKey(scope)) as Record<string, unknown> | undefined;
  return row === undefined
    ? undefined
    : JSON.parse(requireString(
      row.runtime_active_json,
      "runtime_active_json",
    )) as RuntimeActiveGeneration;
}

function updateAttempt(
  database: DatabaseSync,
  attempt: RuntimeActivationAttempt,
  updatedAt: string,
): void {
  database.prepare(`
    UPDATE enterprise_runtime_activation_attempts
    SET status = ?, attempt_json = ?, updated_at = ?
    WHERE activation_attempt_id = ?
  `).run(
    attempt.status,
    JSON.stringify(attempt),
    updatedAt,
    attempt.activationAttemptId,
  );
}

function requireAttempt(
  database: DatabaseSync,
  input: Pick<
    AdvanceRuntimeActivationInput,
    "activationAttemptId" | "scope" | "target"
  >,
): RuntimeActivationWriteResult<RuntimeActivationAttempt> {
  const attempt = selectAttempt(database, input.activationAttemptId);
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

function targetMatchesStorageActive(
  database: DatabaseSync,
  scope: EnterpriseIdentityScope,
  target: RuntimeActivationTarget,
): boolean {
  const row = database.prepare(`
    SELECT c.candidate_key, c.snapshot_revision, c.snapshot_digest,
      c.materialization_digest, c.status
    FROM enterprise_configuration_scope_pointers p
    JOIN enterprise_configuration_candidates c
      ON c.candidate_key = p.active_candidate_key
    JOIN enterprise_configuration_activations a
      ON a.candidate_key = c.candidate_key
    WHERE p.scope_key = ?
  `).get(scopeKey(scope)) as Record<string, unknown> | undefined;
  return row?.candidate_key === target.candidateKey
    && row.snapshot_revision === target.snapshotRevision
    && row.snapshot_digest === target.snapshotDigest
    && row.materialization_digest === target.materializationDigest
    && row.status === "sealed";
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
  return { ok: true, replayed, value };
}

function sqliteFailure(): RuntimeActivationWriteResult<never> {
  return failure(
    "runtime_activation.persistence_unavailable",
    "Runtime Activation SQLite operation failed",
  );
}

function withTransaction<T>(
  database: DatabaseSync,
  operation: () => T,
  afterCommit?: () => void,
): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    if (afterCommit !== undefined) {
      try {
        afterCommit();
      } catch (error) {
        throw new InjectedPostCommitFailure(error);
      }
    }
    return result;
  } catch (error) {
    if (!(error instanceof InjectedPostCommitFailure)) rollback(database);
    throw error;
  }
}

class InjectedPostCommitFailure extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super("injected failure after Runtime Activation commit");
    this.cause = cause;
  }
}

function rollback(database: DatabaseSync): void {
  try {
    database.exec("ROLLBACK");
  } catch {
    // Preserve original failure.
  }
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function requireInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}
