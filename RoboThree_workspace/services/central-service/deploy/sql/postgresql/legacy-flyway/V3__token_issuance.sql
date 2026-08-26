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
