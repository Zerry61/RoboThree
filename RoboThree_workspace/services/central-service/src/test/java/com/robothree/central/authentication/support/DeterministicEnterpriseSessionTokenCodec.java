package com.robothree.central.authentication.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.authentication.domain.EnterpriseSessionPersistenceDigests;
import com.robothree.central.authentication.domain.EnterpriseSessionTokenClaims;
import com.robothree.central.authentication.port.EnterpriseSessionTokenCodec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class DeterministicEnterpriseSessionTokenCodec
        implements EnterpriseSessionTokenCodec {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> FIELDS = Set.of(
            "claimsProfile",
            "issuer",
            "audience",
            "enterpriseId",
            "userId",
            "deviceId",
            "clientInstanceId",
            "tokenId",
            "issuedAt",
            "expiresAt",
            "permissions",
            "sessionAssertionDigest",
            "deviceTrustDecisionDigest",
            "compatibilityRevision",
            "sourceDecisionDigest");

    @Override
    public String encode(
            EnterpriseSessionTokenClaims claims,
            SessionSigningKeyHandle signingKeyHandle) {
        String payload = Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(EnterpriseSessionPersistenceDigests.canonicalize(document(claims))
                        .getBytes(StandardCharsets.UTF_8));
        String signingInput = "test." + payload;
        return signingInput + "." + hmac(signingInput, signingKeyHandle.reference());
    }

    @Override
    public EnterpriseSessionTokenClaims decodeAndVerify(
            String compactToken,
            String expectedIssuer,
            String expectedAudience,
            SessionVerificationKeyHandle verificationKeyHandle) {
        if (compactToken == null || compactToken.length() > 16_384) {
            throw new IllegalArgumentException("test session token is malformed");
        }
        String[] parts = compactToken.split("\\.", -1);
        if (parts.length != 3 || !"test".equals(parts[0])) {
            throw new IllegalArgumentException("test session token is malformed");
        }
        String signingInput = parts[0] + "." + parts[1];
        byte[] expected = decodeBase64Url(hmac(signingInput, verificationKeyHandle.reference()));
        byte[] actual = decodeBase64Url(parts[2]);
        if (!MessageDigest.isEqual(expected, actual)) {
            throw new IllegalArgumentException("test session token signature is invalid");
        }
        EnterpriseSessionTokenClaims claims = parse(parts[1]);
        if (!expectedIssuer.equals(claims.issuer())
                || !expectedAudience.equals(claims.audience())) {
            throw new IllegalArgumentException("test session token context is invalid");
        }
        return claims;
    }

    private EnterpriseSessionTokenClaims parse(String encodedPayload) {
        try {
            JsonNode parsed = JSON.readTree(decodeBase64Url(encodedPayload));
            if (!(parsed instanceof ObjectNode object)
                    || !object.propertyStream()
                            .map(java.util.Map.Entry::getKey)
                            .collect(java.util.stream.Collectors.toSet())
                            .equals(FIELDS)) {
                throw new IllegalArgumentException("test session token claims are not strict");
            }
            return new EnterpriseSessionTokenClaims(
                    text(object, "claimsProfile"),
                    text(object, "issuer"),
                    text(object, "audience"),
                    text(object, "enterpriseId"),
                    text(object, "userId"),
                    text(object, "deviceId"),
                    UUID.fromString(text(object, "clientInstanceId")),
                    UUID.fromString(text(object, "tokenId")),
                    Instant.parse(text(object, "issuedAt")),
                    Instant.parse(text(object, "expiresAt")),
                    strings(object.path("permissions")),
                    text(object, "sessionAssertionDigest"),
                    text(object, "deviceTrustDecisionDigest"),
                    text(object, "compatibilityRevision"),
                    text(object, "sourceDecisionDigest"));
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("test session token claims are invalid", exception);
        }
    }

    private ObjectNode document(EnterpriseSessionTokenClaims claims) {
        ObjectNode value = JSON.createObjectNode();
        value.put("claimsProfile", claims.claimsProfile());
        value.put("issuer", claims.issuer());
        value.put("audience", claims.audience());
        value.put("enterpriseId", claims.enterpriseId());
        value.put("userId", claims.userId());
        value.put("deviceId", claims.deviceId());
        value.put("clientInstanceId", claims.clientInstanceId().toString());
        value.put("tokenId", claims.tokenId().toString());
        value.put("issuedAt", EnterpriseSessionPersistenceDigests.timestamp(claims.issuedAt()));
        value.put("expiresAt", EnterpriseSessionPersistenceDigests.timestamp(claims.expiresAt()));
        ArrayNode permissions = JSON.createArrayNode();
        claims.permissions().forEach(permissions::add);
        value.set("permissions", permissions);
        value.put("sessionAssertionDigest", claims.sessionAssertionDigest());
        value.put("deviceTrustDecisionDigest", claims.deviceTrustDecisionDigest());
        value.put("compatibilityRevision", claims.compatibilityRevision());
        value.put("sourceDecisionDigest", claims.sourceDecisionDigest());
        return value;
    }

    private String hmac(String input, String reference) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(
                    reference.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(mac.doFinal(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("test HMAC is unavailable", exception);
        }
    }

    private byte[] decodeBase64Url(String value) {
        try {
            return Base64.getUrlDecoder().decode(value);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("test session token encoding is invalid", exception);
        }
    }

    private String text(JsonNode object, String name) {
        if (!object.path(name).isTextual()) {
            throw new IllegalArgumentException(name + " is missing");
        }
        return object.path(name).textValue();
    }

    private List<String> strings(JsonNode value) {
        if (!value.isArray()) {
            throw new IllegalArgumentException("permissions are missing");
        }
        return java.util.stream.StreamSupport.stream(value.spliterator(), false)
                .map(JsonNode::textValue)
                .toList();
    }
}
