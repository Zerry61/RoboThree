import type { DatabaseSync } from "node:sqlite";

import type { Clock } from "../../ports/clock.js";
import {
  LATEST_ENTERPRISE_CONFIGURATION_SCHEMA_VERSION,
  enterpriseConfigurationSqliteMigrations,
} from "./enterprise-configuration-migrations.js";

export function configureEnterpriseConfigurationSqlite(
  database: DatabaseSync,
): void {
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA synchronous = FULL");
}

export function migrateAndPreflightEnterpriseConfiguration(
  database: DatabaseSync,
  clock: Clock,
): void {
  const current = readEnterpriseConfigurationSchemaVersion(database);
  if (current > LATEST_ENTERPRISE_CONFIGURATION_SCHEMA_VERSION) {
    throw new Error(
      `Enterprise configuration SQLite schema ${current} is newer than supported ${LATEST_ENTERPRISE_CONFIGURATION_SCHEMA_VERSION}`,
    );
  }
  for (const migration of enterpriseConfigurationSqliteMigrations) {
    if (migration.id <= current) continue;
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration.sql);
      database.prepare(`
        INSERT INTO enterprise_configuration_schema_migrations (
          migration_id, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(migration.id, migration.name, migration.checksum, clock.now());
      database.exec("COMMIT");
    } catch (error) {
      rollback(database);
      throw error;
    }
  }
  verifyEnterpriseConfigurationSchema(database);
}

export function readEnterpriseConfigurationSchemaVersion(
  database: DatabaseSync,
): number {
  const table = database.prepare(`
    SELECT 1 AS present FROM sqlite_master
    WHERE type = 'table'
      AND name = 'enterprise_configuration_schema_migrations'
  `).get();
  if (table === undefined) return 0;
  const row = database.prepare(`
    SELECT COALESCE(MAX(migration_id), 0) AS version
    FROM enterprise_configuration_schema_migrations
  `).get() as Record<string, unknown> | undefined;
  const version = row?.version;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) {
    throw new Error("Enterprise configuration migration version is invalid");
  }
  return version;
}

const requiredColumns: Readonly<Record<string, readonly string[]>> = {
  enterprise_configuration_schema_migrations: [
    "migration_id", "name", "checksum", "applied_at",
  ],
  enterprise_configuration_candidates: [
    "candidate_key", "enterprise_id", "user_id", "device_id",
    "client_instance_id", "snapshot_id", "snapshot_revision",
    "snapshot_digest", "status", "candidate_json", "created_at", "sealed_at",
    "materialization_digest", "materialized_bytes",
  ],
  enterprise_configuration_candidate_packages: [
    "candidate_key", "kind", "package_id", "package_revision",
    "package_digest", "package_json",
  ],
  enterprise_configuration_scope_pointers: [
    "scope_key", "enterprise_id", "user_id", "device_id",
    "client_instance_id", "active_candidate_key", "previous_candidate_key",
    "event_sequence", "updated_at", "last_successful_sync_at",
    "last_error_code",
  ],
  enterprise_configuration_activations: [
    "candidate_key", "storage_activated_at",
  ],
  enterprise_configuration_status_events: [
    "scope_key", "sequence", "event_json", "occurred_at",
  ],
  enterprise_runtime_activation_attempts: [
    "activation_attempt_id", "scope_key", "attempt_sequence",
    "target_candidate_key", "status", "attempt_json", "requested_at",
    "updated_at",
  ],
  enterprise_runtime_active_generations: [
    "scope_key", "candidate_key", "activation_attempt_id",
    "runtime_active_json", "activated_at",
  ],
};

function verifyEnterpriseConfigurationSchema(database: DatabaseSync): void {
  const version = readEnterpriseConfigurationSchemaVersion(database);
  if (version !== LATEST_ENTERPRISE_CONFIGURATION_SCHEMA_VERSION) {
    throw new Error(
      `Enterprise configuration schema expected ${LATEST_ENTERPRISE_CONFIGURATION_SCHEMA_VERSION}, received ${version}`,
    );
  }
  const rows = database.prepare(`
    SELECT migration_id, name, checksum
    FROM enterprise_configuration_schema_migrations
    ORDER BY migration_id
  `).all() as Record<string, unknown>[];
  if (rows.length !== enterpriseConfigurationSqliteMigrations.length) {
    throw new Error("Enterprise configuration migration history is incomplete");
  }
  for (const [index, expected] of enterpriseConfigurationSqliteMigrations.entries()) {
    const row = rows[index];
    if (
      row?.migration_id !== expected.id
      || row.name !== expected.name
      || row.checksum !== expected.checksum
    ) {
      throw new Error(
        `Enterprise configuration migration history mismatch at ${expected.name}`,
      );
    }
  }
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const exists = database.prepare(`
      SELECT 1 AS present FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `).get(table);
    if (exists === undefined) {
      throw new Error(`Enterprise configuration schema is missing table ${table}`);
    }
    const actual = new Set(
      (database.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[])
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string"),
    );
    for (const column of columns) {
      if (!actual.has(column)) {
        throw new Error(
          `Enterprise configuration schema is missing column ${table}.${column}`,
        );
      }
    }
  }
  const integrity = database.prepare("PRAGMA integrity_check").get() as
    Record<string, unknown> | undefined;
  if (integrity?.integrity_check !== "ok") {
    throw new Error("Enterprise configuration SQLite integrity_check failed");
  }
  if (database.prepare("PRAGMA foreign_key_check").all().length !== 0) {
    throw new Error("Enterprise configuration SQLite foreign_key_check failed");
  }
}

function rollback(database: DatabaseSync): void {
  try {
    database.exec("ROLLBACK");
  } catch {
    // Preserve the original migration failure.
  }
}
