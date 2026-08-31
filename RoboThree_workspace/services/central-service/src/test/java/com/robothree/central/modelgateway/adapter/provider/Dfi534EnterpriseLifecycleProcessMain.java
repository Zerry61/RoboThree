package com.robothree.central.modelgateway.adapter.provider;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.adapter.http.ModelInvocationHttpMapper;
import com.robothree.central.modelgateway.domain.ProviderReasoningProjection;
import com.robothree.central.shared.json.CanonicalJson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.Executors;

/** Process-isolated Central/Gateway and Provider fixture for DFI-5.3.4 only. */
public final class Dfi534EnterpriseLifecycleProcessMain {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();
    private static final int MAX_BYTES = 4_194_304;
    private static int requestCount;
    private static String lastBodyDigest;

    private Dfi534EnterpriseLifecycleProcessMain() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 4) {
            throw new IllegalArgumentException("gatewayPort providerPort protocol statePath required");
        }
        int gatewayPort = Integer.parseInt(args[0]);
        int providerPort = Integer.parseInt(args[1]);
        String protocol = args[2];
        Path statePath = Path.of(args[3]);
        loadState(statePath);

        HttpServer provider = HttpServer.create(
                new InetSocketAddress("127.0.0.1", providerPort), 0);
        provider.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        provider.createContext("/invoke", exchange -> provider(exchange, protocol));

        HttpServer gateway = HttpServer.create(
                new InetSocketAddress("127.0.0.1", gatewayPort), 0);
        gateway.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        gateway.createContext("/health", exchange -> json(exchange, 200,
                JSON.createObjectNode().put("status", "ready")));
        gateway.createContext("/evidence", exchange -> json(exchange, 200, evidence(protocol)));
        gateway.createContext("/v1alpha3/model-invocations", exchange ->
                gateway(exchange, providerPort, protocol, statePath));
        provider.start();
        gateway.start();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            gateway.stop(0);
            provider.stop(0);
        }));
        System.out.println("READY:" + ProcessHandle.current().pid());
        System.out.flush();
        Thread.currentThread().join();
    }

    private static void gateway(
            HttpExchange exchange,
            int providerPort,
            String protocol,
            Path statePath) throws IOException {
        try {
            ObjectNode document = readObject(exchange);
            var parsed = ModelInvocationHttpMapper.parseAcceptV1Alpha3(document);
            ObjectNode body = CanonicalJson.parseObject(
                    parsed.canonicalProviderRequestJson(), MAX_BYTES);
            body.put("max_tokens", 8192);
            ProviderReasoningProjection projection;
            Class<?> adapter;
            if ("openai".equals(protocol)) {
                projection = new ProviderReasoningProjection.OpenAiEffort(
                        "a".repeat(64), "a".repeat(64),
                        ProviderReasoningProjection.Effort.XHIGH);
                adapter = OpenAiCompatibleModelProviderAdapter.class;
            } else if ("anthropic".equals(protocol)) {
                projection = new ProviderReasoningProjection.AnthropicThinkingBudget(
                        "b".repeat(64), "b".repeat(64), 4096);
                adapter = AnthropicCompatibleModelProviderAdapter.class;
            } else {
                throw new IllegalArgumentException("unknown protocol");
            }
            Method method = adapter.getDeclaredMethod(
                    "projectReasoning", ObjectNode.class, ProviderReasoningProjection.class);
            method.setAccessible(true);
            method.invoke(null, body, projection);
            String canonicalBody = CanonicalJson.canonicalize(body);
            HttpResponse<String> response = HTTP.send(
                    HttpRequest.newBuilder(URI.create(
                                    "http://127.0.0.1:" + providerPort + "/invoke"))
                            .timeout(Duration.ofSeconds(3))
                            .header("content-type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(canonicalBody))
                            .build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() != 200) throw new IllegalStateException("provider rejected");
            requestCount += 1;
            lastBodyDigest = CanonicalJson.sha256(canonicalBody);
            persistState(statePath);
            json(exchange, 200, evidence(protocol));
        } catch (Exception error) {
            json(exchange, 422, JSON.createObjectNode().put("errorCode", "dfi534_gateway_rejected"));
        }
    }

    private static void provider(HttpExchange exchange, String protocol) throws IOException {
        ObjectNode body = readObject(exchange);
        boolean correct = "openai".equals(protocol)
                ? body.path("reasoning_effort").asText().equals("xhigh")
                : body.path("thinking").path("budget_tokens").asInt() == 4096;
        if (!correct) {
            json(exchange, 422, JSON.createObjectNode().put("accepted", false));
            return;
        }
        json(exchange, 200, JSON.createObjectNode().put("accepted", true));
    }

    private static ObjectNode evidence(String protocol) {
        ObjectNode body = JSON.createObjectNode();
        body.put("processId", ProcessHandle.current().pid());
        body.put("protocol", protocol);
        body.put("requestCount", requestCount);
        if (lastBodyDigest == null) body.putNull("lastBodyDigest");
        else body.put("lastBodyDigest", lastBodyDigest);
        body.put("activeCentralChildren", 1);
        body.put("providerFixtureServers", 1);
        body.put("listeningPorts", 2);
        return body;
    }

    private static void loadState(Path path) throws IOException {
        if (!Files.exists(path)) return;
        ObjectNode state = (ObjectNode) JSON.readTree(Files.readString(path));
        requestCount = state.path("requestCount").asInt();
        if (state.hasNonNull("lastBodyDigest")) lastBodyDigest = state.path("lastBodyDigest").asText();
    }

    private static void persistState(Path path) throws IOException {
        ObjectNode state = JSON.createObjectNode().put("requestCount", requestCount);
        if (lastBodyDigest == null) state.putNull("lastBodyDigest");
        else state.put("lastBodyDigest", lastBodyDigest);
        Files.writeString(path, CanonicalJson.canonicalize(state), StandardCharsets.UTF_8);
    }

    private static ObjectNode readObject(HttpExchange exchange) throws IOException {
        byte[] bytes = exchange.getRequestBody().readNBytes(MAX_BYTES + 1);
        if (bytes.length > MAX_BYTES) throw new IllegalArgumentException("body too large");
        return CanonicalJson.parseObject(new String(bytes, StandardCharsets.UTF_8), MAX_BYTES);
    }

    private static void json(HttpExchange exchange, int status, ObjectNode body) throws IOException {
        byte[] bytes = CanonicalJson.canonicalize(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("content-type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
