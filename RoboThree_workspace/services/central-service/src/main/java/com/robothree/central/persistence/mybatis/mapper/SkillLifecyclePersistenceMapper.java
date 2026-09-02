package com.robothree.central.persistence.mybatis.mapper;

import com.robothree.central.persistence.mybatis.entity.SkillDraftRevisionEntity;
import com.robothree.central.persistence.mybatis.entity.SkillLifecycleCommandReceiptEntity;
import com.robothree.central.persistence.mybatis.entity.SkillLifecycleReleaseEntity;
import com.robothree.central.persistence.mybatis.entity.SkillLifecycleSubmissionEntity;
import com.robothree.central.persistence.mybatis.entity.SkillLifecycleTestFactEntity;
import com.robothree.central.persistence.mybatis.entity.SkillLifecycleTestOperationEntity;
import com.robothree.central.persistence.mybatis.entity.SkillPackageBlobEntity;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface SkillLifecyclePersistenceMapper {
    @Insert("""
            INSERT INTO skill_package_blobs (package_digest, archive_digest, manifest_digest,
                skill_markdown_digest, technical_name, file_count, expanded_byte_count,
                canonical_zip_bytes, created_at)
            VALUES (#{packageDigest}, #{archiveDigest}, #{manifestDigest}, #{skillMarkdownDigest},
                #{technicalName}, #{fileCount}, #{expandedByteCount}, #{canonicalZipBytes},
                #{createdAt}) ON CONFLICT DO NOTHING
            """)
    int insertPackage(SkillPackageBlobEntity value);

    @Select("""
            SELECT package_digest, archive_digest, manifest_digest, skill_markdown_digest,
                technical_name, file_count, expanded_byte_count, canonical_zip_bytes, created_at
            FROM skill_package_blobs WHERE package_digest = #{packageDigest}
            """)
    SkillPackageBlobEntity findPackage(String packageDigest);

    @Insert("""
            INSERT INTO skill_draft_revisions (skill_id, draft_revision, creator_subject,
                source_kind, package_digest, technical_name, display_title, metadata_json,
                record_digest, created_at)
            VALUES (#{skillId}, #{draftRevision}, #{creatorSubject}, #{sourceKind},
                #{packageDigest}, #{technicalName}, #{displayTitle}, #{metadataJson},
                #{recordDigest}, #{createdAt}) ON CONFLICT DO NOTHING
            """)
    int insertDraftRevision(SkillDraftRevisionEntity value);

    @Insert("""
            INSERT INTO skill_drafts (skill_id, draft_revision, updated_at)
            VALUES (#{skillId}, #{draftRevision}, #{updatedAt}) ON CONFLICT DO NOTHING
            """)
    int createDraftHead(String skillId, String draftRevision, Instant updatedAt);

    @Update("""
            UPDATE skill_drafts SET draft_revision = #{draftRevision}, updated_at = #{updatedAt}
            WHERE skill_id = #{skillId} AND draft_revision = #{expectedRevision}
            """)
    int advanceDraftHead(String skillId, String expectedRevision, String draftRevision,
            Instant updatedAt);

    @Select("""
            SELECT revision.skill_id, revision.draft_revision, revision.creator_subject,
                revision.source_kind, revision.package_digest, revision.technical_name,
                revision.display_title, revision.metadata_json, revision.record_digest,
                revision.created_at
            FROM skill_drafts head JOIN skill_draft_revisions revision
              ON revision.skill_id = head.skill_id
             AND revision.draft_revision = head.draft_revision
            WHERE head.skill_id = #{skillId}
            """)
    SkillDraftRevisionEntity findCurrentDraft(String skillId);

    @Select("""
            SELECT skill_id, draft_revision, creator_subject, source_kind, package_digest,
                technical_name, display_title, metadata_json, record_digest, created_at
            FROM skill_draft_revisions
            WHERE skill_id = #{skillId} AND draft_revision = #{draftRevision}
            """)
    SkillDraftRevisionEntity findDraftRevision(String skillId, String draftRevision);

    @Select("""
            SELECT revision.skill_id, revision.draft_revision, revision.creator_subject,
                revision.source_kind, revision.package_digest, revision.technical_name,
                revision.display_title, revision.metadata_json, revision.record_digest,
                revision.created_at
            FROM skill_drafts head JOIN skill_draft_revisions revision
              ON revision.skill_id = head.skill_id
             AND revision.draft_revision = head.draft_revision
            WHERE revision.creator_subject = #{creatorSubject}
              AND revision.source_kind = #{sourceKind}
            ORDER BY head.updated_at DESC, head.skill_id
            """)
    List<SkillDraftRevisionEntity> listCurrentDrafts(String creatorSubject, String sourceKind);

    @Select("""
            SELECT skill_id, draft_revision, state, task_id, started_at, completed_at,
                safe_summary, result_digest
            FROM skill_test_facts WHERE skill_id = #{skillId} AND draft_revision = #{draftRevision}
            """)
    SkillLifecycleTestFactEntity findTestFact(String skillId, String draftRevision);

    @Insert("""
            INSERT INTO skill_test_facts (skill_id, draft_revision, state, task_id, started_at,
                completed_at, safe_summary, result_digest)
            VALUES (#{skillId}, #{draftRevision}, #{state}, #{taskId}, #{startedAt},
                #{completedAt}, #{safeSummary}, #{resultDigest})
            ON CONFLICT (skill_id, draft_revision) DO UPDATE SET
                state = EXCLUDED.state, task_id = EXCLUDED.task_id,
                started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at,
                safe_summary = EXCLUDED.safe_summary, result_digest = EXCLUDED.result_digest
            """)
    int upsertTestFact(SkillLifecycleTestFactEntity value);

    @Insert("""
            INSERT INTO skill_test_operations (operation_id, correlation_id, skill_id,
                draft_revision, source_kind, state, task_id, safe_summary,
                result_digest, created_at, updated_at)
            VALUES (#{operationId}, #{correlationId}, #{skillId}, #{draftRevision}, #{sourceKind},
                #{state}, #{taskId}, #{safeSummary}, #{resultDigest},
                #{createdAt}, #{updatedAt}) ON CONFLICT DO NOTHING
            """)
    int insertTestOperation(SkillLifecycleTestOperationEntity value);

    @Select("""
            SELECT operation_id, correlation_id, skill_id, draft_revision, source_kind,
                state, task_id, safe_summary, result_digest, created_at, updated_at
            FROM skill_test_operations WHERE operation_id = #{operationId}
            """)
    SkillLifecycleTestOperationEntity findTestOperation(UUID operationId);

    @Select("""
            SELECT operation_id, correlation_id, skill_id, draft_revision, source_kind,
                state, task_id, safe_summary, result_digest, created_at, updated_at
            FROM skill_test_operations WHERE state = 'accepted'
            ORDER BY created_at, operation_id LIMIT #{limit}
            """)
    List<SkillLifecycleTestOperationEntity> listAcceptedTestOperations(int limit);

    @Select("""
            SELECT operation_id, correlation_id, skill_id, draft_revision, source_kind,
                state, task_id, safe_summary, result_digest, created_at, updated_at
            FROM skill_test_operations WHERE state = 'running' AND task_id IS NOT NULL
            ORDER BY updated_at, operation_id LIMIT #{limit}
            """)
    List<SkillLifecycleTestOperationEntity> listRunningTestOperations(int limit);

    @Update("""
            UPDATE skill_test_operations SET state = 'running', task_id = #{taskId},
                updated_at = #{updatedAt}
            WHERE operation_id = #{operationId} AND state = 'accepted' AND task_id IS NULL
            """)
    int claimTestOperation(UUID operationId, String taskId, Instant updatedAt);

    @Update("""
            UPDATE skill_test_operations SET state = 'failed', safe_summary = #{safeSummary},
                result_digest = #{resultDigest}, updated_at = #{updatedAt}
            WHERE operation_id = #{operationId} AND state = 'accepted' AND task_id IS NULL
            """)
    int failAcceptedTestOperation(UUID operationId, String safeSummary,
            String resultDigest, Instant updatedAt);

    @Update("""
            UPDATE skill_test_operations SET state = #{state}, safe_summary = #{safeSummary},
                result_digest = #{resultDigest}, updated_at = #{updatedAt}
            WHERE operation_id = #{operationId} AND state = 'running'
              AND task_id = #{expectedTaskId}
            """)
    int completeTestOperation(UUID operationId, String expectedTaskId, String state,
            String safeSummary, String resultDigest, Instant updatedAt);

    @Select("""
            SELECT submission_id, submission_revision, skill_id, draft_revision,
                creator_subject, semantic_version, change_summary, state, submitted_at,
                reviewed_at, reviewer_summary, rejection_reason
            FROM skill_submissions WHERE submission_id = #{submissionId}
            """)
    SkillLifecycleSubmissionEntity findSubmission(UUID submissionId);

    @Select("""
            SELECT submission_id, submission_revision, skill_id, draft_revision,
                creator_subject, semantic_version, change_summary, state, submitted_at,
                reviewed_at, reviewer_summary, rejection_reason
            FROM skill_submissions WHERE skill_id = #{skillId} AND state = 'pending_review'
            """)
    SkillLifecycleSubmissionEntity findPendingSubmission(String skillId);

    @Select("""
            <script>
            SELECT submission_id, submission_revision, skill_id, draft_revision,
                creator_subject, semantic_version, change_summary, state, submitted_at,
                reviewed_at, reviewer_summary, rejection_reason
            FROM skill_submissions
            <if test='state != null'>WHERE state = #{state}</if>
            ORDER BY submitted_at DESC, submission_id DESC LIMIT 100
            </script>
            """)
    List<SkillLifecycleSubmissionEntity> listSubmissions(@Param("state") String state);

    @Insert("""
            INSERT INTO skill_submissions (submission_id, submission_revision, skill_id,
                draft_revision, creator_subject, semantic_version, change_summary, state,
                submitted_at, reviewed_at, reviewer_summary, rejection_reason)
            VALUES (#{submissionId}, #{submissionRevision}, #{skillId}, #{draftRevision},
                #{creatorSubject}, #{semanticVersion}, #{changeSummary}, #{state}, #{submittedAt},
                #{reviewedAt}, #{reviewerSummary}, #{rejectionReason}) ON CONFLICT DO NOTHING
            """)
    int insertSubmission(SkillLifecycleSubmissionEntity value);

    @Update("""
            UPDATE skill_submissions SET state = #{state}, reviewed_at = #{reviewedAt},
                reviewer_summary = #{reviewerSummary}, rejection_reason = #{rejectionReason},
                submission_revision = #{submissionRevision}
            WHERE submission_id = #{submissionId}
              AND submission_revision = #{expectedRevision} AND state = #{expectedState}
            """)
    int transitionSubmission(UUID submissionId, String expectedRevision, String expectedState,
            String state, Instant reviewedAt, String reviewerSummary, String rejectionReason,
            String submissionRevision);

    @Insert("""
            INSERT INTO skill_releases (skill_id, release_revision, submission_id,
                draft_revision, package_digest, semantic_version, source_kind, release_json,
                published_at)
            VALUES (#{skillId}, #{releaseRevision}, #{submissionId}, #{draftRevision},
                #{packageDigest}, #{semanticVersion}, #{sourceKind}, #{releaseJson}, #{publishedAt})
            ON CONFLICT DO NOTHING
            """)
    int insertRelease(SkillLifecycleReleaseEntity value);

    @Select("""
            SELECT skill_id, release_revision, submission_id, draft_revision, package_digest,
                semantic_version, source_kind, release_json, published_at
            FROM skill_releases WHERE skill_id = #{skillId} AND release_revision = #{releaseRevision}
            """)
    SkillLifecycleReleaseEntity findRelease(String skillId, String releaseRevision);

    @Select("""
            SELECT skill_id, release_revision, submission_id, draft_revision, package_digest,
                semantic_version, source_kind, release_json, published_at
            FROM skill_releases ORDER BY published_at DESC, skill_id
            """)
    List<SkillLifecycleReleaseEntity> listReleases();

    @Select("""
            SELECT command_id, correlation_id, command_digest, result_json, occurred_at
            FROM skill_lifecycle_command_receipts WHERE command_id = #{commandId}
            """)
    SkillLifecycleCommandReceiptEntity findReceipt(UUID commandId);

    @Insert("""
            INSERT INTO skill_lifecycle_command_receipts
                (command_id, correlation_id, command_digest, result_json, occurred_at)
            VALUES (#{commandId}, #{correlationId}, #{commandDigest}, #{resultJson}, #{occurredAt})
            ON CONFLICT DO NOTHING
            """)
    int insertReceipt(SkillLifecycleCommandReceiptEntity value);

    @Insert("""
            INSERT INTO skill_audit_events (event_id, actor_summary, action, skill_id,
                object_revision, occurred_at, result, correlation_id)
            VALUES (#{eventId}, #{actorSummary}, #{action}, #{skillId}, #{objectRevision},
                #{occurredAt}, #{result}, #{correlationId})
            """)
    int insertAudit(UUID eventId, String actorSummary, String action, String skillId,
            String objectRevision, Instant occurredAt, String result, UUID correlationId);
}
