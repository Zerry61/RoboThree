package com.robothree.central.modelgateway.application;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Consumer;

public final class ModelInvocationEphemeralBuffer {

    private final int maximumEvents;
    private final int maximumUtf8Bytes;
    private final Map<UUID, Buffer> buffers = new HashMap<>();
    private final Map<UUID, Map<UUID, Consumer<EphemeralEvent>>> subscribers =
            new HashMap<>();

    public synchronized EphemeralEvent appendStarted(
            UUID invocationId,
            Instant occurredAt) {
        return append(invocationId, "started", "{}", null, occurredAt);
    }

    public ModelInvocationEphemeralBuffer(
            int maximumEvents,
            int maximumUtf8Bytes) {
        if (maximumEvents < 1 || maximumUtf8Bytes < 1) {
            throw new IllegalArgumentException("ephemeral buffer limits must be positive");
        }
        this.maximumEvents = maximumEvents;
        this.maximumUtf8Bytes = maximumUtf8Bytes;
    }

    public synchronized EphemeralEvent appendText(
            UUID invocationId,
            String delta,
            Instant occurredAt) {
        Objects.requireNonNull(invocationId, "invocationId");
        Objects.requireNonNull(delta, "delta");
        Objects.requireNonNull(occurredAt, "occurredAt");
        if (delta.isEmpty() || delta.length() > 65_536) {
            throw new IllegalArgumentException("ephemeral delta is invalid");
        }
        return append(invocationId, "text_delta", null, delta, occurredAt);
    }

    public synchronized EphemeralEvent appendToolCall(
            UUID invocationId,
            String payloadJson,
            Instant occurredAt) {
        Objects.requireNonNull(payloadJson, "payloadJson");
        return append(invocationId, "tool_call", payloadJson, null, occurredAt);
    }

    public synchronized AutoCloseable subscribe(
            UUID invocationId,
            Consumer<EphemeralEvent> consumer) {
        Objects.requireNonNull(invocationId, "invocationId");
        Objects.requireNonNull(consumer, "consumer");
        UUID subscriptionId = UUID.randomUUID();
        subscribers.computeIfAbsent(invocationId, ignored -> new HashMap<>())
                .put(subscriptionId, consumer);
        return () -> unsubscribe(invocationId, subscriptionId);
    }

    public synchronized int subscriberCount(UUID invocationId) {
        return subscribers.getOrDefault(invocationId, Map.of()).size();
    }

    private EphemeralEvent append(
            UUID invocationId,
            String eventType,
            String payloadJson,
            String delta,
            Instant occurredAt) {
        Buffer buffer = buffers.computeIfAbsent(invocationId, ignored -> new Buffer());
        EphemeralEvent event = new EphemeralEvent(
                ++buffer.lastSequence,
                eventType,
                payloadJson,
                delta,
                occurredAt);
        buffer.events.addLast(event);
        buffer.utf8Bytes += bytes(event);
        while (buffer.events.size() > maximumEvents
                || buffer.utf8Bytes > maximumUtf8Bytes) {
            EphemeralEvent removed = buffer.events.removeFirst();
            buffer.utf8Bytes -= bytes(removed);
            buffer.droppedEvents++;
        }
        for (Consumer<EphemeralEvent> subscriber :
                List.copyOf(subscribers.getOrDefault(invocationId, Map.of()).values())) {
            try {
                subscriber.accept(event);
            } catch (RuntimeException ignored) {
                // A slow or failed subscriber cannot change durable execution.
            }
        }
        return event;
    }

    public synchronized Snapshot snapshot(UUID invocationId) {
        Buffer buffer = buffers.get(invocationId);
        if (buffer == null) {
            return new Snapshot(List.of(), 0, 0, 0);
        }
        return new Snapshot(
                List.copyOf(buffer.events),
                buffer.lastSequence,
                buffer.droppedEvents,
                buffer.utf8Bytes);
    }

    public synchronized void clear(UUID invocationId) {
        buffers.remove(invocationId);
    }

    private synchronized void unsubscribe(UUID invocationId, UUID subscriptionId) {
        Map<UUID, Consumer<EphemeralEvent>> current = subscribers.get(invocationId);
        if (current == null) {
            return;
        }
        current.remove(subscriptionId);
        if (current.isEmpty()) {
            subscribers.remove(invocationId);
        }
    }

    private static int bytes(EphemeralEvent event) {
        String value = event.delta() != null ? event.delta() : event.payloadJson();
        return value.getBytes(StandardCharsets.UTF_8).length;
    }

    public record EphemeralEvent(
            long streamSequence,
            String eventType,
            String payloadJson,
            String delta,
            Instant occurredAt) {

        public EphemeralEvent {
            if (!"started".equals(eventType)
                    && !"text_delta".equals(eventType)
                    && !"tool_call".equals(eventType)) {
                throw new IllegalArgumentException("ephemeral event type is invalid");
            }
            if ("text_delta".equals(eventType) != (delta != null)) {
                throw new IllegalArgumentException("text delta payload is invalid");
            }
            if (!"text_delta".equals(eventType) != (payloadJson != null)) {
                throw new IllegalArgumentException("ephemeral JSON payload is invalid");
            }
        }
    }

    public record Snapshot(
            List<EphemeralEvent> events,
            long lastSequence,
            long droppedEvents,
            int utf8Bytes) {

        public Snapshot {
            events = List.copyOf(new ArrayList<>(events));
        }
    }

    private static final class Buffer {
        private final ArrayDeque<EphemeralEvent> events = new ArrayDeque<>();
        private long lastSequence;
        private long droppedEvents;
        private int utf8Bytes;
    }
}
