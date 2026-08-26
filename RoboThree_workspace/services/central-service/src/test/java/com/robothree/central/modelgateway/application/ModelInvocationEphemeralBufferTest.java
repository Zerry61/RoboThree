package com.robothree.central.modelgateway.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ModelInvocationEphemeralBufferTest {

    @Test
    void subscribesBeforeExecutionKeepsCanonicalSequenceAndCleansResources() throws Exception {
        var buffer = new ModelInvocationEphemeralBuffer(3, 128);
        UUID invocationId = UUID.randomUUID();
        var observed = new ArrayList<ModelInvocationEphemeralBuffer.EphemeralEvent>();

        AutoCloseable subscription = buffer.subscribe(invocationId, observed::add);
        buffer.appendStarted(invocationId, Instant.parse("2026-08-03T06:00:00Z"));
        buffer.appendText(invocationId, "one", Instant.parse("2026-08-03T06:00:01Z"));
        buffer.appendToolCall(invocationId, "{\"call\":{}}", Instant.parse("2026-08-03T06:00:02Z"));
        buffer.appendText(invocationId, "four", Instant.parse("2026-08-03T06:00:03Z"));

        assertThat(observed).extracting(ModelInvocationEphemeralBuffer.EphemeralEvent::eventType)
                .containsExactly("started", "text_delta", "tool_call", "text_delta");
        assertThat(observed).extracting(ModelInvocationEphemeralBuffer.EphemeralEvent::streamSequence)
                .containsExactly(1L, 2L, 3L, 4L);
        assertThat(buffer.snapshot(invocationId).events()).hasSize(3);
        assertThat(buffer.snapshot(invocationId).droppedEvents()).isEqualTo(1);
        assertThat(buffer.subscriberCount(invocationId)).isEqualTo(1);

        buffer.clear(invocationId);
        assertThat(buffer.snapshot(invocationId).events()).isEmpty();
        assertThat(buffer.subscriberCount(invocationId)).isEqualTo(1);
        subscription.close();
        assertThat(buffer.subscriberCount(invocationId)).isZero();
    }
}
