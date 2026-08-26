package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class CentralCgf2b32ArchitectureTest {

    private static final Path ROOT = Path.of(".");
    private static final Path MAIN = ROOT.resolve("src/main");
    private static final Path TEST = ROOT.resolve("src/test");
    private static final Path B32 = TEST.resolve(
            "java/com/robothree/central/modelgateway/recovery");

    @Test
    void keepsTheDualNodeRelayHarnessOnTheRealProviderBackedPath()
            throws IOException {
        String b32 = cgf2b32Sources();

        assertThat(b32)
                .contains("ProviderBackedModelInvocationExecutionBackend")
                .contains("OpenAiCompatibleModelProviderAdapter")
                .contains("AnthropicCompatibleModelProviderAdapter")
                .contains("JdkModelAuthorizedHttpTransport")
                .contains("ModelInvocationRuntime")
                .contains("PostgreSQLContainer")
                .contains("ROBOTHREE_CGF2B32_RUN_CANARY")
                .contains("Cgf2b32ControlledRelayMain")
                .doesNotContain("ScriptedFakeModelInvocationBackend")
                .doesNotContain("HarnessModelInvocationBackend");
    }

    @Test
    void confinesFailpointsRelayAndHarnessEndpointsToTestScope()
            throws IOException {
        String production = javaSources(MAIN.resolve("java"));
        String b32 = cgf2b32Sources();

        assertThat(b32)
                .contains("cgf2b32-harness")
                .contains("Cgf2b32FailpointBackend")
                .contains("Cgf2b32ControlledRelayMain");
        assertThat(production)
                .doesNotContain("cgf2b32-harness")
                .doesNotContain("Cgf2b32FailpointBackend")
                .doesNotContain("Cgf2b32ControlledRelayMain")
                .doesNotContain("ROBOTHREE_CGF2B32");
    }

    @Test
    void preservesBackendOwnershipAndPublicContracts() throws Exception {
        String backend = Files.readString(MAIN.resolve(
                "java/com/robothree/central/modelgateway/adapter/runtime/"
                        + "ProviderBackedModelInvocationExecutionBackend.java"));
        String providers = javaSources(MAIN.resolve(
                "java/com/robothree/central/modelgateway/adapter/provider"));

        assertThat(backend)
                .doesNotContain("Repository")
                .doesNotContain("ModelInvocationPersistence");
        assertThat(providers)
                .doesNotContain("Repository")
                .doesNotContain("ModelInvocationPersistence");
        assertThat(Files.exists(ROOT.resolve(
                        "deploy/sql/postgresql/baseline/B0008__model_provider.sql")))
                .isFalse();
        assertThat(Files.exists(ROOT.resolve(
                        "deploy/sql/postgresql/upgrade/U0008__model_provider.sql")))
                .isFalse();
        assertThat(sha256(ROOT.resolve(
                        "../../contracts/enterprise-gateway/v1alpha1/schemas/"
                                + "model-invocation.schema.json")))
                .isEqualTo(
                        "435bc8ce0815f0ed10de6b3a567b1ecade82418f24c4aec062c8ed480cf19da7");
        assertThat(sha256(ROOT.resolve(
                        "../../contracts/enterprise-gateway/v1alpha1/openapi.yaml")))
                .isEqualTo(
                        "0b872be7678bb4451203f16213ff372fdf2da9fff224769eb37cc82b3cdac3c4");
    }

    private static String cgf2b32Sources() throws IOException {
        try (var paths = Files.list(B32)) {
            return paths
                    .filter(path -> path.getFileName().toString().startsWith("Cgf2b32"))
                    .filter(path -> path.toString().endsWith(".java"))
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

    private static String javaSources(Path root) throws IOException {
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
