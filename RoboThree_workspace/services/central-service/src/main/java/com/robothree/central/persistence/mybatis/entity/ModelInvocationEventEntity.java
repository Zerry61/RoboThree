package com.robothree.central.persistence.mybatis.entity;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;

@Getter
public final class ModelInvocationEventEntity {

    private UUID invocationId;
    private long eventSequence;
    private UUID eventId;
    private String eventType;
    private String status;
    private long statusRevision;
    private String eventDigest;
    private String streamDigest;
    private String metadataJson;
    private OffsetDateTime createdAt;

    public ModelInvocationEventEntity() {}

    public ModelInvocationEventEntity(
            UUID invocationId,
            long eventSequence,
            UUID eventId,
            String eventType,
            String status,
            long statusRevision,
            String eventDigest,
            String streamDigest,
            String metadataJson,
            OffsetDateTime createdAt) {
        this.invocationId = invocationId;
        this.eventSequence = eventSequence;
        this.eventId = eventId;
        this.eventType = eventType;
        this.status = status;
        this.statusRevision = statusRevision;
        this.eventDigest = eventDigest;
        this.streamDigest = streamDigest;
        this.metadataJson = metadataJson;
        this.createdAt = createdAt;
    }
}
