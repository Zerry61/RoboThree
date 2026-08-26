package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.EnterpriseCompatibility;
import com.robothree.central.authentication.port.CompatibilityEvaluator;
import java.util.Objects;
import java.util.Set;

/**
 * Alpha compatibility is a frozen startup fact. Compatible client instances
 * are supplied by trusted bootstrap configuration, never by an HTTP request.
 */
public final class FrozenCompatibilityEvaluator implements CompatibilityEvaluator {

    private final EnterpriseCompatibility compatibility;
    private final Set<String> compatibleClientInstances;

    public FrozenCompatibilityEvaluator(
            EnterpriseCompatibility compatibility,
            Set<String> compatibleClientInstances) {
        this.compatibility = Objects.requireNonNull(compatibility, "compatibility");
        this.compatibleClientInstances = Set.copyOf(compatibleClientInstances);
    }

    @Override
    public CompatibilityDecision requireCompatible(String clientInstanceId) {
        if (!"available".equals(compatibility.maintenanceStatus())
                || !compatibility.supportedContractVersions().contains("v1alpha1")
                || !compatibility.configurationSchemaVersions().contains("v1alpha1")
                || !compatibleClientInstances.contains(clientInstanceId)) {
            throw EnterpriseAuthenticationException.authorization(
                    "compatibility_mismatch",
                    "The client is not compatible with this enterprise gateway.");
        }
        return new CompatibilityDecision(compatibility.revision());
    }

    @Override
    public EnterpriseCompatibility current() {
        return compatibility;
    }
}
