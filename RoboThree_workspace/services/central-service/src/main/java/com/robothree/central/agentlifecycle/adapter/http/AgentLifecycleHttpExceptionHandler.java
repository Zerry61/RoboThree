package com.robothree.central.agentlifecycle.adapter.http;

import com.robothree.central.agentlifecycle.application.AgentLifecycleException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Keeps the lifecycle HTTP error surface aligned with its strict public Contract. */
@RestControllerAdvice(assignableTypes = {
    AgentLifecycleHttpController.class,
    AgentLifecycleReviewHttpController.class
})
public final class AgentLifecycleHttpExceptionHandler {
    private static final String CORRELATION_HEADER = "X-RoboThree-Correlation-Id";

    @ExceptionHandler(AgentLifecycleException.class)
    ResponseEntity<SafeError> lifecycle(
            AgentLifecycleException exception,
            HttpServletRequest request) {
        HttpStatus status = switch (exception.code()) {
            case "agentlifecycle.unauthorized" -> HttpStatus.UNAUTHORIZED;
            case "agentlifecycle.not_found" -> HttpStatus.NOT_FOUND;
            case "agentlifecycle.revision_conflict",
                    "agentlifecycle.submission_conflict" -> HttpStatus.CONFLICT;
            default -> HttpStatus.BAD_REQUEST;
        };
        return ResponseEntity.status(status)
                .header("Cache-Control", "no-store")
                .body(new SafeError(
                        "agent-lifecycle.v1alpha1",
                        exception.code(),
                        exception.getMessage(),
                        correlationId(request)));
    }

    private static UUID correlationId(HttpServletRequest request) {
        try {
            return UUID.fromString(request.getHeader(CORRELATION_HEADER));
        } catch (RuntimeException ignored) {
            return UUID.randomUUID();
        }
    }

    record SafeError(
            String contractVersion,
            String errorCode,
            String safeSummary,
            UUID correlationId) {}
}
