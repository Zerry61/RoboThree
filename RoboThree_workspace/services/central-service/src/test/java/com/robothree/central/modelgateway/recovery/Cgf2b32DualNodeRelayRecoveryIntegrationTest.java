package com.robothree.central.modelgateway.recovery;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.application.ModelDispatchDecision;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessFacts.BindingMode;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessFacts.BindingVersion;
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
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class Cgf2b32DualNodeRelayRecoveryIntegrationTest {

    private static final ObjectMapper JSON =
            new ObjectMapper().findAndRegisterModules();
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    private static final String CLIENT_INSTANCE_ID =
            "7a320000-0000-4000-8000-000000000032";

    @Container
    private final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void executesF1ThroughF10AcrossRealProviderBackedNodesAndRelay()
            throws Exception {
        HarnessEnvironment environment = installEnvironment();
        PGSimpleDataSource dataSource = dataSource();
        List<BoundedProcessOutput> capturedOutputs = new ArrayList<>();
        RelayProcess relay = RelayProcess.start(environment, capturedOutputs);
        NodeProcess nodeA = NodeProcess.start(
                "cgf2b32-node-a",
                environment,
                relay.endpoint(),
                BindingMode.ALL,
                capturedOutputs);
        NodeProcess nodeB = NodeProcess.start(
                "cgf2b32-node-b",
                environment,
                relay.endpoint(),
                BindingMode.ALL,
                capturedOutputs);
        long initialNodeAPid = nodeA.processId();
        long initialNodeBPid = nodeB.processId();
        int initialNodeAPort = nodeA.port();
        int initialNodeBPort = nodeB.port();
        String initialNodeAPool = resourceProjection(nodeA).path("poolName").asText();
        String initialNodeBPool = resourceProjection(nodeB).path("poolName").asText();
        assertThat(initialNodeAPool).isNotEqualTo(initialNodeBPool);
        long durableCursor;
        int providerRequestCount;
        try {
            assertIndependentProcesses(nodeA, nodeB, relay);

            // F1: accepted is durable, so a second node can safely dispatch once.
            resetRelay(relay, "COMPLETE");
            UUID f1 = accept(nodeA);
            nodeA.kill();
            JsonNode f1Recovered = awaitRecovery(nodeB, f1);
            assertStatus(f1Recovered, "completed");
            assertRelayCounts(relay, 1, 2, 1);
            nodeA = restartNodeA(environment, relay, capturedOutputs);

            // F2: dispatch is durable but the delegate was not entered.
            resetRelay(relay, "COMPLETE");
            UUID f2 = accept(nodeA);
            UUID f2FailpointSession = configureFailpoint(nodeA, "BEFORE_DELEGATE");
            CompletableFuture<HttpResult> f2Execute = executeAsync(nodeA, f2);
            awaitFailpointBlocked(nodeA, f2FailpointSession);
            nodeA.kill();
            consumeFailure(f2Execute);
            JsonNode f2Recovered = awaitRecovery(nodeB, f2);
            assertStatus(f2Recovered, "uncertain");
            assertRelayCounts(relay, 0, 0, 0);
            nodeA = restartNodeA(environment, relay, capturedOutputs);

            // F3: the Relay received the POST but emitted no delta.
            resetRelay(relay, "BLOCK_BEFORE_FIRST_DELTA");
            UUID f3 = accept(nodeA);
            CompletableFuture<HttpResult> f3Execute = executeAsync(nodeA, f3);
            awaitRelay(relay, 1, 0, 1);
            nodeA.kill();
            consumeFailure(f3Execute);
            JsonNode f3Recovered = awaitRecovery(nodeB, f3);
            assertStatus(f3Recovered, "uncertain");
            assertRelayCounts(relay, 1, 0, 0);
            releaseRelay(relay);
            awaitRelay(relay, 1, 2, 0);
            nodeA = restartNodeA(environment, relay, capturedOutputs);

            // F4: an ephemeral delta was observed but must not be replayed.
            resetRelay(relay, "BLOCK_AFTER_FIRST_DELTA");
            UUID f4 = accept(nodeA);
            CompletableFuture<HttpResult> f4Execute = executeAsync(nodeA, f4);
            awaitRelay(relay, 1, 1, 1);
            nodeA.kill();
            consumeFailure(f4Execute);
            JsonNode f4Recovered = awaitRecovery(nodeB, f4);
            assertStatus(f4Recovered, "uncertain");
            assertRelayCounts(relay, 1, 1, 0);
            assertThat(get(nodeB, "/cgf2b32-harness/ephemeral?invocationId=" + f4)
                            .json()
                            .path("eventCount")
                            .asInt())
                    .isZero();
            assertThat(eventTypes(events(nodeB, f4, 0)))
                    .containsExactly("accepted", "dispatch_decided", "uncertain");
            releaseRelay(relay);
            awaitRelay(relay, 1, 2, 0);
            nodeA = restartNodeA(environment, relay, capturedOutputs);

            // F5: Provider terminal exists only in memory before the durable commit.
            resetRelay(relay, "COMPLETE");
            UUID f5 = accept(nodeA);
            UUID f5FailpointSession = configureFailpoint(nodeA, "AFTER_DELEGATE");
            CompletableFuture<HttpResult> f5Execute = executeAsync(nodeA, f5);
            awaitFailpointBlocked(nodeA, f5FailpointSession);
            assertRelayCounts(relay, 1, 2, 1);
            nodeA.kill();
            consumeFailure(f5Execute);
            JsonNode f5Recovered = awaitRecovery(nodeB, f5);
            assertStatus(f5Recovered, "uncertain");
            assertRelayCounts(relay, 1, 2, 1);
            nodeA = restartNodeA(environment, relay, capturedOutputs);

            // F6: a stale owner cannot commit after a higher epoch takeover.
            resetRelay(relay, "COMPLETE");
            UUID f6 = accept(nodeA);
            UUID f6FailpointSession = configureFailpoint(nodeA, "AFTER_DELEGATE");
            CompletableFuture<HttpResult> f6Execute = executeAsync(nodeA, f6);
            awaitFailpointBlocked(nodeA, f6FailpointSession);
            JsonNode f6Recovered = awaitRecovery(nodeB, f6);
            assertStatus(f6Recovered, "uncertain");
            releaseFailpoint(nodeA, f6FailpointSession);
            JsonNode stale = f6Execute.get(10, TimeUnit.SECONDS).json();
            assertThat(stale.path("succeeded").asBoolean()).isFalse();
            assertThat(stale.path("errorCode").asText())
                    .isEqualTo("model_gateway.fencing_epoch_conflict");
            assertThat(terminalEventCount(events(nodeB, f6, 0))).isEqualTo(1);
            configureFailpoint(nodeA, "NONE");

            // F7: cancel intent and provider terminal converge through one Runtime writer.
            resetRelay(relay, "COMPLETE");
            UUID f7 = accept(nodeA);
            UUID f7FailpointSession = configureFailpoint(nodeA, "AFTER_DELEGATE");
            CompletableFuture<HttpResult> f7Execute = executeAsync(nodeA, f7);
            awaitFailpointBlocked(nodeA, f7FailpointSession);
            JsonNode cancel = requireSuccess(post(
                    nodeB,
                    "/cgf2b32-harness/cancel",
                    cancelCommand(f7, 1)));
            assertThat(cancel.path("invocation").path("cancelReason").asText())
                    .isEqualTo("user_requested");
            releaseFailpoint(nodeA, f7FailpointSession);
            requireSuccess(f7Execute.get(10, TimeUnit.SECONDS));
            JsonNode f7Status = requireSuccess(get(
                    nodeB,
                    "/cgf2b32-harness/status?invocationId=" + f7));
            assertThat(f7Status.path("invocation").path("status").asText())
                    .isIn("completed", "cancelled");
            assertThat(terminalEventCount(events(nodeB, f7, 0))).isEqualTo(1);
            configureFailpoint(nodeA, "NONE");

            // F8: durable cursor resumes on B; historical deltas do not.
            resetRelay(relay, "COMPLETE");
            UUID f8 = accept(nodeA);
            JsonNode f8Completed = requireSuccess(post(
                    nodeA,
                    "/cgf2b32-harness/execute",
                    invocationCommand(f8)));
            assertStatus(f8Completed, "completed");
            long f8LastSequence = f8Completed.path("invocation")
                    .path("lastDurableEventSequence")
                    .asLong();
            durableCursor = f8LastSequence;
            nodeA.close();
            assertThat(eventTypes(events(nodeB, f8, 1)))
                    .containsExactly("dispatch_decided", "usage_recorded", "completed");
            assertThat(events(nodeB, f8, f8LastSequence)).isEmpty();
            assertThat(get(nodeB, "/cgf2b32-harness/ephemeral?invocationId=" + f8)
                            .json()
                            .path("eventCount")
                            .asInt())
                    .isZero();
            nodeA = restartNodeA(environment, relay, capturedOutputs);

            // F9: an old V1 invocation remains locked after current selection becomes V2.
            resetRelay(relay, "COMPLETE");
            select(nodeA, "V1");
            select(nodeB, "V1");
            UUID f9V1 = accept(nodeA);
            UUID f9FailpointSession = configureFailpoint(nodeA, "BEFORE_DELEGATE");
            CompletableFuture<HttpResult> f9Execute = executeAsync(nodeA, f9V1);
            awaitFailpointBlocked(nodeA, f9FailpointSession);
            select(nodeA, "V2");
            select(nodeB, "V2");
            nodeA.kill();
            consumeFailure(f9Execute);
            JsonNode f9Recovered = awaitRecovery(nodeB, f9V1);
            assertStatus(f9Recovered, "uncertain");
            assertThat(f9Recovered.path("invocation").path("dispatchDecision").asText())
                    .isEqualTo(ModelDispatchDecision.fromBinding(
                            Cgf2b32HarnessFacts.binding(
                                    relay.endpoint(),
                                    BindingVersion.V1))
                            .persistedValue());
            assertRelayCounts(relay, 0, 0, 0);
            UUID f9V2 = accept(nodeB);
            JsonNode f9V2Completed = requireSuccess(post(
                    nodeB,
                    "/cgf2b32-harness/execute",
                    invocationCommand(f9V2)));
            assertStatus(f9V2Completed, "completed");
            assertThat(f9V2Completed.path("invocation")
                            .path("dispatchDecision")
                            .asText())
                    .isEqualTo(ModelDispatchDecision.fromBinding(
                            Cgf2b32HarnessFacts.binding(
                                    relay.endpoint(),
                                    BindingVersion.V2))
                            .persistedValue());
            assertRelayCounts(relay, 1, 2, 1);

            // F10: missing and drifted V1 definitions both fail closed.
            nodeB.close();
            nodeA = restartNodeA(environment, relay, capturedOutputs);
            nodeB = NodeProcess.start(
                    "cgf2b32-node-b",
                    environment,
                    relay.endpoint(),
                    BindingMode.MISSING_V1,
                    capturedOutputs);
            resetRelay(relay, "COMPLETE");
            UUID f10 = accept(nodeA);
            UUID f10FailpointSession = configureFailpoint(nodeA, "BEFORE_DELEGATE");
            CompletableFuture<HttpResult> f10Execute = executeAsync(nodeA, f10);
            awaitFailpointBlocked(nodeA, f10FailpointSession);
            nodeA.kill();
            consumeFailure(f10Execute);
            JsonNode missing = awaitRecoveryError(
                    nodeB,
                    f10,
                    "model_gateway.binding_revision_missing");
            assertThat(missing.path("succeeded").asBoolean()).isFalse();
            assertRelayCounts(relay, 0, 0, 0);
            nodeB.close();
            nodeB = NodeProcess.start(
                    "cgf2b32-node-b",
                    environment,
                    relay.endpoint(),
                    BindingMode.DRIFT_V1,
                    capturedOutputs);
            JsonNode drift = awaitRecoveryError(
                    nodeB,
                    f10,
                    "model_gateway.binding_revision_missing");
            assertThat(drift.path("succeeded").asBoolean()).isFalse();
            assertRelayCounts(relay, 0, 0, 0);
            assertThat(terminalEventCount(events(nodeB, f10, 0))).isZero();

            assertResourceProjection(nodeB);
            providerRequestCount = relayState(relay)
                    .path("lifetimeRequestCount")
                    .asInt();
            assertThat(providerRequestCount).isEqualTo(8);
        } finally {
            nodeA.close();
            nodeB.close();
            relay.close();
        }
        awaitClusterConnectionCount(dataSource, 0);
        awaitCondition(
                () -> {
                    try {
                        return activeRecoveryLeaseCount(dataSource) == 0;
                    } catch (SQLException exception) {
                        return false;
                    }
                },
                Duration.ofSeconds(10),
                "recovery leases did not expire after the harness");
        assertNoSensitiveOutput(capturedOutputs, environment.sensitiveCanaries());
        int durableTerminalCount = durableTerminalEventCount(dataSource);
        int usageFactCount = tableRowCount(dataSource, "model_invocation_usage_fact");
        assertThat(durableTerminalCount).isEqualTo(10);
        System.out.println("ROBOTHREE_CGF2B32_RESULT={\"status\":\"PASS\","
                + "\"nodePidA\":" + initialNodeAPid + ","
                + "\"nodePidB\":" + initialNodeBPid + ","
                + "\"nodePortA\":" + initialNodeAPort + ","
                + "\"nodePortB\":" + initialNodeBPort + ","
                + "\"nodePoolA\":\"" + initialNodeAPool + "\","
                + "\"nodePoolB\":\"" + initialNodeBPool + "\","
                + "\"relayPid\":" + relay.processId() + ","
                + "\"providerPort\":" + relay.providerPort() + ","
                + "\"controlPort\":" + relay.controlPort() + ","
                + "\"sharedPostgreSql\":true,\"matrix\":\"F1-F10\","
                + "\"passedScenarioCount\":10,"
                + "\"providerRequestCount\":" + providerRequestCount + ","
                + "\"durableTerminalCount\":" + durableTerminalCount + ","
                + "\"usageFactCount\":" + usageFactCount + ","
                + "\"durableCursor\":" + durableCursor + ","
                + "\"terminalClassCounts\":"
                + terminalStatusCountsJson(dataSource) + ","
                + "\"fencingConflictCount\":1,"
                + "\"centralTakeoverCount\":1,"
                + "\"finalClusterConnectionCount\":0,"
                + "\"finalActiveRecoveryLeaseCount\":0,"
                + "\"durableTerminalWriter\":\"runtime\","
                + "\"publicContractChanged\":false}");
    }

    @Test
    void executesB33SecurityProtocolAndResourceClosureAcrossFiveLifecycles()
            throws Exception {
        HarnessEnvironment installed = installEnvironment();
        PGSimpleDataSource dataSource = dataSource();
        int initialTerminalCount = durableTerminalEventCount(dataSource);
        List<BoundedProcessOutput> capturedOutputs = new ArrayList<>();
        List<String> sensitiveCanaries = new ArrayList<>();
        List<List<ClosureScenario>> rounds = List.of(
                List.of(
                        scenario("REDIRECT", "V1", "failed",
                                "model_gateway.provider_redirect_rejected"),
                        scenario("REDIRECT", "V2", "failed",
                                "model_gateway.provider_redirect_rejected")),
                List.of(
                        scenario("WRONG_CONTENT_TYPE", "V1", "failed",
                                "model_gateway.provider_content_type_invalid"),
                        scenario("MALFORMED_SSE", "V2", "failed",
                                "model_gateway.provider_event_invalid")),
                List.of(
                        scenario("OVERSIZED_FRAME", "V1", "failed",
                                "model_gateway.provider_frame_oversized"),
                        scenario("INCOMPLETE_STREAM", "V2", "uncertain",
                                "model_gateway.dispatch_outcome_unknown")),
                List.of(
                        scenario("RESET_CONNECTION", "V1", "uncertain",
                                "model_gateway.dispatch_outcome_unknown"),
                        scenario("RESET_AFTER_FIRST_DELTA", "V2", "uncertain",
                                "model_gateway.dispatch_outcome_unknown")),
                List.of(
                        scenario("COMPLETE", "V1", "completed", null),
                        scenario("COMPLETE", "V2", "completed", null)));

        int maximumThreadCount = 0;
        for (int round = 0; round < rounds.size(); round++) {
            String canary = "robothree-cgf2b32-" + UUID.randomUUID();
            HarnessEnvironment environment = new HarnessEnvironment(
                    installed.jdbcUrl(),
                    installed.username(),
                    installed.password(),
                    installed.tokenKey(),
                    installed.seedInstant(),
                    installed.deviceKeyId(),
                    installed.publicKey(),
                    canary,
                    "cgf2b33-leakage-" + UUID.randomUUID(),
                    "cgf2b33-credential-" + UUID.randomUUID(),
                    "cgf2b33-output-" + UUID.randomUUID(),
                    "cgf2b33-header-" + UUID.randomUUID(),
                    "https://cgf2b33-" + UUID.randomUUID() + ".invalid/v1/model-route",
                    "/private/tmp/cgf2b33-" + UUID.randomUUID() + "/sensitive.txt");
            sensitiveCanaries.addAll(environment.sensitiveCanaries());
            RelayProcess relay = RelayProcess.start(environment, capturedOutputs);
            int providerPort = relay.providerPort();
            int controlPort = relay.controlPort();
            NodeProcess nodeA = NodeProcess.start(
                    "cgf2b33-node-a-" + round,
                    environment,
                    relay.endpoint(),
                    BindingMode.ALL,
                    capturedOutputs);
            NodeProcess nodeB = NodeProcess.start(
                    "cgf2b33-node-b-" + round,
                    environment,
                    relay.endpoint(),
                    BindingMode.ALL,
                    capturedOutputs);
            long nodeAPid = nodeA.processId();
            long nodeBPid = nodeB.processId();
            long relayPid = relay.processId();
            int nodeAPort = nodeA.port();
            int nodeBPort = nodeB.port();
            try {
                assertIndependentProcesses(nodeA, nodeB, relay);
                executeClosureScenario(nodeA, relay, rounds.get(round).get(0));
                executeClosureScenario(nodeB, relay, rounds.get(round).get(1));
                maximumThreadCount = Math.max(
                        maximumThreadCount,
                        Math.max(
                                resourceProjection(nodeA).path("liveThreadCount").asInt(),
                                resourceProjection(nodeB).path("liveThreadCount").asInt()));
                assertResourceProjection(nodeA);
                assertResourceProjection(nodeB);
                JsonNode relayResources = relayState(relay);
                assertThat(relayResources.path("activeRequests").asInt()).isZero();
                assertThat(relayResources.path("lifetimeRequestCount").asInt())
                        .isEqualTo(2);
            } finally {
                nodeA.close();
                nodeB.close();
                relay.close();
            }
            awaitProcessAndPortClosure(nodeAPid, nodeAPort);
            awaitProcessAndPortClosure(nodeBPid, nodeBPort);
            awaitProcessAndPortClosure(relayPid, providerPort);
            assertThat(canConnect(controlPort)).isFalse();
            awaitClusterConnectionCount(dataSource, 0);
        }

        assertThat(maximumThreadCount).isLessThan(128);
        assertThat(activeRecoveryLeaseCount(dataSource)).isZero();
        assertThat(durableTerminalEventCount(dataSource) - initialTerminalCount)
                .isEqualTo(10);
        assertThat(sensitiveCanaries).hasSize(35);
        assertNoSensitiveOutput(capturedOutputs, sensitiveCanaries);
        System.out.println("ROBOTHREE_CGF2B33_RESULT={\"status\":\"PASS\","
                + "\"lifecycleRoundCount\":5,\"scenarioCount\":10,"
                + "\"centralProcessCount\":10,\"relayProcessCount\":5,"
                + "\"durableTerminalCount\":10,"
                + "\"finalClusterConnectionCount\":0,"
                + "\"finalActiveRecoveryLeaseCount\":0,"
                + "\"finalActiveSseSubscriberCount\":0,"
                + "\"finalEphemeralBufferCount\":0,"
                + "\"finalRelayActiveRequestCount\":0,"
                + "\"finalLiveChildProcessCount\":0,"
                + "\"finalOpenLoopbackPortCount\":0,"
                + "\"sensitiveOutputMatchCount\":0,"
                + "\"publicContractChanged\":false}");
    }

    @Test
    void executesArh333LightweightTakeoverAndResourceClosure() throws Exception {
        HarnessEnvironment installed = installEnvironment();
        PGSimpleDataSource dataSource = dataSource();
        int initialTerminalCount = durableTerminalEventCount(dataSource);
        List<BoundedProcessOutput> capturedOutputs = new ArrayList<>();
        String canary = "robothree-cgf2b32-" + UUID.randomUUID();
        HarnessEnvironment environment = new HarnessEnvironment(
                installed.jdbcUrl(),
                installed.username(),
                installed.password(),
                installed.tokenKey(),
                installed.seedInstant(),
                installed.deviceKeyId(),
                installed.publicKey(),
                canary,
                environmentMarker(
                        "ROBOTHREE_ARH333_LEAKAGE_CANARY",
                        "arh333-leakage-"),
                environmentMarker(
                        "ROBOTHREE_ARH333_LEAKAGE_CREDENTIAL",
                        "arh333-credential-"),
                environmentMarker(
                        "ROBOTHREE_ARH333_LEAKAGE_CONTENT_BODY",
                        "arh333-output-"),
                "arh333-header-" + UUID.randomUUID(),
                environmentMarker(
                        "ROBOTHREE_ARH333_LEAKAGE_PROVIDER_ENDPOINT",
                        "https://arh333-relay-",
                        ".invalid/v1/model-route"),
                environmentMarker(
                        "ROBOTHREE_ARH333_LEAKAGE_ABSOLUTE_PATH",
                        "/private/tmp/arh333-",
                        "/sensitive.txt"));
        RelayProcess relay = RelayProcess.start(environment, capturedOutputs);
        int providerPort = relay.providerPort();
        int controlPort = relay.controlPort();
        NodeProcess nodeA = NodeProcess.start(
                "arh333-stability-node-a",
                environment,
                relay.endpoint(),
                BindingMode.ALL,
                capturedOutputs);
        NodeProcess nodeB = NodeProcess.start(
                "arh333-stability-node-b",
                environment,
                relay.endpoint(),
                BindingMode.ALL,
                capturedOutputs);
        long nodeAPid = nodeA.processId();
        long nodeBPid = nodeB.processId();
        long relayPid = relay.processId();
        int nodeAPort = nodeA.port();
        int nodeBPort = nodeB.port();
        try {
            assertIndependentProcesses(nodeA, nodeB, relay);
            resetRelay(relay, "COMPLETE");
            UUID invocationId = accept(nodeA);
            UUID failpointSessionId = configureFailpoint(nodeA, "AFTER_DELEGATE");
            CompletableFuture<HttpResult> firstOwner = executeAsync(nodeA, invocationId);
            awaitFailpointBlocked(nodeA, failpointSessionId);

            JsonNode recovered = awaitRecovery(nodeB, invocationId);
            assertStatus(recovered, "uncertain");
            releaseFailpoint(nodeA, failpointSessionId);
            JsonNode staleOwner = firstOwner.get(10, TimeUnit.SECONDS).json();
            assertThat(staleOwner.path("succeeded").asBoolean()).isFalse();
            assertThat(staleOwner.path("errorCode").asText())
                    .isEqualTo("model_gateway.fencing_epoch_conflict");
            assertThat(terminalEventCount(events(nodeB, invocationId, 0))).isEqualTo(1);
            assertResourceProjection(nodeA);
            assertResourceProjection(nodeB);
            JsonNode relayResources = relayState(relay);
            assertThat(relayResources.path("activeRequests").asInt()).isZero();
            assertThat(relayResources.path("lifetimeRequestCount").asInt()).isEqualTo(1);
        } finally {
            nodeA.close();
            nodeB.close();
            relay.close();
        }

        awaitProcessAndPortClosure(nodeAPid, nodeAPort);
        awaitProcessAndPortClosure(nodeBPid, nodeBPort);
        awaitProcessAndPortClosure(relayPid, providerPort);
        assertThat(canConnect(controlPort)).isFalse();
        awaitClusterConnectionCount(dataSource, 0);
        assertThat(activeRecoveryLeaseCount(dataSource)).isZero();
        assertThat(durableTerminalEventCount(dataSource) - initialTerminalCount).isEqualTo(1);
        assertNoSensitiveOutput(capturedOutputs, environment.sensitiveCanaries());
        System.out.println("ROBOTHREE_ARH333_CENTRAL_STABILITY_RESULT={\"status\":\"PASS\","
                + "\"centralTakeoverCount\":1,\"durableTerminalCount\":1,"
                + "\"fencingConflictCount\":1,"
                + "\"finalClusterConnectionCount\":0,"
                + "\"finalActiveRecoveryLeaseCount\":0,"
                + "\"finalActiveSseSubscriberCount\":0,"
                + "\"finalEphemeralBufferCount\":0,"
                + "\"finalRelayActiveRequestCount\":0,"
                + "\"finalLiveChildProcessCount\":0,"
                + "\"finalOpenLoopbackPortCount\":0,"
                + "\"childLogAndTraceMatchCount\":0,"
                + "\"sensitiveOutputMatchCount\":0}");
    }

    private static ClosureScenario scenario(
            String mode,
            String version,
            String expectedStatus,
            String expectedErrorCode) {
        return new ClosureScenario(
                mode,
                version,
                expectedStatus,
                expectedErrorCode);
    }

    private static void executeClosureScenario(
            NodeProcess node,
            RelayProcess relay,
            ClosureScenario scenario) throws Exception {
        resetRelay(relay, scenario.mode());
        select(node, scenario.version());
        UUID invocationId = accept(node);
        JsonNode result = statusFirstClosureResult(node, invocationId, post(
                node,
                "/cgf2b32-harness/execute",
                invocationCommand(invocationId)));
        assertStatus(result, scenario.expectedStatus());
        assertThat(result.path("invocation").path("safeErrorCode").asText(null))
                .isEqualTo(scenario.expectedErrorCode());
        JsonNode relayResult = relayState(relay);
        assertThat(relayResult.path("requestCount").asInt()).isEqualTo(1);
        assertThat(relayResult.path("activeRequests").asInt()).isZero();
        assertThat(relayResult.path("redirectTargetCount").asInt()).isZero();
        assertThat(relayResult.path("redirectCredentialCount").asInt()).isZero();
        if ("V1".equals(scenario.version())) {
            assertThat(relayResult.path("openAiRequestCount").asInt()).isEqualTo(1);
            assertThat(relayResult.path("anthropicRequestCount").asInt()).isZero();
        } else {
            assertThat(relayResult.path("openAiRequestCount").asInt()).isZero();
            assertThat(relayResult.path("anthropicRequestCount").asInt()).isEqualTo(1);
        }
        assertThat(terminalEventCount(events(node, invocationId, 0))).isEqualTo(1);
        assertThat(get(node, "/cgf2b32-harness/ephemeral?invocationId=" + invocationId)
                        .json()
                        .path("eventCount")
                        .asInt())
                .isZero();
    }

    private static JsonNode statusFirstClosureResult(
            NodeProcess node,
            UUID invocationId,
            HttpResult executeResponse) {
        JsonNode operation = executeResponse.json();
        if (operation.path("succeeded").asBoolean()) {
            return operation;
        }
        assertThat(operation.path("errorCode").asText())
                .as("Only a stale execution owner may reconcile from durable status")
                .isEqualTo("model_gateway.fencing_epoch_conflict");
        JsonNode status = requireSuccess(get(
                node,
                "/cgf2b32-harness/status?invocationId=" + invocationId));
        assertThat(status.path("invocation").path("status").asText())
                .as("A fencing conflict must already have one durable terminal winner")
                .isIn("completed", "failed", "cancelled", "timed_out", "uncertain");
        return status;
    }

    private static void awaitProcessAndPortClosure(long processId, int port)
            throws Exception {
        awaitCondition(
                () -> ProcessHandle.of(processId)
                                .map(ProcessHandle::isAlive)
                                .orElse(false)
                        == false
                        && !canConnect(port),
                Duration.ofSeconds(10),
                "CGF-2B.3.3 process or port did not close");
        assertThat(ProcessHandle.of(processId)
                        .map(handle -> handle.descendants().filter(
                                        ProcessHandle::isAlive)
                                .count())
                        .orElse(0L))
                .isZero();
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
                signer.getPublicKey(),
                "robothree-cgf2b32-" + UUID.randomUUID(),
                "cgf2b33-leakage-" + UUID.randomUUID(),
                "cgf2b33-credential-" + UUID.randomUUID(),
                "cgf2b33-output-" + UUID.randomUUID(),
                "cgf2b33-header-" + UUID.randomUUID(),
                "https://cgf2b33-" + UUID.randomUUID() + ".invalid/v1/model-route",
                "/private/tmp/cgf2b33-" + UUID.randomUUID() + "/sensitive.txt");
    }

    private PGSimpleDataSource dataSource() {
        PGSimpleDataSource dataSource = new PGSimpleDataSource();
        dataSource.setURL(postgres.getJdbcUrl());
        dataSource.setUser(postgres.getUsername());
        dataSource.setPassword(postgres.getPassword());
        return dataSource;
    }

    private static NodeProcess restartNodeA(
            HarnessEnvironment environment,
            RelayProcess relay,
            List<BoundedProcessOutput> outputs) throws Exception {
        return NodeProcess.start(
                "cgf2b32-node-a",
                environment,
                relay.endpoint(),
                BindingMode.ALL,
                outputs);
    }

    private static UUID accept(NodeProcess node) {
        ObjectNode command = JSON.createObjectNode();
        command.put("clientRequestId", UUID.randomUUID().toString());
        command.put("requestId", UUID.randomUUID().toString());
        JsonNode accepted = requireSuccess(post(
                node,
                "/cgf2b32-harness/accept",
                command));
        assertThat(accepted.path("invocation").path("status").asText())
                .isEqualTo("accepted");
        return UUID.fromString(
                accepted.path("invocation").path("invocationId").asText());
    }

    private static CompletableFuture<HttpResult> executeAsync(
            NodeProcess node,
            UUID invocationId) {
        return CompletableFuture.supplyAsync(() -> post(
                node,
                "/cgf2b32-harness/execute",
                invocationCommand(invocationId)));
    }

    private static void consumeFailure(CompletableFuture<HttpResult> request)
            throws Exception {
        request.handle((ignored, failure) -> null).get(5, TimeUnit.SECONDS);
    }

    private static JsonNode awaitRecovery(
            NodeProcess node,
            UUID invocationId) throws Exception {
        final JsonNode[] recovered = new JsonNode[1];
        awaitCondition(
                () -> {
                    JsonNode attempt = post(
                            node,
                            "/cgf2b32-harness/recover",
                            invocationCommand(invocationId)).json();
                    if (attempt.path("succeeded").asBoolean()) {
                        recovered[0] = attempt;
                        return true;
                    }
                    assertThat(attempt.path("errorCode").asText())
                            .isIn(
                                    "model_gateway.lease_not_expired",
                                    "model_gateway.lease_expired",
                                    "model_gateway.fencing_epoch_conflict");
                    return false;
                },
                Duration.ofSeconds(12),
                "CGF-2B.3.2 recovery lease was not taken over");
        return recovered[0];
    }

    private static JsonNode awaitRecoveryError(
            NodeProcess node,
            UUID invocationId,
            String expectedCode) throws Exception {
        final JsonNode[] failure = new JsonNode[1];
        awaitCondition(
                () -> {
                    JsonNode attempt = post(
                            node,
                            "/cgf2b32-harness/recover",
                            invocationCommand(invocationId)).json();
                    if (expectedCode.equals(attempt.path("errorCode").asText())) {
                        failure[0] = attempt;
                        return true;
                    }
                    assertThat(attempt.path("errorCode").asText())
                            .isIn(
                                    "model_gateway.lease_not_expired",
                                    "model_gateway.lease_expired");
                    return false;
                },
                Duration.ofSeconds(12),
                "CGF-2B.3.2 expected recovery failure did not occur");
        return failure[0];
    }

    private static UUID configureFailpoint(NodeProcess node, String failpoint) {
        ObjectNode command = JSON.createObjectNode();
        command.put("failpoint", failpoint);
        JsonNode state = post(
                node,
                "/cgf2b32-harness/failpoint",
                command).json();
        assertThat(state.path("failpoint").asText()).isEqualTo(failpoint);
        UUID sessionId = UUID.fromString(state.path("sessionId").asText());
        assertThat(sessionId).isNotNull();
        return sessionId;
    }

    private static void awaitFailpointBlocked(
            NodeProcess node,
            UUID sessionId) {
        JsonNode state = get(
                node,
                "/cgf2b32-harness/failpoint/await-blocked?sessionId=" + sessionId)
                .json();
        assertThat(state.path("sessionId").asText()).isEqualTo(sessionId.toString());
        assertThat(state.path("blocked").asBoolean()).isTrue();
    }

    private static void releaseFailpoint(NodeProcess node, UUID sessionId) {
        JsonNode state = postWithoutBody(
                node,
                "/cgf2b32-harness/failpoint/release?sessionId=" + sessionId)
                .json();
        assertThat(state.path("sessionId").asText()).isEqualTo(sessionId.toString());
        assertThat(state.path("blocked").asBoolean()).isFalse();
    }

    private static void select(NodeProcess node, String version) {
        ObjectNode command = JSON.createObjectNode();
        command.put("version", version);
        assertThat(post(node, "/cgf2b32-harness/selection", command)
                        .json()
                        .path("version")
                        .asText())
                .isEqualTo(version);
    }

    private static void resetRelay(RelayProcess relay, String mode)
            throws Exception {
        releaseRelay(relay);
        awaitCondition(
                () -> relayState(relay).path("activeRequests").asInt() == 0,
                Duration.ofSeconds(5),
                "controlled Relay did not become idle");
        JsonNode state = post(
                relay.controlBaseUrl(),
                "/control/reset?mode=" + mode,
                "").json();
        assertThat(state.path("mode").asText()).isEqualTo(mode);
        assertThat(state.path("requestCount").asInt()).isZero();
    }

    private static void releaseRelay(RelayProcess relay) {
        post(relay.controlBaseUrl(), "/control/release", "");
    }

    private static JsonNode relayState(RelayProcess relay) {
        return get(relay.controlBaseUrl(), "/control/state").json();
    }

    private static void awaitRelay(
            RelayProcess relay,
            int requestCount,
            int deltaCount,
            int activeRequests) throws Exception {
        awaitCondition(
                () -> {
                    JsonNode state = relayState(relay);
                    return state.path("requestCount").asInt() == requestCount
                            && state.path("deltaCount").asInt() == deltaCount
                            && state.path("activeRequests").asInt() == activeRequests;
                },
                Duration.ofSeconds(8),
                "controlled Relay did not reach the expected state");
    }

    private static void assertRelayCounts(
            RelayProcess relay,
            int requestCount,
            int deltaCount,
            int terminalCount) {
        JsonNode state = relayState(relay);
        assertThat(state.path("requestCount").asInt()).isEqualTo(requestCount);
        assertThat(state.path("deltaCount").asInt()).isEqualTo(deltaCount);
        assertThat(state.path("terminalCount").asInt()).isEqualTo(terminalCount);
        assertThat(state.path("requestDigest").asText())
                .matches(requestCount == 0 ? "^$" : "^[0-9a-f]{64}$");
    }

    private static void assertIndependentProcesses(
            NodeProcess nodeA,
            NodeProcess nodeB,
            RelayProcess relay) {
        assertThat(nodeA.processId()).isNotEqualTo(nodeB.processId());
        assertThat(nodeA.processId()).isNotEqualTo(relay.processId());
        assertThat(nodeB.processId()).isNotEqualTo(relay.processId());
        assertThat(nodeA.port()).isNotEqualTo(nodeB.port());
        assertThat(nodeA.port()).isNotEqualTo(relay.providerPort());
        assertThat(nodeB.port()).isNotEqualTo(relay.providerPort());
        assertThat(get(nodeA, "/cgf2b32-harness/node")
                        .json()
                        .path("processId")
                        .asLong())
                .isEqualTo(nodeA.processId());
        assertThat(get(nodeB, "/cgf2b32-harness/node")
                        .json()
                        .path("processId")
                        .asLong())
                .isEqualTo(nodeB.processId());
    }

    private static void assertStatus(JsonNode operation, String expected) {
        assertThat(operation.path("invocation").path("status").asText())
                .isEqualTo(expected);
    }

    private static ObjectNode invocationCommand(UUID invocationId) {
        ObjectNode command = JSON.createObjectNode();
        command.put("invocationId", invocationId.toString());
        return command;
    }

    private static ObjectNode cancelCommand(
            UUID invocationId,
            long expectedStatusRevision) {
        ObjectNode command = invocationCommand(invocationId);
        command.put("expectedStatusRevision", expectedStatusRevision);
        return command;
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
            NodeProcess node,
            UUID invocationId,
            long afterSequence) {
        HttpResult response = get(
                node,
                "/cgf2b32-harness/events?invocationId="
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

    private static void assertResourceProjection(NodeProcess node) {
        JsonNode resources = resourceProjection(node);
        assertThat(resources.path("poolName").asText())
                .isEqualTo("robothree-cluster-" + resources.path("nodeId").asText());
        assertThat(resources.path("activeConnections").asInt()).isZero();
        assertThat(resources.path("awaitingConnections").asInt()).isZero();
        assertThat(resources.path("activeSseSubscribers").asInt()).isZero();
        assertThat(resources.path("blockedExecution").asBoolean()).isFalse();
        assertThat(resources.path("totalConnections").asInt()).isBetween(0, 4);
    }

    private static JsonNode resourceProjection(NodeProcess node) {
        return get(node, "/cgf2b32-harness/resources").json();
    }

    private static int durableTerminalEventCount(PGSimpleDataSource dataSource)
            throws SQLException {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT count(*) FROM model_invocation_event "
                                + "WHERE event_type IN ('completed', 'failed', "
                                + "'cancelled', 'timed_out', 'uncertain')");
                ResultSet rows = statement.executeQuery()) {
            assertThat(rows.next()).isTrue();
            return rows.getInt(1);
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

    private static int tableRowCount(
            PGSimpleDataSource dataSource,
            String tableName) throws SQLException {
        if (!List.of(
                        "model_invocation_usage_fact",
                        "model_invocation_prompt_cache_plan")
                .contains(tableName)) {
            throw new IllegalArgumentException("unsupported harness table");
        }
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT count(*) FROM " + tableName);
                ResultSet rows = statement.executeQuery()) {
            assertThat(rows.next()).isTrue();
            return rows.getInt(1);
        }
    }

    private static String terminalStatusCountsJson(PGSimpleDataSource dataSource)
            throws SQLException {
        ObjectNode counts = JSON.createObjectNode();
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT status, count(*) FROM model_invocation "
                                + "GROUP BY status ORDER BY status");
                ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                counts.put(rows.getString(1), rows.getInt(2));
            }
        }
        return counts.toString();
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
                Duration.ofSeconds(12),
                "CGF-2B.3.2 cluster connections did not return to baseline");
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

    private static void assertNoSensitiveOutput(
            List<BoundedProcessOutput> outputs,
            List<String> sensitiveValues) {
        for (BoundedProcessOutput output : outputs) {
            String safeOutput = output.safeSummary();
            assertThat(safeOutput)
                    .doesNotContain("Return the fixed synthetic relay recovery")
                    .doesNotContain("Authorization:")
                    .doesNotContain("x-api-key:");
            for (String sensitive : sensitiveValues) {
                assertThat(safeOutput)
                        .doesNotContain(sensitive)
                        .doesNotContain(Base64.getEncoder().encodeToString(
                                sensitive.getBytes(StandardCharsets.UTF_8)))
                        .doesNotContain(java.net.URLEncoder.encode(
                                sensitive,
                                StandardCharsets.UTF_8));
            }
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

    private static HttpResult post(NodeProcess node, String path, JsonNode body) {
        return post(node.baseUrl(), path, serialize(body));
    }

    private static HttpResult postWithoutBody(NodeProcess node, String path) {
        return post(node.baseUrl(), path, "");
    }

    private static HttpResult post(String baseUrl, String path, String body) {
        return send(baseUrl, "POST", path, body);
    }

    private static HttpResult get(NodeProcess node, String path) {
        return get(node.baseUrl(), path);
    }

    private static HttpResult get(String baseUrl, String path) {
        return send(baseUrl, "GET", path, null);
    }

    private static HttpResult send(
            String baseUrl,
            String method,
            String path,
            String body) {
        try {
            HttpRequest.Builder request = HttpRequest.newBuilder(
                            URI.create(baseUrl + path))
                    .timeout(Duration.ofSeconds(20));
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
            throw new IllegalStateException("CGF-2B.3.2 HTTP request failed", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(
                    "CGF-2B.3.2 HTTP request interrupted",
                    exception);
        }
    }

    private static String serialize(JsonNode body) {
        try {
            return JSON.writeValueAsString(body);
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "CGF-2B.3.2 command is not serializable",
                    exception);
        }
    }

    private static int availablePort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            socket.setReuseAddress(false);
            return socket.getLocalPort();
        }
    }

    private static boolean canConnect(int port) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", port), 250);
            return true;
        } catch (IOException expected) {
            return false;
        }
    }

    private static String classPath() {
        return System.getProperty(
                "surefire.test.class.path",
                System.getProperty("java.class.path"));
    }

    private static String environmentMarker(String name, String prefix) {
        return environmentMarker(name, prefix, "");
    }

    private static String environmentMarker(
            String name,
            String prefix,
            String suffix) {
        String value = System.getenv(name);
        return value == null || value.isBlank()
                ? prefix + UUID.randomUUID() + suffix
                : value;
    }

    private static Path javaExecutable() {
        return Path.of(
                System.getProperty("java.home"),
                "bin",
                isWindows() ? "java.exe" : "java");
    }

    private static boolean isWindows() {
        return System.getProperty("os.name").toLowerCase().contains("win");
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
                        "CGF-2B.3.2 response is not JSON",
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
            String publicKey,
            String runCanary,
            String leakageCanary,
            String credentialCanary,
            String outputCanary,
            String headerCanary,
            String providerEndpointCanary,
            String absolutePathCanary) {

        List<String> sensitiveCanaries() {
            return List.of(
                    runCanary,
                    leakageCanary,
                    credentialCanary,
                    outputCanary,
                    headerCanary,
                    providerEndpointCanary,
                    absolutePathCanary);
        }
    }

    private record ClosureScenario(
            String mode,
            String version,
            String expectedStatus,
            String expectedErrorCode) {}

    private static final class NodeProcess implements AutoCloseable {

        private final String nodeId;
        private final int port;
        private final Process process;
        private final Thread drainer;
        private final BoundedProcessOutput output;

        private NodeProcess(
                String nodeId,
                int port,
                Process process,
                Thread drainer,
                BoundedProcessOutput output) {
            this.nodeId = nodeId;
            this.port = port;
            this.process = process;
            this.drainer = drainer;
            this.output = output;
        }

        static NodeProcess start(
                String nodeId,
                HarnessEnvironment environment,
                URI relayEndpoint,
                BindingMode bindingMode,
                List<BoundedProcessOutput> capturedOutputs) throws Exception {
            int port = availablePort();
            List<String> command = new ArrayList<>();
            command.add(javaExecutable().toString());
            command.add("-cp");
            command.add(classPath());
            command.add(Cgf2b32HarnessNodeMain.class.getName());
            command.add("--server.address=127.0.0.1");
            command.add("--server.port=" + port);
            command.add("--logging.level.root=WARN");
            command.add("--management.tracing.sampling.probability=1.0");
            command.add("--mybatis-plus.mapper-locations=classpath*:mybatis/*Mapper.xml");
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
            child.put("ROBOTHREE_CLUSTER_DEVICE_KEY_ID", environment.deviceKeyId());
            child.put(
                    "ROBOTHREE_CLUSTER_DEVICE_PUBLIC_KEY",
                    environment.publicKey());
            child.put("ROBOTHREE_CLUSTER_CLIENT_INSTANCE_ID", CLIENT_INSTANCE_ID);
            child.put("ROBOTHREE_CGF2B32_RELAY_ENDPOINT", relayEndpoint.toString());
            child.put("ROBOTHREE_CGF2B32_BINDING_MODE", bindingMode.name());
            child.put("ROBOTHREE_CGF2B32_RUN_CANARY", environment.runCanary());
            child.put(
                    "ROBOTHREE_CGF2B32_CREDENTIAL_MATERIAL",
                    environment.credentialCanary());
            Process process = builder.start();
            BoundedProcessOutput output = new BoundedProcessOutput(16_384);
            capturedOutputs.add(output);
            Thread drainer = drain(process, output, "cgf2b32-node-output-" + nodeId);
            NodeProcess node = new NodeProcess(nodeId, port, process, drainer, output);
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

        void kill() throws Exception {
            if (process.isAlive()) {
                process.destroyForcibly();
            }
            if (!process.waitFor(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("CGF-2B.3.2 node did not exit");
            }
            drainer.join(Duration.ofSeconds(2));
            assertThat(canConnect(port)).isFalse();
        }

        private void awaitReady() throws Exception {
            long deadline = System.nanoTime() + Duration.ofSeconds(40).toNanos();
            while (System.nanoTime() < deadline) {
                if (!process.isAlive()) {
                    throw new IllegalStateException(
                            "CGF-2B.3.2 node exited before readiness: "
                                    + nodeId
                                    + System.lineSeparator()
                                    + output.safeSummary());
                }
                try {
                    HttpResult response = get(this, "/cgf2b32-harness/node");
                    if (response.status() == 200
                            && nodeId.equals(response.json().path("nodeId").asText())) {
                        return;
                    }
                } catch (RuntimeException ignored) {
                    // Node is still starting.
                }
                Thread.sleep(100);
            }
            throw new IllegalStateException(
                    "CGF-2B.3.2 node did not become ready: "
                            + nodeId
                            + System.lineSeparator()
                            + output.safeSummary());
        }

        @Override
        public void close() {
            closeProcess(process, drainer);
        }
    }

    private static final class RelayProcess implements AutoCloseable {

        private final int providerPort;
        private final int controlPort;
        private final Process process;
        private final Thread drainer;
        private final BoundedProcessOutput output;

        private RelayProcess(
                int providerPort,
                int controlPort,
                Process process,
                Thread drainer,
                BoundedProcessOutput output) {
            this.providerPort = providerPort;
            this.controlPort = controlPort;
            this.process = process;
            this.drainer = drainer;
            this.output = output;
        }

        static RelayProcess start(
                HarnessEnvironment environment,
                List<BoundedProcessOutput> capturedOutputs)
                throws Exception {
            return startAt(0, 0, environment, capturedOutputs);
        }

        static RelayProcess startAt(
                int providerPort,
                int controlPort,
                HarnessEnvironment environment,
                List<BoundedProcessOutput> capturedOutputs) throws Exception {
            List<String> command = List.of(
                    javaExecutable().toString(),
                    "-cp",
                    classPath(),
                    Cgf2b32ControlledRelayMain.class.getName(),
                    "--provider-port=" + providerPort,
                    "--control-port=" + controlPort);
            ProcessBuilder builder = new ProcessBuilder(command);
            builder.redirectErrorStream(true);
            builder.environment().put(
                    "ROBOTHREE_CGF2B32_CREDENTIAL_MATERIAL",
                    environment.credentialCanary());
            builder.environment().put(
                    "ROBOTHREE_CGF2B32_OUTPUT_CANARY",
                    environment.outputCanary());
            builder.environment().put(
                    "ROBOTHREE_CGF2B32_HEADER_CANARY",
                    environment.headerCanary());
            Process process = builder.start();
            BoundedProcessOutput output = new BoundedProcessOutput(8_192);
            capturedOutputs.add(output);
            Thread drainer = drain(process, output, "cgf2b32-relay-output");
            RelayPorts actualPorts = awaitRelayPorts(process, output);
            RelayProcess relay = new RelayProcess(
                    actualPorts.providerPort(),
                    actualPorts.controlPort(),
                    process,
                    drainer,
                    output);
            relay.awaitReady();
            return relay;
        }

        private static RelayPorts awaitRelayPorts(
                Process process,
                BoundedProcessOutput output) throws Exception {
            long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
            String prefix = "ROBOTHREE_CGF2B32_RELAY_READY=";
            while (System.nanoTime() < deadline) {
                if (!process.isAlive()) {
                    throw new IllegalStateException(
                            "controlled Relay exited before publishing its bound ports"
                                    + System.lineSeparator()
                                    + output.safeSummary());
                }
                String readyLine = output.safeSummary()
                        .lines()
                        .filter(line -> line.startsWith(prefix))
                        .findFirst()
                        .orElse(null);
                if (readyLine != null) {
                    JsonNode ready = JSON.readTree(readyLine.substring(prefix.length()));
                    int actualProviderPort = ready.path("providerPort").asInt();
                    int actualControlPort = ready.path("controlPort").asInt();
                    assertThat(actualProviderPort).isBetween(1, 65_535);
                    assertThat(actualControlPort).isBetween(1, 65_535);
                    assertThat(actualProviderPort).isNotEqualTo(actualControlPort);
                    return new RelayPorts(actualProviderPort, actualControlPort);
                }
                Thread.sleep(25);
            }
            throw new IllegalStateException(
                    "controlled Relay did not publish its bound ports"
                            + System.lineSeparator()
                            + output.safeSummary());
        }

        URI endpoint() {
            return URI.create("http://127.0.0.1:" + providerPort + "/relay");
        }

        String controlBaseUrl() {
            return "http://127.0.0.1:" + controlPort;
        }

        int providerPort() {
            return providerPort;
        }

        int controlPort() {
            return controlPort;
        }

        long processId() {
            return process.pid();
        }

        private void awaitReady() throws Exception {
            long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
            while (System.nanoTime() < deadline) {
                if (!process.isAlive()) {
                    throw new IllegalStateException(
                            "controlled Relay exited before readiness"
                                    + System.lineSeparator()
                                    + output.safeSummary());
                }
                try {
                    if ("ready".equals(relayState(this).path("status").asText())) {
                        return;
                    }
                } catch (RuntimeException ignored) {
                    // Relay is still starting.
                }
                Thread.sleep(50);
            }
            throw new IllegalStateException(
                    "controlled Relay did not become ready"
                            + System.lineSeparator()
                            + output.safeSummary());
        }

        @Override
        public void close() {
            closeProcess(process, drainer);
        }

        private record RelayPorts(int providerPort, int controlPort) {}
    }

    private static Thread drain(
            Process process,
            BoundedProcessOutput output,
            String name) {
        return Thread.ofPlatform()
                .daemon(true)
                .name(name)
                .start(() -> {
                    try (var input = process.getInputStream()) {
                        byte[] buffer = new byte[1_024];
                        int read;
                        while ((read = input.read(buffer)) >= 0) {
                            output.append(buffer, read);
                        }
                    } catch (IOException ignored) {
                        // Process shutdown closes the stream.
                    }
                });
    }

    private static void closeProcess(Process process, Thread drainer) {
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
            drainer.join(Duration.ofSeconds(2));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
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
