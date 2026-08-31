package com.robothree.central.admincontrol.adapter.http;

import static org.assertj.core.api.Assertions.assertThat;

import com.robothree.central.admincontrol.application.AdminInventoryCatalog;
import com.robothree.central.admincontrol.application.AdminReadProjectionServiceTest;
import com.robothree.central.admincontrol.configuration.AdminCapabilityProjectionConfiguration;
import com.robothree.central.admincontrol.configuration.AdminReadHttpConfiguration;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

@SpringBootTest(
        classes = AdminBrowserIntegrationE2E.TestApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "spring.profiles.active=test",
            "robothree.admin-api.test-read-shell-enabled=true"
        })
class AdminBrowserIntegrationE2E {

    @LocalServerPort
    private int centralPort;

    @Test
    void integrationBuildUsesRealLoopbackProxyAndRealCentralHttpShell() throws Exception {
        String workspace = System.getenv("ROBOTHREE_WORKSPACE_ROOT");
        assertThat(workspace).isNotBlank();
        Path admin = Path.of(workspace, "apps", "admin-console");
        Process child = new ProcessBuilder(
                "node",
                admin.resolve("scripts/integration-loopback-server.mjs").toString(),
                "http://127.0.0.1:" + centralPort)
                .directory(admin.toFile())
                .redirectErrorStream(true)
                .start();
        try {
            waitUntilReady(child);
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .build();
            HttpResponse<String> html = client.send(
                    HttpRequest.newBuilder(URI.create("http://127.0.0.1:41731/"))
                            .header("Origin", "http://127.0.0.1:41731")
                            .header("Sec-Fetch-Site", "same-origin")
                            .GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(html.statusCode()).isEqualTo(200);
            assertThat(html.body()).contains("integration");
            assertThat(html.headers().firstValue("Content-Security-Policy")).hasValueSatisfying(
                    value -> assertThat(value).contains("frame-ancestors 'none'"));

            String requestId = UUID.randomUUID().toString();
            String correlationId = UUID.randomUUID().toString();
            HttpResponse<String> capabilities = client.send(
                    HttpRequest.newBuilder(URI.create(
                                    "http://127.0.0.1:41731/admin/v1alpha1/capabilities/current"))
                            .header("Origin", "http://127.0.0.1:41731")
                            .header("Sec-Fetch-Site", "same-origin")
                            .header("X-RoboThree-Contract-Version", "admin-control.v1alpha1")
                            .header("X-RoboThree-Query-Id", requestId)
                            .header("X-RoboThree-Correlation-Id", correlationId)
                            .GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(capabilities.statusCode()).isEqualTo(200);
            assertThat(capabilities.body())
                    .contains("\"testIdentityUsed\":true")
                    .contains("\"productionIdentityReady\":false")
                    .doesNotContain("credentialReference", "Bearer ", "privateKey", "accessToken");
            assertThat(capabilities.headers().firstValue("Access-Control-Allow-Origin")).isEmpty();
        } finally {
            child.destroy();
            if (!child.waitFor(5, TimeUnit.SECONDS)) child.destroyForcibly();
        }
    }

    private static void waitUntilReady(Process child) throws Exception {
        BufferedReader output = new BufferedReader(new InputStreamReader(child.getInputStream()));
        String line = CompletableFuture.supplyAsync(() -> {
            try {
                return output.readLine();
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        }).get(15, TimeUnit.SECONDS);
        if (!child.isAlive() || line == null || !line.contains("\"status\":\"ready\"")) {
            throw new IllegalStateException("admin loopback child readiness failed");
        }
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    @Import({
        AdminCapabilityProjectionConfiguration.class,
        AdminReadHttpConfiguration.class,
        AdminReadHttpController.class,
        AdminReadHttpExceptionHandler.class
    })
    static class TestApplication {
        @Bean
        AdminInventoryCatalog adminInventoryCatalog() {
            return AdminReadProjectionServiceTest.catalog();
        }
    }
}
