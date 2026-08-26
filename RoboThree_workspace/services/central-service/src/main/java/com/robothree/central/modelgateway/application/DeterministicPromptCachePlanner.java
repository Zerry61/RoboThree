package com.robothree.central.modelgateway.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationCacheContext;
import com.robothree.central.modelgateway.domain.PromptCacheCompatibility;
import com.robothree.central.modelgateway.domain.PromptCachePlan;
import com.robothree.central.modelgateway.domain.PromptCachePlan.SkipReason;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.modelgateway.domain.StaticPrefixProjection;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Instant;
import java.util.Objects;

/** Pure four-layer identity planner. It does not access persistence or Provider transports. */
public final class DeterministicPromptCachePlanner {

    private static final ObjectMapper JSON = new ObjectMapper();
    public static final String CACHE_POLICY_REVISION =
            CanonicalJson.sha256("robothree.prompt-cache-policy.v1");

    public PromptCachePlan plan(
            ModelInvocation invocation,
            ModelEndpointBinding binding,
            PromptCacheProfile profile,
            ModelInvocationCacheContext cacheContext,
            PromptCacheCompatibility compatibility,
            StaticPrefixProjection projection,
            Instant createdAt) {
        Objects.requireNonNull(invocation, "invocation");
        Objects.requireNonNull(binding, "binding");
        Objects.requireNonNull(profile, "profile");
        Objects.requireNonNull(cacheContext, "cacheContext");
        Objects.requireNonNull(compatibility, "compatibility");
        Objects.requireNonNull(projection, "projection");
        Objects.requireNonNull(createdAt, "createdAt");
        if (!invocation.invocationId().equals(cacheContext.invocationId())) {
            throw new IllegalArgumentException("cache context belongs to another invocation");
        }

        String cacheScopeIdDigest = deriveCacheScope(invocation, binding, cacheContext);
        SkipReason skipReason = skipReason(profile, compatibility, projection);
        boolean eligible = skipReason == null;
        String cacheKeyDigest = eligible && profile.providerProjectionMode().supportsExplicitKey()
                ? deriveCacheKey(
                        invocation,
                        binding,
                        profile,
                        cacheScopeIdDigest,
                        projection,
                        compatibility)
                : null;
        String planDigest = PromptCachePlan.computePlanDigest(
                cacheContext.cacheContextDigest(),
                cacheScopeIdDigest,
                projection.staticSourceLockDigest(),
                projection.staticPrefixDigest(),
                compatibility.compatibilityFingerprintDigest(),
                cacheKeyDigest,
                CACHE_POLICY_REVISION,
                binding.bindingRevision(),
                binding.bindingDigest(),
                profile.profileId(),
                profile.profileRevision(),
                profile.profileDigest(),
                profile.providerProjectionMode(),
                eligible,
                skipReason);
        return new PromptCachePlan(
                invocation.invocationId(),
                cacheContext.cacheContextDigest(),
                cacheScopeIdDigest,
                projection.staticSourceLockDigest(),
                projection.staticPrefixDigest(),
                compatibility.compatibilityFingerprintDigest(),
                cacheKeyDigest,
                CACHE_POLICY_REVISION,
                binding.bindingRevision(),
                binding.bindingDigest(),
                profile.profileId(),
                profile.profileRevision(),
                profile.profileDigest(),
                profile.providerProjectionMode(),
                eligible,
                skipReason,
                planDigest,
                createdAt);
    }

    private static String deriveCacheScope(
            ModelInvocation invocation,
            ModelEndpointBinding binding,
            ModelInvocationCacheContext context) {
        ObjectNode value = JSON.createObjectNode();
        value.put("schemaVersion", "v1");
        value.put("cacheExecutionAuthority", "central_enterprise");
        value.put("verifiedEnterpriseScopeDigest", CanonicalJson.sha256(
                "enterprise:" + invocation.enterpriseId()));
        value.put("verifiedUserScopeDigest", CanonicalJson.sha256(
                "user:" + invocation.enterpriseId() + ":" + invocation.userId()));
        value.put("credentialNamespaceDigest", CanonicalJson.sha256(
                "credential:" + binding.credentialReference()));
        value.put("credentialRevision", binding.credentialRevision());
        value.put("sessionScopeDigest", context.sessionScopeDigest());
        return CanonicalJson.sha256(CanonicalJson.canonicalize(value));
    }

    private static String deriveCacheKey(
            ModelInvocation invocation,
            ModelEndpointBinding binding,
            PromptCacheProfile profile,
            String cacheScopeIdDigest,
            StaticPrefixProjection projection,
            PromptCacheCompatibility compatibility) {
        ObjectNode value = JSON.createObjectNode();
        value.put("cacheScopeIdDigest", cacheScopeIdDigest);
        value.put("staticSourceLockDigest", projection.staticSourceLockDigest());
        value.put("staticPrefixDigest", projection.staticPrefixDigest());
        value.put(
                "compatibilityFingerprintDigest",
                compatibility.compatibilityFingerprintDigest());
        value.put("modelId", invocation.modelId());
        value.put("modelRevision", invocation.modelRevision());
        value.put("configurationRevision", invocation.configurationRevision());
        value.put("runtimeRegistryGeneration", invocation.runtimeRegistryGeneration());
        value.put("bindingId", binding.bindingId());
        value.put("bindingRevision", binding.bindingRevision());
        value.put("bindingDigest", binding.bindingDigest());
        value.put("adapterProtocol", binding.protocol().name().toLowerCase());
        value.put("connectionMode", binding.connectionMode().name().toLowerCase());
        value.put("profileId", profile.profileId());
        value.put("profileRevision", profile.profileRevision());
        value.put("profileDigest", profile.profileDigest());
        value.put("cachePolicyRevision", CACHE_POLICY_REVISION);
        return CanonicalJson.sha256(CanonicalJson.canonicalize(value));
    }

    private static SkipReason skipReason(
            PromptCacheProfile profile,
            PromptCacheCompatibility compatibility,
            StaticPrefixProjection projection) {
        if (profile.status() == PromptCacheProfile.Status.DISABLED) {
            return SkipReason.PROFILE_DISABLED;
        }
        if (compatibility.classification()
                != PromptCacheCompatibility.Classification.COMPATIBLE) {
            return SkipReason.COMPATIBILITY_UNREVIEWED;
        }
        if (!projection.hasEligiblePrefix()) {
            return SkipReason.NO_STATIC_PREFIX;
        }
        if (profile.isolationAssurance() != PromptCacheProfile.Assurance.PROVEN) {
            return SkipReason.ISOLATION_UNPROVEN;
        }
        if (profile.providerProjectionMode()
                == PromptCacheProfile.ProjectionMode.OPENAI_PROVIDER_AUTOMATIC_OBSERVED) {
            return SkipReason.PROVIDER_AUTOMATIC_OBSERVED;
        }
        return null;
    }
}
