package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class CentralCgf2c1ArchitectureTest {

    private static final Path ROOT = Path.of("").toAbsolutePath().normalize();
    private static final Path MODEL_GATEWAY = ROOT.resolve(
            "src/main/java/com/robothree/central/modelgateway");

    @Test
    void keepsTheModelControllerThinAndLimitedToGetAndPost() throws IOException {
        String controller = Files.readString(MODEL_GATEWAY.resolve(
                "adapter/http/ModelInvocationController.java"));

        assertThat(controller)
                .contains("@PostMapping")
                .contains("@GetMapping")
                .contains("ModelInvocationGatewayService")
                .doesNotContain("@PutMapping")
                .doesNotContain("@PatchMapping")
                .doesNotContain("@DeleteMapping")
                .doesNotContain("Repository")
                .doesNotContain("@Transactional")
                .doesNotContain("MyBatis")
                .doesNotContain("Jdbc");
    }

    @Test
    void keepsProductionAdmissionStrictAndEphemeralFactsOutOfPersistence()
            throws IOException {
        String admission = Files.readString(MODEL_GATEWAY.resolve(
                "application/ModelInvocationAdmissionPolicy.java"));
        String buffer = Files.readString(MODEL_GATEWAY.resolve(
                "application/ModelInvocationEphemeralBuffer.java"));
        String persistence = Files.readString(ROOT.resolve(
                "src/main/java/com/robothree/central/persistence/mybatis/adapter/"
                        + "MyBatisModelInvocationPersistence.java"));

        assertThat(admission)
                .contains("production()")
                .contains("user_confirmed")
                .doesNotContain("production(\"development_synthetic\"");
        assertThat(buffer)
                .contains("started", "text_delta", "tool_call")
                .doesNotContain("Repository");
        assertThat(persistence)
                .doesNotContain("text_delta")
                .doesNotContain("tool_call")
                .doesNotContain("promptText")
                .doesNotContain("promptBody")
                .doesNotContain("promptPayload")
                .doesNotContain("requestBody")
                .doesNotContain("assistantOutput");
    }

    @Test
    void doesNotAddCentralSchemaOrRewriteTheCanonicalGatewayContract() {
        assertThat(Files.exists(ROOT.resolve(
                "deploy/sql/postgresql/baseline/B0008__model_gateway_surface.sql")))
                .isFalse();
        assertThat(Files.exists(ROOT.resolve(
                "deploy/sql/postgresql/upgrade/U0008__model_gateway_surface.sql")))
                .isFalse();
    }
}
