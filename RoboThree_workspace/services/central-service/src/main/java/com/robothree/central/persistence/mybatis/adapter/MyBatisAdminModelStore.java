package com.robothree.central.persistence.mybatis.adapter;

import com.robothree.central.admincontrol.application.AdminModelCommandService;
import com.robothree.central.admincontrol.application.AdminModelStore;
import com.robothree.central.admincontrol.domain.AdminManagedModel;
import com.robothree.central.persistence.mybatis.entity.AdminModelCommandReceiptEntity;
import com.robothree.central.persistence.mybatis.entity.AdminModelCredentialEntity;
import com.robothree.central.persistence.mybatis.entity.AdminModelDefaultEntity;
import com.robothree.central.persistence.mybatis.entity.AdminModelAuditEntity;
import com.robothree.central.persistence.mybatis.entity.AdminModelGatewayBindingEntity;
import com.robothree.central.persistence.mybatis.mapper.AdminModelPersistenceMapper;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class MyBatisAdminModelStore implements AdminModelStore {
    private final AdminModelPersistenceMapper mapper;
    public MyBatisAdminModelStore(AdminModelPersistenceMapper mapper) { this.mapper = mapper; }

    @Override public Optional<AdminManagedModel> findCurrent(String modelId) {
        return Optional.ofNullable(mapper.findCurrentJson(modelId))
                .map(AdminModelCommandService::fromJson);
    }
    @Override public Optional<AdminManagedModel> findRevision(String modelId, String revision) {
        return Optional.ofNullable(mapper.findRevisionJson(modelId, revision))
                .map(AdminModelCommandService::fromJson);
    }
    @Override public List<AdminManagedModel> listCurrent() {
        return mapper.listCurrentJson().stream().map(AdminModelCommandService::fromJson).toList();
    }
    @Override public int insertRevision(AdminManagedModel model, String json, String digest) {
        return mapper.insertRevision(model.modelId(), model.modelRevision(), model.displayName(),
                json, digest, model.createdAt());
    }
    @Override public int createHead(String id, String revision, Instant at) {
        return mapper.createHead(id, revision, at);
    }
    @Override public int advanceHead(String id, String expected, String revision, Instant at) {
        return mapper.advanceHead(id, expected, revision, at);
    }
    @Override public Optional<DefaultSelection> findDefault() {
        AdminModelDefaultEntity value = mapper.findDefault();
        return value == null ? Optional.empty() : Optional.of(
                new DefaultSelection(value.getModelId(), value.getModelRevision()));
    }
    @Override public int replaceDefault(String expectedId, String expectedRevision,
            String id, String revision, Instant at) {
        return mapper.replaceDefault(expectedId, expectedRevision, id, revision, at);
    }
    @Override public int clearDefault(String expectedId, String expectedRevision) {
        return mapper.clearDefault(expectedId, expectedRevision);
    }
    @Override public int insertCredential(EncryptedCredential value) {
        AdminModelCredentialEntity entity = new AdminModelCredentialEntity();
        entity.setCredentialReference(value.credentialReference()); entity.setModelId(value.modelId());
        entity.setCredentialRevision(value.credentialRevision()); entity.setKeyId(value.keyId());
        entity.setNonce(value.nonce()); entity.setCiphertext(value.ciphertext());
        entity.setCreatedAt(value.createdAt()); return mapper.insertCredential(entity);
    }
    @Override public Optional<EncryptedCredential> findCredential(String reference, String revision) {
        AdminModelCredentialEntity value = mapper.findCredential(reference, revision);
        return value == null ? Optional.empty() : Optional.of(new EncryptedCredential(
                value.getCredentialReference(), value.getModelId(), value.getCredentialRevision(),
                value.getKeyId(), value.getNonce(), value.getCiphertext(), value.getCreatedAt()));
    }
    @Override public Optional<CommandReceipt> findReceipt(UUID commandId) {
        AdminModelCommandReceiptEntity value = mapper.findReceipt(commandId);
        return value == null ? Optional.empty() : Optional.of(new CommandReceipt(
                value.getCommandId(), value.getCorrelationId(), value.getCommandDigest(),
                value.getResultJson(), value.getOccurredAt()));
    }
    @Override public int insertReceipt(CommandReceipt value) {
        AdminModelCommandReceiptEntity entity = new AdminModelCommandReceiptEntity();
        entity.setCommandId(value.commandId()); entity.setCorrelationId(value.correlationId());
        entity.setCommandDigest(value.commandDigest()); entity.setResultJson(value.resultJson());
        entity.setOccurredAt(value.occurredAt()); return mapper.insertReceipt(entity);
    }
    @Override public int insertAudit(AuditEvent value) {
        return mapper.insertAudit(value.eventId(), value.actorSummary(), value.action(),
                value.modelId(), value.modelRevision(), value.changedFieldNames(),
                value.occurredAt(), value.result(), value.correlationId());
    }
    @Override public List<AuditEvent> listAudit(int limit) {
        if (limit < 1 || limit > 200) throw new IllegalArgumentException("audit limit invalid");
        return mapper.listAudit(limit).stream().map(MyBatisAdminModelStore::audit).toList();
    }
    private static AuditEvent audit(AdminModelAuditEntity value) {
        return new AuditEvent(value.getEventId(), value.getActorSummary(), value.getAction(),
                value.getModelId(), value.getModelRevision(), value.getChangedFieldNames(),
                value.getOccurredAt(), value.getResult(), value.getCorrelationId());
    }
    @Override public int insertGatewayBinding(GatewayBinding value) {
        AdminModelGatewayBindingEntity entity = new AdminModelGatewayBindingEntity();
        entity.setDecisionDigest(value.decisionDigest());
        entity.setBindingRevision(value.bindingRevision());
        entity.setBindingDigest(value.bindingDigest());
        entity.setBindingJson(value.bindingJson());
        entity.setCreatedAt(value.createdAt());
        return mapper.insertGatewayBinding(entity);
    }
    @Override public Optional<GatewayBinding> findGatewayBinding(String decisionDigest) {
        AdminModelGatewayBindingEntity value = mapper.findGatewayBinding(decisionDigest);
        return gatewayBinding(value);
    }
    @Override public Optional<GatewayBinding> findGatewayBindingByReference(
            String bindingRevision, String bindingDigest) {
        return gatewayBinding(mapper.findGatewayBindingByReference(
                bindingRevision, bindingDigest));
    }
    private static Optional<GatewayBinding> gatewayBinding(
            AdminModelGatewayBindingEntity value) {
        return value == null ? Optional.empty() : Optional.of(new GatewayBinding(
                value.getDecisionDigest(), value.getBindingRevision(), value.getBindingDigest(),
                value.getBindingJson(), value.getCreatedAt()));
    }
}
