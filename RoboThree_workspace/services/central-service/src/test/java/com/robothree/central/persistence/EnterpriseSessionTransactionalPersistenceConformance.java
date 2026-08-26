package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.adapter.security.Es256DeviceProofVerifier;
import com.robothree.central.authentication.application.AccessTokenSecurityPolicy;
import com.robothree.central.authentication.application.AuthenticationCrypto;
import com.robothree.central.authentication.application.AuthenticationSecurityPolicy;
import com.robothree.central.authentication.application.DefaultEnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.application.EnterpriseSessionDecisionAssembler;
import com.robothree.central.authentication.application.FrozenCompatibilityEvaluator;
import com.robothree.central.authentication.application.IssueEnterpriseSessionChallengeService;
import com.robothree.central.authentication.application.IssueEnterpriseSessionLeaseService;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.EnterpriseCompatibility;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.OpaqueVerifiedIdentityHandle;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.EnterpriseSessionPersistence;
import com.robothree.central.authentication.port.EnterpriseSessionTokenCodec;
import com.robothree.central.authentication.port.VerifiedIdentityHandleResolver;
import com.robothree.central.authentication.support.DeterministicEnterpriseSessionTokenCodec;
import com.robothree.central.authentication.support.FixedTestEnterpriseSessionSigningKeyHandleProvider;
import com.robothree.central.authentication.support.MutableTestVerifiedIdentityHandleResolver;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.support.DeterministicAuthenticationEntropy;
import com.robothree.central.support.FakeClock;
import com.robothree.central.support.FakeDeviceSigner;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

final class EnterpriseSessionTransactionalPersistenceConformance {

    private static final Instant NOW = Instant.parse("2026-08-24T09:00:00Z");
    private static final UUID IDENTITY_ID =
            UUID.fromString("81000000-0000-4000-8000-000000000001");
    private static final UUID CLIENT_ID =
            UUID.fromString("82000000-0000-4000-8000-000000000002");
    private static final OpaqueVerifiedIdentityHandle HANDLE =
            new OpaqueVerifiedIdentityHandle("transactional_identity_handle_fixture_01");
    private static final List<String> PERMISSIONS =
            List.of("configuration.read", "personal_model.configure");

    private EnterpriseSessionTransactionalPersistenceConformance() {}

    static void verify(
            CentralPersistenceConformance.PersistenceHarness authentication,
            EnterpriseSessionPersistence sessions,
            CentralTransactionRunner transactions) {
        FakeDeviceSigner signer = seed(authentication);
        DeterministicAuthenticationEntropy entropy = new DeterministicAuthenticationEntropy();
        MutableTestVerifiedIdentityHandleResolver resolver = resolver();
        FrozenCompatibilityEvaluator compatibility = compatibility();
        FakeClock clock = new FakeClock(NOW, ZoneOffset.UTC);
        AccessTokenSecurityPolicy tokenPolicy = tokenPolicy();
        IssueEnterpriseSessionChallengeService challengeService = challengeService(
                authentication,
                sessions,
                transactions,
                entropy,
                resolver,
                compatibility,
                clock,
                tokenPolicy);
        DeterministicEnterpriseSessionTokenCodec codec =
                new DeterministicEnterpriseSessionTokenCodec();
        IssueEnterpriseSessionLeaseService leaseService = leaseService(
                authentication,
                sessions,
                transactions,
                entropy,
                resolver,
                compatibility,
                clock,
                tokenPolicy,
                codec);

        var challenge = challengeService.issue(challengeCommand(
                signer, UUID.fromString("83000000-0000-4000-8000-000000000003")));
        DeviceChallenge durable = sessions.loadChallengeById(challenge.challengeId())
                .orElseThrow()
                .challenge();
        var result = leaseService.issue(leaseCommand(
                signer,
                durable,
                UUID.fromString("83000000-0000-4000-8000-000000000003")));
        var claims = codec.decodeAndVerify(
                result.accessToken(),
                "robothree.central",
                EnterpriseSessionChallengeBinding.AUDIENCE,
                new EnterpriseSessionTokenCodec.SessionVerificationKeyHandle(
                        "test-session-signing-key-handle-v1"));
        assertThat(sessions.loadLeaseByTokenId(claims.tokenId())).isPresent();
        assertThat(sessions.loadChallengeById(challenge.challengeId()))
                .get()
                .extracting(bundle -> bundle.challenge().consumedAt())
                .isEqualTo(NOW);

        UUID rollbackCorrelation =
                UUID.fromString("84000000-0000-4000-8000-000000000004");
        var rollbackChallenge = challengeService.issue(
                challengeCommand(signer, rollbackCorrelation));
        DeviceChallenge rollbackDurable = sessions
                .loadChallengeById(rollbackChallenge.challengeId())
                .orElseThrow()
                .challenge();
        EnterpriseSessionTokenCodec failingCodec = new FailingTokenCodec();
        IssueEnterpriseSessionLeaseService failingLease = leaseService(
                authentication,
                sessions,
                transactions,
                entropy,
                resolver,
                compatibility,
                clock,
                tokenPolicy,
                failingCodec);
        assertThatThrownBy(() -> failingLease.issue(
                        leaseCommand(signer, rollbackDurable, rollbackCorrelation)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("injected encode failure");
        assertThat(sessions.loadChallengeById(rollbackChallenge.challengeId()))
                .get()
                .extracting(bundle -> bundle.challenge().consumedAt())
                .isNull();
    }

    private static FakeDeviceSigner seed(
            CentralPersistenceConformance.PersistenceHarness persistence) {
        FakeDeviceSigner signer = new FakeDeviceSigner();
        String encodedKey = signer.getPublicKey();
        persistence.identities().insert(new VerifiedEnterpriseIdentity(
                IDENTITY_ID,
                "enterprise.transactional",
                "user.transactional",
                "test-enterprise-identity",
                "a".repeat(64),
                "b".repeat(64),
                NOW.minusSeconds(60),
                NOW.plusSeconds(600),
                null));
        persistence.devices().insert(new EnterpriseDevice(
                "device.transactional",
                "enterprise.transactional",
                signer.getDeviceKeyId(),
                "spki_der_base64",
                encodedKey,
                AuthenticationCrypto.sha256(Base64.getDecoder().decode(encodedKey)),
                "ES256",
                "test-managed-device",
                "managed",
                "compliant",
                9,
                NOW.minusSeconds(60),
                null,
                null));
        for (int index = 0; index < PERMISSIONS.size(); index++) {
            persistence.permissions().save(new EnterpriseUserPermission(
                    "enterprise.transactional",
                    "user.transactional",
                    PERMISSIONS.get(index),
                    true,
                    index + 1,
                    NOW));
        }
        return signer;
    }

    private static MutableTestVerifiedIdentityHandleResolver resolver() {
        MutableTestVerifiedIdentityHandleResolver resolver =
                new MutableTestVerifiedIdentityHandleResolver();
        resolver.bind(HANDLE, new VerifiedIdentityHandleResolver.ResolvedVerifiedIdentityHandle(
                IDENTITY_ID, "transactional-source-revision-v1"));
        return resolver;
    }

    private static FrozenCompatibilityEvaluator compatibility() {
        return new FrozenCompatibilityEvaluator(
                new EnterpriseCompatibility(
                        "v1alpha1",
                        "0.0.0-eipc.1.1.3.2",
                        List.of("v1alpha1"),
                        "0.0.0-dcf.1.0",
                        "0.0.0-dcf.1.0",
                        List.of("enterprise_session"),
                        "available",
                        List.of("v1alpha1"),
                        19),
                java.util.Set.of(CLIENT_ID.toString()));
    }

    private static AccessTokenSecurityPolicy tokenPolicy() {
        return new AccessTokenSecurityPolicy(
                Duration.ofMinutes(15),
                Duration.ofSeconds(30),
                "robothree.central",
                EnterpriseSessionChallengeBinding.AUDIENCE);
    }

    private static IssueEnterpriseSessionChallengeService challengeService(
            CentralPersistenceConformance.PersistenceHarness authentication,
            EnterpriseSessionPersistence sessions,
            CentralTransactionRunner transactions,
            DeterministicAuthenticationEntropy entropy,
            MutableTestVerifiedIdentityHandleResolver resolver,
            FrozenCompatibilityEvaluator compatibility,
            FakeClock clock,
            AccessTokenSecurityPolicy tokenPolicy) {
        return new IssueEnterpriseSessionChallengeService(
                resolver,
                authentication.identities(),
                authentication.devices(),
                authentication.permissions(),
                new DefaultEnterpriseDeviceTrustProvider(),
                compatibility,
                sessions,
                transactions,
                entropy,
                clock,
                AuthenticationSecurityPolicy.alphaDefaults(),
                tokenPolicy);
    }

    private static IssueEnterpriseSessionLeaseService leaseService(
            CentralPersistenceConformance.PersistenceHarness authentication,
            EnterpriseSessionPersistence sessions,
            CentralTransactionRunner transactions,
            DeterministicAuthenticationEntropy entropy,
            MutableTestVerifiedIdentityHandleResolver resolver,
            FrozenCompatibilityEvaluator compatibility,
            FakeClock clock,
            AccessTokenSecurityPolicy tokenPolicy,
            EnterpriseSessionTokenCodec codec) {
        return new IssueEnterpriseSessionLeaseService(
                resolver,
                authentication.identities(),
                authentication.devices(),
                authentication.permissions(),
                new DefaultEnterpriseDeviceTrustProvider(),
                new Es256DeviceProofVerifier(),
                compatibility,
                sessions,
                transactions,
                entropy,
                codec,
                new FixedTestEnterpriseSessionSigningKeyHandleProvider(),
                new EnterpriseSessionDecisionAssembler(),
                clock,
                tokenPolicy);
    }

    private static IssueEnterpriseSessionChallengeService.Command challengeCommand(
            FakeDeviceSigner signer,
            UUID correlationId) {
        return new IssueEnterpriseSessionChallengeService.Command(
                HANDLE,
                CLIENT_ID,
                EnterpriseSessionChallengeBinding.AUDIENCE,
                PERMISSIONS,
                signer.getDeviceKeyId(),
                correlationId);
    }

    private static IssueEnterpriseSessionLeaseService.Command leaseCommand(
            FakeDeviceSigner signer,
            DeviceChallenge challenge,
            UUID correlationId) {
        DeviceProof proof = new DeviceProof(
                challenge.challengeId(),
                signer.getDeviceKeyId(),
                "ES256",
                Base64.getUrlEncoder().withoutPadding().encodeToString(
                        signer.sign(AuthenticationCrypto.signingBytes(challenge))),
                NOW);
        return new IssueEnterpriseSessionLeaseService.Command(
                HANDLE,
                CLIENT_ID,
                EnterpriseSessionChallengeBinding.AUDIENCE,
                PERMISSIONS,
                proof,
                correlationId);
    }

    private static final class FailingTokenCodec implements EnterpriseSessionTokenCodec {
        @Override
        public String encode(
                com.robothree.central.authentication.domain.EnterpriseSessionTokenClaims claims,
                SessionSigningKeyHandle signingKeyHandle) {
            throw new IllegalStateException("injected encode failure");
        }

        @Override
        public com.robothree.central.authentication.domain.EnterpriseSessionTokenClaims
                decodeAndVerify(
                        String compactToken,
                        String expectedIssuer,
                        String expectedAudience,
                        SessionVerificationKeyHandle verificationKeyHandle) {
            throw new UnsupportedOperationException("decode is not used");
        }
    }
}
