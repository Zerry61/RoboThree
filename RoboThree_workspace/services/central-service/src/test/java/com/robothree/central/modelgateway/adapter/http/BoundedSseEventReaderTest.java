package com.robothree.central.modelgateway.adapter.http;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.modelgateway.application.ModelGatewayException;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

class BoundedSseEventReaderTest {

    @Test
    void absoluteDeadlineStopsAContinuouslyActiveStream() throws Exception {
        AtomicBoolean writerStopped = new AtomicBoolean();
        try (PipedInputStream input = new PipedInputStream();
                PipedOutputStream output = new PipedOutputStream(input)) {
            Thread writer = Thread.ofVirtual().start(() -> {
                try (output) {
                    while (true) {
                        output.write("data: {\"delta\":\"still-running\"}\n\n"
                                .getBytes(StandardCharsets.UTF_8));
                        output.flush();
                        Thread.sleep(15);
                    }
                } catch (Exception expectedAfterReaderCloses) {
                    writerStopped.set(true);
                }
            });

            assertThatThrownBy(() -> BoundedSseEventReader.read(
                            input,
                            Duration.ofSeconds(1),
                            Duration.ofMillis(120),
                            4_096,
                            1_048_576,
                            () -> false,
                            frame -> {}))
                    .isInstanceOfSatisfying(
                            ModelGatewayException.class,
                            error -> assertThat(error.code())
                                    .isEqualTo("model_gateway.provider_request_timeout"));

            writer.join(1_000);
            assertThat(writerStopped).isTrue();
        }
    }
}
