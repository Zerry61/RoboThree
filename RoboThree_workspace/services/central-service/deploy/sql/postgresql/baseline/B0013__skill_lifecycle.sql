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

CREATE TABLE model_invocation_provider_attempt (
    usage_authority VARCHAR(32) NOT NULL,
    authority_invocation_id UUID NOT NULL
        REFERENCES model_invocation (invocation_id),
    provider_attempt_key CHAR(64) NOT NULL,
    fencing_epoch BIGINT NOT NULL CHECK (fencing_epoch > 0),
    registered_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (
        usage_authority,
        authority_invocation_id,
        provider_attempt_key
    ),
    CONSTRAINT uq_model_invocation_provider_attempt_epoch UNIQUE (
        usage_authority,
        authority_invocation_id,
        fencing_epoch
    ),
    CONSTRAINT ck_model_invocation_provider_attempt_authority
        CHECK (usage_authority = 'central_enterprise'),
    CONSTRAINT ck_model_invocation_provider_attempt_digest
        CHECK (provider_attempt_key ~ '^[a-f0-9]{64}$')
);

CREATE INDEX ix_model_invocation_provider_attempt_invocation
    ON model_invocation_provider_attempt (
        authority_invocation_id,
        fencing_epoch
    );

CREATE TABLE model_invocation_usage_fact (
    usage_fact_id UUID PRIMARY KEY,
    usage_authority VARCHAR(32) NOT NULL,
    authority_invocation_id UUID NOT NULL,
    provider_attempt_key CHAR(64) NOT NULL,
    fencing_epoch BIGINT NOT NULL CHECK (fencing_epoch > 0),
    usage_digest CHAR(64) NOT NULL,
    source_protocol VARCHAR(32) NOT NULL,
    reporting_semantics_revision CHAR(64) NOT NULL,
    provider_input_tokens BIGINT NOT NULL CHECK (provider_input_tokens >= 0),
    provider_output_tokens BIGINT NOT NULL CHECK (provider_output_tokens >= 0),
    cache_read_input_tokens BIGINT CHECK (cache_read_input_tokens >= 0),
    cache_write_input_tokens BIGINT CHECK (cache_write_input_tokens >= 0),
    reasoning_output_tokens BIGINT CHECK (reasoning_output_tokens >= 0),
    normalized_total_input_tokens BIGINT NOT NULL
        CHECK (normalized_total_input_tokens >= 0),
    attempt_disposition VARCHAR(32) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_model_invocation_usage_attempt UNIQUE (
        usage_authority,
        authority_invocation_id,
        provider_attempt_key
    ),
    CONSTRAINT fk_model_invocation_usage_attempt FOREIGN KEY (
        usage_authority,
        authority_invocation_id,
        provider_attempt_key
    ) REFERENCES model_invocation_provider_attempt (
        usage_authority,
        authority_invocation_id,
        provider_attempt_key
    ),
    CONSTRAINT ck_model_invocation_usage_authority
        CHECK (usage_authority = 'central_enterprise'),
    CONSTRAINT ck_model_invocation_usage_digests CHECK (
        provider_attempt_key ~ '^[a-f0-9]{64}$'
        AND usage_digest ~ '^[a-f0-9]{64}$'
        AND reporting_semantics_revision ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_model_invocation_usage_protocol CHECK (
        source_protocol IN ('anthropic_compatible', 'openai_compatible')
    ),
    CONSTRAINT ck_model_invocation_usage_disposition CHECK (
        attempt_disposition IN ('terminal_winner', 'superseded_confirmed')
    ),
    CONSTRAINT ck_model_invocation_usage_reasoning_subset CHECK (
        reasoning_output_tokens IS NULL
        OR reasoning_output_tokens <= provider_output_tokens
    )
);

CREATE INDEX ix_model_invocation_usage_fact_invocation
    ON model_invocation_usage_fact (
        authority_invocation_id,
        fencing_epoch
    );

CREATE TABLE model_invocation_cache_context (
    invocation_id UUID PRIMARY KEY
        REFERENCES model_invocation (invocation_id),
    cache_execution_authority VARCHAR(32) NOT NULL,
    gateway_contract_version VARCHAR(32) NOT NULL,
    session_scope_digest CHAR(64) NOT NULL,
    cache_context_digest CHAR(64) NOT NULL,
    context_record_digest CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_model_invocation_cache_context_authority
        CHECK (cache_execution_authority = 'central_enterprise'),
    CONSTRAINT ck_model_invocation_cache_context_contract
        CHECK (gateway_contract_version = 'v1alpha2'),
    CONSTRAINT ck_model_invocation_cache_context_digests CHECK (
        session_scope_digest ~ '^[a-f0-9]{64}$'
        AND cache_context_digest ~ '^[a-f0-9]{64}$'
        AND context_record_digest ~ '^[a-f0-9]{64}$'
    )
);

CREATE INDEX ix_model_invocation_cache_context_scope
    ON model_invocation_cache_context (
        cache_execution_authority,
        session_scope_digest
    );

CREATE TABLE model_invocation_prompt_cache_plan (
    invocation_id UUID PRIMARY KEY
        REFERENCES model_invocation_cache_context (invocation_id),
    cache_context_digest CHAR(64) NOT NULL,
    cache_scope_id_digest CHAR(64) NOT NULL,
    static_source_lock_digest CHAR(64) NOT NULL,
    static_prefix_digest CHAR(64) NOT NULL,
    compatibility_fingerprint_digest CHAR(64) NOT NULL,
    cache_key_digest CHAR(64),
    cache_policy_revision CHAR(64) NOT NULL,
    binding_revision CHAR(64) NOT NULL,
    binding_digest CHAR(64) NOT NULL,
    profile_id VARCHAR(160) NOT NULL,
    profile_revision CHAR(64) NOT NULL,
    profile_digest CHAR(64) NOT NULL,
    provider_projection_mode VARCHAR(64) NOT NULL,
    eligible BOOLEAN NOT NULL,
    skip_reason VARCHAR(64),
    plan_digest CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_prompt_cache_plan_digests CHECK (
        cache_context_digest ~ '^[a-f0-9]{64}$'
        AND cache_scope_id_digest ~ '^[a-f0-9]{64}$'
        AND static_source_lock_digest ~ '^[a-f0-9]{64}$'
        AND static_prefix_digest ~ '^[a-f0-9]{64}$'
        AND compatibility_fingerprint_digest ~ '^[a-f0-9]{64}$'
        AND (cache_key_digest IS NULL OR cache_key_digest ~ '^[a-f0-9]{64}$')
        AND cache_policy_revision ~ '^[a-f0-9]{64}$'
        AND binding_revision ~ '^[a-f0-9]{64}$'
        AND binding_digest ~ '^[a-f0-9]{64}$'
        AND profile_revision ~ '^[a-f0-9]{64}$'
        AND profile_digest ~ '^[a-f0-9]{64}$'
        AND plan_digest ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_prompt_cache_plan_projection_mode CHECK (
        provider_projection_mode IN (
            'anthropic_explicit',
            'openai_provider_automatic_observed',
            'openai_prompt_cache_key'
        )
    ),
    CONSTRAINT ck_prompt_cache_plan_skip_reason CHECK (
        skip_reason IS NULL OR skip_reason IN (
            'profile_disabled',
            'provider_automatic_observed',
            'no_static_prefix',
            'unsupported_connection_mode',
            'isolation_unproven',
            'compatibility_unreviewed'
        )
    ),
    CONSTRAINT ck_prompt_cache_plan_eligibility CHECK (
        (eligible = TRUE AND skip_reason IS NULL)
        OR (eligible = FALSE AND skip_reason IS NOT NULL)
    ),
    CONSTRAINT ck_prompt_cache_plan_key_mode CHECK (
        (provider_projection_mode = 'openai_prompt_cache_key'
            AND ((eligible = TRUE AND cache_key_digest IS NOT NULL)
                OR eligible = FALSE))
        OR (provider_projection_mode <> 'openai_prompt_cache_key'
            AND cache_key_digest IS NULL)
    )
);

CREATE INDEX ix_prompt_cache_plan_monotonicity
    ON model_invocation_prompt_cache_plan (
        cache_scope_id_digest,
        static_source_lock_digest,
        binding_revision,
        binding_digest,
        profile_revision,
        profile_digest,
        compatibility_fingerprint_digest,
        cache_policy_revision,
        provider_projection_mode,
        created_at DESC
    );

CREATE INDEX ix_prompt_cache_plan_key
    ON model_invocation_prompt_cache_plan (cache_key_digest)
    WHERE cache_key_digest IS NOT NULL;

CREATE TABLE robothree_schema_version (
    version INTEGER PRIMARY KEY CHECK (version > 0),
    script_name VARCHAR(255) NOT NULL UNIQUE,
    script_digest CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL,
    release_version VARCHAR(128) NOT NULL,
    CONSTRAINT ck_robothree_schema_digest
        CHECK (script_digest ~ '^[a-f0-9]{64}$')
);

ALTER TABLE device_challenge
    ADD CONSTRAINT uq_device_challenge_identity_pair
        UNIQUE (challenge_id, verified_identity_id);

CREATE TABLE enterprise_session_challenge_binding (
    challenge_id UUID PRIMARY KEY,
    verified_identity_id UUID NOT NULL,
    claims_profile VARCHAR(64) NOT NULL,
    identity_source_revision VARCHAR(160) NOT NULL,
    current_client_instance_id UUID NOT NULL,
    audience VARCHAR(256) NOT NULL,
    required_permissions TEXT[] NOT NULL,
    device_key_id VARCHAR(160) NOT NULL,
    correlation_id UUID NOT NULL,
    binding_digest CHAR(64) NOT NULL,
    record_digest CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_enterprise_session_challenge_identity
        FOREIGN KEY (challenge_id, verified_identity_id)
        REFERENCES device_challenge (challenge_id, verified_identity_id),
    CONSTRAINT uq_enterprise_session_challenge_correlation
        UNIQUE (correlation_id),
    CONSTRAINT uq_enterprise_session_challenge_binding_digest
        UNIQUE (binding_digest),
    CONSTRAINT uq_enterprise_session_challenge_binding_identity
        UNIQUE (
            challenge_id,
            binding_digest,
            verified_identity_id,
            identity_source_revision
        ),
    CONSTRAINT ck_enterprise_session_challenge_profile
        CHECK (claims_profile = 'eipc.session-token.v1'),
    CONSTRAINT ck_enterprise_session_challenge_audience
        CHECK (audience = 'robothree.enterprise-gateway'),
    CONSTRAINT ck_enterprise_session_challenge_source
        CHECK (char_length(identity_source_revision) BETWEEN 1 AND 160),
    CONSTRAINT ck_enterprise_session_challenge_device_key
        CHECK (char_length(device_key_id) BETWEEN 1 AND 160),
    CONSTRAINT ck_enterprise_session_challenge_digests CHECK (
        binding_digest ~ '^[a-f0-9]{64}$'
        AND record_digest ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_enterprise_session_challenge_permissions CHECK (
        cardinality(required_permissions) BETWEEN 1 AND 32
        AND array_position(required_permissions, NULL) IS NULL
        AND required_permissions @> ARRAY['configuration.read']::TEXT[]
        AND required_permissions <@ ARRAY[
            'configuration.read',
            'model.use',
            'tool.use',
            'agent.use',
            'skill.use',
            'knowledge.use',
            'personal_model.configure'
        ]::TEXT[]
    )
);

CREATE INDEX ix_enterprise_session_challenge_identity_created
    ON enterprise_session_challenge_binding (verified_identity_id, created_at);

CREATE TABLE enterprise_session_lease_issuance (
    token_id UUID PRIMARY KEY,
    token_digest CHAR(64) NOT NULL,
    claims_profile VARCHAR(64) NOT NULL,
    issuer VARCHAR(160) NOT NULL,
    audience VARCHAR(256) NOT NULL,
    enterprise_id VARCHAR(160) NOT NULL,
    user_id VARCHAR(160) NOT NULL,
    device_id VARCHAR(160) NOT NULL,
    verified_identity_id UUID NOT NULL,
    identity_source_revision VARCHAR(160) NOT NULL,
    client_instance_id UUID NOT NULL,
    permissions TEXT[] NOT NULL,
    identity_digest CHAR(64) NOT NULL,
    device_source_revision BIGINT NOT NULL,
    device_revision_digest VARCHAR(71) NOT NULL,
    permission_revision_digest VARCHAR(71) NOT NULL,
    compatibility_revision VARCHAR(160) NOT NULL,
    trust_source VARCHAR(80) NOT NULL,
    managed_status VARCHAR(32) NOT NULL,
    compliance_status VARCHAR(32) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    trust_evaluated_at TIMESTAMPTZ NOT NULL,
    challenge_id UUID NOT NULL,
    challenge_binding_digest CHAR(64) NOT NULL,
    session_assertion_revision VARCHAR(71) NOT NULL,
    session_assertion_digest VARCHAR(71) NOT NULL,
    session_assertion_json TEXT NOT NULL,
    device_trust_decision_revision VARCHAR(71) NOT NULL,
    device_trust_decision_digest VARCHAR(71) NOT NULL,
    device_trust_decision_json TEXT NOT NULL,
    source_decision_digest VARCHAR(71) NOT NULL,
    request_digest CHAR(64) NOT NULL,
    record_digest CHAR(64) NOT NULL,
    CONSTRAINT uq_enterprise_session_token_digest UNIQUE (token_digest),
    CONSTRAINT uq_enterprise_session_challenge_issuance UNIQUE (challenge_id),
    CONSTRAINT fk_enterprise_session_lease_binding
        FOREIGN KEY (
            challenge_id,
            challenge_binding_digest,
            verified_identity_id,
            identity_source_revision
        ) REFERENCES enterprise_session_challenge_binding (
            challenge_id,
            binding_digest,
            verified_identity_id,
            identity_source_revision
        ),
    CONSTRAINT fk_enterprise_session_lease_identity
        FOREIGN KEY (verified_identity_id)
        REFERENCES enterprise_verified_identity (verified_identity_id),
    CONSTRAINT fk_enterprise_session_lease_device
        FOREIGN KEY (device_id) REFERENCES enterprise_device (device_id),
    CONSTRAINT ck_enterprise_session_lease_profile
        CHECK (claims_profile = 'eipc.session-token.v1'),
    CONSTRAINT ck_enterprise_session_lease_audience
        CHECK (audience = 'robothree.enterprise-gateway'),
    CONSTRAINT ck_enterprise_session_lease_owner_lengths CHECK (
        char_length(issuer) BETWEEN 1 AND 160
        AND char_length(enterprise_id) BETWEEN 1 AND 160
        AND char_length(user_id) BETWEEN 1 AND 160
        AND char_length(device_id) BETWEEN 1 AND 160
        AND char_length(identity_source_revision) BETWEEN 1 AND 160
        AND char_length(compatibility_revision) BETWEEN 1 AND 160
        AND char_length(trust_source) BETWEEN 1 AND 80
    ),
    CONSTRAINT ck_enterprise_session_lease_status CHECK (
        managed_status IN ('managed', 'not_managed')
        AND compliance_status IN ('compliant', 'not_compliant', 'unknown')
    ),
    CONSTRAINT ck_enterprise_session_lease_time CHECK (
        expires_at > issued_at AND trust_evaluated_at <= issued_at
    ),
    CONSTRAINT ck_enterprise_session_lease_source_revision
        CHECK (device_source_revision >= 0),
    CONSTRAINT ck_enterprise_session_lease_raw_digests CHECK (
        token_digest ~ '^[a-f0-9]{64}$'
        AND identity_digest ~ '^[a-f0-9]{64}$'
        AND challenge_binding_digest ~ '^[a-f0-9]{64}$'
        AND request_digest ~ '^[a-f0-9]{64}$'
        AND record_digest ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_enterprise_session_lease_wire_digests CHECK (
        device_revision_digest ~ '^sha256:[a-f0-9]{64}$'
        AND permission_revision_digest ~ '^sha256:[a-f0-9]{64}$'
        AND session_assertion_revision ~ '^sha256:[a-f0-9]{64}$'
        AND session_assertion_digest ~ '^sha256:[a-f0-9]{64}$'
        AND device_trust_decision_revision ~ '^sha256:[a-f0-9]{64}$'
        AND device_trust_decision_digest ~ '^sha256:[a-f0-9]{64}$'
        AND source_decision_digest ~ '^sha256:[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_enterprise_session_lease_permissions CHECK (
        cardinality(permissions) BETWEEN 1 AND 32
        AND array_position(permissions, NULL) IS NULL
        AND permissions @> ARRAY['configuration.read']::TEXT[]
        AND permissions <@ ARRAY[
            'configuration.read',
            'model.use',
            'tool.use',
            'agent.use',
            'skill.use',
            'knowledge.use',
            'personal_model.configure'
        ]::TEXT[]
    ),
    CONSTRAINT ck_enterprise_session_lease_documents CHECK (
        octet_length(session_assertion_json) BETWEEN 2 AND 32768
        AND octet_length(device_trust_decision_json) BETWEEN 2 AND 32768
        AND jsonb_typeof(session_assertion_json::jsonb) = 'object'
        AND jsonb_typeof(device_trust_decision_json::jsonb) = 'object'
    )
);

CREATE INDEX ix_enterprise_session_lease_subject_expiry
    ON enterprise_session_lease_issuance (
        enterprise_id,
        user_id,
        device_id,
        expires_at
    );

CREATE INDEX ix_enterprise_session_lease_source_decision
    ON enterprise_session_lease_issuance (source_decision_digest);

CREATE TABLE admin_model_revision (
    model_id VARCHAR(200) NOT NULL,
    model_revision VARCHAR(71) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    record_json TEXT NOT NULL,
    record_digest CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (model_id, model_revision),
    CONSTRAINT ck_admin_model_revision_digest CHECK (
        model_revision ~ '^sha256:[a-f0-9]{64}$'
        AND record_digest ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_admin_model_revision_document CHECK (
        octet_length(record_json) BETWEEN 2 AND 32768
        AND jsonb_typeof(record_json::jsonb) = 'object'
    )
);

CREATE INDEX ix_admin_model_revision_display
    ON admin_model_revision (display_name, model_id, created_at);

CREATE TABLE admin_model_head (
    model_id VARCHAR(200) PRIMARY KEY,
    model_revision VARCHAR(71) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_admin_model_head_revision
        FOREIGN KEY (model_id, model_revision)
        REFERENCES admin_model_revision (model_id, model_revision)
);

CREATE TABLE admin_model_default (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    model_id VARCHAR(200) NOT NULL,
    model_revision VARCHAR(71) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_admin_model_default_revision
        FOREIGN KEY (model_id, model_revision)
        REFERENCES admin_model_revision (model_id, model_revision)
);

CREATE TABLE admin_model_credential (
    credential_reference VARCHAR(240) NOT NULL,
    model_id VARCHAR(200) NOT NULL,
    credential_revision VARCHAR(71) NOT NULL,
    key_id VARCHAR(80) NOT NULL,
    nonce BYTEA NOT NULL,
    ciphertext BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (credential_reference, credential_revision),
    CONSTRAINT ck_admin_model_credential_revision
        CHECK (credential_revision ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT ck_admin_model_credential_ciphertext CHECK (
        octet_length(nonce) = 12
        AND octet_length(ciphertext) BETWEEN 17 AND 16400
    )
);

CREATE INDEX ix_admin_model_credential_model
    ON admin_model_credential (model_id, created_at);

CREATE TABLE admin_model_gateway_binding (
    decision_digest CHAR(64) PRIMARY KEY,
    binding_revision VARCHAR(71) NOT NULL,
    binding_digest VARCHAR(71) NOT NULL,
    binding_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_admin_model_gateway_binding_digests CHECK (
        decision_digest ~ '^[a-f0-9]{64}$'
        AND binding_revision ~ '^sha256:[a-f0-9]{64}$'
        AND binding_digest ~ '^sha256:[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_admin_model_gateway_binding_document CHECK (
        octet_length(binding_json) BETWEEN 2 AND 32768
        AND jsonb_typeof(binding_json::jsonb) = 'object'
    )
);

CREATE TABLE admin_model_command_receipt (
    command_id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    command_digest VARCHAR(71) NOT NULL,
    result_json TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_admin_model_command_digest
        CHECK (command_digest ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT ck_admin_model_command_result CHECK (
        octet_length(result_json) BETWEEN 2 AND 32768
        AND jsonb_typeof(result_json::jsonb) = 'object'
    )
);

CREATE TABLE admin_model_audit (
    event_id UUID PRIMARY KEY,
    actor_summary VARCHAR(200) NOT NULL,
    action VARCHAR(80) NOT NULL,
    model_id VARCHAR(200) NOT NULL,
    model_revision VARCHAR(71) NOT NULL,
    changed_field_names TEXT[] NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    result VARCHAR(40) NOT NULL,
    correlation_id UUID NOT NULL,
    CONSTRAINT ck_admin_model_audit_revision
        CHECK (model_revision ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT ck_admin_model_audit_fields CHECK (
        cardinality(changed_field_names) BETWEEN 1 AND 16
        AND array_position(changed_field_names, NULL) IS NULL
    )
);

CREATE INDEX ix_admin_model_audit_time
    ON admin_model_audit (occurred_at DESC, event_id);

CREATE TABLE robot_avatar_asset (
    asset_id VARCHAR(200) PRIMARY KEY,
    creator_subject VARCHAR(200) NOT NULL,
    media_type VARCHAR(20) NOT NULL,
    content_digest VARCHAR(71) NOT NULL UNIQUE,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    content_bytes BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_robot_avatar_media_type CHECK (media_type IN ('image/png', 'image/jpeg')),
    CONSTRAINT ck_robot_avatar_digest CHECK (content_digest ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT ck_robot_avatar_dimensions CHECK (
        width BETWEEN 1 AND 1024
        AND height BETWEEN 1 AND 1024
        AND width::BIGINT * height::BIGINT <= 1048576
    ),
    CONSTRAINT ck_robot_avatar_size CHECK (octet_length(content_bytes) BETWEEN 1 AND 2097152)
);

CREATE TABLE robot_draft_revision (
    robot_id VARCHAR(200) NOT NULL,
    draft_revision VARCHAR(71) NOT NULL,
    instruction_revision VARCHAR(71) NOT NULL,
    creator_subject VARCHAR(200) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    record_json TEXT NOT NULL,
    record_digest CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (robot_id, draft_revision),
    CONSTRAINT ck_robot_draft_id CHECK (robot_id ~ '^agent\.[a-z0-9][a-z0-9._:-]*$'),
    CONSTRAINT ck_robot_draft_reserved CHECK (robot_id <> 'agent.general'),
    CONSTRAINT ck_robot_draft_digests CHECK (
        draft_revision ~ '^sha256:[a-f0-9]{64}$'
        AND instruction_revision ~ '^sha256:[a-f0-9]{64}$'
        AND record_digest ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_robot_draft_document CHECK (
        octet_length(record_json) BETWEEN 2 AND 524288
        AND jsonb_typeof(record_json::jsonb) = 'object'
    )
);

CREATE TABLE robot_draft_head (
    robot_id VARCHAR(200) PRIMARY KEY,
    draft_revision VARCHAR(71) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_robot_draft_head_revision FOREIGN KEY (robot_id, draft_revision)
        REFERENCES robot_draft_revision (robot_id, draft_revision)
);

CREATE TABLE robot_test_fact (
    robot_id VARCHAR(200) NOT NULL,
    draft_revision VARCHAR(71) NOT NULL,
    state VARCHAR(20) NOT NULL,
    task_id VARCHAR(160),
    tested_at TIMESTAMPTZ,
    safe_reason VARCHAR(1000),
    PRIMARY KEY (robot_id, draft_revision),
    CONSTRAINT fk_robot_test_draft FOREIGN KEY (robot_id, draft_revision)
        REFERENCES robot_draft_revision (robot_id, draft_revision),
    CONSTRAINT ck_robot_test_state CHECK (state IN ('running', 'passed', 'failed')),
    CONSTRAINT ck_robot_test_terminal CHECK (
        (state = 'running' AND task_id IS NOT NULL AND tested_at IS NULL)
        OR (state = 'passed' AND task_id IS NOT NULL AND tested_at IS NOT NULL AND safe_reason IS NULL)
        OR (state = 'failed' AND task_id IS NOT NULL AND tested_at IS NOT NULL AND safe_reason IS NOT NULL)
    )
);

CREATE TABLE robot_submission (
    submission_id UUID PRIMARY KEY,
    submission_revision VARCHAR(71) NOT NULL,
    robot_id VARCHAR(200) NOT NULL,
    draft_revision VARCHAR(71) NOT NULL,
    creator_subject VARCHAR(200) NOT NULL,
    state VARCHAR(24) NOT NULL,
    package_json TEXT NOT NULL,
    package_digest VARCHAR(71) NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL,
    reviewed_at TIMESTAMPTZ,
    reviewer_summary VARCHAR(200),
    rejection_reason VARCHAR(1000),
    CONSTRAINT fk_robot_submission_draft FOREIGN KEY (robot_id, draft_revision)
        REFERENCES robot_draft_revision (robot_id, draft_revision),
    CONSTRAINT ck_robot_submission_state CHECK (
        state IN ('pending_review', 'approved', 'rejected', 'withdrawn')
    ),
    CONSTRAINT ck_robot_submission_digests CHECK (
        submission_revision ~ '^sha256:[a-f0-9]{64}$'
        AND package_digest ~ '^sha256:[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_robot_submission_document CHECK (
        octet_length(package_json) BETWEEN 2 AND 1048576
        AND jsonb_typeof(package_json::jsonb) = 'object'
    ),
    CONSTRAINT ck_robot_submission_review CHECK (
        (state = 'pending_review' AND reviewed_at IS NULL AND reviewer_summary IS NULL AND rejection_reason IS NULL)
        OR (state = 'withdrawn' AND reviewed_at IS NOT NULL AND rejection_reason IS NULL)
        OR (state = 'approved' AND reviewed_at IS NOT NULL AND reviewer_summary IS NOT NULL AND rejection_reason IS NULL)
        OR (state = 'rejected' AND reviewed_at IS NOT NULL AND reviewer_summary IS NOT NULL AND rejection_reason IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_robot_submission_pending
    ON robot_submission (robot_id) WHERE state = 'pending_review';
CREATE INDEX ix_robot_submission_review
    ON robot_submission (state, submitted_at, submission_id);

CREATE TABLE robot_release (
    robot_id VARCHAR(200) NOT NULL,
    release_revision VARCHAR(71) NOT NULL,
    submission_id UUID NOT NULL UNIQUE,
    package_digest VARCHAR(71) NOT NULL,
    agent_definition_json TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (robot_id, release_revision),
    CONSTRAINT fk_robot_release_submission FOREIGN KEY (submission_id)
        REFERENCES robot_submission (submission_id),
    CONSTRAINT ck_robot_release_digests CHECK (
        release_revision ~ '^sha256:[a-f0-9]{64}$'
        AND package_digest ~ '^sha256:[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_robot_release_document CHECK (
        octet_length(agent_definition_json) BETWEEN 2 AND 524288
        AND jsonb_typeof(agent_definition_json::jsonb) = 'object'
    )
);

CREATE TABLE robot_lifecycle_command_receipt (
    command_id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    command_digest VARCHAR(71) NOT NULL,
    result_json TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_robot_command_digest CHECK (command_digest ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT ck_robot_command_result CHECK (
        octet_length(result_json) BETWEEN 2 AND 65536
        AND jsonb_typeof(result_json::jsonb) = 'object'
    )
);

CREATE TABLE robot_lifecycle_audit (
    event_id UUID PRIMARY KEY,
    actor_summary VARCHAR(200) NOT NULL,
    action VARCHAR(80) NOT NULL,
    robot_id VARCHAR(200) NOT NULL,
    object_revision VARCHAR(71) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    result VARCHAR(40) NOT NULL,
    correlation_id UUID NOT NULL,
    CONSTRAINT ck_robot_audit_revision CHECK (object_revision ~ '^sha256:[a-f0-9]{64}$')
);

CREATE INDEX ix_robot_lifecycle_audit_time
    ON robot_lifecycle_audit (occurred_at DESC, event_id);

CREATE TABLE skill_package_blobs (
    package_digest VARCHAR(71) PRIMARY KEY,
    archive_digest VARCHAR(71) NOT NULL,
    manifest_digest VARCHAR(71) NOT NULL,
    skill_markdown_digest VARCHAR(71) NOT NULL,
    technical_name VARCHAR(96) NOT NULL,
    file_count INTEGER NOT NULL,
    expanded_byte_count BIGINT NOT NULL,
    canonical_zip_bytes BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_skill_package_digests CHECK (
        package_digest ~ '^sha256:[a-f0-9]{64}$'
        AND archive_digest ~ '^sha256:[a-f0-9]{64}$'
        AND manifest_digest ~ '^sha256:[a-f0-9]{64}$'
        AND skill_markdown_digest ~ '^sha256:[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_skill_package_name CHECK (
        technical_name ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
    ),
    CONSTRAINT ck_skill_package_bounds CHECK (
        file_count BETWEEN 1 AND 4096
        AND expanded_byte_count BETWEEN 1 AND 536870912
        AND octet_length(canonical_zip_bytes) BETWEEN 1 AND 209715200
    )
);

CREATE TABLE skill_draft_revisions (
    skill_id VARCHAR(200) NOT NULL,
    draft_revision VARCHAR(71) NOT NULL,
    creator_subject VARCHAR(200) NOT NULL,
    source_kind VARCHAR(24) NOT NULL,
    package_digest VARCHAR(71) NOT NULL,
    technical_name VARCHAR(96) NOT NULL,
    display_title VARCHAR(128) NOT NULL,
    metadata_json TEXT NOT NULL,
    record_digest CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (skill_id, draft_revision),
    CONSTRAINT fk_skill_draft_package FOREIGN KEY (package_digest)
        REFERENCES skill_package_blobs (package_digest),
    CONSTRAINT ck_skill_draft_id CHECK (skill_id ~ '^skill\.[a-z0-9][a-z0-9._:-]*$'),
    CONSTRAINT ck_skill_draft_source CHECK (source_kind IN ('personal_creator', 'admin_upload')),
    CONSTRAINT ck_skill_draft_revision CHECK (
        draft_revision ~ '^sha256:[a-f0-9]{64}$'
        AND record_digest ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_skill_draft_document CHECK (
        octet_length(metadata_json) BETWEEN 2 AND 524288
        AND jsonb_typeof(metadata_json::jsonb) = 'object'
    )
);

CREATE TABLE skill_drafts (
    skill_id VARCHAR(200) PRIMARY KEY,
    draft_revision VARCHAR(71) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_skill_draft_head FOREIGN KEY (skill_id, draft_revision)
        REFERENCES skill_draft_revisions (skill_id, draft_revision)
);

CREATE TABLE skill_test_facts (
    skill_id VARCHAR(200) NOT NULL,
    draft_revision VARCHAR(71) NOT NULL,
    state VARCHAR(20) NOT NULL,
    task_id VARCHAR(160) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    safe_summary VARCHAR(1000),
    result_digest VARCHAR(71),
    PRIMARY KEY (skill_id, draft_revision),
    CONSTRAINT fk_skill_test_draft FOREIGN KEY (skill_id, draft_revision)
        REFERENCES skill_draft_revisions (skill_id, draft_revision),
    CONSTRAINT ck_skill_test_state CHECK (state IN ('running', 'passed', 'failed')),
    CONSTRAINT ck_skill_test_result CHECK (
        (state = 'running' AND completed_at IS NULL AND safe_summary IS NULL AND result_digest IS NULL)
        OR (state = 'passed' AND completed_at IS NOT NULL AND safe_summary IS NULL
            AND result_digest ~ '^sha256:[a-f0-9]{64}$')
        OR (state = 'failed' AND completed_at IS NOT NULL AND safe_summary IS NOT NULL
            AND result_digest ~ '^sha256:[a-f0-9]{64}$')
    )
);

CREATE TABLE skill_test_operations (
    operation_id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    skill_id VARCHAR(200) NOT NULL,
    draft_revision VARCHAR(71) NOT NULL,
    source_kind VARCHAR(32) NOT NULL,
    state VARCHAR(20) NOT NULL,
    task_id VARCHAR(160),
    safe_summary VARCHAR(1000),
    result_digest VARCHAR(71),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_skill_test_operation_draft FOREIGN KEY (skill_id, draft_revision)
        REFERENCES skill_draft_revisions (skill_id, draft_revision),
    CONSTRAINT ck_skill_test_operation_source CHECK (source_kind IN ('admin_upload')),
    CONSTRAINT ck_skill_test_operation_state CHECK (
        state IN ('accepted', 'running', 'succeeded', 'failed')),
    CONSTRAINT ck_skill_test_operation_result CHECK (
        (state = 'accepted' AND task_id IS NULL AND safe_summary IS NULL AND result_digest IS NULL)
        OR (state = 'running' AND task_id IS NOT NULL AND safe_summary IS NULL AND result_digest IS NULL)
        OR (state = 'succeeded' AND task_id IS NOT NULL AND safe_summary IS NULL
            AND result_digest ~ '^sha256:[a-f0-9]{64}$')
        OR (state = 'failed' AND safe_summary IS NOT NULL
            AND result_digest ~ '^sha256:[a-f0-9]{64}$')
    )
);

CREATE TABLE skill_submissions (
    submission_id UUID PRIMARY KEY,
    submission_revision VARCHAR(71) NOT NULL,
    skill_id VARCHAR(200) NOT NULL,
    draft_revision VARCHAR(71) NOT NULL,
    creator_subject VARCHAR(200) NOT NULL,
    semantic_version VARCHAR(32) NOT NULL,
    change_summary VARCHAR(2000) NOT NULL,
    state VARCHAR(24) NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL,
    reviewed_at TIMESTAMPTZ,
    reviewer_summary VARCHAR(200),
    rejection_reason VARCHAR(1000),
    CONSTRAINT fk_skill_submission_draft FOREIGN KEY (skill_id, draft_revision)
        REFERENCES skill_draft_revisions (skill_id, draft_revision),
    CONSTRAINT ck_skill_submission_revision CHECK (
        submission_revision ~ '^sha256:[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_skill_submission_semver CHECK (
        semantic_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
    ),
    CONSTRAINT ck_skill_submission_state CHECK (
        state IN ('pending_review', 'approved', 'rejected', 'withdrawn')
    ),
    CONSTRAINT ck_skill_submission_review CHECK (
        (state = 'pending_review' AND reviewed_at IS NULL
            AND reviewer_summary IS NULL AND rejection_reason IS NULL)
        OR (state = 'withdrawn' AND reviewed_at IS NOT NULL
            AND reviewer_summary IS NULL AND rejection_reason IS NULL)
        OR (state = 'approved' AND reviewed_at IS NOT NULL
            AND reviewer_summary IS NOT NULL AND rejection_reason IS NULL)
        OR (state = 'rejected' AND reviewed_at IS NOT NULL
            AND reviewer_summary IS NOT NULL AND rejection_reason IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_skill_submission_pending
    ON skill_submissions (skill_id) WHERE state = 'pending_review';
CREATE INDEX ix_skill_submission_review
    ON skill_submissions (state, submitted_at DESC, submission_id);

CREATE TABLE skill_releases (
    skill_id VARCHAR(200) NOT NULL,
    release_revision VARCHAR(71) NOT NULL,
    submission_id UUID UNIQUE,
    draft_revision VARCHAR(71) NOT NULL,
    package_digest VARCHAR(71) NOT NULL,
    semantic_version VARCHAR(32) NOT NULL,
    source_kind VARCHAR(24) NOT NULL,
    release_json TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (skill_id, release_revision),
    CONSTRAINT fk_skill_release_submission FOREIGN KEY (submission_id)
        REFERENCES skill_submissions (submission_id),
    CONSTRAINT fk_skill_release_draft FOREIGN KEY (skill_id, draft_revision)
        REFERENCES skill_draft_revisions (skill_id, draft_revision),
    CONSTRAINT fk_skill_release_package FOREIGN KEY (package_digest)
        REFERENCES skill_package_blobs (package_digest),
    CONSTRAINT ck_skill_release_revision CHECK (
        release_revision ~ '^sha256:[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_skill_release_source CHECK (source_kind IN ('personal_creator', 'admin_upload')),
    CONSTRAINT ck_skill_release_document CHECK (
        octet_length(release_json) BETWEEN 2 AND 524288
        AND jsonb_typeof(release_json::jsonb) = 'object'
    )
);

CREATE TABLE skill_lifecycle_command_receipts (
    command_id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    command_digest VARCHAR(71) NOT NULL,
    result_json TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_skill_command_digest CHECK (command_digest ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT ck_skill_command_result CHECK (
        octet_length(result_json) BETWEEN 2 AND 65536
        AND jsonb_typeof(result_json::jsonb) = 'object'
    )
);

CREATE TABLE skill_audit_events (
    event_id UUID PRIMARY KEY,
    actor_summary VARCHAR(200) NOT NULL,
    action VARCHAR(80) NOT NULL,
    skill_id VARCHAR(200) NOT NULL,
    object_revision VARCHAR(71) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    result VARCHAR(40) NOT NULL,
    correlation_id UUID NOT NULL,
    CONSTRAINT ck_skill_audit_revision CHECK (object_revision ~ '^sha256:[a-f0-9]{64}$')
);

CREATE INDEX ix_skill_audit_time
    ON skill_audit_events (occurred_at DESC, event_id);
