package com.robothree.central.authentication.domain;

import java.util.Objects;

public record DeviceTrustDecision(
        EnterpriseDevice device,
        boolean trusted) {

    public DeviceTrustDecision {
        Objects.requireNonNull(device, "device");
        if (!trusted) {
            throw new IllegalArgumentException(
                    "untrusted devices must be represented by a typed authentication error");
        }
    }
}
