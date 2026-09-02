package com.robothree.central.persistence.mybatis.entity;

import java.time.Instant;
import java.util.UUID;

public final class SkillLifecycleSubmissionEntity {
    private UUID submissionId;
    private String submissionRevision;
    private String skillId;
    private String draftRevision;
    private String creatorSubject;
    private String semanticVersion;
    private String changeSummary;
    private String state;
    private Instant submittedAt;
    private Instant reviewedAt;
    private String reviewerSummary;
    private String rejectionReason;

    public UUID getSubmissionId() { return submissionId; }
    public void setSubmissionId(UUID value) { submissionId = value; }
    public String getSubmissionRevision() { return submissionRevision; }
    public void setSubmissionRevision(String value) { submissionRevision = value; }
    public String getSkillId() { return skillId; }
    public void setSkillId(String value) { skillId = value; }
    public String getDraftRevision() { return draftRevision; }
    public void setDraftRevision(String value) { draftRevision = value; }
    public String getCreatorSubject() { return creatorSubject; }
    public void setCreatorSubject(String value) { creatorSubject = value; }
    public String getSemanticVersion() { return semanticVersion; }
    public void setSemanticVersion(String value) { semanticVersion = value; }
    public String getChangeSummary() { return changeSummary; }
    public void setChangeSummary(String value) { changeSummary = value; }
    public String getState() { return state; }
    public void setState(String value) { state = value; }
    public Instant getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(Instant value) { submittedAt = value; }
    public Instant getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(Instant value) { reviewedAt = value; }
    public String getReviewerSummary() { return reviewerSummary; }
    public void setReviewerSummary(String value) { reviewerSummary = value; }
    public String getRejectionReason() { return rejectionReason; }
    public void setRejectionReason(String value) { rejectionReason = value; }
}
