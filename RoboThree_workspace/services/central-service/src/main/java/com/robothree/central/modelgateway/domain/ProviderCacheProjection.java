package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.json.CanonicalJson;
import java.util.Objects;

/** Typed, provider-neutral permission to project cache metadata onto one wire request. */
public sealed interface ProviderCacheProjection
        permits ProviderCacheProjection.Disabled,
                ProviderCacheProjection.AnthropicExplicit,
                ProviderCacheProjection.OpenAiAutomaticObserved,
                ProviderCacheProjection.OpenAiPromptCacheKey {

    ObjectMapper JSON = new ObjectMapper();

    String mode();

    String projectionDigest();

    record Disabled(String reason, String projectionDigest)
            implements ProviderCacheProjection {
        public Disabled {
            reason = text(reason, "reason");
            projectionDigest = digest(projectionDigest, "projectionDigest");
            requireDigest(projectionDigest, document("disabled").put("reason", reason));
        }

        public static Disabled of(String reason) {
            ObjectNode value = document("disabled").put("reason", reason);
            return new Disabled(reason, computeDigest(value));
        }

        @Override
        public String mode() {
            return "disabled";
        }
    }

    record AnthropicExplicit(
            String markerPolicyId,
            String markerPolicyRevision,
            MarkerTarget markerTarget,
            RetentionPolicy retentionPolicy,
            String projectionDigest)
            implements ProviderCacheProjection {
        public AnthropicExplicit {
            markerPolicyId = text(markerPolicyId, "markerPolicyId");
            markerPolicyRevision = digest(markerPolicyRevision, "markerPolicyRevision");
            Objects.requireNonNull(markerTarget, "markerTarget");
            Objects.requireNonNull(retentionPolicy, "retentionPolicy");
            projectionDigest = digest(projectionDigest, "projectionDigest");
            requireDigest(projectionDigest, anthropicDocument(
                    markerPolicyId,
                    markerPolicyRevision,
                    markerTarget,
                    retentionPolicy));
        }

        public static AnthropicExplicit of(PromptCacheMarkerPolicy policy) {
            if (policy.projectionMode()
                    != PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT
                    || policy.markerTarget() == MarkerTarget.NONE
                    || policy.retentionPolicy()
                            != RetentionPolicy.PROVIDER_DEFAULT_EPHEMERAL) {
                throw new IllegalArgumentException(
                        "marker policy is not an Anthropic explicit policy");
            }
            ObjectNode value = anthropicDocument(
                    policy.policyId(),
                    policy.policyRevision(),
                    policy.markerTarget(),
                    policy.retentionPolicy());
            return new AnthropicExplicit(
                    policy.policyId(),
                    policy.policyRevision(),
                    policy.markerTarget(),
                    policy.retentionPolicy(),
                    computeDigest(value));
        }

        @Override
        public String mode() {
            return "anthropic_explicit";
        }
    }

    record OpenAiAutomaticObserved(String projectionDigest)
            implements ProviderCacheProjection {
        public OpenAiAutomaticObserved {
            projectionDigest = digest(projectionDigest, "projectionDigest");
            requireDigest(projectionDigest, document("openai_provider_automatic_observed"));
        }

        public static OpenAiAutomaticObserved create() {
            return new OpenAiAutomaticObserved(
                    computeDigest(document("openai_provider_automatic_observed")));
        }

        @Override
        public String mode() {
            return "openai_provider_automatic_observed";
        }
    }

    record OpenAiPromptCacheKey(
            String opaqueKey,
            int maximumBytes,
            String markerPolicyRevision,
            String projectionDigest)
            implements ProviderCacheProjection {
        public OpenAiPromptCacheKey {
            opaqueKey = digest(opaqueKey, "opaqueKey");
            if (maximumBytes < 32 || maximumBytes > 4096) {
                throw new IllegalArgumentException("maximumBytes is outside its limit");
            }
            markerPolicyRevision = digest(markerPolicyRevision, "markerPolicyRevision");
            projectionDigest = digest(projectionDigest, "projectionDigest");
            requireDigest(projectionDigest, openAiKeyDocument(
                    opaqueKey,
                    maximumBytes,
                    markerPolicyRevision));
        }

        public static OpenAiPromptCacheKey of(
                String opaqueKey,
                int maximumBytes,
                String markerPolicyRevision) {
            ObjectNode value = openAiKeyDocument(
                    opaqueKey,
                    maximumBytes,
                    markerPolicyRevision);
            return new OpenAiPromptCacheKey(
                    opaqueKey,
                    maximumBytes,
                    markerPolicyRevision,
                    computeDigest(value));
        }

        @Override
        public String mode() {
            return "openai_prompt_cache_key";
        }
    }

    enum MarkerTarget {
        NONE,
        SYSTEM_LAST_STATIC,
        TOOL_LAST_STATIC
    }

    enum RetentionPolicy {
        NONE,
        PROVIDER_DEFAULT_EPHEMERAL,
        PROVIDER_CONTROLLED
    }

    private static ObjectNode document(String mode) {
        return JSON.createObjectNode()
                .put("projectionSchemaVersion", "v1")
                .put("mode", mode);
    }

    private static ObjectNode anthropicDocument(
            String policyId,
            String policyRevision,
            MarkerTarget target,
            RetentionPolicy retention) {
        return document("anthropic_explicit")
                .put("markerPolicyId", policyId)
                .put("markerPolicyRevision", policyRevision)
                .put("markerTarget", target.name().toLowerCase())
                .put("retentionPolicy", retention.name().toLowerCase());
    }

    private static ObjectNode openAiKeyDocument(
            String key,
            int maximumBytes,
            String markerPolicyRevision) {
        return document("openai_prompt_cache_key")
                .put("markerPolicyRevision", markerPolicyRevision)
                .put("maximumBytes", maximumBytes)
                .put("opaqueKey", key);
    }

    private static String computeDigest(ObjectNode value) {
        return CanonicalJson.sha256(CanonicalJson.canonicalize(value));
    }

    private static void requireDigest(String actual, ObjectNode value) {
        if (!computeDigest(value).equals(actual)) {
            throw new IllegalArgumentException(
                    "projectionDigest does not match projection facts");
        }
    }
}
