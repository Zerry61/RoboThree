package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class CentralAlignment2b2ArchitectureTest {

    private static final Path MAIN_JAVA = Path.of("src/main/java");
    private static final Path CLUSTER_TESTS = Path.of(
            "src/test/java/com/robothree/central/cluster");

    @Test
    void dualNodeHarnessRemainsTestOnly() throws IOException {
        String productionSources = allJavaSources(MAIN_JAVA);
        String harnessSources = allJavaSources(CLUSTER_TESTS);

        assertThat(productionSources)
                .doesNotContain("cluster-harness")
                .doesNotContain("/cluster-harness/")
                .doesNotContain("ClusterHarnessNodeMain")
                .doesNotContain("ROBOTHREE_CLUSTER_TOKEN_KEY")
                .doesNotContain("ProcessBuilder");
        assertThat(harnessSources)
                .contains("@Profile(\"cluster-harness\")")
                .contains("/cluster-harness/node")
                .contains("/cluster-harness/permissions")
                .contains("ProcessBuilder")
                .contains("surefire.test.class.path");
    }

    @Test
    void childNodesUseIndependentPoolsAndRuntimeInjectedSharedFacts()
            throws IOException {
        String configuration =
                Files.readString(CLUSTER_TESTS.resolve("ClusterHarnessConfiguration.java"));
        String integration = Files.readString(
                CLUSTER_TESTS.resolve(
                        "Alignment2b2DualNodeFoundationIntegrationTest.java"));

        assertThat(configuration)
                .contains("new HikariDataSource")
                .contains("setPoolName(\"robothree-cluster-\" + nodeId)")
                .contains("setMaximumPoolSize(4)")
                .contains("ROBOTHREE_CLUSTER_JDBC_URL")
                .contains("ROBOTHREE_CLUSTER_TOKEN_KEY")
                .doesNotContain("FakeJwsTokenCodec");
        assertThat(integration)
                .contains("ClusterNode.start(\"node-a\"")
                .contains("ClusterNode.start(\"node-b\"")
                .contains("assertThat(nodeA.processId()).isNotEqualTo(nodeB.processId())")
                .contains("assertThat(nodeA.port()).isNotEqualTo(nodeB.port())")
                .contains("Base64.getEncoder().encodeToString(tokenKey)")
                .contains("new SecureRandom().nextBytes(tokenKey)")
                .contains("nodeA.close()")
                .contains("nodeA = ClusterNode.start(\"node-a\"");
    }

    @Test
    void matrixCrossesHttpAndPostgreSqlWithoutAdvancingGatedScope()
            throws IOException {
        String harnessSources = allJavaSources(CLUSTER_TESTS);

        assertThat(harnessSources)
                .contains("/v1alpha1/device-challenges")
                .contains("/v1alpha1/token")
                .contains("/v1alpha1/configuration")
                .contains("If-None-Match")
                .contains("device_challenge_replayed")
                .contains("persistence.permission_conflict")
                .contains("persistence.permission_stale")
                .contains("MyBatisAuthenticationPersistence")
                .contains("MyBatisConfigurationPersistence")
                .contains("SpringCentralTransactionRunner")
                .doesNotContain("DeepSeek")
                .doesNotContain("ModelInvocation")
                .doesNotContain("failure injection")
                .doesNotContain("pool exhaustion");
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
