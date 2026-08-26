package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.domain.CanonicalStaticPromptMaterialPlanner;
import com.robothree.central.modelgateway.domain.StaticPrefixProjection;

/** Projects only leading system sources and exact Tool schemas; no prompt copy is persisted. */
public final class StaticPromptPrefixProjector {

    private final CanonicalStaticPromptMaterialPlanner planner;

    public StaticPromptPrefixProjector() {
        this(new CanonicalStaticPromptMaterialPlanner());
    }

    StaticPromptPrefixProjector(CanonicalStaticPromptMaterialPlanner planner) {
        this.planner = planner;
    }

    public StaticPrefixProjection project(String canonicalProviderRequestJson) {
        var material = planner.plan(canonicalProviderRequestJson);
        return new StaticPrefixProjection(
                material.staticSourceLockDigest(),
                material.staticPrefixDigest(),
                material.leadingSystems().size(),
                material.sortedTools().size(),
                material.canonicalProjectionRevision(),
                material.hasEligiblePrefix());
    }
}
