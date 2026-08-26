package com.robothree.central.modelgateway.application;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;

import java.time.Duration;
import java.util.Objects;

public record ModelInvocationRuntimePolicy(
        String policyRevision,
        Duration leaseTtl,
        Duration leaseRenewalInterval,
        Duration maximumProviderRequestDuration,
        Duration maximumProviderStreamIdle,
        Duration recoveryQueryDeadline,
        int maximumEphemeralEvents,
        int maximumEphemeralUtf8Bytes) {

    public ModelInvocationRuntimePolicy {
        policyRevision = digest(policyRevision, "policyRevision");
        bounded(
                leaseTtl,
                Duration.ofSeconds(5),
                Duration.ofMinutes(5),
                "leaseTtl");
        bounded(
                leaseRenewalInterval,
                Duration.ofSeconds(1),
                Duration.ofMinutes(2),
                "leaseRenewalInterval");
        if (leaseRenewalInterval.compareTo(leaseTtl) >= 0) {
            throw new IllegalArgumentException(
                    "leaseRenewalInterval must be less than leaseTtl");
        }
        bounded(
                maximumProviderRequestDuration,
                Duration.ofSeconds(1),
                Duration.ofMinutes(30),
                "maximumProviderRequestDuration");
        bounded(
                maximumProviderStreamIdle,
                Duration.ofSeconds(1),
                Duration.ofMinutes(5),
                "maximumProviderStreamIdle");
        bounded(
                recoveryQueryDeadline,
                Duration.ofSeconds(1),
                Duration.ofMinutes(5),
                "recoveryQueryDeadline");
        if (maximumEphemeralEvents < 1 || maximumEphemeralEvents > 1_024) {
            throw new IllegalArgumentException(
                    "maximumEphemeralEvents is outside its limit");
        }
        if (maximumEphemeralUtf8Bytes < 1_024
                || maximumEphemeralUtf8Bytes > 4 * 1_024 * 1_024) {
            throw new IllegalArgumentException(
                    "maximumEphemeralUtf8Bytes is outside its limit");
        }
    }

    public static ModelInvocationRuntimePolicy developmentDefaults() {
        return new ModelInvocationRuntimePolicy(
                "2".repeat(64),
                Duration.ofSeconds(30),
                Duration.ofSeconds(10),
                Duration.ofMinutes(5),
                Duration.ofSeconds(30),
                Duration.ofSeconds(30),
                256,
                512 * 1_024);
    }

    private static void bounded(
            Duration value,
            Duration minimum,
            Duration maximum,
            String name) {
        Objects.requireNonNull(value, name);
        if (value.compareTo(minimum) < 0 || value.compareTo(maximum) > 0) {
            throw new IllegalArgumentException(name + " is outside its limit");
        }
    }
}
