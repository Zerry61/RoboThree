package com.robothree.central.admincontrol.adapter.http;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.application.AdminReadException;
import com.robothree.central.admincontrol.application.AdminReadProjectionService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = AdminReadHttpController.class)
@Profile({"development", "test"})
@ConditionalOnProperty(
        name = "robothree.admin-api.test-read-shell-enabled",
        havingValue = "true")
public final class AdminReadHttpExceptionHandler {

    private static final ObjectMapper JSON = new ObjectMapper();

    @ExceptionHandler(AdminReadException.class)
    ResponseEntity<ObjectNode> expected(AdminReadException exception, HttpServletRequest request) {
        return response(exception, correlationId(request));
    }

    @ExceptionHandler({MissingRequestHeaderException.class, IllegalArgumentException.class})
    ResponseEntity<ObjectNode> invalid(Exception ignored, HttpServletRequest request) {
        return response(AdminReadException.invalidRequest(), correlationId(request));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ObjectNode> unexpected(Exception ignored, HttpServletRequest request) {
        return response(AdminReadException.internal(), correlationId(request));
    }

    private static ResponseEntity<ObjectNode> response(
            AdminReadException exception, String correlationId) {
        ObjectNode error = JSON.createObjectNode();
        error.put("kind", "admin_control_error");
        error.put("contractVersion", AdminReadProjectionService.CONTRACT_VERSION);
        error.put("errorCode", exception.errorCode());
        error.put("httpStatus", Integer.toString(exception.httpStatus()));
        error.put("safeSummary", exception.safeSummary());
        error.put("retryable", exception.retryable());
        error.put("correlationId", correlationId);
        return ResponseEntity.status(exception.httpStatus())
                .cacheControl(CacheControl.noStore())
                .body(error);
    }

    private static String correlationId(HttpServletRequest request) {
        String supplied = request.getHeader("X-RoboThree-Correlation-Id");
        try {
            return UUID.fromString(supplied).toString();
        } catch (RuntimeException exception) {
            return UUID.nameUUIDFromBytes("admin-invalid-correlation".getBytes()).toString();
        }
    }
}
