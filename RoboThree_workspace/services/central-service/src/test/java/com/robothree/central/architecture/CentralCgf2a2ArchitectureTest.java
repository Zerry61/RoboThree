package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class CentralCgf2a2ArchitectureTest {

    private static final Path ROOT = Path.of(".");
    private static final Path MAIN = ROOT.resolve("src/main");
    private static final Path MODEL_GATEWAY =
            MAIN.resolve("java/com/robothree/central/modelgateway");

    @Test
    void keepsTheCgf2aRuntimeIndependentFromProviderWireAdapters()
            throws IOException {
        String runtime = readJavaSources(MODEL_GATEWAY.resolve("application"));
        assertThat(runtime)
                .contains("class ModelInvocationRuntime")
                .doesNotContain("HttpClient")
                .doesNotContain("OpenAiCompatibleModelProviderAdapter")
                .doesNotContain("AnthropicCompatibleModelProviderAdapter")
                .doesNotContain("ModelAuthorizedHttpTransport");
        String sources = readJavaSources(MODEL_GATEWAY);
        assertThat(sources)
                .contains("interface ModelEndpointBindingResolver")
                .contains("interface ModelCredentialResolver")
                .contains("interface ModelInvocationExecutionBackend")
                .contains("class ScriptedFakeModelInvocationBackend")
                .doesNotContain("WebClient")
                .doesNotContain("DeepSeek");
    }

    @Test
    void persistsOnlyTheDecisionDigestAndNeverConnectionOrCredentialData()
            throws IOException {
        String runtime = Files.readString(
                MODEL_GATEWAY.resolve("application/ModelInvocationRuntime.java"));
        String decision = Files.readString(
                MODEL_GATEWAY.resolve("application/ModelDispatchDecision.java"));
        String schema = Files.readString(
                ROOT.resolve(
                        "deploy/sql/postgresql/baseline/"
                                + "B0007__model_invocation_foundation.sql"));

        assertThat(schema).contains("dispatch_decision VARCHAR(64)");
        assertThat(decision)
                .contains("CanonicalJson.sha256")
                .contains("bindingRevision")
                .contains("bindingDigest")
                .doesNotContain("endpoint")
                .doesNotContain("credential");
        assertThat(runtime)
                .contains("decision.persistedValue()")
                .doesNotContain("dispatchDecision().endpoint")
                .doesNotContain("dispatchDecision().credential");
    }

    @Test
    void authorizesModelUseWithoutPersistingTransportSecrets()
            throws IOException {
        String authorizer = Files.readString(
                MODEL_GATEWAY.resolve(
                        "application/RoboThreeModelInvocationAccessAuthorizer.java"));
        assertThat(authorizer)
                .contains("EnterpriseBearerAuthorizer")
                .contains("compactAccessToken, \"model.use\", clock.instant()")
                .contains("EnterpriseBearerAuthorization.requirePrincipal")
                .doesNotContain("RoboThreeAccessTokenValidator");
    }

    @Test
    void doesNotIntroduceANewSchemaOrModifyTheProviderContract() {
        assertThat(Files.exists(ROOT.resolve(
                        "deploy/sql/postgresql/baseline/"
                                + "B0008__model_invocation_runtime.sql")))
                .isFalse();
        assertThat(Files.exists(ROOT.resolve(
                        "deploy/sql/postgresql/upgrade/"
                                + "U0008__model_invocation_runtime.sql")))
                .isFalse();
    }

    @Test
    void preservesTheCgf2a1V0007FilesByteForByte() throws Exception {
        Path sql = ROOT.resolve("deploy/sql/postgresql");
        assertThat(sha256(sql.resolve(
                        "baseline/B0007__model_invocation_foundation.sql")))
                .isEqualTo(
                        "c7a5f29568587c3cfc48fab6766374b762f5a629c77f711ea20b7cbbc79d9140");
        assertThat(sha256(sql.resolve(
                        "upgrade/U0007__model_invocation_from_v0006.sql")))
                .isEqualTo(
                        "6feb82c722ad8dc34ff0d94f8fe6b09de7fc55e7e773dc8f1f90a09b584c944a");
        assertThat(sha256(sql.resolve("manifest/postgresql-v0007.json")))
                .isEqualTo(
                        "883c28426232dd359eeea7d59374d2bc459ca58a1e23015e2be6f3ca37e92132");
        assertThat(sha256(sql.resolve(
                        "manifest/postgresql-v0007.json.sha256")))
                .isEqualTo(
                        "e6a257047363933daf21fca46a96cec4b5fd1b396688c9e81da71e0adb11fa48");
    }

    private static String readJavaSources(Path root) throws IOException {
        try (var paths = Files.walk(root)) {
            return paths.filter(path -> path.toString().endsWith(".java"))
                    .map(path -> {
                        try {
                            return Files.readString(path);
                        } catch (IOException exception) {
                            throw new IllegalStateException(exception);
                        }
                    })
                    .reduce("", (left, right) -> left + "\n" + right);
        }
    }

    private static String sha256(Path path) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(
                        Files.readAllBytes(path)));
    }
}
