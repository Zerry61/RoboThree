package com.robothree.central.modelgateway.adapter.runtime;

import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer;
import com.robothree.central.modelgateway.port.ModelInvocationEphemeralPublisher;
import java.time.Clock;
import java.util.Objects;
import java.util.UUID;

public final class BufferedModelInvocationEphemeralPublisher
        implements ModelInvocationEphemeralPublisher {

    private final ModelInvocationEphemeralBuffer buffer;
    private final Clock clock;

    public BufferedModelInvocationEphemeralPublisher(
            ModelInvocationEphemeralBuffer buffer,
            Clock clock) {
        this.buffer = Objects.requireNonNull(buffer, "buffer");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Override
    public void publishStarted(UUID invocationId) {
        buffer.appendStarted(invocationId, clock.instant());
    }

    @Override
    public void publishText(UUID invocationId, String delta) {
        buffer.appendText(invocationId, delta, clock.instant());
    }

    @Override
    public void publishToolCall(
            UUID invocationId,
            UUID toolCallId,
            String name,
            String argumentsJson,
            String argumentsDigest) {
        String payload = "{\"call\":{\"toolCallId\":\""
                + toolCallId
                + "\",\"name\":"
                + jsonString(name)
                + ",\"arguments\":"
                + argumentsJson
                + ",\"argumentsDigest\":\""
                + argumentsDigest
                + "\"}}";
        buffer.appendToolCall(invocationId, payload, clock.instant());
    }

    @Override
    public void clear(UUID invocationId) {
        try {
            buffer.clear(invocationId);
        } catch (RuntimeException ignored) {
            // Ephemeral cleanup is best-effort and never changes durable facts.
        }
    }

    private static String jsonString(String value) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper()
                    .writeValueAsString(value);
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalArgumentException("Tool Call name is invalid", exception);
        }
    }
}
