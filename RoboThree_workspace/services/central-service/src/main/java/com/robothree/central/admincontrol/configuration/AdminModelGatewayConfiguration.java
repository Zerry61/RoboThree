package com.robothree.central.admincontrol.configuration;

import com.robothree.central.admincontrol.application.AdminManagedModelCredentialMaterialSource;
import com.robothree.central.admincontrol.application.AdminManagedModelGatewaySource;
import com.robothree.central.admincontrol.application.AdminManagedModelOutboundEndpointPolicy;
import com.robothree.central.authentication.port.EnterpriseBearerAuthorizer;
import com.robothree.central.modelgateway.adapter.http.JdkModelAuthorizedHttpTransport;
import com.robothree.central.modelgateway.adapter.provider.OpenAiCompatibleModelProviderAdapter;
import com.robothree.central.modelgateway.adapter.runtime.BufferedModelInvocationEphemeralPublisher;
import com.robothree.central.modelgateway.adapter.runtime.ProviderBackedModelInvocationExecutionBackend;
import com.robothree.central.modelgateway.adapter.runtime.StrictModelProviderAdapterRegistry;
import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer;
import com.robothree.central.modelgateway.application.ModelInvocationGatewayService;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime;
import com.robothree.central.modelgateway.application.ModelInvocationRuntimePolicy;
import com.robothree.central.modelgateway.application.RoboThreeModelInvocationAccessAuthorizer;
import com.robothree.central.modelgateway.application.TransientModelProviderRequestSource;
import com.robothree.central.persistence.mybatis.adapter.MyBatisModelInvocationPersistence;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Complete development/test Gateway graph for the Admin-managed MVP model.
 * It is separately gated and cannot activate under the production profile.
 */
@Configuration(proxyBeanMethods = false)
@Profile({"development", "test"})
@ConditionalOnProperty(
        name = "robothree.admin-api.internal-trial-model-gateway-enabled",
        havingValue = "true")
@ConditionalOnBean({
    AdminManagedModelGatewaySource.class,
    AdminManagedModelCredentialMaterialSource.class,
    MyBatisModelInvocationPersistence.class,
    CentralTransactionRunner.class,
    EnterpriseBearerAuthorizer.class
})
public class AdminModelGatewayConfiguration {
    @Bean
    AdminManagedModelOutboundEndpointPolicy adminManagedModelOutboundEndpointPolicy(
            @Value("${robothree.admin-api.allow-loopback-model-endpoints:false}")
                    boolean allowLoopback) {
        return new AdminManagedModelOutboundEndpointPolicy(allowLoopback);
    }

    @Bean
    ModelInvocationRuntimePolicy adminModelInvocationRuntimePolicy() {
        return ModelInvocationRuntimePolicy.developmentDefaults();
    }

    @Bean
    ModelInvocationEphemeralBuffer adminModelInvocationEphemeralBuffer(
            ModelInvocationRuntimePolicy policy) {
        return new ModelInvocationEphemeralBuffer(
                policy.maximumEphemeralEvents(),
                policy.maximumEphemeralUtf8Bytes());
    }

    @Bean
    TransientModelProviderRequestSource adminModelProviderRequestSource() {
        return new TransientModelProviderRequestSource();
    }

    @Bean
    StrictModelProviderAdapterRegistry adminModelProviderAdapters(
            AdminManagedModelCredentialMaterialSource credentials,
            AdminManagedModelOutboundEndpointPolicy endpoints) {
        HttpClient client = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        var transport = new JdkModelAuthorizedHttpTransport(
                client, credentials, endpoints);
        return new StrictModelProviderAdapterRegistry(List.of(
                new OpenAiCompatibleModelProviderAdapter(transport)));
    }

    @Bean
    ModelInvocationRuntime adminModelInvocationRuntime(
            EnterpriseBearerAuthorizer bearerAuthorizer,
            AdminManagedModelGatewaySource bindings,
            AdminManagedModelOutboundEndpointPolicy endpoints,
            StrictModelProviderAdapterRegistry adapters,
            ModelInvocationRuntimePolicy policy,
            ModelInvocationEphemeralBuffer ephemeral,
            TransientModelProviderRequestSource requests,
            MyBatisModelInvocationPersistence persistence,
            CentralTransactionRunner transactions,
            Clock adminModelClock) {
        var backend = new ProviderBackedModelInvocationExecutionBackend(
                requests,
                adapters,
                new BufferedModelInvocationEphemeralPublisher(ephemeral, adminModelClock));
        return new ModelInvocationRuntime(
                new RoboThreeModelInvocationAccessAuthorizer(
                        bearerAuthorizer, adminModelClock),
                bindings,
                bindings,
                bindings,
                endpoints,
                backend,
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                transactions,
                policy,
                java.util.UUID::randomUUID,
                ephemeral,
                adminModelClock);
    }

    @Bean
    ModelInvocationGatewayService adminModelInvocationGatewayService(
            ModelInvocationRuntime runtime,
            TransientModelProviderRequestSource requests,
            ModelInvocationEphemeralBuffer ephemeral,
            @Value("${robothree.model-gateway.node-id:central.admin-internal-trial}")
                    String nodeId) {
        return new ModelInvocationGatewayService(runtime, requests, ephemeral, nodeId, 256);
    }
}
