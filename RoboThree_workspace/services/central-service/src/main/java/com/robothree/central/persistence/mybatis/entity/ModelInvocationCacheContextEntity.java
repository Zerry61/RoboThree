package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class ModelInvocationCacheContextEntity {
    private UUID invocationId;
    private String cacheExecutionAuthority;
    private String gatewayContractVersion;
    private String sessionScopeDigest;
    private String cacheContextDigest;
    private String contextRecordDigest;
    private OffsetDateTime createdAt;

    public ModelInvocationCacheContextEntity() {}

    public ModelInvocationCacheContextEntity(
            UUID invocationId,
            String cacheExecutionAuthority,
            String gatewayContractVersion,
            String sessionScopeDigest,
            String cacheContextDigest,
            String contextRecordDigest,
            OffsetDateTime createdAt) {
        this.invocationId = invocationId;
        this.cacheExecutionAuthority = cacheExecutionAuthority;
        this.gatewayContractVersion = gatewayContractVersion;
        this.sessionScopeDigest = sessionScopeDigest;
        this.cacheContextDigest = cacheContextDigest;
        this.contextRecordDigest = contextRecordDigest;
        this.createdAt = createdAt;
    }
}
