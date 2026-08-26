package com.robothree.central.support;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;

public final class FakeDeviceSigner {

    private final KeyPair keyPair;

    public FakeDeviceSigner() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(256);
            keyPair = generator.generateKeyPair();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("EC test provider is unavailable", exception);
        }
    }

    public String getDeviceKeyId() {
        return "fake-device-key";
    }

    public String getPublicKey() {
        return Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());
    }

    public byte[] sign(String canonicalChallenge) {
        return sign(canonicalChallenge.getBytes(StandardCharsets.UTF_8));
    }

    public byte[] sign(byte[] challengeBytes) {
        try {
            Signature signer = Signature.getInstance("SHA256withECDSA");
            signer.initSign(keyPair.getPrivate());
            signer.update(challengeBytes);
            return signer.sign();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("unable to sign test challenge", exception);
        }
    }
}
