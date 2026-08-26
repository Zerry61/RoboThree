package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class AccessTokenIssuanceEntity {

    private UUID tokenId;
    private String tokenDigest;
    private String enterpriseId;
    private String userId;
    private String deviceId;
    private String clientInstanceId;
    private List<String> permissions;
    private String identityDigest;
    private long deviceRevision;
    private long permissionRevision;
    private OffsetDateTime issuedAt;
    private OffsetDateTime expiresAt;
    private UUID challengeId;

    public AccessTokenIssuanceEntity() {}

    public AccessTokenIssuanceEntity(
            UUID tokenId,
            String tokenDigest,
            String enterpriseId,
            String userId,
            String deviceId,
            String clientInstanceId,
            List<String> permissions,
            String identityDigest,
            long deviceRevision,
            long permissionRevision,
            OffsetDateTime issuedAt,
            OffsetDateTime expiresAt,
            UUID challengeId) {
        this.tokenId = tokenId;
        this.tokenDigest = tokenDigest;
        this.enterpriseId = enterpriseId;
        this.userId = userId;
        this.deviceId = deviceId;
        this.clientInstanceId = clientInstanceId;
        this.permissions = permissions;
        this.identityDigest = identityDigest;
        this.deviceRevision = deviceRevision;
        this.permissionRevision = permissionRevision;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.challengeId = challengeId;
    }
}
