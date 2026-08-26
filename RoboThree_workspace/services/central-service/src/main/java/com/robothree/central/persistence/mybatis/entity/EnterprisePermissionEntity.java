package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import lombok.Getter;

@Getter
public final class EnterprisePermissionEntity {

    private String enterpriseId;
    private String userId;
    private String permission;
    private boolean enabled;
    private long revision;
    private OffsetDateTime updatedAt;

    public EnterprisePermissionEntity() {}

    public EnterprisePermissionEntity(
            String enterpriseId,
            String userId,
            String permission,
            boolean enabled,
            long revision,
            OffsetDateTime updatedAt) {
        this.enterpriseId = enterpriseId;
        this.userId = userId;
        this.permission = permission;
        this.enabled = enabled;
        this.revision = revision;
        this.updatedAt = updatedAt;
    }
}
