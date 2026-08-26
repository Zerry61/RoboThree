package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class CentralArh321ArchitectureTest {

    private static final Path ROOT = Path.of("").toAbsolutePath().normalize();
    private static final Path MODEL_GATEWAY = ROOT.resolve(
            "src/main/java/com/robothree/central/modelgateway");

    @Test
    void keepsV1Alpha2BehindAnExplicitApplicationActivationSeam() throws IOException {
        String controller = Files.readString(MODEL_GATEWAY.resolve(
                "adapter/http/ModelInvocationV1Alpha2Controller.java"));
        String service = Files.readString(MODEL_GATEWAY.resolve(
                "application/ModelInvocationV1Alpha2GatewayService.java"));

        assertThat(controller)
                .contains("@ConditionalOnBean(ModelInvocationV1Alpha2GatewayService.class)")
                .contains("@RequestMapping(path = \"/v1alpha2/model-invocations\")")
                .contains("@PostMapping")
                .contains("@GetMapping")
                .doesNotContain("@PutMapping")
                .doesNotContain("@PatchMapping")
                .doesNotContain("@DeleteMapping")
                .doesNotContain("Repository")
                .doesNotContain("@Transactional")
                .doesNotContain("MyBatis")
                .doesNotContain("Jdbc");
        assertThat(service)
                .contains("public interface ModelInvocationV1Alpha2GatewayService")
                .contains("String sessionScopeDigest")
                .contains("String cacheContextDigest")
                .doesNotContain("@Service")
                .doesNotContain("@Component");
    }

    @Test
    void keepsArh323ProviderProjectionInsideTheProviderAdapterBoundary()
            throws IOException {
        Path providerAdapters = MODEL_GATEWAY.resolve("adapter/provider");
        try (Stream<Path> sources = Files.walk(providerAdapters)) {
            String production = sources
                    .filter(Files::isRegularFile)
                    .map(path -> {
                        try {
                            return Files.readString(path);
                        } catch (IOException exception) {
                            throw new IllegalStateException(exception);
                        }
                    })
                    .reduce("", (left, right) -> left + "\n" + right);
            assertThat(production)
                    .contains("cache_control")
                    .contains("prompt_cache_key")
                    .doesNotContain("PromptCachePlanRepository")
                    .doesNotContain("PromptCacheProfileResolver");
        }
    }
}
