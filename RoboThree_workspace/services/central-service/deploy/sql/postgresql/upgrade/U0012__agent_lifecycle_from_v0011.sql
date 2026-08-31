DO $upgrade$
DECLARE
    target_name TEXT;
    target_digest TEXT;
BEGIN
    IF to_regclass(current_schema() || '.robothree_schema_version') IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_ledger_missing';
    END IF;
    IF EXISTS (SELECT 1 FROM robothree_schema_version WHERE version > 11) THEN
        RAISE EXCEPTION 'persistence.schema_too_new';
    END IF;
    SELECT script_name, script_digest INTO target_name, target_digest
      FROM robothree_schema_version WHERE version = 11;
    IF target_name IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_version_incomplete';
    END IF;
    IF NOT (
        (target_name = 'B0011__admin_model_management.sql'
            AND target_digest = '5d9335c2bf07ff605ddb3e42146cedba2c48d6806c01fa0e6b854f0383bd3e4f')
        OR
        (target_name = 'U0011__admin_model_management_from_v0010.sql'
            AND target_digest = '7ebb73e1d06171805457576882b9fc79218ae0dd6e6658d9fbf38beb37cd3bf5')
    ) THEN
        RAISE EXCEPTION 'persistence.schema_script_digest_mismatch';
    END IF;
    IF to_regclass(current_schema() || '.robot_draft_revision') IS NOT NULL THEN
        RAISE EXCEPTION 'persistence.schema_target_conflict';
    END IF;
END
$upgrade$;

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
