DO $upgrade$
DECLARE
    target_name TEXT;
    target_digest TEXT;
    ledger_count INTEGER;
BEGIN
    IF to_regclass(current_schema() || '.robothree_schema_version') IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_ledger_missing';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM robothree_schema_version
        WHERE version > 6
    ) THEN
        RAISE EXCEPTION 'persistence.schema_too_new';
    END IF;

    SELECT script_name, script_digest
    INTO target_name, target_digest
    FROM robothree_schema_version
    WHERE version = 6;

    IF target_name IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_version_incomplete';
    END IF;

    IF (
        target_name = 'B0006__central_foundation.sql'
        AND target_digest = '2d2d99172746aa7f2f5431a9c4273c1893694df0fa31eb8dddea8d48de2fd480'
    ) THEN
        SELECT count(*) INTO ledger_count FROM robothree_schema_version;
        IF ledger_count <> 1 THEN
            RAISE EXCEPTION 'persistence.schema_unsupported_history';
        END IF;
    ELSIF (
        target_name = 'U0006__bridge_from_flyway_v5.sql'
        AND target_digest = 'ff2e819ad5f80229035554b54ec802a7d2a3ef70fc7c665f138efc6bc0b37909'
    ) THEN
        IF (
            SELECT count(*)
            FROM robothree_schema_version
            WHERE version BETWEEN 1 AND 6
        ) <> 6 THEN
            RAISE EXCEPTION 'persistence.schema_version_incomplete';
        END IF;
    ELSE
        RAISE EXCEPTION 'persistence.schema_script_digest_mismatch';
    END IF;

    IF to_regclass(current_schema() || '.model_invocation') IS NOT NULL
        OR to_regclass(current_schema() || '.model_invocation_event') IS NOT NULL
        OR to_regclass(current_schema() || '.model_invocation_recovery_lease') IS NOT NULL
        OR to_regclass(current_schema() || '.model_invocation_audit_outbox') IS NOT NULL
    THEN
        RAISE EXCEPTION 'persistence.schema_target_conflict';
    END IF;
END
$upgrade$;

CREATE TABLE model_invocation (
    invocation_id UUID PRIMARY KEY,
    enterprise_id VARCHAR(160) NOT NULL,
    user_id VARCHAR(160) NOT NULL,
    device_id VARCHAR(160) NOT NULL,
    client_instance_id VARCHAR(160) NOT NULL,
    client_request_id UUID NOT NULL,
    request_id UUID NOT NULL UNIQUE,
    request_digest CHAR(64) NOT NULL,
    model_id VARCHAR(160) NOT NULL,
    model_revision CHAR(64) NOT NULL,
    configuration_revision CHAR(64) NOT NULL,
    runtime_registry_generation CHAR(64) NOT NULL,
    admission_type VARCHAR(32) NOT NULL,
    admission_digest CHAR(64) NOT NULL,
    provider_request_deadline_at TIMESTAMPTZ NOT NULL,
    provider_stream_idle_timeout_millis BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    status_revision BIGINT NOT NULL,
    last_durable_event_sequence BIGINT NOT NULL,
    durable_event_stream_digest CHAR(64),
    dispatch_decision VARCHAR(64),
    cancel_requested_at TIMESTAMPTZ,
    cancel_reason VARCHAR(64),
    timeout_intent_at TIMESTAMPTZ,
    usage_json TEXT,
    finish_reason VARCHAR(128),
    safe_error_code VARCHAR(128),
    safe_summary VARCHAR(4096),
    created_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_model_invocation_client_request UNIQUE (
        enterprise_id, user_id, device_id, client_instance_id, client_request_id
    ),
    CONSTRAINT ck_model_invocation_digests CHECK (
        request_digest ~ '^[a-f0-9]{64}$'
        AND model_revision ~ '^[a-f0-9]{64}$'
        AND configuration_revision ~ '^[a-f0-9]{64}$'
        AND runtime_registry_generation ~ '^[a-f0-9]{64}$'
        AND admission_digest ~ '^[a-f0-9]{64}$'
        AND (
            durable_event_stream_digest IS NULL
            OR durable_event_stream_digest ~ '^[a-f0-9]{64}$'
        )
    ),
    CONSTRAINT ck_model_invocation_status CHECK (
        status IN (
            'accepted', 'running', 'completed', 'failed',
            'cancelled', 'timed_out', 'uncertain'
        )
    ),
    CONSTRAINT ck_model_invocation_revision
        CHECK (status_revision >= 0 AND last_durable_event_sequence >= 0),
    CONSTRAINT ck_model_invocation_idle_timeout
        CHECK (
            provider_stream_idle_timeout_millis >= 1000
            AND provider_stream_idle_timeout_millis <= 300000
        ),
    CONSTRAINT ck_model_invocation_admission
        CHECK (admission_type IN ('development_synthetic', 'user_confirmed')),
    CONSTRAINT ck_model_invocation_stream_digest CHECK (
        (last_durable_event_sequence = 0 AND durable_event_stream_digest IS NULL)
        OR
        (last_durable_event_sequence > 0 AND durable_event_stream_digest IS NOT NULL)
    ),
    CONSTRAINT ck_model_invocation_cancel_intent CHECK (
        (cancel_requested_at IS NULL AND cancel_reason IS NULL)
        OR
        (cancel_requested_at IS NOT NULL
            AND cancel_reason IN (
                'user_requested', 'task_cancelled', 'deadline_exceeded'
            ))
    ),
    CONSTRAINT ck_model_invocation_usage
        CHECK (usage_json IS NULL OR jsonb_typeof(usage_json::jsonb) = 'object'),
    CONSTRAINT ck_model_invocation_time_order CHECK (
        provider_request_deadline_at >= created_at
        AND (started_at IS NULL OR started_at >= created_at)
        AND (ended_at IS NULL OR ended_at >= created_at)
        AND updated_at >= created_at
    )
);

CREATE INDEX ix_model_invocation_subject_status
    ON model_invocation (enterprise_id, user_id, status, updated_at);
CREATE INDEX ix_model_invocation_recovery
    ON model_invocation (status, updated_at)
    WHERE status IN ('accepted', 'running');

CREATE TABLE model_invocation_event (
    invocation_id UUID NOT NULL
        REFERENCES model_invocation (invocation_id),
    event_sequence BIGINT NOT NULL,
    event_id UUID NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    status VARCHAR(32),
    status_revision BIGINT NOT NULL,
    event_digest CHAR(64) NOT NULL,
    stream_digest CHAR(64) NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (invocation_id, event_sequence),
    CONSTRAINT uq_model_invocation_event_id UNIQUE (invocation_id, event_id),
    CONSTRAINT ck_model_invocation_event_sequence CHECK (event_sequence > 0),
    CONSTRAINT ck_model_invocation_event_revision CHECK (status_revision >= 0),
    CONSTRAINT ck_model_invocation_event_status CHECK (
        status IS NULL OR status IN (
            'accepted', 'running', 'completed', 'failed',
            'cancelled', 'timed_out', 'uncertain'
        )
    ),
    CONSTRAINT ck_model_invocation_event_digest CHECK (
        event_digest ~ '^[a-f0-9]{64}$'
        AND stream_digest ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_model_invocation_event_metadata
        CHECK (jsonb_typeof(metadata_json::jsonb) = 'object')
);

CREATE INDEX ix_model_invocation_event_cursor
    ON model_invocation_event (invocation_id, event_sequence, created_at);

CREATE TABLE model_invocation_recovery_lease (
    invocation_id UUID PRIMARY KEY
        REFERENCES model_invocation (invocation_id),
    owner_node_id VARCHAR(160) NOT NULL,
    fencing_epoch BIGINT NOT NULL CHECK (fencing_epoch > 0),
    status_revision BIGINT NOT NULL CHECK (status_revision >= 0),
    lease_expires_at TIMESTAMPTZ NOT NULL,
    database_observed_at TIMESTAMPTZ NOT NULL,
    recovery_attempt BIGINT NOT NULL CHECK (recovery_attempt > 0),
    policy_revision CHAR(64) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_model_invocation_lease_policy
        CHECK (policy_revision ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_model_invocation_lease_time
        CHECK (
            lease_expires_at >= database_observed_at
            AND updated_at >= database_observed_at
        )
);

CREATE INDEX ix_model_invocation_lease_expiry
    ON model_invocation_recovery_lease (lease_expires_at);

CREATE TABLE model_invocation_audit_outbox (
    outbox_id UUID PRIMARY KEY,
    invocation_id UUID NOT NULL
        REFERENCES model_invocation (invocation_id),
    event_id UUID NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    event_digest CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,
    attempt_count BIGINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    CONSTRAINT uq_model_invocation_audit_event UNIQUE (invocation_id, event_id),
    CONSTRAINT ck_model_invocation_audit_digest
        CHECK (event_digest ~ '^[a-f0-9]{64}$')
);

CREATE INDEX ix_model_invocation_audit_pending
    ON model_invocation_audit_outbox (created_at, outbox_id)
    WHERE published_at IS NULL;
