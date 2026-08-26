package com.robothree.central.authentication.adapter.security;

import com.robothree.central.authentication.port.AuthenticationEntropySource;
import java.security.SecureRandom;
import java.util.UUID;

public final class SecureAuthenticationEntropySource implements AuthenticationEntropySource {

    private final SecureRandom secureRandom = new SecureRandom();

    @Override
    public UUID nextUuid() {
        return UUID.randomUUID();
    }

    @Override
    public byte[] nextBytes(int length) {
        if (length < 16) {
            throw new IllegalArgumentException("security entropy length must be at least 16 bytes");
        }
        byte[] value = new byte[length];
        secureRandom.nextBytes(value);
        return value;
    }
}
