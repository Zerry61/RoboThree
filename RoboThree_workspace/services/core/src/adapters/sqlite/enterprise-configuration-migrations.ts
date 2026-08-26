import { createHash } from "node:crypto";

export type EnterpriseConfigurationSqliteMigration = Readonly<{
  id: number;
  name: string;
  sql: string;
  checksum: string;
}>;

const migrationSql = `
  CREATE TABLE enterprise_configuration_schema_migrations (
    migration_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE enterprise_configuration_candidates (
    candidate_key TEXT PRIMARY KEY,
    enterprise_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    client_instance_id TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    snapshot_revision TEXT NOT NULL,
    snapshot_digest TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('staging', 'sealed')),
    candidate_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sealed_at TEXT,
    materialization_digest TEXT,
    materialized_bytes INTEGER CHECK (
      materialized_bytes IS NULL OR materialized_bytes >= 0
    ),
    UNIQUE (
      enterprise_id, user_id, device_id, client_instance_id,
      snapshot_id, snapshot_revision
    )
  ) STRICT;

  CREATE TABLE enterprise_configuration_candidate_packages (
    candidate_key TEXT NOT NULL
      REFERENCES enterprise_configuration_candidates(candidate_key)
      ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('agent', 'skill')),
    package_id TEXT NOT NULL,
    package_revision TEXT NOT NULL,
    package_digest TEXT NOT NULL,
    package_json TEXT NOT NULL,
    PRIMARY KEY (candidate_key, kind, package_id)
  ) STRICT;

  CREATE TABLE enterprise_configuration_scope_pointers (
    scope_key TEXT PRIMARY KEY,
    enterprise_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    client_instance_id TEXT NOT NULL,
    active_candidate_key TEXT
      REFERENCES enterprise_configuration_candidates(candidate_key),
    previous_candidate_key TEXT
      REFERENCES enterprise_configuration_candidates(candidate_key),
    event_sequence INTEGER NOT NULL DEFAULT 0 CHECK (event_sequence >= 0),
    updated_at TEXT NOT NULL,
    UNIQUE (enterprise_id, user_id, device_id, client_instance_id)
  ) STRICT;

  CREATE TABLE enterprise_configuration_activations (
    candidate_key TEXT PRIMARY KEY
      REFERENCES enterprise_configuration_candidates(candidate_key)
      ON DELETE RESTRICT,
    storage_activated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE enterprise_configuration_status_events (
    scope_key TEXT NOT NULL
      REFERENCES enterprise_configuration_scope_pointers(scope_key)
      ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    event_json TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    PRIMARY KEY (scope_key, sequence)
  ) STRICT;

  CREATE INDEX enterprise_configuration_candidates_scope_idx
    ON enterprise_configuration_candidates(
      enterprise_id, user_id, device_id, client_instance_id, status
    );

  CREATE INDEX enterprise_configuration_status_events_scope_idx
    ON enterprise_configuration_status_events(scope_key, sequence);
`;

const syncFactsMigrationSql = `
  ALTER TABLE enterprise_configuration_scope_pointers
    ADD COLUMN last_successful_sync_at TEXT;

  ALTER TABLE enterprise_configuration_scope_pointers
    ADD COLUMN last_error_code TEXT;
`;

const runtimeActivationMigrationSql = `
  CREATE TABLE enterprise_runtime_activation_attempts (
    activation_attempt_id TEXT PRIMARY KEY,
    scope_key TEXT NOT NULL,
    attempt_sequence INTEGER NOT NULL CHECK (attempt_sequence > 0),
    target_candidate_key TEXT NOT NULL
      REFERENCES enterprise_configuration_candidates(candidate_key)
      ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (
      status IN (
        'intent_recorded',
        'restart_requested',
        'internally_ready',
        'completed',
        'failed'
      )
    ),
    attempt_json TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (scope_key, attempt_sequence)
  ) STRICT;

  CREATE TABLE enterprise_runtime_active_generations (
    scope_key TEXT PRIMARY KEY,
    candidate_key TEXT NOT NULL
      REFERENCES enterprise_configuration_candidates(candidate_key)
      ON DELETE RESTRICT,
    activation_attempt_id TEXT NOT NULL
      REFERENCES enterprise_runtime_activation_attempts(activation_attempt_id)
      ON DELETE RESTRICT,
    runtime_active_json TEXT NOT NULL,
    activated_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX enterprise_runtime_activation_attempts_scope_idx
    ON enterprise_runtime_activation_attempts(scope_key, attempt_sequence);
`;

export const enterpriseConfigurationSqliteMigrations:
readonly EnterpriseConfigurationSqliteMigration[] = [
  {
    id: 1,
    name: "enterprise-config-V1",
    sql: migrationSql,
    checksum: createHash("sha256").update(
      `enterprise-config-V1\n${migrationSql}`,
      "utf8",
    ).digest("hex"),
  },
  {
    id: 2,
    name: "enterprise-config-V2",
    sql: syncFactsMigrationSql,
    checksum: createHash("sha256").update(
      `enterprise-config-V2\n${syncFactsMigrationSql}`,
      "utf8",
    ).digest("hex"),
  },
  {
    id: 3,
    name: "enterprise-config-V3-runtime-activation",
    sql: runtimeActivationMigrationSql,
    checksum: createHash("sha256").update(
      `enterprise-config-V3-runtime-activation\n${runtimeActivationMigrationSql}`,
      "utf8",
    ).digest("hex"),
  },
];

export const LATEST_ENTERPRISE_CONFIGURATION_SCHEMA_VERSION = 3;
