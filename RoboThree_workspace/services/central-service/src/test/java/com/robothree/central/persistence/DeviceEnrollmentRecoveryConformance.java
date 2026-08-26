package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.adapter.security.Es256DeviceProofVerifier;
import com.robothree.central.authentication.application.AuthenticationCrypto;
import com.robothree.central.authentication.application.AuthenticationSecurityPolicy;
import com.robothree.central.authentication.application.DefaultEnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import com.robothree.central.authentication.application.IssueDeviceChallengeService;
import com.robothree.central.authentication.application.ManualDeviceEnrollmentService;
import com.robothree.central.authentication.application.VerifyEnterpriseIdentityService;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceEnrollmentGrant;
import com.robothree.central.authentication.domain.DeviceProof;
import com.robothree.central.authentication.domain.DevicePublicKey;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.support.DeterministicAuthenticationEntropy;
import com.robothree.central.support.FakeClock;
import com.robothree.central.support.FakeDeviceSigner;
import com.robothree.central.support.FakeOAIdentityAdapter;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;

final class DeviceEnrollmentRecoveryConformance {

    private static final Instant NOW = Instant.parse("2026-07-25T09:00:00Z");
    private static final String CODE = "restart-enrollment-code-0001";

    private DeviceEnrollmentRecoveryConformance() {}

    static void verify(
            DataSource dataSource,
            CentralPersistenceVariants.Variant variant) {
        AuthenticationSecurityPolicy policy = AuthenticationSecurityPolicy.alphaDefaults();
        FakeClock clock = new FakeClock(NOW, ZoneOffset.UTC);
        DeterministicAuthenticationEntropy entropy = new DeterministicAuthenticationEntropy();
        CentralPersistenceConformance.PersistenceHarness first = variant.open(dataSource);
        String rawOaMaterial = "raw-oa-flow-material-must-not-persist";
        new VerifyEnterpriseIdentityService(
                        new FakeOAIdentityAdapter(Map.of(
                                rawOaMaterial,
                                new com.robothree.central.authentication.port.OAIdentityAdapter
                                        .VerifiedIdentityClaims(
                                        "enterprise.scan",
                                        "user.scan",
                                        "fake-oa",
                                        "f".repeat(64)))),
                        first.identities(),
                        entropy,
                        clock,
                        policy)
                .verify(new FakeOAIdentityAdapter.FakeOAIdentityMaterial(rawOaMaterial));
        Integer rawHits = new JdbcTemplate(dataSource).queryForObject(
                """
                SELECT count(*) FROM enterprise_verified_identity
                WHERE concat_ws('|', enterprise_id, user_id, provider,
                    provider_subject_digest, identity_digest) LIKE ?
                """,
                Integer.class,
                "%" + rawOaMaterial + "%");
        assertThat(rawHits).isZero();

        VerifiedEnterpriseIdentity identity = first.identities().insert(
                new VerifiedEnterpriseIdentity(
                UUID.fromString("00000000-0000-4000-8000-000000009101"),
                "enterprise.restart",
                "user.restart",
                "fake-oa",
                "a".repeat(64),
                "b".repeat(64),
                NOW,
                NOW.plusSeconds(300),
                null));
        first.enrollmentGrants().insert(new DeviceEnrollmentGrant(
                UUID.fromString("00000000-0000-4000-8000-000000009102"),
                AuthenticationCrypto.sha256(CODE),
                identity.enterpriseId(),
                identity.userId(),
                NOW,
                NOW.plusSeconds(600),
                null,
                null));
        FakeDeviceSigner signer = new FakeDeviceSigner();
        String encodedKey = signer.getPublicKey();
        String publicKeyDigest =
                AuthenticationCrypto.sha256(Base64.getDecoder().decode(encodedKey));
        DeviceChallenge challenge = challengeService(
                        first,
                        entropy,
                        clock,
                        policy)
                .issue(new IssueDeviceChallengeService.IssueDeviceChallengeCommand(
                        IssueDeviceChallengeService.DEVICE_ENROLLMENT,
                        identity.verifiedIdentityId(),
                        "00000000-0000-4000-8000-000000009103",
                        null,
                        CODE,
                        publicKeyDigest));
        DevicePublicKey publicKey = new DevicePublicKey(
                signer.getDeviceKeyId(),
                "ES256",
                "spki_der_base64",
                encodedKey);
        DeviceProof proof = new DeviceProof(
                challenge.challengeId(),
                signer.getDeviceKeyId(),
                "ES256",
                Base64.getUrlEncoder().withoutPadding().encodeToString(
                        signer.sign(AuthenticationCrypto.signingBytes(challenge))),
                NOW);
        var command = new ManualDeviceEnrollmentService.EnrollDeviceCommand(
                identity.verifiedIdentityId(),
                CODE,
                challenge.clientInstanceId(),
                publicKey,
                proof);

        // Reconstruct every Adapter and Service instance before the first consume.
        CentralPersistenceConformance.PersistenceHarness afterRestart =
                variant.open(dataSource);
        ManualDeviceEnrollmentService concurrentService = enrollmentService(
                afterRestart,
                entropy,
                clock,
                policy);
        var concurrentResults = IntStream.range(0, 20)
                .parallel()
                .mapToObj(ignored -> concurrentService.enroll(command))
                .toList();
        var firstResult = concurrentResults.getFirst();
        assertThat(concurrentResults).allMatch(firstResult::equals);

        // A second reconstruction cannot revive the consumed challenge, but the
        // exact same request returns the original durable result.
        CentralPersistenceConformance.PersistenceHarness secondRestart =
                variant.open(dataSource);
        var retryResult = enrollmentService(
                        secondRestart,
                        entropy,
                        clock,
                        policy)
                .enroll(command);
        assertThat(retryResult).isEqualTo(firstResult);

        DeviceProof differentValidProof = new DeviceProof(
                challenge.challengeId(),
                signer.getDeviceKeyId(),
                "ES256",
                Base64.getUrlEncoder().withoutPadding().encodeToString(
                        signer.sign(AuthenticationCrypto.signingBytes(challenge))),
                NOW);
        var conflictingRetry = new ManualDeviceEnrollmentService.EnrollDeviceCommand(
                identity.verifiedIdentityId(),
                CODE,
                challenge.clientInstanceId(),
                publicKey,
                differentValidProof);
        assertThatThrownBy(() -> enrollmentService(
                        secondRestart,
                        entropy,
                        clock,
                        policy)
                .enroll(conflictingRetry))
                .isInstanceOf(EnterpriseAuthenticationException.class)
                .extracting("code")
                .isEqualTo("device_challenge_replayed");
    }

    private static IssueDeviceChallengeService challengeService(
            CentralPersistenceConformance.PersistenceHarness persistence,
            DeterministicAuthenticationEntropy entropy,
            FakeClock clock,
            AuthenticationSecurityPolicy policy) {
        return new IssueDeviceChallengeService(
                persistence.identities(),
                persistence.devices(),
                persistence.enrollmentGrants(),
                persistence.challenges(),
                new DefaultEnterpriseDeviceTrustProvider(),
                entropy,
                clock,
                policy);
    }

    private static ManualDeviceEnrollmentService enrollmentService(
            CentralPersistenceConformance.PersistenceHarness persistence,
            DeterministicAuthenticationEntropy entropy,
            FakeClock clock,
            AuthenticationSecurityPolicy policy) {
        return new ManualDeviceEnrollmentService(
                persistence.identities(),
                persistence.devices(),
                persistence.enrollmentGrants(),
                persistence.challenges(),
                new Es256DeviceProofVerifier(),
                persistence.transactions(),
                entropy,
                clock,
                policy);
    }
}
