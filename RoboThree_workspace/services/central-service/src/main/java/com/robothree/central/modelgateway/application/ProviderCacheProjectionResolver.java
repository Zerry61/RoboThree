package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.domain.ModelInvocationExecution;
import com.robothree.central.modelgateway.domain.PromptCacheMarkerPolicy;
import com.robothree.central.modelgateway.domain.PromptCachePlan;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.modelgateway.domain.ProviderCacheProjection;
import com.robothree.central.modelgateway.port.ModelProviderCacheProjectionResolver;
import com.robothree.central.modelgateway.port.ModelProviderRequestSource;
import com.robothree.central.modelgateway.port.PromptCachePlanRepository;
import com.robothree.central.modelgateway.port.PromptCacheProfileResolver;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

/** Application-layer exact Plan/Profile/Binding/static-prefix projection gate. */
public final class ProviderCacheProjectionResolver
        implements ModelProviderCacheProjectionResolver {

    private final PromptCachePlanRepository plans;
    private final PromptCacheProfileResolver profiles;
    private final VersionedPromptCacheMarkerPolicyRegistry markerPolicies;
    private final PromptCacheCompatibilityClassifier compatibility;
    private final StaticPromptPrefixProjector staticPrefix;

    public ProviderCacheProjectionResolver(
            PromptCachePlanRepository plans,
            PromptCacheProfileResolver profiles,
            VersionedPromptCacheMarkerPolicyRegistry markerPolicies,
            PromptCacheCompatibilityClassifier compatibility,
            StaticPromptPrefixProjector staticPrefix) {
        this.plans = Objects.requireNonNull(plans, "plans");
        this.profiles = Objects.requireNonNull(profiles, "profiles");
        this.markerPolicies = Objects.requireNonNull(markerPolicies, "markerPolicies");
        this.compatibility = Objects.requireNonNull(compatibility, "compatibility");
        this.staticPrefix = Objects.requireNonNull(staticPrefix, "staticPrefix");
    }

    @Override
    public ProviderCacheProjection resolve(
            ModelInvocationExecution.Request request,
            ModelProviderRequestSource.ResolvedRequest providerRequest) {
        Objects.requireNonNull(request, "request");
        Objects.requireNonNull(providerRequest, "providerRequest");
        ModelInvocationExecution.PromptCacheExecutionContext context =
                request.promptCacheExecutionContext();
        if (context == null) {
            return ProviderCacheProjection.Disabled.of("cache_not_planned");
        }
        PromptCachePlan plan = plans.findPlanByInvocationId(request.invocationId())
                .orElseThrow(() -> ModelGatewayException.unavailable(
                        "model_gateway.cache_plan_missing",
                        "The immutable prompt cache plan is unavailable."));
        if (!ModelInvocationExecution.PromptCacheExecutionContext.from(plan)
                .equals(context)) {
            throw ModelGatewayException.conflict(
                    "model_gateway.cache_plan_execution_drift",
                    "The prompt cache execution evidence conflicts with the immutable plan.");
        }
        if (!plan.bindingRevision().equals(request.binding().bindingRevision())
                || !plan.bindingDigest().equals(request.binding().bindingDigest())) {
            throw ModelGatewayException.conflict(
                    "model_gateway.cache_binding_drift",
                    "The prompt cache plan does not match the locked binding.");
        }
        PromptCacheProfile profile = profiles.resolveForRecovery(
                plan.profileId(),
                plan.profileRevision(),
                plan.profileDigest());
        if (!profile.supports(request.binding())) {
            throw ModelGatewayException.validation(
                    "model_gateway.cache_profile_binding_mismatch",
                    "The prompt cache profile does not match the exact binding.");
        }
        var classified = compatibility.classify(
                providerRequest.canonicalRequestJson(),
                profile);
        if (!classified.compatibilityFingerprintDigest()
                .equals(plan.compatibilityFingerprintDigest())) {
            throw ModelGatewayException.conflict(
                    "model_gateway.cache_compatibility_drift",
                    "The provider request compatibility fingerprint drifted.");
        }
        var projected = staticPrefix.project(providerRequest.canonicalRequestJson());
        if (!projected.staticSourceLockDigest().equals(plan.staticSourceLockDigest())) {
            throw ModelGatewayException.conflict(
                    "model_gateway.cache_static_source_drift",
                    "The provider request static source lock drifted.");
        }
        if (!projected.staticPrefixDigest().equals(plan.staticPrefixDigest())) {
            throw ModelGatewayException.conflict(
                    "model_gateway.cache_static_prefix_drift",
                    "The provider request static prefix drifted.");
        }

        PromptCacheMarkerPolicy markerPolicy =
                markerPolicies.resolve(profile.markerPolicyRevision());
        if (markerPolicy.projectionMode() != profile.providerProjectionMode()) {
            throw ModelGatewayException.validation(
                    "model_gateway.cache_marker_policy_mismatch",
                    "The marker policy does not match the exact cache profile.");
        }
        if (!plan.eligible()) {
            if (plan.skipReason()
                            == PromptCachePlan.SkipReason.PROVIDER_AUTOMATIC_OBSERVED
                    && profile.providerProjectionMode()
                            == PromptCacheProfile.ProjectionMode
                                    .OPENAI_PROVIDER_AUTOMATIC_OBSERVED) {
                return ProviderCacheProjection.OpenAiAutomaticObserved.create();
            }
            return ProviderCacheProjection.Disabled.of(
                    plan.skipReason().contractValue());
        }
        return switch (profile.providerProjectionMode()) {
            case ANTHROPIC_EXPLICIT ->
                    ProviderCacheProjection.AnthropicExplicit.of(markerPolicy);
            case OPENAI_PROMPT_CACHE_KEY -> openAiKey(plan, profile, markerPolicy);
            case OPENAI_PROVIDER_AUTOMATIC_OBSERVED -> throw
                    ModelGatewayException.validation(
                            "model_gateway.cache_plan_invalid",
                            "An automatic-observed plan cannot be explicitly eligible.");
        };
    }

    private static ProviderCacheProjection openAiKey(
            PromptCachePlan plan,
            PromptCacheProfile profile,
            PromptCacheMarkerPolicy markerPolicy) {
        if (plan.cacheKeyDigest() == null || profile.maxCacheKeyBytes() == null) {
            throw ModelGatewayException.validation(
                    "model_gateway.cache_key_invalid",
                    "The explicit prompt cache key is unavailable.");
        }
        int bytes = plan.cacheKeyDigest().getBytes(StandardCharsets.UTF_8).length;
        if (bytes > profile.maxCacheKeyBytes()) {
            throw ModelGatewayException.validation(
                    "model_gateway.cache_key_invalid",
                    "The explicit prompt cache key exceeds its reviewed limit.");
        }
        return ProviderCacheProjection.OpenAiPromptCacheKey.of(
                plan.cacheKeyDigest(),
                profile.maxCacheKeyBytes(),
                markerPolicy.policyRevision());
    }
}
