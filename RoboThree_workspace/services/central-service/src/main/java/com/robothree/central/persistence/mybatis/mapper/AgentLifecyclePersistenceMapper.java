package com.robothree.central.persistence.mybatis.mapper;

import com.robothree.central.persistence.mybatis.entity.AgentLifecycleCommandReceiptEntity;
import com.robothree.central.persistence.mybatis.entity.AgentLifecycleReleaseEntity;
import com.robothree.central.persistence.mybatis.entity.AgentLifecycleSubmissionEntity;
import com.robothree.central.persistence.mybatis.entity.AgentLifecycleTestFactEntity;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface AgentLifecyclePersistenceMapper {
    @Select("""
            SELECT revision.record_json FROM robot_draft_head head
            JOIN robot_draft_revision revision ON revision.robot_id = head.robot_id
             AND revision.draft_revision = head.draft_revision
            WHERE head.robot_id = #{robotId} AND revision.creator_subject = #{creatorSubject}
            """)
    String findCurrentDraftJson(String robotId, String creatorSubject);

    @Select("""
            SELECT record_json FROM robot_draft_revision
            WHERE robot_id = #{robotId} AND draft_revision = #{draftRevision}
            """)
    String findDraftRevisionJson(String robotId, String draftRevision);

    @Select("""
            SELECT revision.record_json FROM robot_draft_head head
            JOIN robot_draft_revision revision ON revision.robot_id = head.robot_id
             AND revision.draft_revision = head.draft_revision
            WHERE revision.creator_subject = #{creatorSubject}
            ORDER BY revision.created_at DESC, revision.robot_id
            """)
    List<String> listCurrentDraftJson(String creatorSubject);

    @Insert("""
            INSERT INTO robot_draft_revision (robot_id, draft_revision, instruction_revision,
                creator_subject, display_name, record_json, record_digest, created_at)
            VALUES (#{robotId}, #{draftRevision}, #{instructionRevision}, #{creatorSubject},
                #{displayName}, #{recordJson}, #{recordDigest}, #{createdAt})
            ON CONFLICT DO NOTHING
            """)
    int insertDraftRevision(String robotId, String draftRevision, String instructionRevision,
            String creatorSubject, String displayName, String recordJson, String recordDigest,
            Instant createdAt);

    @Insert("""
            INSERT INTO robot_draft_head (robot_id, draft_revision, updated_at)
            VALUES (#{robotId}, #{draftRevision}, #{updatedAt}) ON CONFLICT DO NOTHING
            """)
    int createDraftHead(String robotId, String draftRevision, Instant updatedAt);

    @Update("""
            UPDATE robot_draft_head SET draft_revision = #{draftRevision}, updated_at = #{updatedAt}
            WHERE robot_id = #{robotId} AND draft_revision = #{expectedRevision}
            """)
    int advanceDraftHead(String robotId, String expectedRevision, String draftRevision,
            Instant updatedAt);

    @Insert("""
            INSERT INTO robot_avatar_asset (asset_id, creator_subject, media_type, content_digest,
                width, height, content_bytes, created_at)
            VALUES (#{assetId}, #{creatorSubject}, #{mediaType}, #{contentDigest},
                #{width}, #{height}, #{contentBytes}, #{createdAt})
            ON CONFLICT (content_digest) DO NOTHING
            """)
    int insertAvatarAsset(String assetId, String creatorSubject, String mediaType,
            String contentDigest, int width, int height, byte[] contentBytes, Instant createdAt);

    @Select("""
            SELECT robot_id, draft_revision, state, task_id, tested_at, safe_reason
            FROM robot_test_fact WHERE robot_id = #{robotId} AND draft_revision = #{draftRevision}
            """)
    AgentLifecycleTestFactEntity findTestFact(String robotId, String draftRevision);

    @Insert("""
            INSERT INTO robot_test_fact (robot_id, draft_revision, state, task_id, tested_at, safe_reason)
            VALUES (#{robotId}, #{draftRevision}, #{state}, #{taskId}, #{testedAt}, #{safeReason})
            ON CONFLICT (robot_id, draft_revision) DO UPDATE SET
                state = EXCLUDED.state, task_id = EXCLUDED.task_id,
                tested_at = EXCLUDED.tested_at, safe_reason = EXCLUDED.safe_reason
            """)
    int upsertTestFact(String robotId, String draftRevision, String state, String taskId,
            Instant testedAt, String safeReason);

    @Select("""
            SELECT submission_id, submission_revision, robot_id, draft_revision,
                creator_subject, state, package_json, package_digest, submitted_at,
                reviewed_at, reviewer_summary, rejection_reason
            FROM robot_submission WHERE submission_id = #{submissionId}
            """)
    AgentLifecycleSubmissionEntity findSubmission(UUID submissionId);

    @Select("""
            SELECT submission_id, submission_revision, robot_id, draft_revision,
                creator_subject, state, package_json, package_digest, submitted_at,
                reviewed_at, reviewer_summary, rejection_reason
            FROM robot_submission WHERE robot_id = #{robotId} AND state = 'pending_review'
            """)
    AgentLifecycleSubmissionEntity findPendingSubmission(String robotId);

    @Select("""
            SELECT submission_id, submission_revision, robot_id, draft_revision,
                creator_subject, state, package_json, package_digest, submitted_at,
                reviewed_at, reviewer_summary, rejection_reason
            FROM robot_submission WHERE robot_id = #{robotId}
            ORDER BY submitted_at DESC, submission_id DESC LIMIT 1
            """)
    AgentLifecycleSubmissionEntity findLatestSubmission(String robotId);

    @Select("""
            <script>
            SELECT submission_id, submission_revision, robot_id, draft_revision,
                creator_subject, state, package_json, package_digest, submitted_at,
                reviewed_at, reviewer_summary, rejection_reason
            FROM robot_submission
            <if test='state != null'>WHERE state = #{state}</if>
            ORDER BY submitted_at DESC, submission_id DESC LIMIT 100
            </script>
            """)
    List<AgentLifecycleSubmissionEntity> listSubmissions(@Param("state") String state);

    @Insert("""
            INSERT INTO robot_submission (submission_id, submission_revision, robot_id,
                draft_revision, creator_subject, state, package_json, package_digest,
                submitted_at, reviewed_at, reviewer_summary, rejection_reason)
            VALUES (#{submissionId}, #{submissionRevision}, #{robotId}, #{draftRevision},
                #{creatorSubject}, #{state}, #{packageJson}, #{packageDigest}, #{submittedAt},
                #{reviewedAt}, #{reviewerSummary}, #{rejectionReason})
            ON CONFLICT DO NOTHING
            """)
    int insertSubmission(AgentLifecycleSubmissionEntity value);

    @Update("""
            UPDATE robot_submission SET state = #{state}, reviewed_at = #{reviewedAt},
                reviewer_summary = #{reviewerSummary}, rejection_reason = #{rejectionReason},
                submission_revision = #{submissionRevision}
            WHERE submission_id = #{submissionId} AND submission_revision = #{expectedRevision}
                AND state = #{expectedState}
            """)
    int transitionSubmission(UUID submissionId, String expectedRevision, String expectedState,
            String state, Instant reviewedAt, String reviewerSummary, String rejectionReason,
            String submissionRevision);

    @Insert("""
            INSERT INTO robot_release (robot_id, release_revision, submission_id,
                package_digest, agent_definition_json, published_at)
            VALUES (#{robotId}, #{releaseRevision}, #{submissionId}, #{packageDigest},
                #{agentDefinitionJson}, #{publishedAt}) ON CONFLICT DO NOTHING
            """)
    int insertRelease(AgentLifecycleReleaseEntity value);

    @Select("""
            SELECT robot_id, release_revision, submission_id, package_digest,
                agent_definition_json, published_at FROM robot_release
            ORDER BY published_at DESC, robot_id
            """)
    List<AgentLifecycleReleaseEntity> listReleases();

    @Select("""
            SELECT command_id, correlation_id, command_digest, result_json, occurred_at
            FROM robot_lifecycle_command_receipt WHERE command_id = #{commandId}
            """)
    AgentLifecycleCommandReceiptEntity findReceipt(UUID commandId);

    @Insert("""
            INSERT INTO robot_lifecycle_command_receipt
                (command_id, correlation_id, command_digest, result_json, occurred_at)
            VALUES (#{commandId}, #{correlationId}, #{commandDigest}, #{resultJson}, #{occurredAt})
            ON CONFLICT DO NOTHING
            """)
    int insertReceipt(AgentLifecycleCommandReceiptEntity value);

    @Insert("""
            INSERT INTO robot_lifecycle_audit (event_id, actor_summary, action, robot_id,
                object_revision, occurred_at, result, correlation_id)
            VALUES (#{eventId}, #{actorSummary}, #{action}, #{robotId}, #{objectRevision},
                #{occurredAt}, #{result}, #{correlationId})
            """)
    int insertAudit(UUID eventId, String actorSummary, String action, String robotId,
            String objectRevision, Instant occurredAt, String result, UUID correlationId);
}
