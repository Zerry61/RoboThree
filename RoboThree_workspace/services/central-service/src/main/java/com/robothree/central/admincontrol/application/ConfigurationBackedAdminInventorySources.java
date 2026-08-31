package com.robothree.central.admincontrol.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.domain.AdminInventoryItem;
import com.robothree.central.admincontrol.domain.AdminModule;
import com.robothree.central.admincontrol.domain.AdminModuleAvailability;
import com.robothree.central.admincontrol.domain.AdminModuleInventoryLease;
import com.robothree.central.configuration.application.ConfigurationIntegrityVerifier;
import com.robothree.central.configuration.domain.ExactPackageReadReference;
import com.robothree.central.configuration.domain.ImmutableConfigurationSnapshot;
import com.robothree.central.configuration.domain.ImmutablePackageDocument;
import com.robothree.central.configuration.port.ConfigurationSnapshotRepository;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

public final class ConfigurationBackedAdminInventorySources {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAXIMUM_SNAPSHOT_BYTES = 2 * 1024 * 1024;
    private static final int MAXIMUM_PACKAGE_BYTES = 4 * 1024 * 1024;

    private ConfigurationBackedAdminInventorySources() {}

    public static List<AdminModuleInventorySource> create(
            ConfigurationSnapshotRepository snapshots,
            ConfigurationIntegrityVerifier integrityVerifier) {
        Objects.requireNonNull(snapshots, "snapshots");
        Objects.requireNonNull(integrityVerifier, "integrityVerifier");
        return List.of(
                source(AdminModule.MODELS, snapshots, integrityVerifier),
                source(AdminModule.ROBOTS, snapshots, integrityVerifier),
                source(AdminModule.SKILLS, snapshots, integrityVerifier),
                source(AdminModule.TOOLS, snapshots, integrityVerifier),
                source(AdminModule.KNOWLEDGE, snapshots, integrityVerifier));
    }

    private static AdminModuleInventorySource source(
            AdminModule module,
            ConfigurationSnapshotRepository snapshots,
            ConfigurationIntegrityVerifier integrityVerifier) {
        return new AdminModuleInventorySource() {
            @Override
            public AdminModule module() {
                return module;
            }

            @Override
            public AdminModuleInventoryLease capture(Instant now) {
                ImmutableConfigurationSnapshot snapshot = snapshots.findActive().orElse(null);
                if (snapshot == null) {
                    return unavailable(module, "configuration_snapshot_missing", now);
                }
                try {
                    integrityVerifier.verifySnapshot(snapshot);
                    ObjectNode document = CanonicalJson.parseObject(
                            snapshot.documentJson(), MAXIMUM_SNAPSHOT_BYTES);
                    return switch (module) {
                        case MODELS -> models(snapshot, document, now);
                        case ROBOTS -> robots(snapshot, document, now);
                        case SKILLS -> skills(snapshot, document, integrityVerifier, now);
                        case TOOLS -> gated(module, snapshot, "tgm_authority_not_ready", now);
                        case KNOWLEDGE -> knowledge(snapshot, document, now);
                        case SYSTEM -> throw new IllegalStateException("audit uses its own authority");
                    };
                } catch (RuntimeException exception) {
                    return unavailable(module, "configuration_integrity_unavailable", now);
                }
            }
        };
    }

    private static AdminModuleInventoryLease models(
            ImmutableConfigurationSnapshot snapshot, ObjectNode document, Instant now) {
        // v1alpha1 descriptors do not contain an authoritative provider label or
        // default-for-new-task fact required by the Admin Contract. Returning an
        // empty partial inventory is intentional; those fields are never guessed.
        return leaseWithKnownUnavailable(
                AdminModule.MODELS,
                snapshot,
                AdminModuleAvailability.PARTIAL,
                "model_projection_fields_not_authoritative",
                now,
                ids(requireArray(document, "models"), "id"));
    }

    private static AdminModuleInventoryLease robots(
            ImmutableConfigurationSnapshot snapshot, ObjectNode document, Instant now) {
        // The active reference proves a package identity, not review lifecycle or
        // strict restriction material. Agent Lifecycle remains gated.
        return leaseWithKnownUnavailable(
                AdminModule.ROBOTS,
                snapshot,
                AdminModuleAvailability.PARTIAL,
                "agent_lifecycle_authority_not_ready",
                now,
                ids(requireArray(document, "agents"), "packageId"));
    }

    private static AdminModuleInventoryLease skills(
            ImmutableConfigurationSnapshot snapshot,
            ObjectNode document,
            ConfigurationIntegrityVerifier verifier,
            Instant now) {
        List<AdminInventoryItem> items = new ArrayList<>();
        JsonNode references = requireArray(document, "skills");
        for (JsonNode reference : references) {
            ExactPackageReadReference exact = new ExactPackageReadReference(
                    snapshot.snapshotId(),
                    snapshot.revision(),
                    snapshot.digest(),
                    requiredText(reference, "packageId"),
                    "skill",
                    requiredText(reference, "revision"),
                    requiredText(reference, "digest"));
            ImmutablePackageDocument packageDocument = verifier
                    .findExactReferencedPackage(snapshot, exact)
                    .orElseThrow(() -> new IllegalStateException(
                            "admin.skill_exact_package_missing"));
            ObjectNode packageJson = CanonicalJson.parseObject(
                    packageDocument.documentJson(), MAXIMUM_PACKAGE_BYTES);
            ObjectNode manifest = requireObject(packageJson, "manifest");
            String displayName = boundedSafeText(manifest, "name", 512);
            String description = boundedSafeText(manifest, "description", 4096);
            String revision = wireRevision(packageDocument.revision());
            ObjectNode summary = JSON.createObjectNode();
            summary.put("skillId", packageDocument.packageId());
            summary.put("skillRevision", revision);
            summary.put("displayName", displayName);
            summary.put("description", description);
            summary.put("lifecycle", "unavailable");
            summary.put("packageValidationState", "valid");
            ObjectNode detail = summary.deepCopy();
            detail.put("packageDigest", wireRevision(packageDocument.digest()));
            detail.put("validationSummary", "包完整性已验证；Skill Runtime 尚未声明可用。");
            items.add(new AdminInventoryItem(
                    packageDocument.packageId(), displayName, revision, summary, detail));
        }
        return lease(
                AdminModule.SKILLS,
                snapshot,
                AdminModuleAvailability.PARTIAL,
                "skill_runtime_not_ready",
                now,
                items);
    }

    private static AdminModuleInventoryLease knowledge(
            ImmutableConfigurationSnapshot snapshot, ObjectNode document, Instant now) {
        List<AdminInventoryItem> items = new ArrayList<>();
        for (JsonNode descriptor : requireArray(document, "knowledge")) {
            String id = requiredText(descriptor, "id");
            String revision = wireRevision(requiredText(descriptor, "revision"));
            ObjectNode summary = JSON.createObjectNode();
            summary.put("knowledgeId", id);
            summary.put("knowledgeRevision", revision);
            summary.put("displayName", id);
            summary.put("safeSummary", "受信配置中存在该知识资源；检索能力尚未开放。");
            summary.put("state", "partial");
            ObjectNode detail = summary.deepCopy();
            detail.put("retrievalState", "gated");
            items.add(new AdminInventoryItem(id, id, revision, summary, detail));
        }
        return lease(
                AdminModule.KNOWLEDGE,
                snapshot,
                AdminModuleAvailability.PARTIAL,
                "knowledge_provider_not_ready",
                now,
                items);
    }

    private static AdminModuleInventoryLease unavailable(
            AdminModule module, String reason, Instant now) {
        return new AdminModuleInventoryLease(
                module,
                "configuration_snapshot.v1",
                markerRevision(module, reason),
                AdminModuleAvailability.UNAVAILABLE,
                reason,
                now,
                List.of());
    }

    private static AdminModuleInventoryLease gated(
            AdminModule module,
            ImmutableConfigurationSnapshot snapshot,
            String reason,
            Instant now) {
        return lease(module, snapshot, AdminModuleAvailability.GATED, reason, now, List.of());
    }

    private static AdminModuleInventoryLease lease(
            AdminModule module,
            ImmutableConfigurationSnapshot snapshot,
            AdminModuleAvailability availability,
            String reason,
            Instant now,
            List<AdminInventoryItem> items) {
        return new AdminModuleInventoryLease(
                module,
                "verified_configuration_snapshot.v1",
                wireRevision(snapshot.digest()),
                availability,
                reason,
                now,
                items);
    }

    private static AdminModuleInventoryLease leaseWithKnownUnavailable(
            AdminModule module,
            ImmutableConfigurationSnapshot snapshot,
            AdminModuleAvailability availability,
            String reason,
            Instant now,
            Set<String> knownUnavailable) {
        return new AdminModuleInventoryLease(
                module,
                "verified_configuration_snapshot.v1",
                wireRevision(snapshot.digest()),
                availability,
                reason,
                now,
                List.of(),
                knownUnavailable);
    }

    private static Set<String> ids(JsonNode array, String field) {
        return StreamSupport.stream(array.spliterator(), false)
                .map(item -> requiredText(item, field))
                .collect(Collectors.toUnmodifiableSet());
    }

    private static String markerRevision(AdminModule module, String reason) {
        return "sha256:" + CanonicalJson.sha256(
                "robothree.admin-control.missing-authority.v1\n"
                        + module.wireValue() + "\n" + reason);
    }

    private static String wireRevision(String raw) {
        if (raw == null || !raw.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("admin.authority_revision_invalid");
        }
        return "sha256:" + raw;
    }

    private static JsonNode requireArray(ObjectNode document, String field) {
        JsonNode value = document.get(field);
        if (value == null || !value.isArray()) {
            throw new IllegalArgumentException("admin.authority_array_invalid");
        }
        return value;
    }

    private static ObjectNode requireObject(ObjectNode document, String field) {
        JsonNode value = document.get(field);
        if (!(value instanceof ObjectNode object)) {
            throw new IllegalArgumentException("admin.authority_object_invalid");
        }
        return object;
    }

    private static String requiredText(JsonNode document, String field) {
        JsonNode value = document.get(field);
        if (value == null || !value.isTextual() || value.textValue().isBlank()) {
            throw new IllegalArgumentException("admin.authority_text_invalid");
        }
        return value.textValue();
    }

    private static String boundedSafeText(ObjectNode document, String field, int maximum) {
        String value = requiredText(document, field);
        if (value.length() > maximum || containsUnsafeControl(value)) {
            throw new IllegalArgumentException("admin.authority_safe_text_invalid");
        }
        return value;
    }

    private static boolean containsUnsafeControl(String value) {
        return value.codePoints().anyMatch(codePoint -> codePoint < 0x20
                && codePoint != '\n' && codePoint != '\t');
    }
}
