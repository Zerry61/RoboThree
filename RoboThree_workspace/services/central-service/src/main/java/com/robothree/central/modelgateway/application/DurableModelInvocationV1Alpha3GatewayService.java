package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.application.ModelInvocationRuntime.AcceptCommand;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.port.ModelEndpointBindingResolver;
import java.util.Objects;
import java.util.UUID;

/** Performs the independent Central mapping check before durable accept. */
public final class DurableModelInvocationV1Alpha3GatewayService
        implements ModelInvocationV1Alpha3GatewayService {
    private final ModelInvocationV1Alpha3Runtime runtime;
    private final ModelInvocationGatewayService liveGateway;
    private final TransientModelProviderRequestSource requests;
    private final ModelEndpointBindingResolver bindings;
    private final EnterpriseReasoningSecondValidator reasoning;

    public DurableModelInvocationV1Alpha3GatewayService(
            ModelInvocationV1Alpha3Runtime runtime,
            TransientModelProviderRequestSource requests,
            ModelInvocationEphemeralBuffer ephemeral,
            ModelEndpointBindingResolver bindings,
            EnterpriseReasoningSecondValidator reasoning,
            String nodeId,
            int subscriberCapacity) {
        this.runtime = Objects.requireNonNull(runtime, "runtime");
        this.requests = Objects.requireNonNull(requests, "requests");
        this.bindings = Objects.requireNonNull(bindings, "bindings");
        this.reasoning = Objects.requireNonNull(reasoning, "reasoning");
        this.liveGateway = new ModelInvocationGatewayService(
                runtime,
                requests,
                Objects.requireNonNull(ephemeral, "ephemeral"),
                nodeId,
                subscriberCapacity);
    }

    @Override
    public ModelInvocation accept(
            String compactToken,
            AcceptCommand command,
            String canonicalProviderRequestJson,
            String sessionScopeDigest,
            String cacheContextDigest,
            EnterpriseReasoningSafeIdentity safeReasoning) {
        ModelEndpointBinding binding = bindings.resolveForSelection(
                new ModelEndpointBinding.Selection(
                        command.modelId(),
                        command.modelRevision(),
                        command.configurationRevision(),
                        command.runtimeRegistryGeneration()));
        var projection = reasoning.validate(safeReasoning, binding);
        requests.register(command.requestDigest(), canonicalProviderRequestJson, projection);
        try {
            ModelInvocation invocation = sessionScopeDigest == null
                    ? runtime.accept(compactToken, command)
                    : runtime.acceptV1Alpha2(
                            compactToken,
                            command,
                            sessionScopeDigest,
                            Objects.requireNonNull(cacheContextDigest, "cacheContextDigest"));
            if (invocation.status().isTerminal()) requests.clear(command.requestDigest());
            return invocation;
        } catch (RuntimeException exception) {
            requests.clear(command.requestDigest());
            throw exception;
        }
    }

    @Override
    public ModelInvocation status(String compactToken, UUID invocationId) {
        return liveGateway.status(compactToken, invocationId);
    }

    @Override
    public ModelInvocation cancel(
            String compactToken,
            UUID invocationId,
            long expectedStatusRevision,
            String reason) {
        return liveGateway.cancel(
                compactToken, invocationId, expectedStatusRevision, reason);
    }

    @Override
    public ModelInvocationGatewayService.LiveSubscription subscribe(
            String compactToken,
            UUID invocationId,
            long afterDurableSequence) {
        return liveGateway.subscribe(compactToken, invocationId, afterDurableSequence);
    }
}
