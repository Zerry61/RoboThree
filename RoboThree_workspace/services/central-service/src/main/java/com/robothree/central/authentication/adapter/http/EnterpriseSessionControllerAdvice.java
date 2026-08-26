package com.robothree.central.authentication.adapter.http;

import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.PersistenceIntegrityException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = EnterpriseSessionController.class)
@ConditionalOnProperty(
        name = "robothree.enterprise-session.enabled",
        havingValue = "true")
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public final class EnterpriseSessionControllerAdvice {

    private static final Set<String> ALLOWED = Set.of(
            "enterprise_identity_handle_invalid",
            "enterprise_identity_handle_drift",
            "device_challenge_expired",
            "device_challenge_replayed",
            "device_signature_invalid",
            "device_context_mismatch",
            "device_not_managed",
            "device_not_compliant",
            "permission_denied",
            "compatibility_incompatible",
            "access_token_invalid",
            "access_token_profile_ambiguous",
            "enterprise_session_unavailable",
            "enterprise_session_conflict",
            "internal");
    private static final Map<String, String> ALIASES = Map.of(
            "device_proof_invalid", "device_signature_invalid",
            "enterprise_session_commit_mismatch", "internal");

    @ExceptionHandler(EnterpriseAuthenticationException.class)
    ResponseEntity<EnterpriseSessionHttpModels.ErrorResponse> authentication(
            EnterpriseAuthenticationException exception) {
        String code = safeCode(exception.code());
        HttpStatus status = switch (exception.category()) {
            case "validation" -> HttpStatus.BAD_REQUEST;
            case "authentication" -> HttpStatus.UNAUTHORIZED;
            case "authorization" -> HttpStatus.FORBIDDEN;
            case "conflict" -> HttpStatus.CONFLICT;
            case "service" -> HttpStatus.SERVICE_UNAVAILABLE;
            default -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
        return error(status, code, exception.retryable(), exception.safeSummary());
    }

    @ExceptionHandler(PersistenceConflictException.class)
    ResponseEntity<EnterpriseSessionHttpModels.ErrorResponse> conflict(
            PersistenceConflictException ignored) {
        return error(
                HttpStatus.CONFLICT,
                "enterprise_session_conflict",
                false,
                "The enterprise session request conflicts with persisted state.");
    }

    @ExceptionHandler(PersistenceIntegrityException.class)
    ResponseEntity<EnterpriseSessionHttpModels.ErrorResponse> integrity(
            PersistenceIntegrityException ignored) {
        return error(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "internal",
                false,
                "The enterprise session state could not be safely verified.");
    }

    @ExceptionHandler({
        HttpMessageNotReadableException.class,
        HttpMediaTypeNotSupportedException.class,
        IllegalArgumentException.class,
        EnterpriseSessionRequestSizeFilter.RequestBodyTooLargeException.class
    })
    ResponseEntity<EnterpriseSessionHttpModels.ErrorResponse> invalidRequest(Exception ignored) {
        HttpStatus status = ignored instanceof EnterpriseSessionRequestSizeFilter.RequestBodyTooLargeException
                ? HttpStatus.PAYLOAD_TOO_LARGE
                : HttpStatus.BAD_REQUEST;
        return error(
                status,
                "internal",
                false,
                "The Enterprise Session request is invalid.");
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<EnterpriseSessionHttpModels.ErrorResponse> unexpected(Exception ignored) {
        return error(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "internal",
                false,
                "The Enterprise Session request could not be safely completed.");
    }

    private static String safeCode(String value) {
        String alias = ALIASES.getOrDefault(value, value);
        return ALLOWED.contains(alias) ? alias : "internal";
    }

    private static ResponseEntity<EnterpriseSessionHttpModels.ErrorResponse> error(
            HttpStatus status,
            String code,
            boolean retryable,
            String message) {
        return ResponseEntity.status(status)
                .cacheControl(CacheControl.noStore())
                .body(new EnterpriseSessionHttpModels.ErrorResponse(
                        "enterprise_session_error",
                        EnterpriseSessionHttpModels.SCHEMA_VERSION,
                        code,
                        message,
                        retryable,
                        UUID.randomUUID()));
    }
}
