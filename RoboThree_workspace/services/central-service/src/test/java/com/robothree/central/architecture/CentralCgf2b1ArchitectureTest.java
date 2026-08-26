package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class CentralCgf2b1ArchitectureTest {

    private static final Path ROOT = Path.of(".");
    private static final Path MAIN = ROOT.resolve("src/main");
    private static final Path MODEL_GATEWAY =
            MAIN.resolve("java/com/robothree/central/modelgateway");

    @Test
    void keepsTheTwoWireProtocolsInSeparateAdapters() throws IOException {
        String openAi = Files.readString(MODEL_GATEWAY.resolve(
                "adapter/provider/OpenAiCompatibleModelProviderAdapter.java"));
        String anthropic = Files.readString(MODEL_GATEWAY.resolve(
                "adapter/provider/AnthropicCompatibleModelProviderAdapter.java"));

        assertThat(openAi)
                .contains("chat/completions")
                .contains("AuthorizationScheme.BEARER")
                .doesNotContain("v1/messages")
                .doesNotContain("ANTHROPIC_API_KEY");
        assertThat(anthropic)
                .contains("v1/messages")
                .contains("AuthorizationScheme.ANTHROPIC_API_KEY")
                .contains("anthropic-version")
                .doesNotContain("chat/completions");
    }

    @Test
    void confinesJavaHttpAndCredentialMaterialToTheAuthorizedTransport()
            throws IOException {
        String transport = Files.readString(MODEL_GATEWAY.resolve(
                "adapter/http/JdkModelAuthorizedHttpTransport.java"));
        String modelSources = javaSources(MODEL_GATEWAY);

        assertThat(transport)
                .contains("HttpClient")
                .contains("client.followRedirects() != HttpClient.Redirect.NEVER")
                .contains("credentialSource.resolve")
                .contains("Arrays.fill");
        assertThat(count(modelSources, "java.net.http.HttpClient")).isEqualTo(1);
        assertThat(javaSources(MODEL_GATEWAY.resolve("application")))
                .doesNotContain("ModelProviderAdapter")
                .doesNotContain("ModelAuthorizedHttpTransport")
                .doesNotContain("HttpClient");
    }

    @Test
    void addsNoSchemaMigrationOrRealProviderConfiguration()
            throws Exception {
        String production = javaSources(MAIN.resolve("java"))
                + Files.readString(MAIN.resolve("resources/application.yaml"))
                + Files.readString(MAIN.resolve("resources/application-production.yaml"));

        assertThat(production)
                .doesNotContain("DeepSeek")
                .doesNotContain("api.deepseek.com")
                .doesNotContain("api.openai.com")
                .doesNotContain("api.anthropic.com")
                .doesNotContain("credential-sentinel-cgf2b1-never-log")
                .doesNotContain("StubProviderServer");
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

    private static int count(String value, String token) {
        return value.split(java.util.regex.Pattern.quote(token), -1).length - 1;
    }

    private static String sha256(Path path) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(
                        Files.readAllBytes(path)));
    }
}
