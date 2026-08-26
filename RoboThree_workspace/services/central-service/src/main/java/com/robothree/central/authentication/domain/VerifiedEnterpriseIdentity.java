package com.robothree.central.authentication.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.expiry;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record VerifiedEnterpriseIdentity(
        UUID verifiedIdentityId,
        String enterpriseId,
        String userId,
        String provider,
        String providerSubjectDigest,
        String identityDigest,
        Instant issuedAt,
        Instant expiresAt,
        Instant disabledAt) {

    public VerifiedEnterpriseIdentity {
        Objects.requireNonNull(verifiedIdentityId, "verifiedIdentityId");
        text(enterpriseId, "enterpriseId");
        text(userId, "userId");
        text(provider, "provider");
        digest(providerSubjectDigest, "providerSubjectDigest");
        digest(identityDigest, "identityDigest");
        expiry(issuedAt, expiresAt);
    }
}
