export type SqliteMigration = {
  id: number;
  name: string;
  sql: string;
};

export const sqliteMigrations: readonly SqliteMigration[] = [
  {
    id: 1,
    name: "kaf_2_1_task_persistence",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE task_heads (
        task_id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        initialization_digest TEXT NOT NULL,
        state_revision INTEGER NOT NULL CHECK (state_revision >= 0),
        last_event_sequence INTEGER NOT NULL CHECK (last_event_sequence >= 0),
        latest_checkpoint_id TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE task_checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES task_heads(task_id) ON DELETE CASCADE,
        schema_version TEXT NOT NULL,
        state_revision INTEGER NOT NULL CHECK (state_revision >= 0),
        last_event_sequence INTEGER NOT NULL CHECK (last_event_sequence >= 0),
        parent_checkpoint_id TEXT,
        state_digest TEXT NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (task_id, state_revision)
      ) STRICT;

      CREATE TABLE task_events (
        event_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES task_heads(task_id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        causation_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        event_json TEXT NOT NULL,
        UNIQUE (task_id, sequence)
      ) STRICT;

      CREATE TABLE command_receipts (
        command_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES task_heads(task_id) ON DELETE CASCADE,
        command_digest TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
        state_revision INTEGER NOT NULL CHECK (state_revision >= 0),
        received_at TEXT NOT NULL,
        receipt_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE effect_attempts (
        effect_attempt_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES task_heads(task_id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        attempt_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE outbox (
        outbox_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES task_events(event_id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES task_heads(task_id) ON DELETE CASCADE,
        destination TEXT NOT NULL,
        attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
        created_at TEXT NOT NULL,
        published_at TEXT,
        record_json TEXT NOT NULL,
        UNIQUE (event_id, destination)
      ) STRICT;

      CREATE INDEX task_heads_recovery_idx ON task_heads(status, task_id);
      CREATE INDEX task_events_task_idx ON task_events(task_id, sequence);
      CREATE INDEX outbox_pending_idx ON outbox(published_at, created_at);
    `,
  },
  {
    id: 2,
    name: "kaf_3_2_task_capability_locks",
    sql: `
      CREATE TABLE task_capability_locks (
        lock_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES task_heads(task_id) ON DELETE CASCADE,
        capability_id TEXT NOT NULL,
        registry_revision TEXT NOT NULL,
        definition_revision TEXT NOT NULL,
        binding_revision TEXT NOT NULL,
        adapter_descriptor_revision TEXT NOT NULL,
        locked_at TEXT NOT NULL,
        lock_json TEXT NOT NULL,
        UNIQUE (task_id, capability_id)
      ) STRICT;

      CREATE INDEX task_capability_locks_task_idx
        ON task_capability_locks(task_id, capability_id);
    `,
  },
  {
    id: 3,
    name: "kaf_4_1_user_confirmations",
    sql: `
      CREATE TABLE user_confirmations (
        confirmation_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES task_heads(task_id) ON DELETE CASCADE,
        scope_digest TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected')),
        request_json TEXT NOT NULL,
        decision_json TEXT,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX user_confirmations_task_idx
        ON user_confirmations(task_id, status, confirmation_id);
    `,
  },
  {
    id: 4,
    name: "kaf_4_2_outbox_backoff",
    sql: `
      ALTER TABLE outbox ADD COLUMN next_attempt_at TEXT;
      DROP INDEX outbox_pending_idx;
      CREATE INDEX outbox_pending_idx
        ON outbox(published_at, next_attempt_at, created_at, outbox_id);
    `,
  },
  {
    id: 5,
    name: "kaf_5_0_conversation_compaction_persistence",
    sql: `
      CREATE TABLE session_heads (
        session_id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        message_sequence INTEGER NOT NULL CHECK (message_sequence >= 0),
        session_event_sequence INTEGER NOT NULL CHECK (session_event_sequence >= 0),
        context_revision INTEGER NOT NULL CHECK (context_revision >= 0),
        active_compaction_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        head_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE conversation_messages (
        message_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES session_heads(session_id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        schema_version TEXT NOT NULL,
        message_schema_version TEXT NOT NULL,
        message_digest TEXT NOT NULL,
        task_id TEXT REFERENCES task_heads(task_id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        message_json TEXT NOT NULL,
        UNIQUE (session_id, sequence)
      ) STRICT;

      CREATE TABLE compaction_jobs (
        compaction_job_id TEXT PRIMARY KEY,
        compaction_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL REFERENCES session_heads(session_id) ON DELETE CASCADE,
        request_command_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'stale')),
        source_start_sequence INTEGER NOT NULL CHECK (source_start_sequence > 0),
        source_end_sequence INTEGER NOT NULL CHECK (source_end_sequence >= source_start_sequence),
        source_digest TEXT NOT NULL,
        base_active_compaction_id TEXT,
        base_context_revision INTEGER NOT NULL CHECK (base_context_revision >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        job_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE compaction_records (
        compaction_id TEXT PRIMARY KEY,
        compaction_job_id TEXT NOT NULL UNIQUE
          REFERENCES compaction_jobs(compaction_job_id) ON DELETE RESTRICT,
        session_id TEXT NOT NULL REFERENCES session_heads(session_id) ON DELETE CASCADE,
        source_start_sequence INTEGER NOT NULL CHECK (source_start_sequence > 0),
        source_end_sequence INTEGER NOT NULL CHECK (source_end_sequence >= source_start_sequence),
        source_digest TEXT NOT NULL,
        base_active_compaction_id TEXT,
        base_context_revision INTEGER NOT NULL CHECK (base_context_revision >= 0),
        record_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE session_events (
        event_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES session_heads(session_id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        compaction_job_id TEXT NOT NULL
          REFERENCES compaction_jobs(compaction_job_id) ON DELETE RESTRICT,
        type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        causation_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        event_json TEXT NOT NULL,
        UNIQUE (session_id, sequence)
      ) STRICT;

      CREATE TABLE session_command_receipts (
        command_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES session_heads(session_id) ON DELETE CASCADE,
        compaction_job_id TEXT NOT NULL
          REFERENCES compaction_jobs(compaction_job_id) ON DELETE RESTRICT,
        command_type TEXT NOT NULL,
        command_digest TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
        context_revision INTEGER NOT NULL CHECK (context_revision >= 0),
        received_at TEXT NOT NULL,
        receipt_json TEXT NOT NULL
      ) STRICT;

      ALTER TABLE outbox RENAME TO outbox_kaf4;

      CREATE TABLE outbox (
        outbox_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        task_event_id TEXT REFERENCES task_events(event_id) ON DELETE CASCADE,
        session_event_id TEXT REFERENCES session_events(event_id) ON DELETE CASCADE,
        task_id TEXT REFERENCES task_heads(task_id) ON DELETE CASCADE,
        session_id TEXT REFERENCES session_heads(session_id) ON DELETE CASCADE,
        destination TEXT NOT NULL,
        attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
        created_at TEXT NOT NULL,
        next_attempt_at TEXT,
        published_at TEXT,
        record_json TEXT NOT NULL,
        CHECK (
          (task_id IS NOT NULL AND session_id IS NULL
            AND task_event_id IS NOT NULL AND session_event_id IS NULL
            AND event_id = task_event_id)
          OR
          (task_id IS NULL AND session_id IS NOT NULL
            AND task_event_id IS NULL AND session_event_id IS NOT NULL
            AND event_id = session_event_id)
        ),
        UNIQUE (task_event_id, destination),
        UNIQUE (session_event_id, destination)
      ) STRICT;

      INSERT INTO outbox (
        outbox_id, event_id, task_event_id, session_event_id, task_id, session_id,
        destination, attempt_count, created_at, next_attempt_at, published_at, record_json
      )
      SELECT
        outbox_id, event_id, event_id, NULL, task_id, NULL,
        destination, attempt_count, created_at, next_attempt_at, published_at, record_json
      FROM outbox_kaf4;

      DROP TABLE outbox_kaf4;

      CREATE INDEX conversation_messages_range_idx
        ON conversation_messages(session_id, sequence, message_digest);
      CREATE INDEX session_events_session_idx
        ON session_events(session_id, sequence);
      CREATE INDEX compaction_jobs_recovery_idx
        ON compaction_jobs(status, created_at, compaction_job_id);
      CREATE UNIQUE INDEX compaction_jobs_one_pending_per_session_idx
        ON compaction_jobs(session_id) WHERE status = 'pending';
      CREATE INDEX compaction_records_source_idx
        ON compaction_records(session_id, source_end_sequence, source_digest);
      CREATE INDEX outbox_pending_idx
        ON outbox(published_at, next_attempt_at, created_at, outbox_id);
    `,
  },
  {
    id: 6,
    name: "kaf_5_1_rich_conversation_messages",
    sql: `
      ALTER TABLE conversation_messages ADD COLUMN content_json TEXT;

      CREATE INDEX conversation_messages_task_idx
        ON conversation_messages(session_id, task_id, sequence);
    `,
  },
  {
    id: 7,
    name: "dcf_1_1a_desktop_foundation",
    sql: `
      CREATE TABLE desktop_workspace_grants (
        workspace_grant_id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE desktop_session_metadata (
        desktop_session_id TEXT PRIMARY KEY,
        internal_session_id TEXT NOT NULL UNIQUE
          REFERENCES session_heads(session_id) ON DELETE RESTRICT,
        revision INTEGER NOT NULL CHECK (revision >= 0),
        tombstoned INTEGER NOT NULL CHECK (tombstoned IN (0, 1)),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE desktop_session_create_intents (
        command_id TEXT PRIMARY KEY,
        request_digest TEXT NOT NULL,
        internal_session_id TEXT NOT NULL UNIQUE,
        desktop_session_id TEXT NOT NULL UNIQUE,
        prepared_at TEXT NOT NULL,
        intent_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE desktop_command_receipts (
        command_id TEXT PRIMARY KEY,
        command_type TEXT NOT NULL CHECK (command_type IN (
          'create_workspace_grant',
          'revoke_workspace_grant',
          'create_session',
          'rename_session',
          'delete_session'
        )),
        request_digest TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        receipt_json TEXT NOT NULL
      ) STRICT;

      CREATE INDEX desktop_workspace_grants_list_idx
        ON desktop_workspace_grants(created_at, workspace_grant_id);
      CREATE INDEX desktop_session_metadata_list_idx
        ON desktop_session_metadata(tombstoned, updated_at, desktop_session_id);
      CREATE INDEX desktop_session_create_intents_resource_idx
        ON desktop_session_create_intents(desktop_session_id, internal_session_id);
    `,
  },
  {
    id: 8,
    name: "dcf_1_1b_task_runtime_selection",
    sql: `
      CREATE TABLE task_runtime_selections (
        runtime_selection_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL UNIQUE
          REFERENCES task_heads(task_id) ON DELETE CASCADE,
        selection_digest TEXT NOT NULL,
        agent_definition_id TEXT NOT NULL,
        agent_revision TEXT NOT NULL,
        registry_revision TEXT NOT NULL,
        created_at TEXT NOT NULL,
        selection_json TEXT NOT NULL
      ) STRICT;

      CREATE INDEX task_runtime_selections_agent_idx
        ON task_runtime_selections(agent_definition_id, agent_revision, task_id);
    `,
  },
  {
    id: 9,
    name: "dcf_1_1c_submit_turn_coordination",
    sql: `
      ALTER TABLE conversation_messages RENAME TO conversation_messages_v8;

      CREATE TABLE conversation_messages (
        message_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES session_heads(session_id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        schema_version TEXT NOT NULL,
        message_schema_version TEXT NOT NULL,
        message_digest TEXT NOT NULL,
        task_id TEXT,
        created_at TEXT NOT NULL,
        message_json TEXT NOT NULL,
        content_json TEXT,
        UNIQUE (session_id, sequence)
      ) STRICT;

      INSERT INTO conversation_messages (
        message_id, session_id, sequence, schema_version,
        message_schema_version, message_digest, task_id, created_at,
        message_json, content_json
      )
      SELECT
        message_id, session_id, sequence, schema_version,
        message_schema_version, message_digest, task_id, created_at,
        message_json, content_json
      FROM conversation_messages_v8;

      DROP TABLE conversation_messages_v8;

      CREATE INDEX conversation_messages_range_idx
        ON conversation_messages(session_id, sequence, message_digest);
      CREATE INDEX conversation_messages_task_idx
        ON conversation_messages(session_id, task_id, sequence);

      CREATE TABLE conversation_message_intents (
        message_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL
          REFERENCES session_heads(session_id) ON DELETE CASCADE,
        task_id TEXT NOT NULL,
        message_digest TEXT NOT NULL,
        created_at TEXT NOT NULL,
        intent_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE task_submit_turn_bindings (
        submit_turn_command_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL UNIQUE
          REFERENCES task_heads(task_id) ON DELETE CASCADE,
        user_message_id TEXT NOT NULL UNIQUE,
        runtime_selection_id TEXT NOT NULL UNIQUE
          REFERENCES task_runtime_selections(runtime_selection_id) ON DELETE CASCADE,
        bundle_digest TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        binding_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE submit_turn_records (
        submit_turn_command_id TEXT PRIMARY KEY,
        client_turn_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN (
          'accepted',
          'message_appended',
          'task_committed',
          'completed',
          'failed_terminal'
        )),
        request_digest TEXT NOT NULL,
        internal_session_id TEXT NOT NULL,
        internal_task_id TEXT NOT NULL UNIQUE,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE submit_turn_receipts (
        submit_turn_command_id TEXT PRIMARY KEY
          REFERENCES submit_turn_records(submit_turn_command_id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
        completed_at TEXT NOT NULL,
        receipt_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE desktop_delivery_records (
        delivery_sequence INTEGER PRIMARY KEY CHECK (delivery_sequence > 0),
        delivery_id TEXT NOT NULL UNIQUE,
        submit_turn_command_id TEXT NOT NULL UNIQUE
          REFERENCES submit_turn_records(submit_turn_command_id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('turn.accepted', 'turn.rejected')),
        created_at TEXT NOT NULL,
        delivery_json TEXT NOT NULL
      ) STRICT;

      CREATE INDEX conversation_message_intents_session_idx
        ON conversation_message_intents(session_id, created_at, message_id);
      CREATE INDEX submit_turn_records_recovery_idx
        ON submit_turn_records(status, updated_at, submit_turn_command_id);
      CREATE INDEX desktop_delivery_records_cursor_idx
        ON desktop_delivery_records(delivery_sequence);
    `,
  },
  {
    id: 10,
    name: "dcf_1_2c_durable_message_delivery",
    sql: `
      DROP INDEX desktop_delivery_records_cursor_idx;

      ALTER TABLE desktop_delivery_records
        RENAME TO desktop_delivery_records_v9;

      CREATE TABLE desktop_delivery_records (
        delivery_sequence INTEGER PRIMARY KEY CHECK (delivery_sequence > 0),
        delivery_id TEXT NOT NULL UNIQUE,
        submit_turn_command_id TEXT NOT NULL
          REFERENCES submit_turn_records(submit_turn_command_id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN (
          'turn.accepted',
          'turn.rejected',
          'message.committed'
        )),
        created_at TEXT NOT NULL,
        delivery_json TEXT NOT NULL
      ) STRICT;

      INSERT INTO desktop_delivery_records (
        delivery_sequence, delivery_id, submit_turn_command_id,
        type, created_at, delivery_json
      )
      SELECT
        delivery_sequence, delivery_id, submit_turn_command_id,
        type, created_at, delivery_json
      FROM desktop_delivery_records_v9;

      DROP TABLE desktop_delivery_records_v9;

      CREATE INDEX desktop_delivery_records_cursor_idx
        ON desktop_delivery_records(delivery_sequence);
    `,
  },
  {
    id: 11,
    name: "dcf_2a_task_projection_delivery",
    sql: `
      DROP INDEX desktop_delivery_records_cursor_idx;

      ALTER TABLE desktop_delivery_records
        RENAME TO desktop_delivery_records_v10;

      CREATE TABLE desktop_delivery_records (
        delivery_sequence INTEGER PRIMARY KEY CHECK (delivery_sequence > 0),
        delivery_id TEXT NOT NULL UNIQUE,
        submit_turn_command_id TEXT NOT NULL
          REFERENCES submit_turn_records(submit_turn_command_id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN (
          'turn.accepted',
          'turn.rejected',
          'message.committed',
          'task.status_changed',
          'tool.activity_changed'
        )),
        created_at TEXT NOT NULL,
        delivery_json TEXT NOT NULL
      ) STRICT;

      INSERT INTO desktop_delivery_records (
        delivery_sequence, delivery_id, submit_turn_command_id,
        type, created_at, delivery_json
      )
      SELECT
        delivery_sequence, delivery_id, submit_turn_command_id,
        type, created_at, delivery_json
      FROM desktop_delivery_records_v10;

      DROP TABLE desktop_delivery_records_v10;

      CREATE INDEX desktop_delivery_records_cursor_idx
        ON desktop_delivery_records(delivery_sequence);
    `,
  },
  {
    id: 12,
    name: "dcf_2b_user_confirmation_delivery",
    sql: `
      DROP INDEX desktop_delivery_records_cursor_idx;

      ALTER TABLE desktop_delivery_records
        RENAME TO desktop_delivery_records_v11;

      CREATE TABLE desktop_delivery_records (
        delivery_sequence INTEGER PRIMARY KEY CHECK (delivery_sequence > 0),
        delivery_id TEXT NOT NULL UNIQUE,
        submit_turn_command_id TEXT NOT NULL
          REFERENCES submit_turn_records(submit_turn_command_id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN (
          'turn.accepted',
          'turn.rejected',
          'message.committed',
          'task.status_changed',
          'tool.activity_changed',
          'user_confirmation.changed'
        )),
        created_at TEXT NOT NULL,
        delivery_json TEXT NOT NULL
      ) STRICT;

      INSERT INTO desktop_delivery_records (
        delivery_sequence, delivery_id, submit_turn_command_id,
        type, created_at, delivery_json
      )
      SELECT
        delivery_sequence, delivery_id, submit_turn_command_id,
        type, created_at, delivery_json
      FROM desktop_delivery_records_v11;

      DROP TABLE desktop_delivery_records_v11;

      CREATE INDEX desktop_delivery_records_cursor_idx
        ON desktop_delivery_records(delivery_sequence);
    `,
  },
  {
    id: 13,
    name: "adr17_i1_tool_call_batch_intent",
    sql: `
      CREATE TABLE tool_call_batches (
        batch_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL
          REFERENCES session_heads(session_id) ON DELETE CASCADE,
        task_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        assistant_message_id TEXT NOT NULL UNIQUE
          REFERENCES conversation_messages(message_id) ON DELETE CASCADE,
        assistant_message_sequence INTEGER NOT NULL CHECK (assistant_message_sequence > 0),
        assistant_message_digest TEXT NOT NULL,
        batch_digest TEXT NOT NULL UNIQUE,
        call_count INTEGER NOT NULL CHECK (call_count BETWEEN 1 AND 32),
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        UNIQUE (session_id, assistant_message_sequence)
      ) STRICT;

      CREATE TABLE tool_call_dispositions (
        batch_id TEXT NOT NULL
          REFERENCES tool_call_batches(batch_id) ON DELETE CASCADE,
        tool_call_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 0 AND 31),
        disposition TEXT NOT NULL CHECK (disposition IN (
          'ready_to_dispatch',
          'waiting_user_confirmation',
          'blocked_by_prior_confirmation',
          'effect_linked',
          'result_committed',
          'cancelled_before_dispatch',
          'denied_before_dispatch'
        )),
        revision INTEGER NOT NULL CHECK (revision >= 0),
        confirmation_id TEXT,
        effect_attempt_id TEXT,
        result_message_id TEXT
          REFERENCES conversation_messages(message_id) ON DELETE RESTRICT,
        result_digest TEXT,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (batch_id, tool_call_id),
        UNIQUE (batch_id, action_id),
        UNIQUE (batch_id, ordinal),
        CHECK (
          (disposition = 'waiting_user_confirmation' AND confirmation_id IS NOT NULL)
          OR (disposition <> 'waiting_user_confirmation' AND confirmation_id IS NULL)
        ),
        CHECK (
          (disposition IN ('effect_linked', 'result_committed') AND effect_attempt_id IS NOT NULL)
          OR (disposition NOT IN ('effect_linked', 'result_committed') AND effect_attempt_id IS NULL)
        ),
        CHECK (
          (disposition = 'result_committed'
            AND result_message_id IS NOT NULL AND result_digest IS NOT NULL)
          OR
          (disposition <> 'result_committed'
            AND result_message_id IS NULL AND result_digest IS NULL)
        )
      ) STRICT;

      CREATE INDEX tool_call_batches_recovery_idx
        ON tool_call_batches(created_at, batch_id);
      CREATE INDEX tool_call_dispositions_recovery_idx
        ON tool_call_dispositions(disposition, updated_at, batch_id, ordinal);
    `,
  },
  {
    id: 14,
    name: "cgf_2c_1_model_invocation_links",
    sql: `
      CREATE TABLE model_invocation_links (
        client_request_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES task_heads(task_id) ON DELETE CASCADE,
        run_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 64),
        runtime_selection_digest TEXT NOT NULL,
        assistant_message_id TEXT NOT NULL UNIQUE,
        model_request_id TEXT NOT NULL UNIQUE,
        model_request_digest TEXT NOT NULL,
        confirmation_id TEXT NOT NULL,
        scope_digest TEXT NOT NULL,
        data_scope_digest TEXT NOT NULL,
        central_accept_request_digest TEXT NOT NULL,
        invocation_id TEXT UNIQUE,
        status_revision INTEGER CHECK (status_revision >= 0),
        durable_cursor TEXT,
        accepted_at TEXT,
        output_started_at TEXT,
        message_committed_at TEXT,
        record_digest TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        UNIQUE (task_id, run_id, round),
        CHECK ((invocation_id IS NULL) = (accepted_at IS NULL)),
        CHECK (status_revision IS NULL OR invocation_id IS NOT NULL),
        CHECK (durable_cursor IS NULL OR invocation_id IS NOT NULL),
        CHECK (output_started_at IS NULL OR invocation_id IS NOT NULL),
        CHECK (message_committed_at IS NULL OR output_started_at IS NOT NULL)
      ) STRICT;

      CREATE INDEX model_invocation_links_recovery_idx
        ON model_invocation_links(message_committed_at, updated_at, client_request_id);
      CREATE INDEX model_invocation_links_task_idx
        ON model_invocation_links(task_id, run_id, round);
    `,
  },
  {
    id: 15,
    name: "apv_2_artifact_lifecycle",
    sql: `
      CREATE TABLE artifact_lifecycle_records (
        artifact_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        source_digest TEXT NOT NULL,
        pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)),
        dismissed INTEGER NOT NULL CHECK (dismissed IN (0, 1)),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      ) STRICT;

      CREATE INDEX artifact_lifecycle_task_idx
        ON artifact_lifecycle_records(task_id, artifact_id);
    `,
  },
  {
    id: 16,
    name: "mar_1_manual_artifact_registrations",
    sql: `
      CREATE TABLE artifact_lifecycle_records_v2 (
        artifact_id TEXT PRIMARY KEY,
        task_id TEXT,
        source_digest TEXT NOT NULL,
        pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)),
        dismissed INTEGER NOT NULL CHECK (dismissed IN (0, 1)),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      ) STRICT;

      INSERT INTO artifact_lifecycle_records_v2 (
        artifact_id, task_id, source_digest, pinned, dismissed,
        updated_at, record_json
      )
      SELECT artifact_id, task_id, source_digest, pinned, dismissed,
             updated_at, record_json
      FROM artifact_lifecycle_records;

      DROP TABLE artifact_lifecycle_records;
      ALTER TABLE artifact_lifecycle_records_v2
        RENAME TO artifact_lifecycle_records;

      CREATE INDEX artifact_lifecycle_task_idx
        ON artifact_lifecycle_records(task_id, artifact_id)
        WHERE task_id IS NOT NULL;

      CREATE TABLE manual_artifact_registrations (
        artifact_id TEXT PRIMARY KEY,
        workspace_grant_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        source_digest TEXT NOT NULL,
        file_sha256 TEXT NOT NULL,
        byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
        media_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        UNIQUE (workspace_grant_id, relative_path)
      ) STRICT;

      CREATE INDEX manual_artifact_registrations_created_idx
        ON manual_artifact_registrations(created_at DESC, artifact_id);
    `,
  },
  {
    id: 17,
    name: "mar_1_desktop_command_receipts",
    sql: `
      CREATE TABLE desktop_command_receipts_v2 (
        command_id TEXT PRIMARY KEY,
        command_type TEXT NOT NULL CHECK (command_type IN (
          'create_workspace_grant',
          'revoke_workspace_grant',
          'create_session',
          'rename_session',
          'delete_session',
          'set_artifact_lifecycle',
          'register_workspace_artifact'
        )),
        request_digest TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        receipt_json TEXT NOT NULL
      ) STRICT;

      INSERT INTO desktop_command_receipts_v2 (
        command_id, command_type, request_digest, resource_id, committed_at, receipt_json
      )
      SELECT command_id, command_type, request_digest, resource_id, committed_at, receipt_json
      FROM desktop_command_receipts;

      DROP TABLE desktop_command_receipts;
      ALTER TABLE desktop_command_receipts_v2
        RENAME TO desktop_command_receipts;
    `,
  },
  {
    id: 18,
    name: "arh_2_1_compaction_execution_bindings",
    sql: `
      CREATE TABLE compaction_execution_bindings (
        compaction_job_id TEXT PRIMARY KEY
          REFERENCES compaction_jobs(compaction_job_id) ON DELETE CASCADE,
        session_id TEXT NOT NULL REFERENCES session_heads(session_id) ON DELETE CASCADE,
        task_id TEXT NOT NULL,
        runtime_selection_id TEXT NOT NULL,
        runtime_selection_digest TEXT NOT NULL,
        model_lock_id TEXT NOT NULL,
        model_capability_id TEXT NOT NULL,
        model_lock_digest TEXT NOT NULL,
        registry_revision TEXT NOT NULL,
        adapter_descriptor_id TEXT NOT NULL,
        adapter_descriptor_revision TEXT NOT NULL,
        external_target_digest TEXT NOT NULL,
        summarizer_prompt_revision TEXT NOT NULL,
        binding_digest TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        binding_json TEXT NOT NULL
      ) STRICT;

      CREATE INDEX compaction_execution_bindings_recovery_idx
        ON compaction_execution_bindings(session_id, created_at, compaction_job_id);
    `,
  },
  {
    id: 19,
    name: "arh_2_2_compaction_model_invocation_links",
    sql: `
      CREATE TABLE compaction_model_invocation_links (
        compaction_job_id TEXT PRIMARY KEY
          REFERENCES compaction_jobs(compaction_job_id) ON DELETE CASCADE,
        client_request_id TEXT NOT NULL UNIQUE,
        model_request_id TEXT NOT NULL UNIQUE,
        model_request_digest TEXT NOT NULL,
        execution_binding_digest TEXT NOT NULL,
        confirmation_id TEXT NOT NULL,
        scope_digest TEXT NOT NULL,
        data_scope_digest TEXT NOT NULL,
        invocation_id TEXT UNIQUE,
        status_revision INTEGER CHECK (status_revision >= 0),
        durable_cursor TEXT,
        accepted_at TEXT,
        output_started_at TEXT,
        summary_committed_at TEXT,
        record_digest TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        CHECK ((invocation_id IS NULL) = (accepted_at IS NULL)),
        CHECK (status_revision IS NULL OR invocation_id IS NOT NULL),
        CHECK (durable_cursor IS NULL OR invocation_id IS NOT NULL),
        CHECK (output_started_at IS NULL OR invocation_id IS NOT NULL),
        CHECK (summary_committed_at IS NULL OR output_started_at IS NOT NULL)
      ) STRICT;

      CREATE INDEX compaction_model_invocation_links_recovery_idx
        ON compaction_model_invocation_links(summary_committed_at, updated_at, compaction_job_id);
    `,
  },
  {
    id: 20,
    name: "arh_3_1_provider_usage_projections",
    sql: `
      CREATE TABLE provider_usage_projections (
        invocation_kind TEXT NOT NULL
          CHECK (invocation_kind IN ('assistant_message', 'compaction_summary')),
        invocation_link_id TEXT NOT NULL,
        session_id TEXT NOT NULL REFERENCES session_heads(session_id) ON DELETE CASCADE,
        usage_event_id TEXT NOT NULL UNIQUE,
        usage_event_digest TEXT NOT NULL,
        record_digest TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (invocation_kind, invocation_link_id)
      ) STRICT;

      CREATE INDEX provider_usage_projections_session_idx
        ON provider_usage_projections(session_id, record_digest);
    `,
  },
  {
    id: 21,
    name: "arh_3_2_1_prompt_cache_contexts",
    sql: `
      CREATE TABLE prompt_cache_scope_namespaces (
        namespace_revision TEXT PRIMARY KEY,
        cache_execution_authority TEXT NOT NULL
          CHECK (cache_execution_authority IN ('central_enterprise', 'local_personal')),
        namespace_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
        created_at TEXT NOT NULL,
        record_digest TEXT NOT NULL,
        record_json TEXT NOT NULL
      ) STRICT;

      CREATE UNIQUE INDEX prompt_cache_scope_namespaces_one_active_idx
        ON prompt_cache_scope_namespaces(cache_execution_authority)
        WHERE status = 'active';

      CREATE TABLE model_invocation_cache_contexts (
        invocation_kind TEXT NOT NULL
          CHECK (invocation_kind IN ('assistant_message', 'compaction_summary')),
        invocation_link_id TEXT NOT NULL,
        cache_execution_authority TEXT NOT NULL
          CHECK (cache_execution_authority IN ('central_enterprise', 'local_personal')),
        session_scope_digest TEXT NOT NULL,
        scope_namespace_revision TEXT NOT NULL
          REFERENCES prompt_cache_scope_namespaces(namespace_revision) ON DELETE RESTRICT,
        cache_context_digest TEXT NOT NULL,
        gateway_contract_version TEXT NOT NULL CHECK (gateway_contract_version = 'v1alpha2'),
        record_digest TEXT NOT NULL,
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY (invocation_kind, invocation_link_id)
      ) STRICT;

      CREATE INDEX model_invocation_cache_contexts_namespace_idx
        ON model_invocation_cache_contexts(scope_namespace_revision, invocation_kind, invocation_link_id);
    `,
  },
  {
    id: 22,
    name: "dfi_2a_task_authorization_selections",
    sql: `
      CREATE TABLE task_authorization_selections (
        task_id TEXT PRIMARY KEY REFERENCES task_heads(task_id) ON DELETE CASCADE,
        runtime_selection_id TEXT NOT NULL UNIQUE
          REFERENCES task_runtime_selections(runtime_selection_id) ON DELETE CASCADE,
        runtime_selection_digest TEXT NOT NULL,
        requested_mode TEXT NOT NULL
          CHECK (requested_mode IN ('manual_review', 'smart_confirm', 'task_scoped')),
        resolved_mode TEXT NOT NULL
          CHECK (resolved_mode IN ('manual_review', 'smart_confirm', 'task_scoped')),
        policy_revision TEXT NOT NULL,
        resolution_source TEXT NOT NULL
          CHECK (resolution_source IN ('user_selected', 'legacy_default')),
        authorization_selection_digest TEXT NOT NULL UNIQUE,
        execution_selection_digest TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        CHECK (requested_mode = resolved_mode)
      ) STRICT;

      CREATE INDEX task_authorization_selections_policy_idx
        ON task_authorization_selections(
          policy_revision, resolved_mode, task_id
        );
    `,
  },
  {
    id: 23,
    name: "dfi_4a1_personal_model_foundation",
    sql: `
      CREATE TABLE personal_model_owner_scope_namespaces (
        namespace_revision INTEGER PRIMARY KEY CHECK(namespace_revision >= 1),
        namespace_key BLOB NOT NULL CHECK(length(namespace_key) BETWEEN 32 AND 64),
        namespace_key_check_digest TEXT NOT NULL
          CHECK(length(namespace_key_check_digest) = 71
            AND substr(namespace_key_check_digest, 1, 7) = 'sha256:'
            AND substr(namespace_key_check_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        status TEXT NOT NULL CHECK(status IN ('active', 'retired')),
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK(length(record_json) <= 4096),
        record_digest TEXT NOT NULL
          CHECK(length(record_digest) = 71
            AND substr(record_digest, 1, 7) = 'sha256:'
            AND substr(record_digest, 8) NOT GLOB '*[^0-9a-f]*')
      ) STRICT;

      CREATE UNIQUE INDEX personal_model_owner_scope_one_active_idx
        ON personal_model_owner_scope_namespaces(status)
        WHERE status = 'active';

      CREATE TABLE personal_model_definitions (
        owner_scope_namespace_revision INTEGER NOT NULL,
        owner_scope_digest TEXT NOT NULL
          CHECK(length(owner_scope_digest) = 71
            AND substr(owner_scope_digest, 1, 7) = 'sha256:'
            AND substr(owner_scope_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        personal_model_id TEXT NOT NULL CHECK(length(personal_model_id) BETWEEN 3 AND 96),
        configuration_revision TEXT NOT NULL
          CHECK(length(configuration_revision) = 71
            AND substr(configuration_revision, 1, 7) = 'sha256:'
            AND substr(configuration_revision, 8) NOT GLOB '*[^0-9a-f]*'),
        execution_definition_digest TEXT NOT NULL
          CHECK(length(execution_definition_digest) = 71
            AND substr(execution_definition_digest, 1, 7) = 'sha256:'
            AND substr(execution_definition_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        provider_kind TEXT NOT NULL CHECK(provider_kind IN ('deepseek','zhipu','kimi','custom')),
        provider_profile_revision TEXT NOT NULL
          CHECK(length(provider_profile_revision) = 71
            AND substr(provider_profile_revision, 1, 7) = 'sha256:'
            AND substr(provider_profile_revision, 8) NOT GLOB '*[^0-9a-f]*'),
        protocol TEXT NOT NULL CHECK(protocol = 'openai_compatible'),
        canonical_endpoint TEXT NOT NULL CHECK(length(canonical_endpoint) BETWEEN 8 AND 2048),
        endpoint_identity_digest TEXT NOT NULL
          CHECK(length(endpoint_identity_digest) = 71
            AND substr(endpoint_identity_digest, 1, 7) = 'sha256:'
            AND substr(endpoint_identity_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        provider_model_id TEXT NOT NULL CHECK(length(provider_model_id) BETWEEN 1 AND 160),
        display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 160),
        capabilities_json TEXT NOT NULL CHECK(length(capabilities_json) <= 4096),
        credential_ref TEXT NOT NULL CHECK(length(credential_ref) BETWEEN 32 AND 160),
        credential_revision INTEGER NOT NULL CHECK(credential_revision >= 1),
        credential_binding_digest TEXT NOT NULL
          CHECK(length(credential_binding_digest) = 71
            AND substr(credential_binding_digest, 1, 7) = 'sha256:'
            AND substr(credential_binding_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        record_json TEXT NOT NULL CHECK(length(record_json) <= 16384),
        record_digest TEXT NOT NULL
          CHECK(length(record_digest) = 71
            AND substr(record_digest, 1, 7) = 'sha256:'
            AND substr(record_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        created_at TEXT NOT NULL,
        PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest,
                    personal_model_id, configuration_revision),
        UNIQUE(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
               configuration_revision, execution_definition_digest),
        FOREIGN KEY(owner_scope_namespace_revision)
          REFERENCES personal_model_owner_scope_namespaces(namespace_revision)
      ) STRICT;

      CREATE TABLE personal_model_heads (
        owner_scope_namespace_revision INTEGER NOT NULL,
        owner_scope_digest TEXT NOT NULL
          CHECK(length(owner_scope_digest) = 71
            AND substr(owner_scope_digest, 1, 7) = 'sha256:'
            AND substr(owner_scope_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        personal_model_id TEXT NOT NULL,
        current_configuration_revision TEXT NOT NULL
          CHECK(length(current_configuration_revision) = 71
            AND substr(current_configuration_revision, 1, 7) = 'sha256:'
            AND substr(current_configuration_revision, 8) NOT GLOB '*[^0-9a-f]*'),
        current_execution_definition_digest TEXT NOT NULL
          CHECK(length(current_execution_definition_digest) = 71
            AND substr(current_execution_definition_digest, 1, 7) = 'sha256:'
            AND substr(current_execution_definition_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        head_revision INTEGER NOT NULL CHECK(head_revision >= 1),
        selection_state TEXT NOT NULL CHECK(selection_state IN ('active','delete_pending','tombstoned')),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK(length(record_json) <= 8192),
        record_digest TEXT NOT NULL
          CHECK(length(record_digest) = 71
            AND substr(record_digest, 1, 7) = 'sha256:'
            AND substr(record_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest, personal_model_id),
        FOREIGN KEY(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
                    current_configuration_revision, current_execution_definition_digest)
          REFERENCES personal_model_definitions(owner_scope_namespace_revision, owner_scope_digest,
                    personal_model_id, configuration_revision, execution_definition_digest)
      ) STRICT;

      CREATE TABLE personal_model_status_facts (
        owner_scope_namespace_revision INTEGER NOT NULL,
        owner_scope_digest TEXT NOT NULL
          CHECK(length(owner_scope_digest) = 71
            AND substr(owner_scope_digest, 1, 7) = 'sha256:'
            AND substr(owner_scope_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        personal_model_id TEXT NOT NULL,
        configuration_revision TEXT NOT NULL
          CHECK(length(configuration_revision) = 71
            AND substr(configuration_revision, 1, 7) = 'sha256:'
            AND substr(configuration_revision, 8) NOT GLOB '*[^0-9a-f]*'),
        execution_definition_digest TEXT NOT NULL
          CHECK(length(execution_definition_digest) = 71
            AND substr(execution_definition_digest, 1, 7) = 'sha256:'
            AND substr(execution_definition_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        status_revision INTEGER NOT NULL CHECK(status_revision >= 1),
        status TEXT NOT NULL CHECK(status IN ('unverified','available','authentication_failed',
          'network_failed','protocol_incompatible','model_not_found','unavailable','permission_denied')),
        detail_code TEXT CHECK(detail_code IS NULL OR length(detail_code) <= 120),
        detail_digest TEXT CHECK(detail_digest IS NULL OR
          (length(detail_digest) = 71 AND substr(detail_digest, 1, 7) = 'sha256:'
            AND substr(detail_digest, 8) NOT GLOB '*[^0-9a-f]*')),
        status_origin TEXT NOT NULL CHECK(status_origin IN ('initialized','carry_forward','provider_observation')),
        carried_from_configuration_revision TEXT CHECK(carried_from_configuration_revision IS NULL OR
          (length(carried_from_configuration_revision) = 71
            AND substr(carried_from_configuration_revision, 1, 7) = 'sha256:'
            AND substr(carried_from_configuration_revision, 8) NOT GLOB '*[^0-9a-f]*')),
        carried_from_status_revision INTEGER,
        carried_from_status_record_digest TEXT CHECK(carried_from_status_record_digest IS NULL OR
          (length(carried_from_status_record_digest) = 71
            AND substr(carried_from_status_record_digest, 1, 7) = 'sha256:'
            AND substr(carried_from_status_record_digest, 8) NOT GLOB '*[^0-9a-f]*')),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK(length(record_json) <= 8192),
        record_digest TEXT NOT NULL
          CHECK(length(record_digest) = 71
            AND substr(record_digest, 1, 7) = 'sha256:'
            AND substr(record_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
                    configuration_revision, status_revision),
        UNIQUE(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
               configuration_revision, status_revision, record_digest),
        FOREIGN KEY(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
                    configuration_revision, execution_definition_digest)
          REFERENCES personal_model_definitions(owner_scope_namespace_revision, owner_scope_digest,
                    personal_model_id, configuration_revision, execution_definition_digest),
        FOREIGN KEY(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
                    carried_from_configuration_revision, carried_from_status_revision,
                    carried_from_status_record_digest)
          REFERENCES personal_model_status_facts(owner_scope_namespace_revision, owner_scope_digest,
                    personal_model_id, configuration_revision, status_revision, record_digest),
        CHECK((status_origin = 'carry_forward'
          AND carried_from_configuration_revision IS NOT NULL
          AND carried_from_status_revision IS NOT NULL
          AND carried_from_status_record_digest IS NOT NULL)
          OR (status_origin <> 'carry_forward'
          AND carried_from_configuration_revision IS NULL
          AND carried_from_status_revision IS NULL
          AND carried_from_status_record_digest IS NULL))
      ) STRICT;

      CREATE TABLE personal_model_preferences (
        owner_scope_namespace_revision INTEGER NOT NULL,
        owner_scope_digest TEXT NOT NULL
          CHECK(length(owner_scope_digest) = 71
            AND substr(owner_scope_digest, 1, 7) = 'sha256:'
            AND substr(owner_scope_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        model_source TEXT CHECK(model_source IS NULL OR model_source IN ('enterprise','personal')),
        model_id TEXT CHECK(model_id IS NULL OR length(model_id) BETWEEN 1 AND 160),
        configuration_revision TEXT CHECK(configuration_revision IS NULL OR
          (length(configuration_revision) = 71
            AND substr(configuration_revision, 1, 7) = 'sha256:'
            AND substr(configuration_revision, 8) NOT GLOB '*[^0-9a-f]*')),
        preference_revision INTEGER NOT NULL CHECK(preference_revision >= 1),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK(length(record_json) <= 4096),
        record_digest TEXT NOT NULL
          CHECK(length(record_digest) = 71
            AND substr(record_digest, 1, 7) = 'sha256:'
            AND substr(record_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest),
        FOREIGN KEY(owner_scope_namespace_revision)
          REFERENCES personal_model_owner_scope_namespaces(namespace_revision),
        CHECK((model_source IS NULL AND model_id IS NULL AND configuration_revision IS NULL)
          OR (model_source = 'personal' AND model_id IS NOT NULL AND configuration_revision IS NOT NULL)
          OR (model_source = 'enterprise' AND model_id IS NOT NULL AND configuration_revision IS NULL))
      ) STRICT;

      CREATE TABLE personal_model_operations (
        owner_scope_namespace_revision INTEGER NOT NULL,
        owner_scope_digest TEXT NOT NULL
          CHECK(length(owner_scope_digest) = 71
            AND substr(owner_scope_digest, 1, 7) = 'sha256:'
            AND substr(owner_scope_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        command_id TEXT NOT NULL,
        operation_type TEXT NOT NULL CHECK(operation_type IN ('create','update','delete')),
        request_digest TEXT NOT NULL
          CHECK(length(request_digest) = 71
            AND substr(request_digest, 1, 7) = 'sha256:'
            AND substr(request_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        target_model_id TEXT NOT NULL CHECK(length(target_model_id) BETWEEN 3 AND 96),
        expected_configuration_revision TEXT CHECK(expected_configuration_revision IS NULL OR
          (length(expected_configuration_revision) = 71
            AND substr(expected_configuration_revision, 1, 7) = 'sha256:'
            AND substr(expected_configuration_revision, 8) NOT GLOB '*[^0-9a-f]*')),
        expected_execution_definition_digest TEXT CHECK(expected_execution_definition_digest IS NULL OR
          (length(expected_execution_definition_digest) = 71
            AND substr(expected_execution_definition_digest, 1, 7) = 'sha256:'
            AND substr(expected_execution_definition_digest, 8) NOT GLOB '*[^0-9a-f]*')),
        target_configuration_revision TEXT CHECK(target_configuration_revision IS NULL OR
          (length(target_configuration_revision) = 71
            AND substr(target_configuration_revision, 1, 7) = 'sha256:'
            AND substr(target_configuration_revision, 8) NOT GLOB '*[^0-9a-f]*')),
        target_execution_definition_digest TEXT CHECK(target_execution_definition_digest IS NULL OR
          (length(target_execution_definition_digest) = 71
            AND substr(target_execution_definition_digest, 1, 7) = 'sha256:'
            AND substr(target_execution_definition_digest, 8) NOT GLOB '*[^0-9a-f]*')),
        target_credential_ref TEXT CHECK(target_credential_ref IS NULL OR length(target_credential_ref) BETWEEN 32 AND 160),
        previous_credential_ref TEXT CHECK(previous_credential_ref IS NULL OR length(previous_credential_ref) BETWEEN 32 AND 160),
        operation_phase TEXT NOT NULL CHECK(operation_phase IN ('intent_committed','credential_step_observed',
          'credential_cleanup_pending','committed','manual_attention')),
        phase_revision INTEGER NOT NULL CHECK(phase_revision >= 1),
        credential_observation_json TEXT CHECK(credential_observation_json IS NULL OR length(credential_observation_json) <= 2048),
        credential_observation_digest TEXT CHECK(credential_observation_digest IS NULL OR
          (length(credential_observation_digest) = 71
            AND substr(credential_observation_digest, 1, 7) = 'sha256:'
            AND substr(credential_observation_digest, 8) NOT GLOB '*[^0-9a-f]*')),
        recovery_error_code TEXT CHECK(recovery_error_code IS NULL OR length(recovery_error_code) <= 120),
        recovery_error_digest TEXT CHECK(recovery_error_digest IS NULL OR
          (length(recovery_error_digest) = 71
            AND substr(recovery_error_digest, 1, 7) = 'sha256:'
            AND substr(recovery_error_digest, 8) NOT GLOB '*[^0-9a-f]*')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK(length(record_json) <= 16384),
        record_digest TEXT NOT NULL
          CHECK(length(record_digest) = 71
            AND substr(record_digest, 1, 7) = 'sha256:'
            AND substr(record_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest, command_id),
        FOREIGN KEY(owner_scope_namespace_revision)
          REFERENCES personal_model_owner_scope_namespaces(namespace_revision),
        CHECK((operation_type = 'create'
          AND target_configuration_revision IS NOT NULL
          AND target_execution_definition_digest IS NOT NULL
          AND target_credential_ref IS NOT NULL)
          OR (operation_type = 'update'
          AND expected_configuration_revision IS NOT NULL
          AND expected_execution_definition_digest IS NOT NULL
          AND target_configuration_revision IS NOT NULL
          AND target_execution_definition_digest IS NOT NULL
          AND target_credential_ref IS NOT NULL)
          OR (operation_type = 'delete'
          AND expected_configuration_revision IS NOT NULL
          AND expected_execution_definition_digest IS NOT NULL
          AND target_configuration_revision IS NULL
          AND target_execution_definition_digest IS NULL
          AND target_credential_ref IS NULL
          AND previous_credential_ref IS NOT NULL)),
        CHECK(operation_type <> 'create'
          OR (expected_configuration_revision IS NULL
            AND expected_execution_definition_digest IS NULL
            AND previous_credential_ref IS NULL)),
        CHECK((operation_phase = 'intent_committed'
          AND credential_observation_json IS NULL AND credential_observation_digest IS NULL)
          OR (operation_phase IN ('credential_step_observed','credential_cleanup_pending','committed')
          AND credential_observation_json IS NOT NULL AND credential_observation_digest IS NOT NULL)
          OR (operation_phase = 'manual_attention'
          AND ((credential_observation_json IS NULL AND credential_observation_digest IS NULL)
            OR (credential_observation_json IS NOT NULL AND credential_observation_digest IS NOT NULL))))
      ) STRICT;

      CREATE TABLE personal_model_command_receipts (
        owner_scope_namespace_revision INTEGER NOT NULL,
        owner_scope_digest TEXT NOT NULL
          CHECK(length(owner_scope_digest) = 71
            AND substr(owner_scope_digest, 1, 7) = 'sha256:'
            AND substr(owner_scope_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        command_id TEXT NOT NULL,
        command_type TEXT NOT NULL CHECK(command_type IN ('create','update','delete','status','preference')),
        request_digest TEXT NOT NULL
          CHECK(length(request_digest) = 71
            AND substr(request_digest, 1, 7) = 'sha256:'
            AND substr(request_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        model_id TEXT CHECK(model_id IS NULL OR length(model_id) BETWEEN 3 AND 96),
        committed_configuration_revision TEXT CHECK(committed_configuration_revision IS NULL OR
          (length(committed_configuration_revision) = 71
            AND substr(committed_configuration_revision, 1, 7) = 'sha256:'
            AND substr(committed_configuration_revision, 8) NOT GLOB '*[^0-9a-f]*')),
        outcome TEXT NOT NULL CHECK(outcome IN ('create_committed','update_committed',
          'update_committed_cleanup_pending','delete_committed','status_committed',
          'preference_committed','manual_attention')),
        committed_at TEXT NOT NULL,
        receipt_json TEXT NOT NULL CHECK(length(receipt_json) <= 8192),
        receipt_digest TEXT NOT NULL
          CHECK(length(receipt_digest) = 71
            AND substr(receipt_digest, 1, 7) = 'sha256:'
            AND substr(receipt_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest, command_id),
        FOREIGN KEY(owner_scope_namespace_revision, owner_scope_digest, model_id,
                    committed_configuration_revision)
          REFERENCES personal_model_definitions(owner_scope_namespace_revision, owner_scope_digest,
                    personal_model_id, configuration_revision),
        CHECK((command_type = 'create' AND outcome IN ('create_committed','manual_attention'))
          OR (command_type = 'update' AND outcome IN ('update_committed',
            'update_committed_cleanup_pending','manual_attention'))
          OR (command_type = 'delete' AND outcome IN ('delete_committed','manual_attention'))
          OR (command_type = 'status' AND outcome = 'status_committed')
          OR (command_type = 'preference' AND outcome = 'preference_committed')),
        CHECK((outcome IN ('create_committed','update_committed','update_committed_cleanup_pending',
          'status_committed') AND model_id IS NOT NULL AND committed_configuration_revision IS NOT NULL)
          OR outcome IN ('delete_committed','preference_committed','manual_attention'))
      ) STRICT;

      CREATE INDEX personal_model_definitions_owner_created_idx
        ON personal_model_definitions(owner_scope_namespace_revision, owner_scope_digest,
          personal_model_id, created_at);
      CREATE INDEX personal_model_heads_active_idx
        ON personal_model_heads(owner_scope_namespace_revision, owner_scope_digest,
          selection_state, updated_at, personal_model_id);
      CREATE INDEX personal_model_status_latest_idx
        ON personal_model_status_facts(owner_scope_namespace_revision, owner_scope_digest,
          personal_model_id, configuration_revision, status_revision DESC);
      CREATE INDEX personal_model_operations_pending_idx
        ON personal_model_operations(owner_scope_namespace_revision, owner_scope_digest,
          operation_phase, updated_at, command_id);
      CREATE INDEX personal_model_receipts_committed_idx
        ON personal_model_command_receipts(owner_scope_namespace_revision, owner_scope_digest,
          committed_at, command_id);
    `,
  },
  {
    id: 24,
    name: "dfi_4a3_local_personal_model_invocations",
    sql: `
      CREATE TABLE local_personal_model_invocation_links (
        invocation_kind TEXT NOT NULL
          CHECK(invocation_kind IN ('assistant_message','compaction_summary')),
        invocation_link_id TEXT NOT NULL,
        authority_invocation_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        round INTEGER NOT NULL CHECK(round >= 0),
        task_runtime_selection_id TEXT NOT NULL,
        task_runtime_selection_digest TEXT NOT NULL
          CHECK(length(task_runtime_selection_digest) = 71
            AND substr(task_runtime_selection_digest, 1, 7) = 'sha256:'
            AND substr(task_runtime_selection_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        model_lock_id TEXT NOT NULL,
        model_lock_digest TEXT NOT NULL CHECK(length(model_lock_digest) = 71
          AND substr(model_lock_digest, 1, 7) = 'sha256:'
          AND substr(model_lock_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        owner_scope_namespace_revision INTEGER NOT NULL,
        owner_scope_digest TEXT NOT NULL CHECK(length(owner_scope_digest) = 71
          AND substr(owner_scope_digest, 1, 7) = 'sha256:'
          AND substr(owner_scope_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        personal_model_id TEXT NOT NULL,
        configuration_revision TEXT NOT NULL CHECK(length(configuration_revision) = 71
          AND substr(configuration_revision, 1, 7) = 'sha256:'
          AND substr(configuration_revision, 8) NOT GLOB '*[^0-9a-f]*'),
        execution_definition_digest TEXT NOT NULL CHECK(length(execution_definition_digest) = 71
          AND substr(execution_definition_digest, 1, 7) = 'sha256:'
          AND substr(execution_definition_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        provider_profile_revision TEXT NOT NULL CHECK(length(provider_profile_revision) = 71
          AND substr(provider_profile_revision, 1, 7) = 'sha256:'
          AND substr(provider_profile_revision, 8) NOT GLOB '*[^0-9a-f]*'),
        endpoint_identity_digest TEXT NOT NULL CHECK(length(endpoint_identity_digest) = 71
          AND substr(endpoint_identity_digest, 1, 7) = 'sha256:'
          AND substr(endpoint_identity_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        credential_binding_digest TEXT NOT NULL CHECK(length(credential_binding_digest) = 71
          AND substr(credential_binding_digest, 1, 7) = 'sha256:'
          AND substr(credential_binding_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        model_request_digest TEXT NOT NULL CHECK(length(model_request_digest) = 71
          AND substr(model_request_digest, 1, 7) = 'sha256:'
          AND substr(model_request_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        admission_scope_digest TEXT NOT NULL CHECK(length(admission_scope_digest) = 71
          AND substr(admission_scope_digest, 1, 7) = 'sha256:'
          AND substr(admission_scope_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        status TEXT NOT NULL
          CHECK(status IN ('accepted','dispatching','output_started','terminal','recovery_exhausted')),
        fencing_epoch INTEGER NOT NULL CHECK(fencing_epoch > 0),
        output_started_at TEXT,
        terminal_at TEXT,
        terminal_class TEXT CHECK(terminal_class IS NULL OR
          terminal_class IN ('completed','failed','cancelled','timed_out')),
        typed_error_code TEXT CHECK(typed_error_code IS NULL OR length(typed_error_code) BETWEEN 3 AND 160),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK(length(record_json) <= 32768),
        record_digest TEXT NOT NULL CHECK(length(record_digest) = 71
          AND substr(record_digest, 1, 7) = 'sha256:'
          AND substr(record_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        PRIMARY KEY(invocation_kind, invocation_link_id),
        FOREIGN KEY(owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
                    configuration_revision, execution_definition_digest)
          REFERENCES personal_model_definitions(owner_scope_namespace_revision, owner_scope_digest,
                    personal_model_id, configuration_revision, execution_definition_digest),
        CHECK((status = 'terminal' AND terminal_at IS NOT NULL AND terminal_class IS NOT NULL)
          OR (status = 'recovery_exhausted' AND terminal_at IS NOT NULL AND terminal_class IS NULL)
          OR (status NOT IN ('terminal','recovery_exhausted')
            AND terminal_at IS NULL AND terminal_class IS NULL)),
        CHECK(status <> 'output_started' OR output_started_at IS NOT NULL),
        CHECK((status IN ('terminal','recovery_exhausted')) OR typed_error_code IS NULL)
      ) STRICT;

      CREATE TABLE local_personal_provider_usage_facts (
        authority_invocation_id TEXT NOT NULL,
        provider_attempt_key TEXT NOT NULL
          CHECK(length(provider_attempt_key) = 64
            AND provider_attempt_key NOT GLOB '*[^0-9a-f]*'),
        fencing_epoch INTEGER NOT NULL CHECK(fencing_epoch > 0),
        state TEXT NOT NULL CHECK(state IN ('registered','recorded')),
        usage_digest TEXT CHECK(usage_digest IS NULL OR
          (length(usage_digest) = 64 AND usage_digest NOT GLOB '*[^0-9a-f]*')),
        fact_json TEXT CHECK(fact_json IS NULL OR length(fact_json) <= 16384),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(authority_invocation_id, provider_attempt_key),
        FOREIGN KEY(authority_invocation_id)
          REFERENCES local_personal_model_invocation_links(authority_invocation_id),
        CHECK((state = 'registered' AND usage_digest IS NULL AND fact_json IS NULL)
          OR (state = 'recorded' AND usage_digest IS NOT NULL AND fact_json IS NOT NULL))
      ) STRICT;

      CREATE INDEX local_personal_model_invocations_pending_idx
        ON local_personal_model_invocation_links(status, updated_at, invocation_kind, invocation_link_id);
      CREATE INDEX local_personal_model_invocations_model_idx
        ON local_personal_model_invocation_links(owner_scope_namespace_revision, owner_scope_digest,
          personal_model_id, configuration_revision, created_at);
      CREATE INDEX local_personal_provider_usage_state_idx
        ON local_personal_provider_usage_facts(state, updated_at, authority_invocation_id);
    `,
  },
  {
    id: 25,
    name: "dfi_4a31_local_personal_invocation_timeout_facts",
    sql: `
      CREATE TABLE local_personal_invocation_timeout_facts (
        authority_invocation_id TEXT PRIMARY KEY
          REFERENCES local_personal_model_invocation_links(authority_invocation_id)
          ON DELETE RESTRICT,
        timeout_policy_revision TEXT NOT NULL
          CHECK(timeout_policy_revision = 'model-invocation-timeout.v1'),
        timeout_policy_digest TEXT NOT NULL CHECK(length(timeout_policy_digest) = 71
          AND substr(timeout_policy_digest, 1, 7) = 'sha256:'
          AND substr(timeout_policy_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        selected_overall_timeout_ms INTEGER NOT NULL
          CHECK(selected_overall_timeout_ms BETWEEN 120000 AND 1800000),
        effective_deadline_source TEXT NOT NULL
          CHECK(effective_deadline_source IN ('policy_overall','outer_deadline')),
        outer_deadline_at TEXT,
        invocation_started_at TEXT NOT NULL,
        policy_deadline_at TEXT NOT NULL,
        invocation_deadline_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK(length(record_json) <= 8192),
        record_digest TEXT NOT NULL CHECK(length(record_digest) = 71
          AND substr(record_digest, 1, 7) = 'sha256:'
          AND substr(record_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        CHECK((effective_deadline_source = 'policy_overall')
          OR (effective_deadline_source = 'outer_deadline' AND outer_deadline_at IS NOT NULL)),
        CHECK(invocation_deadline_at > invocation_started_at),
        CHECK(policy_deadline_at > invocation_started_at)
      ) STRICT;

      CREATE INDEX local_personal_invocation_timeout_deadline_idx
        ON local_personal_invocation_timeout_facts(invocation_deadline_at, authority_invocation_id);
    `,
  },
  {
    id: 26,
    name: "dfi_5_reasoning_mode_experience_preference",
    sql: `
      CREATE TABLE desktop_experience_owner_scope_namespaces (
        owner_scope_namespace_revision INTEGER PRIMARY KEY CHECK(owner_scope_namespace_revision > 0),
        namespace_key BLOB NOT NULL CHECK(length(namespace_key) BETWEEN 32 AND 64),
        namespace_key_check_digest TEXT NOT NULL CHECK(length(namespace_key_check_digest) = 71
          AND substr(namespace_key_check_digest, 1, 7) = 'sha256:'
          AND substr(namespace_key_check_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        lifecycle_state TEXT NOT NULL CHECK(lifecycle_state = 'active'),
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK(length(record_json) <= 4096),
        record_digest TEXT NOT NULL CHECK(length(record_digest) = 71
          AND substr(record_digest, 1, 7) = 'sha256:'
          AND substr(record_digest, 8) NOT GLOB '*[^0-9a-f]*')
      ) STRICT;

      CREATE TABLE desktop_reasoning_mode_preferences (
        owner_scope_namespace_revision INTEGER NOT NULL,
        owner_scope_digest TEXT NOT NULL CHECK(length(owner_scope_digest) = 71
          AND substr(owner_scope_digest, 1, 7) = 'sha256:'
          AND substr(owner_scope_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        preference_revision INTEGER NOT NULL CHECK(preference_revision > 0),
        requested_mode TEXT NOT NULL CHECK(requested_mode IN ('default','max')),
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK(length(record_json) <= 4096),
        record_digest TEXT NOT NULL CHECK(length(record_digest) = 71
          AND substr(record_digest, 1, 7) = 'sha256:'
          AND substr(record_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest),
        FOREIGN KEY(owner_scope_namespace_revision)
          REFERENCES desktop_experience_owner_scope_namespaces(owner_scope_namespace_revision)
          ON DELETE RESTRICT
      ) STRICT;

      CREATE TABLE desktop_reasoning_mode_preference_receipts (
        owner_scope_namespace_revision INTEGER NOT NULL,
        owner_scope_digest TEXT NOT NULL CHECK(length(owner_scope_digest) = 71
          AND substr(owner_scope_digest, 1, 7) = 'sha256:'
          AND substr(owner_scope_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        command_id TEXT NOT NULL CHECK(length(command_id) = 36),
        request_digest TEXT NOT NULL CHECK(length(request_digest) = 71
          AND substr(request_digest, 1, 7) = 'sha256:'
          AND substr(request_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        expected_preference_revision INTEGER NOT NULL CHECK(expected_preference_revision >= 0),
        committed_preference_revision INTEGER NOT NULL CHECK(committed_preference_revision > 0),
        requested_mode TEXT NOT NULL CHECK(requested_mode IN ('default','max')),
        outcome TEXT NOT NULL CHECK(outcome = 'preference_committed'),
        committed_at TEXT NOT NULL,
        receipt_json TEXT NOT NULL CHECK(length(receipt_json) <= 4096),
        receipt_digest TEXT NOT NULL CHECK(length(receipt_digest) = 71
          AND substr(receipt_digest, 1, 7) = 'sha256:'
          AND substr(receipt_digest, 8) NOT GLOB '*[^0-9a-f]*'),
        PRIMARY KEY(owner_scope_namespace_revision, owner_scope_digest, command_id),
        FOREIGN KEY(owner_scope_namespace_revision)
          REFERENCES desktop_experience_owner_scope_namespaces(owner_scope_namespace_revision)
          ON DELETE RESTRICT,
        CHECK(committed_preference_revision = expected_preference_revision + 1)
      ) STRICT;

      CREATE UNIQUE INDEX desktop_experience_owner_scope_one_active_idx
        ON desktop_experience_owner_scope_namespaces(lifecycle_state)
        WHERE lifecycle_state = 'active';
      CREATE INDEX desktop_reasoning_mode_preference_receipts_committed_idx
        ON desktop_reasoning_mode_preference_receipts(
          owner_scope_namespace_revision, owner_scope_digest, committed_at, command_id
        );
    `,
  },
];

export const LATEST_SQLITE_SCHEMA_VERSION = sqliteMigrations.at(-1)?.id ?? 0;
