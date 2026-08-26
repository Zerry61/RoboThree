package com.robothree.central.admincontrol.domain;

public record AdminIdentityFlags(
        boolean testIdentityUsed,
        boolean productionIdentityReady) {

    public AdminIdentityFlags {
        if (testIdentityUsed && productionIdentityReady) {
            throw new IllegalArgumentException(
                    "admin.identity_flags_test_cannot_claim_production_ready");
        }
    }

    public static AdminIdentityFlags testOnly() {
        return new AdminIdentityFlags(true, false);
    }
}
