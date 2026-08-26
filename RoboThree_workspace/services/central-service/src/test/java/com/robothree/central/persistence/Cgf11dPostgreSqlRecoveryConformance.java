package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeout;

import com.robothree.central.authentication.adapter.security.Es256DeviceProofVerifier;
import com.robothree.central.authentication.adapter.security.SecureAuthenticationEntropySource;
import com.robothree.central.authentication.application.AccessTokenSecurityPolicy;
import com.robothree.central.authentication.application.AuthenticationCrypto;
import com.robothree.central.authentication.application.AuthenticationSecurityPolicy;
import com.robothree.central.authentication.application.DefaultEnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import com.robothree.central.authentication.application.FrozenCompatibilityEvaluator;
import com.robothree.central.authentication.application.IssueDeviceChallengeService;
import com.robothree.central.authentication.application.ManualDeviceEnrollmentService;
import com.robothree.central.authentication.application.RoboThreeAccessTokenService;
import com.robothree.central.authentication.application.RoboThreeAccessTokenValidator;
import com.robothree.central.authentication.application.VerifyEnterpriseIdentityService;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceEnrollmentGrant;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.DevicePublicKey;
import com.robothree.central.authentication.domain.EnterpriseCompatibility;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.AuthenticationEntropySource;
import com.robothree.central.authentication.port.OAIdentityAdapter;
import com.robothree.central.configuration.application.ConfigurationIntegrityVerifier;
import com.robothree.central.configuration.application.ConfigurationReadService;
import com.robothree.central.configuration.application.TrustedConfigurationSeeder;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.support.CanonicalConfigurationFixtures;
import com.robothree.central.support.FakeClock;
import com.robothree.central.support.FakeDeviceSigner;
import com.robothree.central.support.FakeEnterpriseSecretStore;
import com.robothree.central.support.FakeJwsTokenCodec;
import com.robothree.central.support.FakeOAIdentityAdapter;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * CGF-1.1D closes the stage with one real PostgreSQL chain. Rebuilding every
 * runtime object at each named point proves that no correctness fact lives in
 * an HTTP session or an Adapter instance.
 */
final class Cgf11dPostgreSqlRecoveryConformance {

    private static final Instant NOW = Instant.parse("2026-07-25T10:00:00Z");
    private static final String CLIENT_INSTANCE_ID =
            "71000000-0000-4000-8000-000000000001";
    private static final String OA_FLOW_MATERIAL =
            "cgf11d-raw-oa-flow-material-must-never-persist";
    private static final String ENROLLMENT_CODE =
            "cgf11d-enrollment-code-must-never-persist";

    private Cgf11dPostgreSqlRecoveryConformance() {}

    static void verify(
            DataSource dataSource,
            CentralPersistenceVariants.Variant variant) {
        SharedRuntime shared = sharedRuntime();
        Runtime first = runtime(dataSource, shared, variant);

        VerifiedEnterpriseIdentity identity = first.identityVerifier().verify(
                new FakeOAIdentityAdapter.FakeOAIdentityMaterial(OA_FLOW_MATERIAL));
        first.persistence().enrollmentGrants().insert(new DeviceEnrollmentGrant(
                UUID.fromString("71000000-0000-4000-8000-000000000002"),
                AuthenticationCrypto.sha256(ENROLLMENT_CODE),
                identity.enterpriseId(),
                identity.userId(),
                NOW,
                NOW.plusSeconds(600),
                null,
                null));
        assertNamedCrash(FaultPoint.AFTER_IDENTITY_COMMIT);

        Runtime afterIdentityRestart = runtime(dataSource, shared, variant);
        DevicePublicKey publicKey = devicePublicKey(shared.signer());
        DeviceChallenge enrollmentChallenge = afterIdentityRestart.challengeService().issue(
                new IssueDeviceChallengeService.IssueDeviceChallengeCommand(
                        IssueDeviceChallengeService.DEVICE_ENROLLMENT,
                        identity.verifiedIdentityId(),
                        CLIENT_INSTANCE_ID,
                        null,
                        ENROLLMENT_CODE,
                        publicKeyDigest(publicKey)));
        assertNamedCrash(FaultPoint.AFTER_ENROLLMENT_CHALLENGE_COMMIT);

        Runtime afterEnrollmentChallengeRestart = runtime(dataSource, shared, variant);
        DeviceProof enrollmentProof = signedProof(
                shared.signer(),
                enrollmentChallenge,
                shared.clock().instant());
        var enrollmentResult = afterEnrollmentChallengeRestart.enrollmentService().enroll(
                new ManualDeviceEnrollmentService.EnrollDeviceCommand(
                        identity.verifiedIdentityId(),
                        ENROLLMENT_CODE,
                        CLIENT_INSTANCE_ID,
                        publicKey,
                        enrollmentProof));
        afterEnrollmentChallengeRestart.persistence().permissions().save(permission(
                identity,
                "configuration.read",
                1));
        afterEnrollmentChallengeRestart.persistence().permissions().save(permission(
                identity,
                "model.use",
                2));
        assertNamedCrash(FaultPoint.AFTER_DEVICE_ENROLLMENT_COMMIT);

        Runtime afterEnrollmentRestart = runtime(dataSource, shared, variant);
        DeviceChallenge tokenChallenge = afterEnrollmentRestart.challengeService().issue(
                tokenChallengeCommand(identity, shared.signer()));
        RoboThreeAccessTokenService.IssueAccessTokenCommand tokenCommand =
                tokenCommand(identity, shared.signer(), tokenChallenge, shared.clock().instant());
        assertNamedCrash(FaultPoint.AFTER_TOKEN_CHALLENGE_COMMIT);

        CentralTransactionRunner rollbackBeforeCommit =
                failAfterWorkBeforeCommit(
                        variant.open(dataSource).transactions(),
                        FaultPoint.BEFORE_TOKEN_COMMIT);
        Runtime failingTokenRuntime =
                runtime(dataSource, shared, variant, rollbackBeforeCommit);
        assertThatThrownBy(() -> failingTokenRuntime.tokenService().issue(tokenCommand))
                .isInstanceOf(NamedCrash.class)
                .extracting("point")
                .isEqualTo(FaultPoint.BEFORE_TOKEN_COMMIT);

        Runtime afterRollbackRestart = runtime(dataSource, shared, variant);
        assertThat(afterRollbackRestart.persistence().challenges()
                        .findChallengeById(tokenChallenge.challengeId()))
                .get()
                .extracting(DeviceChallenge::consumedAt)
                .isNull();
        assertThat(rowCount(dataSource, "access_token_issuance")).isZero();

        RoboThreeAccessTokenService.IssueAccessTokenResult lostResponse =
                afterRollbackRestart.tokenService().issue(tokenCommand);
        assertNamedCrash(FaultPoint.AFTER_TOKEN_COMMIT_BEFORE_RESPONSE);

        Runtime afterLostResponseRestart = runtime(dataSource, shared, variant);
        assertThat(rowCount(dataSource, "access_token_issuance")).isEqualTo(1);
        assertError(
                () -> afterLostResponseRestart.tokenService().issue(tokenCommand),
                "device_challenge_replayed");

        DeviceChallenge replacementChallenge =
                afterLostResponseRestart.challengeService().issue(
                        tokenChallengeCommand(identity, shared.signer()));
        RoboThreeAccessTokenService.IssueAccessTokenResult usableToken =
                afterLostResponseRestart.tokenService().issue(tokenCommand(
                        identity,
                        shared.signer(),
                        replacementChallenge,
                        shared.clock().instant()));

        CanonicalConfigurationFixtures.Seed seed =
                CanonicalConfigurationFixtures.validSeed(NOW);
        afterLostResponseRestart.configurationSeeder().seed(
                seed.packages(),
                seed.snapshot());
        assertNamedCrash(FaultPoint.AFTER_CONFIGURATION_SEED_COMMIT);

        Runtime afterConfigurationRestart = runtime(dataSource, shared, variant);
        var configuration = afterConfigurationRestart.configurationRead().read(
                usableToken.accessToken(),
                null);
        assertThat(configuration.notModified()).isFalse();
        assertThat(configuration.documentJson()).isEqualTo(seed.snapshot().documentJson());
        assertThat(afterConfigurationRestart.configurationRead()
                        .read(usableToken.accessToken(), configuration.etag()))
                .satisfies(cached -> {
                    assertThat(cached.notModified()).isTrue();
                    assertThat(cached.documentJson()).isNull();
                    assertThat(cached.etag()).isEqualTo(configuration.etag());
                });

        verifyBoundedConcurrentTokenIssuance(
                dataSource,
                shared,
                identity,
                variant);
        verifyExpiryBoundaryAfterRestart(
                dataSource,
                shared,
                identity,
                variant);

        assertDatabaseDoesNotContain(dataSource, OA_FLOW_MATERIAL);
        assertDatabaseDoesNotContain(dataSource, ENROLLMENT_CODE);
        assertDatabaseDoesNotContain(dataSource, lostResponse.accessToken());
        assertDatabaseDoesNotContain(dataSource, usableToken.accessToken());
        assertThat(enrollmentResult.deviceKeyId()).isEqualTo(shared.signer().getDeviceKeyId());
    }

    private static void verifyBoundedConcurrentTokenIssuance(
            DataSource dataSource,
            SharedRuntime shared,
            VerifiedEnterpriseIdentity identity,
            CentralPersistenceVariants.Variant variant) {
        Runtime runtime = runtime(dataSource, shared, variant);
        DeviceChallenge challenge = runtime.challengeService().issue(
                tokenChallengeCommand(identity, shared.signer()));
        var command = tokenCommand(
                identity,
                shared.signer(),
                challenge,
                shared.clock().instant());

        List<Boolean> outcomes = assertTimeout(Duration.ofSeconds(30), () -> {
            try (var executor = Executors.newFixedThreadPool(8)) {
                List<Callable<Boolean>> attempts = new ArrayList<>();
                for (int index = 0; index < 32; index += 1) {
                    attempts.add(() -> {
                        try {
                            runtime.tokenService().issue(command);
                            return true;
                        } catch (EnterpriseAuthenticationException exception) {
                            assertThat(exception.code())
                                    .isEqualTo("device_challenge_replayed");
                            return false;
                        }
                    });
                }
                return executor.invokeAll(attempts).stream()
                        .map(future -> {
                            try {
                                return future.get();
                            } catch (Exception exception) {
                                throw new AssertionError(exception);
                            }
                        })
                        .toList();
            }
        });
        assertThat(outcomes).hasSize(32);
        assertThat(outcomes.stream().filter(Boolean::booleanValue)).hasSize(1);
    }

    private static void verifyExpiryBoundaryAfterRestart(
            DataSource dataSource,
            SharedRuntime shared,
            VerifiedEnterpriseIdentity identity,
            CentralPersistenceVariants.Variant variant) {
        Runtime runtime = runtime(dataSource, shared, variant);
        DeviceChallenge challenge = runtime.challengeService().issue(
                tokenChallengeCommand(identity, shared.signer()));
        var command = tokenCommand(
                identity,
                shared.signer(),
                challenge,
                shared.clock().instant());
        shared.clock().advanceSeconds(AuthenticationSecurityPolicy.alphaDefaults()
                .challengeTtl()
                .toSeconds());

        Runtime afterBoundaryRestart = runtime(dataSource, shared, variant);
        assertError(
                () -> afterBoundaryRestart.tokenService().issue(command),
                "device_challenge_expired");
        assertThat(afterBoundaryRestart.persistence().challenges()
                        .findChallengeById(challenge.challengeId()))
                .get()
                .extracting(DeviceChallenge::consumedAt)
                .isNull();
    }

    private static SharedRuntime sharedRuntime() {
        FakeClock clock = new FakeClock(NOW, ZoneOffset.UTC);
        FakeDeviceSigner signer = new FakeDeviceSigner();
        AuthenticationEntropySource entropy = new SecureAuthenticationEntropySource();
        FakeOAIdentityAdapter oa = new FakeOAIdentityAdapter(Map.of(
                OA_FLOW_MATERIAL,
                new OAIdentityAdapter.VerifiedIdentityClaims(
                        "enterprise.cgf11d",
                        "user.cgf11d",
                        "fake-oa",
                        "7".repeat(64))));
        EnterpriseCompatibility compatibility = new EnterpriseCompatibility(
                "v1alpha1",
                "0.0.0-cgf.1.1d",
                List.of("v1alpha1"),
                "0.0.0-dcf.1.0",
                "0.0.0-dcf.1.0",
                List.of(
                        "configuration_snapshot",
                        "fixed_permissions",
                        "enterprise_identity",
                        "managed_device_trust",
                        "manual_device_enrollment"),
                "available",
                List.of("v1alpha1"),
                11);
        return new SharedRuntime(
                clock,
                signer,
                entropy,
                oa,
                new FrozenCompatibilityEvaluator(
                        compatibility,
                        Set.of(CLIENT_INSTANCE_ID)));
    }

    private static Runtime runtime(
            DataSource dataSource,
            SharedRuntime shared,
            CentralPersistenceVariants.Variant variant) {
        return runtime(
                dataSource,
                shared,
                variant,
                variant.open(dataSource).transactions());
    }

    private static Runtime runtime(
            DataSource dataSource,
            SharedRuntime shared,
            CentralPersistenceVariants.Variant variant,
            CentralTransactionRunner tokenTransactions) {
        CentralPersistenceConformance.PersistenceHarness persistence =
                variant.open(dataSource);
        AuthenticationSecurityPolicy authenticationPolicy =
                AuthenticationSecurityPolicy.alphaDefaults();
        var trust = new DefaultEnterpriseDeviceTrustProvider();
        var proofVerifier = new Es256DeviceProofVerifier();
        var challengeService = new IssueDeviceChallengeService(
                persistence.identities(),
                persistence.devices(),
                persistence.enrollmentGrants(),
                persistence.challenges(),
                trust,
                shared.entropy(),
                shared.clock(),
                authenticationPolicy);
        var enrollmentService = new ManualDeviceEnrollmentService(
                persistence.identities(),
                persistence.devices(),
                persistence.enrollmentGrants(),
                persistence.challenges(),
                proofVerifier,
                persistence.transactions(),
                shared.entropy(),
                shared.clock(),
                authenticationPolicy);
        var tokenCodec = new FakeJwsTokenCodec();
        var secretStore = new FakeEnterpriseSecretStore();
        var tokenService = new RoboThreeAccessTokenService(
                persistence.identities(),
                persistence.devices(),
                persistence.permissions(),
                persistence.challenges(),
                persistence.tokenIssuances(),
                trust,
                proofVerifier,
                shared.compatibility(),
                tokenCodec,
                secretStore,
                tokenTransactions,
                shared.entropy(),
                shared.clock(),
                AccessTokenSecurityPolicy.alphaDefaults());
        var validator = new RoboThreeAccessTokenValidator(
                tokenCodec,
                secretStore,
                persistence.tokenIssuances(),
                shared.clock(),
                AccessTokenSecurityPolicy.alphaDefaults());
        var integrity = new ConfigurationIntegrityVerifier(persistence.packages());
        return new Runtime(
                persistence,
                new VerifyEnterpriseIdentityService(
                        shared.oa(),
                        persistence.identities(),
                        shared.entropy(),
                        shared.clock(),
                        authenticationPolicy),
                challengeService,
                enrollmentService,
                tokenService,
                new TrustedConfigurationSeeder(
                        persistence.packages(),
                        persistence.snapshots(),
                        persistence.transactions(),
                        integrity),
                new ConfigurationReadService(
                        new com.robothree.central.authentication.application
                                .LegacyBearerAuthorizerAdapter(validator),
                        persistence.snapshots(),
                        integrity,
                        shared.clock()));
    }

    private static IssueDeviceChallengeService.IssueDeviceChallengeCommand
            tokenChallengeCommand(
                    VerifiedEnterpriseIdentity identity,
                    FakeDeviceSigner signer) {
        return new IssueDeviceChallengeService.IssueDeviceChallengeCommand(
                IssueDeviceChallengeService.TOKEN_ISSUANCE,
                identity.verifiedIdentityId(),
                CLIENT_INSTANCE_ID,
                signer.getDeviceKeyId(),
                null,
                null);
    }

    private static RoboThreeAccessTokenService.IssueAccessTokenCommand tokenCommand(
            VerifiedEnterpriseIdentity identity,
            FakeDeviceSigner signer,
            DeviceChallenge challenge,
            Instant signedAt) {
        return new RoboThreeAccessTokenService.IssueAccessTokenCommand(
                identity.verifiedIdentityId(),
                CLIENT_INSTANCE_ID,
                signedProof(signer, challenge, signedAt));
    }

    private static DevicePublicKey devicePublicKey(FakeDeviceSigner signer) {
        return new DevicePublicKey(
                signer.getDeviceKeyId(),
                "ES256",
                "spki_der_base64",
                signer.getPublicKey());
    }

    private static String publicKeyDigest(DevicePublicKey key) {
        return AuthenticationCrypto.sha256(
                Base64.getDecoder().decode(key.encodedKey()));
    }

    private static DeviceProof signedProof(
            FakeDeviceSigner signer,
            DeviceChallenge challenge,
            Instant signedAt) {
        return new DeviceProof(
                challenge.challengeId(),
                signer.getDeviceKeyId(),
                "ES256",
                Base64.getUrlEncoder().withoutPadding().encodeToString(
                        signer.sign(AuthenticationCrypto.signingBytes(challenge))),
                signedAt);
    }

    private static EnterpriseUserPermission permission(
            VerifiedEnterpriseIdentity identity,
            String permission,
            long revision) {
        return new EnterpriseUserPermission(
                identity.enterpriseId(),
                identity.userId(),
                permission,
                true,
                revision,
                NOW);
    }

    private static CentralTransactionRunner failAfterWorkBeforeCommit(
            CentralTransactionRunner delegate,
            FaultPoint point) {
        return new CentralTransactionRunner() {
            @Override
            public <T> T required(Supplier<T> work) {
                return delegate.required(() -> {
                    work.get();
                    throw new NamedCrash(point);
                });
            }
        };
    }

    private static void assertNamedCrash(FaultPoint point) {
        assertThatThrownBy(() -> {
                    throw new NamedCrash(point);
                })
                .isInstanceOf(NamedCrash.class)
                .extracting("point")
                .isEqualTo(point);
    }

    private static void assertDatabaseDoesNotContain(
            DataSource dataSource,
            String plaintext) {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        List<String> tables = List.of(
                "enterprise_verified_identity",
                "enterprise_user_permission",
                "enterprise_device",
                "device_enrollment_grant",
                "device_challenge",
                "access_token_issuance",
                "enterprise_configuration_snapshot",
                "enterprise_package_document");
        for (String table : tables) {
            Integer matches = jdbc.queryForObject(
                    "SELECT count(*) FROM " + table
                            + " persisted WHERE CAST(persisted AS text) LIKE ?",
                    Integer.class,
                    "%" + plaintext + "%");
            assertThat(matches)
                    .as("plaintext must not persist in %s", table)
                    .isZero();
        }
    }

    private static int rowCount(DataSource dataSource, String table) {
        return new JdbcTemplate(dataSource).queryForObject(
                "SELECT count(*) FROM " + table,
                Integer.class);
    }

    private static void assertError(Runnable work, String code) {
        assertThatThrownBy(work::run)
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo(code);
    }

    private enum FaultPoint {
        AFTER_IDENTITY_COMMIT,
        AFTER_ENROLLMENT_CHALLENGE_COMMIT,
        AFTER_DEVICE_ENROLLMENT_COMMIT,
        AFTER_TOKEN_CHALLENGE_COMMIT,
        BEFORE_TOKEN_COMMIT,
        AFTER_TOKEN_COMMIT_BEFORE_RESPONSE,
        AFTER_CONFIGURATION_SEED_COMMIT
    }

    private static final class NamedCrash extends RuntimeException {

        private final FaultPoint point;

        private NamedCrash(FaultPoint point) {
            super("simulated crash at " + point);
            this.point = point;
        }

        FaultPoint point() {
            return point;
        }
    }

    private record SharedRuntime(
            FakeClock clock,
            FakeDeviceSigner signer,
            AuthenticationEntropySource entropy,
            FakeOAIdentityAdapter oa,
            FrozenCompatibilityEvaluator compatibility) {}

    private record Runtime(
            CentralPersistenceConformance.PersistenceHarness persistence,
            VerifyEnterpriseIdentityService identityVerifier,
            IssueDeviceChallengeService challengeService,
            ManualDeviceEnrollmentService enrollmentService,
            RoboThreeAccessTokenService tokenService,
            TrustedConfigurationSeeder configurationSeeder,
            ConfigurationReadService configurationRead) {}
}
