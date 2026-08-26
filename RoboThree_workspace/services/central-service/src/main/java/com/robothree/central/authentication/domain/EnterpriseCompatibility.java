package com.robothree.central.authentication.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.immutableNonEmptyList;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.util.List;

public record EnterpriseCompatibility(
        String contractVersion,
        String centralVersion,
        List<String> supportedContractVersions,
        String minimumDesktopVersion,
        String minimumCoreVersion,
        List<String> features,
        String maintenanceStatus,
        List<String> configurationSchemaVersions,
        long revision) {

    public EnterpriseCompatibility {
        if (!"v1alpha1".equals(contractVersion)) {
            throw new IllegalArgumentException("unsupported compatibility Contract version");
        }
        text(centralVersion, "centralVersion");
        supportedContractVersions =
                immutableNonEmptyList(supportedContractVersions, "supportedContractVersions");
        text(minimumDesktopVersion, "minimumDesktopVersion");
        text(minimumCoreVersion, "minimumCoreVersion");
        features = List.copyOf(features);
        text(maintenanceStatus, "maintenanceStatus");
        configurationSchemaVersions =
                immutableNonEmptyList(configurationSchemaVersions, "configurationSchemaVersions");
        if (revision < 0) {
            throw new IllegalArgumentException("compatibility revision must not be negative");
        }
    }
}
