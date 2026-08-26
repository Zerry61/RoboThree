package com.robothree.central.shared.adapter.http;

import java.util.UUID;

public final class GatewayErrorResponseFactory {

    private GatewayErrorResponseFactory() {}

    public static GatewayErrorResponse create(
            String code,
            String category,
            boolean retryable,
            String safeSummary) {
        return new GatewayErrorResponse(
                "v1alpha1",
                code,
                category,
                retryable,
                safeSummary,
                UUID.randomUUID());
    }

    public static GatewayErrorResponse invalidAccessToken() {
        return create(
                "access_token_invalid",
                "authentication",
                false,
                "A valid enterprise access token is required.");
    }
}
