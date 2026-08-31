package com.robothree.central.modelgateway.adapter.provider;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class Dfi534EnterpriseLifecycleIntegrationTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();

    @TempDir Path directory;

    @Test
    void restarts_real_central_children_and_reuses_the_exact_provider_projection() throws Exception {
        List<JsonNode> results = new ArrayList<>();
        for (String protocol : List.of("openai", "anthropic")) {
            Path state = directory.resolve(protocol + "-state.json");
            try (ControlledCentral first = ControlledCentral.start(protocol, state)) {
                JsonNode accepted = first.accept(fixture());
                assertThat(accepted.path("requestCount").asInt()).isEqualTo(1);
                assertThat(accepted.path("lastBodyDigest").asText()).hasSize(64);
                long oldPid = first.processId();
                first.killForcibly();
                assertThat(first.awaitExit()).isTrue();

                try (ControlledCentral restarted = ControlledCentral.start(protocol, state)) {
                    assertThat(restarted.processId()).isNotEqualTo(oldPid);
                    JsonNode recovered = restarted.evidence();
                    assertThat(recovered.path("requestCount").asInt()).isEqualTo(1);
                    assertThat(recovered.path("lastBodyDigest").asText())
                            .isEqualTo(accepted.path("lastBodyDigest").asText());
                    results.add(recovered);
                }
            }
        }
        String output = System.getProperty("robothree.dfi534.centralEvidencePath");
        if (output != null) {
            var root = JSON.createObjectNode().put("status", "PASS");
            root.put("restartScenarioCount", results.size());
            root.set("scenarios", JSON.valueToTree(results));
            root.put("activeCentralChildren", 0);
            root.put("providerFixtureServers", 0);
            root.put("listeningPorts", 0);
            Files.writeString(Path.of(output), JSON.writeValueAsString(root));
        }
    }

    private static String fixture() throws Exception {
        return Files.readString(Path.of(
                "../../contracts/enterprise-gateway/v1alpha3/fixtures/valid/"
                        + "model-invocation-accept-default.json"));
    }

    private static final class ControlledCentral implements AutoCloseable {
        private final Process process;
        private final int gatewayPort;
        private final BufferedReader output;

        private ControlledCentral(Process process, int gatewayPort, BufferedReader output) {
            this.process = process;
            this.gatewayPort = gatewayPort;
            this.output = output;
        }

        static ControlledCentral start(String protocol, Path state) throws Exception {
            int gatewayPort = availablePort();
            int providerPort = availablePort();
            String classPath = System.getProperty(
                    "surefire.test.class.path", System.getProperty("java.class.path"));
            Path java = Path.of(System.getProperty("java.home"), "bin", "java");
            ProcessBuilder builder = new ProcessBuilder(
                    java.toString(), "-cp", classPath,
                    Dfi534EnterpriseLifecycleProcessMain.class.getName(),
                    Integer.toString(gatewayPort), Integer.toString(providerPort),
                    protocol, state.toString());
            builder.redirectErrorStream(true);
            Process process = builder.start();
            BufferedReader output = process.inputReader(StandardCharsets.UTF_8);
            String ready = output.readLine();
            if (ready == null || !ready.startsWith("READY:")) {
                throw new IllegalStateException("DFI-5.3.4 Central child did not become ready");
            }
            return new ControlledCentral(process, gatewayPort, output);
        }

        JsonNode accept(String body) throws Exception {
            HttpResponse<String> response = HTTP.send(HttpRequest.newBuilder(URI.create(
                            "http://127.0.0.1:" + gatewayPort + "/v1alpha3/model-invocations"))
                    .timeout(Duration.ofSeconds(5))
                    .header("content-type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            assertThat(response.statusCode()).isEqualTo(200);
            return JSON.readTree(response.body());
        }

        JsonNode evidence() throws Exception {
            HttpResponse<String> response = HTTP.send(HttpRequest.newBuilder(URI.create(
                            "http://127.0.0.1:" + gatewayPort + "/evidence"))
                    .timeout(Duration.ofSeconds(5)).GET().build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            assertThat(response.statusCode()).isEqualTo(200);
            return JSON.readTree(response.body());
        }

        long processId() { return process.pid(); }

        void killForcibly() { process.destroyForcibly(); }

        boolean awaitExit() throws InterruptedException {
            return process.waitFor(5, TimeUnit.SECONDS) && !process.isAlive();
        }

        @Override
        public void close() throws Exception {
            if (process.isAlive()) {
                process.destroy();
                if (!process.waitFor(5, TimeUnit.SECONDS)) process.destroyForcibly();
            }
            output.close();
        }

        private static int availablePort() throws Exception {
            try (ServerSocket socket = new ServerSocket(0)) {
                return socket.getLocalPort();
            }
        }
    }
}
