package com.robothree.central.admincontrol.application;

import com.fasterxml.jackson.databind.node.ObjectNode;

public record AdminReadResult(int httpStatus, ObjectNode body, String etag) {

    public static AdminReadResult ok(ObjectNode body, String etag) {
        return new AdminReadResult(200, body, etag);
    }

    public static AdminReadResult notModified(String etag) {
        return new AdminReadResult(304, null, etag);
    }
}
