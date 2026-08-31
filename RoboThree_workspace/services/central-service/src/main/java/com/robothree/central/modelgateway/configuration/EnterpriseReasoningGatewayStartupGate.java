package com.robothree.central.modelgateway.configuration;

import com.robothree.central.bootstrap.production.CentralProductionStartupException;
import com.robothree.central.modelgateway.application.EnterpriseReasoningSecondValidator;
import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer;
import com.robothree.central.modelgateway.application.ModelInvocationV1Alpha3Runtime;
import com.robothree.central.modelgateway.application.ModelInvocationV1Alpha3GatewayService;
import com.robothree.central.modelgateway.application.TransientModelProviderRequestSource;
import com.robothree.central.modelgateway.port.EnterpriseReasoningMappingSource;
import com.robothree.central.modelgateway.port.ModelEndpointBindingResolver;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.beans.factory.ListableBeanFactory;

/** Fails before HTTP readiness when the v1alpha3 graph is requested incompletely. */
public final class EnterpriseReasoningGatewayStartupGate {
    private final ListableBeanFactory beanFactory;
    private final EnterpriseReasoningGatewayFeatureState state;
    private final boolean productionProfile;

    public EnterpriseReasoningGatewayStartupGate(
            ListableBeanFactory beanFactory,
            EnterpriseReasoningGatewayFeatureState state,
            boolean productionProfile) {
        this.beanFactory = Objects.requireNonNull(beanFactory, "beanFactory");
        this.state = Objects.requireNonNull(state, "state");
        this.productionProfile = productionProfile;
    }

    public void validate() {
        if (!state.requested()) return;
        if (productionProfile) {
            throw startup(
                    "central.enterprise_reasoning_production_activation_forbidden",
                    "enterprise reasoning Gateway is not production-ready");
        }
        for (Class<?> type : requiredTypes()) {
            String[] names = beanFactory.getBeanNamesForType(type, false, false);
            if (names.length == 0) {
                throw startup(
                        "central.enterprise_reasoning_dependency_missing",
                        "required enterprise reasoning dependency is unavailable");
            }
            if (names.length != 1) {
                throw startup(
                        "central.enterprise_reasoning_dependency_ambiguous",
                        "required enterprise reasoning dependency is ambiguous");
            }
            rejectNonProductionNameInNonTestProfile(type, names[0]);
        }
    }

    private void rejectNonProductionNameInNonTestProfile(Class<?> contract, String beanName) {
        Class<?> implementation = beanFactory.getType(beanName, false);
        if (implementation == null) {
            throw startup(
                    "central.enterprise_reasoning_dependency_unresolved",
                    "enterprise reasoning dependency type is unresolved");
        }
        String qualified = implementation.getName().toLowerCase(Locale.ROOT);
        if (qualified.contains(".support.") || qualified.contains(".test.")) {
            return; // The only presently authorized complete graph is the explicit test graph.
        }
        if (implementation.getSimpleName().toLowerCase(Locale.ROOT).startsWith("fake")) {
            throw startup(
                    "central.enterprise_reasoning_non_production_dependency",
                    "untrusted enterprise reasoning dependency is present: "
                            + contract.getSimpleName());
        }
    }

    private static List<Class<?>> requiredTypes() {
        return List.of(
                ModelInvocationV1Alpha3Runtime.class,
                TransientModelProviderRequestSource.class,
                ModelInvocationEphemeralBuffer.class,
                ModelEndpointBindingResolver.class,
                EnterpriseReasoningMappingSource.class,
                EnterpriseReasoningSecondValidator.class,
                ModelInvocationV1Alpha3GatewayService.class);
    }

    private static CentralProductionStartupException startup(String code, String message) {
        return new CentralProductionStartupException(code, message);
    }
}
