import type { DatabaseSync } from "node:sqlite";

import type { Clock } from "../../ports/clock.js";
import { LATEST_SQLITE_SCHEMA_VERSION, sqliteMigrations } from "./migrations.js";

export function configureSqlite(database: DatabaseSync): void {
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA synchronous = FULL");
}

export function migrateAndPreflight(database: DatabaseSync, clock: Clock): void {
  const current = readSchemaVersion(database);
  if (current > LATEST_SQLITE_SCHEMA_VERSION) {
    throw new Error(
      `SQLite schema ${current} is newer than supported ${LATEST_SQLITE_SCHEMA_VERSION}`,
    );
  }
  if (current > 0) {
    verifyMigrationPrerequisites(database);
  }

  for (const migration of sqliteMigrations) {
    if (migration.id <= current) {
      continue;
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration.sql);
      database.prepare(
        "INSERT INTO schema_migrations (migration_id, name, applied_at) VALUES (?, ?, ?)",
      ).run(migration.id, migration.name, clock.now());
      database.exec("COMMIT");
    } catch (error) {
      rollback(database);
      throw error;
    }
  }

  const migrated = readSchemaVersion(database);
  if (migrated !== LATEST_SQLITE_SCHEMA_VERSION) {
    throw new Error(
      `SQLite schema preflight expected ${LATEST_SQLITE_SCHEMA_VERSION}, received ${migrated}`,
    );
  }
  verifyMigrationHistory(database);
  verifyRequiredSchema(database);
}

function verifyMigrationPrerequisites(database: DatabaseSync): void {
  const requiredBaseTables = ["task_heads", "task_checkpoints", "task_events", "command_receipts", "effect_attempts", "outbox"];
  for (const table of requiredBaseTables) {
    const exists = database.prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table);
    if (exists === undefined) {
      throw new Error(`SQLite schema is missing required table ${table}`);
    }
  }
}

export function readSchemaVersion(database: DatabaseSync): number {
  const table = database.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
  ).get() as Record<string, unknown> | undefined;
  if (table === undefined) {
    return 0;
  }
  const row = database.prepare(
    "SELECT COALESCE(MAX(migration_id), 0) AS version FROM schema_migrations",
  ).get() as Record<string, unknown> | undefined;
  const version = row?.version;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) {
    throw new Error("SQLite schema_migrations contains an invalid version");
  }
  return version;
}

function rollback(database: DatabaseSync): void {
  try {
    database.exec("ROLLBACK");
  } catch {
    // Preserve the original migration failure.
  }
}

const requiredColumns: Readonly<Record<string, readonly string[]>> = {
  schema_migrations: ["migration_id", "name", "applied_at"],
  task_heads: ["task_id", "state_revision", "last_event_sequence", "latest_checkpoint_id"],
  task_checkpoints: ["checkpoint_id", "task_id", "state_revision", "state_json"],
  task_events: ["event_id", "task_id", "sequence", "event_json"],
  command_receipts: ["command_id", "command_digest", "outcome", "receipt_json"],
  effect_attempts: ["effect_attempt_id", "idempotency_key", "status", "attempt_json"],
  outbox: [
    "outbox_id",
    "event_id",
    "task_event_id",
    "session_event_id",
    "task_id",
    "session_id",
    "destination",
    "next_attempt_at",
    "record_json",
  ],
  task_capability_locks: [
    "lock_id",
    "task_id",
    "capability_id",
    "registry_revision",
    "definition_revision",
    "binding_revision",
    "adapter_descriptor_revision",
    "lock_json",
  ],
  user_confirmations: [
    "confirmation_id",
    "task_id",
    "scope_digest",
    "status",
    "request_json",
    "decision_json",
  ],
  session_heads: [
    "session_id",
    "message_sequence",
    "session_event_sequence",
    "context_revision",
    "active_compaction_id",
    "head_json",
  ],
  conversation_messages: [
    "message_id",
    "session_id",
    "sequence",
    "message_schema_version",
    "message_digest",
    "message_json",
    "content_json",
  ],
  session_events: [
    "event_id",
    "session_id",
    "sequence",
    "compaction_job_id",
    "event_json",
  ],
  session_command_receipts: [
    "command_id",
    "session_id",
    "compaction_job_id",
    "command_digest",
    "receipt_json",
  ],
  compaction_jobs: [
    "compaction_job_id",
    "compaction_id",
    "session_id",
    "status",
    "source_digest",
    "base_context_revision",
    "job_json",
  ],
  compaction_records: [
    "compaction_id",
    "compaction_job_id",
    "session_id",
    "source_digest",
    "record_json",
  ],
  compaction_execution_bindings: [
    "compaction_job_id",
    "session_id",
    "task_id",
    "runtime_selection_id",
    "runtime_selection_digest",
    "model_lock_id",
    "model_capability_id",
    "model_lock_digest",
    "registry_revision",
    "adapter_descriptor_id",
    "adapter_descriptor_revision",
    "external_target_digest",
    "summarizer_prompt_revision",
    "binding_digest",
    "created_at",
    "binding_json",
  ],
  compaction_model_invocation_links: [
    "compaction_job_id",
    "client_request_id",
    "model_request_id",
    "model_request_digest",
    "execution_binding_digest",
    "confirmation_id",
    "scope_digest",
    "data_scope_digest",
    "invocation_id",
    "status_revision",
    "durable_cursor",
    "accepted_at",
    "output_started_at",
    "summary_committed_at",
    "record_digest",
    "created_at",
    "updated_at",
    "record_json",
  ],
  desktop_workspace_grants: [
    "workspace_grant_id",
    "status",
    "created_at",
    "record_json",
  ],
  desktop_session_metadata: [
    "desktop_session_id",
    "internal_session_id",
    "revision",
    "tombstoned",
    "updated_at",
    "record_json",
  ],
  desktop_session_create_intents: [
    "command_id",
    "request_digest",
    "internal_session_id",
    "desktop_session_id",
    "prepared_at",
    "intent_json",
  ],
  desktop_command_receipts: [
    "command_id",
    "command_type",
    "request_digest",
    "resource_id",
    "committed_at",
    "receipt_json",
  ],
  task_runtime_selections: [
    "runtime_selection_id",
    "task_id",
    "selection_digest",
    "agent_definition_id",
    "agent_revision",
    "registry_revision",
    "created_at",
    "selection_json",
  ],
  task_authorization_selections: [
    "task_id",
    "runtime_selection_id",
    "runtime_selection_digest",
    "requested_mode",
    "resolved_mode",
    "policy_revision",
    "resolution_source",
    "authorization_selection_digest",
    "execution_selection_digest",
    "created_at",
    "record_json",
  ],
  conversation_message_intents: [
    "message_id",
    "session_id",
    "task_id",
    "message_digest",
    "intent_json",
  ],
  tool_call_batches: [
    "batch_id",
    "session_id",
    "task_id",
    "run_id",
    "assistant_message_id",
    "assistant_message_sequence",
    "assistant_message_digest",
    "batch_digest",
    "call_count",
    "created_at",
    "record_json",
  ],
  tool_call_dispositions: [
    "batch_id",
    "tool_call_id",
    "action_id",
    "ordinal",
    "disposition",
    "revision",
    "confirmation_id",
    "effect_attempt_id",
    "result_message_id",
    "result_digest",
    "updated_at",
    "record_json",
  ],
  task_submit_turn_bindings: [
    "submit_turn_command_id",
    "task_id",
    "user_message_id",
    "runtime_selection_id",
    "bundle_digest",
    "binding_json",
  ],
  submit_turn_records: [
    "submit_turn_command_id",
    "client_turn_id",
    "status",
    "request_digest",
    "internal_session_id",
    "internal_task_id",
    "record_json",
  ],
  submit_turn_receipts: [
    "submit_turn_command_id",
    "status",
    "completed_at",
    "receipt_json",
  ],
  desktop_delivery_records: [
    "delivery_sequence",
    "delivery_id",
    "submit_turn_command_id",
    "type",
    "delivery_json",
  ],
  model_invocation_links: [
    "client_request_id",
    "task_id",
    "run_id",
    "step_id",
    "action_id",
    "round",
    "runtime_selection_digest",
    "assistant_message_id",
    "model_request_id",
    "model_request_digest",
    "confirmation_id",
    "scope_digest",
    "data_scope_digest",
    "central_accept_request_digest",
    "invocation_id",
    "status_revision",
    "durable_cursor",
    "accepted_at",
    "output_started_at",
    "message_committed_at",
    "record_digest",
    "record_json",
  ],
  artifact_lifecycle_records: [
    "artifact_id",
    "task_id",
    "source_digest",
    "pinned",
    "dismissed",
    "updated_at",
    "record_json",
  ],
  manual_artifact_registrations: [
    "artifact_id",
    "workspace_grant_id",
    "relative_path",
    "source_digest",
    "file_sha256",
    "byte_size",
    "media_type",
    "created_at",
    "record_json",
  ],
  provider_usage_projections: [
    "invocation_kind",
    "invocation_link_id",
    "session_id",
    "usage_event_id",
    "usage_event_digest",
    "record_digest",
    "record_json",
  ],
  prompt_cache_scope_namespaces: [
    "namespace_revision",
    "cache_execution_authority",
    "namespace_key",
    "status",
    "created_at",
    "record_digest",
    "record_json",
  ],
  model_invocation_cache_contexts: [
    "invocation_kind",
    "invocation_link_id",
    "cache_execution_authority",
    "session_scope_digest",
    "scope_namespace_revision",
    "cache_context_digest",
    "gateway_contract_version",
    "record_digest",
    "created_at",
    "record_json",
  ],
  personal_model_owner_scope_namespaces: [
    "namespace_revision",
    "namespace_key",
    "namespace_key_check_digest",
    "status",
    "created_at",
    "record_json",
    "record_digest",
  ],
  personal_model_definitions: [
    "owner_scope_namespace_revision",
    "owner_scope_digest",
    "personal_model_id",
    "configuration_revision",
    "execution_definition_digest",
    "provider_kind",
    "provider_profile_revision",
    "protocol",
    "canonical_endpoint",
    "endpoint_identity_digest",
    "provider_model_id",
    "display_name",
    "capabilities_json",
    "credential_ref",
    "credential_revision",
    "credential_binding_digest",
    "record_json",
    "record_digest",
    "created_at",
  ],
  personal_model_heads: [
    "owner_scope_namespace_revision",
    "owner_scope_digest",
    "personal_model_id",
    "current_configuration_revision",
    "current_execution_definition_digest",
    "head_revision",
    "selection_state",
    "updated_at",
    "record_json",
    "record_digest",
  ],
  personal_model_status_facts: [
    "owner_scope_namespace_revision",
    "owner_scope_digest",
    "personal_model_id",
    "configuration_revision",
    "execution_definition_digest",
    "status_revision",
    "status",
    "detail_code",
    "detail_digest",
    "status_origin",
    "carried_from_configuration_revision",
    "carried_from_status_revision",
    "carried_from_status_record_digest",
    "updated_at",
    "record_json",
    "record_digest",
  ],
  personal_model_preferences: [
    "owner_scope_namespace_revision",
    "owner_scope_digest",
    "model_source",
    "model_id",
    "configuration_revision",
    "preference_revision",
    "updated_at",
    "record_json",
    "record_digest",
  ],
  personal_model_operations: [
    "owner_scope_namespace_revision",
    "owner_scope_digest",
    "command_id",
    "operation_type",
    "request_digest",
    "target_model_id",
    "expected_configuration_revision",
    "expected_execution_definition_digest",
    "target_configuration_revision",
    "target_execution_definition_digest",
    "target_credential_ref",
    "previous_credential_ref",
    "operation_phase",
    "phase_revision",
    "credential_observation_json",
    "credential_observation_digest",
    "recovery_error_code",
    "recovery_error_digest",
    "created_at",
    "updated_at",
    "record_json",
    "record_digest",
  ],
  personal_model_command_receipts: [
    "owner_scope_namespace_revision",
    "owner_scope_digest",
    "command_id",
    "command_type",
    "request_digest",
    "model_id",
    "committed_configuration_revision",
    "outcome",
    "committed_at",
    "receipt_json",
    "receipt_digest",
  ],
  local_personal_model_invocation_links: [
    "invocation_kind", "invocation_link_id", "authority_invocation_id", "session_id", "task_id",
    "run_id", "round", "task_runtime_selection_id", "task_runtime_selection_digest",
    "model_lock_id", "model_lock_digest", "owner_scope_namespace_revision", "owner_scope_digest",
    "personal_model_id", "configuration_revision", "execution_definition_digest",
    "provider_profile_revision", "endpoint_identity_digest", "credential_binding_digest",
    "model_request_digest", "admission_scope_digest", "status", "fencing_epoch",
    "output_started_at", "terminal_at", "terminal_class", "typed_error_code",
    "created_at", "updated_at", "record_json", "record_digest",
  ],
  local_personal_provider_usage_facts: [
    "authority_invocation_id", "provider_attempt_key", "fencing_epoch", "state",
    "usage_digest", "fact_json", "created_at", "updated_at",
  ],
  desktop_experience_owner_scope_namespaces: [
    "owner_scope_namespace_revision", "namespace_key", "namespace_key_check_digest",
    "lifecycle_state", "created_at", "record_json", "record_digest",
  ],
  desktop_reasoning_mode_preferences: [
    "owner_scope_namespace_revision", "owner_scope_digest", "preference_revision",
    "requested_mode", "updated_at", "record_json", "record_digest",
  ],
  desktop_reasoning_mode_preference_receipts: [
    "owner_scope_namespace_revision", "owner_scope_digest", "command_id", "request_digest",
    "expected_preference_revision", "committed_preference_revision", "requested_mode",
    "outcome", "committed_at", "receipt_json", "receipt_digest",
  ],
};

const requiredIndexes = [
  "conversation_messages_range_idx",
  "conversation_messages_task_idx",
  "session_events_session_idx",
  "compaction_jobs_recovery_idx",
  "compaction_jobs_one_pending_per_session_idx",
  "compaction_records_source_idx",
  "compaction_execution_bindings_recovery_idx",
  "compaction_model_invocation_links_recovery_idx",
  "outbox_pending_idx",
  "desktop_workspace_grants_list_idx",
  "desktop_session_metadata_list_idx",
  "desktop_session_create_intents_resource_idx",
  "task_runtime_selections_agent_idx",
  "task_authorization_selections_policy_idx",
  "conversation_message_intents_session_idx",
  "tool_call_batches_recovery_idx",
  "tool_call_dispositions_recovery_idx",
  "submit_turn_records_recovery_idx",
  "desktop_delivery_records_cursor_idx",
  "model_invocation_links_recovery_idx",
  "model_invocation_links_task_idx",
  "artifact_lifecycle_task_idx",
  "manual_artifact_registrations_created_idx",
  "provider_usage_projections_session_idx",
  "prompt_cache_scope_namespaces_one_active_idx",
  "model_invocation_cache_contexts_namespace_idx",
  "personal_model_owner_scope_one_active_idx",
  "personal_model_definitions_owner_created_idx",
  "personal_model_heads_active_idx",
  "personal_model_status_latest_idx",
  "personal_model_operations_pending_idx",
  "personal_model_receipts_committed_idx",
  "local_personal_model_invocations_pending_idx",
  "local_personal_model_invocations_model_idx",
  "local_personal_provider_usage_state_idx",
  "desktop_experience_owner_scope_one_active_idx",
  "desktop_reasoning_mode_preference_receipts_committed_idx",
] as const;

function verifyRequiredSchema(database: DatabaseSync): void {
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const exists = database.prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table);
    if (exists === undefined) {
      throw new Error(`SQLite schema is missing required table ${table}`);
    }
    const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[];
    const actual = new Set(rows.map((row) => row.name).filter((name): name is string => typeof name === "string"));
    for (const column of columns) {
      if (!actual.has(column)) {
        throw new Error(`SQLite schema is missing required column ${table}.${column}`);
      }
    }
  }
  for (const index of requiredIndexes) {
    const row = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
    ).get(index) as Record<string, unknown> | undefined;
    if (typeof row?.sql !== "string") {
      throw new Error(`SQLite schema is missing required index ${index}`);
    }
  }
  const pendingIndex = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'compaction_jobs_one_pending_per_session_idx'",
  ).get() as Record<string, unknown> | undefined;
  const pendingSql = typeof pendingIndex?.sql === "string"
    ? pendingIndex.sql.toLowerCase().replaceAll(/\s+/g, " ")
    : "";
  if (!pendingSql.includes("unique index") || !pendingSql.includes("where status = 'pending'")) {
    throw new Error("SQLite pending compaction index is not partial and unique");
  }
  const personalModelNamespaceIndex = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'personal_model_owner_scope_one_active_idx'",
  ).get() as Record<string, unknown> | undefined;
  const personalModelNamespaceSql = typeof personalModelNamespaceIndex?.sql === "string"
    ? personalModelNamespaceIndex.sql.toLowerCase().replaceAll(/\s+/g, " ")
    : "";
  if (!personalModelNamespaceSql.includes("unique index")
    || !personalModelNamespaceSql.includes("where status = 'active'")) {
    throw new Error("SQLite Personal Model active owner namespace index is not partial and unique");
  }
  verifyPersonalModelSchema(database);
  verifyLocalPersonalModelInvocationSchema(database);
  verifyDesktopReasoningModeSchema(database);
  const integrity = database.prepare("PRAGMA integrity_check").get() as Record<string, unknown> | undefined;
  if (integrity?.integrity_check !== "ok") {
    throw new Error("SQLite integrity_check failed");
  }
  const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyFailures.length !== 0) {
    throw new Error("SQLite foreign_key_check failed");
  }
}

function verifyDesktopReasoningModeSchema(database: DatabaseSync): void {
  for (const table of [
    "desktop_experience_owner_scope_namespaces",
    "desktop_reasoning_mode_preferences",
    "desktop_reasoning_mode_preference_receipts",
  ] as const) {
    const row = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table) as Record<string, unknown> | undefined;
    const sql = typeof row?.sql === "string" ? row.sql.toLowerCase().replaceAll(/\s+/g, " ") : "";
    if (!sql.endsWith(" strict") || !sql.includes("check(")) {
      throw new Error(`SQLite Reasoning Mode table ${table} must be STRICT and constrained`);
    }
  }
  const activeIndex = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'desktop_experience_owner_scope_one_active_idx'",
  ).get() as Record<string, unknown> | undefined;
  const activeSql = typeof activeIndex?.sql === "string"
    ? activeIndex.sql.toLowerCase().replaceAll(/\s+/g, " ")
    : "";
  if (!activeSql.includes("unique index") || !activeSql.includes("where lifecycle_state = 'active'")) {
    throw new Error("SQLite Reasoning Mode active owner namespace index is not partial and unique");
  }
  const pkShapes: Readonly<Record<string, readonly string[]>> = {
    desktop_experience_owner_scope_namespaces: ["owner_scope_namespace_revision"],
    desktop_reasoning_mode_preferences: ["owner_scope_namespace_revision", "owner_scope_digest"],
    desktop_reasoning_mode_preference_receipts: [
      "owner_scope_namespace_revision", "owner_scope_digest", "command_id",
    ],
  };
  for (const [table, expected] of Object.entries(pkShapes)) {
    const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[];
    const actual = rows.filter((row) => typeof row.pk === "number" && row.pk > 0)
      .sort((left, right) => Number(left.pk) - Number(right.pk))
      .map((row) => row.name);
    if (actual.length !== expected.length || expected.some((column, index) => actual[index] !== column)) {
      throw new Error(`SQLite Reasoning Mode table ${table} primary key shape is invalid`);
    }
  }
  for (const table of [
    "desktop_reasoning_mode_preferences",
    "desktop_reasoning_mode_preference_receipts",
  ] as const) {
    const targets = new Set(
      (database.prepare(`PRAGMA foreign_key_list(${table})`).all() as Record<string, unknown>[])
        .map((row) => row.table),
    );
    if (!targets.has("desktop_experience_owner_scope_namespaces")) {
      throw new Error(`SQLite Reasoning Mode table ${table} is missing owner namespace FK`);
    }
  }
}

function verifyLocalPersonalModelInvocationSchema(database: DatabaseSync): void {
  for (const table of [
    "local_personal_model_invocation_links",
    "local_personal_provider_usage_facts",
  ] as const) {
    const row = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table) as Record<string, unknown> | undefined;
    const sql = typeof row?.sql === "string" ? row.sql.toLowerCase().replaceAll(/\s+/g, " ") : "";
    if (!sql.endsWith(" strict") || !sql.includes("check(")) {
      throw new Error(`SQLite local Personal Model table ${table} must be STRICT and constrained`);
    }
  }
  const linkForeignKeys = database.prepare(
    "PRAGMA foreign_key_list(local_personal_model_invocation_links)",
  ).all() as Record<string, unknown>[];
  if (!linkForeignKeys.some((row) => row.table === "personal_model_definitions")) {
    throw new Error("SQLite local invocation link is missing immutable definition FK");
  }
  const usageForeignKeys = database.prepare(
    "PRAGMA foreign_key_list(local_personal_provider_usage_facts)",
  ).all() as Record<string, unknown>[];
  if (!usageForeignKeys.some((row) => row.table === "local_personal_model_invocation_links")) {
    throw new Error("SQLite local Usage fact is missing invocation FK");
  }
}

function verifyPersonalModelSchema(database: DatabaseSync): void {
  const strictTables = [
    "personal_model_owner_scope_namespaces",
    "personal_model_definitions",
    "personal_model_heads",
    "personal_model_status_facts",
    "personal_model_preferences",
    "personal_model_operations",
    "personal_model_command_receipts",
  ] as const;
  for (const table of strictTables) {
    const row = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table) as Record<string, unknown> | undefined;
    const sql = typeof row?.sql === "string" ? row.sql.toLowerCase().replaceAll(/\s+/g, " ") : "";
    if (!sql.endsWith(" strict") || !sql.includes("check(")) {
      throw new Error(`SQLite Personal Model table ${table} must be STRICT and constrained`);
    }
  }

  const requiredForeignKeyTargets: Readonly<Record<string, readonly string[]>> = {
    personal_model_definitions: ["personal_model_owner_scope_namespaces"],
    personal_model_heads: ["personal_model_definitions"],
    personal_model_status_facts: ["personal_model_definitions", "personal_model_status_facts"],
    personal_model_preferences: ["personal_model_owner_scope_namespaces"],
    personal_model_operations: ["personal_model_owner_scope_namespaces"],
    personal_model_command_receipts: ["personal_model_definitions"],
  };
  for (const [table, targets] of Object.entries(requiredForeignKeyTargets)) {
    const rows = database.prepare(`PRAGMA foreign_key_list(${table})`).all() as Record<string, unknown>[];
    const actualTargets = new Set(rows.map((row) => row.table).filter(
      (target): target is string => typeof target === "string",
    ));
    for (const target of targets) {
      if (!actualTargets.has(target)) {
        throw new Error(`SQLite Personal Model table ${table} is missing FK target ${target}`);
      }
    }
  }

  const pkShapes: Readonly<Record<string, readonly string[]>> = {
    personal_model_owner_scope_namespaces: ["namespace_revision"],
    personal_model_definitions: [
      "owner_scope_namespace_revision", "owner_scope_digest", "personal_model_id", "configuration_revision",
    ],
    personal_model_heads: ["owner_scope_namespace_revision", "owner_scope_digest", "personal_model_id"],
    personal_model_status_facts: [
      "owner_scope_namespace_revision", "owner_scope_digest", "personal_model_id",
      "configuration_revision", "status_revision",
    ],
    personal_model_preferences: ["owner_scope_namespace_revision", "owner_scope_digest"],
    personal_model_operations: ["owner_scope_namespace_revision", "owner_scope_digest", "command_id"],
    personal_model_command_receipts: ["owner_scope_namespace_revision", "owner_scope_digest", "command_id"],
  };
  for (const [table, expected] of Object.entries(pkShapes)) {
    const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[];
    const actual = rows.filter((row) => typeof row.pk === "number" && row.pk > 0)
      .sort((left, right) => Number(left.pk) - Number(right.pk))
      .map((row) => row.name);
    if (actual.length !== expected.length || expected.some((column, index) => actual[index] !== column)) {
      throw new Error(`SQLite Personal Model table ${table} primary key shape is invalid`);
    }
  }
}

function verifyMigrationHistory(database: DatabaseSync): void {
  const rows = database.prepare(
    "SELECT migration_id, name FROM schema_migrations ORDER BY migration_id",
  ).all() as Record<string, unknown>[];
  if (rows.length !== sqliteMigrations.length) {
    throw new Error("SQLite schema_migrations is incomplete");
  }
  for (const [index, migration] of sqliteMigrations.entries()) {
    const row = rows[index];
    if (row?.migration_id !== migration.id || row.name !== migration.name) {
      throw new Error(`SQLite migration history mismatch at migration ${migration.id}`);
    }
  }
}
