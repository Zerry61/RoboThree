package com.robothree.central.compatibility;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.ResponseEntity;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FoundationApplicationSmokeTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void startsTheRealHttpServerAndExposesOnlyTheMarkedFixture() {
        ResponseEntity<FoundationFixtureProjection> response = restTemplate.getForEntity(
                "/foundation/readiness",
                FoundationFixtureProjection.class);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getFirst("X-RoboThree-Fixture")).isEqualTo("true");
        assertThat(response.getBody()).isEqualTo(FoundationFixtureProjection.ready());
    }
}
