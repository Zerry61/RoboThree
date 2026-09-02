package com.robothree.central.skilllifecycle;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.admincontrol.application.AdminCapabilityProjectionService;
import com.robothree.central.admincontrol.application.AdminReadRequestAuthorizer;
import com.robothree.central.admincontrol.application.DevelopmentAdminPrincipalProvider;
import com.robothree.central.persistence.mybatis.adapter.MyBatisSkillLifecycleStore;
import com.robothree.central.persistence.mybatis.mapper.SkillLifecyclePersistenceMapper;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.persistence.schema.Alignment2aSchemaTestAccess;
import com.robothree.central.shared.adapter.http.EnterpriseBearerTokenFilter;
import com.robothree.central.shared.observability.CentralTraceContext;
import com.robothree.central.skilllifecycle.adapter.http.AdminSkillLifecycleHttpController;
import com.robothree.central.skilllifecycle.adapter.http.SkillLifecycleHttpController;
import com.robothree.central.skilllifecycle.adapter.http.SkillLifecycleHttpExceptionHandler;
import com.robothree.central.skilllifecycle.application.AdminSkillDraftTestService;
import com.robothree.central.skilllifecycle.application.InternalTrialSkillLifecycleTokenAuthorizer;
import com.robothree.central.skilllifecycle.application.SkillArchiveAdmission;
import com.robothree.central.skilllifecycle.application.SkillLifecycleAuthority;
import com.robothree.central.skilllifecycle.application.SkillLifecycleProjectionService;
import com.robothree.central.skilllifecycle.application.SkillLifecycleStore;
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
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/** Real PostgreSQL Central + Electron/Core personal and Admin Skill lifecycle product-loop proof. */
@EnabledOnOs(OS.MAC)
@EnabledIfSystemProperty(named = "os.arch", matches = "aarch64|arm64")
@EnabledIfEnvironmentVariable(named = "ROBOTHREE_RSL2_RUN_E2E", matches = "true")
final class MvpRsl2SkillLifecycleDesktopE2E {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final byte[] TOKEN_KEY =
            "robothree-rsl2-e2e-hmac-key-32bx".getBytes(StandardCharsets.US_ASCII);
    private static final String TOKEN_KEY_BASE64 = Base64.getEncoder().encodeToString(TOKEN_KEY);

    @Test
    void createsTestsPublishesInstallsUsesAndRecoversTheExactSkill() throws Exception {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
            TrialApplication.dataSource = dataSource;
            String token = compactLifecycleToken();
            JsonNode evidence;
            try (ConfigurableApplicationContext central = startCentral()) {
                assertRoutesInstalled(central);
                ProcessResult electron = runElectron(port(central), token, false);
                assertThat(electron.output()).doesNotContain(token)
                        .doesNotContain("RSL2-E2E-MARKER")
                        .doesNotContain("请使用当前技能整理");
                assertThat(electron.exitCode())
                        .withFailMessage("RSL-2 Electron failed with safe output: %s",
                                boundedSafeOutput(electron.output()))
                        .isZero();
                try {
                    evidence = lastJsonLine(electron.output());
                } catch (IllegalStateException missingEvidence) {
                    throw new AssertionError("RSL-2 Electron produced no terminal evidence: "
                            + boundedSafeOutput(electron.output()), missingEvidence);
                }
                assertThat(evidence.path("status").asText()).isEqualTo("PASS");
                assertThat(evidence.path("outcome").asText())
                        .isEqualTo("MVP_RSL2_SKILL_LIFECYCLE_E2E_CONFORMANT");
                assertThat(evidence.path("realElectronMain").asBoolean()).isTrue();
                assertThat(evidence.path("exactInstalledSkillInstructionObserved").asBoolean())
                        .isTrue();
                assertThat(evidence.path("wfwArtifactCreated").asBoolean()).isTrue();
                assertThat(evidence.path("sigkillObserved").asBoolean()).isTrue();
            }
            try (ConfigurableApplicationContext restarted = startCentral()) {
                JsonNode releases = publishedReleases(port(restarted), token);
                assertThat(releases.path("items")).hasSize(1);
                assertThat(releases.path("items").path(0).path("skillId").asText())
                        .startsWith("skill.personal.");
            }
            assertThat(schemaVersion(dataSource)).isEqualTo(13);
            System.out.println("ROBOTHREE_RSL2_RESULT=" + evidence);
        } finally {
            TrialApplication.dataSource = null;
        }
    }

    @Test
    void uploadsTestsPublishesInstallsUsesAndRecoversTheExactEnterpriseSkill()
            throws Exception {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
            TrialApplication.dataSource = dataSource;
            String token = compactLifecycleToken();
            JsonNode evidence;
            try (ConfigurableApplicationContext central = startCentral()) {
                assertRoutesInstalled(central);
                ProcessResult electron = runElectron(port(central), token, true);
                assertThat(electron.output()).doesNotContain(token)
                        .doesNotContain("RSL2-ADMIN-E2E-MARKER")
                        .doesNotContain("请按当前企业技能规则整理");
                assertThat(electron.exitCode())
                        .withFailMessage("RSL-2 Admin Electron failed with safe output: %s",
                                boundedSafeOutput(electron.output()))
                        .isZero();
                try {
                    evidence = lastJsonLine(electron.output());
                } catch (IllegalStateException missingEvidence) {
                    throw new AssertionError("RSL-2 Admin Electron produced no terminal evidence: "
                            + boundedSafeOutput(electron.output()), missingEvidence);
                }
                assertThat(evidence.path("status").asText()).isEqualTo("PASS");
                assertThat(evidence.path("outcome").asText())
                        .isEqualTo("MVP_RSL2_ADMIN_UPLOAD_SKILL_E2E_CONFORMANT");
                assertThat(evidence.path("realAdminUploadHttp").asBoolean()).isTrue();
                assertThat(evidence.path("exactInstalledSkillInstructionObserved").asBoolean())
                        .isTrue();
                assertThat(evidence.path("packageScriptExecutionObserved").asBoolean()).isFalse();
                assertThat(evidence.path("wfwArtifactCreated").asBoolean()).isTrue();
                assertThat(evidence.path("sigkillObserved").asBoolean()).isTrue();
            }
            try (ConfigurableApplicationContext restarted = startCentral()) {
                JsonNode releases = publishedReleases(port(restarted), token);
                assertThat(releases.path("items")).hasSize(1);
                assertThat(releases.path("items").path(0).path("skillId").asText())
                        .isEqualTo("skill.enterprise.enterprise-weekly-brief");
                assertThat(releases.path("items").path(0).path("sourceKind").asText())
                        .isEqualTo("admin_upload");
            }
            assertThat(schemaVersion(dataSource)).isEqualTo(13);
            System.out.println("ROBOTHREE_RSL2_ADMIN_RESULT=" + evidence);
        } finally {
            TrialApplication.dataSource = null;
        }
    }

    private static ConfigurableApplicationContext startCentral() {
        return new SpringApplicationBuilder(TrialApplication.class)
                .profiles("test").web(WebApplicationType.SERVLET)
                .properties(Map.of(
                        "server.address", "127.0.0.1",
                        "server.port", "0",
                        "robothree.skill-lifecycle.internal-trial-enabled", "true",
                        "robothree.skill-lifecycle.token-hmac-key-base64", TOKEN_KEY_BASE64,
                        "management.tracing.enabled", "false",
                        "logging.level.root", "WARN"))
                .run();
    }

    private static int port(ConfigurableApplicationContext context) {
        return ((ServletWebServerApplicationContext) context).getWebServer().getPort();
    }

    private static void assertRoutesInstalled(ConfigurableApplicationContext context) {
        assertThat(context.getBeansOfType(SkillLifecycleHttpController.class)).hasSize(1);
        assertThat(context.getBeansOfType(AdminSkillLifecycleHttpController.class)).hasSize(1);
        RequestMappingHandlerMapping mappings = context.getBean(
                "requestMappingHandlerMapping", RequestMappingHandlerMapping.class);
        assertThat(mappings.getHandlerMethods().keySet().stream().map(Object::toString)
                .anyMatch(value -> value.contains("/internal-trial/v1/skill-lifecycle/drafts")))
                .isTrue();
    }

    private static ProcessResult runElectron(int centralPort, String token, boolean adminUpload)
            throws Exception {
        Path root = Path.of("../..").toAbsolutePath().normalize();
        ProcessBuilder builder = new ProcessBuilder(
                root.resolve("apps/desktop/node_modules/.bin/electron").toString(),
                root.resolve("scripts/run-mvp-vs1-electron.mjs").toString());
        builder.directory(root.toFile());
        builder.redirectErrorStream(true);
        Map<String, String> environment = builder.environment();
        environment.remove("ELECTRON_RUN_AS_NODE");
        environment.put("CI", "true");
        environment.put("ROBOTHREE_MVP_RSL2_LIFECYCLE_ORIGIN",
                "http://127.0.0.1:" + centralPort);
        environment.put("ROBOTHREE_INTERNAL_TRIAL_SKILL_LIFECYCLE_ACCESS_TOKEN", token);
        if (adminUpload) environment.put("ROBOTHREE_MVP_RSL2_ADMIN_UPLOAD_E2E", "true");
        Process process = builder.start();
        byte[] output = process.getInputStream().readNBytes(4 * 1_024 * 1_024);
        boolean exited = process.waitFor(15, TimeUnit.MINUTES);
        if (!exited) {
            process.destroyForcibly();
            throw new IllegalStateException("rsl2_electron_timeout");
        }
        return new ProcessResult(process.exitValue(), new String(output, StandardCharsets.UTF_8));
    }

    private static JsonNode publishedReleases(int centralPort, String token) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(
                        "http://127.0.0.1:" + centralPort
                                + "/internal-trial/v1/skill-lifecycle/published-releases"))
                .header("Accept", "application/json")
                .header("Authorization", "Bearer " + token)
                .GET().build();
        HttpResponse<String> response = HttpClient.newHttpClient().send(
                request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        return JSON.readTree(response.body());
    }

    private static int schemaVersion(DataSource dataSource) throws Exception {
        try (var connection = dataSource.getConnection();
                var statement = connection.prepareStatement(
                        "SELECT MAX(version) FROM robothree_schema_version");
                var rows = statement.executeQuery()) {
            assertThat(rows.next()).isTrue();
            return rows.getInt(1);
        }
    }

    private static String compactLifecycleToken() throws Exception {
        Instant now = Instant.now();
        String header = base64Url(JSON.writeValueAsBytes(Map.of("alg", "HS256", "typ", "JWT")));
        String claims = base64Url(JSON.writeValueAsBytes(Map.ofEntries(
                Map.entry("contractVersion", "v1alpha1"),
                Map.entry("issuer", "robothree-rsl2-e2e"),
                Map.entry("audience", "enterprise-skill-lifecycle"),
                Map.entry("enterpriseId", "enterprise.internal-trial"),
                Map.entry("userId", "user.internal-trial"),
                Map.entry("deviceId", "device.rsl2-e2e"),
                Map.entry("clientInstanceId", UUID.randomUUID().toString()),
                Map.entry("tokenId", UUID.randomUUID().toString()),
                Map.entry("issuedAt", now.minusSeconds(60).toString()),
                Map.entry("expiresAt", now.plusSeconds(3600).toString()),
                Map.entry("permissions", java.util.List.of("skill.manage")))));
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
        throw new IllegalStateException("rsl2_electron_evidence_missing");
    }

    private static String boundedSafeOutput(String output) {
        return output.length() <= 8_192 ? output : output.substring(output.length() - 8_192);
    }

    private record ProcessResult(int exitCode, String output) {}

    @SpringBootConfiguration
    @EnableAutoConfiguration(exclude = DataSourceAutoConfiguration.class)
    @MapperScan(basePackageClasses = SkillLifecyclePersistenceMapper.class)
    static class TrialApplication {
        static DataSource dataSource;

        @Bean(destroyMethod = "") DataSource dataSource() {
            if (dataSource == null) throw new IllegalStateException("rsl2_data_source_missing");
            return dataSource;
        }
        @Bean PlatformTransactionManager transactionManager(DataSource source) {
            return new DataSourceTransactionManager(source);
        }
        @Bean SpringCentralTransactionRunner transactionRunner(
                PlatformTransactionManager manager) {
            return new SpringCentralTransactionRunner(manager);
        }
        @Bean MyBatisSkillLifecycleStore store(SkillLifecyclePersistenceMapper mapper) {
            return new MyBatisSkillLifecycleStore(mapper);
        }
        @Bean CentralTraceContext traceContext() { return CentralTraceContext.noop(); }
        @Bean EnterpriseBearerTokenFilter bearerFilter(
                ObjectMapper mapper, CentralTraceContext trace) {
            return new EnterpriseBearerTokenFilter(mapper, trace);
        }
        @Bean AdminReadRequestAuthorizer adminAuthorizer() {
            return new AdminReadRequestAuthorizer(new AdminCapabilityProjectionService(
                    new DevelopmentAdminPrincipalProvider()));
        }
        @Bean Clock clock() { return Clock.systemUTC(); }
        @Bean InternalTrialSkillLifecycleTokenAuthorizer tokenAuthorizer(Clock clock) {
            return new InternalTrialSkillLifecycleTokenAuthorizer(TOKEN_KEY_BASE64, clock);
        }
        @Bean SkillArchiveAdmission archives(Clock clock) {
            return new SkillArchiveAdmission(clock);
        }
        @Bean SkillLifecycleProjectionService projections(SkillLifecycleStore store) {
            return new SkillLifecycleProjectionService(store);
        }
        @Bean SkillLifecycleAuthority authority(SkillLifecycleStore store,
                CentralTransactionRunner transactions, Clock clock) {
            return new SkillLifecycleAuthority(store, transactions, clock);
        }
        @Bean AdminSkillDraftTestService adminTests(SkillLifecycleStore store,
                CentralTransactionRunner transactions, Clock clock,
                SkillLifecycleProjectionService projections) {
            return new AdminSkillDraftTestService(store, transactions, clock, projections);
        }
        @Bean SkillLifecycleHttpController lifecycleController(
                SkillLifecycleAuthority authority, SkillLifecycleProjectionService projections,
                SkillArchiveAdmission archives, AdminSkillDraftTestService tests,
                InternalTrialSkillLifecycleTokenAuthorizer tokens) {
            return new SkillLifecycleHttpController(
                    authority, projections, tokens, archives, tests);
        }
        @Bean AdminSkillLifecycleHttpController adminController(
                SkillLifecycleAuthority authority, SkillLifecycleProjectionService projections,
                SkillArchiveAdmission archives, AdminSkillDraftTestService tests,
                AdminReadRequestAuthorizer authorizer) {
            return new AdminSkillLifecycleHttpController(
                    authority, projections, archives, tests, authorizer);
        }
        @Bean SkillLifecycleHttpExceptionHandler exceptionHandler() {
            return new SkillLifecycleHttpExceptionHandler();
        }
    }
}
