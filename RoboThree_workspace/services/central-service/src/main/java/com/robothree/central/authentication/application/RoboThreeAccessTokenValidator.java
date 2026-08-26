package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.AccessTokenClaims;
import com.robothree.central.authentication.domain.AccessTokenIssuance;
import com.robothree.central.authentication.port.AccessTokenIssuanceRepository;
import com.robothree.central.authentication.port.RoboThreeAccessTokenCodec;
import com.robothree.central.credentials.port.EnterpriseSecretStore;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;

public final class RoboThreeAccessTokenValidator {

    private final RoboThreeAccessTokenCodec tokenCodec;
    private final EnterpriseSecretStore secretStore;
    private final AccessTokenIssuanceRepository issuances;
    private final Clock clock;
    private final AccessTokenSecurityPolicy policy;

    public RoboThreeAccessTokenValidator(
            RoboThreeAccessTokenCodec tokenCodec,
            EnterpriseSecretStore secretStore,
            AccessTokenIssuanceRepository issuances,
            Clock clock,
            AccessTokenSecurityPolicy policy) {
        this.tokenCodec = Objects.requireNonNull(tokenCodec, "tokenCodec");
        this.secretStore = Objects.requireNonNull(secretStore, "secretStore");
        this.issuances = Objects.requireNonNull(issuances, "issuances");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.policy = Objects.requireNonNull(policy, "policy");
    }

    public AccessTokenClaims validate(String compactToken) {
        return validateAt(compactToken, clock.instant());
    }

    public AccessTokenClaims validateAt(String compactToken, Instant now) {
        Objects.requireNonNull(now, "now");
        if (compactToken == null
                || compactToken.length() < 32
                || compactToken.length() > 8192
                || compactToken.chars().anyMatch(Character::isWhitespace)) {
            throw invalidToken();
        }

        AccessTokenClaims claims;
        try {
            claims = tokenCodec.decodeAndVerify(
                    compactToken,
                    secretStore.resolveTokenVerificationKeyHandle());
        } catch (RuntimeException exception) {
            throw invalidToken();
        }

        if (!policy.issuer().equals(claims.issuer())
                || !policy.audience().equals(claims.audience())
                || claims.issuedAt().isAfter(now.plus(policy.allowedClockSkew()))) {
            throw invalidToken();
        }

        AccessTokenIssuance issuance = issuances
                .findTokenIssuanceById(claims.tokenId())
                .orElseThrow(RoboThreeAccessTokenValidator::invalidToken);
        if (!AuthenticationCrypto.sha256(compactToken).equals(issuance.tokenDigest())
                || !claims.enterpriseId().equals(issuance.enterpriseId())
                || !claims.userId().equals(issuance.userId())
                || !claims.deviceId().equals(issuance.deviceId())
                || !claims.clientInstanceId().equals(issuance.clientInstanceId())
                || !claims.permissions().equals(issuance.permissions())
                || !claims.issuedAt().equals(issuance.issuedAt())
                || !claims.expiresAt().equals(issuance.expiresAt())) {
            throw invalidToken();
        }
        if (!now.isBefore(claims.expiresAt())) {
            throw EnterpriseAuthenticationException.authentication(
                    "access_token_expired",
                    "The enterprise access token has expired.");
        }
        return claims;
    }

    public AccessTokenClaims requirePermission(String compactToken, String permission) {
        AccessTokenClaims claims = validate(compactToken);
        if (!claims.permissions().contains(permission)) {
            throw EnterpriseAuthenticationException.authorization(
                    "permission_denied",
                    "The enterprise access token lacks the required permission.");
        }
        return claims;
    }

    private static EnterpriseAuthenticationException invalidToken() {
        return EnterpriseAuthenticationException.authentication(
                "access_token_invalid",
                "The enterprise access token is invalid.");
    }
}
