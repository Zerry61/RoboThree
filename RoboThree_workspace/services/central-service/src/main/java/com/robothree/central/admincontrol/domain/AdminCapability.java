package com.robothree.central.admincontrol.domain;

import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;

public record AdminCapability(
        String key,
        AdminCapabilityState state,
        String safeLabel,
        Optional<String> safeSummary,
        AdminCapabilitySource source) {

    private static final Pattern SAFE_PROVISIONAL_KEY =
            Pattern.compile("admin\\.[a-z]+(\\.[a-z]+){1,3}");

    public AdminCapability(
            String key,
            AdminCapabilityState state,
            String safeLabel,
            String safeSummary,
            AdminCapabilitySource source) {
        this(key, state, safeLabel, Optional.ofNullable(safeSummary), source);
    }

    public AdminCapability {
        if (key == null || !SAFE_PROVISIONAL_KEY.matcher(key).matches()) {
            throw new IllegalArgumentException("admin.capability_key_invalid");
        }
        state = Objects.requireNonNull(state, "state");
        safeLabel = requireNonBlank(safeLabel, "safeLabel");
        safeSummary = Objects.requireNonNull(safeSummary, "safeSummary")
                .map(value -> requireNonBlank(value, "safeSummary"));
        source = Objects.requireNonNull(source, "source");
    }

    private static String requireNonBlank(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }
}
