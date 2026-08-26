package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class CentralCgf2b33ArchitectureTest {

    private static final Path ROOT = Path.of(".");
    private static final Path MAIN = ROOT.resolve("src/main");

    @Test
    void keepsB33FaultInjectionAndControlSurfacesInTestScope()
            throws IOException {
        String production = javaSources(MAIN.resolve("java"));
        String tests = javaSources(ROOT.resolve("src/test/java"));

        assertThat(tests)
                .contains("ROBOTHREE_CGF2B33_RESULT")
                .contains("RESET_AFTER_FIRST_DELTA")
                .contains("OVERSIZED_FRAME")
                .contains("redirectTargetCount");
        assertThat(production)
                .doesNotContain("ROBOTHREE_CGF2B33")
                .doesNotContain("RESET_AFTER_FIRST_DELTA")
                .doesNotContain("/redirect-target");
    }

    @Test
    void freezesRepairAndDurableTerminalOwnership() throws IOException {
        String transport = Files.readString(MAIN.resolve(
                "java/com/robothree/central/modelgateway/adapter/http/"
                        + "JdkModelAuthorizedHttpTransport.java"));
        String backend = Files.readString(MAIN.resolve(
                "java/com/robothree/central/modelgateway/adapter/runtime/"
                        + "ProviderBackedModelInvocationExecutionBackend.java"));

        assertThat(transport)
                .contains("relativePath.indexOf('%') >= 0")
                .contains("relativePath.indexOf('\\\\') >= 0");
        assertThat(backend)
                .contains("DETERMINISTIC_PROVIDER_FAILURES")
                .contains("model_gateway.provider_redirect_rejected")
                .contains("model_gateway.provider_frame_oversized")
                .doesNotContain("Repository")
                .doesNotContain("ModelInvocationPersistence");
    }

    @Test
    void keepsClosureCommandResourceGatedAndPublicFactsUnchanged()
            throws Exception {
        String closure = Files.readString(ROOT.resolve(
                "../../scripts/run-cgf2b3-closure.mjs"));
        assertThat(closure)
                .contains("delete environment[name]")
                .contains("RESOURCE_GATED")
                .contains("Cgf2b32DualNodeRelayRecoveryIntegrationTest")
                .contains("CentralCgf2b33ArchitectureTest")
                .contains("sensitiveOutputMatchCount");
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
