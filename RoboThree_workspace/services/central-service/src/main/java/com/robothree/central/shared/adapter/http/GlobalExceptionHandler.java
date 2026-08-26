package com.robothree.central.shared.adapter.http;

import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.PersistenceIntegrityException;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.shared.observability.CentralTraceContext;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@ConditionalOnBean(CentralTraceContext.class)
@RequiredArgsConstructor
public final class GlobalExceptionHandler {

    @NonNull
    private final CentralTraceContext traceContext;

    @ExceptionHandler(EnterpriseAuthenticationException.class)
    ResponseEntity<GatewayErrorResponse> authentication(
            EnterpriseAuthenticationException exception) {
        return response(
                status(exception),
                exception.code(),
                responseCategory(exception),
                exception.retryable(),
                exception.safeSummary());
    }

    @ExceptionHandler(PersistenceConflictException.class)
    ResponseEntity<GatewayErrorResponse> persistenceConflict(
            PersistenceConflictException exception) {
        return response(
                HttpStatus.CONFLICT,
                exception.code(),
                "conflict",
                false,
                "The request conflicts with the current persisted state.");
    }

    @ExceptionHandler(PersistenceIntegrityException.class)
    ResponseEntity<GatewayErrorResponse> persistenceIntegrity(
            PersistenceIntegrityException exception) {
        return response(
                HttpStatus.INTERNAL_SERVER_ERROR,
                exception.code(),
                "internal",
                false,
                "The service could not safely verify persisted state.");
    }

    @ExceptionHandler(ModelGatewayException.class)
    ResponseEntity<GatewayErrorResponse> modelGateway(
            ModelGatewayException exception) {
        String category = exception.retryable()
                ? "availability"
                : exception.code().contains("conflict")
                        || exception.code().contains("replayed")
                                ? "conflict"
                                : "validation";
        HttpStatus status = switch (category) {
            case "conflict" -> HttpStatus.CONFLICT;
            case "availability" -> HttpStatus.SERVICE_UNAVAILABLE;
            default -> HttpStatus.BAD_REQUEST;
        };
        return response(
                status,
                exception.code(),
                category,
                exception.retryable(),
                exception.safeSummary());
    }

    @ExceptionHandler({
        HttpMessageNotReadableException.class,
        HttpMediaTypeNotSupportedException.class,
        IllegalArgumentException.class
    })
    ResponseEntity<GatewayErrorResponse> invalidRequest(Exception ignored) {
        return response(
                HttpStatus.BAD_REQUEST,
                "contract_validation_failed",
                "validation",
                false,
                "Request does not satisfy the Enterprise Gateway Contract.");
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<GatewayErrorResponse> unexpected(Exception ignored) {
        return response(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "internal_error",
                "internal",
                false,
                "The service could not safely complete the request.");
    }

    private static HttpStatus status(EnterpriseAuthenticationException exception) {
        return switch (exception.category()) {
            case "validation" -> HttpStatus.BAD_REQUEST;
            case "authentication" -> HttpStatus.UNAUTHORIZED;
            case "authorization" -> HttpStatus.FORBIDDEN;
            case "conflict" -> HttpStatus.CONFLICT;
            case "service" -> HttpStatus.SERVICE_UNAVAILABLE;
            default -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
    }

    private static String responseCategory(EnterpriseAuthenticationException exception) {
        return switch (exception.category()) {
            case "service" -> "availability";
            case "validation",
                    "authentication",
                    "authorization",
                    "conflict",
                    "internal" -> exception.category();
            default -> "internal";
        };
    }

    private ResponseEntity<GatewayErrorResponse> response(
            HttpStatus status,
            String code,
            String category,
            boolean retryable,
            String safeSummary) {
        traceContext.recordHttpError(code, retryable);
        var response = ResponseEntity.status(status)
                .header("Cache-Control", "no-store");
        traceContext.currentTraceId()
                .ifPresent(traceId -> response.header(
                        CentralTraceContext.TRACE_ID_HEADER,
                        traceId));
        return response.body(GatewayErrorResponseFactory.create(
                        code,
                        category,
                        retryable,
                        safeSummary));
    }
}
