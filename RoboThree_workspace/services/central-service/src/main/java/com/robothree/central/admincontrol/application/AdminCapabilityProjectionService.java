package com.robothree.central.admincontrol.application;

import com.robothree.central.admincontrol.domain.AdminCapabilityProjection;
import com.robothree.central.admincontrol.domain.AdminPrincipalSummary;
import java.util.Objects;

public final class AdminCapabilityProjectionService {

    private final AdminPrincipalProvider principalProvider;

    public AdminCapabilityProjectionService(AdminPrincipalProvider principalProvider) {
        this.principalProvider =
                Objects.requireNonNull(principalProvider, "principalProvider");
    }

    public AdminCapabilityProjection currentProjection() {
        AdminPrincipalSummary principal = principalProvider.currentPrincipal();
        return new AdminCapabilityProjection(
                AdminCapabilityProjection.CONTRACT_VERSION,
                principal,
                principal.identityFlags().testIdentityUsed(),
                principal.identityFlags().productionIdentityReady(),
                ProvisionalAdminCapabilities.REVISION,
                ProvisionalAdminCapabilities.testOnlyCapabilities());
    }
}
