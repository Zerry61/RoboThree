package com.robothree.central.admincontrol.application;

import com.robothree.central.modelgateway.adapter.http.StrictModelOutboundEndpointPolicy;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.port.ModelEndpointValidator;
import com.robothree.central.modelgateway.port.ModelOutboundEndpointPolicy;
import java.net.InetAddress;
import java.net.URI;
import java.util.Set;

/** Validates each Admin-configured endpoint without creating a provider platform allowlist. */
public final class AdminManagedModelOutboundEndpointPolicy
        implements ModelOutboundEndpointPolicy, ModelEndpointValidator {
    private final boolean allowLoopbackForTests;

    public AdminManagedModelOutboundEndpointPolicy(boolean allowLoopbackForTests) {
        this.allowLoopbackForTests = allowLoopbackForTests;
    }

    @Override
    public void validate(URI endpoint) {
        if (endpoint == null || endpoint.getHost() == null) {
            throw ModelGatewayException.validation(
                    "model_gateway.endpoint_not_allowed",
                    "The model endpoint is not allowed.");
        }
        new StrictModelOutboundEndpointPolicy(
                Set.of(endpoint.getHost()),
                InetAddress::getAllByName,
                allowLoopbackForTests)
                .validate(endpoint);
    }

    @Override
    public void validate(ModelEndpointBinding binding) {
        validate(binding.endpoint());
    }
}
