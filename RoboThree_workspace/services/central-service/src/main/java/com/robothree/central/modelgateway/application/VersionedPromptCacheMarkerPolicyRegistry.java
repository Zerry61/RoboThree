package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.domain.PromptCacheMarkerPolicy;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.modelgateway.domain.ProviderCacheProjection.MarkerTarget;
import com.robothree.central.modelgateway.domain.ProviderCacheProjection.RetentionPolicy;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Frozen reviewed marker-policy registry; it has no runtime mutation surface. */
public final class VersionedPromptCacheMarkerPolicyRegistry {

    private static final String ANTHROPIC_EVIDENCE_REVISION =
            com.robothree.central.shared.json.CanonicalJson.sha256(
                    "anthropic.prompt-caching.reviewed-wire-semantics.v1");
    private static final String OPENAI_EVIDENCE_REVISION =
            com.robothree.central.shared.json.CanonicalJson.sha256(
                    "openai.prompt-caching.reviewed-wire-semantics.v1");

    public static final String ANTHROPIC_SYSTEM_POLICY_ID =
            "anthropic_ephemeral_default_system_last_static_v1";
    public static final String ANTHROPIC_TOOL_POLICY_ID =
            "anthropic_ephemeral_default_tool_last_static_v1";
    public static final String OPENAI_KEY_POLICY_ID =
            "openai_prompt_cache_key_v1";
    public static final String OPENAI_AUTOMATIC_POLICY_ID =
            "openai_automatic_observed_v1";
    private final Map<String, PromptCacheMarkerPolicy> byRevision;

    public VersionedPromptCacheMarkerPolicyRegistry(
            List<PromptCacheMarkerPolicy> policies) {
        Map<String, PromptCacheMarkerPolicy> indexed = new HashMap<>();
        for (PromptCacheMarkerPolicy policy : List.copyOf(policies)) {
            if (indexed.putIfAbsent(policy.policyRevision(), policy) != null) {
                throw new IllegalArgumentException("duplicate marker policy revision");
            }
        }
        this.byRevision = Map.copyOf(indexed);
    }

    public static VersionedPromptCacheMarkerPolicyRegistry defaults() {
        return new VersionedPromptCacheMarkerPolicyRegistry(defaultPolicies());
    }

    public static List<PromptCacheMarkerPolicy> defaultPolicies() {
        return List.of(
                PromptCacheMarkerPolicy.create(
                        ANTHROPIC_SYSTEM_POLICY_ID,
                        PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                        MarkerTarget.SYSTEM_LAST_STATIC,
                        RetentionPolicy.PROVIDER_DEFAULT_EPHEMERAL,
                        ANTHROPIC_EVIDENCE_REVISION,
                        List.of("cache_control.type")),
                PromptCacheMarkerPolicy.create(
                        ANTHROPIC_TOOL_POLICY_ID,
                        PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                        MarkerTarget.TOOL_LAST_STATIC,
                        RetentionPolicy.PROVIDER_DEFAULT_EPHEMERAL,
                        ANTHROPIC_EVIDENCE_REVISION,
                        List.of("cache_control.type")),
                PromptCacheMarkerPolicy.create(
                        OPENAI_KEY_POLICY_ID,
                        PromptCacheProfile.ProjectionMode.OPENAI_PROMPT_CACHE_KEY,
                        MarkerTarget.NONE,
                        RetentionPolicy.PROVIDER_CONTROLLED,
                        OPENAI_EVIDENCE_REVISION,
                        List.of("prompt_cache_key")),
                PromptCacheMarkerPolicy.create(
                        OPENAI_AUTOMATIC_POLICY_ID,
                        PromptCacheProfile.ProjectionMode.OPENAI_PROVIDER_AUTOMATIC_OBSERVED,
                        MarkerTarget.NONE,
                        RetentionPolicy.PROVIDER_CONTROLLED,
                        OPENAI_EVIDENCE_REVISION,
                        List.of()));
    }

    public PromptCacheMarkerPolicy resolve(String revision) {
        PromptCacheMarkerPolicy policy = byRevision.get(revision);
        if (policy == null) {
            throw ModelGatewayException.unavailable(
                    "model_gateway.cache_marker_policy_missing",
                    "The exact prompt cache marker policy is unavailable.");
        }
        return policy;
    }
}
