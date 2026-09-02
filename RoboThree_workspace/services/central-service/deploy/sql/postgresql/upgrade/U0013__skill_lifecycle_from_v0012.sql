DO $upgrade$
DECLARE
    target_name TEXT;
    target_digest TEXT;
BEGIN
    IF to_regclass(current_schema() || '.robothree_schema_version') IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_ledger_missing';
    END IF;
    IF EXISTS (SELECT 1 FROM robothree_schema_version WHERE version > 12) THEN
        RAISE EXCEPTION 'persistence.schema_too_new';
    END IF;
    SELECT script_name, script_digest INTO target_name, target_digest
      FROM robothree_schema_version WHERE version = 12;
    IF target_name IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_version_incomplete';
    END IF;
    IF NOT (
        (target_name = 'B0012__agent_lifecycle.sql'
            AND target_digest = '6ad78503febe5670655253e47943fe2aa4bf288ea8a46674f390732aed69e7c8')
        OR
        (target_name = 'U0012__agent_lifecycle_from_v0011.sql'
            AND target_digest = 'c9c870aa3e35ebf08c3a7911b6e3fc542a7c3a45d9957cd42515a709f290851b')
    ) THEN
        RAISE EXCEPTION 'persistence.schema_script_digest_mismatch';
    END IF;
    IF to_regclass(current_schema() || '.skill_drafts') IS NOT NULL THEN
        RAISE EXCEPTION 'persistence.schema_target_conflict';
    END IF;
END
$upgrade$;

CREATE TABLE skill_package_blobs (
    package_digest VARCHAR(71) PRIMARY KEY,
    archive_digest VARCHAR(71) NOT NULL,
    manifest_digest VARCHAR(71) NOT NULL,
    skill_markdown_digest VARCHAR(71) NOT NULL,
    technical_name VARCHAR(96) NOT NULL,
    file_count INTEGER NOT NULL,
    expanded_byte_count BIGINT NOT NULL,
    canonical_zip_bytes BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_skill_package_digests CHECK (
        package_digest ~ '^sha256:[a-f0-9]{64}$'
        AND archive_digest ~ '^sha256:[a-f0-9]{64}$'
        AND manifest_digest ~ '^sha256:[a-f0-9]{64}$'
        AND skill_markdown_digest ~ '^sha256:[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_skill_package_name CHECK (
        technical_name ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
    ),
    CONSTRAINT ck_skill_package_bounds CHECK (
        file_count BETWEEN 1 AND 4096
        AND expanded_byte_count BETWEEN 1 AND 536870912
        AND octet_length(canonical_zip_bytes) BETWEEN 1 AND 209715200
    )
);

CREATE TABLE skill_draft_revisions (
    skill_id VARCHAR(200) NOT NULL,
    draft_revision VARCHAR(71) NOT NULL,
    creator_subject VARCHAR(200) NOT NULL,
    source_kind VARCHAR(24) NOT NULL,
    package_digest VARCHAR(71) NOT NULL,
    technical_name VARCHAR(96) NOT NULL,
    display_title VARCHAR(128) NOT NULL,
    metadata_json TEXT NOT NULL,
    record_digest CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (skill_id, draft_revision),
    CONSTRAINT fk_skill_draft_package FOREIGN KEY (package_digest)
        REFERENCES skill_package_blobs (package_digest),
    CONSTRAINT ck_skill_draft_id CHECK (skill_id ~ '^skill\.[a-z0-9][a-z0-9._:-]*$'),
    CONSTRAINT ck_skill_draft_source CHECK (source_kind IN ('personal_creator', 'admin_upload')),
    CONSTRAINT ck_skill_draft_revision CHECK (
        draft_revision ~ '^sha256:[a-f0-9]{64}$'
        AND record_digest ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_skill_draft_document CHECK (
        octet_length(metadata_json) BETWEEN 2 AND 524288
        AND jsonb_typeof(metadata_json::jsonb) = 'object'
    )
);

CREATE TABLE skill_drafts (
    skill_id VARCHAR(200) PRIMARY KEY,
    draft_revision VARCHAR(71) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_skill_draft_head FOREIGN KEY (skill_id, draft_revision)
        REFERENCES skill_draft_revisions (skill_id, draft_revision)
);

CREATE TABLE skill_test_facts (
    skill_id VARCHAR(200) NOT NULL,
    draft_revision VARCHAR(71) NOT NULL,
    state VARCHAR(20) NOT NULL,
    task_id VARCHAR(160) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    safe_summary VARCHAR(1000),
    result_digest VARCHAR(71),
    PRIMARY KEY (skill_id, draft_revision),
    CONSTRAINT fk_skill_test_draft FOREIGN KEY (skill_id, draft_revision)
        REFERENCES skill_draft_revisions (skill_id, draft_revision),
    CONSTRAINT ck_skill_test_state CHECK (state IN ('running', 'passed', 'failed')),
    CONSTRAINT ck_skill_test_result CHECK (
        (state = 'running' AND completed_at IS NULL AND safe_summary IS NULL AND result_digest IS NULL)
        OR (state = 'passed' AND completed_at IS NOT NULL AND safe_summary IS NULL
            AND result_digest ~ '^sha256:[a-f0-9]{64}$')
        OR (state = 'failed' AND completed_at IS NOT NULL AND safe_summary IS NOT NULL
            AND result_digest ~ '^sha256:[a-f0-9]{64}$')
    )
);

CREATE TABLE skill_test_operations (
    operation_id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    skill_id VARCHAR(200) NOT NULL,
    draft_revision VARCHAR(71) NOT NULL,
    source_kind VARCHAR(32) NOT NULL,
    state VARCHAR(20) NOT NULL,
    task_id VARCHAR(160),
    safe_summary VARCHAR(1000),
    result_digest VARCHAR(71),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_skill_test_operation_draft FOREIGN KEY (skill_id, draft_revision)
        REFERENCES skill_draft_revisions (skill_id, draft_revision),
    CONSTRAINT ck_skill_test_operation_source CHECK (source_kind IN ('admin_upload')),
    CONSTRAINT ck_skill_test_operation_state CHECK (
        state IN ('accepted', 'running', 'succeeded', 'failed')),
    CONSTRAINT ck_skill_test_operation_result CHECK (
        (state = 'accepted' AND task_id IS NULL AND safe_summary IS NULL AND result_digest IS NULL)
        OR (state = 'running' AND task_id IS NOT NULL AND safe_summary IS NULL AND result_digest IS NULL)
        OR (state = 'succeeded' AND task_id IS NOT NULL AND safe_summary IS NULL
            AND result_digest ~ '^sha256:[a-f0-9]{64}$')
        OR (state = 'failed' AND safe_summary IS NOT NULL
            AND result_digest ~ '^sha256:[a-f0-9]{64}$')
    )
);

CREATE TABLE skill_submissions (
    submission_id UUID PRIMARY KEY,
    submission_revision VARCHAR(71) NOT NULL,
    skill_id VARCHAR(200) NOT NULL,
    draft_revision VARCHAR(71) NOT NULL,
    creator_subject VARCHAR(200) NOT NULL,
    semantic_version VARCHAR(32) NOT NULL,
    change_summary VARCHAR(2000) NOT NULL,
    state VARCHAR(24) NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL,
    reviewed_at TIMESTAMPTZ,
    reviewer_summary VARCHAR(200),
    rejection_reason VARCHAR(1000),
    CONSTRAINT fk_skill_submission_draft FOREIGN KEY (skill_id, draft_revision)
        REFERENCES skill_draft_revisions (skill_id, draft_revision),
    CONSTRAINT ck_skill_submission_revision CHECK (
        submission_revision ~ '^sha256:[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_skill_submission_semver CHECK (
        semantic_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
    ),
    CONSTRAINT ck_skill_submission_state CHECK (
        state IN ('pending_review', 'approved', 'rejected', 'withdrawn')
    ),
    CONSTRAINT ck_skill_submission_review CHECK (
        (state = 'pending_review' AND reviewed_at IS NULL
            AND reviewer_summary IS NULL AND rejection_reason IS NULL)
        OR (state = 'withdrawn' AND reviewed_at IS NOT NULL
            AND reviewer_summary IS NULL AND rejection_reason IS NULL)
        OR (state = 'approved' AND reviewed_at IS NOT NULL
            AND reviewer_summary IS NOT NULL AND rejection_reason IS NULL)
        OR (state = 'rejected' AND reviewed_at IS NOT NULL
            AND reviewer_summary IS NOT NULL AND rejection_reason IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_skill_submission_pending
    ON skill_submissions (skill_id) WHERE state = 'pending_review';
CREATE INDEX ix_skill_submission_review
    ON skill_submissions (state, submitted_at DESC, submission_id);

CREATE TABLE skill_releases (
    skill_id VARCHAR(200) NOT NULL,
    release_revision VARCHAR(71) NOT NULL,
    submission_id UUID UNIQUE,
    draft_revision VARCHAR(71) NOT NULL,
    package_digest VARCHAR(71) NOT NULL,
    semantic_version VARCHAR(32) NOT NULL,
    source_kind VARCHAR(24) NOT NULL,
    release_json TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (skill_id, release_revision),
    CONSTRAINT fk_skill_release_submission FOREIGN KEY (submission_id)
        REFERENCES skill_submissions (submission_id),
    CONSTRAINT fk_skill_release_draft FOREIGN KEY (skill_id, draft_revision)
        REFERENCES skill_draft_revisions (skill_id, draft_revision),
    CONSTRAINT fk_skill_release_package FOREIGN KEY (package_digest)
        REFERENCES skill_package_blobs (package_digest),
    CONSTRAINT ck_skill_release_revision CHECK (
        release_revision ~ '^sha256:[a-f0-9]{64}$'
    ),
    CONSTRAINT ck_skill_release_source CHECK (source_kind IN ('personal_creator', 'admin_upload')),
    CONSTRAINT ck_skill_release_document CHECK (
        octet_length(release_json) BETWEEN 2 AND 524288
        AND jsonb_typeof(release_json::jsonb) = 'object'
    )
);

CREATE TABLE skill_lifecycle_command_receipts (
    command_id UUID PRIMARY KEY,
    correlation_id UUID NOT NULL,
    command_digest VARCHAR(71) NOT NULL,
    result_json TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_skill_command_digest CHECK (command_digest ~ '^sha256:[a-f0-9]{64}$'),
    CONSTRAINT ck_skill_command_result CHECK (
        octet_length(result_json) BETWEEN 2 AND 65536
        AND jsonb_typeof(result_json::jsonb) = 'object'
    )
);

CREATE TABLE skill_audit_events (
    event_id UUID PRIMARY KEY,
    actor_summary VARCHAR(200) NOT NULL,
    action VARCHAR(80) NOT NULL,
    skill_id VARCHAR(200) NOT NULL,
    object_revision VARCHAR(71) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    result VARCHAR(40) NOT NULL,
    correlation_id UUID NOT NULL,
    CONSTRAINT ck_skill_audit_revision CHECK (object_revision ~ '^sha256:[a-f0-9]{64}$')
);

CREATE INDEX ix_skill_audit_time
    ON skill_audit_events (occurred_at DESC, event_id);
