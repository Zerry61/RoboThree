package com.robothree.central.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import com.robothree.central.authentication.adapter.security.Es256DeviceProofVerifier;
import com.robothree.central.authentication.application.AccessTokenSecurityPolicy;
import com.robothree.central.authentication.application.AuthenticationCrypto;
import com.robothree.central.authentication.application.AuthenticationSecurityPolicy;
import com.robothree.central.authentication.application.DefaultEnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import com.robothree.central.authentication.application.FrozenCompatibilityEvaluator;
import com.robothree.central.authentication.application.IssueDeviceChallengeService;
import com.robothree.central.authentication.application.RoboThreeAccessTokenService;
import com.robothree.central.authentication.application.RoboThreeAccessTokenValidator;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.EnterpriseCompatibility;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.configuration.application.ConfigurationIntegrityVerifier;
import com.robothree.central.configuration.application.ConfigurationReadService;
import com.robothree.central.configuration.application.TrustedConfigurationSeeder;
import com.robothree.central.configuration.domain.ExactPackageReadReference;
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import com.robothree.central.support.CanonicalConfigurationFixtures;
import com.robothree.central.support.DeterministicAuthenticationEntropy;
import com.robothree.central.support.FakeClock;
import com.robothree.central.support.FakeDeviceSigner;
import com.robothree.central.support.FakeEnterpriseSecretStore;
import com.robothree.central.support.FakeJwsTokenCodec;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Explicit CGF-1.2C harness. Its name intentionally does not match the default
 * Surefire patterns; the dedicated workspace gate builds Core first, then runs
 * this Java-to-Node test.
 */
final class Cgf12cJavaNodeE2e {

    private static final Instant NOW = Instant.parse("2026-07-26T00:00:00Z");
    private static final UUID IDENTITY_ID =
            UUID.fromString("40000000-0000-4000-8000-000000000004");
    private static final String CLIENT_INSTANCE_ID =
            "50000000-0000-4000-8000-000000000005";

    @Test
    void synchronizesJavaCentralThroughNodeCoreIntoReopenedSqlite(
            @TempDir Path temporaryDirectory) throws Exception {
        Harness harness = createHarness();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(Executors.newFixedThreadPool(2));
        server.createContext("/v1alpha1/configuration", exchange ->
                handleConfiguration(exchange, harness.configuration()));
        server.start();
        try {
            String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
            ProcessBuilder builder = new ProcessBuilder(
                    Path.of(System.getProperty("java.home"), "bin", "java")
                            .resolveSibling("node")
                            .toString(),
                    "services/core/tests/e2e/cgf12c-java-node-runner.mjs");
            // java.home/bin has no Node binary. Resolve the same Node executable
            // used by the workspace gate without involving a shell.
            builder.command().set(0, requiredEnvironment("ROBOTHREE_CGF12C_NODE"));
            builder.directory(workspaceRoot().toFile());
            builder.redirectErrorStream(true);
            builder.environment().put("ROBOTHREE_CGF12C_BASE_URL", baseUrl);
            builder.environment().put(
                    "ROBOTHREE_CGF12C_ACCESS_TOKEN",
                    harness.accessToken());
            builder.environment().put(
                    "ROBOTHREE_CGF12C_DATABASE_PATH",
                    temporaryDirectory.resolve("enterprise-configuration.sqlite").toString());

            Process process = builder.start();
            String output = new String(
                    process.getInputStream().readAllBytes(),
                    StandardCharsets.UTF_8);
            int exitCode = process.waitFor();

            assertThat(exitCode).as(output).isZero();
            assertThat(output).contains("\"status\":\"ready\"");
            assertThat(output).contains("\"first\":\"activated\"");
            assertThat(output).contains("\"second\":\"not_modified\"");
            assertThat(output).doesNotContain(harness.accessToken());
        } finally {
            server.stop(0);
        }
    }

    private static Harness createHarness() {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        FakeClock clock = new FakeClock(NOW, ZoneOffset.UTC);
        DeterministicAuthenticationEntropy entropy = new DeterministicAuthenticationEntropy();
        FakeDeviceSigner signer = new FakeDeviceSigner();
        VerifiedEnterpriseIdentity identity = persistence.insert(new VerifiedEnterpriseIdentity(
                IDENTITY_ID,
                "enterprise.alpha",
                "user.alpha",
                "fake-oa",
                "a".repeat(64),
                "b".repeat(64),
                NOW,
                NOW.plusSeconds(300),
                null));
        String publicKey = signer.getPublicKey();
        persistence.insert(new EnterpriseDevice(
                "device.alpha",
                identity.enterpriseId(),
                signer.getDeviceKeyId(),
                "spki_der_base64",
                publicKey,
                AuthenticationCrypto.sha256(Base64.getDecoder().decode(publicKey)),
                "ES256",
                "manual_device_enrollment",
                "managed",
                "compliant",
                1,
                NOW,
                null,
                null));
        persistence.save(new EnterpriseUserPermission(
                identity.enterpriseId(),
                identity.userId(),
                "configuration.read",
                true,
                1,
                NOW));
        var compatibility = new FrozenCompatibilityEvaluator(
                new EnterpriseCompatibility(
                        "v1alpha1",
                        "0.0.0-cgf.1.2c",
                        List.of("v1alpha1"),
                        "0.0.0-dcf.1.0",
                        "0.0.0-dcf.1.0",
                        List.of(
                                "configuration_snapshot",
                                "fixed_permissions",
                                "enterprise_identity",
                                "managed_device_trust"),
                        "available",
                        List.of("v1alpha1"),
                        1),
                Set.of(CLIENT_INSTANCE_ID));
        var challengeService = new IssueDeviceChallengeService(
                persistence,
                persistence,
                persistence,
                persistence,
                new DefaultEnterpriseDeviceTrustProvider(),
                entropy,
                clock,
                AuthenticationSecurityPolicy.alphaDefaults());
        DeviceChallenge challenge = challengeService.issue(
                new IssueDeviceChallengeService.IssueDeviceChallengeCommand(
                        IssueDeviceChallengeService.TOKEN_ISSUANCE,
                        IDENTITY_ID,
                        CLIENT_INSTANCE_ID,
                        signer.getDeviceKeyId(),
                        null,
                        null));
        var tokenCodec = new FakeJwsTokenCodec();
        var secretStore = new FakeEnterpriseSecretStore();
        var tokenService = new RoboThreeAccessTokenService(
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                new DefaultEnterpriseDeviceTrustProvider(),
                new Es256DeviceProofVerifier(),
                compatibility,
                tokenCodec,
                secretStore,
                persistence,
                entropy,
                clock,
                AccessTokenSecurityPolicy.alphaDefaults());
        String signature = Base64.getUrlEncoder().withoutPadding().encodeToString(
                signer.sign(AuthenticationCrypto.signingBytes(challenge)));
        String accessToken = tokenService.issue(
                new RoboThreeAccessTokenService.IssueAccessTokenCommand(
                        IDENTITY_ID,
                        CLIENT_INSTANCE_ID,
                        new DeviceProof(
                                challenge.challengeId(),
                                signer.getDeviceKeyId(),
                                "ES256",
                                signature,
                                NOW)))
                .accessToken();
        var integrity = new ConfigurationIntegrityVerifier(persistence);
        var seed = CanonicalConfigurationFixtures.validSeed(NOW);
        new TrustedConfigurationSeeder(
                persistence,
                persistence,
                persistence,
                integrity)
                .seed(seed.packages(), seed.snapshot());
        var validator = new RoboThreeAccessTokenValidator(
                tokenCodec,
                secretStore,
                persistence,
                clock,
                AccessTokenSecurityPolicy.alphaDefaults());
        return new Harness(
                accessToken,
                new ConfigurationReadService(
                        new com.robothree.central.authentication.application
                                .LegacyBearerAuthorizerAdapter(validator),
                        persistence,
                        integrity,
                        clock));
    }

    private static void handleConfiguration(
            HttpExchange exchange,
            ConfigurationReadService service) throws IOException {
        try {
            String authorization = exchange.getRequestHeaders().getFirst("Authorization");
            if (authorization == null || !authorization.startsWith("Bearer ")) {
                throw EnterpriseAuthenticationException.authentication(
                        "access_token_invalid",
                        "A valid enterprise access token is required.");
            }
            String path = exchange.getRequestURI().getPath();
            String ifNoneMatch = exchange.getRequestHeaders().getFirst("If-None-Match");
            if ("/v1alpha1/configuration".equals(path)) {
                var result = service.read(
                        authorization.substring("Bearer ".length()),
                        ifNoneMatch);
                write(exchange, result.notModified(), result.etag(), result.documentJson());
                return;
            }
            String[] segments = path.split("/");
            if (segments.length != 11) {
                throw EnterpriseAuthenticationException.validation(
                        "contract_validation_failed",
                        "The exact package route is invalid.");
            }
            Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
            var reference = new ExactPackageReadReference(
                    decode(segments[3]),
                    decode(segments[5]),
                    required(query, "snapshotDigest"),
                    decode(segments[8]),
                    decode(segments[7]),
                    decode(segments[10]),
                    required(query, "packageDigest"));
            var result = service.readPackage(
                    authorization.substring("Bearer ".length()),
                    reference,
                    ifNoneMatch);
            write(exchange, result.notModified(), result.etag(), result.documentJson());
        } catch (EnterpriseAuthenticationException error) {
            byte[] payload = ("{\"code\":\"" + error.code() + "\"}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(
                    "authentication".equals(error.category()) ? 401 : 403,
                    payload.length);
            exchange.getResponseBody().write(payload);
            exchange.close();
        } catch (RuntimeException error) {
            byte[] payload = "{\"code\":\"contract_validation_failed\"}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(400, payload.length);
            exchange.getResponseBody().write(payload);
            exchange.close();
        }
    }

    private static void write(
            HttpExchange exchange,
            boolean notModified,
            String etag,
            String documentJson) throws IOException {
        exchange.getResponseHeaders().set("ETag", etag);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        if (notModified) {
            exchange.sendResponseHeaders(304, -1);
            exchange.close();
            return;
        }
        byte[] payload = documentJson.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, payload.length);
        exchange.getResponseBody().write(payload);
        exchange.close();
    }

    private static Map<String, String> parseQuery(String rawQuery) {
        Map<String, String> values = new HashMap<>();
        if (rawQuery == null || rawQuery.isEmpty()) {
            return values;
        }
        for (String entry : rawQuery.split("&")) {
            String[] pair = entry.split("=", 2);
            values.put(decode(pair[0]), pair.length == 2 ? decode(pair[1]) : "");
        }
        return values;
    }

    private static String required(Map<String, String> values, String key) {
        String value = values.get(key);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("missing exact package query value");
        }
        return value;
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static String requiredEnvironment(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Missing E2E environment " + name);
        }
        return value;
    }

    private static Path workspaceRoot() {
        return Path.of(requiredEnvironment("ROBOTHREE_CGF12C_WORKSPACE_ROOT"))
                .toAbsolutePath()
                .normalize();
    }

    private record Harness(
            String accessToken,
            ConfigurationReadService configuration) {}
}
