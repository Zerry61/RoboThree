package com.robothree.central.persistence.schema;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.PersistenceIntegrityException;
import com.robothree.central.persistence.mybatis.schema.CentralSchemaPreflight;
import com.robothree.central.persistence.mybatis.schema.SchemaManifestLoader;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.math.BigDecimal;
import java.util.List;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;

final class Alignment2aSchemaConformance {

    private Alignment2aSchemaConformance() {}

    static void verify(DataSource dataSource) {
        SchemaTestInstaller installer = new SchemaTestInstaller();

        assertThat(installer.installFresh(dataSource))
                .isEqualTo(SchemaTestInstaller.InstallResult.INSTALLED);
        validate(dataSource);
        assertThat(installer.installFresh(dataSource))
                .isEqualTo(SchemaTestInstaller.InstallResult.ALREADY_INSTALLED);
        assertThat(tableExists(dataSource, "flyway_schema_history")).isFalse();
        List<String> freshStructure = structuralSnapshot(dataSource);

        resetPublicSchema(dataSource);
        assertThat(installer.installFromV0006Fresh(dataSource))
                .isEqualTo(SchemaTestInstaller.InstallResult.INSTALLED);
        validate(dataSource);
        assertThat(structuralSnapshot(dataSource))
                .containsExactlyElementsOf(freshStructure);

        resetPublicSchema(dataSource);
        assertThat(installer.installFromV0007Fresh(dataSource))
                .isEqualTo(SchemaTestInstaller.InstallResult.INSTALLED);
        validate(dataSource);
        assertThat(structuralSnapshot(dataSource))
                .containsExactlyElementsOf(freshStructure);

        resetPublicSchema(dataSource);
        assertThat(installer.installFromV0008Fresh(dataSource))
                .isEqualTo(SchemaTestInstaller.InstallResult.INSTALLED);
        validate(dataSource);
        assertThat(structuralSnapshot(dataSource))
                .containsExactlyElementsOf(freshStructure);

        resetPublicSchema(dataSource);
        assertThat(installer.installFromV0009Fresh(dataSource))
                .isEqualTo(SchemaTestInstaller.InstallResult.INSTALLED);
        validate(dataSource);
        assertThat(structuralSnapshot(dataSource))
                .containsExactlyElementsOf(freshStructure);

        resetPublicSchema(dataSource);
        LegacyV5TestInstaller.install(dataSource);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("""
                INSERT INTO enterprise_user_permission (
                    enterprise_id, user_id, permission, enabled, revision, updated_at
                ) VALUES ('enterprise.test', 'user.test', 'configuration.read',
                    TRUE, 1, now())
                """);
        List<BigDecimal> installedOn = jdbc.queryForList(
                        "SELECT extract(epoch FROM installed_on AT TIME ZONE "
                                + "current_setting('TIMEZONE')) FROM flyway_schema_history "
                                + "WHERE version IS NOT NULL ORDER BY version::int",
                        BigDecimal.class)
                .stream()
                .toList();

        assertThat(installer.installBridge(dataSource))
                .isEqualTo(SchemaTestInstaller.InstallResult.INSTALLED);
        validate(dataSource);
        assertThat(installer.installBridge(dataSource))
                .isEqualTo(SchemaTestInstaller.InstallResult.ALREADY_INSTALLED);
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM enterprise_user_permission "
                                + "WHERE enterprise_id = 'enterprise.test'",
                        Integer.class))
                .isEqualTo(1);
        assertThat(jdbc.queryForList(
                        "SELECT extract(epoch FROM applied_at) FROM robothree_schema_version "
                                + "WHERE version BETWEEN 1 AND 5 ORDER BY version",
                        BigDecimal.class))
                .containsExactlyElementsOf(installedOn);
        assertThat(structuralSnapshot(dataSource)).containsExactlyElementsOf(freshStructure);

        jdbc.execute("DROP TABLE flyway_schema_history");
        validate(dataSource);
    }

    static void verifyInstallerFailures(DataSource dataSource) {
        SchemaTestInstaller installer = new SchemaTestInstaller();
        byte[] tampered = "SELECT 1;\n".getBytes(java.nio.charset.StandardCharsets.UTF_8);

        assertThatThrownBy(() -> installer.install(
                        dataSource,
                        "fresh",
                        SchemaTestInstaller.FailurePoint.NONE,
                        tampered))
                .isInstanceOf(PersistenceIntegrityException.class)
                .extracting("code")
                .isEqualTo("persistence.schema_script_digest_mismatch");
        assertThat(tableExists(dataSource, "robothree_schema_version")).isFalse();

        assertThatThrownBy(() -> installer.install(
                        dataSource,
                        "fresh",
                        SchemaTestInstaller.FailurePoint.AFTER_SCRIPT,
                        null))
                .isInstanceOf(PersistenceIntegrityException.class)
                .extracting("code")
                .isEqualTo("persistence.schema_install_failed");
        assertThat(tableExists(dataSource, "enterprise_verified_identity")).isFalse();
        assertThat(tableExists(dataSource, "robothree_schema_version")).isFalse();

        assertThatThrownBy(() -> installer.install(
                        dataSource,
                        "fresh",
                        SchemaTestInstaller.FailurePoint.AFTER_LEDGER,
                        null))
                .isInstanceOf(PersistenceIntegrityException.class)
                .extracting("code")
                .isEqualTo("persistence.schema_install_failed");
        assertThat(tableExists(dataSource, "enterprise_verified_identity")).isFalse();

        installer.installFresh(dataSource);
        new JdbcTemplate(dataSource).update("""
                UPDATE robothree_schema_version
                SET script_digest = repeat('0', 64)
                WHERE version = 12
                """);
        assertThatThrownBy(() -> installer.installFresh(dataSource))
                .isInstanceOf(PersistenceConflictException.class)
                .extracting("code")
                .isEqualTo("persistence.schema_target_conflict");
    }

    static void verifyBridgeFailures(DataSource dataSource) {
        SchemaTestInstaller installer = new SchemaTestInstaller();
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        LegacyV5TestInstaller.installToVersion(dataSource, 4);
        assertBridgeRejected(installer, dataSource);

        resetPublicSchema(dataSource);
        LegacyV5TestInstaller.install(dataSource);
        jdbc.update("""
                UPDATE flyway_schema_history
                SET checksum = checksum + 1
                WHERE version = '4'
                """);
        assertBridgeRejected(installer, dataSource);

        resetPublicSchema(dataSource);
        LegacyV5TestInstaller.install(dataSource);
        jdbc.update("DELETE FROM flyway_schema_history WHERE version = '3'");
        assertBridgeRejected(installer, dataSource);

        resetPublicSchema(dataSource);
        LegacyV5TestInstaller.install(dataSource);
        jdbc.update("""
                INSERT INTO flyway_schema_history (
                    installed_rank, version, description, type, script, checksum,
                    installed_by, installed_on, execution_time, success
                ) VALUES (999, '999', 'future', 'SQL', 'V999__future.sql', NULL,
                    current_user, now(), 0, TRUE)
                """);
        assertBridgeRejected(installer, dataSource);

        resetPublicSchema(dataSource);
        LegacyV5TestInstaller.install(dataSource);
        jdbc.execute("DROP INDEX uq_package_document_digest");
        assertBridgeRejected(installer, dataSource);

        resetPublicSchema(dataSource);
        LegacyV5TestInstaller.install(dataSource);
        jdbc.execute("""
                ALTER TABLE enterprise_package_document
                DROP COLUMN inserted_at
                """);
        assertBridgeRejected(installer, dataSource);

        resetPublicSchema(dataSource);
        LegacyV5TestInstaller.install(dataSource);
        jdbc.execute("""
                ALTER TABLE enterprise_package_document
                DROP CONSTRAINT ck_package_document
                """);
        assertBridgeRejected(installer, dataSource);
    }

    static void verifyPreflightFailures(DataSource dataSource) {
        SchemaTestInstaller installer = new SchemaTestInstaller();
        installer.installFresh(dataSource);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        jdbc.execute("DROP INDEX uq_package_document_digest");
        assertThatThrownBy(() -> validate(dataSource))
                .isInstanceOf(PersistenceIntegrityException.class)
                .extracting("code")
                .isEqualTo("persistence.schema_missing_index");
        jdbc.execute("""
                CREATE UNIQUE INDEX uq_package_document_digest
                ON enterprise_package_document (package_id, digest)
                """);

        jdbc.update("""
                UPDATE robothree_schema_version
                SET script_digest = repeat('0', 64)
                WHERE version = 12
                """);
        assertThatThrownBy(() -> validate(dataSource))
                .isInstanceOf(PersistenceIntegrityException.class)
                .extracting("code")
                .isEqualTo("persistence.schema_script_digest_mismatch");
    }

    static void validate(DataSource dataSource) {
        try (SchemaMapperTestSession session = SchemaMapperTestSession.open(dataSource)) {
            new CentralSchemaPreflight(session.mapper(), new SchemaManifestLoader().load())
                    .validate();
        }
    }

    private static List<String> structuralSnapshot(DataSource dataSource) {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        List<String> columns = jdbc.queryForList("""
                        SELECT table_name || '|' || column_name || '|' || ordinal_position
                            || '|' || udt_name || '|' || is_nullable
                            || '|' || coalesce(column_default, '<null>') AS fact
                        FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name <> 'flyway_schema_history'
                        ORDER BY table_name, ordinal_position
                        """, String.class)
                .stream()
                .map(value -> "column|" + value)
                .toList();
        List<String> constraints = jdbc.queryForList("""
                        SELECT relation.relname || '|' || constraint_name.conname || '|'
                            || constraint_name.contype::text || '|'
                            || pg_get_constraintdef(constraint_name.oid, TRUE) AS fact
                        FROM pg_constraint AS constraint_name
                        JOIN pg_class AS relation
                          ON relation.oid = constraint_name.conrelid
                        JOIN pg_namespace AS namespace
                          ON namespace.oid = relation.relnamespace
                        WHERE namespace.nspname = current_schema()
                          AND relation.relname <> 'flyway_schema_history'
                        ORDER BY relation.relname, constraint_name.conname
                        """, String.class)
                .stream()
                .map(value -> "constraint|" + value)
                .toList();
        List<String> indexes = jdbc.queryForList("""
                        SELECT tablename || '|' || indexname || '|' || indexdef AS fact
                        FROM pg_indexes
                        WHERE schemaname = current_schema()
                          AND tablename <> 'flyway_schema_history'
                        ORDER BY tablename, indexname
                        """, String.class)
                .stream()
                .map(value -> "index|" + value)
                .toList();
        return java.util.stream.Stream.of(columns, constraints, indexes)
                .flatMap(List::stream)
                .toList();
    }

    private static boolean tableExists(DataSource dataSource, String tableName) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement query = connection.prepareStatement("""
                        SELECT count(*)
                        FROM information_schema.tables
                        WHERE table_schema = current_schema()
                          AND table_name = ?
                        """)) {
            query.setString(1, tableName);
            try (ResultSet result = query.executeQuery()) {
                result.next();
                return result.getInt(1) == 1;
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("could not inspect test schema", exception);
        }
    }

    private static void assertBridgeRejected(
            SchemaTestInstaller installer, DataSource dataSource) {
        assertThatThrownBy(() -> installer.installBridge(dataSource))
                .isInstanceOf(PersistenceIntegrityException.class)
                .extracting("code")
                .isEqualTo("persistence.schema_install_failed");
        assertThat(tableExists(dataSource, "robothree_schema_version")).isFalse();
    }

    private static void resetPublicSchema(DataSource dataSource) {
        try (Connection connection = dataSource.getConnection();
                Statement statement = connection.createStatement()) {
            statement.execute("DROP SCHEMA public CASCADE");
            statement.execute("CREATE SCHEMA public");
        } catch (SQLException exception) {
            throw new IllegalStateException("could not reset test schema", exception);
        }
    }
}
