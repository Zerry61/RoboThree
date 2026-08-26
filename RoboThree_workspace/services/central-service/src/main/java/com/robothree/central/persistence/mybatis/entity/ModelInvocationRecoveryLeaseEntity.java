package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class ModelInvocationRecoveryLeaseEntity {

    private UUID invocationId;
    private String ownerNodeId;
    private long fencingEpoch;
    private long statusRevision;
    private OffsetDateTime leaseExpiresAt;
    private OffsetDateTime databaseObservedAt;
    private long recoveryAttempt;
    private String policyRevision;
    private OffsetDateTime updatedAt;

    public ModelInvocationRecoveryLeaseEntity() {}

    public ModelInvocationRecoveryLeaseEntity(
            UUID invocationId,
            String ownerNodeId,
            long fencingEpoch,
            long statusRevision,
            OffsetDateTime leaseExpiresAt,
            OffsetDateTime databaseObservedAt,
            long recoveryAttempt,
            String policyRevision,
            OffsetDateTime updatedAt) {
        this.invocationId = invocationId;
        this.ownerNodeId = ownerNodeId;
        this.fencingEpoch = fencingEpoch;
        this.statusRevision = statusRevision;
        this.leaseExpiresAt = leaseExpiresAt;
        this.databaseObservedAt = databaseObservedAt;
        this.recoveryAttempt = recoveryAttempt;
        this.policyRevision = policyRevision;
        this.updatedAt = updatedAt;
    }
}
