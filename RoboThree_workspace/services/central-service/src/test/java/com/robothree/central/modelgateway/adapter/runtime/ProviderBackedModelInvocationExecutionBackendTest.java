package com.robothree.central.modelgateway.adapter.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.CredentialResolution;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Outcome;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Request;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Result;
import com.robothree.central.modelgateway.domain.ProviderCacheProjection;
import com.robothree.central.modelgateway.development.FixedSyntheticModelProviderRequestSource;
import com.robothree.central.modelgateway.port.ModelInvocationEphemeralPublisher;
import com.robothree.central.modelgateway.port.ModelProviderAdapter;
import com.robothree.central.modelgateway.port.ModelStreamSink;
import com.robothree.central.modelgateway.provider.ModelProviderRequest;
import com.robothree.central.modelgateway.provider.ModelProviderStreamEvent;
import com.robothree.central.shared.json.CanonicalJson;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

class ProviderBackedModelInvocationExecutionBackendTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final String E = "e".repeat(64);
    private static final String F = "f".repeat(64);

    @Test
    void bridgesBothProtocolsAndConnectionModesWithoutCopyingText()
            throws Exception {
        for (Protocol protocol : Protocol.values()) {
            for (ConnectionMode connectionMode : ConnectionMode.values()) {
                RecordingAdapter adapter = new RecordingAdapter(protocol);
                RecordingPublisher publisher = new RecordingPublisher(false);
                ProviderBackedModelInvocationExecutionBackend backend = backend(
                        adapter,
                        publisher);

                Result result = backend.execute(
                        request(protocol, connectionMode),
                        () -> false);

                assertThat(result.outcome()).isEqualTo(Outcome.COMPLETED);
                assertThat(result.usage())
                        .isEqualTo(new ModelInvocationExecution.Usage(8, 4));
                assertThat(result.finishReason()).isEqualTo("stop");
                assertThat(result.ephemeralTextDeltas()).isEmpty();
                assertThat(publisher.deltas).containsExactly("第一段", "第二段");
                assertThat(publisher.clearCount).isEqualTo(1);
                assertThat(adapter.lastRequest.requestDigest())
                        .isEqualTo(CanonicalJson.sha256(providerNeutralRequest()));
                assertThat(adapter.lastRequest.binding().protocol())
                        .isEqualTo(protocol);
                assertThat(adapter.lastRequest.binding().connectionMode())
                        .isEqualTo(connectionMode);
                assertThat(adapter.lastRequest.binding().upstreamModelId())
                        .isEqualTo(connectionMode == ConnectionMode.CUSTOM_RELAY
                                ? "relay.upstream-model"
                                : "model.synthetic");
                assertThat(adapter.lastRequest.deadline())
                        .isEqualTo(Instant.parse("2026-07-31T10:01:00Z"));
                assertThat(adapter.lastRequest.streamIdleTimeout())
                        .isEqualTo(Duration.ofSeconds(30));
            }
        }
    }

    @Test
    void keepsEphemeralDeliveryAndCleanupBestEffort() {
        RecordingPublisher publisher = new RecordingPublisher(true);
        ProviderBackedModelInvocationExecutionBackend backend = backend(
                new RecordingAdapter(Protocol.OPENAI_COMPATIBLE),
                publisher);

        Result result = backend.execute(
                request(
                        Protocol.OPENAI_COMPATIBLE,
                        ConnectionMode.DIRECT_PROVIDER),
                () -> false);

        assertThat(result.outcome()).isEqualTo(Outcome.COMPLETED);
        assertThat(result.ephemeralTextDeltas()).isEmpty();
        assertThat(publisher.publishAttempts).isEqualTo(2);
        assertThat(publisher.clearCount).isEqualTo(1);
    }

    @Test
    void failsClosedBeforeAdapterForMissingSourceOrProtocol() {
        RecordingPublisher publisher = new RecordingPublisher(false);
        RecordingAdapter adapter = new RecordingAdapter(Protocol.OPENAI_COMPATIBLE);
        ProviderBackedModelInvocationExecutionBackend backend = backend(
                adapter,
                publisher);

        Request wrongDigest = new Request(
                UUID.randomUUID(),
                F,
                "model.synthetic",
                binding(
                        Protocol.OPENAI_COMPATIBLE,
                        ConnectionMode.DIRECT_PROVIDER),
                new CredentialResolution("credential.synthetic", E),
                1,
                Instant.parse("2026-07-31T10:01:00Z"),
                Duration.ofSeconds(30));
        assertThat(backend.execute(wrongDigest, () -> false))
                .extracting(Result::outcome, Result::safeErrorCode)
                .containsExactly(
                        Outcome.FAILED,
                        "model_gateway.provider_request_missing");
        assertThat(adapter.invocations).isZero();

        ProviderBackedModelInvocationExecutionBackend missingAdapter =
                new ProviderBackedModelInvocationExecutionBackend(
                        new FixedSyntheticModelProviderRequestSource(
                                List.of(providerNeutralRequest())),
                        new StrictModelProviderAdapterRegistry(List.of()),
                        publisher);
        assertThat(missingAdapter.execute(
                        request(
                                Protocol.ANTHROPIC_COMPATIBLE,
                                ConnectionMode.DIRECT_PROVIDER),
                        () -> false))
                .extracting(Result::outcome, Result::safeErrorCode)
                .containsExactly(
                        Outcome.FAILED,
                        "model_gateway.provider_adapter_missing");
    }

    @Test
    void resolvesTypedCacheProjectionBeforeInvokingTheAdapter() {
        RecordingAdapter adapter = new RecordingAdapter(Protocol.OPENAI_COMPATIBLE);
        ProviderCacheProjection projection =
                ProviderCacheProjection.OpenAiAutomaticObserved.create();
        var backend = new ProviderBackedModelInvocationExecutionBackend(
                new FixedSyntheticModelProviderRequestSource(
                        List.of(providerNeutralRequest())),
                new StrictModelProviderAdapterRegistry(List.of(adapter)),
                new RecordingPublisher(false),
                (request, resolved) -> {
                    assertThat(resolved.requestDigest()).isEqualTo(request.requestDigest());
                    return projection;
                });

        Result result = backend.execute(
                request(Protocol.OPENAI_COMPATIBLE, ConnectionMode.DIRECT_PROVIDER),
                () -> false);

        assertThat(result.outcome()).isEqualTo(Outcome.COMPLETED);
        assertThat(adapter.lastRequest.cacheProjection()).isEqualTo(projection);
    }

    @Test
    void cacheProjectionDriftFailsBeforeProviderDispatch() {
        RecordingAdapter adapter = new RecordingAdapter(Protocol.OPENAI_COMPATIBLE);
        var backend = new ProviderBackedModelInvocationExecutionBackend(
                new FixedSyntheticModelProviderRequestSource(
                        List.of(providerNeutralRequest())),
                new StrictModelProviderAdapterRegistry(List.of(adapter)),
                new RecordingPublisher(false),
                (request, resolved) -> {
                    throw ModelGatewayException.conflict(
                            "model_gateway.cache_static_prefix_drift",
                            "The provider request static prefix drifted.");
                });

        Result result = backend.execute(
                request(Protocol.OPENAI_COMPATIBLE, ConnectionMode.DIRECT_PROVIDER),
                () -> false);

        assertThat(result.outcome()).isEqualTo(Outcome.FAILED);
        assertThat(result.safeErrorCode())
                .isEqualTo("model_gateway.cache_static_prefix_drift");
        assertThat(adapter.invocations).isZero();
    }

    @Test
    void mapsCancellationTimeoutUnauthorizedAndUnknownOutcomes() {
        assertOutcome(
                "model_gateway.provider_cancelled",
                Outcome.CANCELLED,
                null);
        assertOutcome(
                "model_gateway.provider_request_timeout",
                Outcome.TIMED_OUT,
                null);
        assertOutcome(
                "model_gateway.provider_stream_idle_timeout",
                Outcome.TIMED_OUT,
                null);
        assertOutcome(
                "model_gateway.provider_unauthorized",
                Outcome.FAILED,
                "model_gateway.provider_unauthorized");
        assertOutcome(
                "model_gateway.provider_rate_limited",
                Outcome.FAILED,
                "model_gateway.provider_rate_limited");
        assertOutcome(
                "model_gateway.provider_response_invalid",
                Outcome.FAILED,
                "model_gateway.provider_response_invalid");
        for (String deterministic : List.of(
                "model_gateway.provider_redirect_rejected",
                "model_gateway.provider_content_type_invalid",
                "model_gateway.provider_event_invalid",
                "model_gateway.provider_frame_oversized",
                "model_gateway.provider_headers_oversized",
                "model_gateway.provider_stream_utf8_invalid",
                "model_gateway.provider_usage_conflict",
                "model_gateway.provider_finish_reason_unknown",
                "model_gateway.provider_event_after_terminal",
                "model_gateway.provider_tool_arguments_invalid")) {
            assertOutcome(deterministic, Outcome.FAILED, deterministic);
        }
        assertOutcome(
                "model_gateway.provider_stream_incomplete",
                Outcome.UNCERTAIN,
                "model_gateway.dispatch_outcome_unknown");
        assertOutcome(
                "model_gateway.provider_stream_failed",
                Outcome.UNCERTAIN,
                "model_gateway.dispatch_outcome_unknown");

        ProviderBackedModelInvocationExecutionBackend backend = backend(
                new RecordingAdapter(Protocol.OPENAI_COMPATIBLE),
                new RecordingPublisher(false));
        assertThat(backend.execute(
                        request(
                                Protocol.OPENAI_COMPATIBLE,
                                ConnectionMode.DIRECT_PROVIDER),
                        () -> true))
                .extracting(Result::outcome)
                .isEqualTo(Outcome.CANCELLED);
    }

    @Test
    void rejectsDuplicateAndMissingProtocolRegistrations() {
        RecordingAdapter first = new RecordingAdapter(Protocol.OPENAI_COMPATIBLE);
        RecordingAdapter second = new RecordingAdapter(Protocol.OPENAI_COMPATIBLE);
        assertThatThrownBy(() -> new StrictModelProviderAdapterRegistry(
                        List.of(first, second)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("exactly once");

        StrictModelProviderAdapterRegistry registry =
                new StrictModelProviderAdapterRegistry(List.of(first));
        assertThat(registry.resolve(Protocol.OPENAI_COMPATIBLE)).isSameAs(first);
        assertThatThrownBy(() -> registry.resolve(Protocol.ANTHROPIC_COMPATIBLE))
                .isInstanceOfSatisfying(
                        ModelGatewayException.class,
                        error -> assertThat(error.code())
                                .isEqualTo("model_gateway.provider_adapter_missing"));
    }

    private static void assertOutcome(
            String errorCode,
            Outcome expectedOutcome,
            String expectedSafeCode) {
        ModelProviderAdapter adapter = new ThrowingAdapter(errorCode);
        Result result = backend(
                adapter,
                new RecordingPublisher(false))
                .execute(
                        request(
                                Protocol.OPENAI_COMPATIBLE,
                                ConnectionMode.DIRECT_PROVIDER),
                        () -> false);
        assertThat(result.outcome()).isEqualTo(expectedOutcome);
        assertThat(result.safeErrorCode()).isEqualTo(expectedSafeCode);
    }

    private static ProviderBackedModelInvocationExecutionBackend backend(
            ModelProviderAdapter adapter,
            ModelInvocationEphemeralPublisher publisher) {
        return new ProviderBackedModelInvocationExecutionBackend(
                new FixedSyntheticModelProviderRequestSource(
                        List.of(providerNeutralRequest())),
                new StrictModelProviderAdapterRegistry(List.of(adapter)),
                publisher);
    }

    private static Request request(
            Protocol protocol,
            ConnectionMode connectionMode) {
        String request = providerNeutralRequest();
        return new Request(
                UUID.randomUUID(),
                CanonicalJson.sha256(request),
                "model.synthetic",
                binding(protocol, connectionMode),
                new CredentialResolution("credential.synthetic", E),
                1,
                Instant.parse("2026-07-31T10:01:00Z"),
                Duration.ofSeconds(30));
    }

    private static ModelEndpointBinding binding(
            Protocol protocol,
            ConnectionMode connectionMode) {
        return new ModelEndpointBinding(
                "binding.synthetic",
                A,
                B,
                "model.synthetic",
                connectionMode == ConnectionMode.CUSTOM_RELAY
                        ? "relay.upstream-model"
                        : "model.synthetic",
                C,
                D,
                E,
                connectionMode,
                protocol,
                URI.create("https://provider.invalid/base"),
                "credential.synthetic",
                E,
                F,
                A,
                RecoveryMode.MANUAL_RECONCILIATION);
    }

    private static String providerNeutralRequest() {
        ObjectNode root = JSON.createObjectNode();
        root.put("snapshotId", "11111111-1111-4111-8111-111111111111");
        root.put("contextSourceDigest", A);
        ObjectNode model = root.putObject("model");
        model.put("modelId", "model.synthetic");
        model.put("modelRevision", C);
        model.put("configurationRevision", D);
        model.put("runtimeRegistryGeneration", E);
        ObjectNode message = root.putArray("messages").addObject();
        message.put("role", "user");
        message.putArray("content")
                .addObject()
                .put("type", "text")
                .put("text", "固定非敏感测试输入");
        root.putArray("tools");
        root.put("maxOutputTokens", 64);
        return CanonicalJson.canonicalize(root);
    }

    private static final class RecordingAdapter implements ModelProviderAdapter {

        private final Protocol protocol;
        private ModelProviderRequest lastRequest;
        private int invocations;

        private RecordingAdapter(Protocol protocol) {
            this.protocol = protocol;
        }

        @Override
        public Protocol protocol() {
            return protocol;
        }

        @Override
        public void stream(
                ModelProviderRequest request,
                ModelStreamSink sink) {
            invocations++;
            lastRequest = request;
            sink.accept(new ModelProviderStreamEvent.TextDelta("第一段"));
            sink.accept(new ModelProviderStreamEvent.TextDelta("第二段"));
            sink.accept(new ModelProviderStreamEvent.Usage(8, 4));
            sink.accept(new ModelProviderStreamEvent.Terminal("stop"));
        }
    }

    private static final class ThrowingAdapter implements ModelProviderAdapter {

        private final String errorCode;

        private ThrowingAdapter(String errorCode) {
            this.errorCode = errorCode;
        }

        @Override
        public Protocol protocol() {
            return Protocol.OPENAI_COMPATIBLE;
        }

        @Override
        public void stream(
                ModelProviderRequest request,
                ModelStreamSink sink) {
            throw new ModelGatewayException(
                    errorCode,
                    true,
                    "The provider request did not complete.");
        }
    }

    private static final class RecordingPublisher
            implements ModelInvocationEphemeralPublisher {

        private final boolean fail;
        private final List<String> deltas = new ArrayList<>();
        private int publishAttempts;
        private int clearCount;

        private RecordingPublisher(boolean fail) {
            this.fail = fail;
        }

        @Override
        public void publishText(UUID invocationId, String delta) {
            publishAttempts++;
            if (fail) {
                throw new IllegalStateException("ephemeral unavailable");
            }
            deltas.add(delta);
        }

        @Override
        public void clear(UUID invocationId) {
            clearCount++;
            if (fail) {
                throw new IllegalStateException("ephemeral cleanup unavailable");
            }
        }
    }
}
