package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class CentralCgf2b31ArchitectureTest {

    private static final Path ROOT = Path.of(".");
    private static final Path MAIN = ROOT.resolve("src/main");
    private static final Path TEST = ROOT.resolve("src/test");
    private static final Path MODEL_GATEWAY =
            MAIN.resolve("java/com/robothree/central/modelgateway");

    @Test
    void keepsConnectionSourceAndWireProtocolOrthogonal() throws IOException {
        String backend = Files.readString(MODEL_GATEWAY.resolve(
                "adapter/runtime/ProviderBackedModelInvocationExecutionBackend.java"));
        String openAi = Files.readString(MODEL_GATEWAY.resolve(
                "adapter/provider/OpenAiCompatibleModelProviderAdapter.java"));
        String anthropic = Files.readString(MODEL_GATEWAY.resolve(
                "adapter/provider/AnthropicCompatibleModelProviderAdapter.java"));
        String production = javaSources(MODEL_GATEWAY);

        assertThat(backend)
                .contains("ConnectionMode.DIRECT_PROVIDER")
                .contains("ConnectionMode.CUSTOM_RELAY")
                .doesNotContain("HttpClient")
                .doesNotContain("Repository");
        assertThat(openAi)
                .contains("request.binding().upstreamModelId()")
                .contains("chat/completions");
        assertThat(anthropic)
                .contains("request.binding().upstreamModelId()")
                .contains("v1/messages");
        assertThat(production)
                .doesNotContain("EnterpriseRelayModelProviderAdapter")
                .doesNotContain("CustomRelayModelProviderAdapter")
                .doesNotContain("automaticFailover")
                .doesNotContain("silentFallback");
    }

    @Test
    void confinesRelayResourcesToVersionedTestSeedAndOptInHarness()
            throws IOException {
        String production = javaSources(MAIN.resolve("java"));
        String seed = Files.readString(TEST.resolve(
                "java/com/robothree/central/modelgateway/adapter/runtime/"
                        + "CustomRelayBindingSeed.java"));
        String harness = Files.readString(TEST.resolve(
                "java/com/robothree/central/modelgateway/adapter/runtime/"
                        + "CustomRelayConformanceHarness.java"));

        assertThat(seed)
                .contains("binding.cgf2b3.custom-relay")
                .contains("credential.cgf2b3.custom-relay")
                .contains("ConnectionMode.CUSTOM_RELAY")
                .contains("RecoveryMode.MANUAL_RECONCILIATION");
        assertThat(harness)
                .contains("ROBOTHREE_CGF2B3_CUSTOM_RELAY_KEY")
                .contains("StrictModelOutboundEndpointPolicy")
                .contains("CustomRelayBindingSeed.create");
        assertThat(production)
                .doesNotContain("ROBOTHREE_CGF2B3_CUSTOM_RELAY_KEY")
                .doesNotContain("binding.cgf2b3.custom-relay")
                .doesNotContain("credential.cgf2b3.custom-relay");
    }

    @Test
    void addsNoSchemaMigrationOrPublicContractChange()
            throws Exception {
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
