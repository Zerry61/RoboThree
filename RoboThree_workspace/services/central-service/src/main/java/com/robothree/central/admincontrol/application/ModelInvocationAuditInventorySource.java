package com.robothree.central.admincontrol.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.domain.AdminInventoryItem;
import com.robothree.central.admincontrol.domain.AdminModule;
import com.robothree.central.admincontrol.domain.AdminModuleAvailability;
import com.robothree.central.admincontrol.domain.AdminModuleInventoryLease;
import com.robothree.central.modelgateway.domain.ModelInvocationAuditOutbox;
import com.robothree.central.modelgateway.port.ModelInvocationAuditOutboxRepository;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class ModelInvocationAuditInventorySource implements AdminModuleInventorySource {

    private static final ObjectMapper JSON = new ObjectMapper();
    private final ModelInvocationAuditOutboxRepository outbox;
    private final AdminModelStore adminModels;

    public ModelInvocationAuditInventorySource(ModelInvocationAuditOutboxRepository outbox) {
        this(outbox, null);
    }

    public ModelInvocationAuditInventorySource(
            ModelInvocationAuditOutboxRepository outbox,
            AdminModelStore adminModels) {
        this.outbox = Objects.requireNonNull(outbox, "outbox");
        this.adminModels = adminModels;
    }

    @Override
    public AdminModule module() {
        return AdminModule.SYSTEM;
    }

    @Override
    public AdminModuleInventoryLease capture(Instant now) {
        List<ModelInvocationAuditOutbox> facts = List.copyOf(outbox.findPending(100));
        List<AdminInventoryItem> items = new ArrayList<>();
        for (ModelInvocationAuditOutbox fact : facts) {
            String revision = "sha256:" + fact.eventDigest();
            ObjectNode summary = JSON.createObjectNode();
            summary.put("auditEventId", fact.eventId().toString());
            summary.put("auditRevision", revision);
            summary.put("occurredAt", fact.createdAt().toString());
            summary.put("actorSummary", "System");
            summary.put("actionSummary", safeEventType(fact.eventType()));
            summary.put("result", "unavailable");
            items.add(new AdminInventoryItem(
                    fact.eventId().toString(),
                    fact.createdAt().toString(),
                    revision,
                    summary,
                    summary));
        }
        List<AdminModelStore.AuditEvent> configurationFacts = adminModels == null
                ? List.of()
                : adminModels.listAudit(100);
        for (AdminModelStore.AuditEvent fact : configurationFacts) {
            ObjectNode material = JSON.createObjectNode();
            material.put("eventId", fact.eventId().toString());
            material.put("action", fact.action());
            material.put("modelId", fact.modelId());
            material.put("modelRevision", fact.modelRevision());
            material.put("occurredAt", fact.occurredAt().toString());
            material.put("result", fact.result());
            String revision = "sha256:" + CanonicalJson.sha256(
                    CanonicalJson.canonicalize(material));
            ObjectNode summary = JSON.createObjectNode();
            summary.put("auditEventId", fact.eventId().toString());
            summary.put("auditRevision", revision);
            summary.put("occurredAt", fact.occurredAt().toString());
            summary.put("actorSummary", fact.actorSummary());
            summary.put("actionSummary", configurationActionSummary(fact));
            summary.put("result", fact.result().equals("committed") ? "allowed" : "failed");
            items.add(new AdminInventoryItem(
                    fact.eventId().toString(),
                    fact.occurredAt().toString(),
                    revision,
                    summary,
                    summary));
        }
        String sourceRevision = "sha256:" + CanonicalJson.sha256(
                "robothree.admin-control.audit-inventory.v1\n"
                        + facts.stream()
                                .map(ModelInvocationAuditOutbox::eventDigest)
                                .sorted()
                                .reduce("", (left, right) -> left + "\n" + right)
                        + configurationFacts.stream()
                                .map(event -> event.eventId() + ":" + event.modelRevision())
                                .sorted()
                                .reduce("", (left, right) -> left + "\n" + right));
        return new AdminModuleInventoryLease(
                AdminModule.SYSTEM,
                "model_invocation_and_admin_configuration_audit.v1",
                sourceRevision,
                AdminModuleAvailability.PARTIAL,
                "complete_enterprise_audit_not_ready",
                now,
                items);
    }

    private static String safeEventType(String value) {
        if (value == null || value.isBlank() || value.length() > 128
                || !value.matches("[a-z0-9._-]+")) {
            throw new IllegalArgumentException("admin.audit_event_type_invalid");
        }
        return value;
    }

    private static String configurationActionSummary(AdminModelStore.AuditEvent fact) {
        String action = safeEventType(fact.action());
        if (fact.modelId() == null || !fact.modelId().matches("^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$")) {
            throw new IllegalArgumentException("admin.audit_model_id_invalid");
        }
        List<String> changed = fact.changedFieldNames().stream()
                .map(ModelInvocationAuditInventorySource::safeChangedField)
                .sorted()
                .toList();
        String value = action + " · " + fact.modelId()
                + (changed.isEmpty() ? "" : " · " + String.join(", ", changed));
        if (value.length() > 512) {
            throw new IllegalArgumentException("admin.audit_summary_oversized");
        }
        return value;
    }

    private static String safeChangedField(String value) {
        if (value == null || value.length() > 64
                || !value.matches("^[A-Za-z][A-Za-z0-9]*$")) {
            throw new IllegalArgumentException("admin.audit_changed_field_invalid");
        }
        return value;
    }
}
