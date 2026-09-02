package com.robothree.central.persistence.mybatis.adapter;

import com.robothree.central.persistence.mybatis.entity.SkillDraftRevisionEntity;
import com.robothree.central.persistence.mybatis.entity.SkillLifecycleCommandReceiptEntity;
import com.robothree.central.persistence.mybatis.entity.SkillLifecycleReleaseEntity;
import com.robothree.central.persistence.mybatis.entity.SkillLifecycleSubmissionEntity;
import com.robothree.central.persistence.mybatis.entity.SkillLifecycleTestFactEntity;
import com.robothree.central.persistence.mybatis.entity.SkillLifecycleTestOperationEntity;
import com.robothree.central.persistence.mybatis.entity.SkillPackageBlobEntity;
import com.robothree.central.persistence.mybatis.mapper.SkillLifecyclePersistenceMapper;
import com.robothree.central.skilllifecycle.application.SkillLifecycleStore;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class MyBatisSkillLifecycleStore implements SkillLifecycleStore {
    private final SkillLifecyclePersistenceMapper mapper;

    public MyBatisSkillLifecycleStore(SkillLifecyclePersistenceMapper mapper) {
        this.mapper = mapper;
    }

    @Override public int insertPackage(PackageBlob value) {
        SkillPackageBlobEntity entity = new SkillPackageBlobEntity();
        entity.setPackageDigest(value.packageDigest());
        entity.setArchiveDigest(value.archiveDigest());
        entity.setManifestDigest(value.manifestDigest());
        entity.setSkillMarkdownDigest(value.skillMarkdownDigest());
        entity.setTechnicalName(value.technicalName());
        entity.setFileCount(value.fileCount());
        entity.setExpandedByteCount(value.expandedByteCount());
        entity.setCanonicalZipBytes(value.canonicalZipBytes());
        entity.setCreatedAt(value.createdAt());
        return mapper.insertPackage(entity);
    }

    @Override public Optional<PackageBlob> findPackage(String digest) {
        return Optional.ofNullable(mapper.findPackage(digest)).map(MyBatisSkillLifecycleStore::pack);
    }

    @Override public int insertDraftRevision(DraftRevision value) {
        SkillDraftRevisionEntity entity = new SkillDraftRevisionEntity();
        entity.setSkillId(value.skillId());
        entity.setDraftRevision(value.draftRevision());
        entity.setCreatorSubject(value.creatorSubject());
        entity.setSourceKind(value.sourceKind());
        entity.setPackageDigest(value.packageDigest());
        entity.setTechnicalName(value.technicalName());
        entity.setDisplayTitle(value.displayTitle());
        entity.setMetadataJson(value.metadataJson());
        entity.setRecordDigest(value.recordDigest());
        entity.setCreatedAt(value.createdAt());
        return mapper.insertDraftRevision(entity);
    }

    @Override public int createDraftHead(String id, String revision, Instant at) {
        return mapper.createDraftHead(id, revision, at);
    }

    @Override public int advanceDraftHead(String id, String expected, String revision, Instant at) {
        return mapper.advanceDraftHead(id, expected, revision, at);
    }

    @Override public Optional<DraftRevision> findCurrentDraft(String id) {
        return Optional.ofNullable(mapper.findCurrentDraft(id)).map(MyBatisSkillLifecycleStore::draft);
    }

    @Override public Optional<DraftRevision> findDraftRevision(String id, String revision) {
        return Optional.ofNullable(mapper.findDraftRevision(id, revision))
                .map(MyBatisSkillLifecycleStore::draft);
    }

    @Override public List<DraftRevision> listCurrentDrafts(String creator, String source) {
        return mapper.listCurrentDrafts(creator, source).stream()
                .map(MyBatisSkillLifecycleStore::draft).toList();
    }

    @Override public Optional<TestFact> findTestFact(String id, String revision) {
        return Optional.ofNullable(mapper.findTestFact(id, revision))
                .map(MyBatisSkillLifecycleStore::test);
    }

    @Override public int upsertTestFact(TestFact value) {
        SkillLifecycleTestFactEntity entity = new SkillLifecycleTestFactEntity();
        entity.setSkillId(value.skillId());
        entity.setDraftRevision(value.draftRevision());
        entity.setState(value.state());
        entity.setTaskId(value.taskId());
        entity.setStartedAt(value.startedAt());
        entity.setCompletedAt(value.completedAt());
        entity.setSafeSummary(value.safeSummary());
        entity.setResultDigest(value.resultDigest());
        return mapper.upsertTestFact(entity);
    }

    @Override public int insertTestOperation(TestOperation value) {
        SkillLifecycleTestOperationEntity entity = operationEntity(value);
        return mapper.insertTestOperation(entity);
    }

    @Override public Optional<TestOperation> findTestOperation(UUID id) {
        return Optional.ofNullable(mapper.findTestOperation(id))
                .map(MyBatisSkillLifecycleStore::operation);
    }

    @Override public List<TestOperation> listAcceptedTestOperations(int limit) {
        return mapper.listAcceptedTestOperations(limit).stream()
                .map(MyBatisSkillLifecycleStore::operation).toList();
    }

    @Override public List<TestOperation> listRunningTestOperations(int limit) {
        return mapper.listRunningTestOperations(limit).stream()
                .map(MyBatisSkillLifecycleStore::operation).toList();
    }

    @Override public int claimTestOperation(UUID id, String taskId, Instant at) {
        return mapper.claimTestOperation(id, taskId, at);
    }

    @Override public int failAcceptedTestOperation(UUID id, String safeSummary,
            String resultDigest, Instant at) {
        return mapper.failAcceptedTestOperation(id, safeSummary, resultDigest, at);
    }

    @Override public int completeTestOperation(UUID id, String taskId, String state,
            String safeSummary, String resultDigest, Instant at) {
        return mapper.completeTestOperation(id, taskId, state, safeSummary, resultDigest, at);
    }

    @Override public Optional<Submission> findSubmission(UUID id) {
        return Optional.ofNullable(mapper.findSubmission(id))
                .map(MyBatisSkillLifecycleStore::submission);
    }

    @Override public Optional<Submission> findPendingSubmission(String id) {
        return Optional.ofNullable(mapper.findPendingSubmission(id))
                .map(MyBatisSkillLifecycleStore::submission);
    }

    @Override public List<Submission> listSubmissions(String state) {
        return mapper.listSubmissions(state).stream()
                .map(MyBatisSkillLifecycleStore::submission).toList();
    }

    @Override public int insertSubmission(Submission value) {
        SkillLifecycleSubmissionEntity entity = new SkillLifecycleSubmissionEntity();
        entity.setSubmissionId(value.submissionId());
        entity.setSubmissionRevision(value.submissionRevision());
        entity.setSkillId(value.skillId());
        entity.setDraftRevision(value.draftRevision());
        entity.setCreatorSubject(value.creatorSubject());
        entity.setSemanticVersion(value.semanticVersion());
        entity.setChangeSummary(value.changeSummary());
        entity.setState(value.state());
        entity.setSubmittedAt(value.submittedAt());
        entity.setReviewedAt(value.reviewedAt());
        entity.setReviewerSummary(value.reviewerSummary());
        entity.setRejectionReason(value.rejectionReason());
        return mapper.insertSubmission(entity);
    }

    @Override public int transitionSubmission(UUID id, String expectedRevision,
            String expectedState, String state, Instant at, String reviewer, String reason,
            String revision) {
        return mapper.transitionSubmission(id, expectedRevision, expectedState, state, at,
                reviewer, reason, revision);
    }

    @Override public int insertRelease(Release value) {
        SkillLifecycleReleaseEntity entity = new SkillLifecycleReleaseEntity();
        entity.setSkillId(value.skillId());
        entity.setReleaseRevision(value.releaseRevision());
        entity.setSubmissionId(value.submissionId());
        entity.setDraftRevision(value.draftRevision());
        entity.setPackageDigest(value.packageDigest());
        entity.setSemanticVersion(value.semanticVersion());
        entity.setSourceKind(value.sourceKind());
        entity.setReleaseJson(value.releaseJson());
        entity.setPublishedAt(value.publishedAt());
        return mapper.insertRelease(entity);
    }

    @Override public Optional<Release> findRelease(String id, String revision) {
        return Optional.ofNullable(mapper.findRelease(id, revision))
                .map(MyBatisSkillLifecycleStore::release);
    }

    @Override public List<Release> listReleases() {
        return mapper.listReleases().stream().map(MyBatisSkillLifecycleStore::release).toList();
    }

    @Override public Optional<CommandReceipt> findReceipt(UUID id) {
        return Optional.ofNullable(mapper.findReceipt(id)).map(entity -> new CommandReceipt(
                entity.getCommandId(), entity.getCorrelationId(), entity.getCommandDigest(),
                entity.getResultJson(), entity.getOccurredAt()));
    }

    @Override public int insertReceipt(CommandReceipt value) {
        SkillLifecycleCommandReceiptEntity entity = new SkillLifecycleCommandReceiptEntity();
        entity.setCommandId(value.commandId());
        entity.setCorrelationId(value.correlationId());
        entity.setCommandDigest(value.commandDigest());
        entity.setResultJson(value.resultJson());
        entity.setOccurredAt(value.occurredAt());
        return mapper.insertReceipt(entity);
    }

    @Override public int insertAudit(AuditEvent value) {
        return mapper.insertAudit(value.eventId(), value.actorSummary(), value.action(),
                value.skillId(), value.objectRevision(), value.occurredAt(), value.result(),
                value.correlationId());
    }

    private static PackageBlob pack(SkillPackageBlobEntity value) {
        return new PackageBlob(value.getPackageDigest(), value.getArchiveDigest(),
                value.getManifestDigest(), value.getSkillMarkdownDigest(), value.getTechnicalName(),
                value.getFileCount(), value.getExpandedByteCount(), value.getCanonicalZipBytes(),
                value.getCreatedAt());
    }

    private static DraftRevision draft(SkillDraftRevisionEntity value) {
        return new DraftRevision(value.getSkillId(), value.getDraftRevision(),
                value.getCreatorSubject(), value.getSourceKind(), value.getPackageDigest(),
                value.getTechnicalName(), value.getDisplayTitle(), value.getMetadataJson(),
                value.getRecordDigest(), value.getCreatedAt());
    }

    private static TestFact test(SkillLifecycleTestFactEntity value) {
        return new TestFact(value.getSkillId(), value.getDraftRevision(), value.getState(),
                value.getTaskId(), value.getStartedAt(), value.getCompletedAt(),
                value.getSafeSummary(), value.getResultDigest());
    }

    private static SkillLifecycleTestOperationEntity operationEntity(TestOperation value) {
        SkillLifecycleTestOperationEntity entity = new SkillLifecycleTestOperationEntity();
        entity.setOperationId(value.operationId());
        entity.setCorrelationId(value.correlationId());
        entity.setSkillId(value.skillId());
        entity.setDraftRevision(value.draftRevision());
        entity.setSourceKind(value.sourceKind());
        entity.setState(value.state());
        entity.setTaskId(value.taskId());
        entity.setSafeSummary(value.safeSummary());
        entity.setResultDigest(value.resultDigest());
        entity.setCreatedAt(value.createdAt());
        entity.setUpdatedAt(value.updatedAt());
        return entity;
    }

    private static TestOperation operation(SkillLifecycleTestOperationEntity value) {
        return new TestOperation(value.getOperationId(), value.getCorrelationId(),
                value.getSkillId(), value.getDraftRevision(), value.getSourceKind(),
                value.getState(), value.getTaskId(),
                value.getSafeSummary(), value.getResultDigest(), value.getCreatedAt(),
                value.getUpdatedAt());
    }

    private static Submission submission(SkillLifecycleSubmissionEntity value) {
        return new Submission(value.getSubmissionId(), value.getSubmissionRevision(),
                value.getSkillId(), value.getDraftRevision(), value.getCreatorSubject(),
                value.getSemanticVersion(), value.getChangeSummary(), value.getState(),
                value.getSubmittedAt(), value.getReviewedAt(), value.getReviewerSummary(),
                value.getRejectionReason());
    }

    private static Release release(SkillLifecycleReleaseEntity value) {
        return new Release(value.getSkillId(), value.getReleaseRevision(), value.getSubmissionId(),
                value.getDraftRevision(), value.getPackageDigest(), value.getSemanticVersion(),
                value.getSourceKind(), value.getReleaseJson(), value.getPublishedAt());
    }
}
