package com.robothree.central.modelgateway.configuration;

import com.robothree.central.modelgateway.application.DurableModelInvocationV1Alpha2GatewayService;
import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime;
import com.robothree.central.modelgateway.application.ModelInvocationV1Alpha2GatewayService;
import com.robothree.central.modelgateway.application.PromptCachePlanningService;
import com.robothree.central.modelgateway.application.TransientModelProviderRequestSource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/** Fail-closed activation: no v1alpha2 service exists until the full planning graph exists. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnBean({
    ModelInvocationRuntime.class,
    PromptCachePlanningService.class,
    TransientModelProviderRequestSource.class,
    ModelInvocationEphemeralBuffer.class
})
public class PromptCacheGatewayConfiguration {

    @Bean
    @ConditionalOnMissingBean(ModelInvocationV1Alpha2GatewayService.class)
    ModelInvocationV1Alpha2GatewayService modelInvocationV1Alpha2GatewayService(
            ModelInvocationRuntime runtime,
            PromptCachePlanningService planning,
            TransientModelProviderRequestSource requests,
            ModelInvocationEphemeralBuffer ephemeral,
            Environment environment) {
        // The parameter is deliberately required so an incomplete planner graph cannot activate.
        java.util.Objects.requireNonNull(planning, "planning");
        String nodeId = environment.getProperty(
                "robothree.model-gateway.node-id",
                "central.node-1");
        return new DurableModelInvocationV1Alpha2GatewayService(
                runtime,
                requests,
                ephemeral,
                nodeId,
                256);
    }
}
