package com.robothree.central.persistence.mybatis.adapter;

import com.robothree.central.agentlifecycle.application.AgentLifecycleStore;
import com.robothree.central.persistence.mybatis.entity.AgentLifecycleCommandReceiptEntity;
import com.robothree.central.persistence.mybatis.entity.AgentLifecycleReleaseEntity;
import com.robothree.central.persistence.mybatis.entity.AgentLifecycleSubmissionEntity;
import com.robothree.central.persistence.mybatis.entity.AgentLifecycleTestFactEntity;
import com.robothree.central.persistence.mybatis.mapper.AgentLifecyclePersistenceMapper;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class MyBatisAgentLifecycleStore implements AgentLifecycleStore {
    private final AgentLifecyclePersistenceMapper mapper;
    public MyBatisAgentLifecycleStore(AgentLifecyclePersistenceMapper mapper) { this.mapper = mapper; }

    @Override public Optional<String> findCurrentDraftJson(String robotId, String creator) {
        return Optional.ofNullable(mapper.findCurrentDraftJson(robotId, creator));
    }
    @Override public Optional<String> findDraftRevisionJson(String robotId, String revision) {
        return Optional.ofNullable(mapper.findDraftRevisionJson(robotId, revision));
    }
    @Override public List<String> listCurrentDraftJson(String creator) {
        return mapper.listCurrentDraftJson(creator);
    }
    @Override public int insertDraftRevision(DraftRevision v) {
        return mapper.insertDraftRevision(v.robotId(), v.draftRevision(), v.instructionRevision(),
                v.creatorSubject(), v.displayName(), v.recordJson(), v.recordDigest(), v.createdAt());
    }
    @Override public int createDraftHead(String id, String revision, Instant at) {
        return mapper.createDraftHead(id, revision, at);
    }
    @Override public int advanceDraftHead(String id, String expected, String revision, Instant at) {
        return mapper.advanceDraftHead(id, expected, revision, at);
    }
    @Override public int insertAvatarAsset(AvatarAsset v) {
        return mapper.insertAvatarAsset(v.assetId(), v.creatorSubject(), v.mediaType(),
                v.contentDigest(), v.width(), v.height(), v.contentBytes(), v.createdAt());
    }
    @Override public Optional<TestFact> findTestFact(String id, String revision) {
        return Optional.ofNullable(mapper.findTestFact(id, revision)).map(MyBatisAgentLifecycleStore::test);
    }
    @Override public int upsertTestFact(TestFact v) {
        return mapper.upsertTestFact(v.robotId(), v.draftRevision(), v.state(), v.taskId(),
                v.testedAt(), v.safeReason());
    }
    @Override public Optional<Submission> findSubmission(UUID id) {
        return Optional.ofNullable(mapper.findSubmission(id)).map(MyBatisAgentLifecycleStore::submission);
    }
    @Override public Optional<Submission> findPendingSubmission(String id) {
        return Optional.ofNullable(mapper.findPendingSubmission(id)).map(MyBatisAgentLifecycleStore::submission);
    }
    @Override public Optional<Submission> findLatestSubmission(String id) {
        return Optional.ofNullable(mapper.findLatestSubmission(id)).map(MyBatisAgentLifecycleStore::submission);
    }
    @Override public List<Submission> listSubmissions(String state) {
        return mapper.listSubmissions(state).stream().map(MyBatisAgentLifecycleStore::submission).toList();
    }
    @Override public int insertSubmission(Submission v) {
        AgentLifecycleSubmissionEntity e = new AgentLifecycleSubmissionEntity();
        e.setSubmissionId(v.submissionId()); e.setSubmissionRevision(v.submissionRevision());
        e.setRobotId(v.robotId()); e.setDraftRevision(v.draftRevision());
        e.setCreatorSubject(v.creatorSubject()); e.setState(v.state());
        e.setPackageJson(v.packageJson()); e.setPackageDigest(v.packageDigest());
        e.setSubmittedAt(v.submittedAt()); e.setReviewedAt(v.reviewedAt());
        e.setReviewerSummary(v.reviewerSummary()); e.setRejectionReason(v.rejectionReason());
        return mapper.insertSubmission(e);
    }
    @Override public int transitionSubmission(UUID id, String expectedRevision,
            String expectedState, String state, Instant at, String reviewer, String reason,
            String revision) {
        return mapper.transitionSubmission(id, expectedRevision, expectedState, state, at,
                reviewer, reason, revision);
    }
    @Override public int insertRelease(Release v) {
        AgentLifecycleReleaseEntity e = new AgentLifecycleReleaseEntity();
        e.setRobotId(v.robotId()); e.setReleaseRevision(v.releaseRevision());
        e.setSubmissionId(v.submissionId()); e.setPackageDigest(v.packageDigest());
        e.setAgentDefinitionJson(v.agentDefinitionJson()); e.setPublishedAt(v.publishedAt());
        return mapper.insertRelease(e);
    }
    @Override public List<Release> listReleases() {
        return mapper.listReleases().stream().map(MyBatisAgentLifecycleStore::release).toList();
    }
    @Override public Optional<CommandReceipt> findReceipt(UUID id) {
        return Optional.ofNullable(mapper.findReceipt(id)).map(e -> new CommandReceipt(
                e.getCommandId(), e.getCorrelationId(), e.getCommandDigest(), e.getResultJson(),
                e.getOccurredAt()));
    }
    @Override public int insertReceipt(CommandReceipt v) {
        AgentLifecycleCommandReceiptEntity e = new AgentLifecycleCommandReceiptEntity();
        e.setCommandId(v.commandId()); e.setCorrelationId(v.correlationId());
        e.setCommandDigest(v.commandDigest()); e.setResultJson(v.resultJson());
        e.setOccurredAt(v.occurredAt()); return mapper.insertReceipt(e);
    }
    @Override public int insertAudit(AuditEvent v) {
        return mapper.insertAudit(v.eventId(), v.actorSummary(), v.action(), v.robotId(),
                v.objectRevision(), v.occurredAt(), v.result(), v.correlationId());
    }

    private static TestFact test(AgentLifecycleTestFactEntity e) {
        return new TestFact(e.getRobotId(), e.getDraftRevision(), e.getState(), e.getTaskId(),
                e.getTestedAt(), e.getSafeReason());
    }
    private static Submission submission(AgentLifecycleSubmissionEntity e) {
        return new Submission(e.getSubmissionId(), e.getSubmissionRevision(), e.getRobotId(),
                e.getDraftRevision(), e.getCreatorSubject(), e.getState(), e.getPackageJson(),
                e.getPackageDigest(), e.getSubmittedAt(), e.getReviewedAt(),
                e.getReviewerSummary(), e.getRejectionReason());
    }
    private static Release release(AgentLifecycleReleaseEntity e) {
        return new Release(e.getRobotId(), e.getReleaseRevision(), e.getSubmissionId(),
                e.getPackageDigest(), e.getAgentDefinitionJson(), e.getPublishedAt());
    }
}
