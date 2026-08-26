package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class CentralCgf2b2ArchitectureTest {

    private static final Path ROOT = Path.of(".");
    private static final Path MAIN = ROOT.resolve("src/main");
    private static final Path MODEL_GATEWAY =
            MAIN.resolve("java/com/robothree/central/modelgateway");

    @Test
    void bridgesRuntimeThroughTypedPortsWithoutProviderWireInApplication()
            throws IOException {
        String application = javaSources(MODEL_GATEWAY.resolve("application"));
        String bridge = javaSources(MODEL_GATEWAY.resolve("adapter/runtime"));
        String ports = javaSources(MODEL_GATEWAY.resolve("port"));

        assertThat(application)
                .contains("class ModelInvocationRuntime")
                .doesNotContain("ModelProviderAdapter")
                .doesNotContain("ModelAuthorizedHttpTransport")
                .doesNotContain("HttpClient");
        assertThat(bridge)
                .contains("ProviderBackedModelInvocationExecutionBackend")
                .contains("StrictModelProviderAdapterRegistry")
                .contains("ModelInvocationEphemeralPublisher")
                .doesNotContain("Repository")
                .doesNotContain("HttpClient");
        assertThat(ports)
                .contains("interface ModelProviderRequestSource")
                .contains("interface ModelProviderAdapterRegistry")
                .contains("interface ModelInvocationEphemeralPublisher");
    }

    @Test
    void addsNoSchemaOrPublicContractChange() throws Exception {
        String production = javaSources(MAIN.resolve("java"));
        assertThat(production)
                .doesNotContain("api.deepseek.com")
                .doesNotContain("api.openai.com")
                .doesNotContain("api.anthropic.com");
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

    @Test
    void confinesProcessEnvironmentAccessToTheDevelopmentCredentialSource()
            throws IOException {
        String modelGateway = javaSources(MODEL_GATEWAY);
        String credentialSource = Files.readString(MODEL_GATEWAY.resolve(
                "development/DevelopmentModelCredentialMaterialSource.java"));

        assertThat(count(modelGateway, "System::getenv")).isEqualTo(1);
        assertThat(credentialSource)
                .contains("ROBOTHREE_CGF2B[23]_")
                .contains("System::getenv")
                .doesNotContain("@Component")
                .doesNotContain("@Bean")
                .doesNotContain("@Profile");
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

    private static int count(String value, String token) {
        return value.split(java.util.regex.Pattern.quote(token), -1).length - 1;
    }

    private static String sha256(Path path) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(
                        Files.readAllBytes(path)));
    }
}
