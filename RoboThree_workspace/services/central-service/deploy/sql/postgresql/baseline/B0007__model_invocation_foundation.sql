CREATE TABLE enterprise_verified_identity (
    verified_identity_id UUID PRIMARY KEY,
    enterprise_id VARCHAR(160) NOT NULL,
    user_id VARCHAR(160) NOT NULL,
    provider VARCHAR(80) NOT NULL,
    provider_subject_digest CHAR(64) NOT NULL,
    identity_digest CHAR(64) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    disabled_at TIMESTAMPTZ,
    CONSTRAINT ck_verified_identity_digest
        CHECK (provider_subject_digest ~ '^[a-f0-9]{64}$'
            AND identity_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_verified_identity_expiry CHECK (expires_at > issued_at)
);

CREATE UNIQUE INDEX uq_verified_identity_digest
    ON enterprise_verified_identity (enterprise_id, identity_digest);
CREATE INDEX ix_verified_identity_user
    ON enterprise_verified_identity (enterprise_id, user_id, expires_at);

CREATE TABLE enterprise_user_permission (
    enterprise_id VARCHAR(160) NOT NULL,
    user_id VARCHAR(160) NOT NULL,
    permission VARCHAR(128) NOT NULL,
    enabled BOOLEAN NOT NULL,
    revision BIGINT NOT NULL CHECK (revision >= 0),
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (enterprise_id, user_id, permission)
);

CREATE INDEX ix_enterprise_user_permission_enabled
    ON enterprise_user_permission (enterprise_id, user_id)
    WHERE enabled = TRUE;

CREATE TABLE enterprise_device (
    device_id VARCHAR(160) PRIMARY KEY,
    enterprise_id VARCHAR(160) NOT NULL,
    device_key_id VARCHAR(160) NOT NULL,
    public_key_format VARCHAR(40) NOT NULL,
    public_key_encoded TEXT NOT NULL,
    public_key_digest CHAR(64) NOT NULL,
    algorithm VARCHAR(32) NOT NULL,
    trust_source VARCHAR(80) NOT NULL,
    managed_status VARCHAR(32) NOT NULL,
    compliance_status VARCHAR(32) NOT NULL,
    revision BIGINT NOT NULL CHECK (revision >= 0),
    registered_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    disabled_at TIMESTAMPTZ,
    CONSTRAINT ck_device_public_key_digest
        CHECK (public_key_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_device_public_key_format
        CHECK (public_key_format IN ('spki_der_base64', 'x509_certificate_pem')),
    CONSTRAINT ck_device_algorithm CHECK (algorithm = 'ES256')
);

CREATE UNIQUE INDEX uq_enterprise_device_key
    ON enterprise_device (enterprise_id, device_key_id);
CREATE UNIQUE INDEX uq_enterprise_device_public_key
    ON enterprise_device (enterprise_id, public_key_digest);
CREATE INDEX ix_enterprise_device_status
    ON enterprise_device (enterprise_id, managed_status, compliance_status);

CREATE TABLE device_enrollment_grant (
    enrollment_grant_id UUID PRIMARY KEY,
    code_digest CHAR(64) NOT NULL UNIQUE,
    enterprise_id VARCHAR(160) NOT NULL,
    authorized_user_id VARCHAR(160) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    disabled_at TIMESTAMPTZ,
    CONSTRAINT ck_enrollment_code_digest
        CHECK (code_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_enrollment_expiry CHECK (expires_at > issued_at)
);

CREATE INDEX ix_enrollment_grant_owner
    ON device_enrollment_grant (enterprise_id, authorized_user_id, expires_at);

CREATE TABLE device_challenge (
    challenge_id UUID PRIMARY KEY,
    purpose VARCHAR(64) NOT NULL,
    verified_identity_id UUID NOT NULL
        REFERENCES enterprise_verified_identity (verified_identity_id),
    client_instance_id VARCHAR(160) NOT NULL,
    expected_device_key_id VARCHAR(160),
    expected_public_key_digest CHAR(64),
    nonce VARCHAR(256) NOT NULL,
    audience VARCHAR(256) NOT NULL,
    allowed_algorithms TEXT[] NOT NULL,
    challenge_digest CHAR(64) NOT NULL UNIQUE,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    consumed_by VARCHAR(160),
    consumed_request_digest CHAR(64),
    CONSTRAINT ck_challenge_digest
        CHECK (challenge_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_challenge_public_key_digest
        CHECK (expected_public_key_digest IS NULL
            OR expected_public_key_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_challenge_expiry CHECK (expires_at > issued_at),
    CONSTRAINT ck_challenge_algorithms_nonempty
        CHECK (cardinality(allowed_algorithms) > 0),
    CONSTRAINT ck_challenge_consumption_complete CHECK (
        (consumed_at IS NULL AND consumed_by IS NULL
            AND consumed_request_digest IS NULL)
        OR
        (consumed_at IS NOT NULL AND consumed_by IS NOT NULL
            AND consumed_request_digest ~ '^[a-f0-9]{64}$')
    )
);

CREATE INDEX ix_device_challenge_identity
    ON device_challenge (verified_identity_id, expires_at);
CREATE INDEX ix_device_challenge_pending
    ON device_challenge (expires_at)
    WHERE consumed_at IS NULL;
CREATE INDEX ix_device_challenge_consumed_request
    ON device_challenge (consumed_request_digest)
    WHERE consumed_request_digest IS NOT NULL;

CREATE TABLE access_token_issuance (
    token_id UUID PRIMARY KEY,
    token_digest CHAR(64) NOT NULL UNIQUE,
    enterprise_id VARCHAR(160) NOT NULL,
    user_id VARCHAR(160) NOT NULL,
    device_id VARCHAR(160) NOT NULL
        REFERENCES enterprise_device (device_id),
    client_instance_id VARCHAR(160) NOT NULL,
    permissions TEXT[] NOT NULL,
    identity_digest CHAR(64) NOT NULL,
    device_revision BIGINT NOT NULL CHECK (device_revision >= 0),
    permission_revision BIGINT NOT NULL CHECK (permission_revision >= 0),
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    challenge_id UUID NOT NULL UNIQUE
        REFERENCES device_challenge (challenge_id),
    CONSTRAINT ck_token_digest
        CHECK (token_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_token_identity_digest
        CHECK (identity_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_token_expiry CHECK (expires_at > issued_at)
);

CREATE INDEX ix_access_token_subject
    ON access_token_issuance (enterprise_id, user_id, device_id, expires_at);

CREATE TABLE enterprise_configuration_snapshot (
    snapshot_id VARCHAR(160) NOT NULL,
    revision CHAR(64) NOT NULL,
    digest CHAR(64) NOT NULL,
    schema_version VARCHAR(32) NOT NULL,
    document_json TEXT NOT NULL,
    etag VARCHAR(160) NOT NULL,
    active BOOLEAN NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL,
    inserted_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (snapshot_id, revision),
    CONSTRAINT ck_configuration_revision
        CHECK (revision ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_configuration_digest
        CHECK (digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_configuration_document
        CHECK (jsonb_typeof(document_json::jsonb) = 'object')
);

CREATE UNIQUE INDEX uq_configuration_snapshot_digest
    ON enterprise_configuration_snapshot (snapshot_id, digest);
CREATE UNIQUE INDEX uq_configuration_single_active
    ON enterprise_configuration_snapshot (active)
    WHERE active = TRUE;
CREATE UNIQUE INDEX uq_configuration_etag
    ON enterprise_configuration_snapshot (etag);

CREATE TABLE enterprise_package_document (
    package_id VARCHAR(160) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    revision CHAR(64) NOT NULL,
    digest CHAR(64) NOT NULL,
    document_json TEXT NOT NULL,
    inserted_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (package_id, revision),
    CONSTRAINT ck_package_kind CHECK (kind IN ('agent', 'skill')),
    CONSTRAINT ck_package_revision CHECK (revision ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_package_digest CHECK (digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_package_document
        CHECK (jsonb_typeof(document_json::jsonb) = 'object')
);

CREATE UNIQUE INDEX uq_package_document_digest
    ON enterprise_package_document (package_id, digest);

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

CREATE TABLE robothree_schema_version (
    version INTEGER PRIMARY KEY CHECK (version > 0),
    script_name VARCHAR(255) NOT NULL UNIQUE,
    script_digest CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL,
    release_version VARCHAR(128) NOT NULL,
    CONSTRAINT ck_robothree_schema_digest
        CHECK (script_digest ~ '^[a-f0-9]{64}$')
);
