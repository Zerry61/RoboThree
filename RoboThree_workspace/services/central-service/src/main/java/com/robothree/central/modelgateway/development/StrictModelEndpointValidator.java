package com.robothree.central.modelgateway.development;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.port.ModelEndpointValidator;
import java.net.URI;

public final class StrictModelEndpointValidator implements ModelEndpointValidator {

    @Override
    public void validate(ModelEndpointBinding binding) {
        URI endpoint = binding.endpoint();
        if (!"https".equalsIgnoreCase(endpoint.getScheme())
                || endpoint.getHost() == null
                || endpoint.getHost().isBlank()
                || endpoint.getUserInfo() != null
                || endpoint.getFragment() != null
                || endpoint.getQuery() != null
                || endpoint.toString().length() > 500) {
            throw ModelGatewayException.validation(
                    "model_gateway.endpoint_invalid",
                    "The model endpoint is invalid.");
        }
    }
}
