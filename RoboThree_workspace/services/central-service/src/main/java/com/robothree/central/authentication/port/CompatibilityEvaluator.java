package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.EnterpriseCompatibility;

public interface CompatibilityEvaluator {

    CompatibilityDecision requireCompatible(String clientInstanceId);

    EnterpriseCompatibility current();

    record CompatibilityDecision(long revision) {

        public CompatibilityDecision {
            if (revision < 0) {
                throw new IllegalArgumentException(
                        "compatibility revision must not be negative");
            }
        }
    }
}
