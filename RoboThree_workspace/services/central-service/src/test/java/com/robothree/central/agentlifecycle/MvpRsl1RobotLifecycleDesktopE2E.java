package com.robothree.central.agentlifecycle;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.admincontrol.application.AdminCapabilityProjectionService;
import com.robothree.central.admincontrol.application.AdminReadRequestAuthorizer;
import com.robothree.central.admincontrol.application.DevelopmentAdminPrincipalProvider;
import com.robothree.central.agentlifecycle.adapter.http.AgentLifecycleHttpController;
import com.robothree.central.agentlifecycle.adapter.http.AgentLifecycleHttpExceptionHandler;
import com.robothree.central.agentlifecycle.adapter.http.AgentLifecycleReviewHttpController;
import com.robothree.central.agentlifecycle.application.AgentLifecycleCommandService;
import com.robothree.central.agentlifecycle.application.AgentLifecycleStore;
import com.robothree.central.agentlifecycle.application.InternalTrialAgentLifecycleTokenAuthorizer;
import com.robothree.central.agentlifecycle.application.RobotAvatarImageValidator;
import com.robothree.central.persistence.mybatis.adapter.MyBatisAgentLifecycleStore;
import com.robothree.central.persistence.mybatis.mapper.AgentLifecyclePersistenceMapper;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.persistence.schema.Alignment2aSchemaTestAccess;
import com.robothree.central.shared.adapter.http.EnterpriseBearerTokenFilter;
import com.robothree.central.shared.observability.CentralTraceContext;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.springframework.transaction.PlatformTransactionManager;
import org.mybatis.spring.annotation.MapperScan;

/** Real PostgreSQL Central + Electron/Core RSL-1 product-loop proof. */
@EnabledOnOs(OS.MAC)
@EnabledIfSystemProperty(named = "os.arch", matches = "aarch64|arm64")
@EnabledIfEnvironmentVariable(named = "ROBOTHREE_RSL1_RUN_E2E", matches = "true")
final class MvpRsl1RobotLifecycleDesktopE2E {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final byte[] TOKEN_KEY =
            "robothree-rsl1-e2e-hmac-key-32bx".getBytes(StandardCharsets.US_ASCII);
    private static final String TOKEN_KEY_BASE64 = Base64.getEncoder().encodeToString(TOKEN_KEY);

    @Test
    void runsCreatorTestReviewPublishConsumeAndRestartThroughTheRealProductLoop()
            throws Exception {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
            TrialApplication.dataSource = dataSource;
            String token = compactLifecycleToken();
            JsonNode evidence;
            try (ConfigurableApplicationContext central = startCentral()) {
                assertLifecycleRoutesInstalled(central);
                int port = port(central);
                ProcessResult electron = runElectron(port, token);
                assertThat(electron.output())
                        .doesNotContain(token)
                        .doesNotContain("不编造条款")
                        .doesNotContain("请按你的审阅规则");
                assertThat(electron.exitCode())
                        .withFailMessage("RSL-1 Electron failed with safe output: %s",
                                boundedSafeOutput(electron.output()))
                        .isZero();
                evidence = lastJsonLine(electron.output());
                assertThat(evidence.path("status").asText()).isEqualTo("PASS");
                assertThat(evidence.path("outcome").asText())
                        .isEqualTo("MVP_RSL1_ROBOT_LIFECYCLE_E2E_CONFORMANT");
                assertThat(evidence.path("realElectronMain").asBoolean()).isTrue();
                assertThat(evidence.path("realCentralLifecycleHttp").asBoolean()).isTrue();
                assertThat(evidence.path("realAdminReviewHttp").asBoolean()).isTrue();
                assertThat(evidence.path("immutableSubmissionApproved").asBoolean()).isTrue();
                assertThat(evidence.path("exactPublishedAgentLock").asBoolean()).isTrue();
                assertThat(evidence.path("restartExactAgentLock").asBoolean()).isTrue();
                assertThat(evidence.path("mainLifecycleTokenEnvironmentAbsent").asBoolean()).isTrue();
            }

            try (ConfigurableApplicationContext restarted = startCentral()) {
                JsonNode releases = publishedReleases(port(restarted), token);
                assertThat(releases.path("items")).hasSize(1);
                assertThat(releases.path("items").path(0).path("robotId").asText())
                        .startsWith("agent.personal-");
            }
            assertThat(schemaVersion(dataSource)).isEqualTo(12);
            System.out.println("ROBOTHREE_RSL1_RESULT=" + evidence);
        } finally {
            TrialApplication.dataSource = null;
        }
    }

    private static ConfigurableApplicationContext startCentral() {
        return new SpringApplicationBuilder(TrialApplication.class)
                .profiles("test")
                .web(WebApplicationType.SERVLET)
                .properties(Map.of(
                        "server.address", "127.0.0.1",
                        "server.port", "0",
                        "robothree.agent-lifecycle.internal-trial-enabled", "true",
                        "robothree.agent-lifecycle.token-hmac-key-base64", TOKEN_KEY_BASE64,
                        "management.tracing.enabled", "false",
                        "logging.level.root", "WARN"))
                .run();
    }

    private static int port(ConfigurableApplicationContext context) {
        return ((ServletWebServerApplicationContext) context).getWebServer().getPort();
    }

    private static void assertLifecycleRoutesInstalled(ConfigurableApplicationContext context) {
        assertThat(context.getBeansOfType(AgentLifecycleHttpController.class)).hasSize(1);
        RequestMappingHandlerMapping mappings = context.getBean(
                "requestMappingHandlerMapping", RequestMappingHandlerMapping.class);
        assertThat(mappings.getHandlerMethods().keySet().stream()
                .map(Object::toString)
                .anyMatch(value -> value.contains("/internal-trial/v1/agent-lifecycle/drafts")))
                .isTrue();
    }

    private static ProcessResult runElectron(int centralPort, String token) throws Exception {
        Path root = Path.of("../..").toAbsolutePath().normalize();
        ProcessBuilder builder = new ProcessBuilder(
                root.resolve("apps/desktop/node_modules/.bin/electron").toString(),
                root.resolve("scripts/run-mvp-vs1-electron.mjs").toString());
        builder.directory(root.toFile());
        builder.redirectErrorStream(true);
        Map<String, String> environment = builder.environment();
        environment.remove("ELECTRON_RUN_AS_NODE");
        environment.put("CI", "true");
        environment.put("ROBOTHREE_MVP_RSL1_LIFECYCLE_ORIGIN",
                "http://127.0.0.1:" + centralPort);
        environment.put("ROBOTHREE_INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN", token);
        Process process = builder.start();
        byte[] output = process.getInputStream().readNBytes(4 * 1_024 * 1_024);
        boolean exited = process.waitFor(4, TimeUnit.MINUTES);
        if (!exited) {
            process.destroyForcibly();
            throw new IllegalStateException("rsl1_electron_timeout");
        }
        return new ProcessResult(process.exitValue(), new String(output, StandardCharsets.UTF_8));
    }

    private static JsonNode publishedReleases(int centralPort, String token) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(
                        "http://127.0.0.1:" + centralPort
                                + "/internal-trial/v1/agent-lifecycle/published-releases"))
                .header("Accept", "application/json")
                .header("Authorization", "Bearer " + token)
                .GET()
                .build();
        HttpResponse<String> response = HttpClient.newHttpClient().send(
                request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        return JSON.readTree(response.body());
    }

    private static int schemaVersion(DataSource dataSource) throws Exception {
        try (var connection = dataSource.getConnection();
                var statement = connection.prepareStatement(
                        "SELECT MAX(version) FROM robothree_schema_version")) {
            try (var rows = statement.executeQuery()) {
                assertThat(rows.next()).isTrue();
                return rows.getInt(1);
            }
        }
    }

    private static String compactLifecycleToken() throws Exception {
        Instant now = Instant.now();
        String header = base64Url(JSON.writeValueAsBytes(Map.of("alg", "HS256", "typ", "JWT")));
        String claims = base64Url(JSON.writeValueAsBytes(Map.ofEntries(
                Map.entry("contractVersion", "v1alpha1"),
                Map.entry("issuer", "robothree-rsl1-e2e"),
                Map.entry("audience", "enterprise-agent-lifecycle"),
                Map.entry("enterpriseId", "enterprise.internal-trial"),
                Map.entry("userId", "user.internal-trial"),
                Map.entry("deviceId", "device.rsl1-e2e"),
                Map.entry("clientInstanceId", UUID.randomUUID().toString()),
                Map.entry("tokenId", UUID.randomUUID().toString()),
                Map.entry("issuedAt", now.minusSeconds(60).toString()),
                Map.entry("expiresAt", now.plusSeconds(3600).toString()),
                Map.entry("permissions", java.util.List.of("agent.manage")))));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(TOKEN_KEY, "HmacSHA256"));
        return header + "." + claims + "." + base64Url(
                mac.doFinal((header + "." + claims).getBytes(StandardCharsets.US_ASCII)));
    }

    private static String base64Url(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static JsonNode lastJsonLine(String output) throws Exception {
        String[] lines = output.lines().toArray(String[]::new);
        for (int index = lines.length - 1; index >= 0; index--) {
            String line = lines[index].trim();
            if (line.startsWith("{") && line.endsWith("}")) return JSON.readTree(line);
        }
        throw new IllegalStateException("rsl1_electron_evidence_missing");
    }

    private static String boundedSafeOutput(String output) {
        return output.length() <= 8_192 ? output : output.substring(output.length() - 8_192);
    }

    private record ProcessResult(int exitCode, String output) {}

    @SpringBootConfiguration
    @EnableAutoConfiguration(exclude = DataSourceAutoConfiguration.class)
    @MapperScan(basePackageClasses = AgentLifecyclePersistenceMapper.class)
    static class TrialApplication {
        static DataSource dataSource;

        @Bean(destroyMethod = "")
        DataSource rslDataSource() {
            if (dataSource == null) throw new IllegalStateException("rsl1_data_source_missing");
            return dataSource;
        }

        @Bean
        PlatformTransactionManager rslTransactionManager(DataSource source) {
            return new DataSourceTransactionManager(source);
        }

        @Bean
        SpringCentralTransactionRunner rslTransactionRunner(
                PlatformTransactionManager transactionManager) {
            return new SpringCentralTransactionRunner(transactionManager);
        }

        @Bean
        MyBatisAgentLifecycleStore rslAgentLifecycleStore(
                AgentLifecyclePersistenceMapper mapper) {
            return new MyBatisAgentLifecycleStore(mapper);
        }

        @Bean
        CentralTraceContext centralTraceContext() {
            return CentralTraceContext.noop();
        }

        @Bean
        EnterpriseBearerTokenFilter enterpriseBearerTokenFilter(
                ObjectMapper objectMapper,
                CentralTraceContext traceContext) {
            return new EnterpriseBearerTokenFilter(objectMapper, traceContext);
        }

        @Bean
        AdminReadRequestAuthorizer adminReadRequestAuthorizer() {
            return new AdminReadRequestAuthorizer(new AdminCapabilityProjectionService(
                    new DevelopmentAdminPrincipalProvider()));
        }

        @Bean
        Clock agentLifecycleClock() {
            return Clock.systemUTC();
        }

        @Bean
        InternalTrialAgentLifecycleTokenAuthorizer agentLifecycleTokenAuthorizer(
                Clock agentLifecycleClock) {
            return new InternalTrialAgentLifecycleTokenAuthorizer(
                    TOKEN_KEY_BASE64, agentLifecycleClock);
        }

        @Bean
        AgentLifecycleCommandService agentLifecycleCommandService(
                AgentLifecycleStore store,
                CentralTransactionRunner transactions,
                Clock agentLifecycleClock) {
            return new AgentLifecycleCommandService(store, transactions, agentLifecycleClock,
                    new RobotAvatarImageValidator());
        }

        @Bean
        AgentLifecycleHttpController agentLifecycleHttpController(
                AgentLifecycleCommandService service,
                InternalTrialAgentLifecycleTokenAuthorizer tokens) {
            return new AgentLifecycleHttpController(service, tokens);
        }

        @Bean
        AgentLifecycleReviewHttpController agentLifecycleReviewHttpController(
                AgentLifecycleCommandService service,
                AdminReadRequestAuthorizer authorizer) {
            return new AgentLifecycleReviewHttpController(service, authorizer);
        }

        @Bean
        AgentLifecycleHttpExceptionHandler agentLifecycleHttpExceptionHandler() {
            return new AgentLifecycleHttpExceptionHandler();
        }
    }
}
