package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ProviderReasoningProjection;
import com.robothree.central.modelgateway.port.EnterpriseReasoningMappingSource;
import java.util.Objects;

/** Independent Central validation before invocation acceptance or upstream work. */
public final class EnterpriseReasoningSecondValidator {
    private final EnterpriseReasoningMappingSource mappings;

    public EnterpriseReasoningSecondValidator(EnterpriseReasoningMappingSource mappings) {
        this.mappings = Objects.requireNonNull(mappings, "mappings");
    }

    public ProviderReasoningProjection validate(
            EnterpriseReasoningSafeIdentity safe,
            ModelEndpointBinding binding) {
        Objects.requireNonNull(safe, "safe");
        Objects.requireNonNull(binding, "binding");
        if (safe instanceof EnterpriseReasoningSafeIdentity.DefaultPassthrough) {
            return ProviderReasoningProjection.Omit.instance();
        }
        var max = (EnterpriseReasoningSafeIdentity.LockedMaxStrategy) safe;
        var matches = mappings.loadExact(max.mappingRevision(), max.mappingDigest());
        if (matches.isEmpty()) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.reasoning_mapping_unavailable",
                    "The locked reasoning mapping is unavailable.");
        }
        if (matches.size() != 1) {
            throw ModelGatewayException.conflict(
                    "model_gateway.reasoning_mapping_conflict",
                    "The locked reasoning mapping is ambiguous.");
        }
        var release = matches.getFirst();
        var recalculated = EnterpriseReasoningMappingDigests.calculate(release);
        if (release.protocol() != binding.protocol()
                || !release.modelId().equals(binding.modelId())
                || !release.modelRevision().equals(binding.modelRevision())
                || !release.profileId().equals(max.profileId())
                || !release.profileRevision().equals(max.profileRevision())
                || !release.profileDigest().equals(max.profileDigest())
                || !release.strategyId().equals(max.strategyId())
                || !release.strategyRevision().equals(max.strategyRevision())
                || !release.strategyDigest().equals(max.strategyDigest())
                || !release.mappingRevision().equals(max.mappingRevision())
                || !release.mappingDigest().equals(max.mappingDigest())
                || !release.timeoutPolicyRef().equals(max.timeoutPolicyRef())
                || !release.strategyDigest().equals(recalculated.strategyDigest())
                || !release.profileDigest().equals(recalculated.profileDigest())
                || !release.mappingDigest().equals(recalculated.mappingDigest())
                || !release.profileRevision().equals(binding.capabilityProfileRevision())
                || !release.timeoutPolicyDigest().equals(binding.timeoutProfileRevision())) {
            throw ModelGatewayException.conflict(
                    "model_gateway.reasoning_mapping_conflict",
                    "The locked reasoning mapping does not match the endpoint binding.");
        }
        return release.projection();
    }
}
