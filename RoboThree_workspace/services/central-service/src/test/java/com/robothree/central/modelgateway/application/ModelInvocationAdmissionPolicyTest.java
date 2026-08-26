package com.robothree.central.modelgateway.application;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class ModelInvocationAdmissionPolicyTest {

    @Test
    void productionAcceptsUserConfirmedAndRejectsSynthetic() {
        ModelInvocationAdmissionPolicy policy =
                ModelInvocationAdmissionPolicy.production();

        assertThatCode(() -> policy.validate("user_confirmed"))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> policy.validate("development_synthetic"))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.admission_not_enabled");
    }

    @Test
    void developmentKeepsSyntheticFoundationFixturesAvailable() {
        ModelInvocationAdmissionPolicy policy =
                ModelInvocationAdmissionPolicy.development();

        assertThatCode(() -> policy.validate("development_synthetic"))
                .doesNotThrowAnyException();
        assertThatCode(() -> policy.validate("user_confirmed"))
                .doesNotThrowAnyException();
    }
}

