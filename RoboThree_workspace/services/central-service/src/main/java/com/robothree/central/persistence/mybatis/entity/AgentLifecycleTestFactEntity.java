package com.robothree.central.persistence.mybatis.entity;

import java.time.Instant;

public class AgentLifecycleTestFactEntity {
    private String robotId;
    private String draftRevision;
    private String state;
    private String taskId;
    private Instant testedAt;
    private String safeReason;
    public String getRobotId() { return robotId; }
    public void setRobotId(String value) { robotId = value; }
    public String getDraftRevision() { return draftRevision; }
    public void setDraftRevision(String value) { draftRevision = value; }
    public String getState() { return state; }
    public void setState(String value) { state = value; }
    public String getTaskId() { return taskId; }
    public void setTaskId(String value) { taskId = value; }
    public Instant getTestedAt() { return testedAt; }
    public void setTestedAt(Instant value) { testedAt = value; }
    public String getSafeReason() { return safeReason; }
    public void setSafeReason(String value) { safeReason = value; }
}
