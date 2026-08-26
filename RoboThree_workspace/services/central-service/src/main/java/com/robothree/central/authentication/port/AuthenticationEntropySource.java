package com.robothree.central.authentication.port;

import java.util.UUID;

public interface AuthenticationEntropySource {

    UUID nextUuid();

    byte[] nextBytes(int length);
}
