package com.robothree.central.agentlifecycle.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AgentLifecycleStore {
    Optional<String> findCurrentDraftJson(String robotId, String creatorSubject);
    Optional<String> findDraftRevisionJson(String robotId, String draftRevision);
    List<String> listCurrentDraftJson(String creatorSubject);
    int insertDraftRevision(DraftRevision value);
    int createDraftHead(String robotId, String draftRevision, Instant updatedAt);
    int advanceDraftHead(String robotId, String expectedRevision, String draftRevision, Instant updatedAt);
    int insertAvatarAsset(AvatarAsset value);

    Optional<TestFact> findTestFact(String robotId, String draftRevision);
    int upsertTestFact(TestFact value);

    Optional<Submission> findSubmission(UUID submissionId);
    Optional<Submission> findPendingSubmission(String robotId);
    Optional<Submission> findLatestSubmission(String robotId);
    List<Submission> listSubmissions(String state);
    int insertSubmission(Submission value);
    int transitionSubmission(UUID submissionId, String expectedRevision, String expectedState,
            String state, Instant reviewedAt, String reviewerSummary, String rejectionReason,
            String submissionRevision);

    int insertRelease(Release value);
    List<Release> listReleases();

    Optional<CommandReceipt> findReceipt(UUID commandId);
    int insertReceipt(CommandReceipt value);
    int insertAudit(AuditEvent value);

    record DraftRevision(String robotId, String draftRevision, String instructionRevision,
            String creatorSubject, String displayName, String recordJson, String recordDigest,
            Instant createdAt) {}

    record AvatarAsset(String assetId, String creatorSubject, String mediaType,
            String contentDigest, int width, int height, byte[] contentBytes, Instant createdAt) {}

    record TestFact(String robotId, String draftRevision, String state, String taskId,
            Instant testedAt, String safeReason) {}

    record Submission(UUID submissionId, String submissionRevision, String robotId,
            String draftRevision, String creatorSubject, String state, String packageJson,
            String packageDigest, Instant submittedAt, Instant reviewedAt,
            String reviewerSummary, String rejectionReason) {}

    record Release(String robotId, String releaseRevision, UUID submissionId,
            String packageDigest, String agentDefinitionJson, Instant publishedAt) {}

    record CommandReceipt(UUID commandId, UUID correlationId, String commandDigest,
            String resultJson, Instant occurredAt) {}

    record AuditEvent(UUID eventId, String actorSummary, String action, String robotId,
            String objectRevision, Instant occurredAt, String result, UUID correlationId) {}
}
