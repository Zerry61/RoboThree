package com.robothree.central.agentlifecycle.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class InternalTrialAgentLifecycleTokenAuthorizerTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final byte[] KEY = "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.US_ASCII);
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-08-30T12:00:00Z"), ZoneOffset.UTC);

    @Test
    void acceptsOnlyTheExactAgentLifecycleAudienceAndPermission() throws Exception {
        InternalTrialAgentLifecycleTokenAuthorizer authorizer = authorizer();

        InternalTrialAgentLifecycleTokenAuthorizer.Principal principal =
                authorizer.authorize(token("enterprise-agent-lifecycle", "agent.manage",
                        "2026-08-30T12:05:00Z"));

        assertEquals("enterprise.internal-trial:user.internal-trial", principal.creatorSubject());
        assertUnauthorized(token("enterprise-model-gateway", "agent.manage", "2026-08-30T12:05:00Z"));
        assertUnauthorized(token("enterprise-agent-lifecycle", "model.use", "2026-08-30T12:05:00Z"));
        assertUnauthorized(token("enterprise-agent-lifecycle", "agent.manage", "2026-08-30T12:00:00Z"));
    }

    private void assertUnauthorized(String token) {
        AgentLifecycleException exception = assertThrows(
                AgentLifecycleException.class, () -> authorizer().authorize(token));
        assertEquals("agentlifecycle.unauthorized", exception.code());
    }

    private static InternalTrialAgentLifecycleTokenAuthorizer authorizer() {
        return new InternalTrialAgentLifecycleTokenAuthorizer(
                Base64.getEncoder().encodeToString(KEY), CLOCK);
    }

    private static String token(String audience, String permission, String expiresAt) throws Exception {
        ObjectNode header = JSON.createObjectNode().put("alg", "HS256").put("typ", "JWT");
        ObjectNode claims = JSON.createObjectNode()
                .put("contractVersion", "v1alpha1")
                .put("issuer", "central.internal-trial")
                .put("audience", audience)
                .put("enterpriseId", "enterprise.internal-trial")
                .put("userId", "user.internal-trial")
                .put("deviceId", "device.internal-trial")
                .put("clientInstanceId", "00000000-0000-4000-8000-000000000101")
                .put("tokenId", "00000000-0000-4000-8000-000000000102")
                .put("issuedAt", "2026-08-30T11:59:00Z")
                .put("expiresAt", expiresAt);
        claims.putArray("permissions").add(permission);
        Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
        String material = encoder.encodeToString(JSON.writeValueAsBytes(header)) + "."
                + encoder.encodeToString(JSON.writeValueAsBytes(claims));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(KEY, "HmacSHA256"));
        return material + "." + encoder.encodeToString(
                mac.doFinal(material.getBytes(StandardCharsets.US_ASCII)));
    }
}
