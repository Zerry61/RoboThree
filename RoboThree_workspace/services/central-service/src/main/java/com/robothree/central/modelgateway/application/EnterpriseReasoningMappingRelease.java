package com.robothree.central.modelgateway.application;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ProviderReasoningProjection;

/** Immutable, release-pinned private mapping material. Raw directive stays Central-private. */
public record EnterpriseReasoningMappingRelease(
        String mappingId,
        String authority,
        String providerFamily,
        String mappingKind,
        Protocol protocol,
        String modelId,
        String modelRevision,
        String adapterDescriptorId,
        String adapterDescriptorRevision,
        String profileId,
        String profileRevision,
        String profileDigest,
        String strategyId,
        String strategyRevision,
        String strategyDigest,
        String mappingRevision,
        String mappingDigest,
        String timeoutPolicyRef,
        String timeoutPolicyRevision,
        String timeoutPolicyDigest,
        String requestProjectionRevision,
        String evidenceRevision,
        ProviderReasoningProjection projection,
        boolean testOnly) {

    public EnterpriseReasoningMappingRelease {
        mappingId = text(mappingId, "mappingId");
        authority = text(authority, "authority");
        providerFamily = text(providerFamily, "providerFamily");
        mappingKind = text(mappingKind, "mappingKind");
        if (protocol == null) throw new NullPointerException("protocol");
        modelId = text(modelId, "modelId");
        modelRevision = digest(modelRevision, "modelRevision");
        adapterDescriptorId = text(adapterDescriptorId, "adapterDescriptorId");
        adapterDescriptorRevision = digest(adapterDescriptorRevision, "adapterDescriptorRevision");
        profileId = text(profileId, "profileId");
        profileRevision = digest(profileRevision, "profileRevision");
        profileDigest = digest(profileDigest, "profileDigest");
        strategyId = text(strategyId, "strategyId");
        strategyRevision = digest(strategyRevision, "strategyRevision");
        strategyDigest = digest(strategyDigest, "strategyDigest");
        mappingRevision = digest(mappingRevision, "mappingRevision");
        mappingDigest = digest(mappingDigest, "mappingDigest");
        timeoutPolicyRef = text(timeoutPolicyRef, "timeoutPolicyRef");
        timeoutPolicyRevision = text(timeoutPolicyRevision, "timeoutPolicyRevision");
        timeoutPolicyDigest = digest(timeoutPolicyDigest, "timeoutPolicyDigest");
        requestProjectionRevision = digest(
                requestProjectionRevision, "requestProjectionRevision");
        evidenceRevision = digest(evidenceRevision, "evidenceRevision");
        if (projection == null) throw new NullPointerException("projection");
        if (!profileRevision.equals(profileDigest)
                || !mappingRevision.equals(mappingDigest)) {
            throw new IllegalArgumentException("private mapping identity is inconsistent");
        }
        ProviderReasoningProjection.requireProtocol(projection, protocol);
        if (!authority.equals("central_enterprise")
                || !providerFamily.equals(
                        EnterpriseReasoningMappingDigests.providerFamily(protocol))
                || (projection instanceof ProviderReasoningProjection.OpenAiEffort
                        && !mappingKind.equals("effort_level"))
                || (projection instanceof ProviderReasoningProjection.AnthropicThinkingBudget
                        && !mappingKind.equals("bounded_budget_preset"))) {
            throw new IllegalArgumentException("private mapping family is inconsistent");
        }
    }

    @Override
    public String toString() {
        return "EnterpriseReasoningMappingRelease[protocol=" + protocol
                + ",mappingRevision=" + mappingRevision + ",private=REDACTED]";
    }
}
