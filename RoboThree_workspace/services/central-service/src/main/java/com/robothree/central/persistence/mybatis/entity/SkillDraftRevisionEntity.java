package com.robothree.central.persistence.mybatis.entity;

import java.time.Instant;

public final class SkillDraftRevisionEntity {
    private String skillId;
    private String draftRevision;
    private String creatorSubject;
    private String sourceKind;
    private String packageDigest;
    private String technicalName;
    private String displayTitle;
    private String metadataJson;
    private String recordDigest;
    private Instant createdAt;

    public String getSkillId() { return skillId; }
    public void setSkillId(String value) { skillId = value; }
    public String getDraftRevision() { return draftRevision; }
    public void setDraftRevision(String value) { draftRevision = value; }
    public String getCreatorSubject() { return creatorSubject; }
    public void setCreatorSubject(String value) { creatorSubject = value; }
    public String getSourceKind() { return sourceKind; }
    public void setSourceKind(String value) { sourceKind = value; }
    public String getPackageDigest() { return packageDigest; }
    public void setPackageDigest(String value) { packageDigest = value; }
    public String getTechnicalName() { return technicalName; }
    public void setTechnicalName(String value) { technicalName = value; }
    public String getDisplayTitle() { return displayTitle; }
    public void setDisplayTitle(String value) { displayTitle = value; }
    public String getMetadataJson() { return metadataJson; }
    public void setMetadataJson(String value) { metadataJson = value; }
    public String getRecordDigest() { return recordDigest; }
    public void setRecordDigest(String value) { recordDigest = value; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant value) { createdAt = value; }
}
