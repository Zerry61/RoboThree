package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;

import java.util.Objects;

public record PromptCacheCompatibility(
        Classification classification,
        String compatibilityFingerprintDigest) {

    public PromptCacheCompatibility {
        Objects.requireNonNull(classification, "classification");
        compatibilityFingerprintDigest = digest(
                compatibilityFingerprintDigest,
                "compatibilityFingerprintDigest");
    }

    public enum Classification {
        COMPATIBLE,
        INCOMPATIBLE_BUT_NO_CACHE_SAFE,
        CACHE_DISABLED_UNTIL_REVIEWED
    }
}
