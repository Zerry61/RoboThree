package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class DeviceChallengeEntity {

    private UUID challengeId;
    private String purpose;
    private UUID verifiedIdentityId;
    private String clientInstanceId;
    private String expectedDeviceKeyId;
    private String expectedPublicKeyDigest;
    private String nonce;
    private String audience;
    private List<String> allowedAlgorithms;
    private String challengeDigest;
    private OffsetDateTime issuedAt;
    private OffsetDateTime expiresAt;
    private OffsetDateTime consumedAt;
    private String consumedBy;
    private String consumedRequestDigest;

    public DeviceChallengeEntity() {}

    public DeviceChallengeEntity(
            UUID challengeId,
            String purpose,
            UUID verifiedIdentityId,
            String clientInstanceId,
            String expectedDeviceKeyId,
            String expectedPublicKeyDigest,
            String nonce,
            String audience,
            List<String> allowedAlgorithms,
            String challengeDigest,
            OffsetDateTime issuedAt,
            OffsetDateTime expiresAt,
            OffsetDateTime consumedAt,
            String consumedBy,
            String consumedRequestDigest) {
        this.challengeId = challengeId;
        this.purpose = purpose;
        this.verifiedIdentityId = verifiedIdentityId;
        this.clientInstanceId = clientInstanceId;
        this.expectedDeviceKeyId = expectedDeviceKeyId;
        this.expectedPublicKeyDigest = expectedPublicKeyDigest;
        this.nonce = nonce;
        this.audience = audience;
        this.allowedAlgorithms = allowedAlgorithms;
        this.challengeDigest = challengeDigest;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.consumedAt = consumedAt;
        this.consumedBy = consumedBy;
        this.consumedRequestDigest = consumedRequestDigest;
    }
}
