package com.robothree.central.skilllifecycle.adapter.http;

import com.robothree.central.admincontrol.application.AdminReadException;
import com.robothree.central.skilllifecycle.application.SkillLifecycleException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Keeps raw parser, storage and identity failures outside the Skill lifecycle API. */
@RestControllerAdvice(assignableTypes = {
    AdminSkillLifecycleHttpController.class,
    SkillLifecycleHttpController.class
})
public final class SkillLifecycleHttpExceptionHandler {
    private static final String CORRELATION_HEADER = "X-RoboThree-Correlation-Id";

    @ExceptionHandler(SkillLifecycleException.class)
    ResponseEntity<SafeError> lifecycle(
            SkillLifecycleException exception, HttpServletRequest request) {
        HttpStatus status = switch (exception.code()) {
            case "skilllifecycle.unauthorized" -> HttpStatus.UNAUTHORIZED;
            case "skilllifecycle.not_found" -> HttpStatus.NOT_FOUND;
            case "skilllifecycle.revision_conflict", "skilllifecycle.submission_conflict",
                    "skilllifecycle.release_conflict" -> HttpStatus.CONFLICT;
            case "skilllifecycle.service_unavailable" -> HttpStatus.SERVICE_UNAVAILABLE;
            default -> HttpStatus.BAD_REQUEST;
        };
        return error(status, exception.code(), exception.getMessage(), request,
                status == HttpStatus.SERVICE_UNAVAILABLE);
    }

    @ExceptionHandler(AdminReadException.class)
    ResponseEntity<SafeError> adminIdentity(
            AdminReadException exception, HttpServletRequest request) {
        return error(HttpStatus.FORBIDDEN, "skilllifecycle.unauthorized",
                "当前管理员不能执行此技能操作。", request, false);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<SafeError> unexpected(Exception exception, HttpServletRequest request) {
        return error(HttpStatus.SERVICE_UNAVAILABLE, "skilllifecycle.service_unavailable",
                "技能服务暂时不可用，请稍后重试。", request, true);
    }

    private static ResponseEntity<SafeError> error(
            HttpStatus status,
            String code,
            String summary,
            HttpServletRequest request,
            boolean retryable) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store")
                .body(new SafeError("skill-lifecycle.v1alpha1", code, summary,
                        correlationId(request), retryable));
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
            UUID correlationId,
            boolean retryable) {}
}
