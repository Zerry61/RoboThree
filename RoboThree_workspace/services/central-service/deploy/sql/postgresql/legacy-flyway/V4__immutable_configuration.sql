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
