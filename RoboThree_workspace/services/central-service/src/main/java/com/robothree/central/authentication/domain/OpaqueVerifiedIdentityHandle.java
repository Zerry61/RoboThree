package com.robothree.central.authentication.domain;

import java.util.Objects;
import java.util.regex.Pattern;

public record OpaqueVerifiedIdentityHandle(String value) {

    private static final Pattern BASE64_URL = Pattern.compile("^[A-Za-z0-9_-]{32,512}$");

    public OpaqueVerifiedIdentityHandle {
        Objects.requireNonNull(value, "value");
        if (!BASE64_URL.matcher(value).matches()) {
            throw new IllegalArgumentException(
                    "verified identity handle must be a bounded base64url opaque value");
        }
    }

    @Override
    public String toString() {
        return "OpaqueVerifiedIdentityHandle[REDACTED]";
    }
}
