package com.robothree.central.authentication.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.expiry;
import static com.robothree.central.shared.domain.DomainValueChecks.immutableNonEmptyList;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record DeviceChallenge(
        UUID challengeId,
        String purpose,
        UUID verifiedIdentityId,
        String clientInstanceId,
        String expectedDeviceKeyId,
        String expectedPublicKeyDigest,
        String nonce,
        String audience,
        List<String> allowedAlgorithms,
        String challengeDigest,
        Instant issuedAt,
        Instant expiresAt,
        Instant consumedAt,
        String consumedBy,
        String consumedRequestDigest) {

    public DeviceChallenge {
        Objects.requireNonNull(challengeId, "challengeId");
        text(purpose, "purpose");
        Objects.requireNonNull(verifiedIdentityId, "verifiedIdentityId");
        text(clientInstanceId, "clientInstanceId");
        if (expectedDeviceKeyId != null) {
            text(expectedDeviceKeyId, "expectedDeviceKeyId");
        }
        if (expectedPublicKeyDigest != null) {
            digest(expectedPublicKeyDigest, "expectedPublicKeyDigest");
        }
        text(nonce, "nonce");
        text(audience, "audience");
        allowedAlgorithms = immutableNonEmptyList(allowedAlgorithms, "allowedAlgorithms");
        digest(challengeDigest, "challengeDigest");
        expiry(issuedAt, expiresAt);
        if (consumedBy != null) {
            text(consumedBy, "consumedBy");
        }
        if (consumedRequestDigest != null) {
            digest(consumedRequestDigest, "consumedRequestDigest");
        }
        if ((consumedAt == null) != (consumedBy == null || consumedRequestDigest == null)) {
            throw new IllegalArgumentException(
                    "consumedAt, consumedBy and consumedRequestDigest must be set together");
        }
    }
}
