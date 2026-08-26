package com.robothree.central.authentication.port;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.domain.EnterpriseBearerAuthorizationResult;
import com.robothree.central.authentication.domain.EnterpriseSessionTokenClaims;
import com.robothree.central.authentication.domain.OpaqueVerifiedIdentityHandle;
import com.robothree.central.authentication.support.DeterministicEnterpriseSessionTokenCodec;
import com.robothree.central.authentication.support.MutableTestVerifiedIdentityHandleResolver;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EnterpriseSessionDecisionPortsTest {

    private static final Instant ISSUED = Instant.parse("2026-08-24T01:00:00.000Z");
    private static final Instant EXPIRES = Instant.parse("2026-08-24T01:15:00.000Z");
    private static final String KEY = "test-session-signing-key-reference";

    @Test
    void testCodecRoundTripsStrictSessionClaims() {
        DeterministicEnterpriseSessionTokenCodec codec =
                new DeterministicEnterpriseSessionTokenCodec();
        String token = codec.encode(
                claims(), new EnterpriseSessionTokenCodec.SessionSigningKeyHandle(KEY));

        assertThat(codec.decodeAndVerify(
                        token,
                        "robothree.central.fixture",
                        "robothree.enterprise-gateway",
                        new EnterpriseSessionTokenCodec.SessionVerificationKeyHandle(KEY)))
                .isEqualTo(claims());
    }

    @Test
    void testCodecRejectsWrongKeyIssuerAndAudience() {
        DeterministicEnterpriseSessionTokenCodec codec =
                new DeterministicEnterpriseSessionTokenCodec();
        String token = codec.encode(
                claims(), new EnterpriseSessionTokenCodec.SessionSigningKeyHandle(KEY));

        assertThatThrownBy(() -> codec.decodeAndVerify(
                        token,
                        "robothree.central.fixture",
                        "robothree.enterprise-gateway",
                        new EnterpriseSessionTokenCodec.SessionVerificationKeyHandle("wrong-key")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> codec.decodeAndVerify(
                        token,
                        "wrong.issuer",
                        "robothree.enterprise-gateway",
                        new EnterpriseSessionTokenCodec.SessionVerificationKeyHandle(KEY)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> codec.decodeAndVerify(
                        token,
                        "robothree.central.fixture",
                        "wrong.audience",
                        new EnterpriseSessionTokenCodec.SessionVerificationKeyHandle(KEY)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void keyHandlesRedactReferences() {
        var signing = new EnterpriseSessionTokenCodec.SessionSigningKeyHandle(KEY);
        var verification = new EnterpriseSessionTokenCodec.SessionVerificationKeyHandle(KEY);
        assertThat(signing.toString()).doesNotContain(KEY);
        assertThat(verification.toString()).doesNotContain(KEY);
    }

    @Test
    void testResolverRequiresExactIdentitySourceRevisionAtLeaseTime() {
        MutableTestVerifiedIdentityHandleResolver resolver =
                new MutableTestVerifiedIdentityHandleResolver();
        OpaqueVerifiedIdentityHandle handle = new OpaqueVerifiedIdentityHandle("A".repeat(32));
        UUID identity = UUID.fromString("55555555-5555-4555-8555-555555555555");
        resolver.bind(handle, new VerifiedIdentityHandleResolver.ResolvedVerifiedIdentityHandle(
                identity, "identity-source.1"));

        assertThat(resolver.resolveForChallenge(handle).verifiedIdentityId()).isEqualTo(identity);
        assertThat(resolver.resolveForLeaseForUpdate(handle, "identity-source.1")
                        .verifiedIdentityId())
                .isEqualTo(identity);
        assertThatThrownBy(() -> resolver.resolveForLeaseForUpdate(handle, "identity-source.0"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("enterprise_identity_handle_drift");
    }

    @Test
    void authorizerPortCanReturnTypedUnavailableWithoutThrowingSensitiveMaterial() {
        EnterpriseBearerAuthorizer authorizer = (token, permission, now) ->
                new EnterpriseBearerAuthorizationResult.Unavailable(
                        "enterprise_session_unavailable");
        assertThat(authorizer.authorize("opaque-test-token", "configuration.read", ISSUED))
                .isEqualTo(new EnterpriseBearerAuthorizationResult.Unavailable(
                        "enterprise_session_unavailable"));
    }

    private EnterpriseSessionTokenClaims claims() {
        return new EnterpriseSessionTokenClaims(
                "eipc.session-token.v1",
                "robothree.central.fixture",
                "robothree.enterprise-gateway",
                "enterprise.fixture",
                "user.fixture",
                "device.fixture",
                UUID.fromString("11111111-1111-4111-8111-111111111111"),
                UUID.fromString("44444444-4444-4444-8444-444444444444"),
                ISSUED,
                EXPIRES,
                List.of("configuration.read", "personal_model.configure"),
                "sha256:" + "a".repeat(64),
                "sha256:" + "b".repeat(64),
                "7",
                "sha256:" + "c".repeat(64));
    }
}
