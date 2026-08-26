package com.robothree.central.authentication.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import com.robothree.central.authentication.adapter.http.EnterpriseSessionController;
import com.robothree.central.authentication.adapter.http.EnterpriseSessionControllerAdvice;
import com.robothree.central.authentication.adapter.http.EnterpriseSessionRequestSizeFilter;
import com.robothree.central.bootstrap.production.CentralProductionStartupException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class EnterpriseSessionFeatureContextTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(
                    EnterpriseSessionFeatureConfiguration.class,
                    EnterpriseSessionController.class,
                    EnterpriseSessionControllerAdvice.class,
                    EnterpriseSessionRequestSizeFilter.class)
            .withBean(ObjectMapper.class, ObjectMapper::new);

    @Test
    void disabledFeatureRegistersNoControllerAdviceOrRequestFilter() {
        contextRunner
                .withPropertyValues("robothree.enterprise-session.enabled=false")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(EnterpriseSessionController.class);
                    assertThat(context).doesNotHaveBean(EnterpriseSessionControllerAdvice.class);
                    assertThat(context).doesNotHaveBean(EnterpriseSessionRequestSizeFilter.class);
                });
    }

    @Test
    void requestedFeatureWithMissingProductionDependenciesFailsStartup() {
        contextRunner
                .withPropertyValues("robothree.enterprise-session.enabled=true")
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .isInstanceOf(CentralProductionStartupException.class)
                            .extracting("code")
                            .isEqualTo("central.enterprise_session_dependency_missing");
                });
    }
}
