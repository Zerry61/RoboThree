package com.robothree.central.authentication.port;

import java.util.Objects;

final class EnterpriseSessionPortChecks {

    private EnterpriseSessionPortChecks() {}

    static String boundedOpaqueRevision(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > 160) {
            throw new IllegalArgumentException(name + " is missing or exceeds its limit");
        }
        return value;
    }
}
