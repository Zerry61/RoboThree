package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class DeviceEnrollmentGrantEntity {

    private UUID enrollmentGrantId;
    private String codeDigest;
    private String enterpriseId;
    private String authorizedUserId;
    private OffsetDateTime issuedAt;
    private OffsetDateTime expiresAt;
    private OffsetDateTime consumedAt;
    private OffsetDateTime disabledAt;

    public DeviceEnrollmentGrantEntity() {}

    public DeviceEnrollmentGrantEntity(
            UUID enrollmentGrantId,
            String codeDigest,
            String enterpriseId,
            String authorizedUserId,
            OffsetDateTime issuedAt,
            OffsetDateTime expiresAt,
            OffsetDateTime consumedAt,
            OffsetDateTime disabledAt) {
        this.enrollmentGrantId = enrollmentGrantId;
        this.codeDigest = codeDigest;
        this.enterpriseId = enterpriseId;
        this.authorizedUserId = authorizedUserId;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.consumedAt = consumedAt;
        this.disabledAt = disabledAt;
    }
}
