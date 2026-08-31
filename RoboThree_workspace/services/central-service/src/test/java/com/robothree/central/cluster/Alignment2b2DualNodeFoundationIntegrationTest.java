package com.robothree.central.cluster;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.authentication.application.AuthenticationCrypto;
import com.robothree.central.authentication.application.IssueDeviceChallengeService;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.persistence.schema.Alignment2aSchemaTestAccess;
import com.robothree.central.support.FakeDeviceSigner;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class Alignment2b2DualNodeFoundationIntegrationTest {

    private static final ObjectMapper JSON =
            new ObjectMapper().findAndRegisterModules();
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    private static final String CLIENT_INSTANCE_ID =
            "7a200000-0000-4000-8000-000000000002";

    @Container
    private final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void provesDualJvmFoundationCorrectnessAcrossSharedPostgreSql() throws Exception {
        PGSimpleDataSource dataSource = new PGSimpleDataSource();
        dataSource.setURL(postgres.getJdbcUrl());
        dataSource.setUser(postgres.getUsername());
        dataSource.setPassword(postgres.getPassword());
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);

        FakeDeviceSigner signer = new FakeDeviceSigner();
        Instant seedInstant = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        byte[] tokenKey = new byte[32];
        new SecureRandom().nextBytes(tokenKey);
        NodeEnvironment environment = new NodeEnvironment(
                postgres.getJdbcUrl(),
                postgres.getUsername(),
                postgres.getPassword(),
                Base64.getEncoder().encodeToString(tokenKey),
                seedInstant,
                signer.getDeviceKeyId(),
                signer.getPublicKey());

        ClusterNode nodeA = ClusterNode.start("node-a", environment);
        ClusterNode nodeB = ClusterNode.start("node-b", environment);
        try {
            assertThat(nodeA.processId()).isNotEqualTo(nodeB.processId());
            assertThat(nodeA.port()).isNotEqualTo(nodeB.port());
            assertNodeIdentity(nodeA, "node-a");
            assertNodeIdentity(nodeB, "node-b");

            // A issues the durable Challenge; B verifies and consumes it.
            ChallengeView crossNodeChallenge = issueChallenge(nodeA, signer);
            String crossNodeToken = issueToken(nodeB, crossNodeChallenge, signer)
                    .requiredText("accessToken");
            assertConfigurationAndPackage(nodeA, nodeB, crossNodeToken);

            // A and B race the same Challenge. PostgreSQL row locking permits one success.
            ChallengeView racingChallenge = issueChallenge(nodeA, signer);
            ObjectNode racingRequest = tokenRequest(racingChallenge, signer);
            ClusterNode racingNodeA = nodeA;
            CompletableFuture<HttpResult> onA = CompletableFuture.supplyAsync(
                    () -> post(racingNodeA, "/v1alpha1/token", racingRequest));
            CompletableFuture<HttpResult> onB = CompletableFuture.supplyAsync(
                    () -> post(nodeB, "/v1alpha1/token", racingRequest));
            List<HttpResult> racingResults = List.of(onA.join(), onB.join());
            assertThat(racingResults.stream().filter(result -> result.status() == 200))
                    .hasSize(1);
            HttpResult rejected = racingResults.stream()
                    .filter(result -> result.status() != 200)
                    .findFirst()
                    .orElseThrow();
            assertThat(rejected.status()).isEqualTo(409);
            assertThat(rejected.json().path("code").asText())
                    .isEqualTo("device_challenge_replayed");

            // Token issuance on A must be verifiable by B without shared Java memory.
            String tokenIssuedByA = issueToken(
                            nodeA,
                            issueChallenge(nodeA, signer),
                            signer)
                    .requiredText("accessToken");
            HttpResult configurationFromB = get(
                    nodeB,
                    "/v1alpha1/configuration",
                    Map.of("Authorization", "Bearer " + tokenIssuedByA));
            assertThat(configurationFromB.status()).isEqualTo(200);
            assertThat(configurationFromB.body()).doesNotContain(tokenIssuedByA);

            assertPermissionRevisionMatrix(nodeA, nodeB, seedInstant);
            assertRandomRoutingCompletes(nodeA, nodeB, signer);
            assertRequestContextsStayIsolated(nodeA, nodeB, tokenIssuedByA);

            // A leaves. B continues to serve both Configuration and bodyless ETag reads.
            long stoppedProcessId = nodeA.processId();
            nodeA.close();
            HttpResult survivingRead = get(
                    nodeB,
                    "/v1alpha1/configuration",
                    Map.of("Authorization", "Bearer " + tokenIssuedByA));
            assertThat(survivingRead.status()).isEqualTo(200);
            String survivingEtag = survivingRead.requiredHeader("etag");
            HttpResult notModified = get(
                    nodeB,
                    "/v1alpha1/configuration",
                    Map.of(
                            "Authorization", "Bearer " + tokenIssuedByA,
                            "If-None-Match", survivingEtag));
            assertThat(notModified.status()).isEqualTo(304);
            assertThat(notModified.body()).isEmpty();

            // A is a new JVM and rebuilds only from PostgreSQL and injected test Ports.
            nodeA = ClusterNode.start("node-a", environment);
            assertThat(nodeA.processId()).isNotEqualTo(stoppedProcessId);
            assertNodeIdentity(nodeA, "node-a");
            HttpResult recoveredRead = get(
                    nodeA,
                    "/v1alpha1/configuration",
                    Map.of("Authorization", "Bearer " + tokenIssuedByA));
            assertThat(recoveredRead.status()).isEqualTo(200);
            assertThat(recoveredRead.body()).isEqualTo(survivingRead.body());
        } finally {
            nodeA.close();
            nodeB.close();
        }
    }

    @Test
    void closesFailureRecoveryAndResourceMatrixAcrossDualJvms() throws Exception {
        PGSimpleDataSource dataSource = new PGSimpleDataSource();
        dataSource.setURL(postgres.getJdbcUrl());
        dataSource.setUser(postgres.getUsername());
        dataSource.setPassword(postgres.getPassword());
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);

        FakeDeviceSigner signer = new FakeDeviceSigner();
        Instant seedInstant = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        byte[] tokenKey = new byte[32];
        new SecureRandom().nextBytes(tokenKey);
        NodeEnvironment environment = new NodeEnvironment(
                postgres.getJdbcUrl(),
                postgres.getUsername(),
                postgres.getPassword(),
                Base64.getEncoder().encodeToString(tokenKey),
                seedInstant,
                signer.getDeviceKeyId(),
                signer.getPublicKey());

        ClusterNode nodeA = ClusterNode.start("failure-node-a", environment);
        ClusterNode nodeB = ClusterNode.start("failure-node-b", environment);
        try {
            // A halts inside the Spring transaction. PostgreSQL must roll back.
            ObjectNode beforeCommit = permissionRequest(
                    true,
                    1,
                    seedInstant.plusSeconds(10));
            beforeCommit.put("permission", "agent.use");
            invokeCrash(
                    nodeA,
                    "/cluster-harness/failures/permission-before-commit",
                    beforeCommit,
                    73);
            assertPermissionAbsent(nodeB, "agent.use");
            nodeA.close();
            nodeA = ClusterNode.start("failure-node-a", environment);

            // The write commits, then the JVM halts before the HTTP response.
            ObjectNode afterCommit = permissionRequest(
                    true,
                    1,
                    seedInstant.plusSeconds(20));
            afterCommit.put("permission", "skill.use");
            invokeCrash(
                    nodeA,
                    "/cluster-harness/failures/permission-after-commit",
                    afterCommit,
                    74);
            assertPermission(nodeB, "skill.use", true, 1);
            assertThat(post(
                                    nodeB,
                                    "/cluster-harness/permissions",
                                    afterCommit)
                            .status())
                    .isEqualTo(200);
            ObjectNode conflictingReplay = afterCommit.deepCopy();
            conflictingReplay.put("enabled", false);
            HttpResult conflict = post(
                    nodeB,
                    "/cluster-harness/permissions",
                    conflictingReplay);
            assertThat(conflict.status()).isEqualTo(409);
            assertThat(conflict.json().path("code").asText())
                    .isEqualTo("persistence.permission_conflict");
            nodeA.close();
            nodeA = ClusterNode.start("failure-node-a", environment);

            // Kill A while a Challenge consumption is in flight. B must observe
            // either a fully pending or a fully consumed Challenge, never partial state.
            ChallengeView interruptedChallenge = issueChallenge(nodeA, signer);
            ObjectNode interruptedTokenRequest =
                    tokenRequest(interruptedChallenge, signer);
            CompletableFuture<HttpResponse<String>> inFlight = postAsync(
                    nodeA,
                    "/v1alpha1/token",
                    interruptedTokenRequest);
            Thread.sleep(5);
            nodeA.killForcibly();
            nodeA.awaitExit();
            inFlight.handle((ignored, failure) -> null).get(3, TimeUnit.SECONDS);
            HttpResult recoveredToken = post(
                    nodeB,
                    "/v1alpha1/token",
                    interruptedTokenRequest);
            assertThat(recoveredToken.status()).isIn(200, 409);
            if (recoveredToken.status() == 409) {
                assertThat(recoveredToken.json().path("code").asText())
                        .isEqualTo("device_challenge_replayed");
            }
            nodeA.close();
            nodeA = ClusterNode.start("failure-node-a", environment);

            // Same identity/revision with different digests must remain a stable
            // cross-node conflict.
            ObjectNode digestA = permissionRequest(
                    true,
                    1,
                    seedInstant.plusSeconds(30));
            digestA.put("permission", "knowledge.use");
            ObjectNode digestB = digestA.deepCopy();
            digestB.put("enabled", false);
            ClusterNode concurrentNodeA = nodeA;
            CompletableFuture<HttpResult> writeA = CompletableFuture.supplyAsync(
                    () -> post(
                            concurrentNodeA,
                            "/cluster-harness/permissions",
                            digestA));
            CompletableFuture<HttpResult> writeB = CompletableFuture.supplyAsync(
                    () -> post(
                            nodeB,
                            "/cluster-harness/permissions",
                            digestB));
            List<HttpResult> digestResults = List.of(writeA.join(), writeB.join());
            assertThat(digestResults.stream()
                            .filter(result -> result.status() == 200))
                    .hasSize(1);
            HttpResult digestConflict = digestResults.stream()
                    .filter(result -> result.status() == 409)
                    .findFirst()
                    .orElseThrow();
            assertThat(digestConflict.json().path("code").asText())
                    .isEqualTo("persistence.permission_conflict");

            // A database outage lowers readiness on both nodes. Recovery does not
            // require a JVM restart.
            ClusterNode readinessNodeA = nodeA;
            var docker = DockerClientFactory.instance().client();
            docker.pauseContainerCmd(postgres.getContainerId()).exec();
            try {
                assertReadiness(
                        readinessNodeA,
                        "down",
                        "central.production_database_unavailable");
                assertReadiness(nodeB, "down", "central.production_database_unavailable");
            } finally {
                docker.unpauseContainerCmd(postgres.getContainerId()).exec();
            }
            awaitCondition(
                    () -> readinessIs(readinessNodeA, "ready"),
                    Duration.ofSeconds(15),
                    "node A did not recover readiness");
            awaitCondition(
                    () -> readinessIs(nodeB, "ready"),
                    Duration.ofSeconds(15),
                    "node B did not recover readiness");

            // Live ledger digest drift must fail closed on both nodes.
            String originalDigest = schemaDigest(dataSource);
            updateSchemaDigest(dataSource, "0".repeat(64));
            try {
                assertReadiness(
                        readinessNodeA,
                        "down",
                        "central.production_readiness_failed");
                assertReadiness(nodeB, "down", "central.production_readiness_failed");
            } finally {
                updateSchemaDigest(dataSource, originalDigest);
            }
            awaitCondition(
                    () -> readinessIs(readinessNodeA, "ready"),
                    Duration.ofSeconds(10),
                    "node A did not recover after ledger repair");
            awaitCondition(
                    () -> readinessIs(nodeB, "ready"),
                    Duration.ofSeconds(10),
                    "node B did not recover after ledger repair");

            assertResourceProjection(
                    readinessNodeA,
                    "robothree-cluster-failure-node-a");
            assertResourceProjection(nodeB, "robothree-cluster-failure-node-b");
        } finally {
            nodeA.close();
            nodeB.close();
        }

        awaitClusterConnectionCount(dataSource, 0);

        // Repeated lifecycle cycles must release PID, port, connection and descendants.
        for (int cycle = 0; cycle < 4; cycle += 1) {
            ClusterNode node =
                    ClusterNode.start("resource-cycle-" + cycle, environment);
            long processId = node.processId();
            int port = node.port();
            assertResourceProjection(
                    node,
                    "robothree-cluster-resource-cycle-" + cycle);
            node.close();
            assertThat(ProcessHandle.of(processId)
                            .map(ProcessHandle::isAlive)
                            .orElse(false))
                    .isFalse();
            assertThat(ProcessHandle.of(processId)
                            .stream()
                            .flatMap(ProcessHandle::descendants)
                            .filter(ProcessHandle::isAlive))
                    .isEmpty();
            assertThat(canConnect(port)).isFalse();
            awaitClusterConnectionCount(dataSource, 0);
        }
    }

    private static void assertNodeIdentity(ClusterNode node, String expectedNodeId) {
        HttpResult response = get(node, "/cluster-harness/node", Map.of());
        assertThat(response.status()).isEqualTo(200);
        assertThat(response.json().path("nodeId").asText()).isEqualTo(expectedNodeId);
        assertThat(response.json().path("processId").asLong())
                .isEqualTo(node.processId());
    }

    private static ChallengeView issueChallenge(
            ClusterNode node,
            FakeDeviceSigner signer) {
        ObjectNode request = JSON.createObjectNode();
        request.put("type", "issue_device_challenge_request");
        request.put("contractVersion", "v1alpha1");
        request.put("purpose", IssueDeviceChallengeService.TOKEN_ISSUANCE);
        request.put(
                "verifiedIdentityId",
                ClusterHarnessFacts.VERIFIED_IDENTITY_ID.toString());
        request.put("clientInstanceId", CLIENT_INSTANCE_ID);
        request.put("deviceKeyId", signer.getDeviceKeyId());
        HttpResult response = post(node, "/v1alpha1/device-challenges", request);
        assertThat(response.status()).isEqualTo(200);
        JsonNode body = response.json();
        return new ChallengeView(
                UUID.fromString(body.path("challengeId").asText()),
                body.path("nonce").asText(),
                Instant.parse(body.path("issuedAt").asText()),
                Instant.parse(body.path("expiresAt").asText()),
                body.path("audience").asText(),
                body.path("clientInstanceId").asText(),
                StreamSupport.stream(
                                body.path("allowedAlgorithms").spliterator(),
                                false)
                        .map(JsonNode::asText)
                        .toList());
    }

    private static TokenView issueToken(
            ClusterNode node,
            ChallengeView challenge,
            FakeDeviceSigner signer) {
        HttpResult response = post(
                node,
                "/v1alpha1/token",
                tokenRequest(challenge, signer));
        assertThat(response.status())
                .withFailMessage(
                        "token issuance failed with status %s and typed response %s",
                        response.status(),
                        response.body())
                .isEqualTo(200);
        assertThat(response.body()).doesNotContain("private");
        return new TokenView(response.json());
    }

    private static ObjectNode tokenRequest(
            ChallengeView challenge,
            FakeDeviceSigner signer) {
        DeviceChallenge domainChallenge = challenge.toDomain(signer);
        String signature = Base64.getUrlEncoder().withoutPadding().encodeToString(
                signer.sign(AuthenticationCrypto.signingBytes(domainChallenge)));
        ObjectNode request = JSON.createObjectNode();
        request.put("type", "issue_access_token_request");
        request.put("contractVersion", "v1alpha1");
        request.put(
                "verifiedIdentityId",
                ClusterHarnessFacts.VERIFIED_IDENTITY_ID.toString());
        request.put("clientInstanceId", CLIENT_INSTANCE_ID);
        ObjectNode proof = request.putObject("deviceProof");
        proof.put("challengeId", challenge.challengeId().toString());
        proof.put("deviceKeyId", signer.getDeviceKeyId());
        proof.put("algorithm", "ES256");
        proof.put("signature", signature);
        proof.put("signedAt", Instant.now().toString());
        return request;
    }

    private static void assertConfigurationAndPackage(
            ClusterNode nodeA,
            ClusterNode nodeB,
            String accessToken) {
        HttpResult configuration = get(
                nodeB,
                "/v1alpha1/configuration",
                Map.of("Authorization", "Bearer " + accessToken));
        assertThat(configuration.status())
                .withFailMessage("configuration request failed: %s", configuration.body())
                .isEqualTo(200);
        String etag = configuration.requiredHeader("etag");
        HttpResult notModified = get(
                nodeA,
                "/v1alpha1/configuration",
                Map.of(
                        "Authorization", "Bearer " + accessToken,
                        "If-None-Match", etag));
        assertThat(notModified.status()).isEqualTo(304);
        assertThat(notModified.body()).isEmpty();

        JsonNode document = configuration.json();
        JsonNode skill = document.path("skills").get(0);
        String route = "/v1alpha1/configuration/%s/revisions/%s"
                + "/packages/%s/%s/revisions/%s"
                + "?snapshotDigest=%s&packageDigest=%s";
        route = route.formatted(
                document.path("snapshotId").asText(),
                document.path("revision").asText(),
                skill.path("kind").asText(),
                skill.path("packageId").asText(),
                skill.path("revision").asText(),
                document.path("digest").asText(),
                skill.path("digest").asText());
        HttpResult packageRead = get(
                nodeA,
                route,
                Map.of("Authorization", "Bearer " + accessToken));
        assertThat(packageRead.status()).isEqualTo(200);
        String packageEtag = packageRead.requiredHeader("etag");
        HttpResult packageNotModified = get(
                nodeB,
                route,
                Map.of(
                        "Authorization", "Bearer " + accessToken,
                        "If-None-Match", packageEtag));
        assertThat(packageNotModified.status()).isEqualTo(304);
        assertThat(packageNotModified.body()).isEmpty();
    }

    private static void assertPermissionRevisionMatrix(
            ClusterNode nodeA,
            ClusterNode nodeB,
            Instant seedInstant) {
        ObjectNode revisionOne = permissionRequest(true, 1, seedInstant);
        assertThat(post(nodeA, "/cluster-harness/permissions", revisionOne).status())
                .isEqualTo(200);
        assertThat(post(nodeB, "/cluster-harness/permissions", revisionOne).status())
                .isEqualTo(200);

        ObjectNode conflicting = permissionRequest(false, 1, seedInstant);
        HttpResult conflict = post(
                nodeB,
                "/cluster-harness/permissions",
                conflicting);
        assertThat(conflict.status()).isEqualTo(409);
        assertThat(conflict.json().path("code").asText())
                .isEqualTo("persistence.permission_conflict");

        ObjectNode stale = permissionRequest(true, 0, seedInstant.minusSeconds(1));
        HttpResult staleResult = post(
                nodeA,
                "/cluster-harness/permissions",
                stale);
        assertThat(staleResult.status()).isEqualTo(409);
        assertThat(staleResult.json().path("code").asText())
                .isEqualTo("persistence.permission_stale");

        ObjectNode revisionTwo = permissionRequest(true, 2, seedInstant.plusSeconds(1));
        HttpResult updated = post(
                nodeB,
                "/cluster-harness/permissions",
                revisionTwo);
        assertThat(updated.status()).isEqualTo(200);
        assertThat(updated.json().path("revision").asLong()).isEqualTo(2);
    }

    private static ObjectNode permissionRequest(
            boolean enabled,
            long revision,
            Instant updatedAt) {
        ObjectNode request = JSON.createObjectNode();
        request.put("enterpriseId", ClusterHarnessFacts.ENTERPRISE_ID);
        request.put("userId", ClusterHarnessFacts.USER_ID);
        request.put("permission", ClusterHarnessFacts.MATRIX_PERMISSION);
        request.put("enabled", enabled);
        request.put("revision", revision);
        request.put("updatedAt", updatedAt.toString());
        return request;
    }

    private static void assertRandomRoutingCompletes(
            ClusterNode nodeA,
            ClusterNode nodeB,
            FakeDeviceSigner signer) {
        List<ClusterNode> nodes = List.of(nodeA, nodeB);
        for (int index = 0; index < 6; index += 1) {
            ClusterNode issuer = nodes.get(index % 2);
            ClusterNode consumer = nodes.get((index + 1) % 2);
            String token = issueToken(
                            consumer,
                            issueChallenge(issuer, signer),
                            signer)
                    .requiredText("accessToken");
            HttpResult read = get(
                    nodes.get((index + 2) % 2),
                    "/v1alpha1/configuration",
                    Map.of("Authorization", "Bearer " + token));
            assertThat(read.status()).isEqualTo(200);
        }
    }

    private static void assertRequestContextsStayIsolated(
            ClusterNode nodeA,
            ClusterNode nodeB,
            String accessToken) {
        String traceA = "11111111111111111111111111111111";
        String traceB = "22222222222222222222222222222222";
        CompletableFuture<HttpResult> requestA = CompletableFuture.supplyAsync(() -> get(
                nodeA,
                "/v1alpha1/configuration",
                Map.of(
                        "Authorization", "Bearer " + accessToken,
                        "traceparent", "00-" + traceA + "-1111111111111111-01")));
        CompletableFuture<HttpResult> requestB = CompletableFuture.supplyAsync(() -> get(
                nodeB,
                "/v1alpha1/configuration",
                Map.of(
                        "Authorization", "Bearer " + accessToken,
                        "traceparent", "00-" + traceB + "-2222222222222222-01")));
        HttpResult responseA = requestA.join();
        HttpResult responseB = requestB.join();
        assertThat(responseA.requiredHeader("x-robothree-trace-id"))
                .isEqualTo(traceA);
        assertThat(responseB.requiredHeader("x-robothree-trace-id"))
                .isEqualTo(traceB);

        String invalidA = "Bearer invalid-a-token-value-that-is-long-enough";
        String invalidB = "Bearer invalid-b-token-value-that-is-long-enough";
        HttpResult errorA = get(
                nodeA,
                "/v1alpha1/configuration",
                Map.of("Authorization", invalidA));
        HttpResult errorB = get(
                nodeB,
                "/v1alpha1/configuration",
                Map.of("Authorization", invalidB));
        assertThat(errorA.status()).isEqualTo(401);
        assertThat(errorB.status()).isEqualTo(401);
        assertThat(errorA.json().path("correlationId").asText())
                .isNotEqualTo(errorB.json().path("correlationId").asText());
        assertThat(errorA.body()).doesNotContain("invalid-a-token");
        assertThat(errorB.body()).doesNotContain("invalid-b-token");
    }

    private static void invokeCrash(
            ClusterNode node,
            String path,
            JsonNode request,
            int expectedExitCode) throws Exception {
        try {
            post(node, path, request);
        } catch (IllegalStateException expectedDisconnect) {
            assertThat(expectedDisconnect.getMessage())
                    .isEqualTo("cluster harness HTTP request failed");
        }
        node.awaitExit();
        assertThat(node.exitCode()).isEqualTo(expectedExitCode);
        assertThat(canConnect(node.port())).isFalse();
    }

    private static void assertPermissionAbsent(
            ClusterNode node,
            String permission) {
        HttpResult response = get(
                node,
                "/cluster-harness/permissions?permission=" + permission,
                Map.of());
        assertThat(response.status()).isEqualTo(200);
        assertThat(response.json().path("present").asBoolean()).isFalse();
        assertThat(response.json().path("value").isNull()).isTrue();
    }

    private static void assertPermission(
            ClusterNode node,
            String permission,
            boolean enabled,
            long revision) {
        HttpResult response = get(
                node,
                "/cluster-harness/permissions?permission=" + permission,
                Map.of());
        assertThat(response.status()).isEqualTo(200);
        JsonNode body = response.json();
        assertThat(body.path("present").asBoolean()).isTrue();
        assertThat(body.path("value").path("permission").asText())
                .isEqualTo(permission);
        assertThat(body.path("value").path("enabled").asBoolean())
                .isEqualTo(enabled);
        assertThat(body.path("value").path("revision").asLong())
                .isEqualTo(revision);
    }

    private static CompletableFuture<HttpResponse<String>> postAsync(
            ClusterNode node,
            String path,
            JsonNode body) {
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create(node.baseUrl() + path))
                .timeout(Duration.ofSeconds(8))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(serialize(body)))
                .build();
        return HTTP.sendAsync(
                request,
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private static void assertReadiness(
            ClusterNode node,
            String expectedStatus,
            String expectedErrorCode) {
        HttpResult response = get(node, "/cluster-harness/readiness", Map.of());
        assertThat(response.status()).isEqualTo(200);
        assertThat(response.json().path("status").asText())
                .isEqualTo(expectedStatus);
        assertThat(response.json().path("errorCode").asText())
                .isEqualTo(expectedErrorCode);
    }

    private static boolean readinessIs(
            ClusterNode node,
            String expectedStatus) {
        try {
            HttpResult response =
                    get(node, "/cluster-harness/readiness", Map.of());
            return response.status() == 200
                    && expectedStatus.equals(
                            response.json().path("status").asText());
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static void assertResourceProjection(
            ClusterNode node,
            String expectedPoolName) {
        HttpResult response = get(node, "/cluster-harness/resources", Map.of());
        assertThat(response.status()).isEqualTo(200);
        JsonNode resources = response.json();
        assertThat(resources.path("poolName").asText())
                .isEqualTo(expectedPoolName);
        assertThat(resources.path("activeConnections").asInt()).isZero();
        assertThat(resources.path("awaitingConnections").asInt()).isZero();
        assertThat(resources.path("totalConnections").asInt())
                .isBetween(0, 4);
        assertThat(resources.path("liveThreadCount").asInt()).isPositive();
        assertThat(resources.path("timerThreadCount").asLong())
                .isNotNegative();
    }

    private static String schemaDigest(PGSimpleDataSource dataSource)
            throws SQLException {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT script_digest "
                                + "FROM robothree_schema_version "
                                + "WHERE version = 12");
                ResultSet rows = statement.executeQuery()) {
            assertThat(rows.next()).isTrue();
            String digest = rows.getString(1);
            assertThat(rows.next()).isFalse();
            return digest;
        }
    }

    private static void updateSchemaDigest(
            PGSimpleDataSource dataSource,
            String digest) throws SQLException {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "UPDATE robothree_schema_version "
                                + "SET script_digest = ? "
                                + "WHERE version = 12")) {
            statement.setString(1, digest);
            assertThat(statement.executeUpdate()).isEqualTo(1);
        }
    }

    private static void awaitClusterConnectionCount(
            PGSimpleDataSource dataSource,
            int expectedCount) throws Exception {
        awaitCondition(
                () -> {
                    try {
                        return clusterConnectionCount(dataSource) == expectedCount;
                    } catch (SQLException exception) {
                        return false;
                    }
                },
                Duration.ofSeconds(10),
                "cluster connections did not return to baseline");
    }

    private static int clusterConnectionCount(PGSimpleDataSource dataSource)
            throws SQLException {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT count(*) "
                                + "FROM pg_stat_activity "
                                + "WHERE application_name "
                                + "LIKE 'robothree-cluster-%'");
                ResultSet rows = statement.executeQuery()) {
            assertThat(rows.next()).isTrue();
            return rows.getInt(1);
        }
    }

    private static void awaitCondition(
            BooleanSupplier condition,
            Duration timeout,
            String failureMessage) throws Exception {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(100);
        }
        assertThat(condition.getAsBoolean())
                .withFailMessage(failureMessage)
                .isTrue();
    }

    private static boolean canConnect(int port) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", port), 250);
            return true;
        } catch (IOException expected) {
            return false;
        }
    }

    private static String serialize(JsonNode body) {
        try {
            return JSON.writeValueAsString(body);
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "cluster harness request is not serializable",
                    exception);
        }
    }

    private static HttpResult post(
            ClusterNode node,
            String path,
            JsonNode body) {
        return send(node, "POST", path, serialize(body), Map.of());
    }

    private static HttpResult get(
            ClusterNode node,
            String path,
            Map<String, String> headers) {
        return send(node, "GET", path, null, headers);
    }

    private static HttpResult send(
            ClusterNode node,
            String method,
            String path,
            String body,
            Map<String, String> headers) {
        try {
            HttpRequest.Builder request = HttpRequest.newBuilder(
                            URI.create(node.baseUrl() + path))
                    .timeout(Duration.ofSeconds(8));
            headers.forEach(request::header);
            if ("POST".equals(method)) {
                request.header("Content-Type", "application/json");
                request.POST(HttpRequest.BodyPublishers.ofString(body));
            } else {
                request.GET();
            }
            HttpResponse<String> response = HTTP.send(
                    request.build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            return new HttpResult(
                    response.statusCode(),
                    response.headers().map(),
                    response.body());
        } catch (IOException exception) {
            throw new IllegalStateException("cluster harness HTTP request failed", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("cluster harness HTTP request interrupted", exception);
        }
    }

    private record ChallengeView(
            UUID challengeId,
            String nonce,
            Instant issuedAt,
            Instant expiresAt,
            String audience,
            String clientInstanceId,
            List<String> allowedAlgorithms) {

        DeviceChallenge toDomain(FakeDeviceSigner signer) {
            return new DeviceChallenge(
                    challengeId,
                    IssueDeviceChallengeService.TOKEN_ISSUANCE,
                    ClusterHarnessFacts.VERIFIED_IDENTITY_ID,
                    clientInstanceId,
                    signer.getDeviceKeyId(),
                    AuthenticationCrypto.sha256(
                            Base64.getDecoder().decode(signer.getPublicKey())),
                    nonce,
                    audience,
                    allowedAlgorithms,
                    "c".repeat(64),
                    issuedAt,
                    expiresAt,
                    null,
                    null,
                    null);
        }
    }

    private record TokenView(JsonNode body) {

        String requiredText(String name) {
            String value = body.path(name).asText();
            assertThat(value).isNotBlank();
            return value;
        }
    }

    private record HttpResult(
            int status,
            Map<String, List<String>> headers,
            String body) {

        JsonNode json() {
            try {
                return JSON.readTree(body);
            } catch (IOException exception) {
                throw new IllegalStateException(
                        "cluster harness response is not JSON",
                        exception);
            }
        }

        String requiredHeader(String name) {
            List<String> values = headers.get(name.toLowerCase());
            assertThat(values).isNotNull().hasSize(1);
            return values.getFirst();
        }
    }

    private record NodeEnvironment(
            String jdbcUrl,
            String username,
            String password,
            String tokenKey,
            Instant seedInstant,
            String deviceKeyId,
            String publicKey) {}

    private static final class ClusterNode implements AutoCloseable {

        private final String nodeId;
        private final int port;
        private final Process process;
        private final Thread outputDrainer;
        private final BoundedProcessOutput processOutput;

        private ClusterNode(
                String nodeId,
                int port,
                Process process,
                Thread outputDrainer,
                BoundedProcessOutput processOutput) {
            this.nodeId = nodeId;
            this.port = port;
            this.process = process;
            this.outputDrainer = outputDrainer;
            this.processOutput = processOutput;
        }

        static ClusterNode start(
                String nodeId,
                NodeEnvironment environment) throws Exception {
            int port = availablePort();
            String classPath = System.getProperty(
                    "surefire.test.class.path",
                    System.getProperty("java.class.path"));
            Path java = Path.of(
                    System.getProperty("java.home"),
                    "bin",
                    isWindows() ? "java.exe" : "java");
            List<String> command = new ArrayList<>();
            command.add(java.toString());
            command.add("-cp");
            command.add(classPath);
            command.add(ClusterHarnessNodeMain.class.getName());
            command.add("--server.address=127.0.0.1");
            command.add("--server.port=" + port);
            command.add("--logging.level.root=WARN");
            command.add("--management.tracing.sampling.probability=1.0");
            command.add(
                    "--mybatis-plus.mapper-locations=classpath*:mybatis/*Mapper.xml");

            ProcessBuilder builder = new ProcessBuilder(command);
            builder.redirectErrorStream(true);
            Map<String, String> child = builder.environment();
            child.put("ROBOTHREE_CLUSTER_NODE_ID", nodeId);
            child.put("ROBOTHREE_CLUSTER_JDBC_URL", environment.jdbcUrl());
            child.put("ROBOTHREE_CLUSTER_DB_USER", environment.username());
            child.put("ROBOTHREE_CLUSTER_DB_PASSWORD", environment.password());
            child.put("ROBOTHREE_CLUSTER_TOKEN_KEY", environment.tokenKey());
            child.put(
                    "ROBOTHREE_CLUSTER_SEED_INSTANT",
                    environment.seedInstant().toString());
            child.put(
                    "ROBOTHREE_CLUSTER_DEVICE_KEY_ID",
                    environment.deviceKeyId());
            child.put(
                    "ROBOTHREE_CLUSTER_DEVICE_PUBLIC_KEY",
                    environment.publicKey());
            child.put(
                    "ROBOTHREE_CLUSTER_CLIENT_INSTANCE_ID",
                    CLIENT_INSTANCE_ID);

            Process process = builder.start();
            BoundedProcessOutput processOutput = new BoundedProcessOutput(8_192);
            Thread drainer = Thread.ofPlatform()
                    .daemon(true)
                    .name("cluster-harness-output-" + nodeId)
                    .start(() -> {
                        try (var input = process.getInputStream()) {
                            byte[] buffer = new byte[1_024];
                            int read;
                            while ((read = input.read(buffer)) >= 0) {
                                processOutput.append(buffer, read);
                            }
                        } catch (IOException ignored) {
                            // Process shutdown closes the stream.
                        }
                    });
            ClusterNode node =
                    new ClusterNode(nodeId, port, process, drainer, processOutput);
            node.awaitReady();
            return node;
        }

        String baseUrl() {
            return "http://127.0.0.1:" + port;
        }

        int port() {
            return port;
        }

        long processId() {
            return process.pid();
        }

        void killForcibly() {
            if (process.isAlive()) {
                process.destroyForcibly();
            }
        }

        void awaitExit() throws Exception {
            if (!process.waitFor(10, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                if (!process.waitFor(10, TimeUnit.SECONDS)) {
                    throw new IllegalStateException(
                            "cluster node did not exit: " + nodeId);
                }
            }
        }

        int exitCode() {
            assertThat(process.isAlive()).isFalse();
            return process.exitValue();
        }

        private void awaitReady() throws Exception {
            long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
            while (System.nanoTime() < deadline) {
                if (!process.isAlive()) {
                    throw new IllegalStateException(
                            "cluster node exited before readiness: "
                                    + nodeId
                                    + System.lineSeparator()
                                    + processOutput.safeSummary());
                }
                try {
                    HttpResult result = get(this, "/cluster-harness/node", Map.of());
                    if (result.status() == 200
                            && nodeId.equals(result.json().path("nodeId").asText())) {
                        return;
                    }
                } catch (RuntimeException ignored) {
                    // Node is still starting.
                }
                Thread.sleep(100);
            }
            throw new IllegalStateException(
                    "cluster node did not become ready: "
                            + nodeId
                            + System.lineSeparator()
                            + processOutput.safeSummary());
        }

        @Override
        public void close() {
            if (process.isAlive()) {
                process.destroy();
                try {
                    if (!process.waitFor(10, TimeUnit.SECONDS)) {
                        process.destroyForcibly();
                        process.waitFor(10, TimeUnit.SECONDS);
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    process.destroyForcibly();
                }
            }
            try {
                outputDrainer.join(Duration.ofSeconds(2));
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        }

        private static int availablePort() throws IOException {
            try (ServerSocket socket = new ServerSocket(0)) {
                socket.setReuseAddress(false);
                return socket.getLocalPort();
            }
        }

        private static boolean isWindows() {
            return System.getProperty("os.name")
                    .toLowerCase()
                    .contains("win");
        }
    }

    private static final class BoundedProcessOutput {

        private final int capacity;
        private final StringBuilder text = new StringBuilder();

        private BoundedProcessOutput(int capacity) {
            this.capacity = capacity;
        }

        synchronized void append(byte[] bytes, int length) {
            text.append(new String(bytes, 0, length, StandardCharsets.UTF_8));
            if (text.length() > capacity) {
                text.delete(0, text.length() - capacity);
            }
        }

        synchronized String safeSummary() {
            String serviceDirectory = System.getProperty("user.dir", "");
            String summary = text.toString();
            if (!serviceDirectory.isBlank()) {
                summary = summary.replace(serviceDirectory, "<service-dir>");
            }
            return summary
                    .replaceAll(
                            "jdbc:postgresql://[^\\s]+",
                            "jdbc:postgresql://<redacted>")
                    .replaceAll(
                            "(?i)(password|credential|secret)=[^\\s]+",
                            "$1=<redacted>");
        }
    }
}
