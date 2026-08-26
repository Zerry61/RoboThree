package com.robothree.central.authentication.port;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class Eipc1131BoundaryTest {

    private final Path productionRoot = Path.of("src/main/java");

    @Test
    void productionSourceContainsPortsButNoEnterpriseIdentityResolverOrSessionCodecImplementation()
            throws IOException {
        String source = productionSource();
        assertThat(source).contains(
                "interface VerifiedIdentityHandleResolver",
                "interface EnterpriseSessionTokenCodec",
                "interface EnterpriseBearerAuthorizer");
        assertThat(source).doesNotContain(
                "implements VerifiedIdentityHandleResolver",
                "implements EnterpriseSessionTokenCodec");
        assertThat(source).contains(
                "implements EnterpriseBearerAuthorizer");
    }

    @Test
    void batchDoesNotIntroduceTransactionHttpOrProductionActivation() throws IOException {
        List<String> newFiles = List.of(
                "authentication/domain/OpaqueVerifiedIdentityHandle.java",
                "authentication/domain/EnterpriseSessionTokenClaims.java",
                "authentication/domain/EnterpriseBearerPrincipal.java",
                "authentication/domain/EnterpriseBearerAuthorizationResult.java",
                "authentication/domain/EnterpriseSessionLeaseRequestDigestMaterial.java",
                "authentication/domain/EnterpriseSessionDecisionDigests.java",
                "authentication/port/VerifiedIdentityHandleResolver.java",
                "authentication/port/EnterpriseSessionTokenCodec.java",
                "authentication/port/EnterpriseBearerAuthorizer.java");
        String source = newFiles.stream()
                .map(path -> read(productionRoot.resolve("com/robothree/central").resolve(path)))
                .reduce("", (left, right) -> left + "\n" + right);
        assertThat(source).doesNotContain(
                "CentralTransactionRunner",
                "@RestController",
                "@RequestMapping",
                "/enterprise-session/",
                "productionSessionEnabled=true",
                "IDENTITY_COMPOSITION_READY");
    }

    @Test
    void sensitiveNamesAreAbsentFromDurableRequestDigestMaterial() {
        String source = read(productionRoot.resolve(
                "com/robothree/central/authentication/domain/"
                        + "EnterpriseSessionLeaseRequestDigestMaterial.java"));
        assertThat(source).doesNotContain(
                "verifiedIdentityHandle",
                "deviceProof",
                "signature",
                "accessToken",
                "tokenDigest",
                "credentialRef");
    }

    private String productionSource() throws IOException {
        try (var paths = Files.walk(productionRoot)) {
            return paths.filter(path -> path.toString().endsWith(".java"))
                    .sorted()
                    .map(this::read)
                    .reduce("", (left, right) -> left + "\n" + right);
        }
    }

    private String read(Path path) {
        try {
            return Files.readString(path);
        } catch (IOException exception) {
            throw new IllegalStateException("could not read production source", exception);
        }
    }
}
