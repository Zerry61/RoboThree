package com.robothree.central.admincontrol.domain;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;

public record AdminCapabilityProjection(
        String contractVersion,
        AdminPrincipalSummary principal,
        boolean testIdentityUsed,
        boolean productionIdentityReady,
        String capabilitySetRevision,
        List<AdminCapability> capabilities) {

    public static final String CONTRACT_VERSION = "admin-control.v1alpha1";

    public AdminCapabilityProjection {
        contractVersion = requireExactContractVersion(contractVersion);
        principal = Objects.requireNonNull(principal, "principal");
        capabilitySetRevision = requireNonBlank(
                capabilitySetRevision,
                "capabilitySetRevision");
        capabilities = List.copyOf(Objects.requireNonNull(
                capabilities,
                "capabilities"));
        if (testIdentityUsed && productionIdentityReady) {
            throw new IllegalArgumentException(
                    "admin.identity_flags_test_cannot_claim_production_ready");
        }
        if (principal.identityFlags().testIdentityUsed() != testIdentityUsed
                || principal.identityFlags().productionIdentityReady()
                        != productionIdentityReady) {
            throw new IllegalArgumentException(
                    "admin.identity_flags_projection_mismatch");
        }
        if (capabilities.isEmpty()) {
            throw new IllegalArgumentException("admin.capabilities_required");
        }
        List<String> keys = capabilities.stream()
                .map(AdminCapability::key)
                .toList();
        List<String> sorted = keys.stream().sorted().toList();
        if (!keys.equals(sorted) || keys.stream().distinct().count() != keys.size()) {
            throw new IllegalArgumentException(
                    "admin.capability_keys_must_be_unique_and_sorted");
        }
        for (AdminCapability capability : capabilities) {
            if (capability.source() != principal.source()) {
                throw new IllegalArgumentException(
                        "admin.capability_source_projection_mismatch");
            }
            if (capability.source() == AdminCapabilitySource.TEST_ONLY
                    && (!testIdentityUsed || productionIdentityReady)) {
                throw new IllegalArgumentException(
                        "admin.test_capability_flags_invalid");
            }
        }
    }

    public boolean isSortedByCapabilityKey() {
        return capabilities.stream()
                .map(AdminCapability::key)
                .toList()
                .equals(capabilities.stream()
                        .map(AdminCapability::key)
                        .sorted(Comparator.naturalOrder())
                        .toList());
    }

    private static String requireExactContractVersion(String value) {
        if (!CONTRACT_VERSION.equals(value)) {
            throw new IllegalArgumentException(
                    "admin.contract_version_unsupported");
        }
        return value;
    }

    private static String requireNonBlank(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }
}
