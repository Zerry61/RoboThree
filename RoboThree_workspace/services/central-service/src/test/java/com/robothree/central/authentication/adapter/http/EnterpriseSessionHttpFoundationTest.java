package com.robothree.central.authentication.adapter.http;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.authentication.application.IssueEnterpriseSessionChallengeService;
import com.robothree.central.authentication.application.IssueEnterpriseSessionLeaseService;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class EnterpriseSessionHttpFoundationTest {

    private static final UUID CLIENT_ID =
            UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final UUID CORRELATION_ID =
            UUID.fromString("20000000-0000-4000-8000-000000000002");
    private static final UUID CHALLENGE_ID =
            UUID.fromString("30000000-0000-4000-8000-000000000003");
    private static final Instant NOW = Instant.parse("2026-08-24T12:00:00Z");
    private static final String HANDLE = "a".repeat(32);
    private static final String WIRE_DIGEST = "sha256:" + "b".repeat(64);

    @Test
    void strictMapperAcceptsFrozenChallengeAndLeaseShapes() {
        var mapper = new EnterpriseSessionHttpMapper(new ObjectMapper().findAndRegisterModules());

        var challenge = mapper.challengeCommand(mapper.parseChallengeRequest(bytes("""
                {
                  "kind":"enterprise_session_device_challenge_request",
                  "schemaVersion":"enterprise-session.v1alpha1",
                  "verifiedIdentityHandle":"%s",
                  "currentClientInstanceId":"%s",
                  "audience":"robothree.enterprise-gateway",
                  "requiredPermissions":["configuration.read","model.use"],
                  "deviceKeyId":"device-key.alpha",
                  "correlationId":"%s"
                }
                """.formatted(HANDLE, CLIENT_ID, CORRELATION_ID))));
        assertThat(challenge.opaqueHandle().value()).isEqualTo(HANDLE);
        assertThat(challenge.requiredPermissions())
                .containsExactly("configuration.read", "model.use");

        var lease = mapper.leaseCommand(mapper.parseLeaseRequest(bytes("""
                {
                  "kind":"enterprise_session_lease_request",
                  "schemaVersion":"enterprise-session.v1alpha1",
                  "verifiedIdentityHandle":"%s",
                  "currentClientInstanceId":"%s",
                  "audience":"robothree.enterprise-gateway",
                  "requiredPermissions":["configuration.read","model.use"],
                  "deviceProof":{
                    "challengeId":"%s",
                    "deviceKeyId":"device-key.alpha",
                    "algorithm":"ES256",
                    "signature":"%s",
                    "signedAt":"%s"
                  },
                  "correlationId":"%s"
                }
                """.formatted(
                        HANDLE,
                        CLIENT_ID,
                        CHALLENGE_ID,
                        "c".repeat(86),
                        NOW,
                        CORRELATION_ID))));
        assertThat(lease.deviceProof().challengeId()).isEqualTo(CHALLENGE_ID);
    }

    @Test
    void strictMapperRejectsUnknownDuplicateAndTrailingJson() {
        var mapper = new EnterpriseSessionHttpMapper(new ObjectMapper().findAndRegisterModules());
        String valid = validChallengeJson();

        assertThatThrownBy(() -> mapper.parseChallengeRequest(bytes(
                        valid.replace("\"correlationId\"", "\"unknown\":true,\"correlationId\""))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> mapper.parseChallengeRequest(bytes(
                        valid.replace("\"kind\":", "\"kind\":\"duplicate\",\"kind\":"))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> mapper.parseChallengeRequest(bytes(valid + " {}")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void responsesProjectFrozenKindsAndRedactBearerFromToString() {
        var mapper = new EnterpriseSessionHttpMapper(new ObjectMapper().findAndRegisterModules());
        var challenge = mapper.challengeResponse(new IssueEnterpriseSessionChallengeService.Result(
                CHALLENGE_ID,
                "nonce",
                NOW,
                NOW.plusSeconds(60),
                EnterpriseSessionChallengeBinding.AUDIENCE,
                CLIENT_ID,
                List.of("ES256"),
                WIRE_DIGEST));
        assertThat(challenge.kind()).isEqualTo("enterprise_session_device_challenge");

        var lease = mapper.leaseResponse(new IssueEnterpriseSessionLeaseService.Result(
                "token.payload.signature",
                NOW.plusSeconds(60),
                "{}",
                "{}",
                "1",
                WIRE_DIGEST));
        assertThat(lease.kind()).isEqualTo("enterprise_session_lease_result");
        assertThat(lease.toString()).doesNotContain("token.payload.signature");
    }

    @Test
    void requestSizeFilterRejectsOversizedBodiesBeforeTheChain() throws Exception {
        var request = new MockHttpServletRequest(
                "POST", "/enterprise-session/v1alpha1/device-challenges");
        request.setContentType("application/json");
        request.setContent(new byte[(32 * 1024) + 1]);
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        new EnterpriseSessionRequestSizeFilter(new ObjectMapper())
                .doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-store");
        assertThat(chain.getRequest()).isNull();
    }

    private static byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private static String validChallengeJson() {
        return """
                {
                  "kind":"enterprise_session_device_challenge_request",
                  "schemaVersion":"enterprise-session.v1alpha1",
                  "verifiedIdentityHandle":"%s",
                  "currentClientInstanceId":"%s",
                  "audience":"robothree.enterprise-gateway",
                  "requiredPermissions":["configuration.read"],
                  "deviceKeyId":"device-key.alpha",
                  "correlationId":"%s"
                }
                """.formatted(HANDLE, CLIENT_ID, CORRELATION_ID);
    }
}
