package com.robothree.central.agentlifecycle.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Internal-trial-only HS256 verifier for the separately scoped agent.manage token. */
public final class InternalTrialAgentLifecycleTokenAuthorizer {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String AUDIENCE = "enterprise-agent-lifecycle";
    private final byte[] verificationKey;
    private final Clock clock;

    public InternalTrialAgentLifecycleTokenAuthorizer(String keyBase64, Clock clock) {
        try { verificationKey = Base64.getDecoder().decode(keyBase64); }
        catch (RuntimeException exception) { throw new IllegalArgumentException("agent lifecycle key invalid"); }
        if (verificationKey.length < 32 || verificationKey.length > 64) {
            throw new IllegalArgumentException("agent lifecycle key must be 32-64 bytes");
        }
        this.clock = clock;
    }

    public Principal authorize(String compactToken) {
        if (compactToken == null || compactToken.length() < 32 || compactToken.length() > 8192
                || !compactToken.matches("^[A-Za-z0-9._~-]+$")) {
            throw AgentLifecycleException.unauthorized();
        }
        try {
            String[] parts = compactToken.split("\\.", -1);
            if (parts.length != 3 || parts[0].isEmpty() || parts[1].isEmpty() || parts[2].isEmpty()) {
                throw AgentLifecycleException.unauthorized();
            }
            JsonNode header = JSON.readTree(Base64.getUrlDecoder().decode(parts[0]));
            if (!Set.of("alg", "typ").equals(fieldSet(header))
                    || !"HS256".equals(header.path("alg").asText())
                    || !"JWT".equals(header.path("typ").asText())) {
                throw AgentLifecycleException.unauthorized();
            }
            byte[] supplied = Base64.getUrlDecoder().decode(parts[2]);
            byte[] expected = sign(parts[0] + "." + parts[1]);
            if (!MessageDigest.isEqual(supplied, expected)) throw AgentLifecycleException.unauthorized();
            JsonNode claims = JSON.readTree(Base64.getUrlDecoder().decode(parts[1]));
            Set<String> expectedFields = Set.of("contractVersion", "issuer", "audience",
                    "enterpriseId", "userId", "deviceId", "clientInstanceId", "tokenId",
                    "issuedAt", "expiresAt", "permissions");
            if (!expectedFields.equals(fieldSet(claims))
                    || !"v1alpha1".equals(claims.path("contractVersion").asText())
                    || !AUDIENCE.equals(claims.path("audience").asText())
                    || !claims.path("permissions").isArray()
                    || claims.path("permissions").size() != 1
                    || !"agent.manage".equals(claims.path("permissions").path(0).asText())) {
                throw AgentLifecycleException.unauthorized();
            }
            Instant issuedAt = Instant.parse(text(claims, "issuedAt"));
            Instant expiresAt = Instant.parse(text(claims, "expiresAt"));
            Instant now = clock.instant();
            if (issuedAt.isAfter(now) || !expiresAt.isAfter(now) || !expiresAt.isAfter(issuedAt)) {
                throw AgentLifecycleException.unauthorized();
            }
            UUID.fromString(text(claims, "clientInstanceId"));
            UUID.fromString(text(claims, "tokenId"));
            return new Principal(identity(text(claims, "enterpriseId")),
                    identity(text(claims, "userId")), identity(text(claims, "deviceId")));
        } catch (AgentLifecycleException exception) {
            throw exception;
        } catch (Exception exception) {
            throw AgentLifecycleException.unauthorized();
        }
    }

    private byte[] sign(String material) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(verificationKey, "HmacSHA256"));
        return mac.doFinal(material.getBytes(StandardCharsets.US_ASCII));
    }
    private static Set<String> fieldSet(JsonNode node) {
        java.util.HashSet<String> fields = new java.util.HashSet<>();
        node.fieldNames().forEachRemaining(fields::add);
        return Set.copyOf(fields);
    }
    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || value.textValue().isBlank()
                || value.textValue().length() > 160) throw AgentLifecycleException.unauthorized();
        return value.textValue();
    }
    private static String identity(String value) {
        if (!value.matches("^[A-Za-z0-9._:-]{1,160}$")) throw AgentLifecycleException.unauthorized();
        return value;
    }

    public record Principal(String enterpriseId, String userId, String deviceId) {
        public String creatorSubject() { return enterpriseId + ":" + userId; }
        public String safeSummary() { return "internal-trial-agent-reviewer"; }
    }
}
