package com.robothree.central.persistence.mybatis.mapper;

import com.robothree.central.persistence.mybatis.entity.AdminModelCommandReceiptEntity;
import com.robothree.central.persistence.mybatis.entity.AdminModelCredentialEntity;
import com.robothree.central.persistence.mybatis.entity.AdminModelDefaultEntity;
import com.robothree.central.persistence.mybatis.entity.AdminModelAuditEntity;
import com.robothree.central.persistence.mybatis.entity.AdminModelGatewayBindingEntity;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface AdminModelPersistenceMapper {

    @Select("""
            SELECT revision.record_json
              FROM admin_model_head head
              JOIN admin_model_revision revision
                ON revision.model_id = head.model_id
               AND revision.model_revision = head.model_revision
             WHERE head.model_id = #{modelId}
            """)
    String findCurrentJson(String modelId);

    @Select("""
            SELECT record_json
              FROM admin_model_revision
             WHERE model_id = #{modelId} AND model_revision = #{modelRevision}
            """)
    String findRevisionJson(
            @Param("modelId") String modelId,
            @Param("modelRevision") String modelRevision);

    @Select("""
            SELECT revision.record_json
              FROM admin_model_head head
              JOIN admin_model_revision revision
                ON revision.model_id = head.model_id
               AND revision.model_revision = head.model_revision
             ORDER BY revision.display_name, revision.model_id
            """)
    List<String> listCurrentJson();

    @Insert("""
            INSERT INTO admin_model_revision (
                model_id, model_revision, display_name, record_json, record_digest, created_at)
            VALUES (#{modelId}, #{modelRevision}, #{displayName}, #{recordJson},
                    #{recordDigest}, #{createdAt})
            ON CONFLICT DO NOTHING
            """)
    int insertRevision(
            @Param("modelId") String modelId,
            @Param("modelRevision") String modelRevision,
            @Param("displayName") String displayName,
            @Param("recordJson") String recordJson,
            @Param("recordDigest") String recordDigest,
            @Param("createdAt") Instant createdAt);

    @Insert("""
            INSERT INTO admin_model_head (model_id, model_revision, updated_at)
            VALUES (#{modelId}, #{modelRevision}, #{updatedAt})
            ON CONFLICT DO NOTHING
            """)
    int createHead(String modelId, String modelRevision, Instant updatedAt);

    @Update("""
            UPDATE admin_model_head
               SET model_revision = #{modelRevision}, updated_at = #{updatedAt}
             WHERE model_id = #{modelId} AND model_revision = #{expectedRevision}
            """)
    int advanceHead(String modelId, String expectedRevision, String modelRevision, Instant updatedAt);

    @Select("SELECT model_id, model_revision FROM admin_model_default WHERE singleton = TRUE")
    AdminModelDefaultEntity findDefault();

    @Insert("""
            INSERT INTO admin_model_default (singleton, model_id, model_revision, updated_at)
            SELECT TRUE, #{modelId}, #{modelRevision}, #{updatedAt}
             WHERE (#{expectedModelId} IS NULL
                    AND NOT EXISTS (SELECT 1 FROM admin_model_default WHERE singleton = TRUE))
                OR (#{expectedModelId} IS NOT NULL
                    AND EXISTS (SELECT 1 FROM admin_model_default
                                 WHERE singleton = TRUE
                                   AND model_id = #{expectedModelId}
                                   AND model_revision = #{expectedModelRevision}))
            ON CONFLICT (singleton) DO UPDATE
                SET model_id = EXCLUDED.model_id,
                    model_revision = EXCLUDED.model_revision,
                    updated_at = EXCLUDED.updated_at
              WHERE admin_model_default.model_id = #{expectedModelId}
                AND admin_model_default.model_revision = #{expectedModelRevision}
            """)
    int replaceDefault(String expectedModelId, String expectedModelRevision,
            String modelId, String modelRevision, Instant updatedAt);

    @org.apache.ibatis.annotations.Delete("""
            DELETE FROM admin_model_default
             WHERE singleton = TRUE AND model_id = #{expectedModelId}
               AND model_revision = #{expectedModelRevision}
            """)
    int clearDefault(String expectedModelId, String expectedModelRevision);

    @Insert("""
            INSERT INTO admin_model_credential (
                credential_reference, model_id, credential_revision, key_id,
                nonce, ciphertext, created_at)
            VALUES (#{credentialReference}, #{modelId}, #{credentialRevision}, #{keyId},
                    #{nonce}, #{ciphertext}, #{createdAt})
            ON CONFLICT DO NOTHING
            """)
    int insertCredential(AdminModelCredentialEntity credential);

    @Select("""
            SELECT credential_reference, model_id, credential_revision, key_id,
                   nonce, ciphertext, created_at
              FROM admin_model_credential
             WHERE credential_reference = #{credentialReference}
               AND credential_revision = #{credentialRevision}
            """)
    AdminModelCredentialEntity findCredential(String credentialReference, String credentialRevision);

    @Select("""
            SELECT command_id, correlation_id, command_digest, result_json, occurred_at
              FROM admin_model_command_receipt WHERE command_id = #{commandId}
            """)
    AdminModelCommandReceiptEntity findReceipt(UUID commandId);

    @Insert("""
            INSERT INTO admin_model_command_receipt (
                command_id, correlation_id, command_digest, result_json, occurred_at)
            VALUES (#{commandId}, #{correlationId}, #{commandDigest}, #{resultJson}, #{occurredAt})
            ON CONFLICT DO NOTHING
            """)
    int insertReceipt(AdminModelCommandReceiptEntity receipt);

    @Insert("""
            INSERT INTO admin_model_audit (
                event_id, actor_summary, action, model_id, model_revision,
                changed_field_names, occurred_at, result, correlation_id)
            VALUES (#{eventId}, #{actorSummary}, #{action}, #{modelId}, #{modelRevision},
                    #{changedFieldNames,jdbcType=ARRAY,typeHandler=com.robothree.central.persistence.mybatis.typehandler.PostgresTextArrayTypeHandler},
                    #{occurredAt}, #{result}, #{correlationId})
            """)
    int insertAudit(
            UUID eventId, String actorSummary, String action, String modelId,
            String modelRevision, List<String> changedFieldNames, Instant occurredAt,
            String result, UUID correlationId);

    @Select("""
            SELECT event_id, actor_summary, action, model_id, model_revision,
                   changed_field_names, occurred_at, result, correlation_id
              FROM admin_model_audit
             ORDER BY occurred_at DESC, event_id
             LIMIT #{limit}
            """)
    @org.apache.ibatis.annotations.Results({
        @org.apache.ibatis.annotations.Result(
                column = "changed_field_names",
                property = "changedFieldNames",
                typeHandler = com.robothree.central.persistence.mybatis.typehandler.PostgresTextArrayTypeHandler.class)
    })
    List<AdminModelAuditEntity> listAudit(@Param("limit") int limit);

    @Insert("""
            INSERT INTO admin_model_gateway_binding (
                decision_digest, binding_revision, binding_digest, binding_json, created_at)
            VALUES (#{decisionDigest}, #{bindingRevision}, #{bindingDigest},
                    #{bindingJson}, #{createdAt})
            ON CONFLICT DO NOTHING
            """)
    int insertGatewayBinding(AdminModelGatewayBindingEntity binding);

    @Select("""
            SELECT decision_digest, binding_revision, binding_digest, binding_json, created_at
              FROM admin_model_gateway_binding
             WHERE decision_digest = #{decisionDigest}
            """)
    AdminModelGatewayBindingEntity findGatewayBinding(
            @Param("decisionDigest") String decisionDigest);

    @Select("""
            SELECT decision_digest, binding_revision, binding_digest, binding_json, created_at
              FROM admin_model_gateway_binding
             WHERE binding_revision = #{bindingRevision}
               AND binding_digest = #{bindingDigest}
            """)
    AdminModelGatewayBindingEntity findGatewayBindingByReference(
            @Param("bindingRevision") String bindingRevision,
            @Param("bindingDigest") String bindingDigest);
}
