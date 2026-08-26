package com.robothree.central.authentication.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.domain.EnterpriseBearerAuthorizationResult;
import com.robothree.central.authentication.domain.EnterpriseBearerPrincipal;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.port.EnterpriseBearerAuthorizer;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CompositeEnterpriseBearerAuthorizerTest {

    private static final Instant NOW = Instant.parse("2026-08-24T12:00:00Z");

    @Test
    void requiresExactlyOneSuccessfulProfile() {
        var legacy = success(EnterpriseBearerPrincipal.LEGACY_CLAIMS_PROFILE);
        var session = success(EnterpriseSessionChallengeBinding.CLAIMS_PROFILE);

        assertThat(authorize(legacy, invalid()))
                .isInstanceOf(EnterpriseBearerAuthorizationResult.Success.class);
        assertThat(authorize(invalid(), session))
                .isInstanceOf(EnterpriseBearerAuthorizationResult.Success.class);
        assertThatThrownBy(() -> authorize(legacy, session))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("access_token_profile_ambiguous");
    }

    @Test
    void preservesOnlyUnambiguousVerifiedExpiry() {
        var legacyExpired = expired(EnterpriseBearerPrincipal.LEGACY_CLAIMS_PROFILE);
        var sessionExpired = expired(EnterpriseSessionChallengeBinding.CLAIMS_PROFILE);

        assertThat(authorize(legacyExpired, invalid()))
                .isEqualTo(legacyExpired.authorize("token", "model.use", NOW));
        assertThat(authorize(invalid(), sessionExpired))
                .isEqualTo(sessionExpired.authorize("token", "model.use", NOW));
        assertThatThrownBy(() -> authorize(legacyExpired, sessionExpired))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("access_token_profile_ambiguous");
    }

    @Test
    void unavailableAlwaysWinsAndNeverFallsBackToSuccess() {
        EnterpriseBearerAuthorizer unavailable = result(
                new EnterpriseBearerAuthorizationResult.Unavailable(
                        "enterprise_session_unavailable"));

        assertThat(authorize(unavailable, success(EnterpriseBearerPrincipal.LEGACY_CLAIMS_PROFILE)))
                .isEqualTo(new EnterpriseBearerAuthorizationResult.Unavailable(
                        "enterprise_session_unavailable"));
        assertThat(authorize(success(EnterpriseBearerPrincipal.LEGACY_CLAIMS_PROFILE), unavailable))
                .isEqualTo(new EnterpriseBearerAuthorizationResult.Unavailable(
                        "enterprise_session_unavailable"));
    }

    @Test
    void dualInvalidAndDistinctUnavailableCodesRemainFailClosed() {
        assertThat(authorize(invalid(), invalid()))
                .isEqualTo(new EnterpriseBearerAuthorizationResult.Invalid());
        assertThat(authorize(
                        result(new EnterpriseBearerAuthorizationResult.Unavailable("first_unavailable")),
                        result(new EnterpriseBearerAuthorizationResult.Unavailable("second_unavailable"))))
                .isEqualTo(new EnterpriseBearerAuthorizationResult.Unavailable(
                        "enterprise_bearer_authorization_unavailable"));
    }

    @Test
    void doesNotUseBranchOrderAsPriority() {
        var success = success(EnterpriseBearerPrincipal.LEGACY_CLAIMS_PROFILE);
        assertThat(authorize(success, invalid())).isEqualTo(authorize(invalid(), success));
        assertThat(authorize(invalid(), expired(EnterpriseSessionChallengeBinding.CLAIMS_PROFILE)))
                .isEqualTo(authorize(
                        expired(EnterpriseSessionChallengeBinding.CLAIMS_PROFILE), invalid()));
    }

    @Test
    void checksPermissionOnTheSelectedCommonPrincipal() {
        var withoutPermission = result(new EnterpriseBearerAuthorizationResult.Success(
                principal(EnterpriseBearerPrincipal.LEGACY_CLAIMS_PROFILE, List.of("configuration.read"))));
        assertThatThrownBy(() -> authorize(withoutPermission))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("permission_denied");
    }

    @Test
    void legacyPrincipalPreservesHistoricalNanosecondPrecision() {
        Instant issuedAt = Instant.parse("2026-08-24T11:59:00.123456789Z");
        Instant expiresAt = Instant.parse("2026-08-24T13:00:00.987654321Z");
        var principal = new EnterpriseBearerPrincipal(
                EnterpriseBearerPrincipal.LEGACY_CLAIMS_PROFILE,
                "enterprise.alpha",
                "user.alpha",
                "device.alpha",
                UUID.fromString("10000000-0000-4000-8000-000000000001"),
                UUID.fromString("20000000-0000-4000-8000-000000000002"),
                List.of("model.use"),
                issuedAt,
                expiresAt);

        assertThat(principal.issuedAt()).isEqualTo(issuedAt);
        assertThat(principal.expiresAt()).isEqualTo(expiresAt);
        assertThatThrownBy(() -> new EnterpriseBearerPrincipal(
                        EnterpriseSessionChallengeBinding.CLAIMS_PROFILE,
                        "enterprise.alpha",
                        "user.alpha",
                        "device.alpha",
                        UUID.fromString("10000000-0000-4000-8000-000000000001"),
                        UUID.fromString("20000000-0000-4000-8000-000000000002"),
                        List.of("model.use"),
                        issuedAt,
                        expiresAt))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static EnterpriseBearerAuthorizationResult authorize(
            EnterpriseBearerAuthorizer... branches) {
        return new CompositeEnterpriseBearerAuthorizer(List.of(branches))
                .authorize("token", "model.use", NOW);
    }

    private static EnterpriseBearerAuthorizer success(String profile) {
        return result(new EnterpriseBearerAuthorizationResult.Success(
                principal(profile, List.of("configuration.read", "model.use"))));
    }

    private static EnterpriseBearerPrincipal principal(String profile, List<String> permissions) {
        return new EnterpriseBearerPrincipal(
                profile,
                "enterprise.alpha",
                "user.alpha",
                "device.alpha",
                UUID.fromString("10000000-0000-4000-8000-000000000001"),
                UUID.fromString("20000000-0000-4000-8000-000000000002"),
                permissions,
                NOW.minusSeconds(60),
                NOW.plusSeconds(3600));
    }

    private static EnterpriseBearerAuthorizer expired(String profile) {
        return result(new EnterpriseBearerAuthorizationResult.Expired(profile));
    }

    private static EnterpriseBearerAuthorizer invalid() {
        return result(new EnterpriseBearerAuthorizationResult.Invalid());
    }

    private static EnterpriseBearerAuthorizer result(EnterpriseBearerAuthorizationResult result) {
        return (token, permission, now) -> result;
    }
}
