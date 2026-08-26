package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.provider.ModelProviderRequest;

public interface ModelProviderAdapter {

    Protocol protocol();

    void stream(ModelProviderRequest request, ModelStreamSink sink);
}
