package com.robothree.central.modelgateway.application;

/** Profile-owned admission gate. Production never accepts synthetic evidence. */
public final class ModelInvocationAdmissionPolicy {

    private final boolean developmentSyntheticEnabled;

    private ModelInvocationAdmissionPolicy(boolean developmentSyntheticEnabled) {
        this.developmentSyntheticEnabled = developmentSyntheticEnabled;
    }

    public static ModelInvocationAdmissionPolicy development() {
        return new ModelInvocationAdmissionPolicy(true);
    }

    public static ModelInvocationAdmissionPolicy production() {
        return new ModelInvocationAdmissionPolicy(false);
    }

    public void validate(String admissionType) {
        if ("user_confirmed".equals(admissionType)) {
            return;
        }
        if ("development_synthetic".equals(admissionType)
                && developmentSyntheticEnabled) {
            return;
        }
        throw ModelGatewayException.validation(
                "model_gateway.admission_not_enabled",
                "The Model invocation admission type is not enabled.");
    }
}
