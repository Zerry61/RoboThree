package com.robothree.central.admincontrol.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import com.robothree.central.admincontrol.application.AdminCapabilityProjectionService;
import com.robothree.central.admincontrol.application.AdminInventoryCatalog;
import com.robothree.central.admincontrol.application.AdminModuleInventorySource;
import com.robothree.central.admincontrol.application.AdminPrincipalProvider;
import com.robothree.central.admincontrol.application.AdminReadProjectionService;
import com.robothree.central.admincontrol.application.AdminReadProjectionServiceTest;
import com.robothree.central.admincontrol.application.DevelopmentAdminPrincipalProvider;
import com.robothree.central.admincontrol.adapter.http.AdminReadHttpController;
import com.robothree.central.admincontrol.domain.AdminCapabilitySource;
import com.robothree.central.admincontrol.domain.AdminIdentityFlags;
import com.robothree.central.admincontrol.domain.AdminPrincipalSummary;
import com.robothree.central.bootstrap.production.CentralProductionStartupException;
import com.robothree.central.configuration.application.ConfigurationIntegrityVerifier;
import com.robothree.central.configuration.domain.ImmutableConfigurationSnapshot;
import com.robothree.central.configuration.domain.ImmutablePackageDocument;
import com.robothree.central.configuration.port.PackageDocumentRepository;
import com.robothree.central.configuration.port.ConfigurationSnapshotRepository;
import com.robothree.central.modelgateway.domain.ModelInvocationAuditOutbox;
import com.robothree.central.modelgateway.port.ModelInvocationAuditOutboxRepository;
import java.util.List;
import java.util.Optional;
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

    @Test
    void readShellIsAbsentUnlessTheTestProfilePropertyAndInventoryAreAllExplicit() {
        new ApplicationContextRunner()
                .withUserConfiguration(
                        AdminCapabilityProjectionConfiguration.class,
                        AdminReadHttpConfiguration.class,
                        AdminReadHttpController.class)
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("test"))
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(AdminReadProjectionService.class);
                    assertThat(context).doesNotHaveBean(AdminReadHttpController.class);
                });

        new ApplicationContextRunner()
                .withUserConfiguration(
                        AdminCapabilityProjectionConfiguration.class,
                        AdminReadHttpConfiguration.class,
                        AdminReadHttpController.class)
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("test"))
                .withPropertyValues("robothree.admin-api.test-read-shell-enabled=true")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void productionNeverInstallsTheReadShellEvenWhenTheTestPropertyIsTrue() {
        new ApplicationContextRunner()
                .withUserConfiguration(
                        AdminCapabilityProjectionConfiguration.class,
                        AdminReadHttpConfiguration.class,
                        AdminReadHttpController.class)
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("production"))
                .withPropertyValues("robothree.admin-api.test-read-shell-enabled=true")
                .withBean(AdminInventoryCatalog.class, AdminReadProjectionServiceTest::catalog)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(AdminReadProjectionService.class);
                    assertThat(context).doesNotHaveBean(AdminReadHttpController.class);
                });
    }

    @Test
    void testProfileInstallsTheShellOnlyWithAnExplicitCompleteInventory() {
        new ApplicationContextRunner()
                .withUserConfiguration(
                        AdminCapabilityProjectionConfiguration.class,
                        AdminReadHttpConfiguration.class,
                        AdminReadHttpController.class)
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("test"))
                .withPropertyValues("robothree.admin-api.test-read-shell-enabled=true")
                .withBean(AdminInventoryCatalog.class, AdminReadProjectionServiceTest::catalog)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(AdminReadProjectionService.class);
                    assertThat(context).hasSingleBean(AdminReadHttpController.class);
                });
    }

    @Test
    void explicitTestCompositionWiresOnlyTheExistingTrustedReadAuthorities() {
        new ApplicationContextRunner()
                .withUserConfiguration(
                        AdminCapabilityProjectionConfiguration.class,
                        AdminReadInventoryConfiguration.class,
                        AdminReadHttpConfiguration.class,
                        AdminReadHttpController.class)
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("test"))
                .withPropertyValues("robothree.admin-api.test-read-shell-enabled=true")
                .withBean(ConfigurationSnapshotRepository.class,
                        AdminCapabilityProjectionConfigurationTest::emptySnapshots)
                .withBean(ConfigurationIntegrityVerifier.class,
                        () -> new ConfigurationIntegrityVerifier(emptyPackages()))
                .withBean(ModelInvocationAuditOutboxRepository.class,
                        AdminCapabilityProjectionConfigurationTest::emptyAuditOutbox)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(AdminInventoryCatalog.class);
                    assertThat(context).hasSingleBean(AdminReadProjectionService.class);
                    assertThat(context).hasSingleBean(AdminReadHttpController.class);
                });
    }

    private static ConfigurationSnapshotRepository emptySnapshots() {
        return new ConfigurationSnapshotRepository() {
            @Override
            public ImmutableConfigurationSnapshot insert(ImmutableConfigurationSnapshot snapshot) {
                throw new UnsupportedOperationException();
            }

            @Override
            public Optional<ImmutableConfigurationSnapshot> findSnapshot(
                    String snapshotId, String revision) {
                return Optional.empty();
            }

            @Override
            public Optional<ImmutableConfigurationSnapshot> findActive() {
                return Optional.empty();
            }
        };
    }

    private static PackageDocumentRepository emptyPackages() {
        return new PackageDocumentRepository() {
            @Override
            public ImmutablePackageDocument insert(ImmutablePackageDocument document) {
                throw new UnsupportedOperationException();
            }

            @Override
            public Optional<ImmutablePackageDocument> findPackage(
                    String packageId, String revision) {
                return Optional.empty();
            }
        };
    }

    private static ModelInvocationAuditOutboxRepository emptyAuditOutbox() {
        return new ModelInvocationAuditOutboxRepository() {
            @Override
            public ModelInvocationAuditOutbox insert(ModelInvocationAuditOutbox outbox) {
                throw new UnsupportedOperationException();
            }

            @Override
            public List<ModelInvocationAuditOutbox> findPending(int limit) {
                return List.of();
            }
        };
    }

    @Test
    void productionRejectsAnyTestInventorySource() {
        new ApplicationContextRunner()
                .withUserConfiguration(AdminCapabilityProjectionConfiguration.class)
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("production"))
                .withBean(AdminModuleInventorySource.class, () -> new AdminModuleInventorySource() {
                    @Override
                    public com.robothree.central.admincontrol.domain.AdminModule module() {
                        return com.robothree.central.admincontrol.domain.AdminModule.MODELS;
                    }

                    @Override
                    public com.robothree.central.admincontrol.domain.AdminModuleInventoryLease capture(
                            java.time.Instant now) {
                        throw new UnsupportedOperationException();
                    }
                })
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .isInstanceOf(CentralProductionStartupException.class)
                            .extracting("code")
                            .isEqualTo(
                                    "central.admin_control_inventory_source_forbidden_in_production");
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
