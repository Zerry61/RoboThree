package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import lombok.Getter;

@Getter
public final class EnterpriseDeviceEntity {

    private String deviceId;
    private String enterpriseId;
    private String deviceKeyId;
    private String publicKeyFormat;
    private String publicKeyEncoded;
    private String publicKeyDigest;
    private String algorithm;
    private String trustSource;
    private String managedStatus;
    private String complianceStatus;
    private long revision;
    private OffsetDateTime registeredAt;
    private OffsetDateTime revokedAt;
    private OffsetDateTime disabledAt;

    public EnterpriseDeviceEntity() {}

    public EnterpriseDeviceEntity(
            String deviceId,
            String enterpriseId,
            String deviceKeyId,
            String publicKeyFormat,
            String publicKeyEncoded,
            String publicKeyDigest,
            String algorithm,
            String trustSource,
            String managedStatus,
            String complianceStatus,
            long revision,
            OffsetDateTime registeredAt,
            OffsetDateTime revokedAt,
            OffsetDateTime disabledAt) {
        this.deviceId = deviceId;
        this.enterpriseId = enterpriseId;
        this.deviceKeyId = deviceKeyId;
        this.publicKeyFormat = publicKeyFormat;
        this.publicKeyEncoded = publicKeyEncoded;
        this.publicKeyDigest = publicKeyDigest;
        this.algorithm = algorithm;
        this.trustSource = trustSource;
        this.managedStatus = managedStatus;
        this.complianceStatus = complianceStatus;
        this.revision = revision;
        this.registeredAt = registeredAt;
        this.revokedAt = revokedAt;
        this.disabledAt = disabledAt;
    }
}
