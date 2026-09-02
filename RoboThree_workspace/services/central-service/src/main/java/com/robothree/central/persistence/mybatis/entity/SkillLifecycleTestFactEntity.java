package com.robothree.central.persistence.mybatis.entity;

import java.time.Instant;

public final class SkillLifecycleTestFactEntity {
    private String skillId;
    private String draftRevision;
    private String state;
    private String taskId;
    private Instant startedAt;
    private Instant completedAt;
    private String safeSummary;
    private String resultDigest;

    public String getSkillId() { return skillId; }
    public void setSkillId(String value) { skillId = value; }
    public String getDraftRevision() { return draftRevision; }
    public void setDraftRevision(String value) { draftRevision = value; }
    public String getState() { return state; }
    public void setState(String value) { state = value; }
    public String getTaskId() { return taskId; }
    public void setTaskId(String value) { taskId = value; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant value) { startedAt = value; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant value) { completedAt = value; }
    public String getSafeSummary() { return safeSummary; }
    public void setSafeSummary(String value) { safeSummary = value; }
    public String getResultDigest() { return resultDigest; }
    public void setResultDigest(String value) { resultDigest = value; }
}
