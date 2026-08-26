package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;

public interface ModelProviderAdapterRegistry {

    ModelProviderAdapter resolve(Protocol protocol);
}
