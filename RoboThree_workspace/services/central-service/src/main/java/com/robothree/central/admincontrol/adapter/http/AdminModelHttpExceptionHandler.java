package com.robothree.central.admincontrol.adapter.http;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.application.AdminModelMutationException;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = AdminModelHttpController.class)
public final class AdminModelHttpExceptionHandler {
    private static final ObjectMapper JSON = new ObjectMapper();
    @ExceptionHandler(AdminModelMutationException.class)
    ResponseEntity<ObjectNode> handle(AdminModelMutationException exception) {
        ObjectNode body = JSON.createObjectNode(); body.put("kind", "admin_control_error");
        body.put("contractVersion", "admin-control.v1alpha2");
        body.put("errorCode", exception.errorCode()); body.put("httpStatus", String.valueOf(exception.httpStatus()));
        body.put("safeSummary", exception.getMessage());
        body.put("retryable", exception.httpStatus() == 503);
        body.put("correlationId", UUID.randomUUID().toString());
        return ResponseEntity.status(exception.httpStatus()).cacheControl(CacheControl.noStore()).body(body);
    }
}
