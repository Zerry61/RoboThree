package com.robothree.central.authentication.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.robothree.central.authentication.domain.EnterpriseBearerAuthorizationResult;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.EnterpriseSessionLeaseIssuance;
import com.robothree.central.authentication.domain.EnterpriseSessionTokenClaims;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.port.EnterpriseSessionPersistence;
import com.robothree.central.authentication.port.EnterpriseSessionTokenCodec;
import com.robothree.central.authentication.port.EnterpriseSessionVerificationKeyHandleProvider;
import com.robothree.central.persistence.PersistenceIntegrityException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EnterpriseSessionTokenValidatorTest {

    private static final Instant NOW = Instant.parse("2026-08-24T12:00:00.000Z");
    private static final String TOKEN = "test.payload.signature";
    private static final String WIRE_A = "sha256:" + "a".repeat(64);
    private static final String WIRE_B = "sha256:" + "b".repeat(64);
    private static final String WIRE_C = "sha256:" + "c".repeat(64);
    private static final String RAW_D = "d".repeat(64);
    private static final UUID TOKEN_ID =
            UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final UUID CLIENT_ID =
            UUID.fromString("20000000-0000-4000-8000-000000000002");

    @Test
    void validatesCryptographicAndDurableFactsBeforeReturningSuccess() {
        Harness harness = harness(claims(NOW.minusSeconds(60), NOW.plusSeconds(3600)));

        assertThat(harness.validator().authorize(TOKEN, "model.use", NOW))
                .isInstanceOf(EnterpriseBearerAuthorizationResult.Success.class)
                .extracting(result -> ((EnterpriseBearerAuthorizationResult.Success) result)
                        .principal().claimsProfile())
                .isEqualTo(EnterpriseSessionChallengeBinding.CLAIMS_PROFILE);
    }

    @Test
    void reportsExpiryOnlyAfterCryptographicAndDurableMatch() {
        var expiredClaims = claims(NOW.minusSeconds(3600), NOW.minusSeconds(1));
        Harness harness = harness(expiredClaims);
        assertThat(harness.validator().authorize(TOKEN, "model.use", NOW))
                .isEqualTo(new EnterpriseBearerAuthorizationResult.Expired(
                        EnterpriseSessionChallengeBinding.CLAIMS_PROFILE));

        harness.sessions().lease = Optional.empty();
        assertThat(harness.validator().authorize(TOKEN, "model.use", NOW))
                .isEqualTo(new EnterpriseBearerAuthorizationResult.Invalid());
    }

    @Test
    void rejectsBadSignatureMissingIssuanceAndDigestMismatchAsInvalid() {
        Harness harness = harness(claims(NOW.minusSeconds(60), NOW.plusSeconds(3600)));
        harness.codec().failure = new IllegalArgumentException("bad signature");
        assertThat(harness.validator().authorize(TOKEN, "model.use", NOW))
                .isEqualTo(new EnterpriseBearerAuthorizationResult.Invalid());

        harness = harness(claims(NOW.minusSeconds(60), NOW.plusSeconds(3600)));
        harness.sessions().lease = Optional.empty();
        assertThat(harness.validator().authorize(TOKEN, "model.use", NOW))
                .isEqualTo(new EnterpriseBearerAuthorizationResult.Invalid());

        harness = harness(claims(NOW.minusSeconds(60), NOW.plusSeconds(3600)));
        harness.sessions().lease = Optional.of(lease(
                claims(NOW.minusSeconds(60), NOW.plusSeconds(3600)), RAW_D));
        assertThat(harness.validator().authorize(TOKEN, "model.use", NOW))
                .isEqualTo(new EnterpriseBearerAuthorizationResult.Invalid());
    }

    @Test
    void distinguishesCorruptFactsFromUnavailableInfrastructureWithoutFallback() {
        Harness harness = harness(claims(NOW.minusSeconds(60), NOW.plusSeconds(3600)));
        harness.sessions().failure = new PersistenceIntegrityException("corrupt", "corrupt");
        assertThat(harness.validator().authorize(TOKEN, "model.use", NOW))
                .isEqualTo(new EnterpriseBearerAuthorizationResult.Invalid());

        var codec = new FakeTokenCodec(claims(NOW.minusSeconds(60), NOW.plusSeconds(3600)));
        var sessions = new FakeSessionPersistence(Optional.empty());
        EnterpriseSessionVerificationKeyHandleProvider unavailable = () -> {
            throw new IllegalStateException("unavailable");
        };
        var validator = new EnterpriseSessionTokenValidator(
                codec,
                unavailable,
                sessions,
                AccessTokenSecurityPolicy.alphaDefaults());
        assertThat(validator.authorize(TOKEN, "model.use", NOW))
                .isEqualTo(new EnterpriseBearerAuthorizationResult.Unavailable(
                        "enterprise_session_unavailable"));
    }

    private static Harness harness(EnterpriseSessionTokenClaims claims) {
        var codec = new FakeTokenCodec(claims);
        var sessions = new FakeSessionPersistence(
                Optional.of(lease(claims, AuthenticationCrypto.sha256(TOKEN))));
        EnterpriseSessionVerificationKeyHandleProvider verificationKeys = () ->
                new EnterpriseSessionTokenCodec.SessionVerificationKeyHandle(
                        "test-verification-key-handle");
        return new Harness(
                new EnterpriseSessionTokenValidator(
                        codec,
                        verificationKeys,
                        sessions,
                        AccessTokenSecurityPolicy.alphaDefaults()),
                codec,
                sessions);
    }

    private static EnterpriseSessionTokenClaims claims(Instant issuedAt, Instant expiresAt) {
        return new EnterpriseSessionTokenClaims(
                EnterpriseSessionChallengeBinding.CLAIMS_PROFILE,
                "robothree.central",
                EnterpriseSessionChallengeBinding.AUDIENCE,
                "enterprise.alpha",
                "user.alpha",
                "device.alpha",
                CLIENT_ID,
                TOKEN_ID,
                issuedAt,
                expiresAt,
                List.of("configuration.read", "model.use"),
                WIRE_A,
                WIRE_B,
                "1",
                WIRE_C);
    }

    private static EnterpriseSessionLeaseIssuance lease(
            EnterpriseSessionTokenClaims claims,
            String tokenDigest) {
        return new EnterpriseSessionLeaseIssuance(
                claims.tokenId(),
                tokenDigest,
                claims.claimsProfile(),
                claims.issuer(),
                claims.audience(),
                claims.enterpriseId(),
                claims.userId(),
                claims.deviceId(),
                UUID.fromString("30000000-0000-4000-8000-000000000003"),
                "identity-source-revision-v1",
                claims.clientInstanceId(),
                claims.permissions(),
                RAW_D,
                1,
                WIRE_A,
                WIRE_B,
                claims.compatibilityRevision(),
                "mdm",
                "managed",
                "compliant",
                claims.issuedAt(),
                claims.expiresAt(),
                claims.issuedAt(),
                UUID.fromString("40000000-0000-4000-8000-000000000004"),
                RAW_D,
                WIRE_A,
                claims.sessionAssertionDigest(),
                "{}",
                WIRE_B,
                claims.deviceTrustDecisionDigest(),
                "{}",
                claims.sourceDecisionDigest(),
                RAW_D,
                RAW_D);
    }

    private record Harness(
            EnterpriseSessionTokenValidator validator,
            FakeTokenCodec codec,
            FakeSessionPersistence sessions) {}

    private static final class FakeTokenCodec implements EnterpriseSessionTokenCodec {
        private final EnterpriseSessionTokenClaims claims;
        private RuntimeException failure;

        private FakeTokenCodec(EnterpriseSessionTokenClaims claims) {
            this.claims = claims;
        }

        @Override
        public String encode(
                EnterpriseSessionTokenClaims ignored,
                SessionSigningKeyHandle signingKeyHandle) {
            throw new UnsupportedOperationException("encode is outside this validator test");
        }

        @Override
        public EnterpriseSessionTokenClaims decodeAndVerify(
                String compactToken,
                String expectedIssuer,
                String expectedAudience,
                SessionVerificationKeyHandle verificationKeyHandle) {
            if (failure != null) throw failure;
            return claims;
        }
    }

    private static final class FakeSessionPersistence implements EnterpriseSessionPersistence {
        private Optional<EnterpriseSessionLeaseIssuance> lease;
        private RuntimeException failure;

        private FakeSessionPersistence(Optional<EnterpriseSessionLeaseIssuance> lease) {
            this.lease = lease;
        }

        @Override
        public Optional<EnterpriseSessionLeaseIssuance> loadLeaseByTokenId(UUID tokenId) {
            if (failure != null) throw failure;
            return lease;
        }

        @Override
        public EnterpriseSessionChallengeBundle commitChallengeOutcome(
                DeviceChallenge challenge, EnterpriseSessionChallengeBinding binding) {
            throw unsupported();
        }

        @Override
        public Optional<EnterpriseSessionChallengeBundle> loadChallengeById(UUID challengeId) {
            throw unsupported();
        }

        @Override
        public Optional<EnterpriseSessionChallengeBundle> loadChallengeByCorrelationId(
                UUID correlationId) {
            throw unsupported();
        }

        @Override
        public Optional<EnterpriseSessionChallengeBundle> loadChallengeForUpdate(UUID challengeId) {
            throw unsupported();
        }

        @Override
        public EnterpriseSessionLeaseIssuance commitLeaseOutcome(
                EnterpriseSessionLeaseCommit commit) {
            throw unsupported();
        }

        private static UnsupportedOperationException unsupported() {
            return new UnsupportedOperationException("outside validator test");
        }
    }
}
