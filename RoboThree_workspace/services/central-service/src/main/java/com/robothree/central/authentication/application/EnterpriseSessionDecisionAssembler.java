package com.robothree.central.authentication.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.authentication.domain.DeviceTrustDecision;
import com.robothree.central.authentication.domain.EnterpriseDevice;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.EnterpriseSessionDecisionDigests;
import com.robothree.central.authentication.domain.EnterpriseSessionLeaseIssuance;
import com.robothree.central.authentication.domain.EnterpriseSessionPersistenceDigests;
import com.robothree.central.authentication.domain.EnterpriseSessionTokenClaims;
import com.robothree.central.authentication.domain.EnterpriseUserPermission;
import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.CompatibilityEvaluator;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public final class EnterpriseSessionDecisionAssembler {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String RAW_ZERO = "0".repeat(64);
    private static final String WIRE_ZERO = "sha256:" + RAW_ZERO;

    public PreparedDecision prepareDecision(Material material) {
        Objects.requireNonNull(material, "material");
        requireMaterial(material);
        String deviceRevisionDigest = EnterpriseSessionDecisionDigests.deviceRevisionDigest(
                material.device());
        String permissionRevisionDigest = EnterpriseSessionDecisionDigests.permissionRevisionDigest(
                material.identity().enterpriseId(),
                material.identity().userId(),
                material.binding().requiredPermissions(),
                material.permissionFacts());
        String compatibilityRevision = EnterpriseSessionDecisionDigests.compatibilityRevision(
                material.compatibility().revision());

        EnterpriseSessionLeaseIssuance seed = issuance(
                material,
                deviceRevisionDigest,
                permissionRevisionDigest,
                compatibilityRevision,
                WIRE_ZERO,
                WIRE_ZERO,
                "{}",
                WIRE_ZERO,
                WIRE_ZERO,
                "{}",
                WIRE_ZERO,
                RAW_ZERO,
                RAW_ZERO);

        String assertionRevision =
                EnterpriseSessionPersistenceDigests.assertionRevisionDigest(seed);
        ObjectNode assertion = assertionDocument(seed, assertionRevision);
        String assertionDigest = EnterpriseSessionPersistenceDigests.digestDocument(
                EnterpriseSessionPersistenceDigests.ASSERTION_DOMAIN,
                assertion,
                "assertionDigest");
        assertion.put("assertionDigest", assertionDigest);
        String assertionJson = EnterpriseSessionPersistenceDigests.canonicalize(assertion);

        String trustRevision =
                EnterpriseSessionPersistenceDigests.deviceTrustRevisionDigest(seed);
        ObjectNode trust = trustDocument(seed, trustRevision);
        String trustDigest = EnterpriseSessionPersistenceDigests.digestDocument(
                EnterpriseSessionPersistenceDigests.DEVICE_TRUST_DOMAIN,
                trust,
                "decisionDigest");
        trust.put("decisionDigest", trustDigest);
        String trustJson = EnterpriseSessionPersistenceDigests.canonicalize(trust);

        EnterpriseSessionLeaseIssuance withDocuments = issuance(
                material,
                deviceRevisionDigest,
                permissionRevisionDigest,
                compatibilityRevision,
                assertionRevision,
                assertionDigest,
                assertionJson,
                trustRevision,
                trustDigest,
                trustJson,
                WIRE_ZERO,
                RAW_ZERO,
                RAW_ZERO);
        String sourceDecisionDigest =
                EnterpriseSessionPersistenceDigests.sourceDecisionDigest(withDocuments);
        EnterpriseSessionLeaseIssuance prototype = issuance(
                material,
                deviceRevisionDigest,
                permissionRevisionDigest,
                compatibilityRevision,
                assertionRevision,
                assertionDigest,
                assertionJson,
                trustRevision,
                trustDigest,
                trustJson,
                sourceDecisionDigest,
                RAW_ZERO,
                RAW_ZERO);
        return new PreparedDecision(prototype, EnterpriseSessionTokenClaims.fromIssuance(prototype));
    }

    public LeaseOutcome finalizeIssuance(PreparedDecision prepared, String tokenDigest) {
        Objects.requireNonNull(prepared, "prepared");
        com.robothree.central.shared.domain.DomainValueChecks.digest(tokenDigest, "tokenDigest");
        EnterpriseSessionLeaseIssuance withToken = copy(
                prepared.prototype(), tokenDigest, RAW_ZERO);
        String recordDigest = EnterpriseSessionPersistenceDigests.leaseRecordDigest(withToken);
        EnterpriseSessionLeaseIssuance issuance = copy(withToken, tokenDigest, recordDigest);
        return new LeaseOutcome(
                issuance,
                prepared.claims(),
                issuance.sessionAssertionJson(),
                issuance.deviceTrustDecisionJson());
    }

    private static void requireMaterial(Material material) {
        if (!material.binding().verifiedIdentityId().equals(
                        material.identity().verifiedIdentityId())
                || !material.binding().deviceKeyId().equals(material.device().deviceKeyId())
                || !material.identity().enterpriseId().equals(material.device().enterpriseId())
                || !material.trustDecision().device().equals(material.device())
                || material.permissionFacts().stream().anyMatch(value -> !value.enabled())) {
            throw EnterpriseAuthenticationException.authorization(
                    "permission_denied",
                    "Enterprise session decision material is not authorized.");
        }
    }

    private static EnterpriseSessionLeaseIssuance issuance(
            Material material,
            String deviceRevisionDigest,
            String permissionRevisionDigest,
            String compatibilityRevision,
            String assertionRevision,
            String assertionDigest,
            String assertionJson,
            String trustRevision,
            String trustDigest,
            String trustJson,
            String sourceDecisionDigest,
            String tokenDigest,
            String recordDigest) {
        return new EnterpriseSessionLeaseIssuance(
                material.tokenId(),
                tokenDigest,
                EnterpriseSessionChallengeBinding.CLAIMS_PROFILE,
                material.issuer(),
                EnterpriseSessionChallengeBinding.AUDIENCE,
                material.identity().enterpriseId(),
                material.identity().userId(),
                material.device().deviceId(),
                material.identity().verifiedIdentityId(),
                material.binding().identitySourceRevision(),
                material.binding().currentClientInstanceId(),
                material.binding().requiredPermissions(),
                material.identity().identityDigest(),
                material.device().revision(),
                deviceRevisionDigest,
                permissionRevisionDigest,
                compatibilityRevision,
                material.device().trustSource(),
                material.device().managedStatus(),
                material.device().complianceStatus(),
                material.issuedAt(),
                material.expiresAt(),
                material.issuedAt(),
                material.binding().challengeId(),
                material.binding().challengeBindingDigest(),
                assertionRevision,
                assertionDigest,
                assertionJson,
                trustRevision,
                trustDigest,
                trustJson,
                sourceDecisionDigest,
                material.requestDigest(),
                recordDigest);
    }

    private static EnterpriseSessionLeaseIssuance copy(
            EnterpriseSessionLeaseIssuance value,
            String tokenDigest,
            String recordDigest) {
        return new EnterpriseSessionLeaseIssuance(
                value.tokenId(), tokenDigest, value.claimsProfile(), value.issuer(), value.audience(),
                value.enterpriseId(), value.userId(), value.deviceId(), value.verifiedIdentityId(),
                value.identitySourceRevision(), value.clientInstanceId(), value.permissions(),
                value.identityDigest(), value.deviceSourceRevision(), value.deviceRevisionDigest(),
                value.permissionRevisionDigest(), value.compatibilityRevision(), value.trustSource(),
                value.managedStatus(), value.complianceStatus(), value.issuedAt(), value.expiresAt(),
                value.trustEvaluatedAt(), value.challengeId(), value.challengeBindingDigest(),
                value.sessionAssertionRevision(), value.sessionAssertionDigest(),
                value.sessionAssertionJson(), value.deviceTrustDecisionRevision(),
                value.deviceTrustDecisionDigest(), value.deviceTrustDecisionJson(),
                value.sourceDecisionDigest(), value.requestDigest(), recordDigest);
    }

    private static ObjectNode assertionDocument(
            EnterpriseSessionLeaseIssuance value,
            String revision) {
        ObjectNode assertion = JSON.createObjectNode();
        assertion.put("kind", "enterprise_session_assertion");
        assertion.put("schemaVersion", "eipc.v1alpha1");
        assertion.put("validity", "valid");
        assertion.put("audience", value.audience());
        ObjectNode scope = JSON.createObjectNode();
        scope.put("enterpriseId", value.enterpriseId());
        scope.put("userId", value.userId());
        scope.put("deviceId", value.deviceId());
        scope.put("clientInstanceId", value.clientInstanceId().toString());
        assertion.set("scope", scope);
        ArrayNode permissions = JSON.createArrayNode();
        value.permissions().forEach(permissions::add);
        assertion.set("permissions", permissions);
        assertion.put("issuedAt", EnterpriseSessionPersistenceDigests.timestamp(value.issuedAt()));
        assertion.put("expiresAt", EnterpriseSessionPersistenceDigests.timestamp(value.expiresAt()));
        assertion.put("assertionRevision", revision);
        assertion.put("assertionDigest", WIRE_ZERO);
        return assertion;
    }

    private static ObjectNode trustDocument(
            EnterpriseSessionLeaseIssuance value,
            String revision) {
        ObjectNode trust = JSON.createObjectNode();
        trust.put("kind", "enterprise_device_trust_decision");
        trust.put("schemaVersion", "eipc.v1alpha1");
        trust.put("decision", "trusted");
        ObjectNode owner = JSON.createObjectNode();
        owner.put("enterpriseId", value.enterpriseId());
        owner.put("userId", value.userId());
        owner.put("deviceId", value.deviceId());
        trust.set("ownerIdentity", owner);
        trust.put("decisionRevision", revision);
        trust.put("decisionDigest", WIRE_ZERO);
        trust.put("evaluatedAt", EnterpriseSessionPersistenceDigests.timestamp(
                value.trustEvaluatedAt()));
        return trust;
    }

    public record Material(
            EnterpriseSessionChallengeBinding binding,
            VerifiedEnterpriseIdentity identity,
            EnterpriseDevice device,
            List<EnterpriseUserPermission> permissionFacts,
            DeviceTrustDecision trustDecision,
            CompatibilityEvaluator.CompatibilityDecision compatibility,
            UUID tokenId,
            Instant issuedAt,
            Instant expiresAt,
            String issuer,
            String requestDigest) {
        public Material {
            Objects.requireNonNull(binding, "binding");
            Objects.requireNonNull(identity, "identity");
            Objects.requireNonNull(device, "device");
            permissionFacts = List.copyOf(Objects.requireNonNull(permissionFacts, "permissionFacts"));
            Objects.requireNonNull(trustDecision, "trustDecision");
            Objects.requireNonNull(compatibility, "compatibility");
            Objects.requireNonNull(tokenId, "tokenId");
            Objects.requireNonNull(issuedAt, "issuedAt");
            Objects.requireNonNull(expiresAt, "expiresAt");
            Objects.requireNonNull(issuer, "issuer");
            com.robothree.central.shared.domain.DomainValueChecks.digest(
                    requestDigest, "requestDigest");
        }
    }

    public record PreparedDecision(
            EnterpriseSessionLeaseIssuance prototype,
            EnterpriseSessionTokenClaims claims) {
        public PreparedDecision {
            Objects.requireNonNull(prototype, "prototype");
            Objects.requireNonNull(claims, "claims");
        }
    }

    public record LeaseOutcome(
            EnterpriseSessionLeaseIssuance issuance,
            EnterpriseSessionTokenClaims claims,
            String sessionAssertionJson,
            String deviceTrustDecisionJson) {
        public LeaseOutcome {
            Objects.requireNonNull(issuance, "issuance");
            Objects.requireNonNull(claims, "claims");
            Objects.requireNonNull(sessionAssertionJson, "sessionAssertionJson");
            Objects.requireNonNull(deviceTrustDecisionJson, "deviceTrustDecisionJson");
        }
    }
}
