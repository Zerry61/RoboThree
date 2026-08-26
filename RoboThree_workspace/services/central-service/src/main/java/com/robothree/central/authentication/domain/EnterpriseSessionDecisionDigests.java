package com.robothree.central.authentication.domain;

import static com.robothree.central.authentication.domain.EnterpriseSessionPersistenceDigests.timestamp;
import static com.robothree.central.shared.domain.DomainValueChecks.revision;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public final class EnterpriseSessionDecisionDigests {

    public static final String DEVICE_SOURCE_REVISION_DOMAIN =
            "robothree.enterprise-session.device-source-revision.v1";
    public static final String PERMISSION_SOURCE_REVISION_DOMAIN =
            "robothree.enterprise-session.permission-source-revision.v1";
    public static final String LEASE_REQUEST_DOMAIN =
            "robothree.enterprise-session.lease-request.v1";
    public static final String CHALLENGE_BINDING_DOMAIN =
            "robothree.enterprise-session.challenge-binding.v1";

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> SUPPORTED_PERMISSIONS = Set.of(
            "configuration.read",
            "model.use",
            "tool.use",
            "agent.use",
            "skill.use",
            "knowledge.use",
            "personal_model.configure");

    private EnterpriseSessionDecisionDigests() {}

    public static String deviceRevisionDigest(EnterpriseDevice device) {
        Objects.requireNonNull(device, "device");
        ObjectNode material = JSON.createObjectNode();
        material.put("enterpriseId", device.enterpriseId());
        material.put("deviceId", device.deviceId());
        material.put("deviceKeyId", device.deviceKeyId());
        material.put("publicKeyDigest", device.publicKeyDigest());
        material.put("trustSource", device.trustSource());
        material.put("managedStatus", device.managedStatus());
        material.put("complianceStatus", device.complianceStatus());
        material.put("deviceSourceRevision", device.revision());
        return EnterpriseSessionPersistenceDigests.wireDigest(
                DEVICE_SOURCE_REVISION_DOMAIN, material);
    }

    public static String permissionRevisionDigest(
            String enterpriseId,
            String userId,
            List<String> requiredPermissions,
            List<EnterpriseUserPermission> permissions) {
        EnterpriseSessionTokenClaims.identityId(enterpriseId, "enterpriseId");
        EnterpriseSessionTokenClaims.identityId(userId, "userId");
        List<String> required = EnterpriseSessionChallengeBinding.permissions(requiredPermissions);
        List<EnterpriseUserPermission> ordered = List.copyOf(
                Objects.requireNonNull(permissions, "permissions"))
                .stream()
                .sorted(Comparator.comparing(EnterpriseUserPermission::permission))
                .toList();
        if (ordered.isEmpty()
                || ordered.size() > 32
                || new HashSet<>(ordered.stream()
                                .map(EnterpriseUserPermission::permission)
                                .toList())
                        .size()
                        != ordered.size()
                || !SUPPORTED_PERMISSIONS.containsAll(
                        ordered.stream().map(EnterpriseUserPermission::permission).toList())
                || !required.equals(ordered.stream()
                        .map(EnterpriseUserPermission::permission)
                        .toList())) {
            throw new IllegalArgumentException(
                    "permission source facts must exactly cover the requested permission set");
        }
        ObjectNode material = JSON.createObjectNode();
        material.put("enterpriseId", enterpriseId);
        material.put("userId", userId);
        ArrayNode rows = JSON.createArrayNode();
        for (EnterpriseUserPermission permission : ordered) {
            if (!enterpriseId.equals(permission.enterpriseId())
                    || !userId.equals(permission.userId())) {
                throw new IllegalArgumentException("permission source owner differs");
            }
            requireUtcMillis(permission.updatedAt(), "permission.updatedAt");
            ObjectNode row = JSON.createObjectNode();
            row.put("permission", permission.permission());
            row.put("enabled", permission.enabled());
            row.put("sourceRevision", permission.revision());
            row.put("updatedAt", timestamp(permission.updatedAt()));
            rows.add(row);
        }
        material.set("permissions", rows);
        return EnterpriseSessionPersistenceDigests.wireDigest(
                PERMISSION_SOURCE_REVISION_DOMAIN, material);
    }

    public static String compatibilityRevision(long value) {
        return Long.toString(revision(value, "compatibilityRevision"));
    }

    public static String leaseRequestDigest(
            EnterpriseSessionLeaseRequestDigestMaterial value) {
        Objects.requireNonNull(value, "value");
        ObjectNode material = JSON.createObjectNode();
        material.put("schemaVersion", value.schemaVersion());
        material.put("claimsProfile", value.claimsProfile());
        material.put("challengeId", value.challengeId().toString());
        material.put("challengeBindingDigest", value.challengeBindingDigest());
        material.put("currentClientInstanceId", value.currentClientInstanceId().toString());
        material.put("audience", value.audience());
        ArrayNode required = JSON.createArrayNode();
        value.requiredPermissions().forEach(required::add);
        material.set("requiredPermissions", required);
        material.put("deviceKeyId", value.deviceKeyId());
        material.put("correlationId", value.correlationId().toString());
        return EnterpriseSessionPersistenceDigests.rawDigest(LEASE_REQUEST_DOMAIN, material);
    }

    public static String challengeBindingDigest(
            java.util.UUID verifiedIdentityId,
            java.util.UUID currentClientInstanceId,
            List<String> requiredPermissions,
            String deviceKeyId,
            java.util.UUID correlationId,
            java.util.UUID challengeId,
            String nonce,
            Instant issuedAt,
            Instant expiresAt) {
        Objects.requireNonNull(verifiedIdentityId, "verifiedIdentityId");
        Objects.requireNonNull(currentClientInstanceId, "currentClientInstanceId");
        List<String> permissions = EnterpriseSessionChallengeBinding.permissions(
                requiredPermissions);
        EnterpriseSessionChallengeBinding.boundedText(deviceKeyId, "deviceKeyId", 160);
        Objects.requireNonNull(correlationId, "correlationId");
        Objects.requireNonNull(challengeId, "challengeId");
        EnterpriseSessionChallengeBinding.boundedText(nonce, "nonce", 512);
        requireUtcMillis(issuedAt, "issuedAt");
        requireUtcMillis(expiresAt, "expiresAt");
        if (!issuedAt.isBefore(expiresAt)) {
            throw new IllegalArgumentException("challenge expiry must follow issuance");
        }
        ObjectNode material = JSON.createObjectNode();
        material.put("schemaVersion", EnterpriseSessionLeaseRequestDigestMaterial.SCHEMA_VERSION);
        material.put("claimsProfile", EnterpriseSessionChallengeBinding.CLAIMS_PROFILE);
        material.put("verifiedIdentityId", verifiedIdentityId.toString());
        material.put("currentClientInstanceId", currentClientInstanceId.toString());
        material.put("audience", EnterpriseSessionChallengeBinding.AUDIENCE);
        ArrayNode requested = JSON.createArrayNode();
        permissions.forEach(requested::add);
        material.set("requiredPermissions", requested);
        material.put("deviceKeyId", deviceKeyId);
        material.put("correlationId", correlationId.toString());
        material.put("challengeId", challengeId.toString());
        material.put("nonce", nonce);
        material.put("issuedAt", timestamp(issuedAt));
        material.put("expiresAt", timestamp(expiresAt));
        return EnterpriseSessionPersistenceDigests.rawDigest(
                CHALLENGE_BINDING_DOMAIN, material);
    }

    private static void requireUtcMillis(Instant value, String name) {
        Objects.requireNonNull(value, name);
        if (!value.equals(value.truncatedTo(ChronoUnit.MILLIS))) {
            throw new IllegalArgumentException(name + " must use UTC millisecond precision");
        }
    }
}
