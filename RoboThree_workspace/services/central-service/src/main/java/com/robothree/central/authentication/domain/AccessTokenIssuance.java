package com.robothree.central.authentication.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.expiry;
import static com.robothree.central.shared.domain.DomainValueChecks.immutableList;
import static com.robothree.central.shared.domain.DomainValueChecks.revision;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record AccessTokenIssuance(
        UUID tokenId,
        String tokenDigest,
        String enterpriseId,
        String userId,
        String deviceId,
        String clientInstanceId,
        List<String> permissions,
        String identityDigest,
        long deviceRevision,
        long permissionRevision,
        Instant issuedAt,
        Instant expiresAt,
        UUID challengeId) {

    public AccessTokenIssuance {
        Objects.requireNonNull(tokenId, "tokenId");
        digest(tokenDigest, "tokenDigest");
        text(enterpriseId, "enterpriseId");
        text(userId, "userId");
        text(deviceId, "deviceId");
        text(clientInstanceId, "clientInstanceId");
        permissions = immutableList(permissions, "permissions");
        digest(identityDigest, "identityDigest");
        revision(deviceRevision, "deviceRevision");
        revision(permissionRevision, "permissionRevision");
        expiry(issuedAt, expiresAt);
        Objects.requireNonNull(challengeId, "challengeId");
    }
}
