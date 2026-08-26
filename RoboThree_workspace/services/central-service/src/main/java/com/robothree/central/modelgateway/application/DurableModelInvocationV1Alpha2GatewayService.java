package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.application.ModelInvocationRuntime.AcceptCommand;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import java.util.Objects;
import java.util.UUID;

/** v1alpha2 service activated only when the complete durable planning graph exists. */
public final class DurableModelInvocationV1Alpha2GatewayService
        implements ModelInvocationV1Alpha2GatewayService {

    private final ModelInvocationRuntime runtime;
    private final ModelInvocationGatewayService liveGateway;
    private final TransientModelProviderRequestSource requests;

    public DurableModelInvocationV1Alpha2GatewayService(
            ModelInvocationRuntime runtime,
            TransientModelProviderRequestSource requests,
            ModelInvocationEphemeralBuffer ephemeral,
            String nodeId,
            int subscriberCapacity) {
        this.runtime = Objects.requireNonNull(runtime, "runtime");
        this.requests = Objects.requireNonNull(requests, "requests");
        this.liveGateway = new ModelInvocationGatewayService(
                runtime,
                requests,
                ephemeral,
                nodeId,
                subscriberCapacity);
    }

    @Override
    public ModelInvocation accept(
            String compactToken,
            AcceptCommand command,
            String canonicalProviderRequestJson,
            String sessionScopeDigest,
            String cacheContextDigest) {
        requests.register(command.requestDigest(), canonicalProviderRequestJson);
        try {
            ModelInvocation invocation = runtime.acceptV1Alpha2(
                    compactToken,
                    command,
                    sessionScopeDigest,
                    cacheContextDigest);
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
                compactToken,
                invocationId,
                expectedStatusRevision,
                reason);
    }

    @Override
    public ModelInvocationGatewayService.LiveSubscription subscribe(
            String compactToken,
            UUID invocationId,
            long afterDurableSequence) {
        return liveGateway.subscribe(compactToken, invocationId, afterDurableSequence);
    }
}
