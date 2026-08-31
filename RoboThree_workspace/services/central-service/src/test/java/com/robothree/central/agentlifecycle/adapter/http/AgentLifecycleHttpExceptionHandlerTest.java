package com.robothree.central.agentlifecycle.adapter.http;

import static org.assertj.core.api.Assertions.assertThat;
import com.robothree.central.agentlifecycle.application.AgentLifecycleException;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

class AgentLifecycleHttpExceptionHandlerTest {
    private static final UUID CORRELATION_ID =
            UUID.fromString("00000000-0000-4000-8000-000000000321");

    @Test
    void projectsBusinessFailuresIntoTheStrictLifecycleSafeError() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-RoboThree-Correlation-Id", CORRELATION_ID.toString());
        var response = new AgentLifecycleHttpExceptionHandler()
                .lifecycle(AgentLifecycleException.conflict(), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().contractVersion())
                .isEqualTo("agent-lifecycle.v1alpha1");
        assertThat(response.getBody().errorCode())
                .isEqualTo("agentlifecycle.revision_conflict");
        assertThat(response.getBody().safeSummary()).isNotBlank();
        assertThat(response.getBody().correlationId()).isEqualTo(CORRELATION_ID);
    }
}
