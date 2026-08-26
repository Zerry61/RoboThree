package com.robothree.central.shared.observability;

import static org.assertj.core.api.Assertions.assertThat;

import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.export.SpanExporter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "management.tracing.sampling.probability=1.0",
            "management.otlp.tracing.export.enabled=false",
            "management.tracing.opentelemetry.export.schedule-delay=10ms",
            "management.tracing.opentelemetry.export.timeout=100ms"
        })
@Import(CentralTracingExporterFailureIntegrationTest.ExporterConfiguration.class)
@AutoConfigureObservability
class CentralTracingExporterFailureIntegrationTest {

    private static final String SECRET_TOKEN = "Bearer exporter-secret-token";
    private static final String SECRET_PROMPT = "exporter-secret-prompt";
    private static final String SECRET_CREDENTIAL = "credential-secret-reference";
    private static final String SECRET_RESULT = "assistant-secret-result";

    @LocalServerPort
    private int port;

    @Autowired
    private CentralObservationRunner observations;

    @Autowired
    private RecordingFailingSpanExporter exporter;

    @Test
    void exporterFailureDoesNotBlockBusinessAndSpansRemainSafe() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(
                        "http://127.0.0.1:" + port + "/foundation/readiness?prompt="
                                + SECRET_PROMPT))
                .header("Authorization", SECRET_TOKEN)
                .header("X-Test-Credential", SECRET_CREDENTIAL)
                .GET()
                .build();
        HttpResponse<String> response = HttpClient.newHttpClient().send(
                request,
                HttpResponse.BodyHandlers.ofString());
        HttpResponse<String> unauthorized = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder()
                        .uri(URI.create(
                                "http://127.0.0.1:" + port + "/v1alpha1/configuration"))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        String applicationResult = observations.observe(
                CentralObservedOperation.READ_CONFIGURATION,
                () -> SECRET_RESULT);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(unauthorized.statusCode()).isEqualTo(401);
        assertThat(response.headers()
                        .firstValue(CentralTraceContext.TRACE_ID_HEADER)
                        .orElse(null))
                .matches("[0-9a-f]{32}");
        assertThat(applicationResult).isEqualTo(SECRET_RESULT);

        assertThat(exporter.awaitContaining(
                        "robothree.central.application.read-configuration",
                        "robothree.error_code=\"access_token_invalid\"",
                        Duration.ofSeconds(3)))
                .isTrue();
        String exported = exporter.snapshot().toString();
        assertThat(exported)
                .contains("robothree.central.application.read-configuration")
                .contains("robothree.error_code=\"access_token_invalid\"")
                .doesNotContain(SECRET_TOKEN)
                .doesNotContain("exporter-secret-token")
                .doesNotContain(SECRET_PROMPT)
                .doesNotContain(SECRET_CREDENTIAL)
                .doesNotContain(SECRET_RESULT);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ExporterConfiguration {

        @Bean
        RecordingFailingSpanExporter recordingFailingSpanExporter() {
            return new RecordingFailingSpanExporter();
        }
    }

    static final class RecordingFailingSpanExporter implements SpanExporter {

        private final CopyOnWriteArrayList<SpanData> spans = new CopyOnWriteArrayList<>();

        @Override
        public CompletableResultCode export(Collection<SpanData> batch) {
            spans.addAll(batch);
            return CompletableResultCode.ofFailure();
        }

        @Override
        public CompletableResultCode flush() {
            return CompletableResultCode.ofSuccess();
        }

        @Override
        public CompletableResultCode shutdown() {
            return CompletableResultCode.ofSuccess();
        }

        boolean awaitContaining(String operation, String errorCode, Duration timeout) {
            long deadline = System.nanoTime() + timeout.toNanos();
            while (System.nanoTime() < deadline) {
                String snapshot = spans.toString();
                if (snapshot.contains(operation) && snapshot.contains(errorCode)) {
                    return true;
                }
                try {
                    Thread.sleep(20);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    return false;
                }
            }
            String snapshot = spans.toString();
            return snapshot.contains(operation) && snapshot.contains(errorCode);
        }

        List<SpanData> snapshot() {
            return List.copyOf(spans);
        }
    }
}
