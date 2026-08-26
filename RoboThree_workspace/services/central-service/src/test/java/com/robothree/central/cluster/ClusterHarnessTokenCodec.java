package com.robothree.central.cluster;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.authentication.domain.AccessTokenClaims;
import com.robothree.central.authentication.port.RoboThreeAccessTokenCodec;
import com.robothree.central.credentials.port.EnterpriseSecretStore.TokenSigningKeyHandle;
import com.robothree.central.credentials.port.EnterpriseSecretStore.TokenVerificationKeyHandle;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

final class ClusterHarnessTokenCodec implements RoboThreeAccessTokenCodec {

    static final String SIGNING_HANDLE = "cluster-harness-signing-key";
    static final String VERIFICATION_HANDLE = "cluster-harness-verification-key";

    private static final ObjectMapper JSON =
            new ObjectMapper().findAndRegisterModules();
    private static final Base64.Encoder ENCODER =
            Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

    private final byte[] key;

    ClusterHarnessTokenCodec(String encodedKey) {
        try {
            key = Base64.getDecoder().decode(encodedKey);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(
                    "cluster harness token key is invalid",
                    exception);
        }
        if (key.length < 32) {
            throw new IllegalArgumentException(
                    "cluster harness token key must contain at least 256 bits");
        }
    }

    @Override
    public String encode(
            AccessTokenClaims claims,
            TokenSigningKeyHandle signingKeyHandle) {
        requireHandle(signingKeyHandle.reference(), SIGNING_HANDLE);
        try {
            String header = ENCODER.encodeToString(
                    "{\"alg\":\"HS256\",\"typ\":\"JWT\"}"
                            .getBytes(StandardCharsets.UTF_8));
            String payload = ENCODER.encodeToString(JSON.writeValueAsBytes(claims));
            String signingInput = header + "." + payload;
            return signingInput + "." + ENCODER.encodeToString(mac(signingInput));
        } catch (Exception exception) {
            throw new IllegalArgumentException(
                    "cluster harness token encoding failed",
                    exception);
        }
    }

    @Override
    public AccessTokenClaims decodeAndVerify(
            String compactToken,
            TokenVerificationKeyHandle verificationKeyHandle) {
        requireHandle(verificationKeyHandle.reference(), VERIFICATION_HANDLE);
        try {
            String[] parts = compactToken.split("\\.", -1);
            if (parts.length != 3) {
                throw new IllegalArgumentException("invalid compact token");
            }
            JsonNode header = JSON.readTree(DECODER.decode(parts[0]));
            if (header.size() != 2
                    || !"HS256".equals(header.path("alg").asText())
                    || !"JWT".equals(header.path("typ").asText())) {
                throw new IllegalArgumentException("invalid token header");
            }
            byte[] expected = mac(parts[0] + "." + parts[1]);
            byte[] actual = DECODER.decode(parts[2]);
            if (!MessageDigest.isEqual(expected, actual)) {
                throw new IllegalArgumentException("invalid token signature");
            }
            return JSON.readValue(DECODER.decode(parts[1]), AccessTokenClaims.class);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException(
                    "cluster harness token verification failed",
                    exception);
        }
    }

    private byte[] mac(String signingInput) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(signingInput.getBytes(StandardCharsets.US_ASCII));
    }

    private static void requireHandle(String actual, String expected) {
        if (!expected.equals(actual)) {
            throw new IllegalArgumentException("unexpected cluster harness key handle");
        }
    }
}
