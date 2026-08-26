package com.robothree.central.authentication.application;

import java.time.Duration;
import java.util.Objects;

public record AuthenticationSecurityPolicy(
        Duration verifiedIdentityTtl,
        Duration challengeTtl,
        Duration enrollmentGrantTtl,
        Duration allowedClockSkew,
        String audience,
        boolean manualDeviceEnrollmentEnabled) {

    private static final Duration IDENTITY_MAX = Duration.ofMinutes(10);
    private static final Duration CHALLENGE_MAX = Duration.ofSeconds(120);
    private static final Duration ENROLLMENT_MAX = Duration.ofMinutes(30);
    private static final Duration SKEW_MAX = Duration.ofSeconds(60);

    public AuthenticationSecurityPolicy {
        bounded(verifiedIdentityTtl, IDENTITY_MAX, "verifiedIdentityTtl");
        bounded(challengeTtl, CHALLENGE_MAX, "challengeTtl");
        bounded(enrollmentGrantTtl, ENROLLMENT_MAX, "enrollmentGrantTtl");
        bounded(allowedClockSkew, SKEW_MAX, "allowedClockSkew");
        if (audience == null || audience.isBlank()) {
            throw new IllegalArgumentException("audience must not be blank");
        }
    }

    public static AuthenticationSecurityPolicy alphaDefaults() {
        return new AuthenticationSecurityPolicy(
                Duration.ofMinutes(5),
                Duration.ofSeconds(60),
                Duration.ofMinutes(10),
                Duration.ofSeconds(30),
                "robothree.central",
                true);
    }

    private static void bounded(Duration value, Duration maximum, String name) {
        Objects.requireNonNull(value, name);
        if (value.isNegative() || value.isZero() || value.compareTo(maximum) > 0) {
            throw new IllegalArgumentException(
                    name + " must be positive and at most " + maximum);
        }
    }
}
