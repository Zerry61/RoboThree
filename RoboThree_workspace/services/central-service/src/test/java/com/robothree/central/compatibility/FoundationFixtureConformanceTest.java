package com.robothree.central.compatibility;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import org.junit.jupiter.api.Test;

class FoundationFixtureConformanceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void javaProjectionMatchesSharedJsonFixture() throws IOException {
        try (InputStream input = getClass()
                .getResourceAsStream("/conformance/cgf-foundation.fixture.json")) {
            assertThat(input).isNotNull();
            JsonNode expected = objectMapper.readTree(input);
            JsonNode actual = objectMapper.valueToTree(FoundationFixtureProjection.ready());
            assertThat(actual).isEqualTo(expected);
        }
    }
}
