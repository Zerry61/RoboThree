package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class CentralCgf2a3ArchitectureTest {

    private static final Path ROOT = Path.of(".");
    private static final Path MAIN = ROOT.resolve("src/main");
    private static final Path HARNESS = ROOT.resolve(
            "src/test/java/com/robothree/central/modelgateway/recovery");

    @Test
    void keepsTheDualJvmRecoveryHarnessTestOnly() throws IOException {
        String production = javaSources(MAIN.resolve("java"));
        String harness = javaSources(HARNESS);

        assertThat(production)
                .doesNotContain("model-recovery-harness")
                .doesNotContain("ModelRecoveryHarnessNodeMain")
                .doesNotContain("ROBOTHREE_CLUSTER_JDBC_URL")
                .doesNotContain("ProcessBuilder");
        assertThat(harness)
                .contains("@Profile(\"model-recovery-harness\")")
                .contains("ModelRecoveryHarnessNodeMain")
                .contains("ProcessBuilder")
                .contains("surefire.test.class.path")
                .contains("new PostgreSQLContainer<>(\"postgres:16-alpine\")");
    }

    @Test
    void provesTheFrozenCrossNodeRecoveryMatrixWithoutCouplingItToProviderWire()
            throws IOException {
        String harness = javaSources(HARNESS);
        String runtime = javaSources(MAIN.resolve(
                "java/com/robothree/central/modelgateway/application"));

        assertThat(harness)
                .contains("model_gateway.fencing_epoch_conflict")
                .contains("dispatch_decided")
                .contains("text/event-stream")
                .contains("lease_not_expired")
                .contains("pauseContainerCmd")
                .contains("central.production_readiness_failed")
                .contains("activeSseSubscribers")
                .contains("activeRecoveryLeaseCount");
        assertThat(runtime)
                .doesNotContain("@RestController")
                .doesNotContain("HttpClient")
                .doesNotContain("WebClient")
                .doesNotContain("ModelProviderAdapter")
                .doesNotContain("ModelAuthorizedHttpTransport");
    }

    @Test
    void leavesContractSchemaAndProviderSurfaceFrozen() {
        assertThat(Files.exists(ROOT.resolve(
                        "deploy/sql/postgresql/baseline/"
                                + "B0008__model_invocation_recovery.sql")))
                .isFalse();
        assertThat(Files.exists(ROOT.resolve(
                        "deploy/sql/postgresql/upgrade/"
                                + "U0008__model_invocation_recovery.sql")))
                .isFalse();
        assertThat(Files.exists(MAIN.resolve(
                        "java/com/robothree/central/modelgateway/controller")))
                .isFalse();
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
}
