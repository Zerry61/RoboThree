package com.robothree.central.modelgateway.recovery;

import com.robothree.central.cluster.ClusterHarnessConfiguration;
import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime;
import com.robothree.central.modelgateway.application.ModelInvocationAdmissionPolicy;
import com.robothree.central.modelgateway.application.ModelInvocationRuntimePolicy;
import com.robothree.central.modelgateway.application.DeterministicPromptCachePlanner;
import com.robothree.central.modelgateway.application.PromptCacheCompatibilityClassifier;
import com.robothree.central.modelgateway.application.PromptCachePlanningService;
import com.robothree.central.modelgateway.application.StaticPromptPrefixProjector;
import com.robothree.central.modelgateway.application.TransientModelProviderRequestSource;
import com.robothree.central.modelgateway.application.VersionedPromptCacheProfileRegistry;
import com.robothree.central.modelgateway.development.DevelopmentModelBindingStateProvider;
import com.robothree.central.modelgateway.development.DevelopmentModelCredentialResolver;
import com.robothree.central.modelgateway.development.SecureModelInvocationEntropySource;
import com.robothree.central.modelgateway.development.StrictModelEndpointValidator;
import com.robothree.central.modelgateway.development.VersionedDevelopmentModelBindingRegistry;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.modelgateway.port.ModelBindingRuntimeStateProvider.RuntimeState;
import com.robothree.central.modelgateway.port.ModelInvocationAccessAuthorizer;
import com.robothree.central.persistence.mybatis.adapter.MyBatisModelInvocationPersistence;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import com.zaxxer.hikari.HikariDataSource;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

@TestConfiguration(proxyBeanMethods = false)
@Profile("model-recovery-harness")
@Import(ClusterHarnessConfiguration.class)
public class ModelRecoveryHarnessConfiguration {

    @Bean
    ModelEndpointBinding modelRecoveryBinding() {
        return ModelRecoveryHarnessFacts.binding();
    }

    @Bean
    VersionedDevelopmentModelBindingRegistry modelRecoveryBindingRegistry(
            ModelEndpointBinding binding) {
        return new VersionedDevelopmentModelBindingRegistry(List.of(binding));
    }

    @Bean
    DevelopmentModelBindingStateProvider modelRecoveryBindingState(
            ModelEndpointBinding binding) {
        DevelopmentModelBindingStateProvider state =
                new DevelopmentModelBindingStateProvider();
        state.set(binding.reference(), new RuntimeState(true, false, true));
        return state;
    }

    @Bean
    DevelopmentModelCredentialResolver modelRecoveryCredentials() {
        DevelopmentModelCredentialResolver credentials =
                new DevelopmentModelCredentialResolver();
        credentials.register(
                ModelRecoveryHarnessFacts.CREDENTIAL_REFERENCE,
                ModelRecoveryHarnessFacts.CREDENTIAL_REVISION);
        return credentials;
    }

    @Bean
    PromptCacheProfile modelRecoveryPromptCacheProfile() {
        return PromptCacheProfile.create(
                "profile.model-recovery",
                ModelRecoveryHarnessFacts.CAPABILITY_PROFILE_REVISION,
                PromptCacheProfile.Status.ACTIVE,
                ModelEndpointBinding.Protocol.ANTHROPIC_COMPATIBLE,
                List.of(ModelEndpointBinding.ConnectionMode.CUSTOM_RELAY),
                PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                "route.model-recovery",
                PromptCacheProfile.Assurance.PROVEN,
                PromptCacheProfile.Assurance.PROVIDER_DOCUMENTED,
                ModelRecoveryHarnessFacts.MARKER_POLICY_REVISION,
                null);
    }

    @Bean
    VersionedPromptCacheProfileRegistry modelRecoveryPromptCacheProfiles(
            PromptCacheProfile profile) {
        return new VersionedPromptCacheProfileRegistry(List.of(profile));
    }

    @Bean
    TransientModelProviderRequestSource modelRecoveryProviderRequests() {
        return new TransientModelProviderRequestSource();
    }

    @Bean
    PromptCachePlanningService modelRecoveryPromptCachePlanning(
            MyBatisModelInvocationPersistence persistence,
            VersionedPromptCacheProfileRegistry profiles,
            TransientModelProviderRequestSource requests,
            Clock clock) {
        return new PromptCachePlanningService(
                persistence,
                persistence,
                profiles,
                new PromptCacheCompatibilityClassifier(),
                new StaticPromptPrefixProjector(),
                new DeterministicPromptCachePlanner(),
                requests,
                clock);
    }

    @Bean
    HarnessModelInvocationBackend modelRecoveryBackend() {
        return new HarnessModelInvocationBackend();
    }

    @Bean
    ModelInvocationRuntimePolicy modelRecoveryPolicy() {
        return new ModelInvocationRuntimePolicy(
                "4".repeat(64),
                Duration.ofSeconds(5),
                Duration.ofSeconds(1),
                Duration.ofMinutes(2),
                Duration.ofSeconds(10),
                Duration.ofSeconds(5),
                32,
                64 * 1_024);
    }

    @Bean
    ModelInvocationAccessAuthorizer modelRecoveryAuthorizer() {
        return compactAccessToken -> {
            if (!ModelRecoveryHarnessFacts.ACCESS_TOKEN.equals(compactAccessToken)) {
                throw new IllegalArgumentException(
                        "model recovery harness access denied");
            }
            return new ModelInvocationAccessAuthorizer.AuthorizedSubject(
                    ModelRecoveryHarnessFacts.ENTERPRISE_ID,
                    ModelRecoveryHarnessFacts.USER_ID,
                    ModelRecoveryHarnessFacts.DEVICE_ID,
                    ModelRecoveryHarnessFacts.CLIENT_INSTANCE_ID);
        };
    }

    @Bean
    ModelInvocationRuntime modelRecoveryRuntime(
            ModelInvocationAccessAuthorizer authorizer,
            VersionedDevelopmentModelBindingRegistry registry,
            DevelopmentModelBindingStateProvider state,
            DevelopmentModelCredentialResolver credentials,
            HarnessModelInvocationBackend backend,
            MyBatisModelInvocationPersistence persistence,
            SpringCentralTransactionRunner transactions,
            ModelInvocationRuntimePolicy policy,
            PromptCachePlanningService cachePlanning,
            Clock clock) {
        return new ModelInvocationRuntime(
                authorizer,
                registry,
                state,
                credentials,
                new StrictModelEndpointValidator(),
                backend,
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                transactions,
                policy,
                new SecureModelInvocationEntropySource(),
                new ModelInvocationEphemeralBuffer(
                        policy.maximumEphemeralEvents(),
                        policy.maximumEphemeralUtf8Bytes()),
                ModelInvocationAdmissionPolicy.development(),
                persistence,
                cachePlanning,
                clock);
    }

    @Bean
    ModelRecoveryHarnessApplicationService modelRecoveryApplicationService(
            Environment environment,
            ModelInvocationRuntime runtime,
            HarnessModelInvocationBackend backend,
            TransientModelProviderRequestSource requests,
            HikariDataSource dataSource) {
        return new ModelRecoveryHarnessApplicationService(
                required(environment, "ROBOTHREE_CLUSTER_NODE_ID"),
                runtime,
                backend,
                requests,
                dataSource);
    }

    private static String required(Environment environment, String name) {
        String value = environment.getProperty(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "model recovery harness environment is incomplete: " + name);
        }
        return value;
    }
}
