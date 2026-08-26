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
        WHERE version > 7
    ) THEN
        RAISE EXCEPTION 'persistence.schema_too_new';
    END IF;

    SELECT script_name, script_digest
    INTO target_name, target_digest
    FROM robothree_schema_version
    WHERE version = 7;

    IF target_name IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_version_incomplete';
    END IF;

    IF (
        target_name = 'B0007__model_invocation_foundation.sql'
        AND target_digest = 'c7a5f29568587c3cfc48fab6766374b762f5a629c77f711ea20b7cbbc79d9140'
    ) THEN
        SELECT count(*) INTO ledger_count FROM robothree_schema_version;
        IF ledger_count <> 1 THEN
            RAISE EXCEPTION 'persistence.schema_unsupported_history';
        END IF;
    ELSIF (
        target_name = 'U0007__model_invocation_from_v0006.sql'
        AND target_digest = '6feb82c722ad8dc34ff0d94f8fe6b09de7fc55e7e773dc8f1f90a09b584c944a'
    ) THEN
        SELECT count(*) INTO ledger_count FROM robothree_schema_version;
        IF NOT (
            (
                ledger_count = 2
                AND EXISTS (
                    SELECT 1
                    FROM robothree_schema_version
                    WHERE version = 6
                      AND script_name = 'B0006__central_foundation.sql'
                      AND script_digest = '2d2d99172746aa7f2f5431a9c4273c1893694df0fa31eb8dddea8d48de2fd480'
                )
            )
            OR
            (
                ledger_count = 7
                AND EXISTS (
                    SELECT 1
                    FROM robothree_schema_version
                    WHERE version = 6
                      AND script_name = 'U0006__bridge_from_flyway_v5.sql'
                      AND script_digest = 'ff2e819ad5f80229035554b54ec802a7d2a3ef70fc7c665f138efc6bc0b37909'
                )
                AND (
                    SELECT count(*)
                    FROM robothree_schema_version
                    WHERE version BETWEEN 1 AND 7
                ) = 7
            )
        ) THEN
            RAISE EXCEPTION 'persistence.schema_version_incomplete';
        END IF;
    ELSE
        RAISE EXCEPTION 'persistence.schema_script_digest_mismatch';
    END IF;

    IF to_regclass(current_schema() || '.model_invocation_provider_attempt') IS NOT NULL
        OR to_regclass(current_schema() || '.model_invocation_usage_fact') IS NOT NULL
    THEN
        RAISE EXCEPTION 'persistence.schema_target_conflict';
    END IF;
END
$upgrade$;

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
