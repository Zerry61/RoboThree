package com.robothree.central.admincontrol.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import com.robothree.central.admincontrol.application.AdminCapabilityProjectionService;
import com.robothree.central.admincontrol.application.AdminPrincipalProvider;
import com.robothree.central.admincontrol.application.DevelopmentAdminPrincipalProvider;
import com.robothree.central.admincontrol.domain.AdminCapabilitySource;
import com.robothree.central.admincontrol.domain.AdminIdentityFlags;
import com.robothree.central.admincontrol.domain.AdminPrincipalSummary;
import com.robothree.central.bootstrap.production.CentralProductionStartupException;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class AdminCapabilityProjectionConfigurationTest {

    private final ApplicationContextRunner contextRunner =
            new ApplicationContextRunner()
                    .withUserConfiguration(AdminCapabilityProjectionConfiguration.class);

    @Test
    void defaultProfileDoesNotInstallTheTestOnlyPrincipalOrProjectionService() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(DevelopmentAdminPrincipalProvider.class);
            assertThat(context).doesNotHaveBean(AdminPrincipalProvider.class);
            assertThat(context).doesNotHaveBean(AdminCapabilityProjectionService.class);
            assertThat(context).hasSingleBean(AdminControlProductionGraphGuard.class);
        });
    }

    @Test
    void developmentProfileInstallsOnlyTheExplicitTestPrincipalPath() {
        contextRunner
                .withInitializer(context ->
                        context.getEnvironment().setActiveProfiles("development"))
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(DevelopmentAdminPrincipalProvider.class);
                    assertThat(context).hasSingleBean(AdminPrincipalProvider.class);
                    assertThat(context).hasSingleBean(AdminCapabilityProjectionService.class);
                    var projection = context
                            .getBean(AdminCapabilityProjectionService.class)
                            .currentProjection();
                    assertThat(projection.testIdentityUsed()).isTrue();
                    assertThat(projection.productionIdentityReady()).isFalse();
                    assertThat(projection.capabilities())
                            .allSatisfy(capability -> assertThat(capability.source())
                                    .isEqualTo(AdminCapabilitySource.TEST_ONLY));
                });
    }

    @Test
    void testProfileInstallsTheSameExplicitTestPrincipalPath() {
        contextRunner
                .withInitializer(context ->
                        context.getEnvironment().setActiveProfiles("test"))
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(DevelopmentAdminPrincipalProvider.class);
                    assertThat(context).hasSingleBean(AdminCapabilityProjectionService.class);
                });
    }

    @Test
    void productionProfileDoesNotFallbackToTheTestOnlyPrincipal() {
        contextRunner
                .withInitializer(context ->
                        context.getEnvironment().setActiveProfiles("production"))
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(AdminPrincipalProvider.class);
                    assertThat(context).doesNotHaveBean(AdminCapabilityProjectionService.class);
                });
    }

    @Test
    void productionProfileRejectsAnyPrincipalProviderInsteadOfAcceptingFakeFallbacks() {
        contextRunner
                .withInitializer(context ->
                        context.getEnvironment().setActiveProfiles("production"))
                .withBean(FakeAdminPrincipalProvider.class)
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .isInstanceOf(CentralProductionStartupException.class)
                            .extracting("code")
                            .isEqualTo(
                                    "central.admin_control_principal_provider_forbidden_in_production");
                });
    }

    static final class FakeAdminPrincipalProvider implements AdminPrincipalProvider {
        @Override
        public AdminPrincipalSummary currentPrincipal() {
            return new AdminPrincipalSummary(
                    "admintest_aapi02_fake_provider",
                    "Fake Admin",
                    AdminCapabilitySource.TEST_ONLY,
                    AdminIdentityFlags.testOnly());
        }
    }
}
