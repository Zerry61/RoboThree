package com.robothree.central.authentication.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EnterpriseSessionDecisionDigestsTest {

    private static final Instant NOW = Instant.parse("2026-08-24T01:00:00.000Z");
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void deviceRevisionDigestCoversEveryLockedSourceField() {
        String original = EnterpriseSessionDecisionDigests.deviceRevisionDigest(device(7, "compliant"));
        String changedRevision = EnterpriseSessionDecisionDigests.deviceRevisionDigest(device(8, "compliant"));
        String changedCompliance = EnterpriseSessionDecisionDigests.deviceRevisionDigest(device(7, "unknown"));

        assertThat(original).matches("^sha256:[a-f0-9]{64}$");
        assertThat(original).isNotEqualTo(changedRevision).isNotEqualTo(changedCompliance);
    }

    @Test
    void permissionRevisionDigestSortsFactsAndCoversDeniedRows() {
        EnterpriseUserPermission config = permission("configuration.read", true, 3);
        EnterpriseUserPermission personal = permission("personal_model.configure", false, 4);

        String first = EnterpriseSessionDecisionDigests.permissionRevisionDigest(
                "enterprise.fixture",
                "user.fixture",
                List.of("configuration.read", "personal_model.configure"),
                List.of(personal, config));
        String second = EnterpriseSessionDecisionDigests.permissionRevisionDigest(
                "enterprise.fixture",
                "user.fixture",
                List.of("configuration.read", "personal_model.configure"),
                List.of(config, personal));
        String enabled = EnterpriseSessionDecisionDigests.permissionRevisionDigest(
                "enterprise.fixture",
                "user.fixture",
                List.of("configuration.read", "personal_model.configure"),
                List.of(config, permission("personal_model.configure", true, 4)));

        assertThat(first).isEqualTo(second).isNotEqualTo(enabled);
    }

    @Test
    void permissionRevisionDigestRejectsOwnerDriftDuplicateAndNanoseconds() {
        assertThatThrownBy(() -> EnterpriseSessionDecisionDigests.permissionRevisionDigest(
                        "enterprise.fixture",
                        "user.fixture",
                        List.of("configuration.read"),
                        List.of(new EnterpriseUserPermission(
                                "other.enterprise",
                                "user.fixture",
                                "configuration.read",
                                true,
                                1,
                                NOW))))
                .isInstanceOf(IllegalArgumentException.class);
        EnterpriseUserPermission duplicate = permission("configuration.read", true, 3);
        assertThatThrownBy(() -> EnterpriseSessionDecisionDigests.permissionRevisionDigest(
                        "enterprise.fixture",
                        "user.fixture",
                        List.of("configuration.read"),
                        List.of(duplicate, duplicate)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EnterpriseSessionDecisionDigests.permissionRevisionDigest(
                        "enterprise.fixture",
                        "user.fixture",
                        List.of("configuration.read"),
                        List.of(new EnterpriseUserPermission(
                                "enterprise.fixture",
                                "user.fixture",
                                "configuration.read",
                                true,
                                1,
                                NOW.plusNanos(1)))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void permissionRevisionDigestRequiresConfigurationReadAndRejectsUnknownPermission() {
        assertThatThrownBy(() -> EnterpriseSessionDecisionDigests.permissionRevisionDigest(
                        "enterprise.fixture",
                        "user.fixture",
                        List.of("configuration.read", "personal_model.configure"),
                        List.of(permission("personal_model.configure", true, 4))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EnterpriseSessionDecisionDigests.permissionRevisionDigest(
                        "enterprise.fixture",
                        "user.fixture",
                        List.of("configuration.read"),
                        List.of(
                                permission("configuration.read", true, 3),
                                permission("unknown.permission", false, 4))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void permissionRevisionDigestRequiresExactRequestedPermissionCoverage() {
        EnterpriseUserPermission config = permission("configuration.read", true, 3);
        EnterpriseUserPermission personal = permission("personal_model.configure", false, 4);

        assertThatThrownBy(() -> EnterpriseSessionDecisionDigests.permissionRevisionDigest(
                        "enterprise.fixture",
                        "user.fixture",
                        List.of("configuration.read", "personal_model.configure"),
                        List.of(config)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EnterpriseSessionDecisionDigests.permissionRevisionDigest(
                        "enterprise.fixture",
                        "user.fixture",
                        List.of("configuration.read"),
                        List.of(config, personal)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void compatibilityRevisionIsDecimalAndRejectsNegativeValues() {
        assertThat(EnterpriseSessionDecisionDigests.compatibilityRevision(17)).isEqualTo("17");
        assertThatThrownBy(() -> EnterpriseSessionDecisionDigests.compatibilityRevision(-1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void leaseRequestDigestMatchesIndependentCanonicalMaterial() {
        EnterpriseSessionLeaseRequestDigestMaterial value = requestMaterial();
        ObjectNode material = JSON.createObjectNode();
        material.put("schemaVersion", value.schemaVersion());
        material.put("claimsProfile", value.claimsProfile());
        material.put("challengeId", value.challengeId().toString());
        material.put("challengeBindingDigest", value.challengeBindingDigest());
        material.put("currentClientInstanceId", value.currentClientInstanceId().toString());
        material.put("audience", value.audience());
        ArrayNode permissions = JSON.createArrayNode();
        value.requiredPermissions().forEach(permissions::add);
        material.set("requiredPermissions", permissions);
        material.put("deviceKeyId", value.deviceKeyId());
        material.put("correlationId", value.correlationId().toString());
        String expected = CanonicalJson.sha256(
                EnterpriseSessionDecisionDigests.LEASE_REQUEST_DOMAIN
                        + "\n"
                        + CanonicalJson.canonicalize(material));

        assertThat(EnterpriseSessionDecisionDigests.leaseRequestDigest(value))
                .isEqualTo(expected)
                .matches("^[a-f0-9]{64}$");
    }

    @Test
    void leaseRequestDigestChangesForBusinessIdentityButHasNoSensitiveFields() {
        EnterpriseSessionLeaseRequestDigestMaterial value = requestMaterial();
        EnterpriseSessionLeaseRequestDigestMaterial changed = new EnterpriseSessionLeaseRequestDigestMaterial(
                value.schemaVersion(),
                value.claimsProfile(),
                value.challengeId(),
                value.challengeBindingDigest(),
                value.currentClientInstanceId(),
                value.audience(),
                value.requiredPermissions(),
                "device-key.changed",
                value.correlationId());
        assertThat(EnterpriseSessionDecisionDigests.leaseRequestDigest(value))
                .isNotEqualTo(EnterpriseSessionDecisionDigests.leaseRequestDigest(changed));
        assertThat(List.of(EnterpriseSessionLeaseRequestDigestMaterial.class.getRecordComponents())
                        .stream()
                        .map(java.lang.reflect.RecordComponent::getName))
                .doesNotContain(
                        "verifiedIdentityHandle",
                        "deviceProof",
                        "signature",
                        "accessToken",
                        "tokenDigest",
                        "credentialRef");
    }

    @Test
    void challengeBindingDigestUsesRawPersistenceRepresentation() {
        String digest = EnterpriseSessionDecisionDigests.challengeBindingDigest(
                java.util.UUID.fromString("10000000-0000-4000-8000-000000000001"),
                java.util.UUID.fromString("20000000-0000-4000-8000-000000000002"),
                List.of("configuration.read"),
                "device-key.fixture",
                java.util.UUID.fromString("30000000-0000-4000-8000-000000000003"),
                java.util.UUID.fromString("40000000-0000-4000-8000-000000000004"),
                "nonce_fixture_value_0000000000000001",
                java.time.Instant.parse("2026-08-24T08:00:00.000Z"),
                java.time.Instant.parse("2026-08-24T08:01:00.000Z"));

        assertThat(digest).matches("^[a-f0-9]{64}$");
    }

    @Test
    void leaseRequestMaterialRejectsUnsortedPermissionsAndRawProfileDrift() {
        EnterpriseSessionLeaseRequestDigestMaterial value = requestMaterial();
        assertThatThrownBy(() -> new EnterpriseSessionLeaseRequestDigestMaterial(
                        value.schemaVersion(),
                        value.claimsProfile(),
                        value.challengeId(),
                        value.challengeBindingDigest(),
                        value.currentClientInstanceId(),
                        value.audience(),
                        List.of("personal_model.configure", "configuration.read"),
                        value.deviceKeyId(),
                        value.correlationId()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EnterpriseSessionLeaseRequestDigestMaterial(
                        "wrong",
                        value.claimsProfile(),
                        value.challengeId(),
                        value.challengeBindingDigest(),
                        value.currentClientInstanceId(),
                        value.audience(),
                        value.requiredPermissions(),
                        value.deviceKeyId(),
                        value.correlationId()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private EnterpriseDevice device(long revision, String compliance) {
        return new EnterpriseDevice(
                "device.fixture",
                "enterprise.fixture",
                "device-key.fixture",
                "spki_der_base64",
                "fixture-public-key",
                "a".repeat(64),
                "ES256",
                "mdm.fixture",
                "managed",
                compliance,
                revision,
                NOW,
                null,
                null);
    }

    private EnterpriseUserPermission permission(String permission, boolean enabled, long revision) {
        return new EnterpriseUserPermission(
                "enterprise.fixture",
                "user.fixture",
                permission,
                enabled,
                revision,
                NOW);
    }

    private EnterpriseSessionLeaseRequestDigestMaterial requestMaterial() {
        return new EnterpriseSessionLeaseRequestDigestMaterial(
                "enterprise-session.v1alpha1",
                "eipc.session-token.v1",
                UUID.fromString("33333333-3333-4333-8333-333333333333"),
                "a".repeat(64),
                UUID.fromString("11111111-1111-4111-8111-111111111111"),
                "robothree.enterprise-gateway",
                List.of("configuration.read", "personal_model.configure"),
                "device-key.fixture",
                UUID.fromString("22222222-2222-4222-8222-222222222222"));
    }
}
