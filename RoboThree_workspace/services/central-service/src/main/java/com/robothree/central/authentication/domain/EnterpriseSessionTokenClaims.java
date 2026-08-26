package com.robothree.central.authentication.domain;

import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.AUDIENCE;
import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.CLAIMS_PROFILE;
import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.boundedText;
import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.requireUtcMillis;
import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.wireDigest;
import static com.robothree.central.shared.domain.DomainValueChecks.expiry;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

public record EnterpriseSessionTokenClaims(
        String claimsProfile,
        String issuer,
        String audience,
        String enterpriseId,
        String userId,
        String deviceId,
        UUID clientInstanceId,
        UUID tokenId,
        Instant issuedAt,
        Instant expiresAt,
        List<String> permissions,
        String sessionAssertionDigest,
        String deviceTrustDecisionDigest,
        String compatibilityRevision,
        String sourceDecisionDigest) {

    private static final Pattern IDENTITY_ID =
            Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$");

    public EnterpriseSessionTokenClaims {
        if (!CLAIMS_PROFILE.equals(claimsProfile) || !AUDIENCE.equals(audience)) {
            throw new IllegalArgumentException("claimsProfile or audience is unsupported");
        }
        issuer = identityId(issuer, "issuer");
        enterpriseId = identityId(enterpriseId, "enterpriseId");
        userId = identityId(userId, "userId");
        deviceId = identityId(deviceId, "deviceId");
        Objects.requireNonNull(clientInstanceId, "clientInstanceId");
        Objects.requireNonNull(tokenId, "tokenId");
        requireUtcMillis(issuedAt, "issuedAt");
        requireUtcMillis(expiresAt, "expiresAt");
        expiry(issuedAt, expiresAt);
        permissions = EnterpriseSessionChallengeBinding.permissions(permissions);
        wireDigest(sessionAssertionDigest, "sessionAssertionDigest");
        wireDigest(deviceTrustDecisionDigest, "deviceTrustDecisionDigest");
        compatibilityRevision = canonicalCompatibilityRevision(compatibilityRevision);
        wireDigest(sourceDecisionDigest, "sourceDecisionDigest");
    }

    public static EnterpriseSessionTokenClaims fromIssuance(
            EnterpriseSessionLeaseIssuance issuance) {
        Objects.requireNonNull(issuance, "issuance");
        return new EnterpriseSessionTokenClaims(
                issuance.claimsProfile(),
                issuance.issuer(),
                issuance.audience(),
                issuance.enterpriseId(),
                issuance.userId(),
                issuance.deviceId(),
                issuance.clientInstanceId(),
                issuance.tokenId(),
                issuance.issuedAt(),
                issuance.expiresAt(),
                issuance.permissions(),
                issuance.sessionAssertionDigest(),
                issuance.deviceTrustDecisionDigest(),
                issuance.compatibilityRevision(),
                issuance.sourceDecisionDigest());
    }

    static String identityId(String value, String name) {
        Objects.requireNonNull(value, name);
        if (!IDENTITY_ID.matcher(value).matches()) {
            throw new IllegalArgumentException(name + " is not a bounded identity id");
        }
        return value;
    }

    static String canonicalCompatibilityRevision(String value) {
        boundedText(value, "compatibilityRevision", 19);
        if (!value.matches("^(0|[1-9][0-9]{0,18})$")) {
            throw new IllegalArgumentException(
                    "compatibilityRevision must be canonical nonnegative decimal ASCII");
        }
        try {
            long parsed = Long.parseLong(value);
            if (!Long.toString(parsed).equals(value)) {
                throw new IllegalArgumentException(
                        "compatibilityRevision must be canonical nonnegative decimal ASCII");
            }
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(
                    "compatibilityRevision must fit a nonnegative signed 64-bit revision",
                    exception);
        }
        return value;
    }
}
