package com.robothree.central.persistence.schema;

import com.robothree.central.persistence.PersistenceIntegrityException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import javax.sql.DataSource;

final class LegacyV5TestInstaller {

    private static final Path LEGACY_ROOT =
            Path.of("deploy/sql/postgresql/legacy-flyway");
    private static final Instant INSTALLED_AT =
            Instant.parse("2026-07-20T00:00:00Z");
    private static final List<Migration> MIGRATIONS = List.of(
            new Migration(
                    1,
                    "V1__verified_identity_and_permissions.sql",
                    "verified identity and permissions",
                    366803201),
            new Migration(
                    2,
                    "V2__device_registration_enrollment_and_challenge.sql",
                    "device registration enrollment and challenge",
                    -159173243),
            new Migration(
                    3,
                    "V3__token_issuance.sql",
                    "token issuance",
                    584786137),
            new Migration(
                    4,
                    "V4__immutable_configuration.sql",
                    "immutable configuration",
                    -1131845426),
            new Migration(
                    5,
                    "V5__challenge_consumption_idempotency.sql",
                    "challenge consumption idempotency",
                    1154096409));

    private LegacyV5TestInstaller() {}

    static void install(DataSource dataSource) {
        installToVersion(dataSource, 5);
    }

    static void installToVersion(DataSource dataSource, int version) {
        if (version < 1 || version > MIGRATIONS.size()) {
            throw new IllegalArgumentException("legacy target version is unsupported");
        }
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                createHistory(connection);
                for (Migration migration : MIGRATIONS.subList(0, version)) {
                    executeMigration(connection, migration);
                    insertHistory(connection, migration);
                }
                connection.commit();
            } catch (IOException | SQLException | RuntimeException exception) {
                connection.rollback();
                throw new PersistenceIntegrityException(
                        "persistence.legacy_fixture_install_failed",
                        "legacy schema fixture installation failed",
                        exception);
            } finally {
                connection.setAutoCommit(true);
            }
        } catch (SQLException exception) {
            throw new PersistenceIntegrityException(
                    "persistence.legacy_fixture_install_failed",
                    "legacy schema fixture could not acquire a transaction",
                    exception);
        }
    }

    private static void createHistory(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("""
                    CREATE TABLE flyway_schema_history (
                        installed_rank INTEGER NOT NULL,
                        version VARCHAR(50),
                        description VARCHAR(200) NOT NULL,
                        type VARCHAR(20) NOT NULL,
                        script VARCHAR(1000) NOT NULL,
                        checksum INTEGER,
                        installed_by VARCHAR(100) NOT NULL,
                        installed_on TIMESTAMP NOT NULL,
                        execution_time INTEGER NOT NULL,
                        success BOOLEAN NOT NULL,
                        CONSTRAINT flyway_schema_history_pk
                            PRIMARY KEY (installed_rank)
                    )
                    """);
            statement.execute("""
                    CREATE INDEX flyway_schema_history_s_idx
                    ON flyway_schema_history (success)
                    """);
        }
    }

    private static void executeMigration(
            Connection connection,
            Migration migration) throws IOException, SQLException {
        String script = Files.readString(
                LEGACY_ROOT.resolve(migration.script()),
                StandardCharsets.UTF_8);
        try (Statement statement = connection.createStatement()) {
            statement.execute(script);
        }
    }

    private static void insertHistory(
            Connection connection,
            Migration migration) throws SQLException {
        try (PreparedStatement insert = connection.prepareStatement("""
                INSERT INTO flyway_schema_history (
                    installed_rank,
                    version,
                    description,
                    type,
                    script,
                    checksum,
                    installed_by,
                    installed_on,
                    execution_time,
                    success
                ) VALUES (?, ?, ?, 'SQL', ?, ?, current_user, ?, 0, TRUE)
                """)) {
            insert.setInt(1, migration.version());
            insert.setString(2, Integer.toString(migration.version()));
            insert.setString(3, migration.description());
            insert.setString(4, migration.script());
            insert.setInt(5, migration.checksum());
            insert.setTimestamp(
                    6,
                    Timestamp.from(INSTALLED_AT.plusSeconds(migration.version())));
            insert.executeUpdate();
        }
    }

    private record Migration(
            int version,
            String script,
            String description,
            int checksum) {}
}
