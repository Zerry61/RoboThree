package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.AccessTokenClaims;
import com.robothree.central.authentication.domain.EnterpriseBearerAuthorizationResult;
import com.robothree.central.authentication.domain.EnterpriseBearerPrincipal;
import com.robothree.central.authentication.port.EnterpriseBearerAuthorizer;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Complete legacy-token branch for the common bearer authorizer. */
public final class LegacyBearerAuthorizerAdapter implements EnterpriseBearerAuthorizer {

    private final RoboThreeAccessTokenValidator validator;

    public LegacyBearerAuthorizerAdapter(RoboThreeAccessTokenValidator validator) {
        this.validator = Objects.requireNonNull(validator, "validator");
    }

    @Override
    public EnterpriseBearerAuthorizationResult authorize(
            String compactToken,
            String requiredPermission,
            Instant now) {
        Objects.requireNonNull(requiredPermission, "requiredPermission");
        Objects.requireNonNull(now, "now");
        try {
            AccessTokenClaims claims = validator.validateAt(compactToken, now);
            return new EnterpriseBearerAuthorizationResult.Success(new EnterpriseBearerPrincipal(
                    EnterpriseBearerPrincipal.LEGACY_CLAIMS_PROFILE,
                    claims.enterpriseId(),
                    claims.userId(),
                    claims.deviceId(),
                    UUID.fromString(claims.clientInstanceId()),
                    claims.tokenId(),
                    claims.permissions(),
                    claims.issuedAt(),
                    claims.expiresAt()));
        } catch (EnterpriseAuthenticationException exception) {
            return switch (exception.code()) {
                case "access_token_expired" -> new EnterpriseBearerAuthorizationResult.Expired(
                        EnterpriseBearerPrincipal.LEGACY_CLAIMS_PROFILE);
                case "access_token_invalid" -> new EnterpriseBearerAuthorizationResult.Invalid();
                default -> "service".equals(exception.category())
                        ? new EnterpriseBearerAuthorizationResult.Unavailable(
                                safeUnavailableCode(exception.code()))
                        : new EnterpriseBearerAuthorizationResult.Invalid();
            };
        } catch (RuntimeException exception) {
            return new EnterpriseBearerAuthorizationResult.Unavailable(
                    "legacy_bearer_authorization_unavailable");
        }
    }

    private static String safeUnavailableCode(String code) {
        return code != null && code.matches("^[a-z][a-z0-9_.-]{0,119}$")
                ? code
                : "legacy_bearer_authorization_unavailable";
    }
}
