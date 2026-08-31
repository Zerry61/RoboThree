package com.robothree.central.modelgateway.recovery;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class Cgf2a3DualNodeModelRecoveryIntegrationTest {

    private static final ObjectMapper JSON =
            new ObjectMapper().findAndRegisterModules();
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    private static final String CLIENT_INSTANCE_ID =
            "7a300000-0000-4000-8000-000000000003";

    @Container
    private final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void provesCrossNodeDurableReconnectTakeoverFencingAndSingleTerminal()
            throws Exception {
        HarnessEnvironment environment = installEnvironment();
        PGSimpleDataSource dataSource = dataSource();
        ModelRecoveryNode nodeA =
                ModelRecoveryNode.start("model-node-a", environment);
        ModelRecoveryNode nodeB =
                ModelRecoveryNode.start("model-node-b", environment);
        try {
            assertIndependentNodes(nodeA, nodeB);

            ObjectNode crashCommand = acceptCommand(
                    "00000000-0000-4000-8000-00000000a301",
                    "00000000-0000-4000-8000-00000000a302",
                    "a".repeat(64));
            JsonNode accepted = requireSuccess(post(
                    nodeA,
                    "/model-recovery-harness/accept",
                    crashCommand));
            UUID crashInvocation = invocationId(accepted);
            assertStatus(nodeB, crashInvocation, "accepted");
            assertThat(eventTypes(events(nodeB, crashInvocation, 0)))
                    .containsExactly("accepted");

            configureBackend(nodeA, "HALT", "NOT_FOUND");
            ModelRecoveryNode crashingNode = nodeA;
            CompletableFuture<HttpResult> crashingExecute =
                    CompletableFuture.supplyAsync(() -> post(
                            crashingNode,
                            "/model-recovery-harness/execute",
                            invocationCommand(crashInvocation)));
            nodeA.awaitExit();
            assertThat(nodeA.exitCode()).isEqualTo(82);
            crashingExecute.handle((ignored, failure) -> null)
                    .get(3, TimeUnit.SECONDS);

            assertStatus(nodeB, crashInvocation, "running");
            String committedCachePlanDigest = promptCachePlanDigest(
                    dataSource,
                    crashInvocation);
            assertThat(eventTypes(events(nodeB, crashInvocation, 1)))
                    .containsExactly("dispatch_decided");
            configureBackend(nodeB, "COMPLETE", "NOT_FOUND");
            JsonNode recovered = awaitRecovery(nodeB, crashInvocation);
            assertThat(recovered.path("invocation").path("status").asText())
                    .isEqualTo("completed");
            assertThat(promptCachePlanDigest(dataSource, crashInvocation))
                    .isEqualTo(committedCachePlanDigest);
            assertThat(eventTypes(events(nodeB, crashInvocation, 1)))
                    .containsExactly(
                            "dispatch_decided",
                            "usage_recorded",
                            "completed");

            long stoppedProcessId = nodeA.processId();
            nodeA.close();
            nodeA = ModelRecoveryNode.start("model-node-a", environment);
            assertThat(nodeA.processId()).isNotEqualTo(stoppedProcessId);
            ModelRecoveryNode activeNodeA = nodeA;

            ObjectNode staleCommand = acceptCommand(
                    "00000000-0000-4000-8000-00000000a311",
                    "00000000-0000-4000-8000-00000000a312",
                    "b".repeat(64));
            UUID staleInvocation = invocationId(requireSuccess(post(
                    nodeA,
                    "/model-recovery-harness/accept",
                    staleCommand)));
            configureBackend(nodeA, "BLOCK", "UNKNOWN");
            CompletableFuture<HttpResult> staleExecution =
                    CompletableFuture.supplyAsync(() -> post(
                            activeNodeA,
                            "/model-recovery-harness/execute",
                            invocationCommand(staleInvocation)));
            awaitBackendBlocked(nodeA);
            configureBackend(nodeB, "COMPLETE", "TERMINAL");
            JsonNode takeover = awaitRecovery(nodeB, staleInvocation);
            assertThat(takeover.path("invocation").path("status").asText())
                    .isEqualTo("completed");
            postWithoutBody(nodeA, "/model-recovery-harness/backend/release");
            JsonNode staleResult = staleExecution.get(8, TimeUnit.SECONDS).json();
            assertThat(staleResult.path("succeeded").asBoolean()).isFalse();
            assertThat(staleResult.path("errorCode").asText())
                    .isEqualTo("model_gateway.fencing_epoch_conflict");
            assertThat(terminalEventCount(events(nodeB, staleInvocation, 0)))
                    .isEqualTo(1);

            ObjectNode cancelCommand = acceptCommand(
                    "00000000-0000-4000-8000-00000000a321",
                    "00000000-0000-4000-8000-00000000a322",
                    "c".repeat(64));
            UUID cancelInvocation = invocationId(requireSuccess(post(
                    nodeA,
                    "/model-recovery-harness/accept",
                    cancelCommand)));
            // A transient Provider request is intentionally node-local. Replaying the
            // same accept on the execution node registers the body without creating a
            // second durable invocation or CacheContext.
            assertThat(invocationId(requireSuccess(post(
                            nodeB,
                            "/model-recovery-harness/accept",
                            cancelCommand))))
                    .isEqualTo(cancelInvocation);
            configureBackend(nodeB, "BLOCK", "NOT_FOUND");
            CompletableFuture<HttpResult> providerCompletion =
                    CompletableFuture.supplyAsync(() -> post(
                            nodeB,
                            "/model-recovery-harness/execute",
                            invocationCommand(cancelInvocation)));
            awaitBackendBlocked(nodeB);
            CompletableFuture<HttpResult> cancel = CompletableFuture.supplyAsync(
                    () -> post(
                            activeNodeA,
                            "/model-recovery-harness/cancel",
                            cancelCommand(cancelInvocation, 1)));
            CompletableFuture<HttpResult> release = CompletableFuture.supplyAsync(
                    () -> postWithoutBody(
                            nodeB,
                            "/model-recovery-harness/backend/release"));
            requireSuccess(cancel.get(8, TimeUnit.SECONDS));
            release.get(8, TimeUnit.SECONDS);
            requireSuccess(providerCompletion.get(8, TimeUnit.SECONDS));
            JsonNode finalCancelStatus = requireSuccess(get(
                    nodeA,
                    "/model-recovery-harness/status?invocationId="
                            + cancelInvocation));
            assertThat(finalCancelStatus.path("invocation").path("status").asText())
                    .isIn("cancelled", "completed");
            assertThat(terminalEventCount(events(nodeA, cancelInvocation, 0)))
                    .isEqualTo(1);

            ObjectNode idempotent = acceptCommand(
                    "00000000-0000-4000-8000-00000000a331",
                    "00000000-0000-4000-8000-00000000a332",
                    "d".repeat(64));
            CompletableFuture<JsonNode> acceptOnA = CompletableFuture.supplyAsync(
                    () -> requireSuccess(post(
                            activeNodeA,
                            "/model-recovery-harness/accept",
                            idempotent)));
            CompletableFuture<JsonNode> acceptOnB = CompletableFuture.supplyAsync(
                    () -> requireSuccess(post(
                            nodeB,
                            "/model-recovery-harness/accept",
                            idempotent)));
            JsonNode acceptedOnA = acceptOnA.join();
            JsonNode acceptedOnB = acceptOnB.join();
            assertThat(invocationId(acceptedOnA))
                    .isEqualTo(invocationId(acceptedOnB));
            ObjectNode conflicting = idempotent.deepCopy();
            conflicting.put("requestDigest", "e".repeat(64));
            JsonNode conflict = post(
                    nodeB,
                    "/model-recovery-harness/accept",
                    conflicting).json();
            assertThat(conflict.path("succeeded").asBoolean()).isFalse();
            assertThat(conflict.path("errorCode").asText())
                    .isEqualTo("model_gateway.client_request_conflict");

            assertResourceProjection(nodeA);
            assertResourceProjection(nodeB);
            assertThat(activeRecoveryLeaseCount(dataSource)).isZero();
        } finally {
            nodeA.close();
            nodeB.close();
        }
        awaitClusterConnectionCount(dataSource, 0);
    }

    @Test
    void provesDatabaseRecoverySchemaFailClosedAndLifecycleResourceCleanup()
            throws Exception {
        HarnessEnvironment environment = installEnvironment();
        PGSimpleDataSource dataSource = dataSource();
        ModelRecoveryNode nodeA =
                ModelRecoveryNode.start("reliability-node-a", environment);
        ModelRecoveryNode nodeB =
                ModelRecoveryNode.start("reliability-node-b", environment);
        try {
            UUID invocationId = invocationId(requireSuccess(post(
                    nodeA,
                    "/model-recovery-harness/accept",
                    acceptCommand(
                            "00000000-0000-4000-8000-00000000a341",
                            "00000000-0000-4000-8000-00000000a342",
                            "f".repeat(64)))));

            var docker = DockerClientFactory.instance().client();
            docker.pauseContainerCmd(postgres.getContainerId()).exec();
            try {
                assertReadiness(
                        nodeA,
                        "down",
                        "central.production_database_unavailable");
                assertReadiness(
                        nodeB,
                        "down",
                        "central.production_database_unavailable");
            } finally {
                docker.unpauseContainerCmd(postgres.getContainerId()).exec();
            }
            awaitCondition(
                    () -> readinessIs(nodeA, "ready"),
                    Duration.ofSeconds(15),
                    "node A did not recover database readiness");
            awaitCondition(
                    () -> readinessIs(nodeB, "ready"),
                    Duration.ofSeconds(15),
                    "node B did not recover database readiness");
            assertStatus(nodeB, invocationId, "accepted");

            String originalDigest = schemaDigest(dataSource);
            updateSchemaDigest(dataSource, "0".repeat(64));
            try {
                assertReadiness(
                        nodeA,
                        "down",
                        "central.production_readiness_failed");
                assertReadiness(
                        nodeB,
                        "down",
                        "central.production_readiness_failed");
            } finally {
                updateSchemaDigest(dataSource, originalDigest);
            }
            awaitCondition(
                    () -> readinessIs(nodeA, "ready"),
                    Duration.ofSeconds(10),
                    "node A did not recover after schema repair");
            awaitCondition(
                    () -> readinessIs(nodeB, "ready"),
                    Duration.ofSeconds(10),
                    "node B did not recover after schema repair");
            assertResourceProjection(nodeA);
            assertResourceProjection(nodeB);
        } finally {
            nodeA.close();
            nodeB.close();
        }
        awaitClusterConnectionCount(dataSource, 0);

        for (int cycle = 0; cycle < 3; cycle += 1) {
            ModelRecoveryNode node = ModelRecoveryNode.start(
                    "model-resource-" + cycle,
                    environment);
            long processId = node.processId();
            int port = node.port();
            assertResourceProjection(node);
            node.close();
            assertThat(ProcessHandle.of(processId)
                            .map(ProcessHandle::isAlive)
                            .orElse(false))
                    .isFalse();
            assertThat(canConnect(port)).isFalse();
            awaitClusterConnectionCount(dataSource, 0);
        }
        assertThat(activeRecoveryLeaseCount(dataSource)).isZero();
        System.out.println("ROBOTHREE_CGF2A3_RESULT={\"status\":\"PASS\","
                + "\"databaseReadinessRecoveryCount\":2,"
                + "\"schemaReadinessRecoveryCount\":2,"
                + "\"lifecycleCycleCount\":3,"
                + "\"finalClusterConnectionCount\":0,"
                + "\"finalActiveRecoveryLeaseCount\":0,"
                + "\"finalLiveChildProcessCount\":0,"
                + "\"finalOpenLoopbackPortCount\":0}");
    }

    private HarnessEnvironment installEnvironment() throws Exception {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        FakeDeviceSigner signer = new FakeDeviceSigner();
        byte[] tokenKey = new byte[32];
        new SecureRandom().nextBytes(tokenKey);
        return new HarnessEnvironment(
                postgres.getJdbcUrl(),
                postgres.getUsername(),
                postgres.getPassword(),
                Base64.getEncoder().encodeToString(tokenKey),
                Instant.now().truncatedTo(ChronoUnit.SECONDS),
                signer.getDeviceKeyId(),
                signer.getPublicKey());
    }

    private PGSimpleDataSource dataSource() {
        PGSimpleDataSource dataSource = new PGSimpleDataSource();
        dataSource.setURL(postgres.getJdbcUrl());
        dataSource.setUser(postgres.getUsername());
        dataSource.setPassword(postgres.getPassword());
        return dataSource;
    }

    private static void assertIndependentNodes(
            ModelRecoveryNode nodeA,
            ModelRecoveryNode nodeB) {
        assertThat(nodeA.processId()).isNotEqualTo(nodeB.processId());
        assertThat(nodeA.port()).isNotEqualTo(nodeB.port());
        assertThat(get(nodeA, "/model-recovery-harness/node")
                        .json()
                        .path("processId")
                        .asLong())
                .isEqualTo(nodeA.processId());
        assertThat(get(nodeB, "/model-recovery-harness/node")
                        .json()
                        .path("processId")
                        .asLong())
                .isEqualTo(nodeB.processId());
    }

    private static void assertStatus(
            ModelRecoveryNode node,
            UUID invocationId,
            String expectedStatus) {
        JsonNode status = requireSuccess(get(
                node,
                "/model-recovery-harness/status?invocationId=" + invocationId));
        assertThat(status.path("invocation").path("status").asText())
                .isEqualTo(expectedStatus);
    }

    private static JsonNode awaitRecovery(
            ModelRecoveryNode node,
            UUID invocationId) throws Exception {
        final JsonNode[] recovered = new JsonNode[1];
        awaitCondition(
                () -> {
                    JsonNode attempt = post(
                            node,
                            "/model-recovery-harness/recover",
                            invocationCommand(invocationId)).json();
                    if (attempt.path("succeeded").asBoolean()) {
                        recovered[0] = attempt;
                        return true;
                    }
                    assertThat(attempt.path("errorCode").asText())
                            .isIn(
                                    "model_gateway.lease_not_expired",
                                    "model_gateway.lease_expired");
                    return false;
                },
                Duration.ofSeconds(12),
                "recovery lease was not taken over");
        return recovered[0];
    }

    private static void awaitBackendBlocked(ModelRecoveryNode node)
            throws Exception {
        awaitCondition(
                () -> get(node, "/model-recovery-harness/backend")
                        .json()
                        .path("blocked")
                        .asBoolean(),
                Duration.ofSeconds(5),
                "backend did not enter the blocking execution");
    }

    private static void configureBackend(
            ModelRecoveryNode node,
            String executeMode,
            String queryMode) {
        ObjectNode request = JSON.createObjectNode();
        request.put("executeMode", executeMode);
        request.put("queryMode", queryMode);
        JsonNode response = post(
                node,
                "/model-recovery-harness/backend",
                request).json();
        assertThat(response.path("executeMode").asText()).isEqualTo(executeMode);
        assertThat(response.path("queryMode").asText()).isEqualTo(queryMode);
    }

    private static ObjectNode acceptCommand(
            String clientRequestId,
            String requestId,
            String requestDigest) {
        ObjectNode request = JSON.createObjectNode();
        request.put("clientRequestId", clientRequestId);
        request.put("requestId", requestId);
        request.put("requestDigest", requestDigest);
        return request;
    }

    private static ObjectNode invocationCommand(UUID invocationId) {
        ObjectNode request = JSON.createObjectNode();
        request.put("invocationId", invocationId.toString());
        return request;
    }

    private static ObjectNode cancelCommand(
            UUID invocationId,
            long expectedStatusRevision) {
        ObjectNode request = invocationCommand(invocationId);
        request.put("expectedStatusRevision", expectedStatusRevision);
        return request;
    }

    private static UUID invocationId(JsonNode operation) {
        return UUID.fromString(
                operation.path("invocation").path("invocationId").asText());
    }

    private static JsonNode requireSuccess(HttpResult response) {
        return requireSuccess(response.json());
    }

    private static JsonNode requireSuccess(JsonNode response) {
        assertThat(response.path("succeeded").asBoolean())
                .withFailMessage("operation failed: %s", response)
                .isTrue();
        return response;
    }

    private static String events(
            ModelRecoveryNode node,
            UUID invocationId,
            long afterSequence) {
        HttpResult response = get(
                node,
                "/model-recovery-harness/events?invocationId="
                        + invocationId
                        + "&afterSequence="
                        + afterSequence);
        assertThat(response.status()).isEqualTo(200);
        assertThat(response.requiredHeader("content-type"))
                .startsWith("text/event-stream");
        return response.body();
    }

    private static List<String> eventTypes(String sse) {
        return sse.lines()
                .filter(line -> line.startsWith("event: "))
                .map(line -> line.substring("event: ".length()))
                .toList();
    }

    private static long terminalEventCount(String sse) {
        return eventTypes(sse).stream()
                .filter(type -> List.of(
                                "completed",
                                "failed",
                                "cancelled",
                                "timed_out",
                                "uncertain")
                        .contains(type))
                .count();
    }

    private static void assertReadiness(
            ModelRecoveryNode node,
            String status,
            String errorCode) {
        JsonNode readiness = get(node, "/cluster-harness/readiness").json();
        assertThat(readiness.path("status").asText()).isEqualTo(status);
        assertThat(readiness.path("errorCode").asText()).isEqualTo(errorCode);
    }

    private static boolean readinessIs(
            ModelRecoveryNode node,
            String status) {
        try {
            return status.equals(get(node, "/cluster-harness/readiness")
                    .json()
                    .path("status")
                    .asText());
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static void assertResourceProjection(ModelRecoveryNode node) {
        JsonNode resources = get(
                node,
                "/model-recovery-harness/resources").json();
        assertThat(resources.path("poolName").asText())
                .isEqualTo("robothree-cluster-" + resources.path("nodeId").asText());
        assertThat(resources.path("activeConnections").asInt()).isZero();
        assertThat(resources.path("awaitingConnections").asInt()).isZero();
        assertThat(resources.path("activeSseSubscribers").asInt()).isZero();
        assertThat(resources.path("blockedExecution").asBoolean()).isFalse();
        assertThat(resources.path("totalConnections").asInt()).isBetween(0, 4);
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

    private static int activeRecoveryLeaseCount(PGSimpleDataSource dataSource)
            throws SQLException {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT count(*) "
                                + "FROM model_invocation_recovery_lease lease "
                                + "JOIN model_invocation invocation "
                                + "ON invocation.invocation_id = lease.invocation_id "
                                + "WHERE invocation.status IN ('accepted', 'running') "
                                + "AND lease.lease_expires_at > CURRENT_TIMESTAMP");
                ResultSet rows = statement.executeQuery()) {
            assertThat(rows.next()).isTrue();
            return rows.getInt(1);
        }
    }

    private static String promptCachePlanDigest(
            PGSimpleDataSource dataSource,
            UUID invocationId) throws SQLException {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT plan_digest FROM model_invocation_prompt_cache_plan "
                                + "WHERE invocation_id = ?")) {
            statement.setObject(1, invocationId);
            try (ResultSet rows = statement.executeQuery()) {
                assertThat(rows.next()).isTrue();
                String digest = rows.getString(1);
                assertThat(rows.next()).isFalse();
                return digest;
            }
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
                "model recovery cluster connections did not return to baseline");
    }

    private static int clusterConnectionCount(PGSimpleDataSource dataSource)
            throws SQLException {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT count(*) FROM pg_stat_activity "
                                + "WHERE application_name LIKE 'robothree-cluster-%'");
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

    private static HttpResult post(
            ModelRecoveryNode node,
            String path,
            JsonNode body) {
        return send(node, "POST", path, serialize(body));
    }

    private static HttpResult postWithoutBody(
            ModelRecoveryNode node,
            String path) {
        return send(node, "POST", path, "");
    }

    private static HttpResult get(
            ModelRecoveryNode node,
            String path) {
        return send(node, "GET", path, null);
    }

    private static HttpResult send(
            ModelRecoveryNode node,
            String method,
            String path,
            String body) {
        try {
            HttpRequest.Builder request = HttpRequest.newBuilder(
                            URI.create(node.baseUrl() + path))
                    .timeout(Duration.ofSeconds(15));
            if ("POST".equals(method)) {
                if (body != null && !body.isEmpty()) {
                    request.header("Content-Type", "application/json");
                }
                request.POST(HttpRequest.BodyPublishers.ofString(
                        body == null ? "" : body));
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
            throw new IllegalStateException(
                    "model recovery harness HTTP request failed",
                    exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(
                    "model recovery harness HTTP request interrupted",
                    exception);
        }
    }

    private static String serialize(JsonNode body) {
        try {
            return JSON.writeValueAsString(body);
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "model recovery harness request is not serializable",
                    exception);
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
                        "model recovery harness response is not JSON",
                        exception);
            }
        }

        String requiredHeader(String name) {
            List<String> values = headers.get(name.toLowerCase());
            assertThat(values).isNotNull().hasSize(1);
            return values.getFirst();
        }
    }

    private record HarnessEnvironment(
            String jdbcUrl,
            String username,
            String password,
            String tokenKey,
            Instant seedInstant,
            String deviceKeyId,
            String publicKey) {}

    private static final class ModelRecoveryNode implements AutoCloseable {

        private final String nodeId;
        private final int port;
        private final Process process;
        private final Thread outputDrainer;
        private final BoundedProcessOutput processOutput;

        private ModelRecoveryNode(
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

        static ModelRecoveryNode start(
                String nodeId,
                HarnessEnvironment environment) throws Exception {
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
            command.add(ModelRecoveryHarnessNodeMain.class.getName());
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
            BoundedProcessOutput processOutput = new BoundedProcessOutput(12_288);
            Thread drainer = Thread.ofPlatform()
                    .daemon(true)
                    .name("model-recovery-output-" + nodeId)
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
            ModelRecoveryNode node = new ModelRecoveryNode(
                    nodeId,
                    port,
                    process,
                    drainer,
                    processOutput);
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

        void awaitExit() throws Exception {
            if (!process.waitFor(10, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IllegalStateException(
                        "model recovery node did not exit: " + nodeId);
            }
        }

        int exitCode() {
            assertThat(process.isAlive()).isFalse();
            return process.exitValue();
        }

        private void awaitReady() throws Exception {
            long deadline = System.nanoTime() + Duration.ofSeconds(35).toNanos();
            while (System.nanoTime() < deadline) {
                if (!process.isAlive()) {
                    throw new IllegalStateException(
                            "model recovery node exited before readiness: "
                                    + nodeId
                                    + System.lineSeparator()
                                    + processOutput.safeSummary());
                }
                try {
                    HttpResult result = get(
                            this,
                            "/model-recovery-harness/node");
                    if (result.status() == 200
                            && nodeId.equals(result.json()
                                    .path("nodeId")
                                    .asText())) {
                        return;
                    }
                } catch (RuntimeException ignored) {
                    // Node is still starting.
                }
                Thread.sleep(100);
            }
            throw new IllegalStateException(
                    "model recovery node did not become ready: "
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
                            "(?i)(password|credential|secret|token)=[^\\s]+",
                            "$1=<redacted>");
        }
    }
}
