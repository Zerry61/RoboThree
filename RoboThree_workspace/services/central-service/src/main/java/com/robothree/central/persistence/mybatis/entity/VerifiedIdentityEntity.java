package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class VerifiedIdentityEntity {

    private UUID verifiedIdentityId;
    private String enterpriseId;
    private String userId;
    private String provider;
    private String providerSubjectDigest;
    private String identityDigest;
    private OffsetDateTime issuedAt;
    private OffsetDateTime expiresAt;
    private OffsetDateTime disabledAt;

    public VerifiedIdentityEntity() {}

    public VerifiedIdentityEntity(
            UUID verifiedIdentityId,
            String enterpriseId,
            String userId,
            String provider,
            String providerSubjectDigest,
            String identityDigest,
            OffsetDateTime issuedAt,
            OffsetDateTime expiresAt,
            OffsetDateTime disabledAt) {
        this.verifiedIdentityId = verifiedIdentityId;
        this.enterpriseId = enterpriseId;
        this.userId = userId;
        this.provider = provider;
        this.providerSubjectDigest = providerSubjectDigest;
        this.identityDigest = identityDigest;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.disabledAt = disabledAt;
    }
}
