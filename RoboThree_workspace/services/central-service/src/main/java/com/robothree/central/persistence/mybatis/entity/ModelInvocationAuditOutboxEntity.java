package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class ModelInvocationAuditOutboxEntity {

    private UUID outboxId;
    private UUID invocationId;
    private UUID eventId;
    private String eventType;
    private String eventDigest;
    private OffsetDateTime createdAt;
    private OffsetDateTime publishedAt;
    private long attemptCount;

    public ModelInvocationAuditOutboxEntity() {}

    public ModelInvocationAuditOutboxEntity(
            UUID outboxId,
            UUID invocationId,
            UUID eventId,
            String eventType,
            String eventDigest,
            OffsetDateTime createdAt,
            OffsetDateTime publishedAt,
            long attemptCount) {
        this.outboxId = outboxId;
        this.invocationId = invocationId;
        this.eventId = eventId;
        this.eventType = eventType;
        this.eventDigest = eventDigest;
        this.createdAt = createdAt;
        this.publishedAt = publishedAt;
        this.attemptCount = attemptCount;
    }
}
