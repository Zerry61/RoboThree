package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class CentralArh323ArchitectureTest {

    private static final Path ROOT = Path.of("").toAbsolutePath().normalize();
    private static final Path MODEL_GATEWAY = ROOT.resolve(
            "src/main/java/com/robothree/central/modelgateway");

    @Test
    void keepsPlanResolutionInApplicationAndWireProjectionInAdapters()
            throws IOException {
        String resolver = Files.readString(MODEL_GATEWAY.resolve(
                "application/ProviderCacheProjectionResolver.java"));
        String adapters = readTree(MODEL_GATEWAY.resolve("adapter/provider"));
        assertThat(resolver)
                .contains("PromptCachePlanRepository")
                .contains("PromptCacheProfileResolver")
                .doesNotContain("HttpClient")
                .doesNotContain("cache_control")
                .doesNotContain("prompt_cache_key");
        assertThat(adapters)
                .contains("cache_control")
                .contains("prompt_cache_key")
                .doesNotContain("PromptCachePlanRepository")
                .doesNotContain("PromptCacheProfileResolver")
                .doesNotContain("insertImmutable(");
    }

    @Test
    void keepsMarkerPolicyNamesFreeOfProviderTimeConstants() throws IOException {
        String registry = Files.readString(MODEL_GATEWAY.resolve(
                "application/VersionedPromptCacheMarkerPolicyRegistry.java"));
        assertThat(registry)
                .contains("anthropic_ephemeral_default_system_last_static_v1")
                .contains("anthropic_ephemeral_default_tool_last_static_v1")
                .doesNotContain("5m")
                .doesNotContain("1h");
    }

    @Test
    void doesNotAddRetentionFieldsOrAdvanceDurableSchema() throws IOException {
        String production = readTree(MODEL_GATEWAY);
        assertThat(production)
                .doesNotContain("prompt_cache_retention")
                .doesNotContain("\"ttl\"")
                .doesNotContain("PromptCacheEvidenceClosure")
                .doesNotContain("PersonalPromptCachePersistence");
        assertThat(ROOT.resolve(
                        "deploy/sql/postgresql/upgrade/U0010__prompt_cache_projection.sql"))
                .doesNotExist();
    }

    @Test
    void keepsBackendAndAdapterAwayFromDurableTerminalRepositories()
            throws IOException {
        String backend = readTree(MODEL_GATEWAY.resolve("adapter/runtime"));
        String adapters = readTree(MODEL_GATEWAY.resolve("adapter/provider"));
        assertThat(backend + adapters)
                .doesNotContain("ModelInvocationRepository")
                .doesNotContain("ModelUsageLedger")
                .doesNotContain("ProviderUsageFactRepository")
                .doesNotContain("@Transactional");
    }

    private static String readTree(Path root) throws IOException {
        try (Stream<Path> paths = Files.walk(root)) {
            return paths.filter(Files::isRegularFile)
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
}
