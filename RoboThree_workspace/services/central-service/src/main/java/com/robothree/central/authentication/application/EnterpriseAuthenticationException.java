package com.robothree.central.authentication.application;

import java.util.Objects;

public final class EnterpriseAuthenticationException extends RuntimeException {

    private final String code;
    private final String category;
    private final boolean retryable;
    private final String safeSummary;

    public EnterpriseAuthenticationException(
            String code,
            String category,
            boolean retryable,
            String safeSummary) {
        super(Objects.requireNonNull(safeSummary, "safeSummary"));
        this.code = Objects.requireNonNull(code, "code");
        this.category = Objects.requireNonNull(category, "category");
        this.retryable = retryable;
        this.safeSummary = safeSummary;
    }

    public String code() {
        return code;
    }

    public String category() {
        return category;
    }

    public boolean retryable() {
        return retryable;
    }

    public String safeSummary() {
        return safeSummary;
    }

    public static EnterpriseAuthenticationException authentication(
            String code,
            String summary) {
        return new EnterpriseAuthenticationException(code, "authentication", false, summary);
    }

    public static EnterpriseAuthenticationException authorization(
            String code,
            String summary) {
        return new EnterpriseAuthenticationException(code, "authorization", false, summary);
    }

    public static EnterpriseAuthenticationException conflict(
            String code,
            String summary) {
        return new EnterpriseAuthenticationException(code, "conflict", false, summary);
    }

    public static EnterpriseAuthenticationException validation(
            String code,
            String summary) {
        return new EnterpriseAuthenticationException(code, "validation", false, summary);
    }

    public static EnterpriseAuthenticationException service(
            String code,
            boolean retryable,
            String summary) {
        return new EnterpriseAuthenticationException(code, "service", retryable, summary);
    }

    public static EnterpriseAuthenticationException internal(
            String code,
            String summary) {
        return new EnterpriseAuthenticationException(code, "internal", false, summary);
    }
}
