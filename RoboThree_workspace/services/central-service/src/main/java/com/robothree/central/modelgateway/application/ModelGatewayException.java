package com.robothree.central.modelgateway.application;

import java.util.Objects;

public final class ModelGatewayException extends RuntimeException {

    private final String code;
    private final boolean retryable;
    private final String safeSummary;

    public ModelGatewayException(
            String code,
            boolean retryable,
            String safeSummary) {
        super(Objects.requireNonNull(safeSummary, "safeSummary"));
        this.code = Objects.requireNonNull(code, "code");
        this.retryable = retryable;
        this.safeSummary = safeSummary;
    }

    public String code() {
        return code;
    }

    public boolean retryable() {
        return retryable;
    }

    public String safeSummary() {
        return safeSummary;
    }

    public static ModelGatewayException conflict(String code, String summary) {
        return new ModelGatewayException(code, false, summary);
    }

    public static ModelGatewayException unavailable(String code, String summary) {
        return new ModelGatewayException(code, true, summary);
    }

    public static ModelGatewayException validation(String code, String summary) {
        return new ModelGatewayException(code, false, summary);
    }
}
