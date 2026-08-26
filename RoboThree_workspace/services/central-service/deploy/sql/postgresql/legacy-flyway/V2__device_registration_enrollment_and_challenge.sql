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
    CONSTRAINT ck_challenge_digest CHECK (challenge_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_challenge_public_key_digest
        CHECK (expected_public_key_digest IS NULL
            OR expected_public_key_digest ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ck_challenge_expiry CHECK (expires_at > issued_at),
    CONSTRAINT ck_challenge_algorithms_nonempty
        CHECK (cardinality(allowed_algorithms) > 0)
);

CREATE INDEX ix_device_challenge_identity
    ON device_challenge (verified_identity_id, expires_at);
CREATE INDEX ix_device_challenge_pending
    ON device_challenge (expires_at)
    WHERE consumed_at IS NULL;
