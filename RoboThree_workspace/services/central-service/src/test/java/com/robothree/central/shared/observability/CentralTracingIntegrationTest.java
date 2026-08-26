package com.robothree.central.shared.observability;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "management.tracing.sampling.probability=1.0",
            "management.otlp.tracing.export.enabled=false"
        })
@AutoConfigureObservability
class CentralTracingIntegrationTest {

    private static final String VALID_TRACE_ID = "11111111111111111111111111111111";
    private static final String VALID_PARENT_ID = "2222222222222222";

    @LocalServerPort
    private int port;

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void propagatesValidW3cTraceContextAndKeepsTraceSeparateFromCorrelation() throws Exception {
        HttpResponse<String> ready = get(
                "/foundation/readiness",
                "traceparent",
                "00-" + VALID_TRACE_ID + "-" + VALID_PARENT_ID + "-01",
                "tracestate",
                "robothree=alpha");

        assertThat(ready.statusCode()).isEqualTo(200);
        assertThat(header(ready, CentralTraceContext.TRACE_ID_HEADER))
                .isEqualTo(VALID_TRACE_ID);

        HttpResponse<String> unauthorized = get(
                "/v1alpha1/configuration",
                "traceparent",
                "00-" + VALID_TRACE_ID + "-" + VALID_PARENT_ID + "-01",
                "tracestate",
                "robothree=alpha");
        assertThat(unauthorized.statusCode()).isEqualTo(401);
        assertThat(header(unauthorized, CentralTraceContext.TRACE_ID_HEADER))
                .isEqualTo(VALID_TRACE_ID);
        assertThat(header(unauthorized, "Cache-Control")).isEqualTo("no-store");

        var error = objectMapper.readTree(unauthorized.body());
        assertThat(error.size()).isEqualTo(6);
        assertThat(error.get("code").asText()).isEqualTo("access_token_invalid");
        assertThat(error.get("correlationId").asText())
                .isNotEqualTo(VALID_TRACE_ID);
    }

    @Test
    void rejectsMalformedOrClientInventedTraceIdentifiersWithoutFailingTheRequest()
            throws Exception {
        HttpResponse<String> response = get(
                "/foundation/readiness",
                "traceparent",
                "00-" + "f".repeat(32) + "-not-a-span-id-01",
                CentralTraceContext.TRACE_ID_HEADER,
                "e".repeat(32));

        String traceId = header(response, CentralTraceContext.TRACE_ID_HEADER);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(traceId)
                .matches("[0-9a-f]{32}")
                .isNotEqualTo("f".repeat(32))
                .isNotEqualTo("e".repeat(32));
    }

    @Test
    void concurrentRequestsPreserveTheirOwnTraceContext() throws Exception {
        int requestCount = 48;
        try (var executor = Executors.newFixedThreadPool(8)) {
            List<Callable<TraceResult>> calls = new ArrayList<>();
            for (int index = 1; index <= requestCount; index++) {
                String expectedTraceId = "%032x".formatted(index);
                String parentId = "%016x".formatted(index + 1000);
                calls.add(() -> {
                    HttpResponse<String> response = get(
                            "/foundation/readiness",
                            "traceparent",
                            "00-" + expectedTraceId + "-" + parentId + "-01");
                    return new TraceResult(
                            expectedTraceId,
                            header(response, CentralTraceContext.TRACE_ID_HEADER),
                            response.statusCode());
                });
            }

            Set<String> observed = new HashSet<>();
            for (var future : executor.invokeAll(calls)) {
                TraceResult result = future.get();
                assertThat(result.status()).isEqualTo(200);
                assertThat(result.observedTraceId()).isEqualTo(result.expectedTraceId());
                observed.add(result.observedTraceId());
            }
            assertThat(observed).hasSize(requestCount);
        }
    }

    @Test
    void disabledOtlpExporterCreatesNoNetworkExporterAndOnlyHealthIsExposed()
            throws Exception {
        assertThat(applicationContext.getBeansOfType(OtlpHttpSpanExporter.class)).isEmpty();

        HttpResponse<String> health = get("/actuator/health");
        HttpResponse<String> environment = get("/actuator/env");

        assertThat(health.statusCode()).isEqualTo(200);
        assertThat(environment.statusCode()).isGreaterThanOrEqualTo(400);
    }

    private HttpResponse<String> get(String path, String... headers) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + path))
                .GET();
        for (int index = 0; index < headers.length; index += 2) {
            request.header(headers[index], headers[index + 1]);
        }
        return HttpClient.newHttpClient().send(
                request.build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private static String header(HttpResponse<?> response, String name) {
        return response.headers().firstValue(name).orElse(null);
    }

    private record TraceResult(
            String expectedTraceId,
            String observedTraceId,
            int status) {}
}
