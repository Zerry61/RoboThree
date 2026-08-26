DO $bridge$
DECLARE
    migration RECORD;
    required_table TEXT;
    required_constraint TEXT;
    required_index TEXT;
BEGIN
    IF to_regclass(current_schema() || '.flyway_schema_history') IS NULL THEN
        RAISE EXCEPTION 'persistence.schema_unsupported_history';
    END IF;

    IF (SELECT count(*) FROM flyway_schema_history WHERE version IS NOT NULL) <> 5 THEN
        RAISE EXCEPTION 'persistence.schema_unsupported_history';
    END IF;

    FOR migration IN
        SELECT *
        FROM (VALUES
            ('1', 'V1__verified_identity_and_permissions.sql', 366803201),
            ('2', 'V2__device_registration_enrollment_and_challenge.sql', -159173243),
            ('3', 'V3__token_issuance.sql', 584786137),
            ('4', 'V4__immutable_configuration.sql', -1131845426),
            ('5', 'V5__challenge_consumption_idempotency.sql', 1154096409)
        ) AS expected(version, script, checksum)
    LOOP
        IF (
            SELECT count(*)
            FROM flyway_schema_history AS history
            WHERE history.version = migration.version
              AND history.script = migration.script
              AND history.checksum = migration.checksum
              AND history.success = TRUE
        ) <> 1 THEN
            RAISE EXCEPTION 'persistence.schema_unsupported_history';
        END IF;
    END LOOP;

    FOREACH required_table IN ARRAY ARRAY[
        'enterprise_verified_identity',
        'enterprise_user_permission',
        'enterprise_device',
        'device_enrollment_grant',
        'device_challenge',
        'access_token_issuance',
        'enterprise_configuration_snapshot',
        'enterprise_package_document'
    ]
    LOOP
        IF to_regclass(current_schema() || '.' || required_table) IS NULL THEN
            RAISE EXCEPTION 'persistence.schema_missing_table';
        END IF;
    END LOOP;

    IF EXISTS (
        WITH expected(table_name, column_name, udt_name, is_nullable) AS (
            VALUES
                ('enterprise_verified_identity', 'verified_identity_id', 'uuid', 'NO'),
                ('enterprise_verified_identity', 'enterprise_id', 'varchar', 'NO'),
                ('enterprise_verified_identity', 'user_id', 'varchar', 'NO'),
                ('enterprise_verified_identity', 'provider', 'varchar', 'NO'),
                ('enterprise_verified_identity', 'provider_subject_digest', 'bpchar', 'NO'),
                ('enterprise_verified_identity', 'identity_digest', 'bpchar', 'NO'),
                ('enterprise_verified_identity', 'issued_at', 'timestamptz', 'NO'),
                ('enterprise_verified_identity', 'expires_at', 'timestamptz', 'NO'),
                ('enterprise_verified_identity', 'disabled_at', 'timestamptz', 'YES'),
                ('enterprise_user_permission', 'enterprise_id', 'varchar', 'NO'),
                ('enterprise_user_permission', 'user_id', 'varchar', 'NO'),
                ('enterprise_user_permission', 'permission', 'varchar', 'NO'),
                ('enterprise_user_permission', 'enabled', 'bool', 'NO'),
                ('enterprise_user_permission', 'revision', 'int8', 'NO'),
                ('enterprise_user_permission', 'updated_at', 'timestamptz', 'NO'),
                ('enterprise_device', 'device_id', 'varchar', 'NO'),
                ('enterprise_device', 'enterprise_id', 'varchar', 'NO'),
                ('enterprise_device', 'device_key_id', 'varchar', 'NO'),
                ('enterprise_device', 'public_key_format', 'varchar', 'NO'),
                ('enterprise_device', 'public_key_encoded', 'text', 'NO'),
                ('enterprise_device', 'public_key_digest', 'bpchar', 'NO'),
                ('enterprise_device', 'algorithm', 'varchar', 'NO'),
                ('enterprise_device', 'trust_source', 'varchar', 'NO'),
                ('enterprise_device', 'managed_status', 'varchar', 'NO'),
                ('enterprise_device', 'compliance_status', 'varchar', 'NO'),
                ('enterprise_device', 'revision', 'int8', 'NO'),
                ('enterprise_device', 'registered_at', 'timestamptz', 'NO'),
                ('enterprise_device', 'revoked_at', 'timestamptz', 'YES'),
                ('enterprise_device', 'disabled_at', 'timestamptz', 'YES'),
                ('device_enrollment_grant', 'enrollment_grant_id', 'uuid', 'NO'),
                ('device_enrollment_grant', 'code_digest', 'bpchar', 'NO'),
                ('device_enrollment_grant', 'enterprise_id', 'varchar', 'NO'),
                ('device_enrollment_grant', 'authorized_user_id', 'varchar', 'NO'),
                ('device_enrollment_grant', 'issued_at', 'timestamptz', 'NO'),
                ('device_enrollment_grant', 'expires_at', 'timestamptz', 'NO'),
                ('device_enrollment_grant', 'consumed_at', 'timestamptz', 'YES'),
                ('device_enrollment_grant', 'disabled_at', 'timestamptz', 'YES'),
                ('device_challenge', 'challenge_id', 'uuid', 'NO'),
                ('device_challenge', 'purpose', 'varchar', 'NO'),
                ('device_challenge', 'verified_identity_id', 'uuid', 'NO'),
                ('device_challenge', 'client_instance_id', 'varchar', 'NO'),
                ('device_challenge', 'expected_device_key_id', 'varchar', 'YES'),
                ('device_challenge', 'expected_public_key_digest', 'bpchar', 'YES'),
                ('device_challenge', 'nonce', 'varchar', 'NO'),
                ('device_challenge', 'audience', 'varchar', 'NO'),
                ('device_challenge', 'allowed_algorithms', '_text', 'NO'),
                ('device_challenge', 'challenge_digest', 'bpchar', 'NO'),
                ('device_challenge', 'issued_at', 'timestamptz', 'NO'),
                ('device_challenge', 'expires_at', 'timestamptz', 'NO'),
                ('device_challenge', 'consumed_at', 'timestamptz', 'YES'),
                ('device_challenge', 'consumed_by', 'varchar', 'YES'),
                ('device_challenge', 'consumed_request_digest', 'bpchar', 'YES'),
                ('access_token_issuance', 'token_id', 'uuid', 'NO'),
                ('access_token_issuance', 'token_digest', 'bpchar', 'NO'),
                ('access_token_issuance', 'enterprise_id', 'varchar', 'NO'),
                ('access_token_issuance', 'user_id', 'varchar', 'NO'),
                ('access_token_issuance', 'device_id', 'varchar', 'NO'),
                ('access_token_issuance', 'client_instance_id', 'varchar', 'NO'),
                ('access_token_issuance', 'permissions', '_text', 'NO'),
                ('access_token_issuance', 'identity_digest', 'bpchar', 'NO'),
                ('access_token_issuance', 'device_revision', 'int8', 'NO'),
                ('access_token_issuance', 'permission_revision', 'int8', 'NO'),
                ('access_token_issuance', 'issued_at', 'timestamptz', 'NO'),
                ('access_token_issuance', 'expires_at', 'timestamptz', 'NO'),
                ('access_token_issuance', 'challenge_id', 'uuid', 'NO'),
                ('enterprise_configuration_snapshot', 'snapshot_id', 'varchar', 'NO'),
                ('enterprise_configuration_snapshot', 'revision', 'bpchar', 'NO'),
                ('enterprise_configuration_snapshot', 'digest', 'bpchar', 'NO'),
                ('enterprise_configuration_snapshot', 'schema_version', 'varchar', 'NO'),
                ('enterprise_configuration_snapshot', 'document_json', 'text', 'NO'),
                ('enterprise_configuration_snapshot', 'etag', 'varchar', 'NO'),
                ('enterprise_configuration_snapshot', 'active', 'bool', 'NO'),
                ('enterprise_configuration_snapshot', 'generated_at', 'timestamptz', 'NO'),
                ('enterprise_configuration_snapshot', 'inserted_at', 'timestamptz', 'NO'),
                ('enterprise_package_document', 'package_id', 'varchar', 'NO'),
                ('enterprise_package_document', 'kind', 'varchar', 'NO'),
                ('enterprise_package_document', 'revision', 'bpchar', 'NO'),
                ('enterprise_package_document', 'digest', 'bpchar', 'NO'),
                ('enterprise_package_document', 'document_json', 'text', 'NO'),
                ('enterprise_package_document', 'inserted_at', 'timestamptz', 'NO')
        ),
        actual AS (
            SELECT
                columns.table_name,
                columns.column_name,
                columns.udt_name,
                columns.is_nullable
            FROM information_schema.columns AS columns
            WHERE columns.table_schema = current_schema()
              AND columns.table_name = ANY (ARRAY[
                  'enterprise_verified_identity',
                  'enterprise_user_permission',
                  'enterprise_device',
                  'device_enrollment_grant',
                  'device_challenge',
                  'access_token_issuance',
                  'enterprise_configuration_snapshot',
                  'enterprise_package_document'
              ])
        )
        SELECT 1
        FROM expected
        FULL OUTER JOIN actual
          ON actual.table_name = expected.table_name
         AND actual.column_name = expected.column_name
        WHERE expected.table_name IS NULL
           OR actual.table_name IS NULL
           OR actual.udt_name <> expected.udt_name
           OR actual.is_nullable <> expected.is_nullable
    ) THEN
        RAISE EXCEPTION 'persistence.schema_column_mismatch';
    END IF;

    FOREACH required_constraint IN ARRAY ARRAY[
        'enterprise_verified_identity_pkey',
        'ck_verified_identity_digest',
        'ck_verified_identity_expiry',
        'enterprise_user_permission_pkey',
        'enterprise_user_permission_revision_check',
        'enterprise_device_pkey',
        'enterprise_device_revision_check',
        'ck_device_public_key_digest',
        'ck_device_public_key_format',
        'ck_device_algorithm',
        'device_enrollment_grant_pkey',
        'device_enrollment_grant_code_digest_key',
        'ck_enrollment_code_digest',
        'ck_enrollment_expiry',
        'device_challenge_pkey',
        'device_challenge_verified_identity_id_fkey',
        'device_challenge_challenge_digest_key',
        'ck_challenge_digest',
        'ck_challenge_public_key_digest',
        'ck_challenge_expiry',
        'ck_challenge_algorithms_nonempty',
        'ck_challenge_consumption_complete',
        'access_token_issuance_pkey',
        'access_token_issuance_token_digest_key',
        'access_token_issuance_device_id_fkey',
        'access_token_issuance_device_revision_check',
        'access_token_issuance_permission_revision_check',
        'access_token_issuance_challenge_id_key',
        'access_token_issuance_challenge_id_fkey',
        'ck_token_digest',
        'ck_token_identity_digest',
        'ck_token_expiry',
        'enterprise_configuration_snapshot_pkey',
        'ck_configuration_revision',
        'ck_configuration_digest',
        'ck_configuration_document',
        'enterprise_package_document_pkey',
        'ck_package_kind',
        'ck_package_revision',
        'ck_package_digest',
        'ck_package_document'
    ]
    LOOP
        IF (
            SELECT count(*)
            FROM information_schema.table_constraints AS constraints
            WHERE constraints.constraint_schema = current_schema()
              AND constraints.constraint_name = required_constraint
        ) <> 1 THEN
            RAISE EXCEPTION 'persistence.schema_missing_constraint';
        END IF;
    END LOOP;

    FOREACH required_index IN ARRAY ARRAY[
        'uq_verified_identity_digest',
        'ix_verified_identity_user',
        'ix_enterprise_user_permission_enabled',
        'uq_enterprise_device_key',
        'uq_enterprise_device_public_key',
        'ix_enterprise_device_status',
        'ix_enrollment_grant_owner',
        'ix_device_challenge_identity',
        'ix_device_challenge_pending',
        'ix_device_challenge_consumed_request',
        'ix_access_token_subject',
        'uq_configuration_snapshot_digest',
        'uq_configuration_single_active',
        'uq_configuration_etag',
        'uq_package_document_digest'
    ]
    LOOP
        IF to_regclass(current_schema() || '.' || required_index) IS NULL THEN
            RAISE EXCEPTION 'persistence.schema_missing_index';
        END IF;
    END LOOP;
END
$bridge$;

CREATE TABLE IF NOT EXISTS robothree_schema_version (
    version INTEGER PRIMARY KEY CHECK (version > 0),
    script_name VARCHAR(255) NOT NULL UNIQUE,
    script_digest CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL,
    release_version VARCHAR(128) NOT NULL,
    CONSTRAINT ck_robothree_schema_digest
        CHECK (script_digest ~ '^[a-f0-9]{64}$')
);

DO $ledger$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM robothree_schema_version AS existing
        WHERE existing.version BETWEEN 1 AND 5
          AND NOT EXISTS (
              SELECT 1
              FROM (VALUES
                  (1, 'V1__verified_identity_and_permissions.sql', '3a23b472e3cc67d834ef628d14bc45a63311831fa11f97cf4ae781e7835dee46'),
                  (2, 'V2__device_registration_enrollment_and_challenge.sql', '021bfeb40cfed2c98f56b84273a4cecf0bc6c20e80a79a82a9d5cd5fa211db21'),
                  (3, 'V3__token_issuance.sql', 'a0e16eda59c95049b5f899026ca8bd698610635762db56737622773b494a126f'),
                  (4, 'V4__immutable_configuration.sql', '6dc43be8a4610abc57c45bb5d354c8dab09bbfd59a8fd93297d918fed53c6f28'),
                  (5, 'V5__challenge_consumption_idempotency.sql', 'f250a660c2c604f4d53749da238f50978131bf62188ad062d8eb09c4d54cd5e6')
              ) AS expected(version, script_name, script_digest)
              WHERE expected.version = existing.version
                AND expected.script_name = existing.script_name
                AND expected.script_digest = existing.script_digest
          )
    ) THEN
        RAISE EXCEPTION 'persistence.schema_script_digest_mismatch';
    END IF;
END
$ledger$;

INSERT INTO robothree_schema_version (
    version,
    script_name,
    script_digest,
    applied_at,
    release_version
)
SELECT
    history.version::INTEGER,
    history.script,
    CASE history.version
        WHEN '1' THEN '3a23b472e3cc67d834ef628d14bc45a63311831fa11f97cf4ae781e7835dee46'
        WHEN '2' THEN '021bfeb40cfed2c98f56b84273a4cecf0bc6c20e80a79a82a9d5cd5fa211db21'
        WHEN '3' THEN 'a0e16eda59c95049b5f899026ca8bd698610635762db56737622773b494a126f'
        WHEN '4' THEN '6dc43be8a4610abc57c45bb5d354c8dab09bbfd59a8fd93297d918fed53c6f28'
        WHEN '5' THEN 'f250a660c2c604f4d53749da238f50978131bf62188ad062d8eb09c4d54cd5e6'
    END,
    history.installed_on,
    'pre-manifest-legacy'
FROM flyway_schema_history AS history
WHERE history.version IN ('1', '2', '3', '4', '5')
ORDER BY history.installed_rank
ON CONFLICT (version) DO NOTHING;
