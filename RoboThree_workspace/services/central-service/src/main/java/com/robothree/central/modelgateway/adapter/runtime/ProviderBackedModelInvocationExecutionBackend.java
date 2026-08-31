package com.robothree.central.modelgateway.adapter.runtime;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Outcome;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.RecoveryEvidence;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Request;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Result;
import com.robothree.central.modelgateway.port.ModelInvocationEphemeralPublisher;
import com.robothree.central.modelgateway.port.ModelInvocationExecutionBackend;
import com.robothree.central.modelgateway.port.ModelProviderCacheProjectionResolver;
import com.robothree.central.modelgateway.port.ModelProviderAdapter;
import com.robothree.central.modelgateway.port.ModelProviderAdapterRegistry;
import com.robothree.central.modelgateway.port.ModelProviderRequestSource;
import com.robothree.central.modelgateway.port.ModelProviderRequestSource.ResolvedRequest;
import com.robothree.central.modelgateway.provider.ModelProviderRequest;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.BooleanSupplier;

public final class ProviderBackedModelInvocationExecutionBackend
        implements ModelInvocationExecutionBackend {

    private static final Set<ConnectionMode> ENABLED_CONNECTION_MODES = Set.of(
            ConnectionMode.DIRECT_PROVIDER,
            ConnectionMode.CUSTOM_RELAY);
    private static final Set<String> DETERMINISTIC_PROVIDER_FAILURES = Set.of(
            "model_gateway.provider_request_invalid",
            "model_gateway.reasoning_projection_invalid",
            "model_gateway.reasoning_budget_conflict",
            "model_gateway.cache_projection_invalid",
            "model_gateway.provider_response_invalid",
            "model_gateway.provider_protocol_mismatch",
            "model_gateway.provider_header_conflict",
            "model_gateway.provider_route_invalid",
            "model_gateway.endpoint_not_allowed",
            "model_gateway.credential_unavailable",
            "model_gateway.provider_rate_limited",
            "model_gateway.provider_redirect_rejected",
            "model_gateway.provider_content_type_invalid",
            "model_gateway.provider_event_invalid",
            "model_gateway.provider_frame_oversized",
            "model_gateway.provider_headers_oversized",
            "model_gateway.provider_stream_limit_exceeded",
            "model_gateway.provider_stream_utf8_invalid",
            "model_gateway.provider_usage_conflict",
            "model_gateway.provider_usage_missing",
            "model_gateway.provider_finish_reason_unknown",
            "model_gateway.provider_event_after_terminal",
            "model_gateway.provider_tool_call_start_missing",
            "model_gateway.provider_tool_call_conflict",
            "model_gateway.provider_tool_finish_mismatch",
            "model_gateway.provider_tool_arguments_oversized",
            "model_gateway.provider_tool_arguments_incomplete",
            "model_gateway.provider_tool_arguments_invalid");

    private final ModelProviderRequestSource requestSource;
    private final ModelProviderAdapterRegistry adapterRegistry;
    private final ModelInvocationEphemeralPublisher ephemeralPublisher;
    private final ModelProviderCacheProjectionResolver cacheProjectionResolver;

    public ProviderBackedModelInvocationExecutionBackend(
            ModelProviderRequestSource requestSource,
            ModelProviderAdapterRegistry adapterRegistry,
            ModelInvocationEphemeralPublisher ephemeralPublisher) {
        this(
                requestSource,
                adapterRegistry,
                ephemeralPublisher,
                ModelProviderCacheProjectionResolver.disabled());
    }

    public ProviderBackedModelInvocationExecutionBackend(
            ModelProviderRequestSource requestSource,
            ModelProviderAdapterRegistry adapterRegistry,
            ModelInvocationEphemeralPublisher ephemeralPublisher,
            ModelProviderCacheProjectionResolver cacheProjectionResolver) {
        this.requestSource = Objects.requireNonNull(requestSource, "requestSource");
        this.adapterRegistry = Objects.requireNonNull(
                adapterRegistry,
                "adapterRegistry");
        this.ephemeralPublisher = Objects.requireNonNull(
                ephemeralPublisher,
                "ephemeralPublisher");
        this.cacheProjectionResolver = Objects.requireNonNull(
                cacheProjectionResolver,
                "cacheProjectionResolver");
    }

    @Override
    public Result execute(
            Request request,
            BooleanSupplier cancellationRequested) {
        Objects.requireNonNull(request, "request");
        Objects.requireNonNull(cancellationRequested, "cancellationRequested");
        if (cancellationRequested.getAsBoolean()) {
            return result(Outcome.CANCELLED, null, null);
        }

        ProviderResultCollector collector = new ProviderResultCollector(
                request.invocationId(),
                ephemeralPublisher,
                cancellationRequested);
        boolean adapterInvoked = false;
        try {
            ModelProviderRequest providerRequest = providerRequest(request);
            ModelProviderAdapter adapter =
                    adapterRegistry.resolve(request.binding().protocol());
            adapterInvoked = true;
            ephemeralPublisher.publishStarted(request.invocationId());
            adapter.stream(providerRequest, collector);
            return collector.completedResult();
        } catch (ModelGatewayException exception) {
            return map(exception, cancellationRequested, adapterInvoked);
        } catch (RuntimeException exception) {
            return adapterInvoked
                    ? uncertain()
                    : failed(
                            "model_gateway.provider_bridge_invalid",
                            "The model provider request could not be prepared.");
        } finally {
            bestEffortClear(request.invocationId());
        }
    }

    @Override
    public RecoveryEvidence query(Request request) {
        Objects.requireNonNull(request, "request");
        return RecoveryEvidence.unknown();
    }

    @Override
    public void requestCancel(UUID invocationId) {
        Objects.requireNonNull(invocationId, "invocationId");
        // Cancellation is observed through the durable BooleanSupplier.
    }

    private ModelProviderRequest providerRequest(Request request) {
        if (!ENABLED_CONNECTION_MODES.contains(
                request.binding().connectionMode())) {
            throw ModelGatewayException.validation(
                    "model_gateway.connection_mode_not_enabled",
                    "The selected connection mode is not enabled by this backend.");
        }
        ResolvedRequest resolved = requestSource.resolve(request.requestDigest());
        ObjectNode document = com.robothree.central.shared.json.CanonicalJson.parseObject(
                resolved.canonicalRequestJson(),
                4_194_304);
        String sourceModelId = document.path("model").path("modelId").asText(null);
        if (!request.modelId().equals(sourceModelId)) {
            throw ModelGatewayException.validation(
                    "model_gateway.provider_request_model_mismatch",
                    "The provider request does not match the locked model.");
        }
        var cacheProjection = cacheProjectionResolver.resolve(request, resolved);
        return new ModelProviderRequest(
                request.invocationId(),
                resolved.requestDigest(),
                resolved.canonicalRequestJson(),
                request.binding(),
                request.providerRequestDeadlineAt(),
                request.providerStreamIdleTimeout(),
                cacheProjection,
                resolved.reasoningProjection());
    }

    private static Result map(
            ModelGatewayException exception,
            BooleanSupplier cancellationRequested,
            boolean adapterInvoked) {
        String code = exception.code();
        if ("model_gateway.provider_cancelled".equals(code)
                || cancellationRequested.getAsBoolean()) {
            return result(Outcome.CANCELLED, null, null);
        }
        if ("model_gateway.provider_request_timeout".equals(code)
                || "model_gateway.provider_stream_idle_timeout".equals(code)) {
            return result(Outcome.TIMED_OUT, null, null);
        }
        if ("model_gateway.provider_unauthorized".equals(code)) {
            return failed(code, exception.safeSummary());
        }
        if (DETERMINISTIC_PROVIDER_FAILURES.contains(code)) {
            return failed(code, exception.safeSummary());
        }
        if (!adapterInvoked) {
            return failed(code, exception.safeSummary());
        }
        return uncertain();
    }

    private static Result failed(String code, String summary) {
        return result(Outcome.FAILED, code, summary);
    }

    private static Result uncertain() {
        return result(
                Outcome.UNCERTAIN,
                "model_gateway.dispatch_outcome_unknown",
                "The provider outcome could not be confirmed.");
    }

    private static Result result(
            Outcome outcome,
            String code,
            String summary) {
        return new Result(
                outcome,
                null,
                null,
                code,
                summary,
                List.of());
    }

    private void bestEffortClear(UUID invocationId) {
        try {
            ephemeralPublisher.clear(invocationId);
        } catch (RuntimeException ignored) {
            // Ephemeral cleanup cannot alter durable execution facts.
        }
    }
}
