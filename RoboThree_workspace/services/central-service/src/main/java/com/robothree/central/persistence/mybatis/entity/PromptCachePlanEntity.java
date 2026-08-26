package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class PromptCachePlanEntity {
    private UUID invocationId;
    private String cacheContextDigest;
    private String cacheScopeIdDigest;
    private String staticSourceLockDigest;
    private String staticPrefixDigest;
    private String compatibilityFingerprintDigest;
    private String cacheKeyDigest;
    private String cachePolicyRevision;
    private String bindingRevision;
    private String bindingDigest;
    private String profileId;
    private String profileRevision;
    private String profileDigest;
    private String providerProjectionMode;
    private boolean eligible;
    private String skipReason;
    private String planDigest;
    private OffsetDateTime createdAt;

    public PromptCachePlanEntity() {}

    public PromptCachePlanEntity(
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
            String providerProjectionMode,
            boolean eligible,
            String skipReason,
            String planDigest,
            OffsetDateTime createdAt) {
        this.invocationId = invocationId;
        this.cacheContextDigest = cacheContextDigest;
        this.cacheScopeIdDigest = cacheScopeIdDigest;
        this.staticSourceLockDigest = staticSourceLockDigest;
        this.staticPrefixDigest = staticPrefixDigest;
        this.compatibilityFingerprintDigest = compatibilityFingerprintDigest;
        this.cacheKeyDigest = cacheKeyDigest;
        this.cachePolicyRevision = cachePolicyRevision;
        this.bindingRevision = bindingRevision;
        this.bindingDigest = bindingDigest;
        this.profileId = profileId;
        this.profileRevision = profileRevision;
        this.profileDigest = profileDigest;
        this.providerProjectionMode = providerProjectionMode;
        this.eligible = eligible;
        this.skipReason = skipReason;
        this.planDigest = planDigest;
        this.createdAt = createdAt;
    }
}
