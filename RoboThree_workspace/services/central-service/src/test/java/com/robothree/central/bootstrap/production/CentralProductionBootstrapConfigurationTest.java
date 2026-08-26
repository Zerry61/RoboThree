package com.robothree.central.bootstrap.production;

import static org.assertj.core.api.Assertions.assertThat;

import com.robothree.central.compatibility.FoundationFixtureController;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class CentralProductionBootstrapConfigurationTest {

    @Test
    void productionProfileFailsClosedWithoutRequiredPorts() {
        new ApplicationContextRunner()
                .withInitializer(context ->
                        context.getEnvironment().setActiveProfiles("production"))
                .withUserConfiguration(CentralProductionBootstrapConfiguration.class)
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(rootCause(context.getStartupFailure()))
                            .isInstanceOfSatisfying(
                                    CentralProductionStartupException.class,
                                    exception -> assertThat(exception.code())
                                            .isEqualTo(
                                                    "central.production_dependency_missing"));
                });
    }

    @Test
    void defaultProfileDoesNotActivateProductionStartupGate() {
        new ApplicationContextRunner()
                .withUserConfiguration(CentralProductionBootstrapConfiguration.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context)
                            .doesNotHaveBean(ProductionDependencyValidator.class)
                            .doesNotHaveBean(
                                    CentralProductionReadinessHealthIndicator.class);
                });
    }

    @Test
    void productionProfileDoesNotExposeFoundationFixtureController() {
        new ApplicationContextRunner()
                .withInitializer(context ->
                        context.getEnvironment().setActiveProfiles("production"))
                .withUserConfiguration(FoundationFixtureController.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(FoundationFixtureController.class);
                });
    }

    private static Throwable rootCause(Throwable failure) {
        Throwable current = failure;
        while (current != null && current.getCause() != null) {
            current = current.getCause();
        }
        return current;
    }
}
