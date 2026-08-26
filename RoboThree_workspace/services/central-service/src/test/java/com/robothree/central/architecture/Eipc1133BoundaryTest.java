package com.robothree.central.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class Eipc1133BoundaryTest {

    private static final Path MAIN = Path.of("src/main/java/com/robothree/central");

    @Test
    void protectedConsumersUseOnlyTheCommonAuthorizer() {
        String configuration = read(MAIN.resolve(
                "configuration/application/ConfigurationReadService.java"));
        String model = read(MAIN.resolve(
                "modelgateway/application/RoboThreeModelInvocationAccessAuthorizer.java"));
        assertThat(configuration).contains("EnterpriseBearerAuthorizer");
        assertThat(model).contains("EnterpriseBearerAuthorizer");
        assertThat(configuration + model).doesNotContain("RoboThreeAccessTokenValidator");
    }

    @Test
    void legacyValidatorHasOnlyTheValidatorAndItsAdapterAsProductionHolders()
            throws IOException {
        try (var paths = Files.walk(MAIN)) {
            List<String> holders = paths
                    .filter(path -> path.toString().endsWith(".java"))
                    .filter(path -> read(path).contains("RoboThreeAccessTokenValidator"))
                    .map(path -> path.getFileName().toString())
                    .sorted()
                    .toList();
            assertThat(holders).containsExactly(
                    "EnterpriseBearerAuthorizationConfiguration.java",
                    "LegacyBearerAuthorizerAdapter.java",
                    "RoboThreeAccessTokenValidator.java");
        }
    }

    @Test
    void bearerFilterRemainsExtractOnly() {
        String source = read(MAIN.resolve(
                "shared/adapter/http/EnterpriseBearerTokenFilter.java"));
        assertThat(source).contains("EnterpriseBearerTokenExtractor.extract");
        assertThat(source).doesNotContain(
                "EnterpriseBearerAuthorizer",
                "EnterpriseSessionTokenCodec",
                "EnterpriseSessionPersistence",
                "RoboThreeAccessTokenValidator",
                "decodeAndVerify",
                "JWT");
    }

    @Test
    void conditionalHttpIsDefaultDisabledAndDoesNotUseTestFallbacks() {
        String yaml = read(Path.of("src/main/resources/application.yaml"));
        String controller = read(MAIN.resolve(
                "authentication/adapter/http/EnterpriseSessionController.java"));
        String configuration = read(MAIN.resolve(
                "authentication/configuration/EnterpriseSessionFeatureConfiguration.java"));
        assertThat(yaml).contains("enterprise-session:", "enabled: false");
        assertThat(controller).contains(
                "@ConditionalOnProperty",
                "robothree.enterprise-session.enabled");
        assertThat(configuration).doesNotContain(
                "ConditionalOnMissingBean",
                "Fake::new",
                "fixedActiveUserId",
                "process.getuid");
    }

    @Test
    void productionStillHasNoSessionIdentityOrKeyAdapterImplementation()
            throws IOException {
        String source;
        try (var paths = Files.walk(MAIN)) {
            source = paths.filter(path -> path.toString().endsWith(".java"))
                    .sorted()
                    .map(Eipc1133BoundaryTest::read)
                    .reduce("", (left, right) -> left + "\n" + right);
        }
        assertThat(source).doesNotContain(
                "implements VerifiedIdentityHandleResolver",
                "implements EnterpriseSessionTokenCodec",
                "implements EnterpriseSessionSigningKeyHandleProvider",
                "implements EnterpriseSessionVerificationKeyHandleProvider");
    }

    private static String read(Path path) {
        try {
            return Files.readString(path);
        } catch (IOException exception) {
            throw new IllegalStateException("could not read source", exception);
        }
    }
}
