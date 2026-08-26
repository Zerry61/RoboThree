package com.robothree.central.modelgateway.port;

import java.util.UUID;

public interface ModelInvocationEphemeralPublisher {

    default void publishStarted(UUID invocationId) {}

    void publishText(UUID invocationId, String delta);

    default void publishToolCall(
            UUID invocationId,
            UUID toolCallId,
            String name,
            String argumentsJson,
            String argumentsDigest) {}

    void clear(UUID invocationId);
}
