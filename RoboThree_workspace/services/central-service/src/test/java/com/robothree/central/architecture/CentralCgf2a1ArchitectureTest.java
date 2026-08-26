package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class CentralCgf2a1ArchitectureTest {

    private static final Path ROOT = Path.of(".");
    private static final Path SQL = ROOT.resolve("deploy/sql/postgresql");
    private static final Path MAIN = ROOT.resolve("src/main");

    @Test
    void preservesV0006AndAddsOnlyTheNextV0007SchemaVersion() throws Exception {
        assertThat(sha256(SQL.resolve("baseline/B0006__central_foundation.sql")))
                .isEqualTo(
                        "2d2d99172746aa7f2f5431a9c4273c1893694df0fa31eb8dddea8d48de2fd480");
        assertThat(sha256(SQL.resolve("upgrade/U0006__bridge_from_flyway_v5.sql")))
                .isEqualTo(
                        "ff2e819ad5f80229035554b54ec802a7d2a3ef70fc7c665f138efc6bc0b37909");
        assertThat(sha256(SQL.resolve("manifest/postgresql-v0006.json")))
                .isEqualTo(
                        "4e6647ef6a33a5507a23d241c9d0d1556c37284d8049935139a4ad76012e1bd5");

        String manifest = Files.readString(
                SQL.resolve("manifest/postgresql-v0007.json"));
        assertThat(manifest)
                .contains("\"targetSchemaVersion\":7")
                .contains("B0007__model_invocation_foundation.sql")
                .contains("U0007__model_invocation_from_v0006.sql")
                .contains("\"supportedEntryPaths\":[\"fresh\",\"v0006_upgrade\"]");
        assertThat(Files.exists(SQL.resolve("baseline/B0008__anything.sql"))).isFalse();
        assertThat(Files.exists(SQL.resolve("upgrade/U0008__anything.sql"))).isFalse();
    }

    @Test
    void keepsPromptOutputTokenDeltaAndCredentialsOutOfTheLedger() throws IOException {
        String fresh = Files.readString(
                SQL.resolve("baseline/B0007__model_invocation_foundation.sql"));
        String schema = fresh.substring(fresh.indexOf("CREATE TABLE model_invocation ("))
                + Files.readString(
                        SQL.resolve("upgrade/U0007__model_invocation_from_v0006.sql"));
        assertThat(schema)
                .contains("model_invocation")
                .contains("model_invocation_event")
                .contains("model_invocation_recovery_lease")
                .contains("model_invocation_audit_outbox")
                .doesNotContain("prompt_text")
                .doesNotContain("output_text")
                .doesNotContain("token_delta")
                .doesNotContain("credential")
                .doesNotContain("api_key")
                .doesNotContain("access_token");
    }

    @Test
    void usesExplicitMybatisSqlForIdempotencyLocksAndCas() throws IOException {
        String mapper = Files.readString(
                MAIN.resolve("resources/mybatis/ModelInvocationMapper.xml"));
        assertThat(mapper)
                .contains("ON CONFLICT (enterprise_id, user_id, device_id, client_instance_id, client_request_id)")
                .contains("FOR UPDATE")
                .contains("status_revision = #{expectedStatusRevision}")
                .contains("fencing_epoch = #{expectedFencingEpoch}")
                .contains("ORDER BY event_sequence")
                .doesNotContain("${")
                .doesNotContain("Wrapper")
                .doesNotContain(".last(");
    }

    @Test
    void preservesTheCgf2aApplicationAndPersistenceBoundaries()
            throws IOException {
        Path modelGateway = MAIN.resolve("java/com/robothree/central/modelgateway");
        assertThat(Files.exists(modelGateway.resolve("application"))).isTrue();
        assertThat(Files.exists(modelGateway.resolve("development"))).isTrue();
        String sources;
        try (var paths = Files.walk(modelGateway)) {
            sources = paths.filter(path -> path.toString().endsWith(".java"))
                    .map(path -> {
                        try {
                            return Files.readString(path);
                        } catch (IOException exception) {
                            throw new IllegalStateException(exception);
                        }
                    })
                    .reduce("", (left, right) -> left + "\n" + right);
        }
        assertThat(sources)
                .doesNotContain("WebClient")
                .doesNotContain("RestClient")
                .doesNotContain("DeepSeek")
                .doesNotContain("ProcessBuilder");
        assertThat(sources)
                .contains("ModelInvocationRuntime")
                .contains("VersionedDevelopmentModelBindingRegistry")
                .contains("ScriptedFakeModelInvocationBackend");
    }

    @Test
    void usesDatabaseTimeAndLockedLeaseReadsForRecoveryOwnership()
            throws IOException {
        String mapper = Files.readString(
                MAIN.resolve("resources/mybatis/ModelInvocationMapper.xml"));
        assertThat(mapper)
                .contains("SELECT CURRENT_TIMESTAMP")
                .contains("FROM model_invocation_recovery_lease")
                .contains("FOR UPDATE");
    }

    private static String sha256(Path path) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)));
    }
}
