package com.robothree.central.persistence.mybatis.entity;

import java.time.Instant;
import java.util.UUID;

public class AgentLifecycleReleaseEntity {
    private String robotId;
    private String releaseRevision;
    private UUID submissionId;
    private String packageDigest;
    private String agentDefinitionJson;
    private Instant publishedAt;
    public String getRobotId() { return robotId; }
    public void setRobotId(String value) { robotId = value; }
    public String getReleaseRevision() { return releaseRevision; }
    public void setReleaseRevision(String value) { releaseRevision = value; }
    public UUID getSubmissionId() { return submissionId; }
    public void setSubmissionId(UUID value) { submissionId = value; }
    public String getPackageDigest() { return packageDigest; }
    public void setPackageDigest(String value) { packageDigest = value; }
    public String getAgentDefinitionJson() { return agentDefinitionJson; }
    public void setAgentDefinitionJson(String value) { agentDefinitionJson = value; }
    public Instant getPublishedAt() { return publishedAt; }
    public void setPublishedAt(Instant value) { publishedAt = value; }
}
