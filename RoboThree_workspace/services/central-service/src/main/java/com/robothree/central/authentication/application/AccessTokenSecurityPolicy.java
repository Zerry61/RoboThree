package com.robothree.central.authentication.application;

import java.time.Duration;
import java.util.Objects;

public record AccessTokenSecurityPolicy(
        Duration tokenTtl,
        Duration allowedClockSkew,
        String issuer,
        String audience) {

    private static final Duration MAXIMUM_TTL = Duration.ofMinutes(30);
    private static final Duration MAXIMUM_CLOCK_SKEW = Duration.ofSeconds(60);

    public AccessTokenSecurityPolicy {
        Objects.requireNonNull(tokenTtl, "tokenTtl");
        if (tokenTtl.isNegative()
                || tokenTtl.isZero()
                || tokenTtl.compareTo(MAXIMUM_TTL) > 0) {
            throw new IllegalArgumentException(
                    "tokenTtl must be positive and at most 30 minutes");
        }
        Objects.requireNonNull(allowedClockSkew, "allowedClockSkew");
        if (allowedClockSkew.isNegative()
                || allowedClockSkew.compareTo(MAXIMUM_CLOCK_SKEW) > 0) {
            throw new IllegalArgumentException(
                    "allowedClockSkew must be non-negative and at most 60 seconds");
        }
        if (issuer == null || issuer.isBlank() || audience == null || audience.isBlank()) {
            throw new IllegalArgumentException("token issuer and audience are required");
        }
    }

    public static AccessTokenSecurityPolicy alphaDefaults() {
        return new AccessTokenSecurityPolicy(
                Duration.ofMinutes(15),
                Duration.ofSeconds(30),
                "robothree.central",
                "robothree.enterprise-gateway");
    }
}
