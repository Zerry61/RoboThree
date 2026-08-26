package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;

public interface ModelEndpointBindingResolver {

    ModelEndpointBinding resolveForSelection(ModelEndpointBinding.Selection selection);

    ModelEndpointBinding resolveDispatchDecision(String decisionDigest);
}
