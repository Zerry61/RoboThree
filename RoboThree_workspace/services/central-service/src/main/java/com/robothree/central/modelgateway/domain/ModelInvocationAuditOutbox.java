package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.revision;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record ModelInvocationAuditOutbox(
        UUID outboxId,
        UUID invocationId,
        UUID eventId,
        String eventType,
        String eventDigest,
        Instant createdAt,
        Instant publishedAt,
        long attemptCount) {

    public ModelInvocationAuditOutbox {
        Objects.requireNonNull(outboxId, "outboxId");
        Objects.requireNonNull(invocationId, "invocationId");
        Objects.requireNonNull(eventId, "eventId");
        eventType = text(eventType, "eventType");
        eventDigest = digest(eventDigest, "eventDigest");
        Objects.requireNonNull(createdAt, "createdAt");
        attemptCount = revision(attemptCount, "attemptCount");
    }
}
