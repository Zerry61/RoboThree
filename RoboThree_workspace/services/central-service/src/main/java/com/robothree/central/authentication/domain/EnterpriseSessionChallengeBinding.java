package com.robothree.central.authentication.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

public record EnterpriseSessionChallengeBinding(
        UUID challengeId,
        UUID verifiedIdentityId,
        String claimsProfile,
        String identitySourceRevision,
        UUID currentClientInstanceId,
        String audience,
        List<String> requiredPermissions,
        String deviceKeyId,
        UUID correlationId,
        String challengeBindingDigest,
        String recordDigest,
        Instant createdAt) {

    public static final String CLAIMS_PROFILE = "eipc.session-token.v1";
    public static final String AUDIENCE = "robothree.enterprise-gateway";
    public static final String PURPOSE = "enterprise_session_lease";

    public EnterpriseSessionChallengeBinding {
        Objects.requireNonNull(challengeId, "challengeId");
        Objects.requireNonNull(verifiedIdentityId, "verifiedIdentityId");
        requireExact(claimsProfile, CLAIMS_PROFILE, "claimsProfile");
        boundedText(identitySourceRevision, "identitySourceRevision", 160);
        Objects.requireNonNull(currentClientInstanceId, "currentClientInstanceId");
        requireExact(audience, AUDIENCE, "audience");
        requiredPermissions = permissions(requiredPermissions);
        boundedText(deviceKeyId, "deviceKeyId", 160);
        Objects.requireNonNull(correlationId, "correlationId");
        digest(challengeBindingDigest, "challengeBindingDigest");
        digest(recordDigest, "recordDigest");
        requireUtcMillis(createdAt, "createdAt");
    }

    public static List<String> permissions(List<String> values) {
        List<String> copy = List.copyOf(Objects.requireNonNull(values, "permissions"));
        if (copy.isEmpty() || copy.size() > 32) {
            throw new IllegalArgumentException("permissions must contain between 1 and 32 values");
        }
        if (new java.util.HashSet<>(copy).size() != copy.size()
                || !copy.equals(copy.stream().sorted().toList())) {
            throw new IllegalArgumentException("permissions must be unique and ASCII sorted");
        }
        Set<String> allowed = Set.of(
                "configuration.read",
                "model.use",
                "tool.use",
                "agent.use",
                "skill.use",
                "knowledge.use",
                "personal_model.configure");
        if (!copy.contains("configuration.read") || !allowed.containsAll(copy)) {
            throw new IllegalArgumentException("permissions are unsupported");
        }
        return copy;
    }

    static String wireDigest(String value, String name) {
        text(value, name);
        if (!value.matches("^sha256:[a-f0-9]{64}$")) {
            throw new IllegalArgumentException(name + " must be a Wire SHA-256 digest");
        }
        return value;
    }

    static String boundedText(String value, String name, int maximumLength) {
        text(value, name);
        if (value.length() > maximumLength) {
            throw new IllegalArgumentException(name + " exceeds its limit");
        }
        return value;
    }

    static Instant requireUtcMillis(Instant value, String name) {
        Objects.requireNonNull(value, name);
        if (!value.equals(value.truncatedTo(ChronoUnit.MILLIS))) {
            throw new IllegalArgumentException(name + " must use UTC millisecond precision");
        }
        return value;
    }

    private static void requireExact(String value, String expected, String name) {
        if (!expected.equals(value)) {
            throw new IllegalArgumentException(name + " is unsupported");
        }
    }
}
