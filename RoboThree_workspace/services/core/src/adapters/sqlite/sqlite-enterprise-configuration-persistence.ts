import { DatabaseSync } from "node:sqlite";

import type { ComponentHealth } from "@robothree/contracts";

import type {
  ActivatedEnterpriseConfiguration,
} from "../../application/enterprise-configuration-types.js";
import {
  PackageMaterializer,
  enterpriseConfigurationCandidateKey,
} from "../../application/package-materializer.js";
import type { Clock } from "../../ports/clock.js";
import {
  sameEnterpriseIdentityScope,
  type EnterpriseIdentityScope,
} from "../../ports/enterprise-access-token-provider.js";
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
  configureEnterpriseConfigurationSqlite,
  migrateAndPreflightEnterpriseConfiguration,
} from "./enterprise-configuration-schema-preflight.js";

export type SqliteEnterpriseConfigurationFaultPoint =
  | "before_activation_commit"
  | "after_activation_commit_before_response";

export class SqliteEnterpriseConfigurationPersistence
implements EnterpriseConfigurationPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.enterprise-configuration.sqlite";
  readonly #databasePath: string;
  readonly #clock: Clock;
  readonly #faultInjector: ((
    point: SqliteEnterpriseConfigurationFaultPoint,
  ) => void) | undefined;
  #database: DatabaseSync | undefined;
  #startupError: string | undefined;

  constructor(input: {
    databasePath: string;
    clock: Clock;
    faultInjector?: (
      point: SqliteEnterpriseConfigurationFaultPoint,
    ) => void;
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
      this.#startupError = "enterprise_configuration_schema_preflight_failed";
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

  async loadActive(
    scope: EnterpriseIdentityScope,
  ): Promise<ActivatedEnterpriseConfiguration | undefined> {
    return selectActivation(
      this.#requireDatabase(),
      selectPointers(this.#requireDatabase(), scope)?.activeCandidateKey,
    );
  }

  async loadPrevious(
    scope: EnterpriseIdentityScope,
  ): Promise<ActivatedEnterpriseConfiguration | undefined> {
    return selectActivation(
      this.#requireDatabase(),
      selectPointers(this.#requireDatabase(), scope)?.previousCandidateKey,
    );
  }

  async loadSealedGeneration(
    scope: EnterpriseIdentityScope,
    candidateKey: string,
  ): Promise<ActivatedEnterpriseConfiguration | undefined> {
    const activation = selectActivation(this.#requireDatabase(), candidateKey);
    return activation !== undefined
      && sameEnterpriseIdentityScope(
        activation.configuration.identity.scope,
        scope,
      )
      ? activation
      : undefined;
  }

  async loadCandidate(
    candidateKey: string,
  ): Promise<EnterpriseConfigurationCandidate | undefined> {
    return selectCandidate(this.#requireDatabase(), candidateKey);
  }

  async beginOrResumeCandidate(
    input: BeginEnterpriseConfigurationCandidateInput,
  ): Promise<EnterpriseConfigurationWriteResult<EnterpriseConfigurationCandidate>> {
    const database = this.#requireDatabase();
    if (!validCandidateInput(input)) {
      return failure(
        "configuration.persistence_conflict",
        "candidate identity does not match the exact validated snapshot",
      );
    }
    try {
      return withTransaction(database, () => {
        const existing = selectCandidate(database, input.identity.candidateKey);
        if (existing !== undefined) {
          return sameCandidate(existing, input)
            ? success(existing, true)
            : failure(
              "configuration.persistence_conflict",
              "candidate key already represents different immutable snapshot facts",
            );
        }
        const collision = database.prepare(`
          SELECT snapshot_digest FROM enterprise_configuration_candidates
          WHERE enterprise_id = ? AND user_id = ? AND device_id = ?
            AND client_instance_id = ? AND snapshot_id = ?
            AND snapshot_revision = ?
        `).get(
          input.identity.scope.enterpriseId,
          input.identity.scope.userId,
          input.identity.scope.deviceId,
          input.identity.scope.clientInstanceId,
          input.identity.snapshotId,
          input.identity.snapshotRevision,
        ) as Record<string, unknown> | undefined;
        if (collision !== undefined
          && collision.snapshot_digest !== input.identity.snapshotDigest) {
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
        insertCandidate(database, candidate);
        return success(candidate, false);
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async storeValidatedPackage(
    input: StoreEnterpriseConfigurationPackageInput,
  ): Promise<EnterpriseConfigurationWriteResult<EnterpriseConfigurationCandidate>> {
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const candidate = selectCandidate(database, input.candidateKey);
        if (candidate === undefined) {
          return failure("configuration.candidate_not_found", "configuration candidate does not exist");
        }
        if (!sameEnterpriseIdentityScope(candidate.identity.scope, input.scope)) {
          return failure("configuration.scope_mismatch", "candidate belongs to another enterprise scope");
        }
        if (candidate.status !== "staging") {
          return failure("configuration.persistence_conflict", "sealed candidate cannot accept packages");
        }
        const existing = candidate.packages.find((item) =>
          item.reference.kind === input.package.reference.kind
          && item.reference.packageId === input.package.reference.packageId);
        if (existing !== undefined) {
          return existing.reference.revision === input.package.reference.revision
            && existing.reference.digest === input.package.reference.digest
            && existing.document.packageDigest
              === input.package.document.packageDigest
            ? success(candidate, true)
            : failure(
              "configuration.persistence_conflict",
              "candidate package identity already maps to different content",
            );
        }
        database.prepare(`
          INSERT INTO enterprise_configuration_candidate_packages (
            candidate_key, kind, package_id, package_revision,
            package_digest, package_json
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          input.candidateKey,
          input.package.reference.kind,
          input.package.reference.packageId,
          input.package.reference.revision,
          input.package.reference.digest,
          JSON.stringify(input.package),
        );
        const updated: EnterpriseConfigurationCandidate = {
          ...candidate,
          packages: [...candidate.packages, input.package],
        };
        return success(updated, false);
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async sealCandidate(
    input: SealEnterpriseConfigurationCandidateInput,
  ): Promise<EnterpriseConfigurationWriteResult<EnterpriseConfigurationCandidate>> {
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const candidate = selectCandidate(database, input.candidateKey);
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
          || input.configuration.identity.snapshotDigest
            !== candidate.identity.snapshotDigest
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
        if (!samePackageClosure(candidate, input.configuration.packages)) {
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
        database.prepare(`
          UPDATE enterprise_configuration_candidates
          SET status = 'sealed', sealed_at = ?,
            materialization_digest = ?, materialized_bytes = ?
          WHERE candidate_key = ?
        `).run(
          input.configuration.sealedAt,
          input.configuration.materializationDigest,
          input.configuration.materializedBytes,
          input.candidateKey,
        );
        return success(sealed, false);
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async activateSealedCandidate(
    input: ActivateEnterpriseConfigurationCandidateInput,
  ): Promise<EnterpriseConfigurationWriteResult<ActivatedEnterpriseConfiguration>> {
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const candidate = selectCandidate(database, input.candidateKey);
        if (candidate === undefined) {
          return failure("configuration.candidate_not_found", "configuration candidate does not exist");
        }
        if (!sameEnterpriseIdentityScope(candidate.identity.scope, input.scope)) {
          return failure("configuration.scope_mismatch", "candidate belongs to another enterprise scope");
        }
        if (candidate.status !== "sealed" || candidate.configuration === undefined) {
          return failure("configuration.candidate_not_sealed", "configuration candidate is not sealed");
        }
        const pointers = selectPointers(database, input.scope);
        if (pointers?.activeCandidateKey === input.candidateKey) {
          const active = selectActivation(database, input.candidateKey);
          return active === undefined
            ? failure("configuration.persistence_unavailable", "active configuration record is missing")
            : success(active, true);
        }
        const current = selectActivation(database, pointers?.activeCandidateKey);
        if (current === undefined) {
          if (input.expectedActiveRevision !== undefined) {
            return failure("configuration.activation_conflict", "expected active revision does not exist");
          }
        } else if (
          input.expectedActiveRevision === undefined
          || input.expectedActiveRevision
            !== current.configuration.identity.snapshotRevision
        ) {
          return failure("configuration.activation_conflict", "active revision changed before activation");
        }
        this.#faultInjector?.("before_activation_commit");
        const activation: ActivatedEnterpriseConfiguration = {
          configuration: candidate.configuration,
          storageActivatedAt: input.activatedAt,
        };
        database.prepare(`
          INSERT INTO enterprise_configuration_activations (
            candidate_key, storage_activated_at
          ) VALUES (?, ?)
        `).run(
          input.candidateKey,
          input.activatedAt,
        );
        const sequence = (pointers?.eventSequence ?? 0) + 1;
        upsertPointers(database, input, pointers, sequence);
        const event: EnterpriseConfigurationStatusEvent = {
          scope: input.scope,
          sequence,
          type: "storage_activated",
          storageActiveRevision: candidate.identity.snapshotRevision,
          storageActiveDigest: candidate.identity.snapshotDigest,
          ...(current === undefined
            ? {}
            : {
              previousStorageRevision:
                current.configuration.identity.snapshotRevision,
            }),
          occurredAt: input.activatedAt,
        };
        database.prepare(`
          INSERT INTO enterprise_configuration_status_events (
            scope_key, sequence, event_json, occurred_at
          ) VALUES (?, ?, ?, ?)
        `).run(
          scopeKey(input.scope),
          sequence,
          JSON.stringify(event),
          input.activatedAt,
        );
        return success(activation, false);
      }, () => this.#faultInjector?.("after_activation_commit_before_response"));
    } catch (error) {
      if (error instanceof InjectedPostCommitFailure) throw error.cause;
      return sqliteFailure(error);
    }
  }

  async discardUnsealedCandidate(
    candidateKey: string,
    scope: EnterpriseIdentityScope,
  ): Promise<EnterpriseConfigurationWriteResult<boolean>> {
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const candidate = selectCandidate(database, candidateKey);
        if (candidate === undefined) return success(false, true);
        if (!sameEnterpriseIdentityScope(candidate.identity.scope, scope)) {
          return failure("configuration.scope_mismatch", "candidate belongs to another enterprise scope");
        }
        if (candidate.status === "sealed") {
          return failure("configuration.persistence_conflict", "sealed candidate cannot be discarded");
        }
        database.prepare(`
          DELETE FROM enterprise_configuration_candidates
          WHERE candidate_key = ?
        `).run(candidateKey);
        return success(true, false);
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async loadStatusEventsAfter(
    scope: EnterpriseIdentityScope,
    sequence: number,
  ): Promise<readonly EnterpriseConfigurationStatusEvent[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT event_json FROM enterprise_configuration_status_events
      WHERE scope_key = ? AND sequence > ? ORDER BY sequence
    `).all(scopeKey(scope), sequence) as Record<string, unknown>[];
    return rows.map((row) => JSON.parse(
      requireString(row.event_json, "event_json"),
    ) as EnterpriseConfigurationStatusEvent);
  }

  async loadSyncFacts(
    scope: EnterpriseIdentityScope,
  ): Promise<EnterpriseConfigurationSyncFacts> {
    const row = this.#requireDatabase().prepare(`
      SELECT last_successful_sync_at, last_error_code
      FROM enterprise_configuration_scope_pointers WHERE scope_key = ?
    `).get(scopeKey(scope)) as Record<string, unknown> | undefined;
    return row === undefined
      ? {}
      : {
        ...(typeof row.last_successful_sync_at === "string"
          ? { lastSuccessfulSyncAt: row.last_successful_sync_at }
          : {}),
        ...(typeof row.last_error_code === "string"
          ? { lastErrorCode: row.last_error_code }
          : {}),
      };
  }

  async recordSyncOutcome(
    input: RecordEnterpriseConfigurationSyncOutcomeInput,
  ): Promise<EnterpriseConfigurationWriteResult<EnterpriseConfigurationSyncFacts>> {
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
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const pointers = selectPointers(database, input.scope);
        const previousFacts = selectSyncFacts(database, input.scope);
        const sequence = (pointers?.eventSequence ?? 0) + 1;
        const facts: EnterpriseConfigurationSyncFacts =
          input.outcome === "succeeded"
            ? { lastSuccessfulSyncAt: input.occurredAt }
            : {
              ...previousFacts,
              lastErrorCode: input.errorCode as string,
            };
        database.prepare(`
          INSERT INTO enterprise_configuration_scope_pointers (
            scope_key, enterprise_id, user_id, device_id, client_instance_id,
            active_candidate_key, previous_candidate_key, event_sequence,
            updated_at, last_successful_sync_at, last_error_code
          ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
          ON CONFLICT(scope_key) DO UPDATE SET
            event_sequence = excluded.event_sequence,
            updated_at = excluded.updated_at,
            last_successful_sync_at = excluded.last_successful_sync_at,
            last_error_code = excluded.last_error_code
        `).run(
          scopeKey(input.scope),
          input.scope.enterpriseId,
          input.scope.userId,
          input.scope.deviceId,
          input.scope.clientInstanceId,
          sequence,
          input.occurredAt,
          facts.lastSuccessfulSyncAt ?? null,
          facts.lastErrorCode ?? null,
        );
        const event: EnterpriseConfigurationStatusEvent = {
          scope: input.scope,
          sequence,
          type: input.outcome === "succeeded"
            ? "sync_succeeded"
            : "sync_failed",
          ...(input.errorCode === undefined
            ? {}
            : { errorCode: input.errorCode }),
          occurredAt: input.occurredAt,
        };
        database.prepare(`
          INSERT INTO enterprise_configuration_status_events (
            scope_key, sequence, event_json, occurred_at
          ) VALUES (?, ?, ?, ?)
        `).run(
          scopeKey(input.scope),
          sequence,
          JSON.stringify(event),
          input.occurredAt,
        );
        return success(facts, false);
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async diagnostics(
    scope: EnterpriseIdentityScope,
  ): Promise<EnterpriseConfigurationDiagnostics> {
    const database = this.#requireDatabase();
    const counts = database.prepare(`
      SELECT COUNT(*) AS candidate_count,
        SUM(CASE WHEN status = 'staging' THEN 1 ELSE 0 END) AS unsealed_count,
        SUM(CASE WHEN status = 'sealed' THEN 1 ELSE 0 END) AS sealed_count,
        COALESCE(SUM(materialized_bytes), 0) AS materialized_bytes,
        MIN(sealed_at) AS oldest_sealed_at
      FROM enterprise_configuration_candidates
      WHERE enterprise_id = ? AND user_id = ? AND device_id = ?
        AND client_instance_id = ?
    `).get(
      scope.enterpriseId,
      scope.userId,
      scope.deviceId,
      scope.clientInstanceId,
    ) as Record<string, unknown>;
    const pointers = selectPointers(database, scope);
    return {
      scope,
      candidateCount: requireNumber(counts.candidate_count, "candidate_count"),
      unsealedCandidateCount:
        requireNumber(counts.unsealed_count ?? 0, "unsealed_count"),
      sealedGenerationCount:
        requireNumber(counts.sealed_count ?? 0, "sealed_count"),
      materializedBytes:
        requireNumber(counts.materialized_bytes, "materialized_bytes"),
      ...(typeof counts.oldest_sealed_at === "string"
        ? { oldestSealedAt: counts.oldest_sealed_at }
        : {}),
      ...(pointers?.activeCandidateKey === undefined
        ? {}
        : { activeCandidateKey: pointers.activeCandidateKey }),
      ...(pointers?.previousCandidateKey === undefined
        ? {}
        : { previousCandidateKey: pointers.previousCandidateKey }),
    };
  }

  #requireDatabase(): DatabaseSync {
    if (this.#database === undefined) {
      throw new Error("enterprise configuration SQLite persistence is not started");
    }
    return this.#database;
  }
}

type PointerRow = {
  activeCandidateKey?: string;
  previousCandidateKey?: string;
  eventSequence: number;
};

function selectSyncFacts(
  database: DatabaseSync,
  scope: EnterpriseIdentityScope,
): EnterpriseConfigurationSyncFacts {
  const row = database.prepare(`
    SELECT last_successful_sync_at, last_error_code
    FROM enterprise_configuration_scope_pointers WHERE scope_key = ?
  `).get(scopeKey(scope)) as Record<string, unknown> | undefined;
  return row === undefined
    ? {}
    : {
      ...(typeof row.last_successful_sync_at === "string"
        ? { lastSuccessfulSyncAt: row.last_successful_sync_at }
        : {}),
      ...(typeof row.last_error_code === "string"
        ? { lastErrorCode: row.last_error_code }
        : {}),
    };
}

function selectCandidate(
  database: DatabaseSync,
  candidateKey: string,
): EnterpriseConfigurationCandidate | undefined {
  const row = database.prepare(`
    SELECT candidate_json, status, sealed_at, materialization_digest,
      materialized_bytes
    FROM enterprise_configuration_candidates
    WHERE candidate_key = ?
  `).get(candidateKey) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const header = JSON.parse(
    requireString(row.candidate_json, "candidate_json"),
  ) as CandidateHeader;
  const packages = (database.prepare(`
    SELECT package_json
    FROM enterprise_configuration_candidate_packages
    WHERE candidate_key = ? ORDER BY kind, package_id
  `).all(candidateKey) as Record<string, unknown>[]).map((packageRow) =>
    JSON.parse(requireString(packageRow.package_json, "package_json")) as
      EnterpriseConfigurationCandidate["packages"][number]);
  const status = requireString(row.status, "status");
  if (status !== "staging" && status !== "sealed") {
    throw new Error("candidate status is invalid");
  }
  const candidateBase = {
    ...header,
    status: status as EnterpriseConfigurationCandidate["status"],
    packages,
  };
  if (status === "staging") return candidateBase;
  const sealedAt = requireString(row.sealed_at, "sealed_at");
  return {
    ...candidateBase,
    configuration: {
      identity: header.identity,
      compatibility: {
        contractVersion: header.snapshot.document.contractVersion,
        schemaVersion: header.snapshot.document.schemaVersion,
        minimumDesktopVersion:
          header.snapshot.document.minimumDesktopVersion,
        minimumCoreVersion: header.snapshot.document.minimumCoreVersion,
      },
      snapshot: header.snapshot.document,
      ...(header.snapshot.etag === undefined
        ? {}
        : { snapshotEtag: header.snapshot.etag }),
      packages,
      materializationDigest: requireString(
        row.materialization_digest,
        "materialization_digest",
      ),
      materializedBytes: requireNumber(
        row.materialized_bytes,
        "materialized_bytes",
      ),
      sealedAt,
    },
  };
}

function insertCandidate(
  database: DatabaseSync,
  candidate: EnterpriseConfigurationCandidate,
): void {
  const { identity } = candidate;
  database.prepare(`
    INSERT INTO enterprise_configuration_candidates (
      candidate_key, enterprise_id, user_id, device_id, client_instance_id,
      snapshot_id, snapshot_revision, snapshot_digest, status,
      candidate_json, created_at, sealed_at, materialized_bytes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
  `).run(
    identity.candidateKey,
    identity.scope.enterpriseId,
    identity.scope.userId,
    identity.scope.deviceId,
    identity.scope.clientInstanceId,
    identity.snapshotId,
    identity.snapshotRevision,
    identity.snapshotDigest,
    candidate.status,
    JSON.stringify(candidateHeader(candidate)),
    candidate.createdAt,
  );
}

function selectActivation(
  database: DatabaseSync,
  candidateKey: string | undefined,
): ActivatedEnterpriseConfiguration | undefined {
  if (candidateKey === undefined) return undefined;
  const row = database.prepare(`
    SELECT storage_activated_at FROM enterprise_configuration_activations
    WHERE candidate_key = ?
  `).get(candidateKey) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const candidate = selectCandidate(database, candidateKey);
  if (candidate?.configuration === undefined) {
    throw new Error("activation references a missing sealed candidate");
  }
  return {
    configuration: candidate.configuration,
    storageActivatedAt: requireString(
      row.storage_activated_at,
      "storage_activated_at",
    ),
  };
}

function selectPointers(
  database: DatabaseSync,
  scope: EnterpriseIdentityScope,
): PointerRow | undefined {
  const row = database.prepare(`
    SELECT active_candidate_key, previous_candidate_key, event_sequence
    FROM enterprise_configuration_scope_pointers WHERE scope_key = ?
  `).get(scopeKey(scope)) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  return {
    ...(typeof row.active_candidate_key === "string"
      ? { activeCandidateKey: row.active_candidate_key }
      : {}),
    ...(typeof row.previous_candidate_key === "string"
      ? { previousCandidateKey: row.previous_candidate_key }
      : {}),
    eventSequence: requireNumber(row.event_sequence, "event_sequence"),
  };
}

function upsertPointers(
  database: DatabaseSync,
  input: ActivateEnterpriseConfigurationCandidateInput,
  current: PointerRow | undefined,
  sequence: number,
): void {
  database.prepare(`
    INSERT INTO enterprise_configuration_scope_pointers (
      scope_key, enterprise_id, user_id, device_id, client_instance_id,
      active_candidate_key, previous_candidate_key, event_sequence, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope_key) DO UPDATE SET
      active_candidate_key = excluded.active_candidate_key,
      previous_candidate_key = excluded.previous_candidate_key,
      event_sequence = excluded.event_sequence,
      updated_at = excluded.updated_at
  `).run(
    scopeKey(input.scope),
    input.scope.enterpriseId,
    input.scope.userId,
    input.scope.deviceId,
    input.scope.clientInstanceId,
    input.candidateKey,
    current?.activeCandidateKey ?? null,
    sequence,
    input.activatedAt,
  );
}

function sameCandidate(
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
  packages: NonNullable<
    EnterpriseConfigurationCandidate["configuration"]
  >["packages"],
): boolean {
  const key = (
    item: EnterpriseConfigurationCandidate["packages"][number],
  ): string => `${item.reference.kind}:${item.reference.packageId}`;
  const staged = [...candidate.packages].sort((a, b) => key(a).localeCompare(key(b)));
  const sealed = [...packages].sort((a, b) => key(a).localeCompare(key(b)));
  return staged.length === sealed.length && staged.every((item, index) => {
    const other = sealed[index];
    return other !== undefined
      && item.reference.revision === other.reference.revision
      && item.reference.digest === other.reference.digest
      && item.document.packageDigest === other.document.packageDigest
      && key(item) === key(other);
  });
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
    super("injected failure after enterprise configuration commit");
    this.cause = cause;
  }
}

function rollback(database: DatabaseSync): void {
  try {
    database.exec("ROLLBACK");
  } catch {
    // Preserve the original failure.
  }
}

function success<T>(
  value: T,
  replayed: boolean,
): EnterpriseConfigurationWriteResult<T> {
  return { ok: true, replayed, value };
}

function sqliteFailure(
  _error: unknown,
): EnterpriseConfigurationWriteResult<never> {
  return failure(
    "configuration.persistence_unavailable",
    "enterprise configuration SQLite operation failed",
  );
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

type CandidateHeader = Pick<
  EnterpriseConfigurationCandidate,
  "identity" | "snapshot" | "createdAt"
>;

function candidateHeader(
  candidate: EnterpriseConfigurationCandidate,
): CandidateHeader {
  return {
    identity: candidate.identity,
    snapshot: candidate.snapshot,
    createdAt: candidate.createdAt,
  };
}
