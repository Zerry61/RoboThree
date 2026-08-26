package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelInvocation;
import java.util.Optional;
import java.util.UUID;

public interface ModelInvocationRepository {

    ModelInvocation accept(ModelInvocation invocation);

    Optional<ModelInvocation> findById(UUID invocationId);

    Optional<ModelInvocation> findByClientRequest(
            ModelInvocation.ClientRequestScope clientRequestScope);

    Optional<ModelInvocation> findByIdForUpdate(UUID invocationId);

    ModelInvocation update(ModelInvocation invocation, long expectedStatusRevision);
}
