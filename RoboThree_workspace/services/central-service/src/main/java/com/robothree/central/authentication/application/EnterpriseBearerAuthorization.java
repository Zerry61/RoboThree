package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.EnterpriseBearerAuthorizationResult;
import com.robothree.central.authentication.domain.EnterpriseBearerPrincipal;
import java.util.Objects;

/** Maps the closed authorization result union to the existing safe authentication errors. */
public final class EnterpriseBearerAuthorization {

    private EnterpriseBearerAuthorization() {}

    public static EnterpriseBearerPrincipal requirePrincipal(
            EnterpriseBearerAuthorizationResult result,
            String requiredPermission) {
        Objects.requireNonNull(result, "result");
        Objects.requireNonNull(requiredPermission, "requiredPermission");
        if (result instanceof EnterpriseBearerAuthorizationResult.Success success) {
            if (!success.principal().hasPermission(requiredPermission)) {
                throw EnterpriseAuthenticationException.authorization(
                        "permission_denied",
                        "The enterprise access token lacks the required permission.");
            }
            return success.principal();
        }
        if (result instanceof EnterpriseBearerAuthorizationResult.Expired) {
            throw EnterpriseAuthenticationException.authentication(
                    "access_token_expired",
                    "The enterprise access token has expired.");
        }
        if (result instanceof EnterpriseBearerAuthorizationResult.Unavailable unavailable) {
            throw EnterpriseAuthenticationException.service(
                    unavailable.typedSafeCode(),
                    true,
                    "Enterprise bearer authorization is currently unavailable.");
        }
        throw EnterpriseAuthenticationException.authentication(
                "access_token_invalid",
                "The enterprise access token is invalid.");
    }
}
