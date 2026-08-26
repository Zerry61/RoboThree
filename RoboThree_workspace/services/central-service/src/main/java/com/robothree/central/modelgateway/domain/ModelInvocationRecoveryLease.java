package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.revision;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record ModelInvocationRecoveryLease(
        UUID invocationId,
        String ownerNodeId,
        long fencingEpoch,
        long statusRevision,
        Instant leaseExpiresAt,
        Instant databaseObservedAt,
        long recoveryAttempt,
        String policyRevision,
        Instant updatedAt) {

    public ModelInvocationRecoveryLease {
        Objects.requireNonNull(invocationId, "invocationId");
        ownerNodeId = text(ownerNodeId, "ownerNodeId");
        if (fencingEpoch < 1) {
            throw new IllegalArgumentException("fencingEpoch must be positive");
        }
        statusRevision = revision(statusRevision, "statusRevision");
        Objects.requireNonNull(leaseExpiresAt, "leaseExpiresAt");
        Objects.requireNonNull(databaseObservedAt, "databaseObservedAt");
        if (leaseExpiresAt.isBefore(databaseObservedAt)) {
            throw new IllegalArgumentException(
                    "leaseExpiresAt must not be before databaseObservedAt");
        }
        if (recoveryAttempt < 1) {
            throw new IllegalArgumentException("recoveryAttempt must be positive");
        }
        policyRevision = digest(policyRevision, "policyRevision");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }
}
