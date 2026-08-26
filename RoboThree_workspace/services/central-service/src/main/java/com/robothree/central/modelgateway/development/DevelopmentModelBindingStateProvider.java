package com.robothree.central.modelgateway.development;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.port.ModelBindingRuntimeStateProvider;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class DevelopmentModelBindingStateProvider
        implements ModelBindingRuntimeStateProvider {

    private final Map<ModelEndpointBinding.Reference, RuntimeState> states =
            new ConcurrentHashMap<>();

    public void set(
            ModelEndpointBinding.Reference reference,
            RuntimeState state) {
        states.put(reference, state);
    }

    @Override
    public RuntimeState resolve(ModelEndpointBinding.Reference reference) {
        RuntimeState state = states.get(reference);
        if (state == null) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.binding_state_unavailable",
                    "The model binding state is unavailable.");
        }
        return state;
    }
}
