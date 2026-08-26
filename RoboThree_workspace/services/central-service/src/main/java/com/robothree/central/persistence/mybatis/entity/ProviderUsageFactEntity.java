package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class ProviderUsageFactEntity {

    private UUID usageFactId;
    private String usageAuthority;
    private UUID authorityInvocationId;
    private String providerAttemptKey;
    private long fencingEpoch;
    private String usageDigest;
    private String sourceProtocol;
    private String reportingSemanticsRevision;
    private long providerInputTokens;
    private long providerOutputTokens;
    private Long cacheReadInputTokens;
    private Long cacheWriteInputTokens;
    private Long reasoningOutputTokens;
    private long normalizedTotalInputTokens;
    private String attemptDisposition;
    private OffsetDateTime recordedAt;

    public ProviderUsageFactEntity() {}

    public ProviderUsageFactEntity(
            UUID usageFactId,
            String usageAuthority,
            UUID authorityInvocationId,
            String providerAttemptKey,
            long fencingEpoch,
            String usageDigest,
            String sourceProtocol,
            String reportingSemanticsRevision,
            long providerInputTokens,
            long providerOutputTokens,
            Long cacheReadInputTokens,
            Long cacheWriteInputTokens,
            Long reasoningOutputTokens,
            long normalizedTotalInputTokens,
            String attemptDisposition,
            OffsetDateTime recordedAt) {
        this.usageFactId = usageFactId;
        this.usageAuthority = usageAuthority;
        this.authorityInvocationId = authorityInvocationId;
        this.providerAttemptKey = providerAttemptKey;
        this.fencingEpoch = fencingEpoch;
        this.usageDigest = usageDigest;
        this.sourceProtocol = sourceProtocol;
        this.reportingSemanticsRevision = reportingSemanticsRevision;
        this.providerInputTokens = providerInputTokens;
        this.providerOutputTokens = providerOutputTokens;
        this.cacheReadInputTokens = cacheReadInputTokens;
        this.cacheWriteInputTokens = cacheWriteInputTokens;
        this.reasoningOutputTokens = reasoningOutputTokens;
        this.normalizedTotalInputTokens = normalizedTotalInputTokens;
        this.attemptDisposition = attemptDisposition;
        this.recordedAt = recordedAt;
    }
}
