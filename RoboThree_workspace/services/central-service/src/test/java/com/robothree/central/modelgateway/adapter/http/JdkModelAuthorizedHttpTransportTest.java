package com.robothree.central.modelgateway.adapter.http;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class JdkModelAuthorizedHttpTransportTest {

    @Test
    void boundsResponseStartWithoutShrinkingTheProviderStreamBudget() {
        assertThat(JdkModelAuthorizedHttpTransport.responseStartTimeout(
                Duration.ofMinutes(15)))
                .isEqualTo(Duration.ofSeconds(90));
        assertThat(JdkModelAuthorizedHttpTransport.responseStartTimeout(
                Duration.ofSeconds(20)))
                .isEqualTo(Duration.ofSeconds(20));
    }
}
