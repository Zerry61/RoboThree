package com.robothree.central.modelgateway.recovery;

import com.robothree.central.cluster.ClusterHarnessConfiguration;
import com.robothree.central.modelgateway.adapter.http.JdkModelAuthorizedHttpTransport;
import com.robothree.central.modelgateway.adapter.http.StrictModelOutboundEndpointPolicy;
import com.robothree.central.modelgateway.adapter.provider.AnthropicCompatibleModelProviderAdapter;
import com.robothree.central.modelgateway.adapter.provider.OpenAiCompatibleModelProviderAdapter;
import com.robothree.central.modelgateway.adapter.runtime.BufferedModelInvocationEphemeralPublisher;
import com.robothree.central.modelgateway.adapter.runtime.ProviderBackedModelInvocationExecutionBackend;
import com.robothree.central.modelgateway.adapter.runtime.StrictModelProviderAdapterRegistry;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime;
import com.robothree.central.modelgateway.application.ModelInvocationRuntimePolicy;
import com.robothree.central.modelgateway.development.DevelopmentModelBindingStateProvider;
import com.robothree.central.modelgateway.development.DevelopmentModelCredentialResolver;
import com.robothree.central.modelgateway.development.FixedSyntheticModelProviderRequestSource;
import com.robothree.central.modelgateway.development.SecureModelInvocationEntropySource;
import com.robothree.central.modelgateway.development.VersionedDevelopmentModelBindingRegistry;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.port.ModelBindingRuntimeStateProvider.RuntimeState;
import com.robothree.central.modelgateway.port.ModelCredentialMaterialSource;
import com.robothree.central.modelgateway.port.ModelEndpointValidator;
import com.robothree.central.modelgateway.port.ModelInvocationAccessAuthorizer;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessFacts.BindingMode;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessFacts.BindingVersion;
import com.robothree.central.modelgateway.recovery.Cgf2b32HarnessFacts.RunIdentity;
import com.robothree.central.persistence.mybatis.adapter.MyBatisModelInvocationPersistence;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import com.zaxxer.hikari.HikariDataSource;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

@TestConfiguration(proxyBeanMethods = false)
@Profile("cgf2b32-harness")
@Import(ClusterHarnessConfiguration.class)
public class Cgf2b32HarnessConfiguration {

    @Bean
    URI cgf2b32RelayEndpoint(Environment environment) {
        URI endpoint = URI.create(required(
                environment,
                "ROBOTHREE_CGF2B32_RELAY_ENDPOINT")).normalize();
        if (!"http".equalsIgnoreCase(endpoint.getScheme())
                || !"127.0.0.1".equals(endpoint.getHost())
                || !"/relay".equals(endpoint.getPath())
                || endpoint.getPort() < 1
                || endpoint.getUserInfo() != null
                || endpoint.getQuery() != null
                || endpoint.getFragment() != null) {
            throw new IllegalStateException("CGF-2B.3.2 relay endpoint is invalid");
        }
        return endpoint;
    }

    @Bean
    List<ModelEndpointBinding> cgf2b32Bindings(
            Environment environment,
            URI endpoint) {
        BindingMode mode = BindingMode.valueOf(required(
                environment,
                "ROBOTHREE_CGF2B32_BINDING_MODE"));
        return Cgf2b32HarnessFacts.bindings(endpoint, mode);
    }

    @Bean
    VersionedDevelopmentModelBindingRegistry cgf2b32BindingRegistry(
            List<ModelEndpointBinding> bindings) {
        return new VersionedDevelopmentModelBindingRegistry(bindings);
    }

    @Bean
    DevelopmentModelBindingStateProvider cgf2b32BindingState(
            List<ModelEndpointBinding> bindings) {
        DevelopmentModelBindingStateProvider state =
                new DevelopmentModelBindingStateProvider();
        for (ModelEndpointBinding binding : bindings) {
            state.set(binding.reference(), new RuntimeState(true, false, true));
        }
        return state;
    }

    @Bean
    DevelopmentModelCredentialResolver cgf2b32CredentialResolver() {
        DevelopmentModelCredentialResolver credentials =
                new DevelopmentModelCredentialResolver();
        credentials.register(
                Cgf2b32HarnessFacts.CREDENTIAL_REFERENCE,
                Cgf2b32HarnessFacts.CREDENTIAL_REVISION);
        return credentials;
    }

    @Bean
    ModelCredentialMaterialSource cgf2b32CredentialMaterialSource(
            Environment environment) {
        String credentialMaterial = required(
                environment,
                "ROBOTHREE_CGF2B32_CREDENTIAL_MATERIAL");
        return (reference, revision) -> {
            if (!Cgf2b32HarnessFacts.CREDENTIAL_REFERENCE.equals(reference)
                    || !Cgf2b32HarnessFacts.CREDENTIAL_REVISION.equals(revision)) {
                throw ModelGatewayException.unavailable(
                        "model_gateway.credential_unavailable",
                        "The model provider credential is unavailable.");
            }
            return credentialMaterial.toCharArray();
        };
    }

    @Bean
    RunIdentity cgf2b32RunIdentity(Environment environment) {
        return new RunIdentity(required(
                environment,
                "ROBOTHREE_CGF2B32_RUN_CANARY"));
    }

    @Bean
    FixedSyntheticModelProviderRequestSource cgf2b32RequestSource(
            RunIdentity runIdentity) {
        return new FixedSyntheticModelProviderRequestSource(List.of(
                Cgf2b32HarnessFacts.request(BindingVersion.V1, runIdentity.canary()),
                Cgf2b32HarnessFacts.request(BindingVersion.V2, runIdentity.canary())));
    }

    @Bean
    StrictModelProviderAdapterRegistry cgf2b32AdapterRegistry(
            ModelCredentialMaterialSource credentialSource) {
        HttpClient client = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Duration.ofSeconds(2))
                .build();
        JdkModelAuthorizedHttpTransport transport =
                new JdkModelAuthorizedHttpTransport(
                        client,
                        credentialSource,
                        new StrictModelOutboundEndpointPolicy(
                                Set.of("127.0.0.1"),
                                host -> InetAddress.getAllByName(host),
                                true));
        return new StrictModelProviderAdapterRegistry(List.of(
                new OpenAiCompatibleModelProviderAdapter(transport),
                new AnthropicCompatibleModelProviderAdapter(transport)));
    }

    @Bean
    ModelInvocationRuntimePolicy cgf2b32Policy() {
        return new ModelInvocationRuntimePolicy(
                Cgf2b32HarnessFacts.POLICY_REVISION,
                Duration.ofSeconds(5),
                Duration.ofSeconds(1),
                Duration.ofMinutes(2),
                Duration.ofSeconds(10),
                Duration.ofSeconds(5),
                32,
                64 * 1_024);
    }

    @Bean
    ModelInvocationEphemeralBuffer cgf2b32EphemeralBuffer(
            ModelInvocationRuntimePolicy policy) {
        return new ModelInvocationEphemeralBuffer(
                policy.maximumEphemeralEvents(),
                policy.maximumEphemeralUtf8Bytes());
    }

    @Bean
    Cgf2b32FailpointBackend cgf2b32Backend(
            FixedSyntheticModelProviderRequestSource requestSource,
            StrictModelProviderAdapterRegistry adapterRegistry,
            ModelInvocationEphemeralBuffer ephemeralBuffer,
            Clock clock) {
        ProviderBackedModelInvocationExecutionBackend providerBackend =
                new ProviderBackedModelInvocationExecutionBackend(
                        requestSource,
                        adapterRegistry,
                        new BufferedModelInvocationEphemeralPublisher(
                                ephemeralBuffer,
                                clock));
        return new Cgf2b32FailpointBackend(providerBackend);
    }

    @Bean
    ModelEndpointValidator cgf2b32EndpointValidator(URI relayEndpoint) {
        return binding -> {
            if (!relayEndpoint.equals(binding.endpoint())
                    || !"127.0.0.1".equals(binding.endpoint().getHost())) {
                throw ModelGatewayException.validation(
                        "model_gateway.endpoint_invalid",
                        "The model endpoint is invalid.");
            }
        };
    }

    @Bean
    ModelInvocationAccessAuthorizer cgf2b32Authorizer() {
        return compactAccessToken -> {
            if (!Cgf2b32HarnessFacts.ACCESS_TOKEN.equals(compactAccessToken)) {
                throw new IllegalArgumentException("CGF-2B.3.2 harness access denied");
            }
            return new ModelInvocationAccessAuthorizer.AuthorizedSubject(
                    Cgf2b32HarnessFacts.ENTERPRISE_ID,
                    Cgf2b32HarnessFacts.USER_ID,
                    Cgf2b32HarnessFacts.DEVICE_ID,
                    Cgf2b32HarnessFacts.CLIENT_INSTANCE_ID);
        };
    }

    @Bean
    Cgf2b32SelectionState cgf2b32SelectionState() {
        return new Cgf2b32SelectionState();
    }

    @Bean
    ModelInvocationRuntime cgf2b32Runtime(
            ModelInvocationAccessAuthorizer authorizer,
            VersionedDevelopmentModelBindingRegistry registry,
            DevelopmentModelBindingStateProvider state,
            DevelopmentModelCredentialResolver credentials,
            ModelEndpointValidator endpointValidator,
            Cgf2b32FailpointBackend backend,
            MyBatisModelInvocationPersistence persistence,
            SpringCentralTransactionRunner transactions,
            ModelInvocationRuntimePolicy policy,
            ModelInvocationEphemeralBuffer ephemeralBuffer,
            Clock clock) {
        return new ModelInvocationRuntime(
                authorizer,
                registry,
                state,
                credentials,
                endpointValidator,
                backend,
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                transactions,
                policy,
                new SecureModelInvocationEntropySource(),
                ephemeralBuffer,
                clock);
    }

    @Bean
    Cgf2b32HarnessApplicationService cgf2b32ApplicationService(
            Environment environment,
            ModelInvocationRuntime runtime,
            Cgf2b32FailpointBackend backend,
            Cgf2b32SelectionState selection,
            RunIdentity runIdentity,
            ModelInvocationEphemeralBuffer ephemeral,
            HikariDataSource dataSource) {
        return new Cgf2b32HarnessApplicationService(
                required(environment, "ROBOTHREE_CLUSTER_NODE_ID"),
                runtime,
                backend,
                selection,
                runIdentity,
                ephemeral,
                dataSource);
    }

    private static String required(Environment environment, String name) {
        String value = environment.getProperty(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "CGF-2B.3.2 harness environment is incomplete: " + name);
        }
        return value;
    }
}
