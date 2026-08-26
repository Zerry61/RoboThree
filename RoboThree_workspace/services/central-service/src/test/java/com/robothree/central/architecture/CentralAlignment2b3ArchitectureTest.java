package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class CentralAlignment2b3ArchitectureTest {

    private static final Path MAIN_JAVA = Path.of("src/main/java");
    private static final Path CLUSTER_TESTS = Path.of(
            "src/test/java/com/robothree/central/cluster");

    @Test
    void destructiveFaultControlsRemainTestOnly() throws IOException {
        String productionSources = allJavaSources(MAIN_JAVA);
        String harnessSources = allJavaSources(CLUSTER_TESTS);

        assertThat(productionSources)
                .doesNotContain("Runtime.getRuntime().halt")
                .doesNotContain("/cluster-harness/failures/")
                .doesNotContain("pauseContainerCmd")
                .doesNotContain("updateSchemaDigest");
        assertThat(harnessSources)
                .contains("Runtime.getRuntime().halt(73)")
                .contains("Runtime.getRuntime().halt(74)")
                .contains("/cluster-harness/failures/permission-before-commit")
                .contains("/cluster-harness/failures/permission-after-commit");
    }

    @Test
    void failureMatrixUsesRealProcessDatabaseAndReadinessBoundaries()
            throws IOException {
        String integration = Files.readString(
                CLUSTER_TESTS.resolve(
                        "Alignment2b2DualNodeFoundationIntegrationTest.java"));
        String application = Files.readString(
                CLUSTER_TESTS.resolve("ClusterHarnessApplicationService.java"));

        assertThat(integration)
                .contains("invokeCrash(")
                .contains("postAsync(")
                .contains("device_challenge_replayed")
                .contains("persistence.permission_conflict")
                .contains("pauseContainerCmd(postgres.getContainerId())")
                .contains("unpauseContainerCmd(postgres.getContainerId())")
                .contains("updateSchemaDigest(dataSource, \"0\".repeat(64))")
                .contains("awaitClusterConnectionCount(dataSource, 0)")
                .contains("ProcessHandle::descendants")
                .contains("canConnect(port)");
        assertThat(application)
                .contains("CentralProductionReadinessVerifier")
                .contains("HikariDataSource")
                .contains("getHikariPoolMXBean")
                .contains("transactions.required");
    }

    @Test
    void closureDoesNotCreateBusinessSchemaOrAdvanceCgf2() throws IOException {
        String productionSources = allJavaSources(MAIN_JAVA);
        String harnessSources = allJavaSources(CLUSTER_TESTS);

        assertThat(harnessSources)
                .doesNotContain("CREATE TABLE")
                .doesNotContain("ModelInvocation")
                .doesNotContain("DeepSeek")
                .doesNotContain("Anthropic")
                .doesNotContain("OpenAI")
                .doesNotContain("ModelInvocationLease")
                .doesNotContain("leaseOwner")
                .doesNotContain("leaseExpiresAt")
                .doesNotContain("claimUntil");
        assertThat(productionSources)
                .doesNotContain("ClusterHarnessApplicationService")
                .doesNotContain("ROBOTHREE_CLUSTER_NODE_ID");
    }

    private static String allJavaSources(Path root) throws IOException {
        try (Stream<Path> sources = Files.walk(root)) {
            return sources.filter(path -> path.toString().endsWith(".java"))
                    .map(path -> {
                        try {
                            return Files.readString(path);
                        } catch (IOException exception) {
                            throw new IllegalStateException(exception);
                        }
                    })
                    .reduce("", String::concat);
        }
    }
}
