package com.robothree.central.modelgateway.provider;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.adapter.http.JdkModelAuthorizedHttpTransport;
import com.robothree.central.modelgateway.adapter.http.StrictModelOutboundEndpointPolicy;
import com.robothree.central.modelgateway.adapter.provider.AnthropicCompatibleModelProviderAdapter;
import com.robothree.central.modelgateway.adapter.provider.OpenAiCompatibleModelProviderAdapter;
import com.robothree.central.modelgateway.adapter.runtime.ProviderBackedModelInvocationExecutionBackend;
import com.robothree.central.modelgateway.adapter.runtime.StrictModelProviderAdapterRegistry;
import com.robothree.central.modelgateway.application.VersionedPromptCacheMarkerPolicyRegistry;
import com.robothree.central.modelgateway.application.DeterministicPromptCachePlanner;
import com.robothree.central.modelgateway.application.ModelInvocationAdmissionPolicy;
import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime;
import com.robothree.central.modelgateway.application.ModelInvocationRuntimePolicy;
import com.robothree.central.modelgateway.application.PromptCacheCompatibilityClassifier;
import com.robothree.central.modelgateway.application.PromptCachePlanningService;
import com.robothree.central.modelgateway.application.ProviderCacheProjectionResolver;
import com.robothree.central.modelgateway.application.StaticPromptPrefixProjector;
import com.robothree.central.modelgateway.application.TransientModelProviderRequestSource;
import com.robothree.central.modelgateway.application.VersionedPromptCacheProfileRegistry;
import com.robothree.central.modelgateway.development.DevelopmentModelBindingStateProvider;
import com.robothree.central.modelgateway.development.DevelopmentModelCredentialResolver;
import com.robothree.central.modelgateway.development.FixedSyntheticModelProviderRequestSource;
import com.robothree.central.modelgateway.development.VersionedDevelopmentModelBindingRegistry;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution;
import com.robothree.central.modelgateway.domain.ProviderCacheProjection;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.modelgateway.domain.ProviderUsageFact;
import com.robothree.central.modelgateway.port.ModelBindingRuntimeStateProvider.RuntimeState;
import com.robothree.central.modelgateway.port.ModelInvocationEphemeralPublisher;
import com.robothree.central.modelgateway.port.ModelProviderAdapter;
import com.robothree.central.shared.json.CanonicalJson;
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.Clock;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class Arh323ControlledProviderProcessIntegrationTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final String E = "e".repeat(64);
    private static final String F = "f".repeat(64);
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(Duration.ofSeconds(2))
            .build();

    @Test
    void provesBothCacheEnabledProtocolsAndProviderReportedUsageOutOfProcess()
            throws Exception {
        for (Protocol protocol : Protocol.values()) {
            try (ControlledProvider provider = ControlledProvider.start("SUCCESS")) {
                ProviderCacheProjection projection = projection(protocol);
                ModelInvocationExecution.Result result = backend(
                                provider,
                                protocol,
                                projection)
                        .execute(executionRequest(provider, protocol, Duration.ofSeconds(3)),
                                () -> false);

                assertThat(result.outcome())
                        .isEqualTo(ModelInvocationExecution.Outcome.COMPLETED);
                assertThat(result.usage().inputTokens()).isEqualTo(8);
                assertThat(result.usage().outputTokens()).isEqualTo(4);
                assertThat(result.usage().cacheReadInputTokens()).isEqualTo(3);
                if (protocol == Protocol.ANTHROPIC_COMPATIBLE) {
                    assertThat(result.usage().cacheWriteInputTokens()).isEqualTo(2);
                } else {
                    assertThat(result.usage().cacheWriteInputTokens()).isNull();
                }
                JsonNode evidence = provider.evidence();
                assertThat(evidence.path("requestCount").asInt()).isEqualTo(1);
                assertThat(evidence.path("forbiddenRetentionPresent").asBoolean())
                        .isFalse();
                if (protocol == Protocol.ANTHROPIC_COMPATIBLE) {
                    assertThat(evidence.path("cacheMarkerCount").asInt()).isEqualTo(1);
                    assertThat(evidence.path("promptCacheKeyPresent").asBoolean())
                            .isFalse();
                } else {
                    assertThat(evidence.path("cacheMarkerCount").asInt()).isZero();
                    assertThat(evidence.path("promptCacheKeyPresent").asBoolean())
                            .isTrue();
                }
                assertThat(evidence.path("requestBodyDigest").asText()).hasSize(64);
            }
        }
    }

    @Test
    void providerUsageBecomesOneDurableWinnerFactThroughTheRealRuntime()
            throws Exception {
        try (ControlledProvider provider = ControlledProvider.start("SUCCESS")) {
            String canonical = providerNeutralRequest();
            String acceptDigest = CanonicalJson.sha256("arh323.accept.v1");
            TransientModelProviderRequestSource requests =
                    new TransientModelProviderRequestSource();
            requests.register(acceptDigest, canonical);
            ModelEndpointBinding binding = binding(
                    provider,
                    Protocol.OPENAI_COMPATIBLE);
            var markerPolicy = VersionedPromptCacheMarkerPolicyRegistry.defaultPolicies()
                    .stream()
                    .filter(value -> value.policyId().equals(
                            VersionedPromptCacheMarkerPolicyRegistry.OPENAI_KEY_POLICY_ID))
                    .findFirst()
                    .orElseThrow();
            PromptCacheProfile profile = PromptCacheProfile.create(
                    "profile.arh323",
                    binding.capabilityProfileRevision(),
                    PromptCacheProfile.Status.ACTIVE,
                    Protocol.OPENAI_COMPATIBLE,
                    List.of(ConnectionMode.DIRECT_PROVIDER),
                    PromptCacheProfile.ProjectionMode.OPENAI_PROMPT_CACHE_KEY,
                    "route.controlled",
                    PromptCacheProfile.Assurance.PROVEN,
                    PromptCacheProfile.Assurance.PROVIDER_DOCUMENTED,
                    markerPolicy.policyRevision(),
                    64);
            var profiles = new VersionedPromptCacheProfileRegistry(List.of(profile));
            var compatibility = new PromptCacheCompatibilityClassifier();
            var staticPrefix = new StaticPromptPrefixProjector();
            Clock clock = Clock.system(ZoneOffset.UTC);
            InMemoryCentralPersistence persistence =
                    new InMemoryCentralPersistence(clock);
            PromptCachePlanningService planning = new PromptCachePlanningService(
                    persistence,
                    persistence,
                    profiles,
                    compatibility,
                    staticPrefix,
                    new DeterministicPromptCachePlanner(),
                    requests,
                    clock);
            ProviderCacheProjectionResolver projectionResolver =
                    new ProviderCacheProjectionResolver(
                            persistence,
                            profiles,
                            VersionedPromptCacheMarkerPolicyRegistry.defaults(),
                            compatibility,
                            staticPrefix);
            ProviderBackedModelInvocationExecutionBackend backend =
                    new ProviderBackedModelInvocationExecutionBackend(
                            requests,
                            new StrictModelProviderAdapterRegistry(List.of(adapter(
                                    provider,
                                    Protocol.OPENAI_COMPATIBLE))),
                            new NoopEphemeralPublisher(),
                            projectionResolver);
            DevelopmentModelBindingStateProvider state =
                    new DevelopmentModelBindingStateProvider();
            state.set(binding.reference(), new RuntimeState(true, false, true));
            DevelopmentModelCredentialResolver credentials =
                    new DevelopmentModelCredentialResolver();
            credentials.register(binding.credentialReference(), E);
            var registry = new VersionedDevelopmentModelBindingRegistry(
                    List.of(binding));
            ModelInvocationRuntimePolicy runtimePolicy =
                    ModelInvocationRuntimePolicy.developmentDefaults();
            ModelInvocationRuntime runtime = new ModelInvocationRuntime(
                    token -> new com.robothree.central.modelgateway.port
                            .ModelInvocationAccessAuthorizer.AuthorizedSubject(
                                    "enterprise.alpha",
                                    "user.alpha",
                                    "device.alpha",
                                    "client.alpha"),
                    registry,
                    state,
                    credentials,
                    ignored -> {},
                    backend,
                    persistence,
                    persistence,
                    persistence,
                    persistence,
                    persistence,
                    persistence,
                    runtimePolicy,
                    UUID::randomUUID,
                    new ModelInvocationEphemeralBuffer(
                            runtimePolicy.maximumEphemeralEvents(),
                            runtimePolicy.maximumEphemeralUtf8Bytes()),
                    ModelInvocationAdmissionPolicy.development(),
                    persistence,
                    planning,
                    clock);
            Instant now = clock.instant();
            ModelInvocationRuntime.AcceptCommand command =
                    new ModelInvocationRuntime.AcceptCommand(
                            UUID.randomUUID(),
                            UUID.randomUUID(),
                            acceptDigest,
                            binding.modelId(),
                            binding.modelRevision(),
                            binding.configurationRevision(),
                            binding.runtimeRegistryGeneration(),
                            "user_confirmed",
                            B,
                            now.plusSeconds(10),
                            2_000);
            var accepted = runtime.acceptV1Alpha2(
                    "valid-token",
                    command,
                    D,
                    C);
            var completed = runtime.execute(
                    accepted.invocationId(),
                    "central.node-arh323");

            assertThat(completed.status().name()).isEqualTo("COMPLETED");
            assertThat(persistence.findPlanByInvocationId(accepted.invocationId()))
                    .get()
                    .extracting(plan -> plan.eligible())
                    .isEqualTo(true);
            assertThat(persistence.findByInvocation(accepted.invocationId()))
                    .singleElement()
                    .satisfies(fact -> {
                        assertThat(fact.attemptDisposition())
                                .isEqualTo(ProviderUsageFact.AttemptDisposition
                                        .TERMINAL_WINNER);
                        assertThat(fact.cacheReadInputTokens()).isEqualTo(3);
                        assertThat(fact.cacheWriteInputTokens()).isNull();
                    });
            assertThat(provider.evidence().path("promptCacheKeyPresent").asBoolean())
                    .isTrue();
        }
    }

    @Test
    void provesC8AndC9StayUncertainWithoutDroppingTheProjection() throws Exception {
        for (String scenario : List.of("ACCEPT_NO_OUTPUT", "PARTIAL_OUTPUT")) {
            try (ControlledProvider provider = ControlledProvider.start(scenario)) {
                ProviderCacheProjection projection = projection(
                        Protocol.OPENAI_COMPATIBLE);
                var backend = backend(
                        provider,
                        Protocol.OPENAI_COMPATIBLE,
                        projection);
                var request = executionRequest(
                        provider,
                        Protocol.OPENAI_COMPATIBLE,
                        Duration.ofSeconds(3));

                ModelInvocationExecution.Result first = backend.execute(request, () -> false);
                String firstDigest = provider.evidence()
                        .path("requestBodyDigest").asText();
                ModelInvocationExecution.Result second = backend.execute(request, () -> false);
                JsonNode evidence = provider.evidence();

                assertThat(first.outcome())
                        .isEqualTo(ModelInvocationExecution.Outcome.UNCERTAIN);
                assertThat(second.outcome())
                        .isEqualTo(ModelInvocationExecution.Outcome.UNCERTAIN);
                assertThat(evidence.path("requestCount").asInt()).isEqualTo(2);
                assertThat(evidence.path("requestBodyDigest").asText())
                        .isEqualTo(firstDigest);
                assertThat(evidence.path("promptCacheKeyPresent").asBoolean())
                        .isTrue();
            }
        }
    }

    @Test
    void deterministicRejectDoesNotRetryWithoutCache() throws Exception {
        try (ControlledProvider provider = ControlledProvider.start(
                "DETERMINISTIC_REJECT")) {
            ModelInvocationExecution.Result result = backend(
                            provider,
                            Protocol.ANTHROPIC_COMPATIBLE,
                            projection(Protocol.ANTHROPIC_COMPATIBLE))
                    .execute(executionRequest(
                                    provider,
                                    Protocol.ANTHROPIC_COMPATIBLE,
                                    Duration.ofSeconds(3)),
                            () -> false);

            assertThat(result.outcome())
                    .isEqualTo(ModelInvocationExecution.Outcome.FAILED);
            assertThat(result.safeErrorCode())
                    .isEqualTo("model_gateway.provider_response_invalid");
            assertThat(provider.evidence().path("requestCount").asInt()).isEqualTo(1);
        }
    }

    @Test
    void deadlineRemainsTypedAndResourcesReturnToZero() throws Exception {
        ControlledProvider provider = ControlledProvider.start("DELAYED_SUCCESS");
        int port = provider.port();
        long child = provider.processId();
        try {
            ModelInvocationExecution.Result result = backend(
                            provider,
                            Protocol.OPENAI_COMPATIBLE,
                            projection(Protocol.OPENAI_COMPATIBLE))
                    .execute(executionRequest(
                                    provider,
                                    Protocol.OPENAI_COMPATIBLE,
                                    Duration.ofMillis(80)),
                            () -> false);
            assertThat(result.outcome())
                    .isEqualTo(ModelInvocationExecution.Outcome.TIMED_OUT);
        } finally {
            provider.close();
        }
        assertThat(ProcessHandle.of(child).map(ProcessHandle::isAlive).orElse(false))
                .isFalse();
        assertThat(canConnect(port)).isFalse();
    }

    private static ProviderBackedModelInvocationExecutionBackend backend(
            ControlledProvider provider,
            Protocol protocol,
            ProviderCacheProjection projection) {
        String canonical = providerNeutralRequest();
        ModelProviderAdapter adapter = adapter(provider, protocol);
        return new ProviderBackedModelInvocationExecutionBackend(
                new FixedSyntheticModelProviderRequestSource(List.of(canonical)),
                new StrictModelProviderAdapterRegistry(List.of(adapter)),
                new NoopEphemeralPublisher(),
                (request, resolved) -> projection);
    }

    private static ModelProviderAdapter adapter(
            ControlledProvider provider,
            Protocol protocol) {
        var transport = new JdkModelAuthorizedHttpTransport(
                HttpClient.newBuilder()
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .connectTimeout(Duration.ofSeconds(1))
                        .build(),
                (reference, revision) -> "controlled-provider-key".toCharArray(),
                new StrictModelOutboundEndpointPolicy(
                        java.util.Set.of("127.0.0.1"),
                        host -> java.net.InetAddress.getAllByName(host),
                        true));
        return protocol == Protocol.ANTHROPIC_COMPATIBLE
                ? new AnthropicCompatibleModelProviderAdapter(transport)
                : new OpenAiCompatibleModelProviderAdapter(transport);
    }

    private static ModelInvocationExecution.Request executionRequest(
            ControlledProvider provider,
            Protocol protocol,
            Duration deadlineFromNow) {
        String canonical = providerNeutralRequest();
        return new ModelInvocationExecution.Request(
                UUID.randomUUID(),
                CanonicalJson.sha256(canonical),
                "model.synthetic",
                binding(provider, protocol),
                new ModelInvocationExecution.CredentialResolution(
                        "credential.controlled",
                        E),
                1,
                Instant.now().plus(deadlineFromNow),
                Duration.ofSeconds(1));
    }

    private static ModelEndpointBinding binding(
            ControlledProvider provider,
            Protocol protocol) {
        return new ModelEndpointBinding(
                "binding.controlled",
                A,
                B,
                "model.synthetic",
                "model.synthetic",
                C,
                D,
                E,
                ConnectionMode.DIRECT_PROVIDER,
                protocol,
                provider.baseUri(),
                "credential.controlled",
                E,
                F,
                A,
                RecoveryMode.MANUAL_RECONCILIATION);
    }

    private static ProviderCacheProjection projection(Protocol protocol) {
        if (protocol == Protocol.ANTHROPIC_COMPATIBLE) {
            var policy = VersionedPromptCacheMarkerPolicyRegistry.defaultPolicies()
                    .stream()
                    .filter(value -> value.policyId().equals(
                            VersionedPromptCacheMarkerPolicyRegistry
                                    .ANTHROPIC_SYSTEM_POLICY_ID))
                    .findFirst()
                    .orElseThrow();
            return ProviderCacheProjection.AnthropicExplicit.of(policy);
        }
        var policy = VersionedPromptCacheMarkerPolicyRegistry.defaultPolicies()
                .stream()
                .filter(value -> value.policyId().equals(
                        VersionedPromptCacheMarkerPolicyRegistry.OPENAI_KEY_POLICY_ID))
                .findFirst()
                .orElseThrow();
        return ProviderCacheProjection.OpenAiPromptCacheKey.of(
                F,
                64,
                policy.policyRevision());
    }

    private static String providerNeutralRequest() {
        ObjectNode root = JSON.createObjectNode();
        root.put("snapshotId", "11111111-1111-4111-8111-111111111111");
        root.put("contextSourceDigest", A);
        root.putObject("model")
                .put("modelId", "model.synthetic")
                .put("modelRevision", C)
                .put("configurationRevision", D)
                .put("runtimeRegistryGeneration", E);
        var messages = root.putArray("messages");
        messages.addObject()
                .put("role", "system")
                .put("sourceId", "platform.rules")
                .put("sourceRevision", A)
                .put("sourceDigest", B)
                .putArray("content")
                .addObject()
                .put("type", "text")
                .put("text", "Controlled static instruction.");
        messages.addObject()
                .put("role", "user")
                .putArray("content")
                .addObject()
                .put("type", "text")
                .put("text", "Controlled dynamic input. arh323-canary-9f7d1b72");
        root.putArray("tools");
        root.put("maxOutputTokens", 64);
        return CanonicalJson.canonicalize(root);
    }

    private static boolean canConnect(int port) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", port), 200);
            return true;
        } catch (IOException expected) {
            return false;
        }
    }

    private static final class NoopEphemeralPublisher
            implements ModelInvocationEphemeralPublisher {
        @Override
        public void publishText(UUID invocationId, String delta) {}

        @Override
        public void clear(UUID invocationId) {}
    }

    private static final class ControlledProvider implements AutoCloseable {

        private final int port;
        private final Process process;
        private final Thread outputDrainer;

        private ControlledProvider(int port, Process process, Thread outputDrainer) {
            this.port = port;
            this.process = process;
            this.outputDrainer = outputDrainer;
        }

        static ControlledProvider start(String scenario) throws Exception {
            int port = availablePort();
            String classPath = System.getProperty(
                    "surefire.test.class.path",
                    System.getProperty("java.class.path"));
            Path java = Path.of(System.getProperty("java.home"), "bin", "java");
            ProcessBuilder builder = new ProcessBuilder(
                    java.toString(),
                    "-cp",
                    classPath,
                    Arh323ControlledProviderProcessMain.class.getName(),
                    Integer.toString(port),
                    scenario);
            builder.redirectErrorStream(true);
            Process process = builder.start();
            StringBuilder output = new StringBuilder();
            Thread drainer = Thread.ofPlatform().daemon(true).start(() -> {
                try (var input = process.getInputStream()) {
                    byte[] buffer = new byte[1_024];
                    int read;
                    while ((read = input.read(buffer)) >= 0) {
                        synchronized (output) {
                            output.append(new String(
                                    buffer,
                                    0,
                                    read,
                                    StandardCharsets.UTF_8));
                            if (output.length() > 8_192) {
                                output.delete(0, output.length() - 8_192);
                            }
                        }
                    }
                } catch (IOException ignored) {
                    // Process shutdown closes the stream.
                }
            });
            ControlledProvider provider = new ControlledProvider(port, process, drainer);
            provider.awaitReady(output);
            return provider;
        }

        URI baseUri() {
            return URI.create("http://127.0.0.1:" + port + "/base");
        }

        int port() {
            return port;
        }

        long processId() {
            return process.pid();
        }

        JsonNode evidence() throws Exception {
            HttpResponse<String> response = HTTP.send(
                    HttpRequest.newBuilder(URI.create(
                                    "http://127.0.0.1:" + port + "/evidence"))
                            .timeout(Duration.ofSeconds(2))
                            .GET()
                            .build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            assertThat(response.statusCode()).isEqualTo(200);
            return JSON.readTree(response.body());
        }

        private void awaitReady(StringBuilder output) throws Exception {
            long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
            while (System.nanoTime() < deadline) {
                if (!process.isAlive()) {
                    throw new IllegalStateException("controlled Provider exited early: "
                            + safeOutput(output));
                }
                try {
                    HttpResponse<String> response = HTTP.send(
                            HttpRequest.newBuilder(URI.create(
                                            "http://127.0.0.1:" + port + "/health"))
                                    .timeout(Duration.ofSeconds(1))
                                    .GET()
                                    .build(),
                            HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                    if (response.statusCode() == 200) return;
                } catch (IOException ignored) {
                    // Still starting.
                }
                Thread.sleep(50);
            }
            throw new IllegalStateException("controlled Provider did not become ready: "
                    + safeOutput(output));
        }

        @Override
        public void close() {
            if (process.isAlive()) {
                process.destroy();
                try {
                    if (!process.waitFor(5, TimeUnit.SECONDS)) {
                        process.destroyForcibly();
                        process.waitFor(5, TimeUnit.SECONDS);
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    process.destroyForcibly();
                }
            }
            try {
                outputDrainer.join(Duration.ofSeconds(1));
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        }

        private static int availablePort() throws IOException {
            try (ServerSocket socket = new ServerSocket(0)) {
                return socket.getLocalPort();
            }
        }

        private static String safeOutput(StringBuilder output) {
            synchronized (output) {
                return output.toString()
                        .replaceAll("(?i)(credential|secret|token|key)=[^\\s]+",
                                "$1=<redacted>");
            }
        }
    }
}
