package com.robothree.central.admincontrol.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record AdminManagedModel(
        String modelId,
        String modelRevision,
        String displayName,
        String providerFamily,
        String endpoint,
        String providerModelId,
        String lifecycle,
        String credentialReference,
        String credentialRevision,
        String connectionStatus,
        String connectionSafeReason,
        Long connectionDurationMs,
        Instant connectionTestedAt,
        UUID connectionCorrelationId,
        Instant createdAt) {

    public AdminManagedModel {
        Objects.requireNonNull(modelId, "modelId");
        Objects.requireNonNull(modelRevision, "modelRevision");
        Objects.requireNonNull(displayName, "displayName");
        Objects.requireNonNull(providerFamily, "providerFamily");
        Objects.requireNonNull(endpoint, "endpoint");
        Objects.requireNonNull(providerModelId, "providerModelId");
        Objects.requireNonNull(lifecycle, "lifecycle");
        Objects.requireNonNull(connectionStatus, "connectionStatus");
        Objects.requireNonNull(createdAt, "createdAt");
        if (!modelId.matches("^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$")
                || !modelRevision.matches("^sha256:[a-f0-9]{64}$")
                || !providerFamily.equals("openai_compatible")
                || !(lifecycle.equals("enabled") || lifecycle.equals("disabled"))) {
            throw new IllegalArgumentException("managed model identity is invalid");
        }
        boolean unverified = connectionStatus.equals("unverified");
        boolean complete = connectionDurationMs != null
                && connectionTestedAt != null
                && connectionCorrelationId != null;
        if (unverified == complete) {
            throw new IllegalArgumentException("connection check facts are inconsistent");
        }
    }

    public boolean credentialConfigured() {
        return credentialReference != null && credentialRevision != null;
    }
}
