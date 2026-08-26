package com.robothree.central.authentication.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceEnrollmentGrant;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.DevicePublicKey;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.OAIdentityAdapter;
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import com.robothree.central.support.DeterministicAuthenticationEntropy;
import com.robothree.central.support.FakeClock;
import com.robothree.central.support.FakeDeviceSigner;
import com.robothree.central.support.FakeOAIdentityAdapter;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;

class EnterpriseIdentityApplicationTest {

    private static final Instant NOW = Instant.parse("2026-07-25T08:00:00Z");
    private static final String CODE = "alpha-enrollment-code-0001";

    @Test
    void verifiesFakeOaWithoutPersistingRawMaterial() {
        Harness harness = harness(true);

        VerifiedEnterpriseIdentity identity = harness.identityService().verify(
                new FakeOAIdentityAdapter.FakeOAIdentityMaterial("oa-flow-secret"));

        assertThat(identity.enterpriseId()).isEqualTo("enterprise.alpha");
        assertThat(identity.userId()).isEqualTo("user.alpha");
        assertThat(identity.expiresAt()).isEqualTo(NOW.plusSeconds(300));
        assertThat(identity.toString()).doesNotContain("oa-flow-secret");
        assertThat(harness.persistence().findVerifiedIdentityById(identity.verifiedIdentityId()))
                .contains(identity);
    }

    @Test
    void enrollsWithEs256AndReturnsStableResultForSameDigestRetry() {
        Harness harness = harness(true);
        EnrollmentFixture fixture = enrollmentFixture(harness);

        var first = harness.enrollmentService().enroll(fixture.command());
        var retry = harness.enrollmentService().enroll(fixture.command());

        assertThat(retry).isEqualTo(first);
        assertThat(harness.persistence().findById(first.deviceId()))
                .get()
                .extracting(EnterpriseDevice::trustSource)
                .isEqualTo("manual_device_enrollment");
    }

    @Test
    void rejectsDifferentDigestReplayAndInvalidSignature() {
        Harness harness = harness(true);
        EnrollmentFixture fixture = enrollmentFixture(harness);
        harness.enrollmentService().enroll(fixture.command());

        DeviceProof differentValidProof = new DeviceProof(
                fixture.command().deviceProof().challengeId(),
                fixture.command().deviceProof().deviceKeyId(),
                "ES256",
                Base64.getUrlEncoder().withoutPadding().encodeToString(
                        fixture.signer().sign(
                                AuthenticationCrypto.signingBytes(fixture.challenge()))),
                NOW);
        var replay = new ManualDeviceEnrollmentService.EnrollDeviceCommand(
                fixture.command().verifiedIdentityId(),
                fixture.command().deviceEnrollmentCode(),
                fixture.command().clientInstanceId(),
                fixture.command().devicePublicKey(),
                differentValidProof);

        assertThatThrownBy(() -> harness.enrollmentService().enroll(replay))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("device_challenge_replayed");

        Harness invalid = harness(true);
        EnrollmentFixture invalidFixture = enrollmentFixture(invalid);
        DeviceProof invalidProof = new DeviceProof(
                invalidFixture.command().deviceProof().challengeId(),
                invalidFixture.command().deviceProof().deviceKeyId(),
                "ES256",
                Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[72]),
                NOW);
        var invalidCommand = new ManualDeviceEnrollmentService.EnrollDeviceCommand(
                invalidFixture.command().verifiedIdentityId(),
                invalidFixture.command().deviceEnrollmentCode(),
                invalidFixture.command().clientInstanceId(),
                invalidFixture.command().devicePublicKey(),
                invalidProof);
        assertThatThrownBy(() -> invalid.enrollmentService().enroll(invalidCommand))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("device_proof_invalid");
    }

    @Test
    void treatsExpiryBoundaryAsExpiredAndRejectsContextDrift() {
        Harness harness = harness(true);
        EnrollmentFixture fixture = enrollmentFixture(harness);
        harness.clock().advanceSeconds(60);

        assertThatThrownBy(() -> harness.enrollmentService().enroll(fixture.command()))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("device_challenge_expired");

        Harness fresh = harness(true);
        EnrollmentFixture freshFixture = enrollmentFixture(fresh);
        var drifted = new ManualDeviceEnrollmentService.EnrollDeviceCommand(
                freshFixture.command().verifiedIdentityId(),
                freshFixture.command().deviceEnrollmentCode(),
                "00000000-0000-4000-8000-000000009999",
                freshFixture.command().devicePublicKey(),
                freshFixture.command().deviceProof());
        assertThatThrownBy(() -> fresh.enrollmentService().enroll(drifted))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("device_context_mismatch");
    }

    @Test
    void deviceTrustFailsClosedForManagedComplianceAndRevocation() {
        DefaultEnterpriseDeviceTrustProvider trust = new DefaultEnterpriseDeviceTrustProvider();
        assertTrustError(trust, device("unmanaged", "compliant", null), "device_not_managed");
        assertTrustError(trust, device("managed", "non_compliant", null), "device_not_compliant");
        assertTrustError(trust, device("managed", "compliant", NOW), "device_access_denied");
        assertThat(trust.requireTrusted(device("managed", "compliant", null), NOW).trusted())
                .isTrue();
    }

    @Test
    void deviceKeyIdAloneCannotEstablishTrustForTokenChallenge() {
        Harness harness = harness(true);
        VerifiedEnterpriseIdentity identity = harness.identityService().verify(
                new FakeOAIdentityAdapter.FakeOAIdentityMaterial("oa-flow-secret"));
        harness.persistence().insert(device("unmanaged", "compliant", null));

        assertThatThrownBy(() -> harness.challengeService().issue(
                        new IssueDeviceChallengeService.IssueDeviceChallengeCommand(
                                IssueDeviceChallengeService.TOKEN_ISSUANCE,
                                identity.verifiedIdentityId(),
                                "00000000-0000-4000-8000-000000000333",
                                "key.alpha",
                                null,
                                null)))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("device_not_managed");
    }

    @Test
    void oneOfOneHundredDifferentConsumersWinsTheChallenge() throws Exception {
        Harness harness = harness(true);
        EnrollmentFixture fixture = enrollmentFixture(harness);
        DeviceChallenge challenge = fixture.challenge();
        try (var executor = Executors.newFixedThreadPool(16)) {
            List<Callable<Boolean>> work = new ArrayList<>();
            for (int index = 0; index < 100; index++) {
                String digest = "%064x".formatted(index + 1);
                work.add(() -> harness.persistence()
                        .consume(challenge.challengeId(), NOW, "consumer-" + digest, digest)
                        .consumedRequestDigest()
                        .equals(digest));
            }
            List<Future<Boolean>> results = executor.invokeAll(work);
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
    void manualEnrollmentFeatureAndGrantAreFailClosed() {
        Harness disabled = harness(false);
        VerifiedEnterpriseIdentity identity = disabled.identityService().verify(
                new FakeOAIdentityAdapter.FakeOAIdentityMaterial("oa-flow-secret"));
        assertThatThrownBy(() -> disabled.challengeService().issue(
                        new IssueDeviceChallengeService.IssueDeviceChallengeCommand(
                                IssueDeviceChallengeService.DEVICE_ENROLLMENT,
                                identity.verifiedIdentityId(),
                                "00000000-0000-4000-8000-000000000111",
                                null,
                                CODE,
                                "a".repeat(64))))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("manual_device_enrollment_unavailable");
    }

    @Test
    void rechecksIdentityInsideEnrollmentTransactionWithoutConsumingGrant() {
        Harness harness = harness(true);
        EnrollmentFixture fixture = enrollmentFixture(harness);
        harness.persistence().disable(fixture.command().verifiedIdentityId(), NOW);

        assertThatThrownBy(() -> harness.enrollmentService().enroll(fixture.command()))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("enterprise_identity_invalid");
        assertThat(harness.persistence()
                        .findEnrollmentGrantByCodeDigest(AuthenticationCrypto.sha256(CODE)))
                .get()
                .extracting(DeviceEnrollmentGrant::consumedAt)
                .isNull();
        assertThat(harness.persistence()
                        .findChallengeById(fixture.challenge().challengeId()))
                .get()
                .extracting(DeviceChallenge::consumedAt)
                .isNull();
    }

    private static EnrollmentFixture enrollmentFixture(Harness harness) {
        VerifiedEnterpriseIdentity identity = harness.identityService().verify(
                new FakeOAIdentityAdapter.FakeOAIdentityMaterial("oa-flow-secret"));
        harness.persistence().insert(new DeviceEnrollmentGrant(
                java.util.UUID.fromString("00000000-0000-4000-8000-000000000222"),
                AuthenticationCrypto.sha256(CODE),
                identity.enterpriseId(),
                identity.userId(),
                NOW,
                NOW.plusSeconds(600),
                null,
                null));
        FakeDeviceSigner signer = new FakeDeviceSigner();
        String encodedKey = signer.getPublicKey();
        String keyDigest = AuthenticationCrypto.sha256(Base64.getDecoder().decode(encodedKey));
        DeviceChallenge challenge = harness.challengeService().issue(
                new IssueDeviceChallengeService.IssueDeviceChallengeCommand(
                        IssueDeviceChallengeService.DEVICE_ENROLLMENT,
                        identity.verifiedIdentityId(),
                        "00000000-0000-4000-8000-000000000111",
                        null,
                        CODE,
                        keyDigest));
        DevicePublicKey publicKey =
                new DevicePublicKey(signer.getDeviceKeyId(), "ES256", "spki_der_base64", encodedKey);
        DeviceProof proof = new DeviceProof(
                challenge.challengeId(),
                signer.getDeviceKeyId(),
                "ES256",
                Base64.getUrlEncoder().withoutPadding().encodeToString(
                        signer.sign(AuthenticationCrypto.signingBytes(challenge))),
                NOW);
        return new EnrollmentFixture(
                challenge,
                signer,
                new ManualDeviceEnrollmentService.EnrollDeviceCommand(
                        identity.verifiedIdentityId(),
                        CODE,
                        challenge.clientInstanceId(),
                        publicKey,
                        proof));
    }

    private static Harness harness(boolean manualEnrollmentEnabled) {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        FakeClock clock = new FakeClock(NOW, ZoneOffset.UTC);
        AuthenticationSecurityPolicy defaults = AuthenticationSecurityPolicy.alphaDefaults();
        AuthenticationSecurityPolicy policy = new AuthenticationSecurityPolicy(
                defaults.verifiedIdentityTtl(),
                defaults.challengeTtl(),
                defaults.enrollmentGrantTtl(),
                defaults.allowedClockSkew(),
                defaults.audience(),
                manualEnrollmentEnabled);
        DeterministicAuthenticationEntropy entropy = new DeterministicAuthenticationEntropy();
        OAIdentityAdapter adapter = new FakeOAIdentityAdapter(Map.of(
                "oa-flow-secret",
                new OAIdentityAdapter.VerifiedIdentityClaims(
                        "enterprise.alpha",
                        "user.alpha",
                        "fake-oa",
                        "a".repeat(64))));
        VerifyEnterpriseIdentityService identityService = new VerifyEnterpriseIdentityService(
                adapter,
                persistence,
                entropy,
                clock,
                policy);
        IssueDeviceChallengeService challengeService = new IssueDeviceChallengeService(
                persistence,
                persistence,
                persistence,
                persistence,
                new DefaultEnterpriseDeviceTrustProvider(),
                entropy,
                clock,
                policy);
        ManualDeviceEnrollmentService enrollmentService = new ManualDeviceEnrollmentService(
                persistence,
                persistence,
                persistence,
                persistence,
                new com.robothree.central.authentication.adapter.security.Es256DeviceProofVerifier(),
                persistence,
                entropy,
                clock,
                policy);
        return new Harness(
                persistence,
                clock,
                identityService,
                challengeService,
                enrollmentService);
    }

    private static EnterpriseDevice device(
            String managed,
            String compliance,
            Instant revokedAt) {
        return new EnterpriseDevice(
                "device.alpha",
                "enterprise.alpha",
                "key.alpha",
                "spki_der_base64",
                "encoded",
                "b".repeat(64),
                "ES256",
                "manual_device_enrollment",
                managed,
                compliance,
                0,
                NOW,
                revokedAt,
                null);
    }

    private static void assertTrustError(
            DefaultEnterpriseDeviceTrustProvider trust,
            EnterpriseDevice device,
            String code) {
        assertThatThrownBy(() -> trust.requireTrusted(device, NOW))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo(code);
    }

    private record EnrollmentFixture(
            DeviceChallenge challenge,
            FakeDeviceSigner signer,
            ManualDeviceEnrollmentService.EnrollDeviceCommand command) {}

    private record Harness(
            InMemoryCentralPersistence persistence,
            FakeClock clock,
            VerifyEnterpriseIdentityService identityService,
            IssueDeviceChallengeService challengeService,
            ManualDeviceEnrollmentService enrollmentService) {}
}
