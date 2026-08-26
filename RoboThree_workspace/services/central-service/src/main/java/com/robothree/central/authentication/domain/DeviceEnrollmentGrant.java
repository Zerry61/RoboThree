package com.robothree.central.authentication.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.expiry;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record DeviceEnrollmentGrant(
        UUID enrollmentGrantId,
        String codeDigest,
        String enterpriseId,
        String authorizedUserId,
        Instant issuedAt,
        Instant expiresAt,
        Instant consumedAt,
        Instant disabledAt) {

    public DeviceEnrollmentGrant {
        Objects.requireNonNull(enrollmentGrantId, "enrollmentGrantId");
        digest(codeDigest, "codeDigest");
        text(enterpriseId, "enterpriseId");
        text(authorizedUserId, "authorizedUserId");
        expiry(issuedAt, expiresAt);
    }
}
