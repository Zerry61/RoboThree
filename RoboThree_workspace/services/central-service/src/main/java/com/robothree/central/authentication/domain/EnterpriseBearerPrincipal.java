package com.robothree.central.authentication.domain;

import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.CLAIMS_PROFILE;
import static com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding.requireUtcMillis;
import static com.robothree.central.shared.domain.DomainValueChecks.expiry;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

public record EnterpriseBearerPrincipal(
        String claimsProfile,
        String enterpriseId,
        String userId,
        String deviceId,
        UUID clientInstanceId,
        UUID tokenId,
        List<String> permissions,
        Instant issuedAt,
        Instant expiresAt) {

    public static final String LEGACY_CLAIMS_PROFILE = "v1alpha1";
    private static final Set<String> PROFILES = Set.of(LEGACY_CLAIMS_PROFILE, CLAIMS_PROFILE);
    private static final Set<String> PERMISSIONS = Set.of(
            "configuration.read",
            "model.use",
            "tool.use",
            "agent.use",
            "skill.use",
            "knowledge.use",
            "personal_model.configure");

    public EnterpriseBearerPrincipal {
        if (!PROFILES.contains(claimsProfile)) {
            throw new IllegalArgumentException("claimsProfile is unsupported");
        }
        enterpriseId = EnterpriseSessionTokenClaims.identityId(enterpriseId, "enterpriseId");
        userId = EnterpriseSessionTokenClaims.identityId(userId, "userId");
        deviceId = EnterpriseSessionTokenClaims.identityId(deviceId, "deviceId");
        Objects.requireNonNull(clientInstanceId, "clientInstanceId");
        Objects.requireNonNull(tokenId, "tokenId");
        permissions = List.copyOf(Objects.requireNonNull(permissions, "permissions"));
        if (permissions.size() > 32
                || permissions.size() != new HashSet<>(permissions).size()
                || !PERMISSIONS.containsAll(permissions)) {
            throw new IllegalArgumentException("permissions are unsupported or duplicated");
        }
        if (CLAIMS_PROFILE.equals(claimsProfile)) {
            EnterpriseSessionChallengeBinding.permissions(permissions);
        } else if (permissions.contains("personal_model.configure")) {
            throw new IllegalArgumentException(
                    "legacy principal cannot contain personal_model.configure");
        }
        if (CLAIMS_PROFILE.equals(claimsProfile)) {
            requireUtcMillis(issuedAt, "issuedAt");
            requireUtcMillis(expiresAt, "expiresAt");
        } else {
            Objects.requireNonNull(issuedAt, "issuedAt");
            Objects.requireNonNull(expiresAt, "expiresAt");
        }
        expiry(issuedAt, expiresAt);
    }

    public boolean hasPermission(String permission) {
        return permissions.contains(Objects.requireNonNull(permission, "permission"));
    }
}
