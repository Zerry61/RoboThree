package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;

public interface ModelEndpointValidator {

    void validate(ModelEndpointBinding binding);
}
