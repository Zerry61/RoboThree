package com.robothree.central.modelgateway.configuration;

import static org.assertj.core.api.Assertions.assertThat;
import com.robothree.central.bootstrap.production.CentralProductionStartupException;
import com.robothree.central.modelgateway.adapter.http.ModelInvocationV1Alpha3Controller;
import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime.AcceptCommand;
import com.robothree.central.modelgateway.application.ModelInvocationV1Alpha3GatewayService;
import com.robothree.central.modelgateway.application.ModelInvocationV1Alpha3Runtime;
import com.robothree.central.modelgateway.application.ReleasePinnedEnterpriseReasoningMappingSource;
import com.robothree.central.modelgateway.application.TransientModelProviderRequestSource;
import com.robothree.central.modelgateway.port.EnterpriseReasoningMappingSource;
import com.robothree.central.modelgateway.port.ModelEndpointBindingResolver;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import com.robothree.central.shared.observability.CentralObservationRunner;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

final class EnterpriseReasoningGatewayConfigurationTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(
                    EnterpriseReasoningGatewayConfiguration.class,
                    ModelInvocationV1Alpha3Controller.class);

    @Test
    void disabledRegistersNoV1Alpha3ServiceOrController() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(ModelInvocationV1Alpha3GatewayService.class);
            assertThat(context).doesNotHaveBean(ModelInvocationV1Alpha3Controller.class);
        });
    }

    @Test
    void enabledWithAnIncompleteGraphFailsBeforeReadiness() {
        runner.withPropertyValues(
                        EnterpriseReasoningGatewayConfiguration.ENABLED_PROPERTY + "=true")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .isInstanceOf(CentralProductionStartupException.class)
                            .extracting("code")
                            .isEqualTo("central.enterprise_reasoning_dependency_missing");
                });
    }

    @Test
    void productionCannotActivateEvenIfThePropertyIsSet() {
        runner.withInitializer(context ->
                        context.getEnvironment().setActiveProfiles("production"))
                .withPropertyValues(
                        EnterpriseReasoningGatewayConfiguration.ENABLED_PROPERTY + "=true")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .isInstanceOf(CentralProductionStartupException.class)
                            .extracting("code")
                            .isEqualTo(
                                    "central.enterprise_reasoning_production_activation_forbidden");
                });
    }

    @Test
    void explicitTestGraphInstallsExactlyOneServiceAndController() {
        runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("test"))
                .withPropertyValues(
                        EnterpriseReasoningGatewayConfiguration.ENABLED_PROPERTY + "=true")
                .withBean(ModelInvocationV1Alpha3Runtime.class,
                        EnterpriseReasoningGatewayConfigurationTest::runtime)
                .withBean(TransientModelProviderRequestSource.class,
                        TransientModelProviderRequestSource::new)
                .withBean(ModelInvocationEphemeralBuffer.class,
                        () -> new ModelInvocationEphemeralBuffer(32, 65_536))
                .withBean(ModelEndpointBindingResolver.class,
                        EnterpriseReasoningGatewayConfigurationTest::bindings)
                .withBean(EnterpriseReasoningMappingSource.class,
                        () -> new ReleasePinnedEnterpriseReasoningMappingSource(List.of()))
                .withBean(CentralObservationRunner.class,
                        CentralObservationRunner::noop)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(ModelInvocationV1Alpha3GatewayService.class);
                    assertThat(context).hasSingleBean(ModelInvocationV1Alpha3Controller.class);
                });
    }

    private static ModelEndpointBindingResolver bindings() {
        return new ModelEndpointBindingResolver() {
            @Override public com.robothree.central.modelgateway.domain.ModelEndpointBinding
                    resolveForSelection(
                            com.robothree.central.modelgateway.domain.ModelEndpointBinding.Selection
                                    selection) {
                throw new UnsupportedOperationException();
            }
            @Override public com.robothree.central.modelgateway.domain.ModelEndpointBinding
                    resolveDispatchDecision(String decisionDigest) {
                throw new UnsupportedOperationException();
            }
        };
    }

    private static ModelInvocationV1Alpha3Runtime runtime() {
        return new ModelInvocationV1Alpha3Runtime() {
            @Override public ModelInvocation accept(String token, AcceptCommand command) {
                throw new UnsupportedOperationException();
            }
            @Override public ModelInvocation acceptV1Alpha2(
                    String token, AcceptCommand command, String session, String cache) {
                throw new UnsupportedOperationException();
            }
            @Override public ModelInvocation execute(UUID id, String node) {
                throw new UnsupportedOperationException();
            }
            @Override public ModelInvocation recover(UUID id, String node) {
                throw new UnsupportedOperationException();
            }
            @Override public ModelInvocation requestCancel(
                    String token, UUID id, long revision, String reason) {
                throw new UnsupportedOperationException();
            }
            @Override public ModelInvocation status(String token, UUID id) {
                throw new UnsupportedOperationException();
            }
            @Override public List<ModelInvocationDurableEvent> durableEvents(
                    String token, UUID id, long after, int limit) {
                return List.of();
            }
        };
    }
}
