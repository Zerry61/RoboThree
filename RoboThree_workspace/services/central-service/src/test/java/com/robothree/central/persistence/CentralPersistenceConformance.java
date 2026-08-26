package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.domain.AccessTokenIssuance;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.DeviceEnrollmentGrant;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.AccessTokenIssuanceRepository;
import com.robothree.central.authentication.port.DeviceChallengeRepository;
import com.robothree.central.authentication.port.DeviceEnrollmentGrantRepository;
import com.robothree.central.authentication.port.EnterpriseDeviceRepository;
import com.robothree.central.authentication.port.EnterprisePermissionRepository;
import com.robothree.central.authentication.port.VerifiedIdentityRepository;
import com.robothree.central.configuration.domain.ImmutableConfigurationSnapshot;
import com.robothree.central.configuration.domain.ImmutablePackageDocument;
import com.robothree.central.configuration.port.ConfigurationSnapshotRepository;
import com.robothree.central.configuration.port.PackageDocumentRepository;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class CentralPersistenceConformance {

    private static final Instant NOW = Instant.parse("2026-07-25T04:00:00Z");
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final UUID IDENTITY_ID =
            UUID.fromString("00000000-0000-4000-8000-000000000101");
    private static final UUID GRANT_ID =
            UUID.fromString("00000000-0000-4000-8000-000000000102");
    private static final UUID CHALLENGE_ID =
            UUID.fromString("00000000-0000-4000-8000-000000000103");
    private static final UUID TOKEN_ID =
            UUID.fromString("00000000-0000-4000-8000-000000000104");

    private CentralPersistenceConformance() {}

    static void verify(PersistenceHarness persistence) {
        VerifiedEnterpriseIdentity identity = identity();
        assertThat(persistence.identities().insert(identity)).isEqualTo(identity);
        assertThat(persistence.identities().insert(identity)).isEqualTo(identity);
        assertThat(persistence.identities().findVerifiedIdentityById(IDENTITY_ID))
                .contains(identity);
        assertThatThrownBy(() -> persistence.identities().insert(new VerifiedEnterpriseIdentity(
                        IDENTITY_ID,
                        "enterprise.alpha",
                        "user.changed",
                        "fake-oa",
                        A,
                        C,
                        NOW,
                        NOW.plusSeconds(300),
                        null)))
                .isInstanceOf(PersistenceConflictException.class);

        EnterpriseUserPermission permission = new EnterpriseUserPermission(
                "enterprise.alpha",
                "user.alpha",
                "configuration.read",
                true,
                1,
                NOW);
        assertThat(persistence.permissions().save(permission)).isEqualTo(permission);
        assertThat(persistence.permissions().find(
                        "enterprise.alpha",
                        "user.alpha",
                        "configuration.read"))
                .contains(permission);
        assertThatThrownBy(() -> persistence.permissions().save(
                        new EnterpriseUserPermission(
                                "enterprise.alpha",
                                "user.alpha",
                                "configuration.read",
                                false,
                                1,
                                NOW)))
                .isInstanceOf(PersistenceConflictException.class);
        EnterpriseUserPermission disabledPersonalPermission = new EnterpriseUserPermission(
                "enterprise.alpha",
                "user.alpha",
                "personal_model.configure",
                false,
                2,
                NOW.plusSeconds(1));
        persistence.permissions().save(disabledPersonalPermission);
        assertThat(persistence.permissions().findRequestedForUpdate(
                        "enterprise.alpha",
                        "user.alpha",
                        java.util.List.of(
                                "configuration.read", "personal_model.configure")))
                .containsExactly(permission, disabledPersonalPermission);
        assertThat(persistence.permissions().findRequestedForUpdate(
                        "enterprise.alpha",
                        "user.alpha",
                        java.util.List.of("configuration.read", "model.use")))
                .containsExactly(permission);
        assertThatThrownBy(() -> persistence.permissions().findRequestedForUpdate(
                        "enterprise.alpha",
                        "user.alpha",
                        java.util.List.of("model.use", "configuration.read")))
                .isInstanceOf(IllegalArgumentException.class);

        EnterpriseDevice device = device();
        assertThat(persistence.devices().insert(device)).isEqualTo(device);
        assertThat(persistence.devices().insert(device)).isEqualTo(device);
        assertThat(persistence.devices().findById(device.deviceId())).contains(device);
        assertThat(persistence.devices().findByKeyId(
                        device.enterpriseId(),
                        device.deviceKeyId()))
                .contains(device);
        assertThat(persistence.devices().findByPublicKeyDigest(
                        device.enterpriseId(),
                        device.publicKeyDigest()))
                .contains(device);

        DeviceEnrollmentGrant grant = grant();
        assertThat(persistence.enrollmentGrants().insert(grant)).isEqualTo(grant);
        assertThat(persistence.enrollmentGrants().findEnrollmentGrantById(GRANT_ID))
                .contains(grant);
        assertThat(persistence.enrollmentGrants().findEnrollmentGrantByCodeDigest(grant.codeDigest()))
                .contains(grant);

        DeviceChallenge challenge = challenge();
        assertThat(persistence.challenges().insert(challenge)).isEqualTo(challenge);
        assertThat(persistence.challenges().findChallengeById(CHALLENGE_ID))
                .contains(challenge);

        AccessTokenIssuance issuance = issuance();
        assertThat(persistence.tokenIssuances().insert(issuance)).isEqualTo(issuance);
        assertThat(persistence.tokenIssuances().findTokenIssuanceById(TOKEN_ID))
                .contains(issuance);

        DeviceEnrollmentGrant consumedGrant =
                persistence.enrollmentGrants().consume(GRANT_ID, NOW.plusSeconds(1));
        assertThat(consumedGrant.consumedAt()).isEqualTo(NOW.plusSeconds(1));
        DeviceChallenge consumedChallenge = persistence.challenges().consume(
                CHALLENGE_ID,
                NOW.plusSeconds(1),
                device.deviceId(),
                A);
        assertThat(consumedChallenge.consumedRequestDigest()).isEqualTo(A);

        ImmutablePackageDocument document = packageDocument("skill.package-alpha", C, D);
        assertThat(persistence.packages().insert(document)).isEqualTo(document);
        assertThat(persistence.packages().insert(document)).isEqualTo(document);
        assertThat(persistence.packages().findPackage(document.packageId(), document.revision()))
                .contains(document);
        assertThatThrownBy(() -> persistence.packages().insert(
                        packageDocument(document.packageId(), document.revision(), A)))
                .isInstanceOf(PersistenceConflictException.class);

        ImmutableConfigurationSnapshot snapshot = configuration(A, B, true);
        assertThat(persistence.snapshots().insert(snapshot)).isEqualTo(snapshot);
        assertThat(persistence.snapshots().insert(snapshot)).isEqualTo(snapshot);
        assertThat(persistence.snapshots().findSnapshot(snapshot.snapshotId(), snapshot.revision()))
                .contains(snapshot);
        assertThat(persistence.snapshots().findActive()).contains(snapshot);
        assertThatThrownBy(() -> persistence.snapshots().insert(
                        configuration(snapshot.revision(), C, true)))
                .isInstanceOf(PersistenceConflictException.class);

        ImmutablePackageDocument rollbackDocument =
                packageDocument("skill.package-rollback", B, C);
        assertThatThrownBy(() -> persistence.transactions().required(() -> {
                    persistence.packages().insert(rollbackDocument);
                    throw new IllegalStateException("named failure after package insert");
                }))
                .isInstanceOf(IllegalStateException.class);
        assertThat(persistence.packages().findPackage(
                        rollbackDocument.packageId(),
                        rollbackDocument.revision()))
                .isEmpty();
    }

    static PersistenceHarness harness(
            VerifiedIdentityRepository identities,
            EnterprisePermissionRepository permissions,
            EnterpriseDeviceRepository devices,
            DeviceEnrollmentGrantRepository enrollmentGrants,
            DeviceChallengeRepository challenges,
            AccessTokenIssuanceRepository tokenIssuances,
            ConfigurationSnapshotRepository snapshots,
            PackageDocumentRepository packages,
            CentralTransactionRunner transactions) {
        return new PersistenceHarness(
                identities,
                permissions,
                devices,
                enrollmentGrants,
                challenges,
                tokenIssuances,
                snapshots,
                packages,
                transactions);
    }

    private static VerifiedEnterpriseIdentity identity() {
        return new VerifiedEnterpriseIdentity(
                IDENTITY_ID,
                "enterprise.alpha",
                "user.alpha",
                "fake-oa",
                A,
                B,
                NOW,
                NOW.plusSeconds(300),
                null);
    }

    private static EnterpriseDevice device() {
        return new EnterpriseDevice(
                "device.alpha",
                "enterprise.alpha",
                "device-key.alpha",
                "spki_der_base64",
                "fixture-public-key",
                C,
                "ES256",
                "manual_device_enrollment",
                "managed",
                "compliant",
                1,
                NOW,
                null,
                null);
    }

    private static DeviceEnrollmentGrant grant() {
        return new DeviceEnrollmentGrant(
                GRANT_ID,
                D,
                "enterprise.alpha",
                "user.alpha",
                NOW,
                NOW.plusSeconds(600),
                null,
                null);
    }

    private static DeviceChallenge challenge() {
        return new DeviceChallenge(
                CHALLENGE_ID,
                "token_issuance",
                IDENTITY_ID,
                "client.alpha",
                "device-key.alpha",
                C,
                "fixture-nonce",
                "robothree.central",
                List.of("ES256"),
                D,
                NOW,
                NOW.plusSeconds(60),
                null,
                null,
                null);
    }

    private static AccessTokenIssuance issuance() {
        return new AccessTokenIssuance(
                TOKEN_ID,
                A,
                "enterprise.alpha",
                "user.alpha",
                "device.alpha",
                "client.alpha",
                List.of("configuration.read"),
                B,
                1,
                1,
                NOW,
                NOW.plusSeconds(900),
                CHALLENGE_ID);
    }

    private static ImmutableConfigurationSnapshot configuration(
            String revision,
            String digest,
            boolean active) {
        return new ImmutableConfigurationSnapshot(
                "configuration.snapshot-alpha",
                revision,
                digest,
                "v1alpha1",
                "{\"contractVersion\":\"v1alpha1\"}",
                "\"" + digest + "\"",
                active,
                NOW,
                NOW);
    }

    private static ImmutablePackageDocument packageDocument(
            String packageId,
            String revision,
            String digest) {
        return new ImmutablePackageDocument(
                packageId,
                "skill",
                revision,
                digest,
                "{\"packageId\":\"" + packageId + "\"}",
                NOW);
    }

    record PersistenceHarness(
            VerifiedIdentityRepository identities,
            EnterprisePermissionRepository permissions,
            EnterpriseDeviceRepository devices,
            DeviceEnrollmentGrantRepository enrollmentGrants,
            DeviceChallengeRepository challenges,
            AccessTokenIssuanceRepository tokenIssuances,
            ConfigurationSnapshotRepository snapshots,
            PackageDocumentRepository packages,
            CentralTransactionRunner transactions) {}
}
