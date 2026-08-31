package com.robothree.central.modelgateway.development;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.modelgateway.adapter.http.JdkModelAuthorizedHttpTransport;
import com.robothree.central.modelgateway.adapter.http.ModelInvocationV1Alpha3Controller;
import com.robothree.central.modelgateway.adapter.http.StrictModelOutboundEndpointPolicy;
import com.robothree.central.modelgateway.adapter.provider.OpenAiCompatibleModelProviderAdapter;
import com.robothree.central.modelgateway.adapter.runtime.BufferedModelInvocationEphemeralPublisher;
import com.robothree.central.modelgateway.adapter.runtime.ProviderBackedModelInvocationExecutionBackend;
import com.robothree.central.modelgateway.adapter.runtime.StrictModelProviderAdapterRegistry;
import com.robothree.central.modelgateway.application.DurableModelInvocationV1Alpha3GatewayService;
import com.robothree.central.modelgateway.application.DeterministicPromptCachePlanner;
import com.robothree.central.modelgateway.application.EnterpriseReasoningSecondValidator;
import com.robothree.central.modelgateway.application.ModelDispatchDecision;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer;
import com.robothree.central.modelgateway.application.ModelInvocationGatewayService;
import com.robothree.central.modelgateway.application.ModelInvocationAdmissionPolicy;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime;
import com.robothree.central.modelgateway.application.ModelInvocationRuntimePolicy;
import com.robothree.central.modelgateway.application.ModelInvocationV1Alpha3GatewayService;
import com.robothree.central.modelgateway.application.PromptCacheCompatibilityClassifier;
import com.robothree.central.modelgateway.application.PromptCachePlanningService;
import com.robothree.central.modelgateway.application.ReleasePinnedEnterpriseReasoningMappingSource;
import com.robothree.central.modelgateway.application.StaticPromptPrefixProjector;
import com.robothree.central.modelgateway.application.TransientModelProviderRequestSource;
import com.robothree.central.modelgateway.application.VersionedPromptCacheProfileRegistry;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.modelgateway.port.ModelBindingRuntimeStateProvider;
import com.robothree.central.modelgateway.port.ModelCredentialMaterialSource;
import com.robothree.central.modelgateway.port.ModelCredentialResolver;
import com.robothree.central.modelgateway.port.ModelEndpointBindingResolver;
import com.robothree.central.modelgateway.port.ModelInvocationAccessAuthorizer;
import com.robothree.central.modelgateway.port.ModelInvocationExecutionBackend;
import com.robothree.central.modelgateway.port.ModelProviderAdapter;
import com.robothree.central.modelgateway.provider.ModelProviderStreamEvent;
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
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisAgentLifecycleStore;
import com.robothree.central.persistence.mybatis.mapper.AgentLifecyclePersistenceMapper;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import com.robothree.central.persistence.schema.Alignment2aSchemaTestAccess;
import com.robothree.central.shared.adapter.http.EnterpriseBearerTokenFilter;
import com.robothree.central.shared.adapter.http.GlobalExceptionHandler;
import com.robothree.central.shared.observability.CentralObservationRunner;
import com.robothree.central.shared.observability.CentralTraceContext;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.web.filter.OncePerRequestFilter;

/** Internal-trial-only actual Central -> real Provider -> Electron smoke. */
final class MvpVs1RealProviderDesktopE2E {

    private static final String KEY_ENV = "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY";
    private static final String ENDPOINT_ENV =
            "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_ENDPOINT";
    private static final String PROTOCOL_ENV =
            "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_PROTOCOL";
    private static final String UPSTREAM_MODEL_ENV =
            "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_MODEL_ID";
    private static final String RUN_ENV = "ROBOTHREE_DR2_RUN_REAL_PROVIDER";
    private static final String INTERACTIVE_RUN_ENV =
            "ROBOTHREE_DR2_RUN_INTERACTIVE_DESKTOP";
    private static final String MULTITURN_RUN_ENV =
            "ROBOTHREE_DR2_RUN_MULTITURN_E2E";
    private static final String CONTROLLED_MULTITURN_RUN_ENV =
            "ROBOTHREE_DR2_RUN_CONTROLLED_MULTITURN_E2E";
    private static final String CONTROLLED_PROVIDER_ENV =
            "ROBOTHREE_DR2_USE_CONTROLLED_PROVIDER";
    private static final String ELECTRON_MULTITURN_ENV =
            "ROBOTHREE_MVP_VS1_MULTITURN_E2E";
    private static final String ACCESS_TOKEN = compactTrialToken();
    private static final byte[] LIFECYCLE_TOKEN_KEY =
            "robothree-rsl1-repair-hmac-key-x".getBytes(StandardCharsets.US_ASCII);
    private static final String LIFECYCLE_TOKEN_KEY_BASE64 =
            Base64.getEncoder().encodeToString(LIFECYCLE_TOKEN_KEY);
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void startsTheTestOnlyActualCentralCompositionWithoutProductGraph() {
        try (var central = new SpringApplicationBuilder(TrialApplication.class)
                .web(WebApplicationType.SERVLET)
                .properties(trialProperties(Map.of(
                        KEY_ENV, "test-only-placeholder",
                        ENDPOINT_ENV, "https://api.deepseek.com",
                        PROTOCOL_ENV, "OPENAI_COMPATIBLE",
                        UPSTREAM_MODEL_ENV, "test-model")))
                .run()) {
            assertThat(central.getBean(ModelInvocationV1Alpha3GatewayService.class))
                    .isNotNull();
            assertThat(central.getBean(ModelInvocationV1Alpha3Controller.class))
                    .isNotNull();
            assertThat(central.getBean(InMemoryCentralPersistence.class))
                    .isNotNull();
            assertThat(central.getBean(StrictModelProviderAdapterRegistry.class))
                    .isNotNull();
        }
    }

    @Test
    void startsTheLocalTrialModelAndAgentLifecycleCompositionTogether() throws Exception {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            LifecycleTrialConfiguration.dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(
                    LifecycleTrialConfiguration.dataSource);
            try (var central = new SpringApplicationBuilder(
                    TrialApplication.class, LifecycleTrialConfiguration.class)
                    .profiles("test")
                    .web(WebApplicationType.SERVLET)
                    .properties(trialProperties(Map.of(
                            KEY_ENV, "test-only-placeholder",
                            ENDPOINT_ENV, "https://api.deepseek.com",
                            PROTOCOL_ENV, "OPENAI_COMPATIBLE",
                            UPSTREAM_MODEL_ENV, "test-model",
                            "robothree.agent-lifecycle.internal-trial-enabled", "true",
                            "robothree.agent-lifecycle.token-hmac-key-base64",
                            LIFECYCLE_TOKEN_KEY_BASE64)))
                    .run()) {
                assertThat(central.getBean(ModelInvocationV1Alpha3Controller.class))
                        .isNotNull();
                assertThat(central.getBeansOfType(AgentLifecycleHttpController.class))
                        .hasSize(1);
                int port = ((ServletWebServerApplicationContext) central)
                        .getWebServer()
                        .getPort();
                HttpRequest request = HttpRequest.newBuilder(URI.create(
                                "http://127.0.0.1:" + port
                                        + "/internal-trial/v1/agent-lifecycle/drafts"))
                        .header("Authorization", "Bearer " + compactLifecycleToken())
                        .GET()
                        .build();
                HttpResponse<String> response = HttpClient.newHttpClient().send(
                        request, HttpResponse.BodyHandlers.ofString());
                assertThat(response.statusCode()).isEqualTo(200);
                assertThat(JSON.readTree(response.body()).path("items")).isEmpty();
            } finally {
                LifecycleTrialConfiguration.dataSource = null;
            }
        }
    }

    @Test
    void runsActualCentralDeepSeekGatewayThroughTheRealElectronProductLoop()
            throws Exception {
        assumeTrue("true".equals(System.getenv(RUN_ENV)), "DR-2 real smoke is opt-in");
        require(KEY_ENV);
        require(ENDPOINT_ENV);
        require(PROTOCOL_ENV);
        require(UPSTREAM_MODEL_ENV);

        try (var central = new SpringApplicationBuilder(TrialApplication.class)
                .web(WebApplicationType.SERVLET)
                .properties(trialProperties(Map.of()))
                .run()) {
            int port = ((ServletWebServerApplicationContext) central)
                    .getWebServer()
                    .getPort();
            ProcessResult electron = runElectron(port);
            assertThat(electron.output()).doesNotContain(require(KEY_ENV));
            String executionDiagnostic = central
                    .getBean(TrialExecutionRecorder.class)
                    .safeDiagnostic();
            String gatewayDiagnostic = central
                    .getBean(TrialGatewayRecorder.class)
                    .safeDiagnostic();
            String providerDiagnostic = central
                    .getBean(TrialProviderRecorder.class)
                    .safeDiagnostic();
            String invocationDiagnostic = central
                    .getBean(TrialEntropySource.class)
                    .generatedIds()
                    .stream()
                    .map(central.getBean(InMemoryCentralPersistence.class)::findById)
                    .flatMap(java.util.Optional::stream)
                    .map(invocation -> invocation.status().name()
                            + ":"
                            + (invocation.safeErrorCode() == null
                                    ? "none"
                                    : invocation.safeErrorCode()))
                    .reduce((left, right) -> left + "," + right)
                    .orElse("no_persisted_invocation");
            assertThat(electron.exitCode())
                    .withFailMessage(
                            "DR-2 Electron failed with safe output: %s%n"
                                    + "Central execution: %s%n"
                                    + "Central invocation: %s%n"
                                    + "Central gateway: %s%n"
                                    + "Central provider: %s",
                            boundedSafeOutput(electron.output()),
                            executionDiagnostic,
                            invocationDiagnostic,
                            gatewayDiagnostic,
                            providerDiagnostic)
                    .isZero();

            JsonNode evidence = lastJsonLine(electron.output());
            assertThat(evidence.path("status").asText()).isEqualTo("PASS");
            assertThat(evidence.path("outcome").asText())
                    .isEqualTo("MVP_VERTICAL_SLICE_1_E2E_CONFORMANT");
            assertThat(evidence.path("gatewayMode").asText())
                    .isEqualTo("external_gateway");
            assertThat(evidence.path("realElectronMain").asBoolean()).isTrue();
            assertThat(evidence.path("realGatewayHttpSse").asBoolean()).isTrue();
            assertThat(evidence.path("pptxArtifactFilePresent").asBoolean()).isTrue();
            assertThat(evidence.path("assistantReplyVisible").asBoolean()).isTrue();
            assertThat(evidence.path("artifactVisible").asBoolean()).isTrue();
            assertThat(evidence.path("toolActivityVisible").asBoolean()).isTrue();
            assertThat(evidence.path("restartArtifactVisible").asBoolean()).isTrue();
            System.out.println("ROBOTHREE_DR2_RESULT=" + evidence);
        }
    }

    @Test
    void opensInteractiveLocalDemoWithActualCentralAndDeepSeek() throws Exception {
        assumeTrue(
                "true".equals(System.getenv(INTERACTIVE_RUN_ENV)),
                "DR-2 interactive Desktop trial is opt-in");
        require(KEY_ENV);
        require(ENDPOINT_ENV);
        require(PROTOCOL_ENV);
        require(UPSTREAM_MODEL_ENV);

        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            LifecycleTrialConfiguration.dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(
                    LifecycleTrialConfiguration.dataSource);
            try (var central = new SpringApplicationBuilder(
                    TrialApplication.class, LifecycleTrialConfiguration.class)
                    .profiles("test")
                    .web(WebApplicationType.SERVLET)
                    .properties(trialProperties(Map.of(
                            "robothree.agent-lifecycle.internal-trial-enabled", "true",
                            "robothree.agent-lifecycle.token-hmac-key-base64",
                            LIFECYCLE_TOKEN_KEY_BASE64)))
                    .run()) {
                int port = ((ServletWebServerApplicationContext) central)
                        .getWebServer()
                        .getPort();
                assertThat(central.getBeansOfType(AgentLifecycleHttpController.class))
                        .hasSize(1);
                int exitCode = runInteractiveElectron(port, compactLifecycleToken());
                assertThat(exitCode).isZero();
            } finally {
                LifecycleTrialConfiguration.dataSource = null;
            }
        }
    }

    @Test
    void completesFiveTurnsInOneSessionThroughActualCentralAndDeepSeek()
            throws Exception {
        assumeTrue(
                "true".equals(System.getenv(MULTITURN_RUN_ENV)),
                "DR-2 five-turn E2E is opt-in");
        require(KEY_ENV);
        require(ENDPOINT_ENV);
        require(PROTOCOL_ENV);
        require(UPSTREAM_MODEL_ENV);

        try (var central = new SpringApplicationBuilder(TrialApplication.class)
                .web(WebApplicationType.SERVLET)
                .properties(trialProperties(Map.of()))
                .run()) {
            int port = ((ServletWebServerApplicationContext) central)
                    .getWebServer()
                    .getPort();
            ProcessResult electron = runElectron(port, true);
            assertThat(electron.output()).doesNotContain(require(KEY_ENV));
            assertThat(electron.exitCode())
                    .withFailMessage(
                            "DR-2 five-turn Electron failed with safe output: %s%n"
                                    + "Central execution: %s%n"
                                    + "Central gateway: %s%n"
                                    + "Central provider: %s",
                            boundedSafeOutput(electron.output()),
                            central.getBean(TrialExecutionRecorder.class)
                                    .safeDiagnostic(),
                            central.getBean(TrialGatewayRecorder.class)
                                    .safeDiagnostic(),
                            central.getBean(TrialProviderRecorder.class)
                                    .safeDiagnostic())
                    .isZero();
            JsonNode evidence = lastJsonLine(electron.output());
            assertThat(evidence.path("status").asText()).isEqualTo("PASS");
            assertThat(evidence.path("outcome").asText())
                    .isEqualTo("DR2_FIVE_TURN_CONVERSATION_E2E_CONFORMANT");
            assertThat(evidence.path("completedTurnCount").asInt()).isEqualTo(5);
            assertThat(evidence.path("assistantMessageCount").asInt()).isEqualTo(5);
            System.out.println("ROBOTHREE_DR2_MULTITURN_RESULT=" + evidence);
        }
    }

    @Test
    void completesFiveTurnsInOneSessionThroughControlledProvider() throws Exception {
        assumeTrue(
                "true".equals(System.getenv(CONTROLLED_MULTITURN_RUN_ENV)),
                "DR-2 controlled five-turn E2E is opt-in");
        try (var central = new SpringApplicationBuilder(TrialApplication.class)
                .web(WebApplicationType.SERVLET)
                .properties(trialProperties(Map.of(
                        KEY_ENV, "controlled-provider-placeholder",
                        ENDPOINT_ENV, "https://api.deepseek.com",
                        PROTOCOL_ENV, "OPENAI_COMPATIBLE",
                        UPSTREAM_MODEL_ENV, "controlled-model",
                        CONTROLLED_PROVIDER_ENV, "true")))
                .run()) {
            int port = ((ServletWebServerApplicationContext) central)
                    .getWebServer()
                    .getPort();
            ProcessResult electron = runElectron(port, true);
            assertThat(electron.exitCode())
                    .withFailMessage(
                            "Controlled five-turn Electron failed with safe output: %s%n"
                                    + "Central execution: %s%n"
                                    + "Central gateway: %s%n"
                                    + "Central provider: %s",
                            boundedSafeOutput(electron.output()),
                            central.getBean(TrialExecutionRecorder.class)
                                    .safeDiagnostic(),
                            central.getBean(TrialGatewayRecorder.class)
                                    .safeDiagnostic(),
                            central.getBean(TrialProviderRecorder.class)
                                    .safeDiagnostic())
                    .isZero();
            JsonNode evidence = lastJsonLine(electron.output());
            assertThat(evidence.path("outcome").asText())
                    .isEqualTo("DR2_FIVE_TURN_CONVERSATION_E2E_CONFORMANT");
            assertThat(evidence.path("completedTurnCount").asInt()).isEqualTo(5);
            assertThat(evidence.path("assistantMessageCount").asInt()).isEqualTo(5);
        }
    }

    private static ProcessResult runElectron(int centralPort) throws Exception {
        return runElectron(centralPort, false);
    }

    private static ProcessResult runElectron(
            int centralPort,
            boolean multiTurn) throws Exception {
        Path root = Path.of("../..").toAbsolutePath().normalize();
        ProcessBuilder builder = new ProcessBuilder(
                root.resolve("apps/desktop/node_modules/.bin/electron").toString(),
                root.resolve("scripts/run-mvp-vs1-electron.mjs").toString());
        builder.directory(root.toFile());
        builder.redirectErrorStream(true);
        Map<String, String> environment = builder.environment();
        environment.remove("ELECTRON_RUN_AS_NODE");
        environment.remove(KEY_ENV);
        environment.remove(ENDPOINT_ENV);
        environment.remove(PROTOCOL_ENV);
        environment.remove(UPSTREAM_MODEL_ENV);
        environment.remove(RUN_ENV);
        environment.remove(MULTITURN_RUN_ENV);
        environment.remove(CONTROLLED_MULTITURN_RUN_ENV);
        environment.remove(CONTROLLED_PROVIDER_ENV);
        environment.remove(ELECTRON_MULTITURN_ENV);
        if (multiTurn) {
            environment.put(ELECTRON_MULTITURN_ENV, "true");
        }
        environment.put(
                "ROBOTHREE_MVP_VS1_EXTERNAL_GATEWAY_BASE_URL",
                "http://127.0.0.1:" + centralPort);
        environment.put(
                "ROBOTHREE_MVP_VS1_EXTERNAL_GATEWAY_ACCESS_TOKEN",
                ACCESS_TOKEN);
        environment.put(
                "ROBOTHREE_MVP_VS1_EXTERNAL_GATEWAY_MODEL_ID",
                "model.internal-trial");
        Process process = builder.start();
        byte[] output = process.getInputStream().readNBytes(4 * 1_024 * 1_024);
        boolean exited = process.waitFor(4, TimeUnit.MINUTES);
        if (!exited) {
            process.destroyForcibly();
            throw new IllegalStateException("dr2_electron_timeout");
        }
        return new ProcessResult(
                process.exitValue(),
                new String(output, StandardCharsets.UTF_8));
    }

    private static int runInteractiveElectron(int centralPort, String lifecycleToken)
            throws Exception {
        Path root = Path.of("../..").toAbsolutePath().normalize();
        Path userData = Files.createTempDirectory("robothree-deepseek-trial-");
        long startedAt = System.currentTimeMillis();
        ProcessBuilder builder = new ProcessBuilder(
                root.resolve("apps/desktop/node_modules/.bin/electron").toString(),
                "--user-data-dir=" + userData,
                root.resolve("apps/desktop/dist/main/index.js").toString());
        builder.directory(root.toFile());
        builder.inheritIO();
        Map<String, String> environment = builder.environment();
        environment.remove("ELECTRON_RUN_AS_NODE");
        environment.remove(KEY_ENV);
        environment.remove(ENDPOINT_ENV);
        environment.remove(PROTOCOL_ENV);
        environment.remove(UPSTREAM_MODEL_ENV);
        environment.remove(RUN_ENV);
        environment.remove(INTERACTIVE_RUN_ENV);
        environment.put(
                "ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT",
                interactiveDeployment(centralPort));
        environment.put(
                "ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN",
                ACCESS_TOKEN);
        environment.put(
                "ROBOTHREE_INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN",
                lifecycleToken);
        try {
            Process process = builder.start();
            int exitCode = process.waitFor();
            if (exitCode == 0) {
                verifyInteractivePptxTrial(root, userData, startedAt);
            }
            return exitCode;
        } finally {
            deleteRecursively(userData);
        }
    }

    private static void verifyInteractivePptxTrial(
            Path root,
            Path userData,
            long startedAt) throws Exception {
        ProcessBuilder verifier = new ProcessBuilder(
                "node",
                root.resolve("scripts/verify-interactive-pptx-trial.mjs").toString(),
                userData.resolve("robothree.sqlite").toString(),
                Path.of(System.getProperty("user.home"), ".robothree").toString(),
                Long.toString(startedAt));
        verifier.directory(root.toFile());
        verifier.redirectErrorStream(true);
        Process process = verifier.start();
        String output = new String(
                process.getInputStream().readNBytes(16_384),
                StandardCharsets.UTF_8);
        if (!process.waitFor(30, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException("interactive_trial_verification_timeout");
        }
        if (process.exitValue() != 0) {
            throw new IllegalStateException(
                    "interactive_trial_did_not_complete_task_and_pptx: "
                            + boundedSafeOutput(output));
        }
    }

    private static String interactiveDeployment(int centralPort) throws Exception {
        return JSON.writeValueAsString(Map.of(
                "schemaVersion", "mvp-admin-vs1.internal-trial.v1",
                "centralBaseUrl", "http://127.0.0.1:" + centralPort,
                "configurationRevision", "sha256:" + "7".repeat(64),
                "modelId", "model.internal-trial",
                "modelCreatedAt", "2026-08-30T00:00:00.000Z",
                "displayName", "DeepSeek-V4",
                "supportsToolCalling", true));
    }

    private static void deleteRecursively(Path root) throws IOException {
        if (!Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            paths.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // Trial cleanup is best effort after the Electron process exits.
                }
            });
        }
    }

    private static JsonNode lastJsonLine(String output) throws Exception {
        String[] lines = output.lines().toArray(String[]::new);
        for (int index = lines.length - 1; index >= 0; index--) {
            String line = lines[index].trim();
            if (line.startsWith("{") && line.endsWith("}")) {
                return JSON.readTree(line);
            }
        }
        throw new IllegalStateException("dr2_electron_evidence_missing");
    }

    private static String boundedSafeOutput(String output) {
        String safe = output.replace(require(KEY_ENV), "[REDACTED]");
        return safe.length() <= 8_192 ? safe : safe.substring(safe.length() - 8_192);
    }

    private static String require(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("DR-2 environment is incomplete: " + name);
        }
        return value;
    }

    private static String compactTrialToken() {
        Instant now = Instant.now();
        String header = "{\"alg\":\"ES256\",\"typ\":\"JWT\"}";
        String claims = "{\"contractVersion\":\"v1alpha1\","
                + "\"issuer\":\"central.internal-trial\","
                + "\"audience\":\"enterprise-model-gateway\","
                + "\"enterpriseId\":\"enterprise.internal-trial\","
                + "\"userId\":\"user.internal-trial\","
                + "\"deviceId\":\"device.internal-trial\","
                + "\"clientInstanceId\":\"019f7447-a784-77b2-a716-000000002103\","
                + "\"tokenId\":\"" + UUID.randomUUID() + "\","
                + "\"issuedAt\":\"" + now.minusSeconds(60) + "\","
                + "\"expiresAt\":\"" + now.plusSeconds(3_600) + "\","
                + "\"permissions\":[\"model.use\"]}";
        Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
        return encoder.encodeToString(header.getBytes(StandardCharsets.UTF_8))
                + "."
                + encoder.encodeToString(claims.getBytes(StandardCharsets.UTF_8))
                + ".controlled-trial-signature";
    }

    private static String compactLifecycleToken() throws Exception {
        Instant now = Instant.now();
        String header = base64Url(JSON.writeValueAsBytes(Map.of(
                "alg", "HS256", "typ", "JWT")));
        String claims = base64Url(JSON.writeValueAsBytes(Map.ofEntries(
                Map.entry("contractVersion", "v1alpha1"),
                Map.entry("issuer", "robothree-rsl1-repair1-local-trial"),
                Map.entry("audience", "enterprise-agent-lifecycle"),
                Map.entry("enterpriseId", "enterprise.internal-trial"),
                Map.entry("userId", "user.internal-trial"),
                Map.entry("deviceId", "device.local-trial"),
                Map.entry("clientInstanceId", UUID.randomUUID().toString()),
                Map.entry("tokenId", UUID.randomUUID().toString()),
                Map.entry("issuedAt", now.minusSeconds(30).toString()),
                Map.entry("expiresAt", now.plusSeconds(3_600).toString()),
                Map.entry("permissions", List.of("agent.manage")))));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(LIFECYCLE_TOKEN_KEY, "HmacSHA256"));
        return header + "." + claims + "." + base64Url(mac.doFinal(
                (header + "." + claims).getBytes(StandardCharsets.US_ASCII)));
    }

    private static String base64Url(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static Map<String, Object> trialProperties(Map<String, Object> overrides) {
        Map<String, Object> properties = new java.util.HashMap<>(Map.of(
                "server.address", "127.0.0.1",
                "server.port", "0",
                "robothree.model-gateway.enterprise-reasoning-v1alpha3-enabled", "true",
                "spring.main.banner-mode", "off",
                "logging.level.root", "WARN"));
        properties.putAll(overrides);
        return Map.copyOf(properties);
    }

    private record ProcessResult(int exitCode, String output) {}

    @SpringBootConfiguration
    @EnableAutoConfiguration(exclude = DataSourceAutoConfiguration.class)
    @Import(GlobalExceptionHandler.class)
    static class TrialApplication {

        private static final String BINDING_REVISION = "1".repeat(64);
        private static final String BINDING_DIGEST = "2".repeat(64);
        private static final String CREDENTIAL_REVISION = "3".repeat(64);
        private static final String CAPABILITY_PROFILE_REVISION = "4".repeat(64);
        private static final String TIMEOUT_PROFILE_REVISION = "5".repeat(64);

        @Bean
        CentralObservationRunner observations() {
            return CentralObservationRunner.noop();
        }

        @Bean
        ModelInvocationV1Alpha3Controller v1Alpha3Controller(
                ModelInvocationV1Alpha3GatewayService gateway,
                CentralObservationRunner observations) {
            return new ModelInvocationV1Alpha3Controller(gateway, observations);
        }

        @Bean
        OncePerRequestFilter v1Alpha3TrialBearerBridge() {
            return new OncePerRequestFilter() {
                @Override
                protected boolean shouldNotFilter(HttpServletRequest request) {
                    return !request.getRequestURI()
                            .startsWith("/v1alpha3/model-invocations");
                }

                @Override
                protected void doFilterInternal(
                        HttpServletRequest request,
                        HttpServletResponse response,
                        FilterChain filterChain)
                        throws ServletException, IOException {
                    String authorization = request.getHeader("Authorization");
                    if (authorization == null || !authorization.startsWith("Bearer ")) {
                        response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
                        return;
                    }
                    request.setAttribute(
                            EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE,
                            authorization.substring("Bearer ".length()));
                    try {
                        filterChain.doFilter(request, response);
                    } finally {
                        request.removeAttribute(
                                EnterpriseBearerTokenFilter.ACCESS_TOKEN_ATTRIBUTE);
                    }
                }
            };
        }

        @Bean
        TrialBindingResolver bindingResolver(Environment environment) {
            URI endpoint = URI.create(required(environment, ENDPOINT_ENV)).normalize();
            Protocol protocol = Protocol.valueOf(required(environment, PROTOCOL_ENV));
            if (protocol != Protocol.OPENAI_COMPATIBLE) {
                throw new IllegalStateException("DR-2 requires OPENAI_COMPATIBLE");
            }
            return new TrialBindingResolver(
                    endpoint,
                    required(environment, UPSTREAM_MODEL_ENV),
                    protocol);
        }

        @Bean
        ModelBindingRuntimeStateProvider bindingState() {
            return ignored -> new ModelBindingRuntimeStateProvider.RuntimeState(
                    true, false, true);
        }

        @Bean
        ModelCredentialResolver credentialResolver() {
            return (reference, revision) -> {
                if (!"credential.dr2.direct-provider".equals(reference)
                        || !CREDENTIAL_REVISION.equals(revision)) {
                    throw ModelGatewayException.unavailable(
                            "model_gateway.credential_unavailable",
                            "The model provider credential is unavailable.");
                }
                return new com.robothree.central.modelgateway.domain
                        .ModelInvocationExecution.CredentialResolution(reference, revision);
            };
        }

        @Bean(destroyMethod = "close")
        InMemoryCredentialMaterial credentialMaterial(Environment environment) {
            return new InMemoryCredentialMaterial(required(environment, KEY_ENV));
        }

        @Bean
        StrictModelProviderAdapterRegistry adapters(
                Environment environment,
                InMemoryCredentialMaterial credentialMaterial,
                TrialBindingResolver bindings,
                TrialProviderRecorder recorder) {
            if ("true".equals(environment.getProperty(CONTROLLED_PROVIDER_ENV))) {
                ModelProviderAdapter controlled = new ModelProviderAdapter() {
                    @Override
                    public Protocol protocol() {
                        return Protocol.OPENAI_COMPATIBLE;
                    }

                    @Override
                    public void stream(
                            com.robothree.central.modelgateway.provider.ModelProviderRequest request,
                            com.robothree.central.modelgateway.port.ModelStreamSink sink) {
                        sink.accept(new ModelProviderStreamEvent.TextDelta("收到。"));
                        sink.accept(new ModelProviderStreamEvent.Usage(16, 4));
                        sink.accept(new ModelProviderStreamEvent.Terminal("stop"));
                    }
                };
                return new StrictModelProviderAdapterRegistry(List.of(
                        recorder.wrap(controlled)));
            }
            HttpClient client = HttpClient.newBuilder()
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();
            JdkModelAuthorizedHttpTransport transport =
                    new JdkModelAuthorizedHttpTransport(
                            client,
                            credentialMaterial,
                            new StrictModelOutboundEndpointPolicy(
                                    Set.of(bindings.endpoint().getHost())));
            return new StrictModelProviderAdapterRegistry(List.of(
                    recorder.wrap(new OpenAiCompatibleModelProviderAdapter(transport))));
        }

        @Bean
        ModelInvocationRuntimePolicy runtimePolicy() {
            return ModelInvocationRuntimePolicy.developmentDefaults();
        }

        @Bean
        ModelInvocationEphemeralBuffer ephemeral(
                ModelInvocationRuntimePolicy policy) {
            return new ModelInvocationEphemeralBuffer(
                    policy.maximumEphemeralEvents(),
                    policy.maximumEphemeralUtf8Bytes());
        }

        @Bean
        TransientModelProviderRequestSource requestSource() {
            return new TransientModelProviderRequestSource();
        }

        @Bean
        TrialExecutionRecorder executionRecorder() {
            return new TrialExecutionRecorder();
        }

        @Bean
        TrialGatewayRecorder gatewayRecorder() {
            return new TrialGatewayRecorder();
        }

        @Bean
        TrialProviderRecorder providerRecorder() {
            return new TrialProviderRecorder();
        }

        @Bean
        TrialEntropySource entropySource() {
            return new TrialEntropySource();
        }

        @Bean
        InMemoryCentralPersistence persistence() {
            return new InMemoryCentralPersistence();
        }

        @Bean
        ModelInvocationRuntime runtime(
                TrialBindingResolver bindings,
                ModelBindingRuntimeStateProvider bindingState,
                ModelCredentialResolver credentials,
                StrictModelProviderAdapterRegistry adapters,
                ModelInvocationRuntimePolicy policy,
                ModelInvocationEphemeralBuffer ephemeral,
                TransientModelProviderRequestSource requests,
                TrialExecutionRecorder executionRecorder,
                TrialEntropySource entropySource,
                InMemoryCentralPersistence persistence) {
            Clock clock = Clock.systemUTC();
            var backend = new ProviderBackedModelInvocationExecutionBackend(
                    requests,
                    adapters,
                    new BufferedModelInvocationEphemeralPublisher(ephemeral, clock));
            ModelInvocationAccessAuthorizer authorizer = token -> {
                if (!ACCESS_TOKEN.equals(token)) {
                    throw ModelGatewayException.validation(
                            "access_token_invalid",
                            "The access token is invalid.");
                }
                return new ModelInvocationAccessAuthorizer.AuthorizedSubject(
                        "enterprise.internal-trial",
                        "user.internal-trial",
                        "device.internal-trial",
                        "019f7447-a784-77b2-a716-000000002103");
            };
            PromptCacheProfile cacheProfile = PromptCacheProfile.create(
                    "profile.dr2.disabled",
                    CAPABILITY_PROFILE_REVISION,
                    PromptCacheProfile.Status.DISABLED,
                    Protocol.OPENAI_COMPATIBLE,
                    List.of(ConnectionMode.DIRECT_PROVIDER),
                    PromptCacheProfile.ProjectionMode.OPENAI_PROMPT_CACHE_KEY,
                    "openai-compatible",
                    PromptCacheProfile.Assurance.PROVEN,
                    PromptCacheProfile.Assurance.PROVIDER_DOCUMENTED,
                    "6".repeat(64),
                    128);
            PromptCachePlanningService cachePlanning =
                    new PromptCachePlanningService(
                            persistence,
                            persistence,
                            new VersionedPromptCacheProfileRegistry(
                                    List.of(cacheProfile)),
                            new PromptCacheCompatibilityClassifier(),
                            new StaticPromptPrefixProjector(),
                            new DeterministicPromptCachePlanner(),
                            requests,
                            clock);
            return new ModelInvocationRuntime(
                    authorizer,
                    bindings,
                    bindingState,
                    credentials,
                    binding -> new StrictModelOutboundEndpointPolicy(
                            Set.of(bindings.endpoint().getHost()))
                            .validate(binding.endpoint()),
                    executionRecorder.wrap(backend),
                    persistence,
                    persistence,
                    persistence,
                    persistence,
                    persistence,
                    persistence,
                    policy,
                    entropySource,
                    ephemeral,
                    ModelInvocationAdmissionPolicy.development(),
                    persistence,
                    cachePlanning,
                    clock);
        }

        @Bean
        ModelInvocationV1Alpha3GatewayService gateway(
                ModelInvocationRuntime runtime,
                TransientModelProviderRequestSource requests,
                ModelInvocationEphemeralBuffer ephemeral,
                TrialBindingResolver bindings,
                TrialGatewayRecorder recorder) {
            var reasoning = new EnterpriseReasoningSecondValidator(
                    new ReleasePinnedEnterpriseReasoningMappingSource(List.of()));
            var delegate = new DurableModelInvocationV1Alpha3GatewayService(
                    runtime,
                    requests,
                    ephemeral,
                    bindings,
                    reasoning,
                    "central.dr2-node",
                    256);
            return recorder.wrap(delegate);
        }

        private static String required(Environment environment, String name) {
            String value = environment.getProperty(name);
            if (value == null || value.isBlank()) {
                throw new IllegalStateException("DR-2 environment is incomplete: " + name);
            }
            return value;
        }
    }

    @Configuration(proxyBeanMethods = false)
    @MapperScan(basePackageClasses = AgentLifecyclePersistenceMapper.class)
    static class LifecycleTrialConfiguration {
        static DataSource dataSource;

        @Bean(destroyMethod = "")
        DataSource lifecycleDataSource() {
            if (dataSource == null) {
                throw new IllegalStateException("local_trial_lifecycle_data_source_missing");
            }
            return dataSource;
        }

        @Bean
        PlatformTransactionManager lifecycleTransactionManager(DataSource source) {
            return new DataSourceTransactionManager(source);
        }

        @Bean
        SpringCentralTransactionRunner lifecycleTransactionRunner(
                PlatformTransactionManager transactionManager) {
            return new SpringCentralTransactionRunner(transactionManager);
        }

        @Bean
        MyBatisAgentLifecycleStore lifecycleStore(AgentLifecyclePersistenceMapper mapper) {
            return new MyBatisAgentLifecycleStore(mapper);
        }

        @Bean
        CentralTraceContext lifecycleTraceContext() {
            return CentralTraceContext.noop();
        }

        @Bean
        EnterpriseBearerTokenFilter lifecycleBearerTokenFilter(
                ObjectMapper objectMapper,
                CentralTraceContext traceContext) {
            return new EnterpriseBearerTokenFilter(objectMapper, traceContext);
        }

        @Bean
        AdminReadRequestAuthorizer lifecycleAdminAuthorizer() {
            return new AdminReadRequestAuthorizer(new AdminCapabilityProjectionService(
                    new DevelopmentAdminPrincipalProvider()));
        }

        @Bean
        Clock lifecycleClock() {
            return Clock.systemUTC();
        }

        @Bean
        InternalTrialAgentLifecycleTokenAuthorizer lifecycleTokenAuthorizer(
                Clock lifecycleClock) {
            return new InternalTrialAgentLifecycleTokenAuthorizer(
                    LIFECYCLE_TOKEN_KEY_BASE64, lifecycleClock);
        }

        @Bean
        AgentLifecycleCommandService lifecycleCommandService(
                AgentLifecycleStore store,
                SpringCentralTransactionRunner transactions,
                Clock lifecycleClock) {
            return new AgentLifecycleCommandService(store, transactions, lifecycleClock,
                    new RobotAvatarImageValidator());
        }

        @Bean
        AgentLifecycleHttpController lifecycleHttpController(
                AgentLifecycleCommandService service,
                InternalTrialAgentLifecycleTokenAuthorizer tokens) {
            return new AgentLifecycleHttpController(service, tokens);
        }

        @Bean
        AgentLifecycleReviewHttpController lifecycleReviewHttpController(
                AgentLifecycleCommandService service,
                AdminReadRequestAuthorizer authorizer) {
            return new AgentLifecycleReviewHttpController(service, authorizer);
        }

        @Bean
        AgentLifecycleHttpExceptionHandler lifecycleHttpExceptionHandler() {
            return new AgentLifecycleHttpExceptionHandler();
        }
    }

    static final class TrialGatewayRecorder {
        private final AtomicReference<String> latest =
                new AtomicReference<>("no_gateway_failure");
        private final ConcurrentHashMap<UUID, java.util.concurrent.atomic.AtomicInteger>
                subscriptionCounts = new ConcurrentHashMap<>();
        private final CopyOnWriteArrayList<ModelInvocationGatewayService.LiveSubscription>
                subscriptions = new CopyOnWriteArrayList<>();

        ModelInvocationV1Alpha3GatewayService wrap(
                ModelInvocationV1Alpha3GatewayService delegate) {
            return new ModelInvocationV1Alpha3GatewayService() {
                @Override
                public com.robothree.central.modelgateway.domain.ModelInvocation accept(
                        String compactToken,
                        ModelInvocationRuntime.AcceptCommand command,
                        String canonicalProviderRequestJson,
                        String sessionScopeDigest,
                        String cacheContextDigest,
                        com.robothree.central.modelgateway.application
                                .EnterpriseReasoningSafeIdentity reasoning) {
                    try {
                        return delegate.accept(
                                compactToken,
                                command,
                                canonicalProviderRequestJson,
                                sessionScopeDigest,
                                cacheContextDigest,
                                reasoning);
                    } catch (RuntimeException exception) {
                        record(exception);
                        throw exception;
                    }
                }

                @Override
                public com.robothree.central.modelgateway.domain.ModelInvocation status(
                        String compactToken,
                        UUID invocationId) {
                    try {
                        return delegate.status(compactToken, invocationId);
                    } catch (RuntimeException exception) {
                        record(exception);
                        throw exception;
                    }
                }

                @Override
                public com.robothree.central.modelgateway.domain.ModelInvocation cancel(
                        String compactToken,
                        UUID invocationId,
                        long expectedStatusRevision,
                        String reason) {
                    try {
                        return delegate.cancel(
                                compactToken,
                                invocationId,
                                expectedStatusRevision,
                                reason);
                    } catch (RuntimeException exception) {
                        record(exception);
                        throw exception;
                    }
                }

                @Override
                public ModelInvocationGatewayService.LiveSubscription subscribe(
                        String compactToken,
                        UUID invocationId,
                        long afterDurableSequence) {
                    try {
                        subscriptionCounts.computeIfAbsent(
                                invocationId,
                                ignored -> new java.util.concurrent.atomic.AtomicInteger())
                                .incrementAndGet();
                        var subscription = delegate.subscribe(
                                compactToken,
                                invocationId,
                                afterDurableSequence);
                        subscriptions.add(subscription);
                        return subscription;
                    } catch (RuntimeException exception) {
                        record(exception);
                        throw exception;
                    }
                }
            };
        }

        private void record(RuntimeException exception) {
            latest.set(exception instanceof ModelGatewayException gateway
                    ? gateway.code()
                    : exception.getClass().getSimpleName());
        }

        String safeDiagnostic() {
            long duplicateSubscriptions = subscriptionCounts.values().stream()
                    .filter(count -> count.get() > 1)
                    .count();
            return latest.get()
                    + ";subscriptions="
                    + subscriptionCounts.values().stream()
                            .mapToInt(java.util.concurrent.atomic.AtomicInteger::get)
                            .sum()
                    + ";duplicate_invocations="
                    + duplicateSubscriptions
                    + ";continuity="
                    + subscriptions.stream()
                            .map(ModelInvocationGatewayService.LiveSubscription
                                    ::continuityFailureCode)
                            .reduce((left, right) -> left + "|" + right)
                            .orElse("none");
        }
    }

    static final class TrialProviderRecorder {
        private final AtomicReference<String> latest =
                new AtomicReference<>("no_provider_failure");
        private final CopyOnWriteArrayList<String> invocationSummaries =
                new CopyOnWriteArrayList<>();

        ModelProviderAdapter wrap(ModelProviderAdapter delegate) {
            return new ModelProviderAdapter() {
                @Override
                public Protocol protocol() {
                    return delegate.protocol();
                }

                @Override
                public void stream(
                        com.robothree.central.modelgateway.provider.ModelProviderRequest request,
                        com.robothree.central.modelgateway.port.ModelStreamSink sink) {
                    var textDeltaCount = new java.util.concurrent.atomic.AtomicInteger();
                    var toolCallDeltaCount = new java.util.concurrent.atomic.AtomicInteger();
                    var terminalReason = new AtomicReference<>("missing");
                    var recordingSink = new com.robothree.central.modelgateway.port.ModelStreamSink() {
                        @Override
                        public void accept(ModelProviderStreamEvent event) {
                            if (event instanceof ModelProviderStreamEvent.TextDelta) {
                                textDeltaCount.incrementAndGet();
                            } else if (event instanceof ModelProviderStreamEvent.ToolCallDelta) {
                                toolCallDeltaCount.incrementAndGet();
                            } else if (event instanceof ModelProviderStreamEvent.Terminal terminal) {
                                terminalReason.set(safeToken(terminal.finishReason()));
                            }
                            sink.accept(event);
                        }

                        @Override
                        public boolean cancellationRequested() {
                            return sink.cancellationRequested();
                        }
                    };
                    try {
                        delegate.stream(request, recordingSink);
                    } catch (RuntimeException exception) {
                        latest.set(safeProviderFailure(exception));
                        throw exception;
                    } finally {
                        invocationSummaries.add("text="
                                + textDeltaCount.get()
                                + ",tool="
                                + toolCallDeltaCount.get()
                                + ",finish="
                                + terminalReason.get());
                    }
                }
            };
        }

        private static String safeProviderFailure(RuntimeException exception) {
            if (exception instanceof ModelGatewayException gateway) {
                return gateway.code();
            }
            String category = exception instanceof IllegalArgumentException
                    ? switch (String.valueOf(exception.getMessage())) {
                        case "tool call index is invalid" -> "tool_call_index_invalid";
                        case "tool call delta is empty" -> "tool_call_delta_empty";
                        case "usage tokens must not be negative" -> "usage_negative";
                        case "optional usage tokens must not be negative" ->
                            "optional_usage_negative";
                        case "text must not be blank" -> "text_blank";
                        case "finishReason must not be blank" -> "finish_reason_blank";
                        default -> "other_illegal_argument";
                    }
                    : exception.getClass().getSimpleName();
            StackTraceElement[] stack = exception.getStackTrace();
            String location = stack.length == 0
                    ? "unknown_location"
                    : stack[0].getClassName()
                            + "."
                            + stack[0].getMethodName()
                            + ":"
                            + stack[0].getLineNumber();
            return category + "@" + location;
        }

        String safeDiagnostic() {
            return latest.get() + ";invocations=" + String.join("|", invocationSummaries);
        }

        private static String safeToken(String value) {
            return value != null && value.matches("[a-zA-Z0-9_.-]{1,64}")
                    ? value
                    : "unknown";
        }
    }

    static final class TrialEntropySource
            implements com.robothree.central.modelgateway.port
                    .ModelInvocationEntropySource {
        private final CopyOnWriteArrayList<UUID> generatedIds =
                new CopyOnWriteArrayList<>();

        @Override
        public UUID nextUuid() {
            UUID value = UUID.randomUUID();
            generatedIds.add(value);
            return value;
        }

        List<UUID> generatedIds() {
            return List.copyOf(generatedIds);
        }
    }

    static final class TrialExecutionRecorder {
        private final AtomicReference<String> latest =
                new AtomicReference<>("no_execution_result");

        ModelInvocationExecutionBackend wrap(ModelInvocationExecutionBackend delegate) {
            return new ModelInvocationExecutionBackend() {
                @Override
                public com.robothree.central.modelgateway.domain
                        .ModelInvocationExecution.Result execute(
                                com.robothree.central.modelgateway.domain
                                        .ModelInvocationExecution.Request request,
                                BooleanSupplier cancellationRequested) {
                    var result = delegate.execute(request, cancellationRequested);
                    latest.set(result.outcome().name()
                            + ":"
                            + (result.safeErrorCode() == null
                                    ? "none"
                                    : result.safeErrorCode()));
                    return result;
                }

                @Override
                public com.robothree.central.modelgateway.domain
                        .ModelInvocationExecution.RecoveryEvidence query(
                                com.robothree.central.modelgateway.domain
                                        .ModelInvocationExecution.Request request) {
                    return delegate.query(request);
                }

                @Override
                public void requestCancel(UUID invocationId) {
                    delegate.requestCancel(invocationId);
                }
            };
        }

        String safeDiagnostic() {
            return latest.get();
        }
    }

    static final class TrialBindingResolver implements ModelEndpointBindingResolver {
        private final URI endpoint;
        private final String upstreamModelId;
        private final Protocol protocol;
        private final Map<String, ModelEndpointBinding> decisions =
                new ConcurrentHashMap<>();

        TrialBindingResolver(URI endpoint, String upstreamModelId, Protocol protocol) {
            this.endpoint = endpoint;
            this.upstreamModelId = upstreamModelId;
            this.protocol = protocol;
        }

        URI endpoint() {
            return endpoint;
        }

        @Override
        public ModelEndpointBinding resolveForSelection(
                ModelEndpointBinding.Selection selection) {
            if (!"model.internal-trial".equals(selection.modelId())) {
                throw ModelGatewayException.unavailable(
                        "model_gateway.binding_unavailable",
                        "The selected model binding is unavailable.");
            }
            ModelEndpointBinding binding = new ModelEndpointBinding(
                    "binding.dr2.direct-provider",
                    TrialApplication.BINDING_REVISION,
                    TrialApplication.BINDING_DIGEST,
                    selection.modelId(),
                    upstreamModelId,
                    selection.modelRevision(),
                    selection.configurationRevision(),
                    selection.runtimeRegistryGeneration(),
                    ConnectionMode.DIRECT_PROVIDER,
                    protocol,
                    endpoint,
                    "credential.dr2.direct-provider",
                    TrialApplication.CREDENTIAL_REVISION,
                    TrialApplication.CAPABILITY_PROFILE_REVISION,
                    TrialApplication.TIMEOUT_PROFILE_REVISION,
                    RecoveryMode.MANUAL_RECONCILIATION);
            decisions.put(
                    ModelDispatchDecision.fromBinding(binding).decisionDigest(),
                    binding);
            return binding;
        }

        @Override
        public ModelEndpointBinding resolveDispatchDecision(String decisionDigest) {
            ModelEndpointBinding binding = decisions.get(decisionDigest);
            if (binding == null) {
                throw ModelGatewayException.unavailable(
                        "model_gateway.binding_unavailable",
                        "The selected model binding is unavailable.");
            }
            return binding;
        }
    }

    static final class InMemoryCredentialMaterial
            implements ModelCredentialMaterialSource, AutoCloseable {
        private final char[] key;

        InMemoryCredentialMaterial(String key) {
            this.key = key.toCharArray();
        }

        @Override
        public char[] resolve(String reference, String revision) {
            if (!"credential.dr2.direct-provider".equals(reference)
                    || !TrialApplication.CREDENTIAL_REVISION.equals(revision)) {
                throw ModelGatewayException.unavailable(
                        "model_gateway.credential_unavailable",
                        "The model provider credential is unavailable.");
            }
            return Arrays.copyOf(key, key.length);
        }

        @Override
        @PreDestroy
        public void close() {
            Arrays.fill(key, '\0');
        }
    }
}
