package com.robothree.central.support;

import com.robothree.central.authentication.port.AuthenticationEntropySource;
import java.util.concurrent.atomic.AtomicLong;
import java.util.UUID;

public final class DeterministicAuthenticationEntropy
        implements AuthenticationEntropySource {

    private final AtomicLong sequence = new AtomicLong(1);

    @Override
    public UUID nextUuid() {
        return new UUID(0x0000000000004000L, 0x8000000000000000L | sequence.getAndIncrement());
    }

    @Override
    public byte[] nextBytes(int length) {
        byte[] value = new byte[length];
        long seed = sequence.getAndIncrement();
        for (int index = 0; index < length; index++) {
            value[index] = (byte) (seed + index);
        }
        return value;
    }
}
