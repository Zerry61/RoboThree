package com.robothree.central.modelgateway.development;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.application.ModelDispatchDecision;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.port.ModelEndpointBindingResolver;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class VersionedDevelopmentModelBindingRegistry
        implements ModelEndpointBindingResolver {

    private final Map<ModelEndpointBinding.Selection, ModelEndpointBinding> selections;
    private final Map<String, ModelEndpointBinding> dispatchDecisions;

    public VersionedDevelopmentModelBindingRegistry(
            List<ModelEndpointBinding> bindings) {
        Objects.requireNonNull(bindings, "bindings");
        Map<ModelEndpointBinding.Selection, ModelEndpointBinding> bySelection =
                new HashMap<>();
        Map<String, ModelEndpointBinding> byDispatchDecision =
                new HashMap<>();
        for (ModelEndpointBinding binding : bindings) {
            Objects.requireNonNull(binding, "binding");
            if (bySelection.putIfAbsent(binding.selection(), binding) != null) {
                throw new IllegalArgumentException(
                        "development binding selection must resolve exactly once");
            }
            String decisionDigest =
                    ModelDispatchDecision.fromBinding(binding).decisionDigest();
            if (byDispatchDecision.putIfAbsent(decisionDigest, binding) != null) {
                throw new IllegalArgumentException(
                        "development dispatch decision must resolve exactly once");
            }
        }
        this.selections = Map.copyOf(bySelection);
        this.dispatchDecisions = Map.copyOf(byDispatchDecision);
    }

    @Override
    public ModelEndpointBinding resolveForSelection(
            ModelEndpointBinding.Selection selection) {
        ModelEndpointBinding binding = selections.get(selection);
        if (binding == null) {
            throw ModelGatewayException.validation(
                    "model_gateway.binding_missing",
                    "The exact model binding is unavailable.");
        }
        return binding;
    }

    @Override
    public ModelEndpointBinding resolveDispatchDecision(String decisionDigest) {
        ModelEndpointBinding binding = dispatchDecisions.get(decisionDigest);
        if (binding == null) {
            throw ModelGatewayException.validation(
                    "model_gateway.binding_revision_missing",
                    "The persisted model binding revision is unavailable.");
        }
        return binding;
    }
}
