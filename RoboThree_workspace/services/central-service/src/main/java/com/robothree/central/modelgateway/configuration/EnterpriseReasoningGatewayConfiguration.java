package com.robothree.central.modelgateway.configuration;

import com.robothree.central.bootstrap.production.CentralProductionStartupException;
import com.robothree.central.modelgateway.application.DurableModelInvocationV1Alpha3GatewayService;
import com.robothree.central.modelgateway.application.EnterpriseReasoningSecondValidator;
import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer;
import com.robothree.central.modelgateway.application.ModelInvocationV1Alpha3GatewayService;
import com.robothree.central.modelgateway.application.ModelInvocationV1Alpha3Runtime;
import com.robothree.central.modelgateway.application.TransientModelProviderRequestSource;
import com.robothree.central.modelgateway.port.EnterpriseReasoningMappingSource;
import com.robothree.central.modelgateway.port.ModelEndpointBindingResolver;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
public class EnterpriseReasoningGatewayConfiguration {
    public static final String ENABLED_PROPERTY =
            "robothree.model-gateway.enterprise-reasoning-v1alpha3-enabled";

    @Bean
    EnterpriseReasoningGatewayFeatureState enterpriseReasoningGatewayFeatureState(
            Environment environment) {
        String raw = environment.getProperty(ENABLED_PROPERTY, "false");
        if (!Set.of("true", "false").contains(raw)) {
            throw new CentralProductionStartupException(
                    "central.enterprise_reasoning_property_invalid",
                    "enterprise reasoning enabled property must be true or false");
        }
        return new EnterpriseReasoningGatewayFeatureState(Boolean.parseBoolean(raw));
    }

    @Bean
    EnterpriseReasoningGatewayStartupGate enterpriseReasoningGatewayStartupGate(
            ListableBeanFactory beanFactory,
            EnterpriseReasoningGatewayFeatureState state,
            Environment environment) {
        return new EnterpriseReasoningGatewayStartupGate(
                beanFactory, state, environment.matchesProfiles("production"));
    }

    @Bean
    SmartInitializingSingleton enterpriseReasoningGatewayStartupValidation(
            EnterpriseReasoningGatewayStartupGate gate) {
        return gate::validate;
    }

    @Bean
    @ConditionalOnProperty(name = ENABLED_PROPERTY, havingValue = "true")
    @ConditionalOnBean({
        ModelInvocationV1Alpha3Runtime.class,
        TransientModelProviderRequestSource.class,
        ModelInvocationEphemeralBuffer.class,
        ModelEndpointBindingResolver.class,
        EnterpriseReasoningMappingSource.class
    })
    EnterpriseReasoningSecondValidator enterpriseReasoningSecondValidator(
            List<EnterpriseReasoningMappingSource> sources) {
        if (sources.size() != 1) {
            throw new CentralProductionStartupException(
                    "central.enterprise_reasoning_dependency_ambiguous",
                    "enterprise reasoning mapping source must be unique");
        }
        return new EnterpriseReasoningSecondValidator(sources.getFirst());
    }

    @Bean
    @ConditionalOnProperty(name = ENABLED_PROPERTY, havingValue = "true")
    @ConditionalOnBean(EnterpriseReasoningSecondValidator.class)
    ModelInvocationV1Alpha3GatewayService modelInvocationV1Alpha3GatewayService(
            ModelInvocationV1Alpha3Runtime runtime,
            TransientModelProviderRequestSource requests,
            ModelInvocationEphemeralBuffer ephemeral,
            ModelEndpointBindingResolver bindings,
            EnterpriseReasoningSecondValidator reasoning,
            Environment environment) {
        String nodeId = environment.getProperty(
                "robothree.model-gateway.node-id", "central.node-1");
        return new DurableModelInvocationV1Alpha3GatewayService(
                runtime, requests, ephemeral, bindings, reasoning, nodeId, 256);
    }
}
