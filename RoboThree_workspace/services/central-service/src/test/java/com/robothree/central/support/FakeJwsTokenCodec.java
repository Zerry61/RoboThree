package com.robothree.central.support;

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

public final class FakeJwsTokenCodec implements RoboThreeAccessTokenCodec {

    private static final byte[] TEST_KEY =
            "robothree-cgf-1.1c-test-only-jws-key".getBytes(StandardCharsets.UTF_8);
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

    @Override
    public String encode(AccessTokenClaims claims, TokenSigningKeyHandle signingKeyHandle) {
        requireHandle(signingKeyHandle.reference(), "test-signing-key-handle");
        try {
            String header = ENCODER.encodeToString(
                    "{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
            String payload = ENCODER.encodeToString(JSON.writeValueAsBytes(claims));
            String signingInput = header + "." + payload;
            return signingInput + "." + ENCODER.encodeToString(mac(signingInput));
        } catch (Exception exception) {
            throw new IllegalArgumentException("test JWS encoding failed", exception);
        }
    }

    @Override
    public AccessTokenClaims decodeAndVerify(
            String compactToken,
            TokenVerificationKeyHandle verificationKeyHandle) {
        requireHandle(verificationKeyHandle.reference(), "test-verification-key-handle");
        try {
            String[] parts = compactToken.split("\\.", -1);
            if (parts.length != 3) {
                throw new IllegalArgumentException("invalid compact JWS");
            }
            JsonNode header = JSON.readTree(DECODER.decode(parts[0]));
            if (header.size() != 2
                    || !"HS256".equals(header.path("alg").asText())
                    || !"JWT".equals(header.path("typ").asText())) {
                throw new IllegalArgumentException("invalid test JWS header");
            }
            byte[] expected = mac(parts[0] + "." + parts[1]);
            byte[] actual = DECODER.decode(parts[2]);
            if (!MessageDigest.isEqual(expected, actual)) {
                throw new IllegalArgumentException("invalid test JWS signature");
            }
            return JSON.readValue(DECODER.decode(parts[1]), AccessTokenClaims.class);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("test JWS verification failed", exception);
        }
    }

    private static byte[] mac(String signingInput) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(TEST_KEY, "HmacSHA256"));
        return mac.doFinal(signingInput.getBytes(StandardCharsets.US_ASCII));
    }

    private static void requireHandle(String actual, String expected) {
        if (!expected.equals(actual)) {
            throw new IllegalArgumentException("unexpected test key handle");
        }
    }
}
