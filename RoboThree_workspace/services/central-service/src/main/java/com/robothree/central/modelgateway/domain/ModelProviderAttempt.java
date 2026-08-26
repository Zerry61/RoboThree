package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record ModelProviderAttempt(
        UsageAuthority usageAuthority,
        UUID authorityInvocationId,
        String providerAttemptKey,
        long fencingEpoch,
        Instant registeredAt) {

    public ModelProviderAttempt {
        Objects.requireNonNull(usageAuthority, "usageAuthority");
        Objects.requireNonNull(authorityInvocationId, "authorityInvocationId");
        providerAttemptKey = digest(providerAttemptKey, "providerAttemptKey");
        if (fencingEpoch < 1) {
            throw new IllegalArgumentException("fencingEpoch must be positive");
        }
        Objects.requireNonNull(registeredAt, "registeredAt");
    }

    public AttemptIdentity identity() {
        return new AttemptIdentity(
                usageAuthority,
                authorityInvocationId,
                providerAttemptKey);
    }

    public record AttemptIdentity(
            UsageAuthority usageAuthority,
            UUID authorityInvocationId,
            String providerAttemptKey) {

        public AttemptIdentity {
            Objects.requireNonNull(usageAuthority, "usageAuthority");
            Objects.requireNonNull(authorityInvocationId, "authorityInvocationId");
            providerAttemptKey = digest(providerAttemptKey, "providerAttemptKey");
        }
    }
}
