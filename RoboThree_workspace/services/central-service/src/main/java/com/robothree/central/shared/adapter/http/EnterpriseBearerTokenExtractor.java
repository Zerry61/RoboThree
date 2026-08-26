package com.robothree.central.shared.adapter.http;

import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import java.util.List;

public final class EnterpriseBearerTokenExtractor {

    static final int MAXIMUM_AUTHORIZATION_HEADER_LENGTH = 8_192;
    private static final String BEARER_PREFIX = "Bearer ";

    private EnterpriseBearerTokenExtractor() {}

    public static String extract(List<String> authorizationHeaders) {
        if (authorizationHeaders == null || authorizationHeaders.size() != 1) {
            throw invalidToken();
        }
        String authorization = authorizationHeaders.getFirst();
        if (authorization == null
                || authorization.length() > MAXIMUM_AUTHORIZATION_HEADER_LENGTH
                || !authorization.startsWith(BEARER_PREFIX)
                || authorization.length() <= BEARER_PREFIX.length()) {
            throw invalidToken();
        }
        String token = authorization.substring(BEARER_PREFIX.length());
        if (token.chars().anyMatch(Character::isWhitespace)) {
            throw invalidToken();
        }
        return token;
    }

    private static EnterpriseAuthenticationException invalidToken() {
        return EnterpriseAuthenticationException.authentication(
                "access_token_invalid",
                "A valid enterprise access token is required.");
    }
}
