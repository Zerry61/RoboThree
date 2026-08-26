package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.application.ModelInvocationRuntime.AcceptCommand;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import java.util.UUID;

/**
 * Activation boundary for the v1alpha2 Model Invocation subprotocol.
 *
 * <p>ARH-3.2.1 freezes the HTTP/Contract surface without providing an
 * implementation. ARH-3.2.2 must supply a bean only after durable CacheContext
 * and PromptCachePlan persistence are available, so v1alpha2 cannot silently
 * reuse the v1alpha1 request-digest-only runtime.</p>
 */
public interface ModelInvocationV1Alpha2GatewayService {

    ModelInvocation accept(
            String compactToken,
            AcceptCommand command,
            String canonicalProviderRequestJson,
            String sessionScopeDigest,
            String cacheContextDigest);

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
