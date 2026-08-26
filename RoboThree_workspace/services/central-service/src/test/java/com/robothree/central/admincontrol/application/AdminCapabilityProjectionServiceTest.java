package com.robothree.central.admincontrol.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.admincontrol.domain.AdminCapability;
import com.robothree.central.admincontrol.domain.AdminCapabilityProjection;
import com.robothree.central.admincontrol.domain.AdminCapabilitySource;
import com.robothree.central.admincontrol.domain.AdminCapabilityState;
import com.robothree.central.admincontrol.domain.AdminIdentityFlags;
import java.util.List;
import org.junit.jupiter.api.Test;

class AdminCapabilityProjectionServiceTest {

    @Test
    void projectsFixedTestOnlyPrincipalAndCapabilityFacts() {
        var service = new AdminCapabilityProjectionService(
                new DevelopmentAdminPrincipalProvider());

        AdminCapabilityProjection projection = service.currentProjection();

        assertThat(projection.contractVersion())
                .isEqualTo(AdminCapabilityProjection.CONTRACT_VERSION);
        assertThat(projection.principal().principalId())
                .isEqualTo("admintest_aapi02_fixed_sentinel");
        assertThat(projection.principal().displayName()).isEqualTo("Test Admin");
        assertThat(projection.principal().source())
                .isEqualTo(AdminCapabilitySource.TEST_ONLY);
        assertThat(projection.testIdentityUsed()).isTrue();
        assertThat(projection.productionIdentityReady()).isFalse();
        assertThat(projection.capabilitySetRevision())
                .isEqualTo(ProvisionalAdminCapabilities.REVISION);
        assertThat(projection.isSortedByCapabilityKey()).isTrue();
        assertThat(projection.capabilities())
                .extracting(AdminCapability::key)
                .containsExactly(
                        "admin.knowledge.read",
                        "admin.knowledge.write",
                        "admin.model.read",
                        "admin.model.write",
                        "admin.robot.read",
                        "admin.robot.write",
                        "admin.skill.read",
                        "admin.skill.write",
                        "admin.system.audit.export",
                        "admin.system.audit.read",
                        "admin.system.feedback.read",
                        "admin.system.feedback.write",
                        "admin.system.users.read",
                        "admin.system.users.write",
                        "admin.tool.read",
                        "admin.tool.write");
        assertThat(projection.capabilities())
                .allSatisfy(capability -> assertThat(capability.source())
                        .isEqualTo(AdminCapabilitySource.TEST_ONLY));
        assertThat(projection.capabilities())
                .filteredOn(capability -> capability.key().endsWith(".read"))
                .extracting(AdminCapability::state)
                .containsOnly(AdminCapabilityState.READY);
        assertThat(projection.capabilities())
                .filteredOn(capability -> !capability.key().endsWith(".read"))
                .extracting(AdminCapability::state)
                .containsOnly(AdminCapabilityState.GATED);
    }

    @Test
    void rejectsTestIdentityClaimingProductionReadiness() {
        assertThatThrownBy(() -> new AdminIdentityFlags(true, true))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(
                        "admin.identity_flags_test_cannot_claim_production_ready");
    }

    @Test
    void rejectsProjectionWhenPrincipalFlagsAndEnvelopeFlagsDrift() {
        var principal = new DevelopmentAdminPrincipalProvider().currentPrincipal();

        assertThatThrownBy(() -> new AdminCapabilityProjection(
                        AdminCapabilityProjection.CONTRACT_VERSION,
                        principal,
                        false,
                        false,
                        ProvisionalAdminCapabilities.REVISION,
                        ProvisionalAdminCapabilities.testOnlyCapabilities()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("admin.identity_flags_projection_mismatch");
    }

    @Test
    void rejectsUnsortedOrDuplicateCapabilityKeys() {
        var principal = new DevelopmentAdminPrincipalProvider().currentPrincipal();
        List<AdminCapability> capabilities = List.of(
                ProvisionalAdminCapabilities.testOnlyCapabilities().get(1),
                ProvisionalAdminCapabilities.testOnlyCapabilities().get(0));

        assertThatThrownBy(() -> new AdminCapabilityProjection(
                        AdminCapabilityProjection.CONTRACT_VERSION,
                        principal,
                        true,
                        false,
                        ProvisionalAdminCapabilities.REVISION,
                        capabilities))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(
                        "admin.capability_keys_must_be_unique_and_sorted");
    }

    @Test
    void projectionTextDoesNotCarrySensitiveMaterials() {
        String rendered = new AdminCapabilityProjectionService(
                        new DevelopmentAdminPrincipalProvider())
                .currentProjection()
                .toString();

        assertThat(rendered).doesNotContain(
                "apiKey",
                "Bearer",
                "credentialRef",
                "endpoint",
                "stack",
                "policyExpression",
                "entitlement",
                "LocalStorage",
                "SessionStorage",
                "Cookie");
    }
}
