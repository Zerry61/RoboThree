package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelInvocationExecution;
import com.robothree.central.modelgateway.domain.ProviderCacheProjection;

/** Resolves one immutable Plan into typed Provider wire permission before dispatch. */
public interface ModelProviderCacheProjectionResolver {

    ProviderCacheProjection resolve(
            ModelInvocationExecution.Request request,
            ModelProviderRequestSource.ResolvedRequest providerRequest);

    static ModelProviderCacheProjectionResolver disabled() {
        return (request, providerRequest) ->
                ProviderCacheProjection.Disabled.of("cache_not_planned");
    }
}
