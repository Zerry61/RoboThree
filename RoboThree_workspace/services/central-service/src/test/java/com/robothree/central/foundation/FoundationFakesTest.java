package com.robothree.central.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class FoundationFakesTest {

    @Test
    void fakesAreDeterministicAndExplicitlyScoped() {
        FakeSecretStore secretStore = new FakeSecretStore();
        secretStore.putFixture("fixture-ref", "fixture-value");

        assertThat(secretStore.resolveFixture("fixture-ref")).contains("fixture-value");
        assertThat(new FakeModel().complete("hello")).isEqualTo("fixture-model:hello");
        assertThat(new FakeTool().echo("hello")).isEqualTo("hello");
    }
}
