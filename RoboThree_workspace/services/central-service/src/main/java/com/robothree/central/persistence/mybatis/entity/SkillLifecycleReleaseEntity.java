package com.robothree.central.persistence.mybatis.entity;

import java.time.Instant;
import java.util.UUID;

public final class SkillLifecycleReleaseEntity {
    private String skillId;
    private String releaseRevision;
    private UUID submissionId;
    private String draftRevision;
    private String packageDigest;
    private String semanticVersion;
    private String sourceKind;
    private String releaseJson;
    private Instant publishedAt;

    public String getSkillId() { return skillId; }
    public void setSkillId(String value) { skillId = value; }
    public String getReleaseRevision() { return releaseRevision; }
    public void setReleaseRevision(String value) { releaseRevision = value; }
    public UUID getSubmissionId() { return submissionId; }
    public void setSubmissionId(UUID value) { submissionId = value; }
    public String getDraftRevision() { return draftRevision; }
    public void setDraftRevision(String value) { draftRevision = value; }
    public String getPackageDigest() { return packageDigest; }
    public void setPackageDigest(String value) { packageDigest = value; }
    public String getSemanticVersion() { return semanticVersion; }
    public void setSemanticVersion(String value) { semanticVersion = value; }
    public String getSourceKind() { return sourceKind; }
    public void setSourceKind(String value) { sourceKind = value; }
    public String getReleaseJson() { return releaseJson; }
    public void setReleaseJson(String value) { releaseJson = value; }
    public Instant getPublishedAt() { return publishedAt; }
    public void setPublishedAt(Instant value) { publishedAt = value; }
}
