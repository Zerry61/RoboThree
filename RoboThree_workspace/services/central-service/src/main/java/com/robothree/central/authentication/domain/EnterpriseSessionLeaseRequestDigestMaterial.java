package com.robothree.central.authentication.domain;

import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.AUDIENCE;
import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.CLAIMS_PROFILE;
import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.boundedText;
import static com.robothree.central.shared.domain.DomainValueChecks.digest;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record EnterpriseSessionLeaseRequestDigestMaterial(
        String schemaVersion,
        String claimsProfile,
        UUID challengeId,
        String challengeBindingDigest,
        UUID currentClientInstanceId,
        String audience,
        List<String> requiredPermissions,
        String deviceKeyId,
        UUID correlationId) {

    public static final String SCHEMA_VERSION = "enterprise-session.v1alpha1";

    public EnterpriseSessionLeaseRequestDigestMaterial {
        if (!SCHEMA_VERSION.equals(schemaVersion)
                || !CLAIMS_PROFILE.equals(claimsProfile)
                || !AUDIENCE.equals(audience)) {
            throw new IllegalArgumentException("lease request profile is unsupported");
        }
        Objects.requireNonNull(challengeId, "challengeId");
        digest(challengeBindingDigest, "challengeBindingDigest");
        Objects.requireNonNull(currentClientInstanceId, "currentClientInstanceId");
        requiredPermissions = EnterpriseSessionChallengeBinding.permissions(requiredPermissions);
        boundedText(deviceKeyId, "deviceKeyId", 160);
        Objects.requireNonNull(correlationId, "correlationId");
    }
}
