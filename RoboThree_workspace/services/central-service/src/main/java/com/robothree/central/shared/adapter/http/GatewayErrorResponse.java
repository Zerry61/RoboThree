package com.robothree.central.shared.adapter.http;

import java.util.UUID;

public record GatewayErrorResponse(
        String contractVersion,
        String code,
        String category,
        boolean retryable,
        String safeSummary,
        UUID correlationId) {}
