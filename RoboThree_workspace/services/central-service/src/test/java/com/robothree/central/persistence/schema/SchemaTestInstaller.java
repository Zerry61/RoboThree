package com.robothree.central.persistence.schema;

import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.PersistenceIntegrityException;
import com.robothree.central.persistence.mybatis.schema.SchemaManifest;
import com.robothree.central.persistence.mybatis.schema.SchemaManifestLoader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HexFormat;
import javax.sql.DataSource;

final class SchemaTestInstaller {

    private static final Path SQL_ROOT = Path.of("deploy/sql/postgresql");
    private static final String V0006_FRESH_NAME =
            "B0006__central_foundation.sql";
    private static final String V0006_FRESH_DIGEST =
            "2d2d99172746aa7f2f5431a9c4273c1893694df0fa31eb8dddea8d48de2fd480";
    private static final String V0006_BRIDGE_NAME =
            "U0006__bridge_from_flyway_v5.sql";
    private static final String V0006_BRIDGE_DIGEST =
            "ff2e819ad5f80229035554b54ec802a7d2a3ef70fc7c665f138efc6bc0b37909";
    private static final String V0006_RELEASE = "0.0.0-cja.2a.1";
    private static final String V0007_FRESH_NAME =
            "B0007__model_invocation_foundation.sql";
    private static final String V0007_FRESH_DIGEST =
            "c7a5f29568587c3cfc48fab6766374b762f5a629c77f711ea20b7cbbc79d9140";
    private static final String V0007_UPGRADE_NAME =
            "U0007__model_invocation_from_v0006.sql";
    private static final String V0007_UPGRADE_DIGEST =
            "6feb82c722ad8dc34ff0d94f8fe6b09de7fc55e7e773dc8f1f90a09b584c944a";
    private static final String V0007_RELEASE = "0.0.0-cgf.2a.1";
    private static final String V0008_FRESH_NAME =
            "B0008__provider_usage_facts.sql";
    private static final String V0008_FRESH_DIGEST =
            "46880b8f5392ae3978f19206af9205b51f82df1bb2e85339d9a8d73c77a1221c";
    private static final String V0008_UPGRADE_NAME =
            "U0008__provider_usage_facts_from_v0007.sql";
    private static final String V0008_UPGRADE_DIGEST =
            "246419d6960487cb507276ad8173905163320200331f27803ac004e65f74f2fc";
    private static final String V0008_RELEASE = "0.0.0-arh.3.1";
    private static final String V0009_FRESH_NAME =
            "B0009__prompt_cache_planning.sql";
    private static final String V0009_FRESH_DIGEST =
            "8f21541e794a33c5c0123b61fde3f354a685cc59b157184a4cce426839608dac";
    private static final String V0009_UPGRADE_NAME =
            "U0009__prompt_cache_planning_from_v0008.sql";
    private static final String V0009_UPGRADE_DIGEST =
            "9c158e5621b618dec85655e778383e0869245c7815bf999cc1c161400daa29f6";
    private static final String V0009_RELEASE = "0.0.0-arh.3.2.2";
    private static final String V0010_UPGRADE_NAME =
            "U0010__enterprise_session_persistence_from_v0009.sql";
    private static final String V0010_UPGRADE_DIGEST =
            "1f276a223d9853be28a6d4f0ca0a3afff7cc42fc35dc46669e8b4289bda6af49";
    private static final String V0010_RELEASE = "0.0.0-eipc.1.1.2";
    private static final String V0011_UPGRADE_NAME =
            "U0011__admin_model_management_from_v0010.sql";
    private static final String V0011_UPGRADE_DIGEST =
            "7ebb73e1d06171805457576882b9fc79218ae0dd6e6658d9fbf38beb37cd3bf5";
    private static final String V0011_RELEASE = "0.0.0-mvp.admin.vs1";
    private final SchemaManifest manifest = new SchemaManifestLoader().load();

    InstallResult installFresh(DataSource dataSource) {
        return install(dataSource, "fresh", FailurePoint.NONE, null);
    }

    InstallResult installBridge(DataSource dataSource) {
        if (!versionInstalled(dataSource, 10)) {
            installV0006(dataSource, V0006_BRIDGE_NAME, V0006_BRIDGE_DIGEST);
            installV0007(dataSource, V0007_UPGRADE_NAME, V0007_UPGRADE_DIGEST);
            installV0008(dataSource, V0008_UPGRADE_NAME, V0008_UPGRADE_DIGEST);
            installV0009(dataSource, V0009_UPGRADE_NAME, V0009_UPGRADE_DIGEST);
            installV0010(dataSource);
        }
        if (!versionInstalled(dataSource, 11)) {
            installV0011(dataSource);
        }
        return install(dataSource, "v0011_upgrade", FailurePoint.NONE, null);
    }

    InstallResult installFromV0006Fresh(DataSource dataSource) {
        installV0006(dataSource, V0006_FRESH_NAME, V0006_FRESH_DIGEST);
        installV0007(dataSource, V0007_UPGRADE_NAME, V0007_UPGRADE_DIGEST);
        installV0008(dataSource, V0008_UPGRADE_NAME, V0008_UPGRADE_DIGEST);
        installV0009(dataSource, V0009_UPGRADE_NAME, V0009_UPGRADE_DIGEST);
        installV0010(dataSource);
        installV0011(dataSource);
        return install(dataSource, "v0011_upgrade", FailurePoint.NONE, null);
    }

    InstallResult installFromV0007Fresh(DataSource dataSource) {
        installV0007(dataSource, V0007_FRESH_NAME, V0007_FRESH_DIGEST);
        installV0008(dataSource, V0008_UPGRADE_NAME, V0008_UPGRADE_DIGEST);
        installV0009(dataSource, V0009_UPGRADE_NAME, V0009_UPGRADE_DIGEST);
        installV0010(dataSource);
        installV0011(dataSource);
        return install(dataSource, "v0011_upgrade", FailurePoint.NONE, null);
    }

    InstallResult installFromV0008Fresh(DataSource dataSource) {
        installV0008(dataSource, V0008_FRESH_NAME, V0008_FRESH_DIGEST);
        installV0009(dataSource, V0009_UPGRADE_NAME, V0009_UPGRADE_DIGEST);
        installV0010(dataSource);
        installV0011(dataSource);
        return install(dataSource, "v0011_upgrade", FailurePoint.NONE, null);
    }

    InstallResult installFromV0009Fresh(DataSource dataSource) {
        installV0009(dataSource, V0009_FRESH_NAME, V0009_FRESH_DIGEST);
        installV0010(dataSource);
        installV0011(dataSource);
        return install(dataSource, "v0011_upgrade", FailurePoint.NONE, null);
    }

    InstallResult install(
            DataSource dataSource,
            String entryPath,
            FailurePoint failurePoint,
            byte[] suppliedScript) {
        SchemaManifest.Script script = manifest.scriptForEntryPath(entryPath);
        byte[] scriptBytes =
                suppliedScript == null ? readScript(script) : suppliedScript.clone();
        if (!sha256(scriptBytes).equals(script.scriptDigest())) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_script_digest_mismatch",
                    "schema script digest does not match the manifest");
        }

        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                InstallResult existing = existingTarget(connection, script);
                if (existing != null) {
                    connection.commit();
                    return existing;
                }

                try (Statement statement = connection.createStatement()) {
                    statement.execute(new String(scriptBytes, StandardCharsets.UTF_8));
                }
                failAt(failurePoint, FailurePoint.AFTER_SCRIPT);

                try (PreparedStatement insert = connection.prepareStatement("""
                        INSERT INTO robothree_schema_version (
                            version,
                            script_name,
                            script_digest,
                            applied_at,
                            release_version
                        ) VALUES (?, ?, ?, now(), ?)
                        """)) {
                    insert.setInt(1, manifest.targetSchemaVersion());
                    insert.setString(2, script.scriptName());
                    insert.setString(3, script.scriptDigest());
                    insert.setString(4, manifest.releaseVersion());
                    insert.executeUpdate();
                }
                failAt(failurePoint, FailurePoint.AFTER_LEDGER);
                connection.commit();
                return InstallResult.INSTALLED;
            } catch (RuntimeException | SQLException exception) {
                connection.rollback();
                if (exception instanceof PersistenceIntegrityException integrity) {
                    throw integrity;
                }
                if (exception instanceof PersistenceConflictException conflict) {
                    throw conflict;
                }
                throw new PersistenceIntegrityException(
                        "persistence.schema_install_failed",
                        "schema installation failed and was rolled back",
                        exception);
            } finally {
                connection.setAutoCommit(true);
            }
        } catch (SQLException exception) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_install_failed",
                    "schema installation could not acquire a database transaction",
                    exception);
        }
    }

    private InstallResult existingTarget(
            Connection connection, SchemaManifest.Script expected) throws SQLException {
        if (!tableExists(connection, "robothree_schema_version")) {
            return null;
        }
        try (PreparedStatement query = connection.prepareStatement("""
                SELECT script_name, script_digest
                FROM robothree_schema_version
                WHERE version = ?
                FOR UPDATE
                """)) {
            query.setInt(1, manifest.targetSchemaVersion());
            try (ResultSet rows = query.executeQuery()) {
                if (!rows.next()) {
                    return null;
                }
                String scriptName = rows.getString(1);
                String scriptDigest = rows.getString(2);
                if (!scriptName.equals(expected.scriptName())
                        || !scriptDigest.equals(expected.scriptDigest())) {
                    throw new PersistenceConflictException(
                            "persistence.schema_target_conflict",
                            "schema target version is bound to a different script");
                }
                if (rows.next()) {
                    throw new PersistenceConflictException(
                            "persistence.schema_target_conflict",
                            "schema target version is not unique");
                }
                return InstallResult.ALREADY_INSTALLED;
            }
        }
    }

    private static boolean tableExists(Connection connection, String tableName)
            throws SQLException {
        try (PreparedStatement query = connection.prepareStatement("""
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
        }
    }

    private static byte[] readScript(SchemaManifest.Script script) {
        Path directory = switch (script.entryPath()) {
            case "fresh" -> SQL_ROOT.resolve("baseline");
            case "v0011_upgrade" -> SQL_ROOT.resolve("upgrade");
            default -> throw new IllegalArgumentException("unsupported schema entry path");
        };
        try {
            return Files.readAllBytes(directory.resolve(script.scriptName()));
        } catch (IOException exception) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_manifest_mismatch",
                    "manifest script is unavailable",
                    exception);
        }
    }

    private boolean targetInstalled(DataSource dataSource) {
        return versionInstalled(dataSource, manifest.targetSchemaVersion());
    }

    private boolean versionInstalled(DataSource dataSource, int version) {
        try (Connection connection = dataSource.getConnection()) {
            if (!tableExists(connection, "robothree_schema_version")) {
                return false;
            }
            try (PreparedStatement query = connection.prepareStatement("""
                    SELECT count(*)
                    FROM robothree_schema_version
                    WHERE version = ?
                    """)) {
                query.setInt(1, version);
                try (ResultSet rows = query.executeQuery()) {
                    rows.next();
                    return rows.getInt(1) == 1;
                }
            }
        } catch (SQLException exception) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_install_failed",
                    "schema target could not be inspected",
                    exception);
        }
    }

    private static void installV0006(
            DataSource dataSource,
            String scriptName,
            String expectedDigest) {
        Path directory = scriptName.startsWith("B")
                ? SQL_ROOT.resolve("baseline")
                : SQL_ROOT.resolve("upgrade");
        byte[] scriptBytes;
        try {
            scriptBytes = Files.readAllBytes(directory.resolve(scriptName));
        } catch (IOException exception) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_manifest_mismatch",
                    "v0006 schema script is unavailable",
                    exception);
        }
        if (!sha256(scriptBytes).equals(expectedDigest)) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_script_digest_mismatch",
                    "v0006 schema script digest does not match");
        }
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                try (Statement statement = connection.createStatement()) {
                    statement.execute(new String(scriptBytes, StandardCharsets.UTF_8));
                }
                try (PreparedStatement insert = connection.prepareStatement("""
                        INSERT INTO robothree_schema_version (
                            version,
                            script_name,
                            script_digest,
                            applied_at,
                            release_version
                        ) VALUES (6, ?, ?, now(), ?)
                        """)) {
                    insert.setString(1, scriptName);
                    insert.setString(2, expectedDigest);
                    insert.setString(3, V0006_RELEASE);
                    insert.executeUpdate();
                }
                connection.commit();
            } catch (RuntimeException | SQLException exception) {
                connection.rollback();
                throw new PersistenceIntegrityException(
                        "persistence.schema_install_failed",
                        "v0006 schema installation failed and was rolled back",
                        exception);
            } finally {
                connection.setAutoCommit(true);
            }
        } catch (SQLException exception) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_install_failed",
                    "v0006 schema installation could not acquire a transaction",
                    exception);
        }
    }

    private static void installV0007(
            DataSource dataSource,
            String scriptName,
            String expectedDigest) {
        Path directory = scriptName.startsWith("B")
                ? SQL_ROOT.resolve("baseline")
                : SQL_ROOT.resolve("upgrade");
        byte[] scriptBytes;
        try {
            scriptBytes = Files.readAllBytes(directory.resolve(scriptName));
        } catch (IOException exception) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_manifest_mismatch",
                    "v0007 schema script is unavailable",
                    exception);
        }
        if (!sha256(scriptBytes).equals(expectedDigest)) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_script_digest_mismatch",
                    "v0007 schema script digest does not match");
        }
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                try (Statement statement = connection.createStatement()) {
                    statement.execute(new String(scriptBytes, StandardCharsets.UTF_8));
                }
                try (PreparedStatement insert = connection.prepareStatement("""
                        INSERT INTO robothree_schema_version (
                            version, script_name, script_digest, applied_at, release_version
                        ) VALUES (7, ?, ?, now(), ?)
                        """)) {
                    insert.setString(1, scriptName);
                    insert.setString(2, expectedDigest);
                    insert.setString(3, V0007_RELEASE);
                    insert.executeUpdate();
                }
                connection.commit();
            } catch (SQLException | RuntimeException exception) {
                connection.rollback();
                throw new PersistenceIntegrityException(
                        "persistence.schema_install_failed",
                        "v0007 schema installation failed",
                        exception);
            } finally {
                connection.setAutoCommit(true);
            }
        } catch (SQLException exception) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_install_failed",
                    "v0007 schema installation could not acquire a transaction",
                    exception);
        }
    }

    private static void installV0008(
            DataSource dataSource,
            String scriptName,
            String expectedDigest) {
        installHistoricalVersion(
                dataSource,
                8,
                scriptName,
                expectedDigest,
                V0008_RELEASE,
                "v0008");
    }

    private static void installV0009(
            DataSource dataSource,
            String scriptName,
            String expectedDigest) {
        installHistoricalVersion(
                dataSource,
                9,
                scriptName,
                expectedDigest,
                V0009_RELEASE,
                "v0009");
    }

    private static void installV0010(DataSource dataSource) {
        installHistoricalVersion(dataSource, 10, V0010_UPGRADE_NAME,
                V0010_UPGRADE_DIGEST, V0010_RELEASE, "v0010");
    }

    private static void installV0011(DataSource dataSource) {
        installHistoricalVersion(dataSource, 11, V0011_UPGRADE_NAME,
                V0011_UPGRADE_DIGEST, V0011_RELEASE, "v0011");
    }

    private static void installHistoricalVersion(
            DataSource dataSource,
            int version,
            String scriptName,
            String expectedDigest,
            String releaseVersion,
            String label) {
        Path directory = scriptName.startsWith("B")
                ? SQL_ROOT.resolve("baseline")
                : SQL_ROOT.resolve("upgrade");
        byte[] scriptBytes;
        try {
            scriptBytes = Files.readAllBytes(directory.resolve(scriptName));
        } catch (IOException exception) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_manifest_mismatch",
                    label + " schema script is unavailable",
                    exception);
        }
        if (!sha256(scriptBytes).equals(expectedDigest)) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_script_digest_mismatch",
                    label + " schema script digest does not match");
        }
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                try (Statement statement = connection.createStatement()) {
                    statement.execute(new String(scriptBytes, StandardCharsets.UTF_8));
                }
                try (PreparedStatement insert = connection.prepareStatement("""
                        INSERT INTO robothree_schema_version (
                            version, script_name, script_digest, applied_at, release_version
                        ) VALUES (?, ?, ?, now(), ?)
                        """)) {
                    insert.setInt(1, version);
                    insert.setString(2, scriptName);
                    insert.setString(3, expectedDigest);
                    insert.setString(4, releaseVersion);
                    insert.executeUpdate();
                }
                connection.commit();
            } catch (SQLException | RuntimeException exception) {
                connection.rollback();
                throw new PersistenceIntegrityException(
                        "persistence.schema_install_failed",
                        label + " schema installation failed",
                        exception);
            } finally {
                connection.setAutoCommit(true);
            }
        } catch (SQLException exception) {
            throw new PersistenceIntegrityException(
                    "persistence.schema_install_failed",
                    label + " schema installation could not acquire a transaction",
                    exception);
        }
    }

    private static void failAt(FailurePoint actual, FailurePoint expected) throws SQLException {
        if (actual == expected) {
            throw new SQLException("named schema installer failure");
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of()
                    .formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    enum FailurePoint {
        NONE,
        AFTER_SCRIPT,
        AFTER_LEDGER
    }

    enum InstallResult {
        INSTALLED,
        ALREADY_INSTALLED
    }
}
