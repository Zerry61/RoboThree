package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class ModelProviderAttemptEntity {

    private String usageAuthority;
    private UUID authorityInvocationId;
    private String providerAttemptKey;
    private long fencingEpoch;
    private OffsetDateTime registeredAt;

    public ModelProviderAttemptEntity() {}

    public ModelProviderAttemptEntity(
            String usageAuthority,
            UUID authorityInvocationId,
            String providerAttemptKey,
            long fencingEpoch,
            OffsetDateTime registeredAt) {
        this.usageAuthority = usageAuthority;
        this.authorityInvocationId = authorityInvocationId;
        this.providerAttemptKey = providerAttemptKey;
        this.fencingEpoch = fencingEpoch;
        this.registeredAt = registeredAt;
    }
}
