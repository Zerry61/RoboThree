package com.robothree.central.admincontrol.domain;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.text.Normalizer;
import java.util.Objects;

public final class AdminInventoryItem {

    private final String resourceId;
    private final String displayName;
    private final String resourceRevision;
    private final ObjectNode summary;
    private final ObjectNode detail;

    public AdminInventoryItem(
            String resourceId,
            String displayName,
            String resourceRevision,
            ObjectNode summary,
            ObjectNode detail) {
        this.resourceId = requireText(resourceId, "resourceId");
        this.displayName = Normalizer.normalize(
                requireText(displayName, "displayName"), Normalizer.Form.NFC);
        this.resourceRevision = requireRevision(resourceRevision);
        this.summary = Objects.requireNonNull(summary, "summary").deepCopy();
        this.detail = Objects.requireNonNull(detail, "detail").deepCopy();
    }

    public String resourceId() {
        return resourceId;
    }

    public String displayName() {
        return displayName;
    }

    public String resourceRevision() {
        return resourceRevision;
    }

    public ObjectNode summary() {
        return summary.deepCopy();
    }

    public ObjectNode detail() {
        return detail.deepCopy();
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank() || value.length() > 512) {
            throw new IllegalArgumentException("admin.inventory_" + field + "_invalid");
        }
        return value;
    }

    private static String requireRevision(String value) {
        if (value == null || !value.matches("sha256:[a-f0-9]{64}")) {
            throw new IllegalArgumentException("admin.inventory_revision_invalid");
        }
        return value;
    }
}
