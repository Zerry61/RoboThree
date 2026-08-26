package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class CentralAlignment2b1ArchitectureTest {

    private static final Path MAIN_JAVA = Path.of("src/main/java");
    private static final Path PRODUCTION =
            MAIN_JAVA.resolve("com/robothree/central/bootstrap/production");

    @Test
    void productionCompositionUsesManifestAndStartupValidator() throws IOException {
        String manifest =
                Files.readString(PRODUCTION.resolve("ProductionDependencyManifest.java"));
        String configuration =
                Files.readString(PRODUCTION.resolve(
                        "CentralProductionBootstrapConfiguration.java"));

        assertThat(configuration)
                .contains("@Profile(\"production\")")
                .contains("SmartInitializingSingleton")
                .contains("ProductionDependencyValidator")
                .contains("CentralProductionReadinessVerifier")
                .doesNotContain("@ConditionalOnMissingBean")
                .doesNotContain("@Primary")
                .doesNotContain("BeanPostProcessor");
        assertThat(manifest)
                .contains("DataSource.class")
                .contains("MyBatisAuthenticationPersistence.class")
                .contains("MyBatisConfigurationPersistence.class")
                .contains("EnterpriseSecretStore.class")
                .contains("RoboThreeAccessTokenCodec.class")
                .contains("EnterpriseUserIdentityVerifier.class")
                .contains("EnterpriseDeviceTrustProvider.class");
    }

    @Test
    void fixtureAndFakeTypesCannotBecomeProductionFallbacks() throws IOException {
        String fixture = Files.readString(MAIN_JAVA.resolve(
                "com/robothree/central/compatibility/FoundationFixtureController.java"));
        assertThat(fixture)
                .contains("@Profile({\"default\", \"development\"})");

        List<String> violations = new ArrayList<>();
        try (Stream<Path> sources = Files.walk(MAIN_JAVA)) {
            for (Path source :
                    sources.filter(path -> path.toString().endsWith(".java")).toList()) {
                String relative =
                        MAIN_JAVA.relativize(source).toString().replace('\\', '/');
                String content = Files.readString(source);
                if ((relative.contains("/foundation/")
                                || relative.contains("/persistence/memory/"))
                        && (content.contains("@Component")
                                || content.contains("@Service")
                                || content.contains("@Bean")
                                || content.contains("@Primary")
                                || content.contains("@ConditionalOnMissingBean"))) {
                    violations.add(relative);
                }
            }
        }
        assertThat(violations).isEmpty();
    }

    @Test
    void historicalAlignment2b1GuardStillRejectsClusterAndModelRuntimeScope()
            throws IOException {
        String productionSources;
        try (Stream<Path> sources = Files.walk(PRODUCTION)) {
            productionSources = sources
                    .filter(path -> path.toString().endsWith(".java"))
                    .map(path -> {
                        try {
                            return Files.readString(path);
                        } catch (IOException exception) {
                            throw new IllegalStateException(exception);
                        }
                    })
                    .reduce("", String::concat);
        }

        assertThat(productionSources)
                .doesNotContain("ModelInvocationRuntime")
                .doesNotContain("ModelInvocationCoordinator")
                .doesNotContain("ModelProviderAdapter")
                .doesNotContain("DeepSeek")
                .doesNotContain("Anthropic")
                .doesNotContain("OpenAI")
                .doesNotContain("cluster-harness")
                .doesNotContain("ProcessBuilder");
    }
}
