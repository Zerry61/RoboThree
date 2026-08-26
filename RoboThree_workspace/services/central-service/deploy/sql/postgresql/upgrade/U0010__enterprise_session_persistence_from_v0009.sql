DO $upgrade$
DECLARE
    target_name TEXT;
    target_digest TEXT;
BEGIN
    IF to_regclass(current_schema() || '.robothree_schema_version') IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_ledger_missing';
    END IF;

    IF EXISTS (SELECT 1 FROM robothree_schema_version WHERE version > 9) THEN
        RAISE EXCEPTION 'persistence.schema_too_new';
    END IF;

    SELECT script_name, script_digest
      INTO target_name, target_digest
      FROM robothree_schema_version
     WHERE version = 9;

    IF target_name IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_version_incomplete';
    END IF;

    IF NOT (
        (target_name = 'B0009__prompt_cache_planning.sql'
            AND target_digest = '8f21541e794a33c5c0123b61fde3f354a685cc59b157184a4cce426839608dac')
        OR
        (target_name = 'U0009__prompt_cache_planning_from_v0008.sql'
            AND target_digest = '9c158e5621b618dec85655e778383e0869245c7815bf999cc1c161400daa29f6')
    ) THEN
        RAISE EXCEPTION 'persistence.schema_script_digest_mismatch';
    END IF;

    IF to_regclass(current_schema() || '.enterprise_session_challenge_binding') IS NOT NULL
        OR to_regclass(current_schema() || '.enterprise_session_lease_issuance') IS NOT NULL
    THEN
        RAISE EXCEPTION 'persistence.schema_target_conflict';
    END IF;
END
$upgrade$;

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
        UNIQUE (challenge_id, binding_digest, verified_identity_id, identity_source_revision),
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
            'configuration.read', 'model.use', 'tool.use', 'agent.use',
            'skill.use', 'knowledge.use', 'personal_model.configure'
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
            challenge_id, challenge_binding_digest,
            verified_identity_id, identity_source_revision
        ) REFERENCES enterprise_session_challenge_binding (
            challenge_id, binding_digest,
            verified_identity_id, identity_source_revision
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
            'configuration.read', 'model.use', 'tool.use', 'agent.use',
            'skill.use', 'knowledge.use', 'personal_model.configure'
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
        enterprise_id, user_id, device_id, expires_at
    );

CREATE INDEX ix_enterprise_session_lease_source_decision
    ON enterprise_session_lease_issuance (source_decision_digest);
