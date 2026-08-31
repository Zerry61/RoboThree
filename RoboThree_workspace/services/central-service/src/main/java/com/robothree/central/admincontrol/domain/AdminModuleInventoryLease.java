package com.robothree.central.admincontrol.domain;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

public record AdminModuleInventoryLease(
        AdminModule module,
        String sourceKind,
        String sourceRevision,
        AdminModuleAvailability availability,
        Optional<String> safeReason,
        Instant capturedAt,
        List<AdminInventoryItem> items,
        Set<String> knownUnavailableResourceIds) {

    public AdminModuleInventoryLease(
            AdminModule module,
            String sourceKind,
            String sourceRevision,
            AdminModuleAvailability availability,
            String safeReason,
            Instant capturedAt,
            List<AdminInventoryItem> items) {
        this(module, sourceKind, sourceRevision, availability,
                Optional.ofNullable(safeReason), capturedAt, items);
    }

    public AdminModuleInventoryLease(
            AdminModule module,
            String sourceKind,
            String sourceRevision,
            AdminModuleAvailability availability,
            Optional<String> safeReason,
            Instant capturedAt,
            List<AdminInventoryItem> items) {
        this(module, sourceKind, sourceRevision, availability, safeReason,
                capturedAt, items, Set.of());
    }

    public AdminModuleInventoryLease(
            AdminModule module,
            String sourceKind,
            String sourceRevision,
            AdminModuleAvailability availability,
            String safeReason,
            Instant capturedAt,
            List<AdminInventoryItem> items,
            Set<String> knownUnavailableResourceIds) {
        this(module, sourceKind, sourceRevision, availability,
                Optional.ofNullable(safeReason), capturedAt, items,
                knownUnavailableResourceIds);
    }

    public AdminModuleInventoryLease {
        module = Objects.requireNonNull(module, "module");
        sourceKind = requireText(sourceKind, "sourceKind");
        sourceRevision = requireRevision(sourceRevision);
        availability = Objects.requireNonNull(availability, "availability");
        safeReason = Objects.requireNonNull(safeReason, "safeReason")
                .map(value -> requireText(value, "safeReason"));
        capturedAt = Objects.requireNonNull(capturedAt, "capturedAt");
        items = List.copyOf(Objects.requireNonNull(items, "items"));
        knownUnavailableResourceIds = Set.copyOf(Objects.requireNonNull(
                knownUnavailableResourceIds, "knownUnavailableResourceIds"));
        if (items.stream().map(AdminInventoryItem::resourceId).distinct().count()
                != items.size()) {
            throw new IllegalArgumentException("admin.inventory_duplicate_resource");
        }
        if ((availability == AdminModuleAvailability.UNAVAILABLE
                        || availability == AdminModuleAvailability.GATED)
                && !items.isEmpty()) {
            throw new IllegalArgumentException("admin.inventory_unavailable_has_items");
        }
        if (items.stream().map(AdminInventoryItem::resourceId)
                .anyMatch(knownUnavailableResourceIds::contains)) {
            throw new IllegalArgumentException("admin.inventory_resource_state_ambiguous");
        }
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank() || value.length() > 4096) {
            throw new IllegalArgumentException("admin.inventory_" + field + "_invalid");
        }
        return value;
    }

    private static String requireRevision(String value) {
        if (value == null || !value.matches("sha256:[a-f0-9]{64}")) {
            throw new IllegalArgumentException("admin.inventory_source_revision_invalid");
        }
        return value;
    }
}
