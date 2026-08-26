package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.shared.json.CanonicalJson;

public record ModelDispatchDecision(String decisionDigest) {

    public ModelDispatchDecision {
        if (decisionDigest == null
                || !decisionDigest.matches("^[a-f0-9]{64}$")) {
            throw new IllegalArgumentException(
                    "decisionDigest must be a SHA-256 digest");
        }
    }

    public static ModelDispatchDecision fromBinding(ModelEndpointBinding binding) {
        ModelEndpointBinding.Reference reference = binding.reference();
        return new ModelDispatchDecision(CanonicalJson.sha256(bound(
                reference.bindingRevision(),
                reference.bindingDigest())));
    }

    public String persistedValue() {
        return decisionDigest;
    }

    public static ModelDispatchDecision parse(String value) {
        try {
            return new ModelDispatchDecision(value);
        } catch (RuntimeException exception) {
            throw ModelGatewayException.validation(
                    "model_gateway.dispatch_decision_invalid",
                    "The persisted model dispatch decision is invalid.");
        }
    }

    private static String bound(String... values) {
        StringBuilder input = new StringBuilder();
        for (String value : values) {
            input.append(value.length())
                    .append(':')
                    .append(value)
                    .append('|');
        }
        return input.toString();
    }
}
