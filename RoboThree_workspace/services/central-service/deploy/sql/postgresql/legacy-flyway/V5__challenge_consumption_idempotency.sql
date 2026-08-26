ALTER TABLE device_challenge
    ADD COLUMN consumed_request_digest CHAR(64);

ALTER TABLE device_challenge
    ADD CONSTRAINT ck_challenge_consumption_complete CHECK (
        (consumed_at IS NULL AND consumed_by IS NULL AND consumed_request_digest IS NULL)
        OR
        (consumed_at IS NOT NULL AND consumed_by IS NOT NULL
            AND consumed_request_digest ~ '^[a-f0-9]{64}$')
    );

CREATE INDEX ix_device_challenge_consumed_request
    ON device_challenge (consumed_request_digest)
    WHERE consumed_request_digest IS NOT NULL;
