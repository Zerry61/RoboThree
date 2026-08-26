package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelInvocationCacheContext;
import java.util.Optional;
import java.util.UUID;

public interface ModelInvocationCacheContextRepository {
    Optional<ModelInvocationCacheContext> findContextByInvocationId(UUID invocationId);
    ModelInvocationCacheContext insertImmutable(ModelInvocationCacheContext context);
}
