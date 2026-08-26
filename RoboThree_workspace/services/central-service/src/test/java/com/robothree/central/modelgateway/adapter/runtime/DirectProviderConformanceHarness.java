package com.robothree.central.modelgateway.adapter.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.adapter.http.JdkModelAuthorizedHttpTransport;
import com.robothree.central.modelgateway.adapter.http.StrictModelOutboundEndpointPolicy;
import com.robothree.central.modelgateway.adapter.provider.AnthropicCompatibleModelProviderAdapter;
import com.robothree.central.modelgateway.adapter.provider.OpenAiCompatibleModelProviderAdapter;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.CredentialResolution;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Outcome;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Request;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Result;
import com.robothree.central.modelgateway.development
        .DevelopmentModelCredentialMaterialSource;
import com.robothree.central.modelgateway.development
        .DevelopmentModelCredentialMaterialSource.CredentialKey;
import com.robothree.central.modelgateway.development.FixedSyntheticModelProviderRequestSource;
import com.robothree.central.modelgateway.port.ModelCredentialMaterialSource;
import com.robothree.central.modelgateway.port.ModelInvocationEphemeralPublisher;
import com.robothree.central.modelgateway.port.ModelProviderAdapter;
import com.robothree.central.shared.json.CanonicalJson;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

class DirectProviderConformanceHarness {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String KEY_ENV =
            "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY";
    private static final String ENDPOINT_ENV =
            "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_ENDPOINT";
    private static final String PROTOCOL_ENV =
            "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_PROTOCOL";
    private static final String MODEL_ENV =
            "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_MODEL_ID";
    private static final String CANARY_ENV =
            "ROBOTHREE_CGF2B2_RUN_CANARY";
    private static final String DIAGNOSTIC_MARKER =
            "ROBOTHREE_CGF2B2_DIAGNOSTIC=";
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final String E = "e".repeat(64);
    private static final String CREDENTIAL_REVISION = "f".repeat(64);

    @Test
    void validatesTheApprovedDirectProviderWithoutPersistingContent() {
        Instant startedAt = Instant.now();
        URI endpoint = URI.create(required(ENDPOINT_ENV));
        Protocol protocol = Protocol.valueOf(required(PROTOCOL_ENV));
        String modelId = required(MODEL_ENV);
        String canary = required(CANARY_ENV);
        ModelEndpointBinding binding = binding(
                endpoint,
                protocol,
                modelId);
        String canonicalRequest = providerNeutralRequest(modelId, canary);
        String cancellationRequest = providerCancellationRequest(modelId, canary);
        FixedSyntheticModelProviderRequestSource requestSource =
                new FixedSyntheticModelProviderRequestSource(
                        List.of(canonicalRequest, cancellationRequest));
        ModelCredentialMaterialSource realCredential =
                DevelopmentModelCredentialMaterialSource.fromProcessEnvironment(
                        Map.of(
                                new CredentialKey(
                                        binding.credentialReference(),
                                        binding.credentialRevision()),
                                KEY_ENV));
        DiagnosticAdapter adapter = new DiagnosticAdapter(adapter(
                binding,
                realCredential));

        HarnessPublisher normalPublisher =
                new HarnessPublisher(canary, false);
        Result normal = backend(
                requestSource,
                adapter,
                normalPublisher)
                .execute(
                        request(binding, canonicalRequest, Instant.now().plusSeconds(90)),
                        () -> false);
        reportMismatch(
                "normal_streaming",
                normal,
                adapter,
                Outcome.COMPLETED,
                null);
        assertThat(normal.outcome()).isEqualTo(Outcome.COMPLETED);
        assertThat(normal.usage()).isNotNull();
        assertThat(normal.usage().inputTokens()).isGreaterThanOrEqualTo(0);
        assertThat(normal.usage().outputTokens()).isGreaterThanOrEqualTo(0);
        assertThat(normal.finishReason()).isNotBlank();
        assertThat(normal.ephemeralTextDeltas()).isEmpty();
        if (normalPublisher.deltaCount < 1) {
            reportDiagnostic(
                    "normal_streaming",
                    normal.outcome(),
                    "model_gateway.provider_text_delta_missing");
        }
        assertThat(normalPublisher.deltaCount).isGreaterThanOrEqualTo(1);
        assertThat(normalPublisher.clearCount).isEqualTo(1);
        assertThat(normalPublisher.outputDigest).matches("^[0-9a-f]{64}$");

        String invalidMaterial = "invalid-" + UUID.randomUUID();
        ModelCredentialMaterialSource invalidCredential =
                new DevelopmentModelCredentialMaterialSource(
                        Map.of(
                                new CredentialKey(
                                        binding.credentialReference(),
                                        binding.credentialRevision()),
                                KEY_ENV),
                        ignored -> invalidMaterial);
        DiagnosticAdapter invalidAdapter = new DiagnosticAdapter(
                adapter(binding, invalidCredential));
        Result unauthorized = backend(
                requestSource,
                invalidAdapter,
                new HarnessPublisher(canary, false))
                .execute(
                        request(binding, canonicalRequest, Instant.now().plusSeconds(30)),
                        () -> false);
        reportMismatch(
                "invalid_credential",
                unauthorized,
                invalidAdapter,
                Outcome.FAILED,
                "model_gateway.provider_unauthorized");
        assertThat(unauthorized.outcome()).isEqualTo(Outcome.FAILED);
        assertThat(unauthorized.safeErrorCode())
                .isEqualTo("model_gateway.provider_unauthorized");

        AtomicBoolean cancellation = new AtomicBoolean();
        HarnessPublisher cancellingPublisher =
                new HarnessPublisher(canary, true, cancellation);
        Result cancelled = backend(
                requestSource,
                adapter,
                cancellingPublisher)
                .execute(
                        request(
                                binding,
                                cancellationRequest,
                                Instant.now().plusSeconds(90)),
                        cancellation::get);
        reportMismatch(
                "cancel",
                cancelled,
                adapter,
                Outcome.CANCELLED,
                null);
        assertThat(cancelled.outcome()).isEqualTo(Outcome.CANCELLED);
        assertThat(cancellingPublisher.deltaCount).isGreaterThanOrEqualTo(1);
        assertThat(cancellingPublisher.clearCount).isEqualTo(1);

        Result timedOut = backend(
                requestSource,
                adapter,
                new HarnessPublisher(canary, false))
                .execute(
                        request(binding, canonicalRequest, Instant.now().plusMillis(1)),
                        () -> false);
        reportMismatch(
                "deadline",
                timedOut,
                adapter,
                Outcome.TIMED_OUT,
                null);
        assertThat(timedOut.outcome()).isEqualTo(Outcome.TIMED_OUT);

        String aggregationEvidence = normalPublisher.deltaCount == 1
                ? "single_delta_provider_aggregation"
                : "multiple_provider_deltas";
        String safeResult = "{\"status\":\"PASS\",\"deltaCount\":"
                + normalPublisher.deltaCount
                + ",\"aggregationEvidence\":\""
                + aggregationEvidence
                + "\",\"canaryObserved\":"
                + normalPublisher.observedExpected
                + ",\"outputDigest\":\""
                + normalPublisher.outputDigest
                + "\",\"durationMillis\":"
                + Duration.between(startedAt, Instant.now()).toMillis()
                + ",\"invalidCredential\":\"failed\","
                + "\"cancel\":\"cancelled\",\"deadline\":\"timed_out\"}";
        System.out.println("ROBOTHREE_CGF2B2_RESULT=" + safeResult);
    }

    private static ProviderBackedModelInvocationExecutionBackend backend(
            FixedSyntheticModelProviderRequestSource requestSource,
            ModelProviderAdapter adapter,
            ModelInvocationEphemeralPublisher publisher) {
        return new ProviderBackedModelInvocationExecutionBackend(
                requestSource,
                new StrictModelProviderAdapterRegistry(List.of(adapter)),
                publisher);
    }

    private static ModelProviderAdapter adapter(
            ModelEndpointBinding binding,
            ModelCredentialMaterialSource credentialSource) {
        HttpClient client = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        JdkModelAuthorizedHttpTransport transport =
                new JdkModelAuthorizedHttpTransport(
                        client,
                        credentialSource,
                        new StrictModelOutboundEndpointPolicy(
                                Set.of(binding.endpoint().getHost())));
        return binding.protocol() == Protocol.OPENAI_COMPATIBLE
                ? new OpenAiCompatibleModelProviderAdapter(transport)
                : new AnthropicCompatibleModelProviderAdapter(transport);
    }

    private static Request request(
            ModelEndpointBinding binding,
            String canonicalRequest,
            Instant deadline) {
        return new Request(
                UUID.randomUUID(),
                CanonicalJson.sha256(canonicalRequest),
                binding.modelId(),
                binding,
                new CredentialResolution(
                        binding.credentialReference(),
                        binding.credentialRevision()),
                1,
                deadline,
                Duration.ofSeconds(30));
    }

    private static ModelEndpointBinding binding(
            URI endpoint,
            Protocol protocol,
            String modelId) {
        return new ModelEndpointBinding(
                "binding.cgf2b2.direct-provider",
                A,
                B,
                modelId,
                modelId,
                C,
                D,
                E,
                ConnectionMode.DIRECT_PROVIDER,
                protocol,
                endpoint,
                "credential.cgf2b2.direct-provider",
                CREDENTIAL_REVISION,
                A,
                B,
                RecoveryMode.MANUAL_RECONCILIATION);
    }

    private static String providerNeutralRequest(
            String modelId,
            String canary) {
        return providerRequest(
                modelId,
                "Write a numbered list with 20 short visible answer lines. End the last "
                        + "line with this non-sensitive test token: "
                        + canary,
                512);
    }

    private static String providerCancellationRequest(
            String modelId,
            String canary) {
        return providerRequest(
                modelId,
                "Write a numbered list with 200 short lines. End the last line with this "
                        + "non-sensitive test token: "
                        + canary,
                2_048);
    }

    private static String providerRequest(
            String modelId,
            String userText,
            int maxOutputTokens) {
        ObjectNode root = JSON.createObjectNode();
        root.put("snapshotId", UUID.randomUUID().toString());
        root.put("contextSourceDigest", A);
        ObjectNode model = root.putObject("model");
        model.put("modelId", modelId);
        model.put("modelRevision", C);
        model.put("configurationRevision", D);
        model.put("runtimeRegistryGeneration", E);
        ObjectNode message = root.putArray("messages").addObject();
        message.put("role", "user");
        message.putArray("content")
                .addObject()
                .put("type", "text")
                .put("text", userText);
        root.putArray("tools");
        root.put("maxOutputTokens", maxOutputTokens);
        return CanonicalJson.canonicalize(root);
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("required conformance resource is missing");
        }
        return value;
    }

    private static void reportFailure(
            String phase,
            Result result,
            DiagnosticAdapter adapter) {
        String errorCode = adapter.safeErrorCode;
        if (errorCode == null || errorCode.isBlank()) {
            errorCode = result.safeErrorCode();
        }
        if (errorCode == null || errorCode.isBlank()) {
            errorCode = "model_gateway.direct_provider_outcome_invalid";
        }
        reportDiagnostic(phase, result.outcome(), errorCode);
    }

    private static void reportDiagnostic(
            String phase,
            Outcome outcome,
            String errorCode) {
        ObjectNode diagnostic = JSON.createObjectNode();
        diagnostic.put("status", "FAILED");
        diagnostic.put("phase", phase);
        diagnostic.put("outcome", outcome.name());
        diagnostic.put("errorCode", errorCode);
        System.out.println(
                DIAGNOSTIC_MARKER + CanonicalJson.canonicalize(diagnostic));
    }

    private static void reportMismatch(
            String phase,
            Result result,
            DiagnosticAdapter adapter,
            Outcome expectedOutcome,
            String expectedErrorCode) {
        boolean outcomeMatches = result.outcome() == expectedOutcome;
        boolean errorMatches = expectedErrorCode == null
                || expectedErrorCode.equals(result.safeErrorCode());
        if (outcomeMatches && errorMatches) {
            return;
        }
        reportFailure(phase, result, adapter);
    }

    private static final class DiagnosticAdapter implements ModelProviderAdapter {

        private final ModelProviderAdapter delegate;
        private String safeErrorCode;

        private DiagnosticAdapter(ModelProviderAdapter delegate) {
            this.delegate = delegate;
        }

        @Override
        public Protocol protocol() {
            return delegate.protocol();
        }

        @Override
        public void stream(
                com.robothree.central.modelgateway.provider.ModelProviderRequest request,
                com.robothree.central.modelgateway.port.ModelStreamSink sink) {
            try {
                delegate.stream(request, sink);
            } catch (com.robothree.central.modelgateway.application.ModelGatewayException
                    exception) {
                safeErrorCode = exception.code();
                throw exception;
            } catch (RuntimeException exception) {
                safeErrorCode = "model_gateway.provider_runtime_failure";
                throw exception;
            }
        }
    }

    private static final class HarnessPublisher
            implements ModelInvocationEphemeralPublisher {

        private final String expected;
        private final boolean cancelAfterFirst;
        private final AtomicBoolean cancellation;
        private final StringBuilder content = new StringBuilder();
        private int deltaCount;
        private int clearCount;
        private boolean observedExpected;
        private String outputDigest;

        private HarnessPublisher(
                String expected,
                boolean cancelAfterFirst) {
            this(expected, cancelAfterFirst, new AtomicBoolean());
        }

        private HarnessPublisher(
                String expected,
                boolean cancelAfterFirst,
                AtomicBoolean cancellation) {
            this.expected = expected;
            this.cancelAfterFirst = cancelAfterFirst;
            this.cancellation = cancellation;
        }

        @Override
        public synchronized void publishText(
                UUID invocationId,
                String delta) {
            content.append(delta);
            deltaCount++;
            if (cancelAfterFirst) {
                cancellation.set(true);
            }
        }

        @Override
        public synchronized void clear(UUID invocationId) {
            observedExpected = content.indexOf(expected) >= 0;
            outputDigest = CanonicalJson.sha256(content.toString());
            content.setLength(0);
            clearCount++;
        }
    }
}
