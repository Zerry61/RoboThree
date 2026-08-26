package com.robothree.central.authentication.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.adapter.security.Es256DeviceProofVerifier;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.EnterpriseCompatibility;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.EnterpriseSessionPersistenceDigests;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.OpaqueVerifiedIdentityHandle;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.EnterpriseSessionTokenCodec;
import com.robothree.central.authentication.port.VerifiedIdentityHandleResolver;
import com.robothree.central.authentication.support.DeterministicEnterpriseSessionTokenCodec;
import com.robothree.central.authentication.support.FixedTestEnterpriseSessionSigningKeyHandleProvider;
import com.robothree.central.authentication.support.MutableTestVerifiedIdentityHandleResolver;
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
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
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

class EnterpriseSessionTransactionalApplicationTest {

    private static final Instant NOW = Instant.parse("2026-08-24T08:00:00Z");
    private static final UUID IDENTITY_ID =
            UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final UUID CLIENT_ID =
            UUID.fromString("20000000-0000-4000-8000-000000000002");
    private static final String SOURCE_REVISION = "identity-source-revision-v1";
    private static final OpaqueVerifiedIdentityHandle HANDLE =
            new OpaqueVerifiedIdentityHandle("opaque_enterprise_identity_handle_0001");
    private static final List<String> PERMISSIONS =
            List.of("configuration.read", "personal_model.configure");

    @Test
    void issuesChallengeAndLeaseWithEncodeInsideTransaction() {
        Harness harness = harness();
        var challenge = harness.challengeService().issue(challengeCommand());
        DeviceChallenge durableChallenge = harness.persistence()
                .loadChallengeById(challenge.challengeId())
                .orElseThrow()
                .challenge();

        var result = harness.leaseService().issue(leaseCommand(
                signedProof(harness.signer(), durableChallenge)));

        var claims = harness.codec().decodeAndVerify(
                result.accessToken(),
                "robothree.central",
                EnterpriseSessionChallengeBinding.AUDIENCE,
                new EnterpriseSessionTokenCodec.SessionVerificationKeyHandle(
                        "test-session-signing-key-handle-v1"));
        assertThat(claims.enterpriseId()).isEqualTo("enterprise.alpha");
        assertThat(claims.userId()).isEqualTo("user.alpha");
        assertThat(claims.permissions()).isEqualTo(PERMISSIONS);
        assertThat(harness.trackingTransactions().encodeObservedInsideTransaction()).isTrue();
        assertThat(harness.trackingTransactions().encodeCount()).isEqualTo(1);
        assertThat(result.toString()).doesNotContain(result.accessToken());
        assertThat(result.sessionAssertionJson()).contains("enterprise_session_assertion");
        assertThat(result.deviceTrustDecisionJson()).contains("enterprise_device_trust_decision");

        var committedChallenge = harness.persistence()
                .loadChallengeById(challenge.challengeId())
                .orElseThrow()
                .challenge();
        assertThat(committedChallenge.consumedAt()).isEqualTo(NOW);
        assertThat(harness.persistence().loadLeaseByTokenId(claims.tokenId()))
                .get()
                .satisfies(lease -> {
                    assertThat(lease.tokenDigest())
                            .isEqualTo(AuthenticationCrypto.sha256(result.accessToken()));
                    assertThat(EnterpriseSessionPersistenceDigests.leaseRecordDigest(lease))
                            .isEqualTo(lease.recordDigest());
                });
    }

    @Test
    void sameCorrelationReplaysExactSafeChallengeWithoutNewNonce() {
        Harness harness = harness();

        var first = harness.challengeService().issue(challengeCommand());
        var replay = harness.challengeService().issue(challengeCommand());

        assertThat(replay).isEqualTo(first);
        assertThat(harness.persistence().loadChallengeByCorrelationId(
                        challengeCommand().correlationId()))
                .isPresent();
    }

    @Test
    void sameCorrelationWithDifferentIntentFailsWithoutLeakingNonce() {
        Harness harness = harness();
        harness.challengeService().issue(challengeCommand());
        var changed = new IssueEnterpriseSessionChallengeService.Command(
                HANDLE,
                CLIENT_ID,
                EnterpriseSessionChallengeBinding.AUDIENCE,
                List.of("configuration.read"),
                harness.signer().getDeviceKeyId(),
                challengeCommand().correlationId());

        assertThatThrownBy(() -> harness.challengeService().issue(changed))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("enterprise_session_conflict");
    }

    @Test
    void concurrentSameCorrelationConvergesOnOnePersistedChallenge() throws Exception {
        Harness harness = harness();
        try (var executor = Executors.newFixedThreadPool(8)) {
            List<Callable<IssueEnterpriseSessionChallengeService.Result>> work =
                    java.util.stream.IntStream.range(0, 24)
                            .mapToObj(index -> (Callable<IssueEnterpriseSessionChallengeService.Result>)
                                    () -> harness.challengeService().issue(challengeCommand()))
                            .toList();
            var results = executor.invokeAll(work).stream()
                    .map(future -> {
                        try {
                            return future.get();
                        } catch (Exception exception) {
                            throw new AssertionError(exception);
                        }
                    })
                    .toList();
            assertThat(results).allMatch(results.getFirst()::equals);
            assertThat(harness.persistence().loadChallengeByCorrelationId(
                            challengeCommand().correlationId()))
                    .get()
                    .extracting(bundle -> bundle.challenge().challengeId())
                    .isEqualTo(results.getFirst().challengeId());
        }
    }

    @Test
    void disabledOrMissingRequestedPermissionFailsBeforeChallengeCommit() {
        Harness disabled = harness();
        disabled.persistence().save(new EnterpriseUserPermission(
                "enterprise.alpha",
                "user.alpha",
                "personal_model.configure",
                false,
                3,
                NOW));

        assertThatThrownBy(() -> disabled.challengeService().issue(challengeCommand()))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("permission_denied");
        assertThat(disabled.persistence().loadChallengeByCorrelationId(
                        challengeCommand().correlationId()))
                .isEmpty();

        Harness missing = harness(false, false);
        assertThatThrownBy(() -> missing.challengeService().issue(challengeCommand()))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("permission_denied");
    }

    @Test
    void encodeFailureRollsBackAndLeavesChallengePending() {
        Harness harness = harness(true);
        var challenge = harness.challengeService().issue(challengeCommand());
        DeviceChallenge durable = harness.persistence()
                .loadChallengeById(challenge.challengeId())
                .orElseThrow()
                .challenge();

        assertThatThrownBy(() -> harness.leaseService().issue(
                        leaseCommand(signedProof(harness.signer(), durable))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("injected token encode failure");
        assertThat(harness.persistence().loadChallengeById(challenge.challengeId()))
                .get()
                .extracting(bundle -> bundle.challenge().consumedAt())
                .isNull();
    }

    @Test
    void consumedChallengeNeverReplaysBearer() {
        Harness harness = harness();
        var challenge = harness.challengeService().issue(challengeCommand());
        DeviceChallenge durable = harness.persistence()
                .loadChallengeById(challenge.challengeId())
                .orElseThrow()
                .challenge();
        var command = leaseCommand(signedProof(harness.signer(), durable));
        harness.leaseService().issue(command);

        assertThatThrownBy(() -> harness.leaseService().issue(command))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("device_challenge_replayed");
        assertThat(harness.trackingTransactions().encodeCount()).isEqualTo(1);
    }

    @Test
    void permissionDriftAfterChallengeDoesNotConsumeIt() {
        Harness harness = harness();
        var challenge = harness.challengeService().issue(challengeCommand());
        DeviceChallenge durable = harness.persistence()
                .loadChallengeById(challenge.challengeId())
                .orElseThrow()
                .challenge();
        harness.persistence().save(new EnterpriseUserPermission(
                "enterprise.alpha",
                "user.alpha",
                "personal_model.configure",
                false,
                3,
                NOW));

        assertThatThrownBy(() -> harness.leaseService().issue(
                        leaseCommand(signedProof(harness.signer(), durable))))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("permission_denied");
        assertThat(harness.persistence().loadChallengeById(challenge.challengeId()))
                .get()
                .extracting(bundle -> bundle.challenge().consumedAt())
                .isNull();
        assertThat(harness.trackingTransactions().encodeCount()).isZero();
    }

    @Test
    void sourceRevisionDriftFailsBeforeProofOrEncode() {
        Harness harness = harness();
        var challenge = harness.challengeService().issue(challengeCommand());
        DeviceChallenge durable = harness.persistence()
                .loadChallengeById(challenge.challengeId())
                .orElseThrow()
                .challenge();
        harness.resolver().bind(HANDLE, new VerifiedIdentityHandleResolver.ResolvedVerifiedIdentityHandle(
                IDENTITY_ID, "identity-source-revision-v2"));

        assertThatThrownBy(() -> harness.leaseService().issue(
                        leaseCommand(signedProof(harness.signer(), durable))))
                .isInstanceOf(RuntimeException.class);
        assertThat(harness.trackingTransactions().encodeCount()).isZero();
        assertThat(harness.persistence().loadChallengeById(challenge.challengeId()))
                .get()
                .extracting(bundle -> bundle.challenge().consumedAt())
                .isNull();
    }

    private static IssueEnterpriseSessionChallengeService.Command challengeCommand() {
        return new IssueEnterpriseSessionChallengeService.Command(
                HANDLE,
                CLIENT_ID,
                EnterpriseSessionChallengeBinding.AUDIENCE,
                PERMISSIONS,
                "fake-device-key",
                UUID.fromString("30000000-0000-4000-8000-000000000003"));
    }

    private static IssueEnterpriseSessionLeaseService.Command leaseCommand(DeviceProof proof) {
        return new IssueEnterpriseSessionLeaseService.Command(
                HANDLE,
                CLIENT_ID,
                EnterpriseSessionChallengeBinding.AUDIENCE,
                PERMISSIONS,
                proof,
                challengeCommand().correlationId());
    }

    private static DeviceProof signedProof(FakeDeviceSigner signer, DeviceChallenge challenge) {
        return new DeviceProof(
                challenge.challengeId(),
                signer.getDeviceKeyId(),
                "ES256",
                Base64.getUrlEncoder().withoutPadding().encodeToString(
                        signer.sign(AuthenticationCrypto.signingBytes(challenge))),
                NOW);
    }

    private static Harness harness() {
        return harness(false, true);
    }

    private static Harness harness(boolean failEncode) {
        return harness(failEncode, true);
    }

    private static Harness harness(boolean failEncode, boolean includePersonalPermission) {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        TrackingTransactionRunner transactions = new TrackingTransactionRunner(persistence);
        FakeClock clock = new FakeClock(NOW, ZoneOffset.UTC);
        DeterministicAuthenticationEntropy entropy = new DeterministicAuthenticationEntropy();
        FakeDeviceSigner signer = new FakeDeviceSigner();
        String encodedKey = signer.getPublicKey();
        String publicKeyDigest = AuthenticationCrypto.sha256(Base64.getDecoder().decode(encodedKey));
        persistence.insert(new VerifiedEnterpriseIdentity(
                IDENTITY_ID,
                "enterprise.alpha",
                "user.alpha",
                "test-enterprise-identity",
                "a".repeat(64),
                "b".repeat(64),
                NOW.minusSeconds(60),
                NOW.plusSeconds(600),
                null));
        persistence.insert(new EnterpriseDevice(
                "device.alpha",
                "enterprise.alpha",
                signer.getDeviceKeyId(),
                "spki_der_base64",
                encodedKey,
                publicKeyDigest,
                "ES256",
                "test-managed-device",
                "managed",
                "compliant",
                7,
                NOW.minusSeconds(60),
                null,
                null));
        int permissionCount = includePersonalPermission ? PERMISSIONS.size() : 1;
        for (int index = 0; index < permissionCount; index++) {
            persistence.save(new EnterpriseUserPermission(
                    "enterprise.alpha",
                    "user.alpha",
                    PERMISSIONS.get(index),
                    true,
                    index + 1,
                    NOW));
        }
        MutableTestVerifiedIdentityHandleResolver resolver =
                new MutableTestVerifiedIdentityHandleResolver();
        resolver.bind(HANDLE, new VerifiedIdentityHandleResolver.ResolvedVerifiedIdentityHandle(
                IDENTITY_ID, SOURCE_REVISION));
        FrozenCompatibilityEvaluator compatibility = new FrozenCompatibilityEvaluator(
                new EnterpriseCompatibility(
                        "v1alpha1",
                        "0.0.0-eipc.1.1.3.2",
                        List.of("v1alpha1"),
                        "0.0.0-dcf.1.0",
                        "0.0.0-dcf.1.0",
                        List.of("enterprise_session"),
                        "available",
                        List.of("v1alpha1"),
                        17),
                java.util.Set.of(CLIENT_ID.toString()));
        AccessTokenSecurityPolicy tokenPolicy = new AccessTokenSecurityPolicy(
                Duration.ofMinutes(15),
                Duration.ofSeconds(30),
                "robothree.central",
                EnterpriseSessionChallengeBinding.AUDIENCE);
        IssueEnterpriseSessionChallengeService challengeService =
                new IssueEnterpriseSessionChallengeService(
                        resolver,
                        persistence,
                        persistence,
                        persistence,
                        new DefaultEnterpriseDeviceTrustProvider(),
                        compatibility,
                        persistence,
                        transactions,
                        entropy,
                        clock,
                        AuthenticationSecurityPolicy.alphaDefaults(),
                        tokenPolicy);
        DeterministicEnterpriseSessionTokenCodec deterministicCodec =
                new DeterministicEnterpriseSessionTokenCodec();
        TrackingTokenCodec codec = new TrackingTokenCodec(
                deterministicCodec, transactions, failEncode);
        IssueEnterpriseSessionLeaseService leaseService = new IssueEnterpriseSessionLeaseService(
                resolver,
                persistence,
                persistence,
                persistence,
                new DefaultEnterpriseDeviceTrustProvider(),
                new Es256DeviceProofVerifier(),
                compatibility,
                persistence,
                transactions,
                entropy,
                codec,
                new FixedTestEnterpriseSessionSigningKeyHandleProvider(),
                new EnterpriseSessionDecisionAssembler(),
                clock,
                tokenPolicy);
        return new Harness(
                persistence,
                transactions,
                signer,
                resolver,
                deterministicCodec,
                challengeService,
                leaseService);
    }

    private static final class TrackingTransactionRunner implements CentralTransactionRunner {
        private final InMemoryCentralPersistence delegate;
        private final AtomicBoolean active = new AtomicBoolean();
        private final AtomicBoolean encodeInside = new AtomicBoolean();
        private final AtomicInteger encodeCount = new AtomicInteger();

        private TrackingTransactionRunner(InMemoryCentralPersistence delegate) {
            this.delegate = delegate;
        }

        @Override
        public <T> T required(Supplier<T> work) {
            return delegate.required(() -> {
                if (!active.compareAndSet(false, true)) {
                    throw new IllegalStateException("nested transaction is not allowed in this test");
                }
                try {
                    return work.get();
                } finally {
                    active.set(false);
                }
            });
        }

        private void observeEncode() {
            encodeCount.incrementAndGet();
            encodeInside.set(active.get());
            if (!active.get()) {
                throw new IllegalStateException("token encode occurred outside transaction");
            }
        }

        private boolean encodeObservedInsideTransaction() {
            return encodeInside.get();
        }

        private int encodeCount() {
            return encodeCount.get();
        }
    }

    private static final class TrackingTokenCodec implements EnterpriseSessionTokenCodec {
        private final DeterministicEnterpriseSessionTokenCodec delegate;
        private final TrackingTransactionRunner transactions;
        private final boolean failEncode;

        private TrackingTokenCodec(
                DeterministicEnterpriseSessionTokenCodec delegate,
                TrackingTransactionRunner transactions,
                boolean failEncode) {
            this.delegate = delegate;
            this.transactions = transactions;
            this.failEncode = failEncode;
        }

        @Override
        public String encode(
                com.robothree.central.authentication.domain.EnterpriseSessionTokenClaims claims,
                SessionSigningKeyHandle signingKeyHandle) {
            transactions.observeEncode();
            if (failEncode) {
                throw new IllegalStateException("injected token encode failure");
            }
            return delegate.encode(claims, signingKeyHandle);
        }

        @Override
        public com.robothree.central.authentication.domain.EnterpriseSessionTokenClaims
                decodeAndVerify(
                        String compactToken,
                        String expectedIssuer,
                        String expectedAudience,
                        SessionVerificationKeyHandle verificationKeyHandle) {
            return delegate.decodeAndVerify(
                    compactToken, expectedIssuer, expectedAudience, verificationKeyHandle);
        }
    }

    private record Harness(
            InMemoryCentralPersistence persistence,
            TrackingTransactionRunner trackingTransactions,
            FakeDeviceSigner signer,
            MutableTestVerifiedIdentityHandleResolver resolver,
            DeterministicEnterpriseSessionTokenCodec codec,
            IssueEnterpriseSessionChallengeService challengeService,
            IssueEnterpriseSessionLeaseService leaseService) {}
}
