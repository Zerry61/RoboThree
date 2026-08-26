package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class EnterpriseSessionChallengeBindingEntity {

    private UUID challengeId;
    private UUID verifiedIdentityId;
    private String claimsProfile;
    private String identitySourceRevision;
    private UUID currentClientInstanceId;
    private String audience;
    private List<String> requiredPermissions;
    private String deviceKeyId;
    private UUID correlationId;
    private String bindingDigest;
    private String recordDigest;
    private OffsetDateTime createdAt;

    public EnterpriseSessionChallengeBindingEntity() {}

    public EnterpriseSessionChallengeBindingEntity(
            UUID challengeId,
            UUID verifiedIdentityId,
            String claimsProfile,
            String identitySourceRevision,
            UUID currentClientInstanceId,
            String audience,
            List<String> requiredPermissions,
            String deviceKeyId,
            UUID correlationId,
            String bindingDigest,
            String recordDigest,
            OffsetDateTime createdAt) {
        this.challengeId = challengeId;
        this.verifiedIdentityId = verifiedIdentityId;
        this.claimsProfile = claimsProfile;
        this.identitySourceRevision = identitySourceRevision;
        this.currentClientInstanceId = currentClientInstanceId;
        this.audience = audience;
        this.requiredPermissions = requiredPermissions;
        this.deviceKeyId = deviceKeyId;
        this.correlationId = correlationId;
        this.bindingDigest = bindingDigest;
        this.recordDigest = recordDigest;
        this.createdAt = createdAt;
    }
}
