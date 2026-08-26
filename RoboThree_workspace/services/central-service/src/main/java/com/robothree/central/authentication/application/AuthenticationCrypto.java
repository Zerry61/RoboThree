package com.robothree.central.authentication.application;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.authentication.domain.DeviceChallenge;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

public final class AuthenticationCrypto {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String SIGNING_PREFIX = "ROBOTHREE_DEVICE_PROOF_V1\n";

    private AuthenticationCrypto() {}

    public static String sha256(String value) {
        return sha256(value.getBytes(StandardCharsets.UTF_8));
    }

    public static String sha256(byte[] value) {
        try {
            return java.util.HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public static String base64Url(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    public static byte[] signingBytes(DeviceChallenge challenge) {
        return (SIGNING_PREFIX + canonicalChallengeJson(challenge))
                .getBytes(StandardCharsets.UTF_8);
    }

    public static String canonicalChallengeJson(DeviceChallenge challenge) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("allowedAlgorithms", challenge.allowedAlgorithms());
        value.put("audience", challenge.audience());
        value.put("challengeId", challenge.challengeId().toString());
        value.put("clientInstanceId", challenge.clientInstanceId());
        value.put("contractVersion", "v1alpha1");
        value.put("expiresAt", challenge.expiresAt().toString());
        value.put("issuedAt", challenge.issuedAt().toString());
        value.put("nonce", challenge.nonce());
        value.put("type", "device_challenge");
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("canonical challenge serialization failed", exception);
        }
    }

    public static String boundDigest(String... values) {
        StringBuilder input = new StringBuilder();
        for (String value : values) {
            String nonNull = value == null ? "" : value;
            input.append(nonNull.length()).append(':').append(nonNull).append('|');
        }
        return sha256(input.toString());
    }
}
