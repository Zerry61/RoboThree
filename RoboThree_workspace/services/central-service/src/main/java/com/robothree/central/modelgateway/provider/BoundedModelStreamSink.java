package com.robothree.central.modelgateway.provider;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.port.ModelStreamSink;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

public final class BoundedModelStreamSink implements ModelStreamSink {

    private final ModelStreamSink delegate;
    private final int maximumEvents;
    private final long maximumUtf8Bytes;
    private int eventCount;
    private long utf8Bytes;
    private boolean terminal;
    private boolean usageReceived;

    public BoundedModelStreamSink(
            ModelStreamSink delegate,
            int maximumEvents,
            long maximumUtf8Bytes) {
        this.delegate = Objects.requireNonNull(delegate, "delegate");
        if (maximumEvents < 1 || maximumEvents > 65_536) {
            throw new IllegalArgumentException("maximumEvents is invalid");
        }
        if (maximumUtf8Bytes < 1 || maximumUtf8Bytes > 67_108_864) {
            throw new IllegalArgumentException("maximumUtf8Bytes is invalid");
        }
        this.maximumEvents = maximumEvents;
        this.maximumUtf8Bytes = maximumUtf8Bytes;
    }

    @Override
    public synchronized void accept(ModelProviderStreamEvent event) {
        Objects.requireNonNull(event, "event");
        if (terminal) {
            throw protocol("model_gateway.provider_event_after_terminal");
        }
        eventCount++;
        if (eventCount > maximumEvents) {
            throw protocol("model_gateway.provider_event_limit_exceeded");
        }
        utf8Bytes += eventBytes(event);
        if (utf8Bytes > maximumUtf8Bytes) {
            throw protocol("model_gateway.provider_stream_limit_exceeded");
        }
        if (event instanceof ModelProviderStreamEvent.Terminal) {
            terminal = true;
        } else if (event instanceof ModelProviderStreamEvent.Usage) {
            if (usageReceived) {
                throw protocol("model_gateway.provider_usage_duplicate");
            }
            usageReceived = true;
        }
        delegate.accept(event);
    }

    @Override
    public boolean cancellationRequested() {
        return delegate.cancellationRequested();
    }

    public synchronized boolean terminalReceived() {
        return terminal;
    }

    private static long eventBytes(ModelProviderStreamEvent event) {
        if (event instanceof ModelProviderStreamEvent.TextDelta delta) {
            return bytes(delta.text());
        }
        if (event instanceof ModelProviderStreamEvent.ToolCallDelta delta) {
            return bytes(delta.providerToolCallId())
                    + bytes(delta.name())
                    + bytes(delta.argumentsFragment());
        }
        if (event instanceof ModelProviderStreamEvent.Terminal terminalEvent) {
            return bytes(terminalEvent.finishReason());
        }
        return 16;
    }

    private static int bytes(String value) {
        return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
    }

    private static ModelGatewayException protocol(String code) {
        return ModelGatewayException.validation(
                code,
                "The provider stream violated the protocol.");
    }
}
