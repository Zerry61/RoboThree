package com.robothree.central.authentication.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record DeviceProof(
        UUID challengeId,
        String deviceKeyId,
        String algorithm,
        String signature,
        Instant signedAt) {

    public DeviceProof {
        Objects.requireNonNull(challengeId, "challengeId");
        text(deviceKeyId, "deviceKeyId");
        text(algorithm, "algorithm");
        text(signature, "signature");
        Objects.requireNonNull(signedAt, "signedAt");
        if (deviceKeyId.length() < 3 || deviceKeyId.length() > 160) {
            throw new IllegalArgumentException(
                    "deviceKeyId length is outside the Contract boundary");
        }
        if (algorithm.length() < 2
                || algorithm.length() > 32
                || !algorithm.matches("^[A-Za-z][A-Za-z0-9._-]+$")) {
            throw new IllegalArgumentException("algorithm is outside the Contract boundary");
        }
        if (signature.length() < 32
                || signature.length() > 8192
                || !signature.matches("^[A-Za-z0-9_-]+$")) {
            throw new IllegalArgumentException("signature is outside the Contract boundary");
        }
    }
}
