package com.robothree.central.authentication.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.adapter.security.Es256DeviceProofVerifier;
import com.robothree.central.authentication.domain.AccessTokenClaims;
import com.robothree.central.authentication.domain.AccessTokenIssuance;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.EnterpriseCompatibility;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.CompatibilityEvaluator;
import com.robothree.central.configuration.application.ConfigurationIntegrityVerifier;
import com.robothree.central.configuration.application.ConfigurationReadService;
import com.robothree.central.configuration.application.TrustedConfigurationSeeder;
import com.robothree.central.configuration.domain.ImmutableConfigurationSnapshot;
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import com.robothree.central.support.CanonicalConfigurationFixtures;
import com.robothree.central.support.DeterministicAuthenticationEntropy;
import com.robothree.central.support.FakeClock;
import com.robothree.central.support.FakeDeviceSigner;
import com.robothree.central.support.FakeEnterpriseSecretStore;
import com.robothree.central.support.FakeJwsTokenCodec;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

class AccessTokenAndConfigurationApplicationTest {

    private static final Instant NOW = Instant.parse("2026-07-25T09:00:00Z");
    private static final UUID IDENTITY_ID =
            UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final String CLIENT_INSTANCE_ID =
            "20000000-0000-4000-8000-000000000002";

    @Test
    void issuesFourFactorTokenWithExactSubjectBindingAndNoPlaintextPersistence() {
        Harness harness = harness(true, true);
        TokenFixture fixture = issue(harness);

        AccessTokenClaims claims = harness.validator().validate(fixture.result().accessToken());
        assertThat(claims.enterpriseId()).isEqualTo("enterprise.alpha");
        assertThat(claims.userId()).isEqualTo("user.alpha");
        assertThat(claims.deviceId()).isEqualTo("device.alpha");
        assertThat(claims.clientInstanceId()).isEqualTo(CLIENT_INSTANCE_ID);
        assertThat(claims.permissions())
                .containsExactly("configuration.read", "model.use");
        assertThat(harness.persistence().findTokenIssuanceById(claims.tokenId()))
                .get()
                .satisfies(issuance -> {
                    assertThat(issuance.tokenDigest())
                            .isEqualTo(AuthenticationCrypto.sha256(fixture.result().accessToken()));
                    assertThat(issuance.toString()).doesNotContain(fixture.result().accessToken());
                });
    }

    @Test
    void rejectsMissingPermissionAndCompatibilityWithoutConsumingChallenge() {
        Harness missingPermission = harness(false, true);
        TokenFixture permissionFixture = tokenFixture(missingPermission);
        assertError(
                () -> missingPermission.tokenService().issue(permissionFixture.command()),
                "permission_denied");
        assertPending(missingPermission, permissionFixture.challenge());

        Harness incompatible = harness(true, false);
        TokenFixture compatibilityFixture = tokenFixture(incompatible);
        assertError(
                () -> incompatible.tokenService().issue(compatibilityFixture.command()),
                "compatibility_mismatch");
        assertPending(incompatible, compatibilityFixture.challenge());
    }

    @Test
    void rechecksIdentityAndCompatibilityInsideTheIssuanceTransaction() {
        Harness disabledIdentity = harness(true, true);
        TokenFixture identityFixture = tokenFixture(disabledIdentity);
        disabledIdentity.persistence().disable(IDENTITY_ID, NOW);
        assertError(
                () -> disabledIdentity.tokenService().issue(identityFixture.command()),
                "enterprise_identity_invalid");
        assertPending(disabledIdentity, identityFixture.challenge());

        Harness base = harness(true, true);
        TokenFixture driftFixture = tokenFixture(base);
        CompatibilityEvaluator drifting = new CompatibilityEvaluator() {
            private long call;

            @Override
            public CompatibilityDecision requireCompatible(String ignored) {
                return new CompatibilityDecision(call++);
            }

            @Override
            public EnterpriseCompatibility current() {
                return compatibility(0);
            }
        };
        RoboThreeAccessTokenService driftingService = tokenService(base, drifting);
        assertError(
                () -> driftingService.issue(driftFixture.command()),
                "compatibility_mismatch");
        assertPending(base, driftFixture.challenge());
    }

    @Test
    void rejectsUntrustedDeviceEvenWhenKeyProofIsValid() {
        Harness harness = harness(true, true);
        EnterpriseDevice trusted = harness.persistence()
                .findById("device.alpha")
                .orElseThrow();
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        persistence.insert(harness.persistence()
                .findVerifiedIdentityById(IDENTITY_ID)
                .orElseThrow());
        EnterpriseDevice unmanaged = new EnterpriseDevice(
                trusted.deviceId(),
                trusted.enterpriseId(),
                trusted.deviceKeyId(),
                trusted.publicKeyFormat(),
                trusted.publicKeyEncoded(),
                trusted.publicKeyDigest(),
                trusted.algorithm(),
                trusted.trustSource(),
                "unmanaged",
                "compliant",
                trusted.revision(),
                trusted.registeredAt(),
                null,
                null);
        persistence.insert(unmanaged);
        persistence.save(permission("configuration.read", 1));
        DeviceChallenge challenge = manualChallenge(harness, persistence, unmanaged);
        DeviceProof proof = signedProof(harness.signer(), challenge);
        Harness untrusted = harness.withPersistence(persistence);
        assertError(
                () -> untrusted.tokenService().issue(
                        new RoboThreeAccessTokenService.IssueAccessTokenCommand(
                                IDENTITY_ID,
                                CLIENT_INSTANCE_ID,
                                proof)),
                "device_not_managed");
        assertPending(untrusted, challenge);
    }

    @Test
    void tokenResponseLossRequiresANewChallenge() {
        Harness harness = harness(true, true);
        TokenFixture fixture = issue(harness);

        assertError(
                () -> harness.tokenService().issue(fixture.command()),
                "device_challenge_replayed");
        assertThat(fixture.result().accessToken()).isNotBlank();
    }

    @Test
    void tokenCommitFailureRollsBackChallengeConsumption() {
        Harness harness = harness(true, true);
        TokenFixture fixture = tokenFixture(harness);
        UUID predictedTokenId =
                new UUID(0x0000000000004000L, 0x8000000000000003L);
        harness.persistence().insert(new AccessTokenIssuance(
                predictedTokenId,
                "d".repeat(64),
                "enterprise.alpha",
                "user.alpha",
                "device.alpha",
                CLIENT_INSTANCE_ID,
                List.of("configuration.read", "model.use"),
                "b".repeat(64),
                3,
                5,
                NOW,
                NOW.plusSeconds(900),
                fixture.challenge().challengeId()));

        assertThatThrownBy(() -> harness.tokenService().issue(fixture.command()))
                .isInstanceOf(RuntimeException.class);
        assertPending(harness, fixture.challenge());
    }

    @Test
    void concurrentIssuanceHasExactlyOneWinner() throws Exception {
        Harness harness = harness(true, true);
        TokenFixture fixture = tokenFixture(harness);
        try (var executor = Executors.newFixedThreadPool(8)) {
            List<Callable<Boolean>> attempts = java.util.stream.IntStream.range(0, 20)
                    .mapToObj(ignored -> (Callable<Boolean>) () -> {
                        try {
                            harness.tokenService().issue(fixture.command());
                            return true;
                        } catch (EnterpriseAuthenticationException exception) {
                            assertThat(exception.code()).isEqualTo("device_challenge_replayed");
                            return false;
                        }
                    })
                    .toList();
            var results = executor.invokeAll(attempts);
            assertThat(results.stream().filter(result -> {
                try {
                    return result.get();
                } catch (Exception exception) {
                    throw new AssertionError(exception);
                }
            })).hasSize(1);
        }
    }

    @Test
    void validatorRejectsTamperingWrongIssuerAudienceAndExpiry() {
        Harness harness = harness(true, true);
        TokenFixture fixture = issue(harness);
        String token = fixture.result().accessToken();
        char last = token.charAt(token.length() - 1);
        String tampered = token.substring(0, token.length() - 1)
                + (last == 'A' ? 'B' : 'A');
        assertError(() -> harness.validator().validate(tampered), "access_token_invalid");

        AccessTokenClaims original = harness.validator().validate(token);
        var codec = new FakeJwsTokenCodec();
        var keys = new FakeEnterpriseSecretStore();
        AccessTokenClaims wrongIssuer = new AccessTokenClaims(
                "v1alpha1",
                "wrong.issuer",
                original.audience(),
                original.enterpriseId(),
                original.userId(),
                original.deviceId(),
                original.clientInstanceId(),
                original.tokenId(),
                original.issuedAt(),
                original.expiresAt(),
                original.permissions());
        AccessTokenClaims wrongAudience = new AccessTokenClaims(
                "v1alpha1",
                original.issuer(),
                "wrong.audience",
                original.enterpriseId(),
                original.userId(),
                original.deviceId(),
                original.clientInstanceId(),
                original.tokenId(),
                original.issuedAt(),
                original.expiresAt(),
                original.permissions());
        assertError(
                () -> harness.validator().validate(
                        codec.encode(wrongIssuer, keys.resolveTokenSigningKeyHandle())),
                "access_token_invalid");
        assertError(
                () -> harness.validator().validate(
                        codec.encode(wrongAudience, keys.resolveTokenSigningKeyHandle())),
                "access_token_invalid");

        harness.clock().advanceSeconds(900);
        assertError(() -> harness.validator().validate(token), "access_token_expired");
    }

    @Test
    void servesExactSnapshotWithStableEtagAndBodylessNotModified() {
        Harness harness = harness(true, true);
        TokenFixture fixture = issue(harness);
        seedConfiguration(harness);

        var first = harness.configurationRead().read(fixture.result().accessToken(), null);
        var cached = harness.configurationRead()
                .read(fixture.result().accessToken(), first.etag());
        assertThat(first.notModified()).isFalse();
        assertThat(first.documentJson()).isEqualTo(
                CanonicalConfigurationFixtures.validSeed(NOW).snapshot().documentJson());
        assertThat(first.etag()).startsWith("\"").endsWith("\"");
        assertThat(cached.notModified()).isTrue();
        assertThat(cached.documentJson()).isNull();
        assertThat(cached.etag()).isEqualTo(first.etag());
    }

    @Test
    void configurationRequiresValidTokenAndFailsClosedOnStoredDigestDrift() {
        Harness harness = harness(true, true);
        assertError(
                () -> harness.configurationRead().read("not-a-token", null),
                "access_token_invalid");

        TokenFixture fixture = issue(harness);
        var valid = CanonicalConfigurationFixtures.validSeed(NOW);
        ImmutableConfigurationSnapshot corrupt = new ImmutableConfigurationSnapshot(
                valid.snapshot().snapshotId(),
                valid.snapshot().revision(),
                "f".repeat(64),
                valid.snapshot().schemaVersion(),
                valid.snapshot().documentJson(),
                ConfigurationIntegrityVerifier.quotedEtag("f".repeat(64)),
                true,
                valid.snapshot().generatedAt(),
                valid.snapshot().insertedAt());
        valid.packages().forEach(harness.persistence()::insert);
        harness.persistence().insert(corrupt);

        assertError(
                () -> harness.configurationRead().read(fixture.result().accessToken(), null),
                "configuration_integrity_failed");
    }

    @Test
    void trustedSeedRejectsMissingPackageReferenceAndRollsBack() {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        ConfigurationIntegrityVerifier verifier =
                new ConfigurationIntegrityVerifier(persistence);
        TrustedConfigurationSeeder seeder = new TrustedConfigurationSeeder(
                persistence,
                persistence,
                persistence,
                verifier);
        var seed = CanonicalConfigurationFixtures.validSeed(NOW);

        assertError(
                () -> seeder.seed(List.of(), seed.snapshot()),
                "configuration_integrity_failed");
        assertThat(persistence.findActive()).isEmpty();
        assertThat(persistence.findPackage(
                        seed.packages().getFirst().packageId(),
                        seed.packages().getFirst().revision()))
                .isEmpty();
    }

    private static Harness harness(boolean grantPermission, boolean compatible) {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        FakeClock clock = new FakeClock(NOW, ZoneOffset.UTC);
        DeterministicAuthenticationEntropy entropy = new DeterministicAuthenticationEntropy();
        FakeDeviceSigner signer = new FakeDeviceSigner();
        VerifiedEnterpriseIdentity identity = persistence.insert(new VerifiedEnterpriseIdentity(
                IDENTITY_ID,
                "enterprise.alpha",
                "user.alpha",
                "fake-oa",
                "a".repeat(64),
                "b".repeat(64),
                NOW,
                NOW.plusSeconds(300),
                null));
        String encodedKey = signer.getPublicKey();
        EnterpriseDevice device = persistence.insert(new EnterpriseDevice(
                "device.alpha",
                identity.enterpriseId(),
                signer.getDeviceKeyId(),
                "spki_der_base64",
                encodedKey,
                AuthenticationCrypto.sha256(Base64.getDecoder().decode(encodedKey)),
                "ES256",
                "manual_device_enrollment",
                "managed",
                "compliant",
                3,
                NOW,
                null,
                null));
        if (grantPermission) {
            persistence.save(permission("configuration.read", 4));
            persistence.save(permission("model.use", 5));
        }
        EnterpriseCompatibility compatibilitySnapshot = compatibility(7);
        CompatibilityEvaluator evaluator = new FrozenCompatibilityEvaluator(
                compatibilitySnapshot,
                compatible ? Set.of(CLIENT_INSTANCE_ID) : Set.of());
        var challengeService = new IssueDeviceChallengeService(
                persistence,
                persistence,
                persistence,
                persistence,
                new DefaultEnterpriseDeviceTrustProvider(),
                entropy,
                clock,
                AuthenticationSecurityPolicy.alphaDefaults());
        ConfigurationIntegrityVerifier integrity =
                new ConfigurationIntegrityVerifier(persistence);
        Harness harness = new Harness(
                persistence,
                clock,
                entropy,
                signer,
                device,
                challengeService,
                evaluator,
                null,
                null,
                integrity);
        var tokenService = tokenService(harness, evaluator);
        var validator = new RoboThreeAccessTokenValidator(
                new FakeJwsTokenCodec(),
                new FakeEnterpriseSecretStore(),
                persistence,
                clock,
                AccessTokenSecurityPolicy.alphaDefaults());
        return new Harness(
                persistence,
                clock,
                entropy,
                signer,
                device,
                challengeService,
                evaluator,
                tokenService,
                validator,
                integrity);
    }

    private static RoboThreeAccessTokenService tokenService(
            Harness harness,
            CompatibilityEvaluator compatibility) {
        return new RoboThreeAccessTokenService(
                harness.persistence(),
                harness.persistence(),
                harness.persistence(),
                harness.persistence(),
                harness.persistence(),
                new DefaultEnterpriseDeviceTrustProvider(),
                new Es256DeviceProofVerifier(),
                compatibility,
                new FakeJwsTokenCodec(),
                new FakeEnterpriseSecretStore(),
                harness.persistence(),
                harness.entropy(),
                harness.clock(),
                AccessTokenSecurityPolicy.alphaDefaults());
    }

    private static TokenFixture issue(Harness harness) {
        TokenFixture fixture = tokenFixture(harness);
        return new TokenFixture(
                fixture.challenge(),
                fixture.command(),
                harness.tokenService().issue(fixture.command()));
    }

    private static TokenFixture tokenFixture(Harness harness) {
        DeviceChallenge challenge = harness.challengeService().issue(
                new IssueDeviceChallengeService.IssueDeviceChallengeCommand(
                        IssueDeviceChallengeService.TOKEN_ISSUANCE,
                        IDENTITY_ID,
                        CLIENT_INSTANCE_ID,
                        harness.signer().getDeviceKeyId(),
                        null,
                        null));
        DeviceProof proof = signedProof(harness.signer(), challenge);
        return new TokenFixture(
                challenge,
                new RoboThreeAccessTokenService.IssueAccessTokenCommand(
                        IDENTITY_ID,
                        CLIENT_INSTANCE_ID,
                        proof),
                null);
    }

    private static DeviceProof signedProof(
            FakeDeviceSigner signer,
            DeviceChallenge challenge) {
        return new DeviceProof(
                challenge.challengeId(),
                signer.getDeviceKeyId(),
                "ES256",
                Base64.getUrlEncoder().withoutPadding().encodeToString(
                        signer.sign(AuthenticationCrypto.signingBytes(challenge))),
                NOW);
    }

    private static DeviceChallenge manualChallenge(
            Harness harness,
            InMemoryCentralPersistence persistence,
            EnterpriseDevice device) {
        DeviceChallenge challenge = new DeviceChallenge(
                UUID.fromString("30000000-0000-4000-8000-000000000003"),
                IssueDeviceChallengeService.TOKEN_ISSUANCE,
                IDENTITY_ID,
                CLIENT_INSTANCE_ID,
                device.deviceKeyId(),
                device.publicKeyDigest(),
                "nonce-for-untrusted-device",
                "robothree.central",
                List.of("ES256"),
                "c".repeat(64),
                NOW,
                NOW.plusSeconds(60),
                null,
                null,
                null);
        return persistence.insert(challenge);
    }

    private static EnterpriseUserPermission permission(String name, long revision) {
        return new EnterpriseUserPermission(
                "enterprise.alpha",
                "user.alpha",
                name,
                true,
                revision,
                NOW);
    }

    private static EnterpriseCompatibility compatibility(long revision) {
        return new EnterpriseCompatibility(
                "v1alpha1",
                "0.0.0-cgf.1.1c",
                List.of("v1alpha1"),
                "0.0.0-dcf.1.0",
                "0.0.0-dcf.1.0",
                List.of(
                        "configuration_snapshot",
                        "fixed_permissions",
                        "enterprise_identity",
                        "managed_device_trust"),
                "available",
                List.of("v1alpha1"),
                revision);
    }

    private static void seedConfiguration(Harness harness) {
        var seed = CanonicalConfigurationFixtures.validSeed(NOW);
        new TrustedConfigurationSeeder(
                        harness.persistence(),
                        harness.persistence(),
                        harness.persistence(),
                        harness.integrity())
                .seed(seed.packages(), seed.snapshot());
    }

    private static void assertPending(Harness harness, DeviceChallenge challenge) {
        assertThat(harness.persistence().findChallengeById(challenge.challengeId()))
                .get()
                .extracting(DeviceChallenge::consumedAt)
                .isNull();
    }

    private static void assertError(Runnable work, String code) {
        assertThatThrownBy(work::run)
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo(code);
    }

    private record TokenFixture(
            DeviceChallenge challenge,
            RoboThreeAccessTokenService.IssueAccessTokenCommand command,
            RoboThreeAccessTokenService.IssueAccessTokenResult result) {}

    private record Harness(
            InMemoryCentralPersistence persistence,
            FakeClock clock,
            DeterministicAuthenticationEntropy entropy,
            FakeDeviceSigner signer,
            EnterpriseDevice device,
            IssueDeviceChallengeService challengeService,
            CompatibilityEvaluator compatibility,
            RoboThreeAccessTokenService tokenService,
            RoboThreeAccessTokenValidator validator,
            ConfigurationIntegrityVerifier integrity) {

        private ConfigurationReadService configurationRead() {
            return new ConfigurationReadService(
                    new LegacyBearerAuthorizerAdapter(validator),
                    persistence,
                    integrity,
                    clock);
        }

        private Harness withPersistence(InMemoryCentralPersistence replacement) {
            ConfigurationIntegrityVerifier replacementIntegrity =
                    new ConfigurationIntegrityVerifier(replacement);
            Harness base = new Harness(
                    replacement,
                    clock,
                    entropy,
                    signer,
                    device,
                    challengeService,
                    compatibility,
                    null,
                    null,
                    replacementIntegrity);
            RoboThreeAccessTokenService replacementService =
                    AccessTokenAndConfigurationApplicationTest.tokenService(
                            base,
                            compatibility);
            RoboThreeAccessTokenValidator replacementValidator =
                    new RoboThreeAccessTokenValidator(
                            new FakeJwsTokenCodec(),
                            new FakeEnterpriseSecretStore(),
                            replacement,
                            clock,
                            AccessTokenSecurityPolicy.alphaDefaults());
            return new Harness(
                    replacement,
                    clock,
                    entropy,
                    signer,
                    device,
                    challengeService,
                    compatibility,
                    replacementService,
                    replacementValidator,
                    replacementIntegrity);
        }
    }
}
