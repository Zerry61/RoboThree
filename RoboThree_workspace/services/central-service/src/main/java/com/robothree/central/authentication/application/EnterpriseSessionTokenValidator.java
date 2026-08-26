package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.EnterpriseBearerAuthorizationResult;
import com.robothree.central.authentication.domain.EnterpriseBearerPrincipal;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.EnterpriseSessionLeaseIssuance;
import com.robothree.central.authentication.domain.EnterpriseSessionTokenClaims;
import com.robothree.central.authentication.port.EnterpriseBearerAuthorizer;
import com.robothree.central.authentication.port.EnterpriseSessionPersistence;
import com.robothree.central.authentication.port.EnterpriseSessionTokenCodec;
import com.robothree.central.authentication.port.EnterpriseSessionVerificationKeyHandleProvider;
import com.robothree.central.persistence.PersistenceIntegrityException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Objects;

/** Strict cryptographic and durable validator for the Enterprise Session claims profile. */
public final class EnterpriseSessionTokenValidator implements EnterpriseBearerAuthorizer {

    private static final int MINIMUM_TOKEN_LENGTH = 16;
    private static final int MAXIMUM_TOKEN_LENGTH = 16_384;

    private final EnterpriseSessionTokenCodec codec;
    private final EnterpriseSessionVerificationKeyHandleProvider verificationKeys;
    private final EnterpriseSessionPersistence sessions;
    private final AccessTokenSecurityPolicy policy;

    public EnterpriseSessionTokenValidator(
            EnterpriseSessionTokenCodec codec,
            EnterpriseSessionVerificationKeyHandleProvider verificationKeys,
            EnterpriseSessionPersistence sessions,
            AccessTokenSecurityPolicy policy) {
        this.codec = Objects.requireNonNull(codec, "codec");
        this.verificationKeys = Objects.requireNonNull(verificationKeys, "verificationKeys");
        this.sessions = Objects.requireNonNull(sessions, "sessions");
        this.policy = Objects.requireNonNull(policy, "policy");
        if (!EnterpriseSessionChallengeBinding.AUDIENCE.equals(policy.audience())) {
            throw new IllegalArgumentException("Session policy audience differs from the Contract");
        }
    }

    @Override
    public EnterpriseBearerAuthorizationResult authorize(
            String compactToken,
            String requiredPermission,
            Instant now) {
        Objects.requireNonNull(requiredPermission, "requiredPermission");
        Objects.requireNonNull(now, "now");
        if (!boundedAsciiBearer(compactToken)) {
            return new EnterpriseBearerAuthorizationResult.Invalid();
        }

        EnterpriseSessionTokenCodec.SessionVerificationKeyHandle verificationKey;
        try {
            verificationKey = verificationKeys.requireCurrent();
        } catch (RuntimeException exception) {
            return unavailable();
        }

        EnterpriseSessionTokenClaims claims;
        try {
            claims = codec.decodeAndVerify(
                    compactToken,
                    policy.issuer(),
                    policy.audience(),
                    verificationKey);
        } catch (RuntimeException exception) {
            return new EnterpriseBearerAuthorizationResult.Invalid();
        }

        if (claims.issuedAt().isAfter(now.plus(policy.allowedClockSkew()))) {
            return new EnterpriseBearerAuthorizationResult.Invalid();
        }

        EnterpriseSessionLeaseIssuance issuance;
        try {
            issuance = sessions.loadLeaseByTokenId(claims.tokenId()).orElse(null);
        } catch (PersistenceIntegrityException exception) {
            return new EnterpriseBearerAuthorizationResult.Invalid();
        } catch (RuntimeException exception) {
            return unavailable();
        }
        if (issuance == null || !matches(compactToken, claims, issuance)) {
            return new EnterpriseBearerAuthorizationResult.Invalid();
        }

        if (!now.isBefore(claims.expiresAt())) {
            return new EnterpriseBearerAuthorizationResult.Expired(
                    EnterpriseSessionChallengeBinding.CLAIMS_PROFILE);
        }
        return new EnterpriseBearerAuthorizationResult.Success(new EnterpriseBearerPrincipal(
                claims.claimsProfile(),
                claims.enterpriseId(),
                claims.userId(),
                claims.deviceId(),
                claims.clientInstanceId(),
                claims.tokenId(),
                claims.permissions(),
                claims.issuedAt(),
                claims.expiresAt()));
    }

    private static boolean matches(
            String compactToken,
            EnterpriseSessionTokenClaims claims,
            EnterpriseSessionLeaseIssuance issuance) {
        return timingSafeDigestEquals(
                        AuthenticationCrypto.sha256(compactToken), issuance.tokenDigest())
                && claims.claimsProfile().equals(issuance.claimsProfile())
                && claims.issuer().equals(issuance.issuer())
                && claims.audience().equals(issuance.audience())
                && claims.enterpriseId().equals(issuance.enterpriseId())
                && claims.userId().equals(issuance.userId())
                && claims.deviceId().equals(issuance.deviceId())
                && claims.clientInstanceId().equals(issuance.clientInstanceId())
                && claims.tokenId().equals(issuance.tokenId())
                && claims.issuedAt().equals(issuance.issuedAt())
                && claims.expiresAt().equals(issuance.expiresAt())
                && claims.permissions().equals(issuance.permissions())
                && claims.sessionAssertionDigest().equals(issuance.sessionAssertionDigest())
                && claims.deviceTrustDecisionDigest().equals(
                        issuance.deviceTrustDecisionDigest())
                && claims.compatibilityRevision().equals(issuance.compatibilityRevision())
                && claims.sourceDecisionDigest().equals(issuance.sourceDecisionDigest());
    }

    private static boolean timingSafeDigestEquals(String left, String right) {
        return MessageDigest.isEqual(
                left.getBytes(StandardCharsets.US_ASCII),
                right.getBytes(StandardCharsets.US_ASCII));
    }

    private static boolean boundedAsciiBearer(String value) {
        return value != null
                && value.length() >= MINIMUM_TOKEN_LENGTH
                && value.length() <= MAXIMUM_TOKEN_LENGTH
                && value.matches("^[A-Za-z0-9._~-]+$");
    }

    private static EnterpriseBearerAuthorizationResult.Unavailable unavailable() {
        return new EnterpriseBearerAuthorizationResult.Unavailable(
                "enterprise_session_unavailable");
    }
}
