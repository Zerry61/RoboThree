package com.robothree.central.modelgateway.adapter.runtime;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.port.ModelProviderAdapter;
import com.robothree.central.modelgateway.port.ModelProviderAdapterRegistry;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class StrictModelProviderAdapterRegistry
        implements ModelProviderAdapterRegistry {

    private final Map<Protocol, ModelProviderAdapter> adapters;

    public StrictModelProviderAdapterRegistry(
            List<ModelProviderAdapter> adapters) {
        Objects.requireNonNull(adapters, "adapters");
        EnumMap<Protocol, ModelProviderAdapter> byProtocol =
                new EnumMap<>(Protocol.class);
        for (ModelProviderAdapter adapter : adapters) {
            Objects.requireNonNull(adapter, "adapter");
            if (byProtocol.putIfAbsent(adapter.protocol(), adapter) != null) {
                throw new IllegalArgumentException(
                        "model provider protocol must resolve exactly once");
            }
        }
        this.adapters = Map.copyOf(byProtocol);
    }

    @Override
    public ModelProviderAdapter resolve(Protocol protocol) {
        ModelProviderAdapter adapter = adapters.get(
                Objects.requireNonNull(protocol, "protocol"));
        if (adapter == null) {
            throw ModelGatewayException.validation(
                    "model_gateway.provider_adapter_missing",
                    "The exact model provider adapter is unavailable.");
        }
        return adapter;
    }
}
