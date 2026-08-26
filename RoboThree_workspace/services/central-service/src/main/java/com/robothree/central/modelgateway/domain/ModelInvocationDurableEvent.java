package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.revision;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record ModelInvocationDurableEvent(
        UUID invocationId,
        long eventSequence,
        UUID eventId,
        String eventType,
        ModelInvocationStatus status,
        long statusRevision,
        String eventDigest,
        String streamDigest,
        String metadataJson,
        Instant createdAt) {

    public ModelInvocationDurableEvent {
        Objects.requireNonNull(invocationId, "invocationId");
        if (eventSequence < 1) {
            throw new IllegalArgumentException("eventSequence must be positive");
        }
        Objects.requireNonNull(eventId, "eventId");
        eventType = text(eventType, "eventType");
        statusRevision = revision(statusRevision, "statusRevision");
        eventDigest = digest(eventDigest, "eventDigest");
        streamDigest = digest(streamDigest, "streamDigest");
        metadataJson = text(metadataJson, "metadataJson");
        Objects.requireNonNull(createdAt, "createdAt");
    }
}
