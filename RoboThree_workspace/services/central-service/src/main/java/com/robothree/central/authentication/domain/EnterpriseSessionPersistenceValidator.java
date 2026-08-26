package com.robothree.central.authentication.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.authentication.port.EnterpriseSessionPersistence.EnterpriseSessionChallengeBundle;
import com.robothree.central.persistence.PersistenceIntegrityException;
import java.util.List;
import java.util.Set;

public final class EnterpriseSessionPersistenceValidator {

    private static final Set<String> ASSERTION_FIELDS = Set.of(
            "kind",
            "schemaVersion",
            "validity",
            "audience",
            "scope",
            "permissions",
            "issuedAt",
            "expiresAt",
            "assertionRevision",
            "assertionDigest");
    private static final Set<String> TRUST_FIELDS = Set.of(
            "kind",
            "schemaVersion",
            "decision",
            "ownerIdentity",
            "decisionRevision",
            "decisionDigest",
            "evaluatedAt");

    private EnterpriseSessionPersistenceValidator() {}

    public static EnterpriseSessionChallengeBundle validateChallengeBundle(
            EnterpriseSessionChallengeBundle bundle) {
        if (bundle == null || bundle.challenge() == null || bundle.binding() == null) {
            throw corrupt(
                    "persistence.enterprise_session_partial_commit",
                    "challenge bundle is incomplete");
        }
        var challenge = bundle.challenge();
        var binding = bundle.binding();
        try {
            if (!EnterpriseSessionChallengeBinding.PURPOSE.equals(challenge.purpose())
                    || !challenge.challengeId().equals(binding.challengeId())
                    || !challenge.verifiedIdentityId().equals(binding.verifiedIdentityId())
                    || !challenge.clientInstanceId()
                            .equals(binding.currentClientInstanceId().toString())
                    || !challenge.audience().equals(binding.audience())
                    || !binding.deviceKeyId().equals(challenge.expectedDeviceKeyId())
                    || !challenge.challengeDigest().equals(binding.challengeBindingDigest())
                    || !challenge.issuedAt().equals(binding.createdAt())
                    || !challenge.allowedAlgorithms().equals(List.of("ES256"))) {
                throw new IllegalArgumentException("challenge binding identity drift");
            }
            if (!EnterpriseSessionPersistenceDigests.challengeRecordDigest(binding)
                    .equals(binding.recordDigest())) {
                throw new IllegalArgumentException("challenge record digest drift");
            }
            return bundle;
        } catch (IllegalArgumentException exception) {
            throw corrupt(
                    "persistence.enterprise_session_binding_corrupt",
                    "challenge binding integrity validation failed",
                    exception);
        }
    }

    public static EnterpriseSessionLeaseIssuance validateLease(
            EnterpriseSessionLeaseIssuance value,
            EnterpriseSessionChallengeBundle bundle,
            VerifiedEnterpriseIdentity identity,
            EnterpriseDevice device) {
        validateChallengeBundle(bundle);
        try {
            var binding = bundle.binding();
            if (!value.challengeId().equals(binding.challengeId())
                    || !value.challengeBindingDigest().equals(binding.challengeBindingDigest())
                    || !value.verifiedIdentityId().equals(binding.verifiedIdentityId())
                    || !value.identitySourceRevision().equals(binding.identitySourceRevision())
                    || !value.clientInstanceId().equals(binding.currentClientInstanceId())
                    || !value.audience().equals(binding.audience())
                    || !value.permissions().equals(binding.requiredPermissions())) {
                throw new IllegalArgumentException("lease and challenge binding differ");
            }
            if (!identity.verifiedIdentityId().equals(value.verifiedIdentityId())
                    || !identity.enterpriseId().equals(value.enterpriseId())
                    || !identity.userId().equals(value.userId())
                    || !identity.identityDigest().equals(value.identityDigest())) {
                throw new IllegalArgumentException("lease identity drift");
            }
            if (!device.deviceId().equals(value.deviceId())
                    || !device.enterpriseId().equals(value.enterpriseId())
                    || device.revision() != value.deviceSourceRevision()
                    || !device.trustSource().equals(value.trustSource())
                    || !device.managedStatus().equals(value.managedStatus())
                    || !device.complianceStatus().equals(value.complianceStatus())) {
                throw new IllegalArgumentException("lease device drift");
            }
            validateAssertion(value);
            validateTrust(value);
            if (!EnterpriseSessionPersistenceDigests.sourceDecisionDigest(value)
                    .equals(value.sourceDecisionDigest())) {
                throw new IllegalArgumentException("source decision digest drift");
            }
            if (!EnterpriseSessionPersistenceDigests.leaseRecordDigest(value)
                    .equals(value.recordDigest())) {
                throw new IllegalArgumentException("lease record digest drift");
            }
            return value;
        } catch (IllegalArgumentException exception) {
            throw corrupt(
                    "persistence.enterprise_session_lease_corrupt",
                    "enterprise session lease integrity validation failed",
                    exception);
        }
    }

    private static void validateAssertion(EnterpriseSessionLeaseIssuance value) {
        ObjectNode document = EnterpriseSessionPersistenceDigests.parseCanonicalObject(
                value.sessionAssertionJson());
        requireFields(document, ASSERTION_FIELDS);
        requireText(document, "kind", "enterprise_session_assertion");
        requireText(document, "schemaVersion", "eipc.v1alpha1");
        requireText(document, "validity", "valid");
        requireText(document, "audience", value.audience());
        requireText(document, "issuedAt", EnterpriseSessionPersistenceDigests.timestamp(value.issuedAt()));
        requireText(document, "expiresAt", EnterpriseSessionPersistenceDigests.timestamp(value.expiresAt()));
        requireText(document, "assertionRevision", value.sessionAssertionRevision());
        requireText(document, "assertionDigest", value.sessionAssertionDigest());
        requireScope(document.path("scope"), value);
        requireStrings(document.path("permissions"), value.permissions());
        if (!EnterpriseSessionPersistenceDigests.assertionRevisionDigest(value)
                .equals(value.sessionAssertionRevision())) {
            throw new IllegalArgumentException("assertion revision drift");
        }
        if (!EnterpriseSessionPersistenceDigests.digestDocument(
                        EnterpriseSessionPersistenceDigests.ASSERTION_DOMAIN,
                        document,
                        "assertionDigest")
                .equals(value.sessionAssertionDigest())) {
            throw new IllegalArgumentException("assertion digest drift");
        }
    }

    private static void validateTrust(EnterpriseSessionLeaseIssuance value) {
        ObjectNode document = EnterpriseSessionPersistenceDigests.parseCanonicalObject(
                value.deviceTrustDecisionJson());
        requireFields(document, TRUST_FIELDS);
        requireText(document, "kind", "enterprise_device_trust_decision");
        requireText(document, "schemaVersion", "eipc.v1alpha1");
        requireText(document, "decision", "trusted");
        requireText(document, "decisionRevision", value.deviceTrustDecisionRevision());
        requireText(document, "decisionDigest", value.deviceTrustDecisionDigest());
        requireText(
                document,
                "evaluatedAt",
                EnterpriseSessionPersistenceDigests.timestamp(value.trustEvaluatedAt()));
        JsonNode owner = document.path("ownerIdentity");
        requireText(owner, "enterpriseId", value.enterpriseId());
        requireText(owner, "userId", value.userId());
        requireText(owner, "deviceId", value.deviceId());
        if (!EnterpriseSessionPersistenceDigests.deviceTrustRevisionDigest(value)
                .equals(value.deviceTrustDecisionRevision())) {
            throw new IllegalArgumentException("trust revision drift");
        }
        if (!EnterpriseSessionPersistenceDigests.digestDocument(
                        EnterpriseSessionPersistenceDigests.DEVICE_TRUST_DOMAIN,
                        document,
                        "decisionDigest")
                .equals(value.deviceTrustDecisionDigest())) {
            throw new IllegalArgumentException("trust decision digest drift");
        }
    }

    private static void requireScope(JsonNode scope, EnterpriseSessionLeaseIssuance value) {
        requireText(scope, "enterpriseId", value.enterpriseId());
        requireText(scope, "userId", value.userId());
        requireText(scope, "deviceId", value.deviceId());
        requireText(scope, "clientInstanceId", value.clientInstanceId().toString());
    }

    private static void requireStrings(JsonNode value, List<String> expected) {
        if (!value.isArray()
                || !java.util.stream.StreamSupport.stream(value.spliterator(), false)
                        .map(JsonNode::textValue)
                        .toList()
                        .equals(expected)) {
            throw new IllegalArgumentException("canonical array differs from indexed facts");
        }
    }

    private static void requireFields(ObjectNode object, Set<String> expected) {
        if (!object.propertyStream().map(java.util.Map.Entry::getKey).collect(java.util.stream.Collectors.toSet())
                .equals(expected)) {
            throw new IllegalArgumentException("canonical document fields differ");
        }
    }

    private static void requireText(JsonNode object, String field, String expected) {
        if (!object.isObject() || !expected.equals(object.path(field).textValue())) {
            throw new IllegalArgumentException(field + " differs from indexed facts");
        }
    }

    private static PersistenceIntegrityException corrupt(String code, String message) {
        return new PersistenceIntegrityException(code, message);
    }

    private static PersistenceIntegrityException corrupt(
            String code, String message, Throwable cause) {
        return new PersistenceIntegrityException(code, message, cause);
    }
}
