package com.robothree.central.modelgateway.development;

import com.robothree.central.modelgateway.port.ModelInvocationEntropySource;
import java.util.UUID;

public final class SecureModelInvocationEntropySource
        implements ModelInvocationEntropySource {

    @Override
    public UUID nextUuid() {
        return UUID.randomUUID();
    }
}
