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
    CONSTRAINT ck_device_public_key_digest CHECK (public_key_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_device_public_key_format CHECK (public_key_format IN ('spki_der_base64', 'x509_certificate_pem')),
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
    CONSTRAINT ck_enrollment_code_digest CHECK (code_digest ~ '^[a-f0-9]{64}$'),
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
    CONSTRAINT ck_challenge_digest CHECK (challenge_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_challenge_public_key_digest
        CHECK (expected_public_key_digest IS NULL
            OR expected_public_key_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_challenge_expiry CHECK (expires_at > issued_at),
    CONSTRAINT ck_challenge_algorithms_nonempty
        CHECK (cardinality(allowed_algorithms) > 0),
    CONSTRAINT ck_challenge_consumption_complete CHECK (
        (consumed_at IS NULL AND consumed_by IS NULL AND consumed_request_digest IS NULL)
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
    CONSTRAINT ck_token_digest CHECK (token_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_token_identity_digest CHECK (identity_digest ~ '^[a-f0-9]{64}$'),
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
    CONSTRAINT ck_configuration_revision CHECK (revision ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_configuration_digest CHECK (digest ~ '^[a-f0-9]{64}$'),
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

CREATE TABLE robothree_schema_version (
    version INTEGER PRIMARY KEY CHECK (version > 0),
    script_name VARCHAR(255) NOT NULL UNIQUE,
    script_digest CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL,
    release_version VARCHAR(128) NOT NULL,
    CONSTRAINT ck_robothree_schema_digest
        CHECK (script_digest ~ '^[a-f0-9]{64}$')
);
