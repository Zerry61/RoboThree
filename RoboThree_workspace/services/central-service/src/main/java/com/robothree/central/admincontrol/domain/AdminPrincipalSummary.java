package com.robothree.central.admincontrol.domain;

import java.util.Objects;
import java.util.regex.Pattern;

public record AdminPrincipalSummary(
        String principalId,
        String displayName,
        AdminCapabilitySource source,
        AdminIdentityFlags identityFlags) {

    private static final Pattern SAFE_TEST_PRINCIPAL_ID =
            Pattern.compile("admintest_[a-z0-9_]{8,64}");

    public AdminPrincipalSummary {
        principalId = requireNonBlank(principalId, "principalId");
        displayName = requireNonBlank(displayName, "displayName");
        source = Objects.requireNonNull(source, "source");
        identityFlags = Objects.requireNonNull(identityFlags, "identityFlags");
        if (source == AdminCapabilitySource.TEST_ONLY) {
            if (!identityFlags.testIdentityUsed()
                    || identityFlags.productionIdentityReady()) {
                throw new IllegalArgumentException(
                        "admin.test_principal_flags_invalid");
            }
            if (!SAFE_TEST_PRINCIPAL_ID.matcher(principalId).matches()) {
                throw new IllegalArgumentException(
                        "admin.test_principal_id_must_be_sentinel");
            }
        }
    }

    private static String requireNonBlank(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }
}
