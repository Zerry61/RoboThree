package com.robothree.central.authentication.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.expiry;
import static com.robothree.central.shared.domain.DomainValueChecks.immutableList;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

public record AccessTokenClaims(
        String contractVersion,
        String issuer,
        String audience,
        String enterpriseId,
        String userId,
        String deviceId,
        String clientInstanceId,
        UUID tokenId,
        Instant issuedAt,
        Instant expiresAt,
        List<String> permissions) {

    private static final Set<String> ALLOWED_PERMISSIONS = Set.of(
            "configuration.read",
            "model.use",
            "tool.use",
            "agent.use",
            "skill.use",
            "knowledge.use");

    public AccessTokenClaims {
        if (!"v1alpha1".equals(contractVersion)) {
            throw new IllegalArgumentException("unsupported token Contract version");
        }
        text(issuer, "issuer");
        text(audience, "audience");
        text(enterpriseId, "enterpriseId");
        text(userId, "userId");
        text(deviceId, "deviceId");
        text(clientInstanceId, "clientInstanceId");
        UUID.fromString(clientInstanceId);
        Objects.requireNonNull(tokenId, "tokenId");
        expiry(issuedAt, expiresAt);
        permissions = immutableList(permissions, "permissions");
        if (permissions.size() > 32 || new HashSet<>(permissions).size() != permissions.size()) {
            throw new IllegalArgumentException("token permissions must be unique and bounded");
        }
        if (!ALLOWED_PERMISSIONS.containsAll(permissions)) {
            throw new IllegalArgumentException("token contains an unsupported permission");
        }
    }
}
