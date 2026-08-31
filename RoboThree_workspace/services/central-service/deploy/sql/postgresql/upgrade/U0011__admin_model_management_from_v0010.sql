DO $upgrade$
DECLARE
    target_name TEXT;
    target_digest TEXT;
BEGIN
    IF to_regclass(current_schema() || '.robothree_schema_version') IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_ledger_missing';
    END IF;
    IF EXISTS (SELECT 1 FROM robothree_schema_version WHERE version > 10) THEN
        RAISE EXCEPTION 'persistence.schema_too_new';
    END IF;
    SELECT script_name, script_digest INTO target_name, target_digest
      FROM robothree_schema_version WHERE version = 10;
    IF target_name IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_version_incomplete';
    END IF;
    IF NOT (
        (target_name = 'B0010__enterprise_session_persistence.sql'
            AND target_digest = '5fb746ec65281894a47747ea10f0615feb88a3c818ace959951a8e1103205ae6')
        OR
        (target_name = 'U0010__enterprise_session_persistence_from_v0009.sql'
            AND target_digest = '1f276a223d9853be28a6d4f0ca0a3afff7cc42fc35dc46669e8b4289bda6af49')
    ) THEN
        RAISE EXCEPTION 'persistence.schema_script_digest_mismatch';
    END IF;
    IF to_regclass(current_schema() || '.admin_model_revision') IS NOT NULL THEN
        RAISE EXCEPTION 'persistence.schema_target_conflict';
    END IF;
END
$upgrade$;

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
