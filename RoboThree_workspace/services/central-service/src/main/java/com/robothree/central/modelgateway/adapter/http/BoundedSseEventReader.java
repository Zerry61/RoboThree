package com.robothree.central.modelgateway.adapter.http;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

public final class BoundedSseEventReader {

    private BoundedSseEventReader() {}

    public static void read(
            InputStream input,
            Duration idleTimeout,
            int maximumFrameBytes,
            long maximumTotalBytes,
            BooleanSupplier cancellationRequested,
            Consumer<SseFrame> consumer) {
        Objects.requireNonNull(input, "input");
        Objects.requireNonNull(idleTimeout, "idleTimeout");
        Objects.requireNonNull(cancellationRequested, "cancellationRequested");
        Objects.requireNonNull(consumer, "consumer");
        if (idleTimeout.isZero() || idleTimeout.isNegative()) {
            throw new IllegalArgumentException("idleTimeout must be positive");
        }
        if (maximumFrameBytes < 1 || maximumTotalBytes < maximumFrameBytes) {
            throw new IllegalArgumentException("SSE limits are invalid");
        }

        ArrayBlockingQueue<Item> queue = new ArrayBlockingQueue<>(64);
        Thread producer = Thread.ofVirtual()
                .name("robothree-model-sse-reader")
                .start(() -> produce(input, maximumFrameBytes, maximumTotalBytes, queue));
        long idleNanos = idleTimeout.toNanos();
        long lastItemAt = System.nanoTime();
        try {
            while (true) {
                if (cancellationRequested.getAsBoolean()) {
                    close(input);
                    throw ModelGatewayException.unavailable(
                            "model_gateway.provider_cancelled",
                            "The model provider request was cancelled.");
                }
                long remainingNanos =
                        idleNanos - (System.nanoTime() - lastItemAt);
                if (remainingNanos <= 0) {
                    close(input);
                    throw ModelGatewayException.unavailable(
                            "model_gateway.provider_stream_idle_timeout",
                            "The model provider stream became idle.");
                }
                Item item = queue.poll(
                        Math.min(remainingNanos, TimeUnit.MILLISECONDS.toNanos(100)),
                        TimeUnit.NANOSECONDS);
                if (item == null) {
                    if (!producer.isAlive()) {
                        throw protocol("model_gateway.provider_stream_incomplete");
                    }
                    continue;
                }
                lastItemAt = System.nanoTime();
                if (item instanceof FrameItem frame) {
                    consumer.accept(frame.frame());
                } else if (item instanceof EndItem) {
                    return;
                } else if (item instanceof ErrorItem error) {
                    throw error.exception();
                }
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            close(input);
            throw ModelGatewayException.unavailable(
                    "model_gateway.provider_cancelled",
                    "The model provider request was cancelled.");
        } finally {
            close(input);
            producer.interrupt();
        }
    }

    private static void produce(
            InputStream input,
            int maximumFrameBytes,
            long maximumTotalBytes,
            ArrayBlockingQueue<Item> queue) {
        long total = 0;
        int frameBytes = 0;
        String event = "message";
        List<String> data = new ArrayList<>();
        try {
            while (true) {
                Line line = readLine(input, maximumFrameBytes);
                if (line == null) {
                    if (!data.isEmpty()) {
                        put(queue, new FrameItem(new SseFrame(
                                event,
                                String.join("\n", data))));
                    }
                    put(queue, EndItem.INSTANCE);
                    return;
                }
                total += line.bytes();
                frameBytes += line.bytes();
                if (total > maximumTotalBytes) {
                    throw protocol("model_gateway.provider_stream_limit_exceeded");
                }
                if (frameBytes > maximumFrameBytes) {
                    throw protocol("model_gateway.provider_frame_oversized");
                }
                if (line.value().isEmpty()) {
                    if (!data.isEmpty()) {
                        put(queue, new FrameItem(new SseFrame(
                                event,
                                String.join("\n", data))));
                    }
                    event = "message";
                    data.clear();
                    frameBytes = 0;
                    continue;
                }
                if (line.value().startsWith(":")) {
                    continue;
                }
                int separator = line.value().indexOf(':');
                String field = separator < 0
                        ? line.value()
                        : line.value().substring(0, separator);
                String value = separator < 0
                        ? ""
                        : line.value().substring(separator + 1);
                if (value.startsWith(" ")) {
                    value = value.substring(1);
                }
                if ("event".equals(field)) {
                    event = value.isBlank() ? "message" : value;
                } else if ("data".equals(field)) {
                    data.add(value);
                }
            }
        } catch (ModelGatewayException exception) {
            put(queue, new ErrorItem(exception));
        } catch (IOException exception) {
            put(queue, new ErrorItem(ModelGatewayException.unavailable(
                    "model_gateway.provider_stream_failed",
                    "The model provider stream failed.")));
        }
    }

    private static Line readLine(InputStream input, int maximumBytes)
            throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        while (true) {
            int next = input.read();
            if (next < 0) {
                if (output.size() == 0) {
                    return null;
                }
                return line(output, output.size());
            }
            if (next == '\n') {
                return line(output, output.size() + 1);
            }
            output.write(next);
            if (output.size() > maximumBytes) {
                throw protocol("model_gateway.provider_frame_oversized");
            }
        }
    }

    private static Line line(ByteArrayOutputStream output, int bytes) {
        byte[] raw = output.toByteArray();
        int length = raw.length;
        if (length > 0 && raw[length - 1] == '\r') {
            length--;
        }
        try {
            String value = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(raw, 0, length))
                    .toString();
            return new Line(value, bytes);
        } catch (CharacterCodingException exception) {
            throw protocol("model_gateway.provider_stream_utf8_invalid");
        }
    }

    private static void put(ArrayBlockingQueue<Item> queue, Item item) {
        try {
            queue.put(item);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }

    private static void close(InputStream input) {
        try {
            input.close();
        } catch (IOException ignored) {
            // Closing a provider stream is best-effort.
        }
    }

    private static ModelGatewayException protocol(String code) {
        return ModelGatewayException.validation(
                code,
                "The model provider stream violated the protocol.");
    }

    public record SseFrame(String event, String data) {

        public SseFrame {
            event = event == null || event.isBlank() ? "message" : event;
            Objects.requireNonNull(data, "data");
        }
    }

    private record Line(String value, int bytes) {}

    private sealed interface Item permits FrameItem, EndItem, ErrorItem {}

    private record FrameItem(SseFrame frame) implements Item {}

    private enum EndItem implements Item {
        INSTANCE
    }

    private record ErrorItem(ModelGatewayException exception) implements Item {}
}
