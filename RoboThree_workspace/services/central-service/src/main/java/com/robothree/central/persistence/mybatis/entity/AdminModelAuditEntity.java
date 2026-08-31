package com.robothree.central.persistence.mybatis.entity;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AdminModelAuditEntity {
    private UUID eventId;
    private String actorSummary;
    private String action;
    private String modelId;
    private String modelRevision;
    private List<String> changedFieldNames;
    private Instant occurredAt;
    private String result;
    private UUID correlationId;

    public UUID getEventId() { return eventId; }
    public void setEventId(UUID value) { eventId = value; }
    public String getActorSummary() { return actorSummary; }
    public void setActorSummary(String value) { actorSummary = value; }
    public String getAction() { return action; }
    public void setAction(String value) { action = value; }
    public String getModelId() { return modelId; }
    public void setModelId(String value) { modelId = value; }
    public String getModelRevision() { return modelRevision; }
    public void setModelRevision(String value) { modelRevision = value; }
    public List<String> getChangedFieldNames() { return changedFieldNames; }
    public void setChangedFieldNames(List<String> value) { changedFieldNames = value; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant value) { occurredAt = value; }
    public String getResult() { return result; }
    public void setResult(String value) { result = value; }
    public UUID getCorrelationId() { return correlationId; }
    public void setCorrelationId(UUID value) { correlationId = value; }
}
