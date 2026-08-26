package com.robothree.central.shared.observability;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.common.CompletableResultCode;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "management.tracing.sampling.probability=1.0",
            "management.otlp.tracing.export.enabled=true",
            "management.otlp.tracing.connect-timeout=100ms",
            "management.otlp.tracing.timeout=50ms",
            "management.tracing.opentelemetry.export.schedule-delay=10ms",
            "management.tracing.opentelemetry.export.timeout=100ms"
        })
@AutoConfigureObservability
@ExtendWith(OutputCaptureExtension.class)
class CentralTracingCollectorTimeoutIntegrationTest {

    private static final AtomicInteger EXPORT_ATTEMPTS = new AtomicInteger();
    private static final HttpServer SLOW_COLLECTOR = startSlowCollector();

    @LocalServerPort
    private int port;

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private OpenTelemetry openTelemetry;

    @DynamicPropertySource
    static void collectorEndpoint(DynamicPropertyRegistry registry) {
        registry.add(
                "management.otlp.tracing.endpoint",
                () -> "http://127.0.0.1:" + SLOW_COLLECTOR.getAddress().getPort()
                        + "/v1/traces");
    }

    @AfterAll
    static void stopCollector() {
        SLOW_COLLECTOR.stop(0);
    }

    @Test
    void slowCollectorTimesOutWithoutBlockingTheBusinessResponse(CapturedOutput output)
            throws Exception {
        assertThat(applicationContext.getBeansOfType(OtlpHttpSpanExporter.class)).hasSize(1);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/foundation/readiness"))
                .GET()
                .build();
        HttpResponse<String> response = HttpClient.newHttpClient().send(
                request,
                HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers()
                        .firstValue(CentralTraceContext.TRACE_ID_HEADER)
                        .orElse(null))
                .matches("[0-9a-f]{32}");

        openTelemetry
                .getTracer("robothree.central.timeout-test")
                .spanBuilder("robothree.central.test.slow-collector")
                .startSpan()
                .end();
        assertThat(openTelemetry).isInstanceOf(OpenTelemetrySdk.class);
        long flushStartedAt = System.nanoTime();
        CompletableResultCode flushResult = ((OpenTelemetrySdk) openTelemetry)
                .getSdkTracerProvider()
                .forceFlush()
                .join(2, TimeUnit.SECONDS);
        Duration flushDuration = Duration.ofNanos(System.nanoTime() - flushStartedAt);

        assertThat(awaitCounter(EXPORT_ATTEMPTS, Duration.ofSeconds(3))).isTrue();
        assertThat(flushResult.isDone()).isTrue();
        assertThat(flushDuration).isLessThan(Duration.ofMillis(750));
        assertThat(awaitOutput(
                        output,
                        "Failed to export spans. The request could not be executed.",
                        Duration.ofSeconds(3)))
                .isTrue();
        assertThat(output).contains("Full error message: timeout");
    }

    private static HttpServer startSlowCollector() {
        try {
            HttpServer server = HttpServer.create(
                    new InetSocketAddress("127.0.0.1", 0),
                    0);
            server.createContext("/v1/traces", exchange -> {
                EXPORT_ATTEMPTS.incrementAndGet();
                exchange.getRequestBody().readAllBytes();
                try {
                    Thread.sleep(1_000);
                    exchange.sendResponseHeaders(200, -1);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                } catch (IOException ignored) {
                    // The exporter is expected to close the request after its timeout.
                } finally {
                    exchange.close();
                }
            });
            server.start();
            return server;
        } catch (IOException exception) {
            throw new IllegalStateException("Could not start the local slow OTLP collector", exception);
        }
    }

    private static boolean awaitCounter(AtomicInteger counter, Duration timeout) {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (counter.get() == 0 && System.nanoTime() < deadline) {
            try {
                Thread.sleep(20);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return counter.get() > 0;
    }

    private static boolean awaitOutput(
            CapturedOutput output,
            String expected,
            Duration timeout) {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (!output.getAll().contains(expected) && System.nanoTime() < deadline) {
            try {
                Thread.sleep(20);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return output.getAll().contains(expected);
    }
}
