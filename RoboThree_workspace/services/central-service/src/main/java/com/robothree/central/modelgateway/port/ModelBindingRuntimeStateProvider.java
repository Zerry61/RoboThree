package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;

public interface ModelBindingRuntimeStateProvider {

    RuntimeState resolve(ModelEndpointBinding.Reference reference);

    record RuntimeState(
            boolean enabled,
            boolean revoked,
            boolean healthy) {}
}
