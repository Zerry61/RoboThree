DO $upgrade$
DECLARE
    target_name TEXT;
    target_digest TEXT;
BEGIN
    IF to_regclass(current_schema() || '.robothree_schema_version') IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_ledger_missing';
    END IF;

    IF EXISTS (SELECT 1 FROM robothree_schema_version WHERE version > 8) THEN
        RAISE EXCEPTION 'persistence.schema_too_new';
    END IF;

    SELECT script_name, script_digest
      INTO target_name, target_digest
      FROM robothree_schema_version
     WHERE version = 8;

    IF target_name IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_version_incomplete';
    END IF;

    IF NOT (
        (target_name = 'B0008__provider_usage_facts.sql'
            AND target_digest = '46880b8f5392ae3978f19206af9205b51f82df1bb2e85339d9a8d73c77a1221c')
        OR
        (target_name = 'U0008__provider_usage_facts_from_v0007.sql'
            AND target_digest = '246419d6960487cb507276ad8173905163320200331f27803ac004e65f74f2fc')
    ) THEN
        RAISE EXCEPTION 'persistence.schema_script_digest_mismatch';
    END IF;

    IF to_regclass(current_schema() || '.model_invocation_cache_context') IS NOT NULL
        OR to_regclass(current_schema() || '.model_invocation_prompt_cache_plan') IS NOT NULL
    THEN
        RAISE EXCEPTION 'persistence.schema_target_conflict';
    END IF;
END
$upgrade$;

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
