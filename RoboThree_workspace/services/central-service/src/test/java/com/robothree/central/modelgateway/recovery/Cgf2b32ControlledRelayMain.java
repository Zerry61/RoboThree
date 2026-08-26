package com.robothree.central.modelgateway.recovery;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.json.CanonicalJson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class Cgf2b32ControlledRelayMain {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAXIMUM_REQUEST_BYTES = 64 * 1_024;
    private static final Duration BLOCK_DEADLINE = Duration.ofSeconds(45);

    private final HttpServer providerServer;
    private final HttpServer controlServer;
    private final ExecutorService providerExecutor;
    private final ExecutorService controlExecutor;
    private final String credentialMaterial;
    private final String outputCanary;
    private final String headerCanary;
    private final AtomicReference<Session> session =
            new AtomicReference<>(new Session(Mode.COMPLETE));
    private final AtomicInteger requestCount = new AtomicInteger();
    private final AtomicInteger lifetimeRequestCount = new AtomicInteger();
    private final AtomicInteger deltaCount = new AtomicInteger();
    private final AtomicInteger terminalCount = new AtomicInteger();
    private final AtomicInteger activeRequests = new AtomicInteger();
    private final AtomicInteger openAiRequestCount = new AtomicInteger();
    private final AtomicInteger anthropicRequestCount = new AtomicInteger();
    private final AtomicInteger redirectTargetCount = new AtomicInteger();
    private final AtomicInteger redirectCredentialCount = new AtomicInteger();
    private final AtomicReference<String> requestDigest = new AtomicReference<>("");

    private Cgf2b32ControlledRelayMain(
            int providerPort,
            int controlPort,
            String credentialMaterial,
            String outputCanary,
            String headerCanary) throws IOException {
        this.credentialMaterial = requiredCanary(
                credentialMaterial,
                "credential material");
        this.outputCanary = requiredCanary(outputCanary, "output canary");
        this.headerCanary = requiredCanary(headerCanary, "header canary");
        providerServer = HttpServer.create(
                new InetSocketAddress("127.0.0.1", providerPort),
                0);
        controlServer = HttpServer.create(
                new InetSocketAddress("127.0.0.1", controlPort),
                0);
        providerExecutor = Executors.newSingleThreadExecutor(runnable ->
                Thread.ofPlatform()
                        .name("cgf2b32-relay-provider")
                        .unstarted(runnable));
        controlExecutor = Executors.newSingleThreadExecutor(runnable ->
                Thread.ofPlatform()
                        .name("cgf2b32-relay-control")
                        .unstarted(runnable));
        providerServer.setExecutor(providerExecutor);
        controlServer.setExecutor(controlExecutor);
        providerServer.createContext("/relay/chat/completions", this::openAi);
        providerServer.createContext("/relay/v1/messages", this::anthropic);
        providerServer.createContext("/redirect-target", this::redirectTarget);
        controlServer.createContext("/control/state", this::state);
        controlServer.createContext("/control/reset", this::reset);
        controlServer.createContext("/control/release", this::release);
    }

    public static void main(String[] args) throws Exception {
        Map<String, String> arguments = arguments(args);
        int providerPort = port(arguments, "provider-port");
        int controlPort = port(arguments, "control-port");
        Cgf2b32ControlledRelayMain relay =
                new Cgf2b32ControlledRelayMain(
                        providerPort,
                        controlPort,
                        requiredEnvironment("ROBOTHREE_CGF2B32_CREDENTIAL_MATERIAL"),
                        requiredEnvironment("ROBOTHREE_CGF2B32_OUTPUT_CANARY"),
                        requiredEnvironment("ROBOTHREE_CGF2B32_HEADER_CANARY"));
        relay.start();
        Runtime.getRuntime().addShutdownHook(
                Thread.ofPlatform().unstarted(relay::close));
        System.out.println("ROBOTHREE_CGF2B32_RELAY_READY={\"status\":\"ready\","
                + "\"providerPort\":"
                + relay.providerServer.getAddress().getPort() + ","
                + "\"controlPort\":"
                + relay.controlServer.getAddress().getPort() + ","
                + "\"processId\":" + ProcessHandle.current().pid() + "}");
        new CountDownLatch(1).await();
    }

    private void start() {
        providerServer.start();
        controlServer.start();
    }

    private void close() {
        session.get().release().countDown();
        providerServer.stop(0);
        controlServer.stop(0);
        providerExecutor.shutdownNow();
        controlExecutor.shutdownNow();
    }

    private void openAi(HttpExchange exchange) throws IOException {
        openAiRequestCount.incrementAndGet();
        serve(
                exchange,
                "data: {\"choices\":[{\"delta\":{\"content\":\""
                        + outputCanary + "\"},"
                        + "\"finish_reason\":null}]}\n\n",
                "data: {\"choices\":[{\"delta\":{\"content\":\"beta\"},"
                        + "\"finish_reason\":null}]}\n\n"
                        + "data: {\"choices\":[{\"delta\":{},\"finish_reason\":"
                        + "\"stop\"}],\"usage\":{\"prompt_tokens\":8,"
                        + "\"completion_tokens\":4}}\n\n"
                        + "data: [DONE]\n\n");
    }

    private void anthropic(HttpExchange exchange) throws IOException {
        anthropicRequestCount.incrementAndGet();
        serve(
                exchange,
                "event: message_start\n"
                        + "data: {\"type\":\"message_start\",\"message\":{"
                        + "\"usage\":{\"input_tokens\":8}}}\n\n"
                        + "event: content_block_delta\n"
                        + "data: {\"type\":\"content_block_delta\",\"index\":0,"
                        + "\"delta\":{\"type\":\"text_delta\","
                        + "\"text\":\"" + outputCanary + "\"}}\n\n",
                "event: content_block_delta\n"
                        + "data: {\"type\":\"content_block_delta\",\"index\":0,"
                        + "\"delta\":{\"type\":\"text_delta\","
                        + "\"text\":\"beta\"}}\n\n"
                        + "event: message_delta\n"
                        + "data: {\"type\":\"message_delta\",\"delta\":{"
                        + "\"stop_reason\":\"end_turn\"},\"usage\":{"
                        + "\"output_tokens\":4}}\n\n"
                        + "event: message_stop\n"
                        + "data: {\"type\":\"message_stop\"}\n\n");
    }

    private void serve(
            HttpExchange exchange,
            String firstFrames,
            String remainingFrames) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            sendStatus(exchange, 405);
            return;
        }
        byte[] request = exchange.getRequestBody().readNBytes(
                MAXIMUM_REQUEST_BYTES + 1);
        if (request.length > MAXIMUM_REQUEST_BYTES
                || !authorized(exchange)) {
            sendStatus(exchange, 400);
            return;
        }
        requestCount.incrementAndGet();
        lifetimeRequestCount.incrementAndGet();
        requestDigest.set(CanonicalJson.sha256(
                new String(request, StandardCharsets.UTF_8)));
        activeRequests.incrementAndGet();
        Session active = session.get();
        if (active.mode() == Mode.REDIRECT) {
            exchange.getResponseHeaders().set(
                    "Location",
                    "http://127.0.0.1:"
                            + providerServer.getAddress().getPort()
                            + "/redirect-target");
            exchange.sendResponseHeaders(307, -1);
            activeRequests.decrementAndGet();
            exchange.close();
            return;
        }
        if (active.mode() == Mode.WRONG_CONTENT_TYPE) {
            exchange.getResponseHeaders().set(
                    "Content-Type",
                    "application/json; charset=utf-8");
            byte[] body = "{}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) {
                output.write(body);
            } finally {
                activeRequests.decrementAndGet();
                exchange.close();
            }
            return;
        }
        exchange.getResponseHeaders().set(
                "Content-Type",
                "text/event-stream; charset=utf-8");
        exchange.getResponseHeaders().set("X-RoboThree-Test", headerCanary);
        exchange.sendResponseHeaders(200, 0);
        try (var output = exchange.getResponseBody()) {
            if (active.mode() == Mode.RESET_CONNECTION) {
                return;
            }
            if (active.mode() == Mode.BLOCK_BEFORE_FIRST_DELTA) {
                awaitRelease(active);
            }
            if (active.mode() == Mode.MALFORMED_SSE) {
                write(output, "data: {invalid}\n\n");
                deltaCount.incrementAndGet();
                return;
            }
            if (active.mode() == Mode.OVERSIZED_FRAME) {
                write(output, "data: " + "x".repeat(262_145) + "\n\n");
                deltaCount.incrementAndGet();
                return;
            }
            deltaCount.incrementAndGet();
            write(output, firstFrames);
            if (active.mode() == Mode.INCOMPLETE_STREAM
                    || active.mode() == Mode.RESET_AFTER_FIRST_DELTA) {
                return;
            }
            if (active.mode() == Mode.BLOCK_AFTER_FIRST_DELTA) {
                awaitRelease(active);
            }
            deltaCount.incrementAndGet();
            write(output, remainingFrames);
            terminalCount.incrementAndGet();
            if (active.mode() == Mode.COMPLETE_THEN_HOLD_CONNECTION) {
                awaitRelease(active);
            }
        } catch (IOException ignored) {
            // A deliberately terminated Central node closes the provider stream.
        } finally {
            activeRequests.decrementAndGet();
            exchange.close();
        }
    }

    private void redirectTarget(HttpExchange exchange) throws IOException {
        redirectTargetCount.incrementAndGet();
        if (exchange.getRequestHeaders().containsKey("Authorization")
                || exchange.getRequestHeaders().containsKey("x-api-key")) {
            redirectCredentialCount.incrementAndGet();
        }
        sendStatus(exchange, 204);
    }

    private void state(HttpExchange exchange) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            sendStatus(exchange, 405);
            return;
        }
        sendJson(exchange, stateDocument());
    }

    private void reset(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            sendStatus(exchange, 405);
            return;
        }
        String requestedMode = queryValue(exchange.getRequestURI(), "mode");
        Mode mode;
        try {
            mode = Mode.valueOf(requestedMode);
        } catch (IllegalArgumentException exception) {
            sendStatus(exchange, 400);
            return;
        }
        session.get().release().countDown();
        session.set(new Session(mode));
        requestCount.set(0);
        deltaCount.set(0);
        terminalCount.set(0);
        openAiRequestCount.set(0);
        anthropicRequestCount.set(0);
        redirectTargetCount.set(0);
        redirectCredentialCount.set(0);
        requestDigest.set("");
        sendJson(exchange, stateDocument());
    }

    private void release(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            sendStatus(exchange, 405);
            return;
        }
        session.get().release().countDown();
        sendJson(exchange, stateDocument());
    }

    private ObjectNode stateDocument() {
        ObjectNode state = JSON.createObjectNode();
        state.put("status", "ready");
        state.put("mode", session.get().mode().name());
        state.put("requestCount", requestCount.get());
        state.put("lifetimeRequestCount", lifetimeRequestCount.get());
        state.put("deltaCount", deltaCount.get());
        state.put("terminalCount", terminalCount.get());
        state.put("activeRequests", activeRequests.get());
        state.put("openAiRequestCount", openAiRequestCount.get());
        state.put("anthropicRequestCount", anthropicRequestCount.get());
        state.put("redirectTargetCount", redirectTargetCount.get());
        state.put("redirectCredentialCount", redirectCredentialCount.get());
        state.put("requestDigest", requestDigest.get());
        return state;
    }

    private boolean authorized(HttpExchange exchange) {
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        String apiKey = exchange.getRequestHeaders().getFirst("x-api-key");
        return ("Bearer " + credentialMaterial)
                        .equals(authorization)
                || credentialMaterial.equals(apiKey);
    }

    private static void write(java.io.OutputStream output, String value)
            throws IOException {
        output.write(value.getBytes(StandardCharsets.UTF_8));
        output.flush();
    }

    private static void awaitRelease(Session active) throws IOException {
        try {
            if (!active.release().await(
                    BLOCK_DEADLINE.toMillis(),
                    java.util.concurrent.TimeUnit.MILLISECONDS)) {
                throw new IOException("controlled relay block deadline exceeded");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IOException("controlled relay block interrupted", exception);
        }
    }

    private static void sendJson(HttpExchange exchange, ObjectNode document)
            throws IOException {
        byte[] body = JSON.writeValueAsBytes(document);
        exchange.getResponseHeaders().set(
                "Content-Type",
                "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(200, body.length);
        try (var output = exchange.getResponseBody()) {
            output.write(body);
        } finally {
            exchange.close();
        }
    }

    private static void sendStatus(HttpExchange exchange, int status)
            throws IOException {
        exchange.sendResponseHeaders(status, -1);
        exchange.close();
    }

    private static String queryValue(URI uri, String name) {
        String query = uri.getRawQuery();
        if (query == null) {
            return "";
        }
        for (String part : query.split("&")) {
            String[] pair = part.split("=", 2);
            if (pair.length == 2 && name.equals(pair[0])) {
                return pair[1];
            }
        }
        return "";
    }

    private static Map<String, String> arguments(String[] args) {
        java.util.HashMap<String, String> values = new java.util.HashMap<>();
        for (String argument : args) {
            if (!argument.startsWith("--") || !argument.contains("=")) {
                throw new IllegalArgumentException("controlled relay argument is invalid");
            }
            int separator = argument.indexOf('=');
            values.put(argument.substring(2, separator), argument.substring(separator + 1));
        }
        return Map.copyOf(values);
    }

    private static int port(Map<String, String> arguments, String name) {
        int value = Integer.parseInt(arguments.getOrDefault(name, "0"));
        if (value < 0 || value > 65_535) {
            throw new IllegalArgumentException("controlled relay port is invalid");
        }
        return value;
    }

    private static String requiredEnvironment(String name) {
        return requiredCanary(System.getenv(name), name);
    }

    private static String requiredCanary(String value, String name) {
        if (value == null || value.isBlank() || value.length() > 512) {
            throw new IllegalArgumentException(name + " is invalid");
        }
        return value;
    }

    enum Mode {
        COMPLETE,
        BLOCK_BEFORE_FIRST_DELTA,
        BLOCK_AFTER_FIRST_DELTA,
        COMPLETE_THEN_HOLD_CONNECTION,
        RESET_CONNECTION,
        RESET_AFTER_FIRST_DELTA,
        REDIRECT,
        WRONG_CONTENT_TYPE,
        MALFORMED_SSE,
        OVERSIZED_FRAME,
        INCOMPLETE_STREAM
    }

    private record Session(Mode mode, CountDownLatch release) {

        private Session(Mode mode) {
            this(mode, new CountDownLatch(1));
        }
    }
}
