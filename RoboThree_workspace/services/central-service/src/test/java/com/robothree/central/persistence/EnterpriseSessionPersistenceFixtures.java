package com.robothree.central.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.EnterpriseSessionLeaseIssuance;
import com.robothree.central.authentication.domain.EnterpriseSessionPersistenceDigests;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class EnterpriseSessionPersistenceFixtures {

    static final Instant NOW = Instant.parse("2026-08-23T10:00:00.000Z");
    static final UUID IDENTITY_ID = UUID.fromString("55555555-5555-4555-8555-555555555555");
    static final UUID CLIENT_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    static final UUID CORRELATION_ID = UUID.fromString("22222222-2222-4222-8222-222222222222");
    static final UUID CHALLENGE_ID = UUID.fromString("33333333-3333-4333-8333-333333333333");
    static final UUID TOKEN_ID = UUID.fromString("44444444-4444-4444-8444-444444444444");
    static final String A = "a".repeat(64);
    static final String B = "b".repeat(64);
    static final String C = "c".repeat(64);
    static final String D = "d".repeat(64);
    static final String WIRE_ZERO = "sha256:" + "0".repeat(64);
    private static final ObjectMapper JSON = new ObjectMapper();

    private EnterpriseSessionPersistenceFixtures() {}

    static VerifiedEnterpriseIdentity identity() {
        return new VerifiedEnterpriseIdentity(
                IDENTITY_ID,
                "enterprise.fixture",
                "user.fixture",
                "fake-oa",
                A,
                B,
                NOW.minusSeconds(60),
                NOW.plusSeconds(3600),
                null);
    }

    static EnterpriseDevice device() {
        return new EnterpriseDevice(
                "device.fixture-001",
                "enterprise.fixture",
                "device-key.fixture-001",
                "spki_der_base64",
                "fixture-public-key",
                C,
                "ES256",
                "mdm.fixture",
                "managed",
                "compliant",
                7,
                NOW.minusSeconds(60),
                null,
                null);
    }

    static DeviceChallenge challenge() {
        return new DeviceChallenge(
                CHALLENGE_ID,
                EnterpriseSessionChallengeBinding.PURPOSE,
                IDENTITY_ID,
                CLIENT_ID.toString(),
                device().deviceKeyId(),
                null,
                "RklYVFVSRV9OT05DRV9OT1RfUkVBTF9DUllQVE8",
                EnterpriseSessionChallengeBinding.AUDIENCE,
                List.of("ES256"),
                A,
                NOW,
                NOW.plusSeconds(60),
                null,
                null,
                null);
    }

    static EnterpriseSessionChallengeBinding binding() {
        EnterpriseSessionChallengeBinding provisional = new EnterpriseSessionChallengeBinding(
                CHALLENGE_ID,
                IDENTITY_ID,
                EnterpriseSessionChallengeBinding.CLAIMS_PROFILE,
                "identity-source.fixture-001",
                CLIENT_ID,
                EnterpriseSessionChallengeBinding.AUDIENCE,
                permissions(),
                device().deviceKeyId(),
                CORRELATION_ID,
                A,
                D,
                NOW);
        return new EnterpriseSessionChallengeBinding(
                provisional.challengeId(),
                provisional.verifiedIdentityId(),
                provisional.claimsProfile(),
                provisional.identitySourceRevision(),
                provisional.currentClientInstanceId(),
                provisional.audience(),
                provisional.requiredPermissions(),
                provisional.deviceKeyId(),
                provisional.correlationId(),
                provisional.challengeBindingDigest(),
                EnterpriseSessionPersistenceDigests.challengeRecordDigest(provisional),
                provisional.createdAt());
    }

    static EnterpriseSessionLeaseIssuance lease() {
        EnterpriseSessionLeaseIssuance provisional = issuance(
                WIRE_ZERO,
                WIRE_ZERO,
                "{}",
                WIRE_ZERO,
                WIRE_ZERO,
                "{}",
                WIRE_ZERO,
                D);
        String assertionRevision =
                EnterpriseSessionPersistenceDigests.assertionRevisionDigest(provisional);
        ObjectNode assertion = JSON.createObjectNode();
        assertion.put("kind", "enterprise_session_assertion");
        assertion.put("schemaVersion", "eipc.v1alpha1");
        assertion.put("validity", "valid");
        assertion.put("audience", EnterpriseSessionChallengeBinding.AUDIENCE);
        assertion.set("scope", scope());
        assertion.set("permissions", JSON.valueToTree(permissions()));
        assertion.put("issuedAt", EnterpriseSessionPersistenceDigests.timestamp(NOW.plusSeconds(5)));
        assertion.put("expiresAt", EnterpriseSessionPersistenceDigests.timestamp(NOW.plusSeconds(900)));
        assertion.put("assertionRevision", assertionRevision);
        assertion.put("assertionDigest", WIRE_ZERO);
        String assertionDigest = EnterpriseSessionPersistenceDigests.digestDocument(
                EnterpriseSessionPersistenceDigests.ASSERTION_DOMAIN,
                assertion,
                "assertionDigest");
        assertion.put("assertionDigest", assertionDigest);
        String assertionJson = EnterpriseSessionPersistenceDigests.canonicalize(assertion);

        String trustRevision =
                EnterpriseSessionPersistenceDigests.deviceTrustRevisionDigest(provisional);
        ObjectNode trust = JSON.createObjectNode();
        trust.put("kind", "enterprise_device_trust_decision");
        trust.put("schemaVersion", "eipc.v1alpha1");
        trust.put("decision", "trusted");
        trust.set("ownerIdentity", owner());
        trust.put("decisionRevision", trustRevision);
        trust.put("decisionDigest", WIRE_ZERO);
        trust.put("evaluatedAt", EnterpriseSessionPersistenceDigests.timestamp(NOW.plusSeconds(4)));
        String trustDigest = EnterpriseSessionPersistenceDigests.digestDocument(
                EnterpriseSessionPersistenceDigests.DEVICE_TRUST_DOMAIN,
                trust,
                "decisionDigest");
        trust.put("decisionDigest", trustDigest);
        String trustJson = EnterpriseSessionPersistenceDigests.canonicalize(trust);

        EnterpriseSessionLeaseIssuance withDocuments = issuance(
                assertionRevision,
                assertionDigest,
                assertionJson,
                trustRevision,
                trustDigest,
                trustJson,
                WIRE_ZERO,
                D);
        String sourceDigest = EnterpriseSessionPersistenceDigests.sourceDecisionDigest(withDocuments);
        EnterpriseSessionLeaseIssuance withSource = issuance(
                assertionRevision,
                assertionDigest,
                assertionJson,
                trustRevision,
                trustDigest,
                trustJson,
                sourceDigest,
                D);
        return issuance(
                assertionRevision,
                assertionDigest,
                assertionJson,
                trustRevision,
                trustDigest,
                trustJson,
                sourceDigest,
                EnterpriseSessionPersistenceDigests.leaseRecordDigest(withSource));
    }

    static EnterpriseSessionChallengeBinding bindingWithRecordDigest(String recordDigest) {
        EnterpriseSessionChallengeBinding value = binding();
        return new EnterpriseSessionChallengeBinding(
                value.challengeId(),
                value.verifiedIdentityId(),
                value.claimsProfile(),
                value.identitySourceRevision(),
                value.currentClientInstanceId(),
                value.audience(),
                value.requiredPermissions(),
                value.deviceKeyId(),
                value.correlationId(),
                value.challengeBindingDigest(),
                recordDigest,
                value.createdAt());
    }

    static EnterpriseSessionLeaseIssuance leaseWithRecordDigest(String recordDigest) {
        EnterpriseSessionLeaseIssuance value = lease();
        return copyLease(value, value.sessionAssertionJson(), recordDigest);
    }

    static EnterpriseSessionLeaseIssuance leaseWithAssertionJson(String assertionJson) {
        EnterpriseSessionLeaseIssuance value = lease();
        return copyLease(value, assertionJson, value.recordDigest());
    }

    private static EnterpriseSessionLeaseIssuance copyLease(
            EnterpriseSessionLeaseIssuance value,
            String assertionJson,
            String recordDigest) {
        return new EnterpriseSessionLeaseIssuance(
                value.tokenId(),
                value.tokenDigest(),
                value.claimsProfile(),
                value.issuer(),
                value.audience(),
                value.enterpriseId(),
                value.userId(),
                value.deviceId(),
                value.verifiedIdentityId(),
                value.identitySourceRevision(),
                value.clientInstanceId(),
                value.permissions(),
                value.identityDigest(),
                value.deviceSourceRevision(),
                value.deviceRevisionDigest(),
                value.permissionRevisionDigest(),
                value.compatibilityRevision(),
                value.trustSource(),
                value.managedStatus(),
                value.complianceStatus(),
                value.issuedAt(),
                value.expiresAt(),
                value.trustEvaluatedAt(),
                value.challengeId(),
                value.challengeBindingDigest(),
                value.sessionAssertionRevision(),
                value.sessionAssertionDigest(),
                assertionJson,
                value.deviceTrustDecisionRevision(),
                value.deviceTrustDecisionDigest(),
                value.deviceTrustDecisionJson(),
                value.sourceDecisionDigest(),
                value.requestDigest(),
                recordDigest);
    }

    private static EnterpriseSessionLeaseIssuance issuance(
            String assertionRevision,
            String assertionDigest,
            String assertionJson,
            String trustRevision,
            String trustDigest,
            String trustJson,
            String sourceDigest,
            String recordDigest) {
        return new EnterpriseSessionLeaseIssuance(
                TOKEN_ID,
                C,
                EnterpriseSessionChallengeBinding.CLAIMS_PROFILE,
                "robothree.central.fixture",
                EnterpriseSessionChallengeBinding.AUDIENCE,
                "enterprise.fixture",
                "user.fixture",
                "device.fixture-001",
                IDENTITY_ID,
                "identity-source.fixture-001",
                CLIENT_ID,
                permissions(),
                B,
                7,
                "sha256:" + "2".repeat(64),
                "sha256:" + "3".repeat(64),
                "compatibility.fixture-001",
                "mdm.fixture",
                "managed",
                "compliant",
                NOW.plusSeconds(5),
                NOW.plusSeconds(900),
                NOW.plusSeconds(4),
                CHALLENGE_ID,
                A,
                assertionRevision,
                assertionDigest,
                assertionJson,
                trustRevision,
                trustDigest,
                trustJson,
                sourceDigest,
                A,
                recordDigest);
    }

    private static List<String> permissions() {
        return List.of("configuration.read", "personal_model.configure");
    }

    private static ObjectNode scope() {
        ObjectNode scope = JSON.createObjectNode();
        scope.put("enterpriseId", "enterprise.fixture");
        scope.put("userId", "user.fixture");
        scope.put("deviceId", "device.fixture-001");
        scope.put("clientInstanceId", CLIENT_ID.toString());
        return scope;
    }

    private static ObjectNode owner() {
        ObjectNode owner = JSON.createObjectNode();
        owner.put("enterpriseId", "enterprise.fixture");
        owner.put("userId", "user.fixture");
        owner.put("deviceId", "device.fixture-001");
        return owner;
    }
}
