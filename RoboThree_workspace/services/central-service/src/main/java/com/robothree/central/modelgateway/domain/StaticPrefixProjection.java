package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;

public record StaticPrefixProjection(
        String staticSourceLockDigest,
        String staticPrefixDigest,
        int systemSourceCount,
        int toolSchemaCount,
        String canonicalProjectionRevision,
        boolean hasEligiblePrefix) {

    public StaticPrefixProjection {
        staticSourceLockDigest = digest(staticSourceLockDigest, "staticSourceLockDigest");
        staticPrefixDigest = digest(staticPrefixDigest, "staticPrefixDigest");
        if (systemSourceCount < 0 || toolSchemaCount < 0) {
            throw new IllegalArgumentException("projection counts must not be negative");
        }
        canonicalProjectionRevision = digest(
                canonicalProjectionRevision,
                "canonicalProjectionRevision");
        if (hasEligiblePrefix && systemSourceCount + toolSchemaCount == 0) {
            throw new IllegalArgumentException("eligible prefix must contain static material");
        }
    }
}
