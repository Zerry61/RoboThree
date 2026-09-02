package com.robothree.central.persistence.mybatis.entity;

import java.time.Instant;
import java.util.UUID;

public final class SkillLifecycleTestOperationEntity {
    private UUID operationId;
    private UUID correlationId;
    private String skillId;
    private String draftRevision;
    private String sourceKind;
    private String state;
    private String taskId;
    private String safeSummary;
    private String resultDigest;
    private Instant createdAt;
    private Instant updatedAt;

    public UUID getOperationId() { return operationId; }
    public void setOperationId(UUID value) { operationId = value; }
    public UUID getCorrelationId() { return correlationId; }
    public void setCorrelationId(UUID value) { correlationId = value; }
    public String getSkillId() { return skillId; }
    public void setSkillId(String value) { skillId = value; }
    public String getDraftRevision() { return draftRevision; }
    public void setDraftRevision(String value) { draftRevision = value; }
    public String getSourceKind() { return sourceKind; }
    public void setSourceKind(String value) { sourceKind = value; }
    public String getState() { return state; }
    public void setState(String value) { state = value; }
    public String getTaskId() { return taskId; }
    public void setTaskId(String value) { taskId = value; }
    public String getSafeSummary() { return safeSummary; }
    public void setSafeSummary(String value) { safeSummary = value; }
    public String getResultDigest() { return resultDigest; }
    public void setResultDigest(String value) { resultDigest = value; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant value) { createdAt = value; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant value) { updatedAt = value; }
}
