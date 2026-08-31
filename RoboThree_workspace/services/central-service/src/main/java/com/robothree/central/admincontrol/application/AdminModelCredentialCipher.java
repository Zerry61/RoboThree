package com.robothree.central.admincontrol.application;

import com.robothree.central.shared.json.CanonicalJson;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public final class AdminModelCredentialCipher {

    private static final String KEY_ID = "admin-model-master-key.v1";
    private static final byte[] AAD = "robothree.admin-model-credential.v1"
            .getBytes(StandardCharsets.UTF_8);
    private final SecretKey key;
    private final SecureRandom random;
    private final Clock clock;

    public AdminModelCredentialCipher(String base64Key, SecureRandom random, Clock clock) {
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(base64Key);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("admin model master key is invalid", exception);
        }
        if (decoded.length != 32) {
            Arrays.fill(decoded, (byte) 0);
            throw new IllegalArgumentException("admin model master key must contain 32 bytes");
        }
        this.key = new SecretKeySpec(decoded, "AES");
        Arrays.fill(decoded, (byte) 0);
        this.random = random;
        this.clock = clock;
    }

    public AdminModelStore.EncryptedCredential encrypt(String modelId, char[] secret) {
        byte[] plaintext = new String(secret).getBytes(StandardCharsets.UTF_8);
        byte[] nonce = new byte[12];
        random.nextBytes(nonce);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, nonce));
            cipher.updateAAD(AAD);
            byte[] ciphertext = cipher.doFinal(plaintext);
            String credentialRevision = "sha256:" + CanonicalJson.sha256(
                    Base64.getEncoder().encodeToString(nonce) + "."
                            + Base64.getEncoder().encodeToString(ciphertext));
            return new AdminModelStore.EncryptedCredential(
                    "admin-model-credential:" + modelId,
                    modelId,
                    credentialRevision,
                    KEY_ID,
                    nonce,
                    ciphertext,
                    clock.instant());
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("admin model credential encryption failed", exception);
        } finally {
            Arrays.fill(plaintext, (byte) 0);
            Arrays.fill(secret, '\0');
        }
    }

    public char[] decrypt(AdminModelStore.EncryptedCredential encrypted) {
        byte[] plaintext = null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, encrypted.nonce()));
            cipher.updateAAD(AAD);
            plaintext = cipher.doFinal(encrypted.ciphertext());
            return StandardCharsets.UTF_8.decode(java.nio.ByteBuffer.wrap(plaintext))
                    .toString().toCharArray();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("admin model credential decryption failed", exception);
        } finally {
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
        }
    }
}
