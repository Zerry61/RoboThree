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
