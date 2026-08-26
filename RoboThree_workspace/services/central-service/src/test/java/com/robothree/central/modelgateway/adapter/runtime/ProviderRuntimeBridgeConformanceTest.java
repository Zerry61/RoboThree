package com.robothree.central.modelgateway.adapter.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.adapter.http.JdkModelAuthorizedHttpTransport;
import com.robothree.central.modelgateway.adapter.http.StrictModelOutboundEndpointPolicy;
import com.robothree.central.modelgateway.adapter.provider.AnthropicCompatibleModelProviderAdapter;
import com.robothree.central.modelgateway.adapter.provider.OpenAiCompatibleModelProviderAdapter;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.CredentialResolution;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Request;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Result;
import com.robothree.central.modelgateway.development.FixedSyntheticModelProviderRequestSource;
import com.robothree.central.modelgateway.port.ModelCredentialMaterialSource;
import com.robothree.central.modelgateway.port.ModelInvocationEphemeralPublisher;
import com.robothree.central.modelgateway.port.ModelProviderAdapter;
import com.robothree.central.shared.json.CanonicalJson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

class ProviderRuntimeBridgeConformanceTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final String E = "e".repeat(64);
    private static final String F = "f".repeat(64);
    private static final String CREDENTIAL = "runtime-bridge-credential-sentinel";

    @Test
    void connectsBothConnectionModesToBothExistingWireAdapters()
            throws Exception {
        try (StubServer server = new StubServer()) {
            server.respond(
                    "/base/chat/completions",
                    openAiStream());
            server.respond(
                    "/base/v1/messages",
                    anthropicStream());

            for (ConnectionMode connectionMode : ConnectionMode.values()) {
                Result openAi = invoke(
                        server,
                        Protocol.OPENAI_COMPATIBLE,
                        connectionMode);
                Result anthropic = invoke(
                        server,
                        Protocol.ANTHROPIC_COMPATIBLE,
                        connectionMode);

                assertThat(openAi).isEqualTo(anthropic);
                assertThat(openAi.usage().inputTokens()).isEqualTo(8);
                assertThat(openAi.usage().outputTokens()).isEqualTo(4);
                assertThat(openAi.finishReason()).isEqualTo("stop");
                assertThat(openAi.ephemeralTextDeltas()).isEmpty();
            }
        }
    }

    private static Result invoke(
            StubServer server,
            Protocol protocol,
            ConnectionMode connectionMode) {
        String canonicalRequest = providerNeutralRequest();
        FixedSyntheticModelProviderRequestSource source =
                new FixedSyntheticModelProviderRequestSource(
                        List.of(canonicalRequest));
        CredentialSource credentialSource = new CredentialSource();
        JdkModelAuthorizedHttpTransport transport =
                new JdkModelAuthorizedHttpTransport(
                        HttpClient.newBuilder()
                                .followRedirects(HttpClient.Redirect.NEVER)
                                .connectTimeout(Duration.ofSeconds(1))
                                .build(),
                        credentialSource,
                        new StrictModelOutboundEndpointPolicy(
                                Set.of("127.0.0.1"),
                                host -> java.net.InetAddress.getAllByName(host),
                                true));
        ModelProviderAdapter adapter =
                protocol == Protocol.OPENAI_COMPATIBLE
                        ? new OpenAiCompatibleModelProviderAdapter(transport)
                        : new AnthropicCompatibleModelProviderAdapter(transport);
        RecordingPublisher publisher = new RecordingPublisher();
        ProviderBackedModelInvocationExecutionBackend backend =
                new ProviderBackedModelInvocationExecutionBackend(
                        source,
                        new StrictModelProviderAdapterRegistry(List.of(adapter)),
                        publisher);
        ModelEndpointBinding binding = binding(server, protocol, connectionMode);
        Result result = backend.execute(
                new Request(
                        UUID.randomUUID(),
                        CanonicalJson.sha256(canonicalRequest),
                        binding.modelId(),
                        binding,
                        new CredentialResolution(
                                binding.credentialReference(),
                                binding.credentialRevision()),
                        1,
                        Instant.now().plusSeconds(5),
                        Duration.ofSeconds(1)),
                () -> false);

        assertThat(publisher.deltas).containsExactly("第一段", "第二段");
        assertThat(publisher.clearCount).isEqualTo(1);
        assertThat(credentialSource.material).containsOnly('\0');
        assertThat(server.lastRequestBody())
                .contains("\"model\":\""
                        + (connectionMode == ConnectionMode.CUSTOM_RELAY
                                ? "relay.upstream-model"
                                : "model.synthetic")
                        + "\"");
        return result;
    }

    private static ModelEndpointBinding binding(
            StubServer server,
            Protocol protocol,
            ConnectionMode connectionMode) {
        return new ModelEndpointBinding(
                "binding.synthetic",
                A,
                B,
                "model.synthetic",
                connectionMode == ConnectionMode.CUSTOM_RELAY
                        ? "relay.upstream-model"
                        : "model.synthetic",
                C,
                D,
                E,
                connectionMode,
                protocol,
                server.baseUri(),
                "credential.synthetic",
                F,
                A,
                B,
                RecoveryMode.MANUAL_RECONCILIATION);
    }

    private static String providerNeutralRequest() {
        ObjectNode root = JSON.createObjectNode();
        root.put("snapshotId", "11111111-1111-4111-8111-111111111111");
        root.put("contextSourceDigest", A);
        ObjectNode model = root.putObject("model");
        model.put("modelId", "model.synthetic");
        model.put("modelRevision", C);
        model.put("configurationRevision", D);
        model.put("runtimeRegistryGeneration", E);
        ObjectNode message = root.putArray("messages").addObject();
        message.put("role", "user");
        message.putArray("content")
                .addObject()
                .put("type", "text")
                .put("text", "固定非敏感测试输入");
        root.putArray("tools");
        root.put("maxOutputTokens", 64);
        return CanonicalJson.canonicalize(root);
    }

    private static String openAiStream() {
        return "data: {\"choices\":[{\"delta\":{\"content\":\"第一段\"},"
                + "\"finish_reason\":null}]}\n\n"
                + "data: {\"choices\":[{\"delta\":{\"content\":\"第二段\"},"
                + "\"finish_reason\":null}]}\n\n"
                + "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],"
                + "\"usage\":{\"prompt_tokens\":8,\"completion_tokens\":4}}\n\n"
                + "data: [DONE]\n\n";
    }

    private static String anthropicStream() {
        return "event: message_start\n"
                + "data: {\"type\":\"message_start\",\"message\":{\"usage\":"
                + "{\"input_tokens\":8}}}\n\n"
                + "event: content_block_delta\n"
                + "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":"
                + "{\"type\":\"text_delta\",\"text\":\"第一段\"}}\n\n"
                + "event: content_block_delta\n"
                + "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":"
                + "{\"type\":\"text_delta\",\"text\":\"第二段\"}}\n\n"
                + "event: message_delta\n"
                + "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":"
                + "\"end_turn\"},\"usage\":{\"output_tokens\":4}}\n\n"
                + "event: message_stop\n"
                + "data: {\"type\":\"message_stop\"}\n\n";
    }

    private static final class CredentialSource
            implements ModelCredentialMaterialSource {

        private char[] material;

        @Override
        public char[] resolve(String reference, String revision) {
            material = CREDENTIAL.toCharArray();
            return material;
        }
    }

    private static final class RecordingPublisher
            implements ModelInvocationEphemeralPublisher {

        private final List<String> deltas = new ArrayList<>();
        private int clearCount;

        @Override
        public void publishText(UUID invocationId, String delta) {
            deltas.add(delta);
        }

        @Override
        public void clear(UUID invocationId) {
            clearCount++;
        }
    }

    private static final class StubServer implements AutoCloseable {

        private final HttpServer server;
        private final ExecutorService executor;
        private volatile String lastRequestBody;

        private StubServer() throws IOException {
            server = HttpServer.create(
                    new InetSocketAddress("127.0.0.1", 0),
                    0);
            executor = Executors.newCachedThreadPool();
            server.setExecutor(executor);
            server.start();
        }

        private void respond(String path, String stream) {
            server.createContext(path, exchange -> send(exchange, stream));
        }

        private URI baseUri() {
            return URI.create(
                    "http://127.0.0.1:"
                            + server.getAddress().getPort()
                            + "/base");
        }

        private String lastRequestBody() {
            return lastRequestBody;
        }

        @Override
        public void close() {
            server.stop(0);
            executor.shutdownNow();
        }

        private void send(
                HttpExchange exchange,
                String stream) throws IOException {
            lastRequestBody = new String(
                    exchange.getRequestBody().readAllBytes(),
                    StandardCharsets.UTF_8);
            byte[] bytes = stream.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set(
                    "Content-Type",
                    "text/event-stream; charset=utf-8");
            exchange.sendResponseHeaders(200, bytes.length);
            try (var output = exchange.getResponseBody()) {
                output.write(bytes);
            } finally {
                exchange.close();
            }
        }
    }
}
