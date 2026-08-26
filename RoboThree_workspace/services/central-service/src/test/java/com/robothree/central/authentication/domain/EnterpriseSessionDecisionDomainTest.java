package com.robothree.central.authentication.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EnterpriseSessionDecisionDomainTest {

    private static final Instant ISSUED = Instant.parse("2026-08-24T01:00:00.000Z");
    private static final Instant EXPIRES = Instant.parse("2026-08-24T01:15:00.000Z");
    private static final UUID CLIENT = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID TOKEN = UUID.fromString("22222222-2222-4222-8222-222222222222");
    private static final String WIRE_A = "sha256:" + "a".repeat(64);
    private static final String WIRE_B = "sha256:" + "b".repeat(64);
    private static final String WIRE_C = "sha256:" + "c".repeat(64);

    @Test
    void acceptsStrictSessionClaims() {
        EnterpriseSessionTokenClaims claims = claims();

        assertThat(claims.claimsProfile()).isEqualTo("eipc.session-token.v1");
        assertThat(claims.permissions())
                .containsExactly("configuration.read", "personal_model.configure");
    }

    @Test
    void rejectsUnknownProfileAudienceAndIdentityShapes() {
        assertThatThrownBy(() -> copyClaims("legacy", "robothree.enterprise-gateway", "enterprise.fixture"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> copyClaims("eipc.session-token.v1", "wrong", "enterprise.fixture"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> copyClaims(
                        "eipc.session-token.v1", "robothree.enterprise-gateway", "contains space"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsUnsortedOrUnsupportedSessionPermissions() {
        assertThatThrownBy(() -> claims(List.of("personal_model.configure", "configuration.read")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> claims(List.of("configuration.read", "unsupported")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsNonMillisecondTimeAndInvalidWireDigest() {
        assertThatThrownBy(() -> new EnterpriseSessionTokenClaims(
                        "eipc.session-token.v1",
                        "robothree.central.fixture",
                        "robothree.enterprise-gateway",
                        "enterprise.fixture",
                        "user.fixture",
                        "device.fixture",
                        CLIENT,
                        TOKEN,
                        ISSUED.plusNanos(1),
                        EXPIRES,
                        List.of("configuration.read"),
                        WIRE_A,
                        WIRE_B,
                        "7",
                        WIRE_C))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EnterpriseSessionTokenClaims(
                        "eipc.session-token.v1",
                        "robothree.central.fixture",
                        "robothree.enterprise-gateway",
                        "enterprise.fixture",
                        "user.fixture",
                        "device.fixture",
                        CLIENT,
                        TOKEN,
                        ISSUED,
                        EXPIRES,
                        List.of("configuration.read"),
                        "a".repeat(64),
                        WIRE_B,
                        "7",
                        WIRE_C))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void compatibilityRevisionMustBeCanonicalNonnegativeDecimalAscii() {
        assertThatThrownBy(() -> claimsWithCompatibilityRevision("07"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> claimsWithCompatibilityRevision("-1"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> claimsWithCompatibilityRevision("9223372036854775808"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void sessionPrincipalRequiresSortedSessionPermissions() {
        EnterpriseBearerPrincipal principal = new EnterpriseBearerPrincipal(
                "eipc.session-token.v1",
                "enterprise.fixture",
                "user.fixture",
                "device.fixture",
                CLIENT,
                TOKEN,
                List.of("configuration.read", "personal_model.configure"),
                ISSUED,
                EXPIRES);

        assertThat(principal.hasPermission("personal_model.configure")).isTrue();
        assertThatThrownBy(() -> new EnterpriseBearerPrincipal(
                        "eipc.session-token.v1",
                        "enterprise.fixture",
                        "user.fixture",
                        "device.fixture",
                        CLIENT,
                        TOKEN,
                        List.of("personal_model.configure", "configuration.read"),
                        ISSUED,
                        EXPIRES))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void legacyPrincipalCannotAcquirePersonalModelPermission() {
        EnterpriseBearerPrincipal legacy = new EnterpriseBearerPrincipal(
                "v1alpha1",
                "enterprise.fixture",
                "user.fixture",
                "device.fixture",
                CLIENT,
                TOKEN,
                List.of("model.use"),
                ISSUED,
                EXPIRES);
        assertThat(legacy.hasPermission("model.use")).isTrue();
        assertThatThrownBy(() -> new EnterpriseBearerPrincipal(
                        "v1alpha1",
                        "enterprise.fixture",
                        "user.fixture",
                        "device.fixture",
                        CLIENT,
                        TOKEN,
                        List.of("personal_model.configure"),
                        ISSUED,
                        EXPIRES))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void authorizationResultIsStrictlyDiscriminated() {
        assertThat(new EnterpriseBearerAuthorizationResult.Success(new EnterpriseBearerPrincipal(
                        "v1alpha1",
                        "enterprise.fixture",
                        "user.fixture",
                        "device.fixture",
                        CLIENT,
                        TOKEN,
                        List.of("configuration.read"),
                        ISSUED,
                        EXPIRES)).principal().claimsProfile())
                .isEqualTo("v1alpha1");
        assertThat(new EnterpriseBearerAuthorizationResult.Invalid())
                .isInstanceOf(EnterpriseBearerAuthorizationResult.Invalid.class);
        assertThat(new EnterpriseBearerAuthorizationResult.Expired("eipc.session-token.v1")
                        .verifiedClaimsProfile())
                .isEqualTo("eipc.session-token.v1");
        assertThat(new EnterpriseBearerAuthorizationResult.Unavailable(
                        "enterprise_session_unavailable").typedSafeCode())
                .isEqualTo("enterprise_session_unavailable");
    }

    @Test
    void opaqueHandleAndKeyHandlesRedactTheirStringRepresentation() {
        OpaqueVerifiedIdentityHandle handle = new OpaqueVerifiedIdentityHandle("A".repeat(32));
        assertThat(handle.toString()).doesNotContain(handle.value());
        assertThatThrownBy(() -> new OpaqueVerifiedIdentityHandle("short"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private EnterpriseSessionTokenClaims claims() {
        return claims(List.of("configuration.read", "personal_model.configure"));
    }

    private EnterpriseSessionTokenClaims claims(List<String> permissions) {
        return new EnterpriseSessionTokenClaims(
                "eipc.session-token.v1",
                "robothree.central.fixture",
                "robothree.enterprise-gateway",
                "enterprise.fixture",
                "user.fixture",
                "device.fixture",
                CLIENT,
                TOKEN,
                ISSUED,
                EXPIRES,
                permissions,
                WIRE_A,
                WIRE_B,
                "7",
                WIRE_C);
    }

    private EnterpriseSessionTokenClaims copyClaims(
            String profile, String audience, String enterpriseId) {
        return new EnterpriseSessionTokenClaims(
                profile,
                "robothree.central.fixture",
                audience,
                enterpriseId,
                "user.fixture",
                "device.fixture",
                CLIENT,
                TOKEN,
                ISSUED,
                EXPIRES,
                List.of("configuration.read"),
                WIRE_A,
                WIRE_B,
                "7",
                WIRE_C);
    }

    private EnterpriseSessionTokenClaims claimsWithCompatibilityRevision(String revision) {
        return new EnterpriseSessionTokenClaims(
                "eipc.session-token.v1",
                "robothree.central.fixture",
                "robothree.enterprise-gateway",
                "enterprise.fixture",
                "user.fixture",
                "device.fixture",
                CLIENT,
                TOKEN,
                ISSUED,
                EXPIRES,
                List.of("configuration.read"),
                WIRE_A,
                WIRE_B,
                revision,
                WIRE_C);
    }
}
