package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import com.robothree.central.shared.json.CanonicalJson;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Immutable provider-neutral cache decision. It never proves a provider cache hit. */
public record PromptCachePlan(
        UUID invocationId,
        String cacheContextDigest,
        String cacheScopeIdDigest,
        String staticSourceLockDigest,
        String staticPrefixDigest,
        String compatibilityFingerprintDigest,
        String cacheKeyDigest,
        String cachePolicyRevision,
        String bindingRevision,
        String bindingDigest,
        String profileId,
        String profileRevision,
        String profileDigest,
        PromptCacheProfile.ProjectionMode providerProjectionMode,
        boolean eligible,
        SkipReason skipReason,
        String planDigest,
        Instant createdAt) {

    private static final ObjectMapper JSON = new ObjectMapper();

    public PromptCachePlan {
        Objects.requireNonNull(invocationId, "invocationId");
        cacheContextDigest = digest(cacheContextDigest, "cacheContextDigest");
        cacheScopeIdDigest = digest(cacheScopeIdDigest, "cacheScopeIdDigest");
        staticSourceLockDigest = digest(staticSourceLockDigest, "staticSourceLockDigest");
        staticPrefixDigest = digest(staticPrefixDigest, "staticPrefixDigest");
        compatibilityFingerprintDigest = digest(
                compatibilityFingerprintDigest,
                "compatibilityFingerprintDigest");
        cacheKeyDigest = cacheKeyDigest == null ? null : digest(cacheKeyDigest, "cacheKeyDigest");
        cachePolicyRevision = digest(cachePolicyRevision, "cachePolicyRevision");
        bindingRevision = digest(bindingRevision, "bindingRevision");
        bindingDigest = digest(bindingDigest, "bindingDigest");
        profileId = text(profileId, "profileId");
        profileRevision = digest(profileRevision, "profileRevision");
        profileDigest = digest(profileDigest, "profileDigest");
        Objects.requireNonNull(providerProjectionMode, "providerProjectionMode");
        Objects.requireNonNull(createdAt, "createdAt");
        if (eligible == (skipReason != null)) {
            throw new IllegalArgumentException(
                    "eligible plan must omit skipReason and skipped plan must provide it");
        }
        if (!providerProjectionMode.supportsExplicitKey() && cacheKeyDigest != null) {
            throw new IllegalArgumentException(
                    "cacheKeyDigest is only valid for an explicit-key projection mode");
        }
        if (eligible && providerProjectionMode.supportsExplicitKey() && cacheKeyDigest == null) {
            throw new IllegalArgumentException("explicit-key eligible plan requires cacheKeyDigest");
        }
        planDigest = digest(planDigest, "planDigest");
        String expected = computePlanDigest(
                cacheContextDigest,
                cacheScopeIdDigest,
                staticSourceLockDigest,
                staticPrefixDigest,
                compatibilityFingerprintDigest,
                cacheKeyDigest,
                cachePolicyRevision,
                bindingRevision,
                bindingDigest,
                profileId,
                profileRevision,
                profileDigest,
                providerProjectionMode,
                eligible,
                skipReason);
        if (!expected.equals(planDigest)) {
            throw new IllegalArgumentException("planDigest does not match plan facts");
        }
    }

    public MonotonicityIdentity monotonicityIdentity() {
        return new MonotonicityIdentity(
                cacheScopeIdDigest,
                staticSourceLockDigest,
                bindingRevision,
                bindingDigest,
                profileRevision,
                profileDigest,
                compatibilityFingerprintDigest,
                cachePolicyRevision,
                providerProjectionMode);
    }

    public record MonotonicityIdentity(
            String cacheScopeIdDigest,
            String staticSourceLockDigest,
            String bindingRevision,
            String bindingDigest,
            String profileRevision,
            String profileDigest,
            String compatibilityFingerprintDigest,
            String cachePolicyRevision,
            PromptCacheProfile.ProjectionMode providerProjectionMode) {}

    public enum SkipReason {
        PROFILE_DISABLED("profile_disabled"),
        PROVIDER_AUTOMATIC_OBSERVED("provider_automatic_observed"),
        NO_STATIC_PREFIX("no_static_prefix"),
        UNSUPPORTED_CONNECTION_MODE("unsupported_connection_mode"),
        ISOLATION_UNPROVEN("isolation_unproven"),
        COMPATIBILITY_UNREVIEWED("compatibility_unreviewed");
        private final String contractValue;
        SkipReason(String value) { this.contractValue = value; }
        public String contractValue() { return contractValue; }
        public static SkipReason fromContractValue(String value) {
            for (SkipReason candidate : values()) {
                if (candidate.contractValue.equals(value)) return candidate;
            }
            throw new IllegalArgumentException("unknown prompt cache skip reason");
        }
    }

    public static String computePlanDigest(
            String cacheContextDigest,
            String cacheScopeIdDigest,
            String staticSourceLockDigest,
            String staticPrefixDigest,
            String compatibilityFingerprintDigest,
            String cacheKeyDigest,
            String cachePolicyRevision,
            String bindingRevision,
            String bindingDigest,
            String profileId,
            String profileRevision,
            String profileDigest,
            PromptCacheProfile.ProjectionMode projectionMode,
            boolean eligible,
            SkipReason skipReason) {
        ObjectNode value = JSON.createObjectNode();
        value.put("bindingDigest", bindingDigest);
        value.put("bindingRevision", bindingRevision);
        value.put("cacheContextDigest", cacheContextDigest);
        if (cacheKeyDigest == null) value.putNull("cacheKeyDigest");
        else value.put("cacheKeyDigest", cacheKeyDigest);
        value.put("cachePolicyRevision", cachePolicyRevision);
        value.put("cacheScopeIdDigest", cacheScopeIdDigest);
        value.put("compatibilityFingerprintDigest", compatibilityFingerprintDigest);
        value.put("eligible", eligible);
        value.put("profileDigest", profileDigest);
        value.put("profileId", profileId);
        value.put("profileRevision", profileRevision);
        value.put("providerProjectionMode", projectionMode.contractValue());
        if (skipReason == null) value.putNull("skipReason");
        else value.put("skipReason", skipReason.contractValue());
        value.put("staticPrefixDigest", staticPrefixDigest);
        value.put("staticSourceLockDigest", staticSourceLockDigest);
        return CanonicalJson.sha256(CanonicalJson.canonicalize(value));
    }
}
