package com.robothree.central.modelgateway.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ProviderReasoningProjection;
import com.robothree.central.shared.json.CanonicalJson;

/** Independently reproduces the Core private Strategy/Profile/Mapping digest chain. */
final class EnterpriseReasoningMappingDigests {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String STRATEGY_DOMAIN =
            "robothree.provider-reasoning-strategy.v1\n";
    private static final String PROFILE_DOMAIN = "robothree.reasoning-profile.v1";
    private static final String MAPPING_DOMAIN =
            "robothree.provider-reasoning-mapping.v1\n";

    private EnterpriseReasoningMappingDigests() {}

    static Chain calculate(EnterpriseReasoningMappingRelease release) {
        ObjectNode strategyMaterial = JSON.createObjectNode();
        strategyMaterial.put("authority", release.authority());
        strategyMaterial.put("providerFamily", release.providerFamily());
        strategyMaterial.set("exactSubject", exactSubject(release));
        strategyMaterial.put("profileId", release.profileId());
        strategyMaterial.put("strategyId", release.strategyId());
        strategyMaterial.put("strategyRevision", wireDigest(release.strategyRevision()));
        strategyMaterial.put("mappingKind", release.mappingKind());
        strategyMaterial.set("timeoutPolicyIdentity", timeoutIdentity(release));
        strategyMaterial.put(
                "requestProjectionRevision", wireDigest(release.requestProjectionRevision()));
        strategyMaterial.put("evidenceRevision", wireDigest(release.evidenceRevision()));
        strategyMaterial.set("typedPrivateDirective", directive(release.projection()));
        String strategyDigest = domainDigest(STRATEGY_DOMAIN, strategyMaterial);

        ObjectNode strategy = JSON.createObjectNode();
        strategy.put("strategyId", release.strategyId());
        strategy.put("strategyRevision", wireDigest(release.strategyRevision()));
        strategy.put("strategyDigest", wireDigest(strategyDigest));
        strategy.put("mappingKind", release.mappingKind());
        strategy.put("timeoutPolicyRef", release.timeoutPolicyRef());
        ObjectNode profileMaterial = JSON.createObjectNode();
        profileMaterial.put("schemaVersion", "v1alpha1");
        profileMaterial.put("profileId", release.profileId());
        profileMaterial.set("subject", exactSubject(release));
        profileMaterial.put("support", "supported");
        profileMaterial.set("maxStrategy", strategy);
        String profileDigest = domainDigest(PROFILE_DOMAIN, profileMaterial);

        ObjectNode profileRef = JSON.createObjectNode();
        profileRef.put("profileId", release.profileId());
        profileRef.put("profileRevision", wireDigest(profileDigest));
        profileRef.put("profileDigest", wireDigest(profileDigest));
        ObjectNode strategyRef = JSON.createObjectNode();
        strategyRef.put("strategyId", release.strategyId());
        strategyRef.put("strategyRevision", wireDigest(release.strategyRevision()));
        strategyRef.put("strategyDigest", wireDigest(strategyDigest));
        strategyRef.put("timeoutPolicyRef", release.timeoutPolicyRef());
        ObjectNode mappingMaterial = JSON.createObjectNode();
        mappingMaterial.put("mappingId", release.mappingId());
        mappingMaterial.put("authority", release.authority());
        mappingMaterial.put("providerFamily", release.providerFamily());
        mappingMaterial.set("exactSubject", exactSubject(release));
        mappingMaterial.set("profileRef", profileRef);
        mappingMaterial.set("strategyRef", strategyRef);
        mappingMaterial.put("mappingKind", release.mappingKind());
        mappingMaterial.set("timeoutPolicyIdentity", timeoutIdentity(release));
        mappingMaterial.put(
                "requestProjectionRevision", wireDigest(release.requestProjectionRevision()));
        mappingMaterial.put("evidenceRevision", wireDigest(release.evidenceRevision()));
        mappingMaterial.set("typedPrivateDirective", directive(release.projection()));
        String mappingDigest = domainDigest(MAPPING_DOMAIN, mappingMaterial);
        return new Chain(strategyDigest, profileDigest, mappingDigest);
    }

    private static ObjectNode exactSubject(EnterpriseReasoningMappingRelease release) {
        ObjectNode value = JSON.createObjectNode();
        value.put("modelCapabilityId", release.modelId());
        value.put("modelCapabilityRevision", wireDigest(release.modelRevision()));
        value.put("adapterDescriptorId", release.adapterDescriptorId());
        value.put(
                "adapterDescriptorRevision", wireDigest(release.adapterDescriptorRevision()));
        value.put("authority", release.authority());
        return value;
    }

    private static ObjectNode timeoutIdentity(EnterpriseReasoningMappingRelease release) {
        ObjectNode value = JSON.createObjectNode();
        value.put("timeoutPolicyRef", release.timeoutPolicyRef());
        value.put("timeoutPolicyRevision", release.timeoutPolicyRevision());
        value.put("timeoutPolicyDigest", wireDigest(release.timeoutPolicyDigest()));
        return value;
    }

    private static ObjectNode directive(ProviderReasoningProjection projection) {
        ObjectNode value = JSON.createObjectNode();
        if (projection instanceof ProviderReasoningProjection.OpenAiEffort openAi) {
            value.put("kind", "openai_reasoning_effort");
            value.put("effort", openAi.effort() == ProviderReasoningProjection.Effort.HIGH
                    ? "high" : "xhigh");
            return value;
        }
        if (projection instanceof ProviderReasoningProjection.AnthropicThinkingBudget anthropic) {
            value.put("kind", "anthropic_thinking_budget");
            value.put("budgetTokens", anthropic.budgetTokens());
            return value;
        }
        throw new IllegalArgumentException("a Max release must carry one private directive");
    }

    private static String domainDigest(String domain, ObjectNode material) {
        ObjectNode wrapped = JSON.createObjectNode();
        wrapped.put("domain", domain);
        wrapped.set("material", material);
        return CanonicalJson.sha256(CanonicalJson.canonicalize(wrapped));
    }

    private static String wireDigest(String value) {
        return "sha256:" + value;
    }

    static String providerFamily(Protocol protocol) {
        return protocol == Protocol.OPENAI_COMPATIBLE
                ? "enterprise_openai" : "enterprise_anthropic";
    }

    record Chain(String strategyDigest, String profileDigest, String mappingDigest) {}
}
