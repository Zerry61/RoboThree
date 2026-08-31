package com.robothree.central.admincontrol.application;

import com.robothree.central.admincontrol.domain.AdminManagedModel;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AdminModelStore {

    Optional<AdminManagedModel> findCurrent(String modelId);

    Optional<AdminManagedModel> findRevision(String modelId, String modelRevision);

    List<AdminManagedModel> listCurrent();

    int insertRevision(AdminManagedModel model, String recordJson, String recordDigest);

    int createHead(String modelId, String modelRevision, Instant updatedAt);

    int advanceHead(String modelId, String expectedRevision, String modelRevision, Instant updatedAt);

    Optional<DefaultSelection> findDefault();

    int replaceDefault(
            String expectedModelId,
            String expectedModelRevision,
            String modelId,
            String modelRevision,
            Instant updatedAt);

    int clearDefault(String expectedModelId, String expectedModelRevision);

    int insertCredential(EncryptedCredential credential);

    Optional<EncryptedCredential> findCredential(String credentialReference, String credentialRevision);

    Optional<CommandReceipt> findReceipt(UUID commandId);

    int insertReceipt(CommandReceipt receipt);

    int insertAudit(AuditEvent event);

    List<AuditEvent> listAudit(int limit);

    int insertGatewayBinding(GatewayBinding binding);

    Optional<GatewayBinding> findGatewayBinding(String decisionDigest);

    Optional<GatewayBinding> findGatewayBindingByReference(
            String bindingRevision, String bindingDigest);

    record DefaultSelection(String modelId, String modelRevision) {}

    record EncryptedCredential(
            String credentialReference,
            String modelId,
            String credentialRevision,
            String keyId,
            byte[] nonce,
            byte[] ciphertext,
            Instant createdAt) {
        public EncryptedCredential {
            nonce = nonce.clone();
            ciphertext = ciphertext.clone();
        }
        @Override public byte[] nonce() { return nonce.clone(); }
        @Override public byte[] ciphertext() { return ciphertext.clone(); }
    }

    record CommandReceipt(
            UUID commandId,
            UUID correlationId,
            String commandDigest,
            String resultJson,
            Instant occurredAt) {}

    record GatewayBinding(
            String decisionDigest,
            String bindingRevision,
            String bindingDigest,
            String bindingJson,
            Instant createdAt) {}

    record AuditEvent(
            UUID eventId,
            String actorSummary,
            String action,
            String modelId,
            String modelRevision,
            List<String> changedFieldNames,
            Instant occurredAt,
            String result,
            UUID correlationId) {
        public AuditEvent {
            changedFieldNames = List.copyOf(changedFieldNames);
        }
    }
}
