package com.robothree.central.modelgateway.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.json.CanonicalJson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Process-isolated deterministic Provider used only by the ARH-3.2.3 closure harness. */
public final class Arh323ControlledProviderProcessMain {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_REQUEST_BYTES = 1_048_576;
    private static final AtomicInteger REQUEST_COUNT = new AtomicInteger();
    private static final AtomicReference<Evidence> LAST = new AtomicReference<>();

    private Arh323ControlledProviderProcessMain() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("port and scenario required");
        int port = Integer.parseInt(args[0]);
        Scenario scenario = Scenario.valueOf(args[1]);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.createContext("/health", exchange -> json(exchange, 200,
                JSON.createObjectNode().put("status", "ready")));
        server.createContext("/evidence", exchange -> {
            Evidence evidence = LAST.get();
            ObjectNode body = JSON.createObjectNode();
            body.put("requestCount", REQUEST_COUNT.get());
            if (evidence == null) {
                body.putNull("protocol");
                body.putNull("requestBodyDigest");
                body.put("cacheMarkerCount", 0);
                body.put("promptCacheKeyPresent", false);
                body.put("forbiddenRetentionPresent", false);
            } else {
                body.put("protocol", evidence.protocol());
                body.put("requestBodyDigest", evidence.requestBodyDigest());
                body.put("cacheMarkerCount", evidence.cacheMarkerCount());
                body.put("promptCacheKeyPresent", evidence.promptCacheKeyPresent());
                body.put("forbiddenRetentionPresent", evidence.forbiddenRetentionPresent());
            }
            json(exchange, 200, body);
        });
        server.createContext("/base/v1/messages", exchange -> provider(
                exchange,
                "anthropic_compatible",
                scenario));
        server.createContext("/base/chat/completions", exchange -> provider(
                exchange,
                "openai_compatible",
                scenario));
        server.start();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(0)));
        Thread.currentThread().join();
    }

    private static void provider(
            HttpExchange exchange,
            String protocol,
            Scenario scenario) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            exchange.close();
            return;
        }
        byte[] bytes = exchange.getRequestBody().readNBytes(MAX_REQUEST_BYTES + 1);
        if (bytes.length > MAX_REQUEST_BYTES) {
            exchange.sendResponseHeaders(413, -1);
            exchange.close();
            return;
        }
        ObjectNode request = CanonicalJson.parseObject(
                new String(bytes, StandardCharsets.UTF_8),
                MAX_REQUEST_BYTES);
        LAST.set(evidence(protocol, request));
        REQUEST_COUNT.incrementAndGet();
        switch (scenario) {
            case SUCCESS -> stream(exchange, success(protocol));
            case ACCEPT_NO_OUTPUT -> stream(exchange, "");
            case PARTIAL_OUTPUT -> stream(exchange, partial(protocol));
            case DETERMINISTIC_REJECT -> json(exchange, 400,
                    JSON.createObjectNode().put("error", "synthetic_reject"));
            case DELAYED_SUCCESS -> {
                try {
                    Thread.sleep(Duration.ofMillis(400));
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
                stream(exchange, success(protocol));
            }
        }
    }

    private static Evidence evidence(String protocol, ObjectNode request) {
        String canonical = CanonicalJson.canonicalize(request);
        int markerCount = countField(request, "cache_control");
        boolean forbiddenRetention = canonical.contains("\"ttl\"")
                || canonical.contains("prompt_cache_retention");
        return new Evidence(
                protocol,
                CanonicalJson.sha256(canonical),
                markerCount,
                request.has("prompt_cache_key"),
                forbiddenRetention);
    }

    private static int countField(JsonNode value, String name) {
        int count = value.isObject() && value.has(name) ? 1 : 0;
        if (value.isContainerNode()) {
            for (JsonNode child : value) count += countField(child, name);
        }
        return count;
    }

    private static String success(String protocol) {
        if ("anthropic_compatible".equals(protocol)) {
            return "event: message_start\n"
                    + "data: {\"type\":\"message_start\",\"message\":{\"usage\":{"
                    + "\"input_tokens\":8,\"cache_read_input_tokens\":3,"
                    + "\"cache_creation_input_tokens\":2}}}\n\n"
                    + "event: content_block_delta\n"
                    + "data: {\"type\":\"content_block_delta\",\"index\":0,"
                    + "\"delta\":{\"type\":\"text_delta\",\"text\":\"ok\"}}\n\n"
                    + "event: message_delta\n"
                    + "data: {\"type\":\"message_delta\",\"delta\":{"
                    + "\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":4}}\n\n"
                    + "event: message_stop\n"
                    + "data: {\"type\":\"message_stop\"}\n\n";
        }
        return "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"},"
                + "\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":8,"
                + "\"completion_tokens\":4,\"prompt_tokens_details\":{"
                + "\"cached_tokens\":3}}}\n\n"
                + "data: [DONE]\n\n";
    }

    private static String partial(String protocol) {
        if ("anthropic_compatible".equals(protocol)) {
            return "event: content_block_delta\n"
                    + "data: {\"type\":\"content_block_delta\",\"index\":0,"
                    + "\"delta\":{\"type\":\"text_delta\",\"text\":\"partial\"}}\n\n";
        }
        return "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"},"
                + "\"finish_reason\":null}]}\n\n";
    }

    private static void stream(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
        exchange.sendResponseHeaders(200, bytes.length == 0 ? -1 : bytes.length);
        if (bytes.length > 0) exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static void json(HttpExchange exchange, int status, ObjectNode body)
            throws IOException {
        byte[] bytes = CanonicalJson.canonicalize(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    enum Scenario {
        SUCCESS,
        ACCEPT_NO_OUTPUT,
        PARTIAL_OUTPUT,
        DETERMINISTIC_REJECT,
        DELAYED_SUCCESS
    }

    private record Evidence(
            String protocol,
            String requestBodyDigest,
            int cacheMarkerCount,
            boolean promptCacheKeyPresent,
            boolean forbiddenRetentionPresent) {}
}
