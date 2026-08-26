package com.robothree.central.modelgateway.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import com.robothree.central.authentication.domain.EnterpriseBearerAuthorizationResult;
import com.robothree.central.authentication.domain.EnterpriseBearerPrincipal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RoboThreeModelInvocationAccessAuthorizerTest {

    private static final Instant NOW = Instant.parse("2026-08-24T12:00:00Z");

    @Test
    void projectsOnlyTheExistingAuthorizedSubjectIdentity() {
        var principal = principal(List.of("model.use"));
        var authorizer = new RoboThreeModelInvocationAccessAuthorizer(
                (token, permission, now) ->
                        new EnterpriseBearerAuthorizationResult.Success(principal),
                Clock.fixed(NOW, ZoneOffset.UTC));

        var subject = authorizer.authorizeModelUse("opaque-token");

        assertThat(subject.enterpriseId()).isEqualTo("enterprise.alpha");
        assertThat(subject.userId()).isEqualTo("user.alpha");
        assertThat(subject.deviceId()).isEqualTo("device.alpha");
        assertThat(subject.clientInstanceId()).isEqualTo(
                "10000000-0000-4000-8000-000000000001");
    }

    @Test
    void missingModelPermissionFailsClosed() {
        var principal = principal(List.of("configuration.read"));
        var authorizer = new RoboThreeModelInvocationAccessAuthorizer(
                (token, permission, now) ->
                        new EnterpriseBearerAuthorizationResult.Success(principal),
                Clock.fixed(NOW, ZoneOffset.UTC));

        assertThatThrownBy(() -> authorizer.authorizeModelUse("opaque-token"))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("permission_denied");
    }

    private static EnterpriseBearerPrincipal principal(List<String> permissions) {
        return new EnterpriseBearerPrincipal(
                EnterpriseBearerPrincipal.LEGACY_CLAIMS_PROFILE,
                "enterprise.alpha",
                "user.alpha",
                "device.alpha",
                UUID.fromString("10000000-0000-4000-8000-000000000001"),
                UUID.fromString("20000000-0000-4000-8000-000000000002"),
                permissions,
                NOW.minusSeconds(60),
                NOW.plusSeconds(3600));
    }
}
