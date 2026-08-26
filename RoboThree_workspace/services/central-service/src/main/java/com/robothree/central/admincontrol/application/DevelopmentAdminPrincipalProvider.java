package com.robothree.central.admincontrol.application;

import com.robothree.central.admincontrol.domain.AdminCapabilitySource;
import com.robothree.central.admincontrol.domain.AdminIdentityFlags;
import com.robothree.central.admincontrol.domain.AdminPrincipalSummary;

public final class DevelopmentAdminPrincipalProvider implements AdminPrincipalProvider {

    public static final String TEST_PRINCIPAL_ID =
            "admintest_aapi02_fixed_sentinel";
    public static final String TEST_DISPLAY_NAME = "Test Admin";

    @Override
    public AdminPrincipalSummary currentPrincipal() {
        return new AdminPrincipalSummary(
                TEST_PRINCIPAL_ID,
                TEST_DISPLAY_NAME,
                AdminCapabilitySource.TEST_ONLY,
                AdminIdentityFlags.testOnly());
    }
}
