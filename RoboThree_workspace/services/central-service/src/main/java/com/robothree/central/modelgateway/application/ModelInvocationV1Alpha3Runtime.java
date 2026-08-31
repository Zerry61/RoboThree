package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.application.ModelInvocationRuntime.AcceptCommand;
import com.robothree.central.modelgateway.domain.ModelInvocation;

/** Central-private runtime boundary required by the additive v1alpha3 Gateway. */
public interface ModelInvocationV1Alpha3Runtime extends ModelInvocationApplicationRuntime {
    ModelInvocation acceptV1Alpha2(
            String compactAccessToken,
            AcceptCommand command,
            String sessionScopeDigest,
            String cacheContextDigest);
}
