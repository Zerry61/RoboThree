package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.application.ModelInvocationRuntime.AcceptCommand;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import java.util.UUID;

/** Additive reasoning-aware Gateway service. No bean means no v1alpha3 route. */
public interface ModelInvocationV1Alpha3GatewayService {
    ModelInvocation accept(
            String compactToken,
            AcceptCommand command,
            String canonicalProviderRequestJson,
            String sessionScopeDigest,
            String cacheContextDigest,
            EnterpriseReasoningSafeIdentity reasoning);

    ModelInvocation status(String compactToken, UUID invocationId);
    ModelInvocation cancel(
            String compactToken,
            UUID invocationId,
            long expectedStatusRevision,
            String reason);
    ModelInvocationGatewayService.LiveSubscription subscribe(
            String compactToken,
            UUID invocationId,
            long afterDurableSequence);
}

