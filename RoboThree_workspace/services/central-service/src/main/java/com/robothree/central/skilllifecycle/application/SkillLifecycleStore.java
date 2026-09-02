package com.robothree.central.skilllifecycle.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SkillLifecycleStore {
    int insertPackage(PackageBlob value);
    Optional<PackageBlob> findPackage(String packageDigest);

    int insertDraftRevision(DraftRevision value);
    int createDraftHead(String skillId, String draftRevision, Instant updatedAt);
    int advanceDraftHead(String skillId, String expectedRevision, String draftRevision,
            Instant updatedAt);
    Optional<DraftRevision> findCurrentDraft(String skillId);
    Optional<DraftRevision> findDraftRevision(String skillId, String draftRevision);
    List<DraftRevision> listCurrentDrafts(String creatorSubject, String sourceKind);

    Optional<TestFact> findTestFact(String skillId, String draftRevision);
    int upsertTestFact(TestFact value);

    int insertTestOperation(TestOperation value);
    Optional<TestOperation> findTestOperation(UUID operationId);
    List<TestOperation> listAcceptedTestOperations(int limit);
    List<TestOperation> listRunningTestOperations(int limit);
    int claimTestOperation(UUID operationId, String taskId, Instant updatedAt);
    int failAcceptedTestOperation(UUID operationId, String safeSummary,
            String resultDigest, Instant updatedAt);
    int completeTestOperation(UUID operationId, String expectedTaskId, String state,
            String safeSummary, String resultDigest, Instant updatedAt);

    Optional<Submission> findSubmission(UUID submissionId);
    Optional<Submission> findPendingSubmission(String skillId);
    List<Submission> listSubmissions(String state);
    int insertSubmission(Submission value);
    int transitionSubmission(UUID submissionId, String expectedRevision, String expectedState,
            String state, Instant reviewedAt, String reviewerSummary, String rejectionReason,
            String submissionRevision);

    int insertRelease(Release value);
    Optional<Release> findRelease(String skillId, String releaseRevision);
    List<Release> listReleases();

    Optional<CommandReceipt> findReceipt(UUID commandId);
    int insertReceipt(CommandReceipt value);
    int insertAudit(AuditEvent value);

    record PackageBlob(
            String packageDigest,
            String archiveDigest,
            String manifestDigest,
            String skillMarkdownDigest,
            String technicalName,
            int fileCount,
            long expandedByteCount,
            byte[] canonicalZipBytes,
            Instant createdAt) {
        public PackageBlob {
            canonicalZipBytes = canonicalZipBytes.clone();
        }

        @Override
        public byte[] canonicalZipBytes() {
            return canonicalZipBytes.clone();
        }
    }

    record DraftRevision(
            String skillId,
            String draftRevision,
            String creatorSubject,
            String sourceKind,
            String packageDigest,
            String technicalName,
            String displayTitle,
            String metadataJson,
            String recordDigest,
            Instant createdAt) {}

    record TestFact(
            String skillId,
            String draftRevision,
            String state,
            String taskId,
            Instant startedAt,
            Instant completedAt,
            String safeSummary,
            String resultDigest) {}

    record TestOperation(
            UUID operationId,
            UUID correlationId,
            String skillId,
            String draftRevision,
            String sourceKind,
            String state,
            String taskId,
            String safeSummary,
            String resultDigest,
            Instant createdAt,
            Instant updatedAt) {}

    record Submission(
            UUID submissionId,
            String submissionRevision,
            String skillId,
            String draftRevision,
            String creatorSubject,
            String semanticVersion,
            String changeSummary,
            String state,
            Instant submittedAt,
            Instant reviewedAt,
            String reviewerSummary,
            String rejectionReason) {}

    record Release(
            String skillId,
            String releaseRevision,
            UUID submissionId,
            String draftRevision,
            String packageDigest,
            String semanticVersion,
            String sourceKind,
            String releaseJson,
            Instant publishedAt) {}

    record CommandReceipt(
            UUID commandId,
            UUID correlationId,
            String commandDigest,
            String resultJson,
            Instant occurredAt) {}

    record AuditEvent(
            UUID eventId,
            String actorSummary,
            String action,
            String skillId,
            String objectRevision,
            Instant occurredAt,
            String result,
            UUID correlationId) {}
}
