package com.robothree.central.modelgateway.port;

import java.util.Map;

@FunctionalInterface
public interface ModelOutboundTraceContext {

    Map<String, String> safeHeaders();

    static ModelOutboundTraceContext none() {
        return Map::of;
    }
}
