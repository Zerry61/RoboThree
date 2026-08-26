package com.robothree.central.authentication.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.text;

public record DevicePublicKey(
        String keyId,
        String algorithm,
        String format,
        String encodedKey) {

    public DevicePublicKey {
        text(keyId, "keyId");
        text(algorithm, "algorithm");
        text(format, "format");
        text(encodedKey, "encodedKey");
        if (keyId.length() < 3 || keyId.length() > 160) {
            throw new IllegalArgumentException("keyId length is outside the Contract boundary");
        }
        if (algorithm.length() < 2
                || algorithm.length() > 32
                || !algorithm.matches("^[A-Za-z][A-Za-z0-9._-]+$")) {
            throw new IllegalArgumentException("algorithm is outside the Contract boundary");
        }
        if (!format.equals("spki_der_base64")
                && !format.equals("x509_certificate_pem")) {
            throw new IllegalArgumentException("public key format is unsupported");
        }
        if (encodedKey.length() < 32 || encodedKey.length() > 16384) {
            throw new IllegalArgumentException(
                    "encodedKey length is outside the Contract boundary");
        }
    }
}
