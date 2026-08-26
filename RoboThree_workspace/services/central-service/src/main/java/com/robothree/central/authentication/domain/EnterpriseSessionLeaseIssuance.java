package com.robothree.central.authentication.domain;

import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.AUDIENCE;
import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.CLAIMS_PROFILE;
import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.boundedText;
import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.requireUtcMillis;
import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.wireDigest;
import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.expiry;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

public record EnterpriseSessionLeaseIssuance(
        UUID tokenId,
        String tokenDigest,
        String claimsProfile,
        String issuer,
        String audience,
        String enterpriseId,
        String userId,
        String deviceId,
        UUID verifiedIdentityId,
        String identitySourceRevision,
        UUID clientInstanceId,
        List<String> permissions,
        String identityDigest,
        long deviceSourceRevision,
        String deviceRevisionDigest,
        String permissionRevisionDigest,
        String compatibilityRevision,
        String trustSource,
        String managedStatus,
        String complianceStatus,
        Instant issuedAt,
        Instant expiresAt,
        Instant trustEvaluatedAt,
        UUID challengeId,
        String challengeBindingDigest,
        String sessionAssertionRevision,
        String sessionAssertionDigest,
        String sessionAssertionJson,
        String deviceTrustDecisionRevision,
        String deviceTrustDecisionDigest,
        String deviceTrustDecisionJson,
        String sourceDecisionDigest,
        String requestDigest,
        String recordDigest) {

    public EnterpriseSessionLeaseIssuance {
        Objects.requireNonNull(tokenId, "tokenId");
        digest(tokenDigest, "tokenDigest");
        if (!CLAIMS_PROFILE.equals(claimsProfile) || !AUDIENCE.equals(audience)) {
            throw new IllegalArgumentException("claimsProfile or audience is unsupported");
        }
        boundedText(issuer, "issuer", 160);
        boundedText(enterpriseId, "enterpriseId", 160);
        boundedText(userId, "userId", 160);
        boundedText(deviceId, "deviceId", 160);
        Objects.requireNonNull(verifiedIdentityId, "verifiedIdentityId");
        boundedText(identitySourceRevision, "identitySourceRevision", 160);
        Objects.requireNonNull(clientInstanceId, "clientInstanceId");
        permissions = EnterpriseSessionChallengeBinding.permissions(permissions);
        digest(identityDigest, "identityDigest");
        if (deviceSourceRevision < 0) {
            throw new IllegalArgumentException("deviceSourceRevision must not be negative");
        }
        wireDigest(deviceRevisionDigest, "deviceRevisionDigest");
        wireDigest(permissionRevisionDigest, "permissionRevisionDigest");
        boundedText(compatibilityRevision, "compatibilityRevision", 160);
        boundedText(trustSource, "trustSource", 80);
        if (!Set.of("managed", "not_managed").contains(managedStatus)) {
            throw new IllegalArgumentException("managedStatus is unsupported");
        }
        if (!Set.of("compliant", "not_compliant", "unknown").contains(complianceStatus)) {
            throw new IllegalArgumentException("complianceStatus is unsupported");
        }
        requireUtcMillis(issuedAt, "issuedAt");
        requireUtcMillis(expiresAt, "expiresAt");
        requireUtcMillis(trustEvaluatedAt, "trustEvaluatedAt");
        expiry(issuedAt, expiresAt);
        if (trustEvaluatedAt.isAfter(issuedAt)) {
            throw new IllegalArgumentException("trustEvaluatedAt must not follow issuedAt");
        }
        Objects.requireNonNull(challengeId, "challengeId");
        digest(challengeBindingDigest, "challengeBindingDigest");
        wireDigest(sessionAssertionRevision, "sessionAssertionRevision");
        wireDigest(sessionAssertionDigest, "sessionAssertionDigest");
        sessionAssertionJson = json(sessionAssertionJson, "sessionAssertionJson");
        wireDigest(deviceTrustDecisionRevision, "deviceTrustDecisionRevision");
        wireDigest(deviceTrustDecisionDigest, "deviceTrustDecisionDigest");
        deviceTrustDecisionJson = json(deviceTrustDecisionJson, "deviceTrustDecisionJson");
        wireDigest(sourceDecisionDigest, "sourceDecisionDigest");
        digest(requestDigest, "requestDigest");
        digest(recordDigest, "recordDigest");
    }

    private static String json(String value, String name) {
        Objects.requireNonNull(value, name);
        int bytes = value.getBytes(StandardCharsets.UTF_8).length;
        if (bytes == 0 || bytes > 32 * 1024) {
            throw new IllegalArgumentException(name + " is missing or exceeds its limit");
        }
        return value;
    }
}
