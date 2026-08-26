package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record ProviderUsageFact(
        UUID usageFactId,
        UsageAuthority usageAuthority,
        UUID authorityInvocationId,
        String providerAttemptKey,
        long fencingEpoch,
        String usageDigest,
        String sourceProtocol,
        String reportingSemanticsRevision,
        long providerInputTokens,
        long providerOutputTokens,
        Long cacheReadInputTokens,
        Long cacheWriteInputTokens,
        Long reasoningOutputTokens,
        long normalizedTotalInputTokens,
        AttemptDisposition attemptDisposition,
        Instant recordedAt) {

    public ProviderUsageFact {
        Objects.requireNonNull(usageFactId, "usageFactId");
        Objects.requireNonNull(usageAuthority, "usageAuthority");
        Objects.requireNonNull(authorityInvocationId, "authorityInvocationId");
        providerAttemptKey = digest(providerAttemptKey, "providerAttemptKey");
        usageDigest = digest(usageDigest, "usageDigest");
        sourceProtocol = text(sourceProtocol, "sourceProtocol");
        reportingSemanticsRevision = digest(
                reportingSemanticsRevision,
                "reportingSemanticsRevision");
        if (fencingEpoch < 1
                || providerInputTokens < 0
                || providerOutputTokens < 0
                || normalizedTotalInputTokens < 0) {
            throw new IllegalArgumentException("Provider Usage values are invalid");
        }
        requireOptionalNonNegative(cacheReadInputTokens, "cacheReadInputTokens");
        requireOptionalNonNegative(cacheWriteInputTokens, "cacheWriteInputTokens");
        requireOptionalNonNegative(reasoningOutputTokens, "reasoningOutputTokens");
        Objects.requireNonNull(attemptDisposition, "attemptDisposition");
        Objects.requireNonNull(recordedAt, "recordedAt");
        ProviderUsageFacts.validate(
                usageAuthority,
                authorityInvocationId,
                providerAttemptKey,
                fencingEpoch,
                usageDigest,
                sourceProtocol,
                reportingSemanticsRevision,
                providerInputTokens,
                providerOutputTokens,
                cacheReadInputTokens,
                cacheWriteInputTokens,
                reasoningOutputTokens,
                normalizedTotalInputTokens,
                attemptDisposition);
    }

    public ModelProviderAttempt.AttemptIdentity attemptIdentity() {
        return new ModelProviderAttempt.AttemptIdentity(
                usageAuthority,
                authorityInvocationId,
                providerAttemptKey);
    }

    public enum AttemptDisposition {
        TERMINAL_WINNER("terminal_winner"),
        SUPERSEDED_CONFIRMED("superseded_confirmed");

        private final String contractValue;

        AttemptDisposition(String contractValue) {
            this.contractValue = contractValue;
        }

        public String contractValue() {
            return contractValue;
        }

        public static AttemptDisposition fromContractValue(String value) {
            for (AttemptDisposition disposition : values()) {
                if (disposition.contractValue.equals(value)) {
                    return disposition;
                }
            }
            throw new IllegalArgumentException("unknown attempt disposition");
        }
    }

    private static void requireOptionalNonNegative(Long value, String name) {
        if (value != null && value < 0) {
            throw new IllegalArgumentException(name + " must not be negative");
        }
    }
}
