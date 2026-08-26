package com.robothree.central.authentication.domain;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class EnterpriseSessionPersistenceDigests {

    public static final String CHALLENGE_RECORD_DOMAIN =
            "robothree.enterprise-session.persistence.challenge-record.v1";
    public static final String LEASE_RECORD_DOMAIN =
            "robothree.enterprise-session.persistence.lease-record.v1";
    public static final String ASSERTION_REVISION_DOMAIN =
            "robothree.enterprise-session.assertion-revision.v1";
    public static final String ASSERTION_DOMAIN =
            "robothree.enterprise-session.assertion.v1";
    public static final String DEVICE_TRUST_REVISION_DOMAIN =
            "robothree.enterprise-session.device-trust-revision.v1";
    public static final String DEVICE_TRUST_DOMAIN =
            "robothree.enterprise-session.device-trust.v1";
    public static final String SOURCE_DECISION_DOMAIN =
            "robothree.enterprise-session.source-decision.v1";

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter TIMESTAMP =
            DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'")
                    .withZone(ZoneOffset.UTC);

    private EnterpriseSessionPersistenceDigests() {}

    public static String challengeRecordDigest(EnterpriseSessionChallengeBinding value) {
        ObjectNode material = JSON.createObjectNode();
        material.put("challengeId", value.challengeId().toString());
        material.put("verifiedIdentityId", value.verifiedIdentityId().toString());
        material.put("claimsProfile", value.claimsProfile());
        material.put("identitySourceRevision", value.identitySourceRevision());
        material.put("currentClientInstanceId", value.currentClientInstanceId().toString());
        material.put("audience", value.audience());
        material.set("requiredPermissions", strings(value.requiredPermissions()));
        material.put("deviceKeyId", value.deviceKeyId());
        material.put("correlationId", value.correlationId().toString());
        material.put("challengeBindingDigest", value.challengeBindingDigest());
        material.put("createdAt", timestamp(value.createdAt()));
        return rawDigest(CHALLENGE_RECORD_DOMAIN, material);
    }

    public static String leaseRecordDigest(EnterpriseSessionLeaseIssuance value) {
        ObjectNode material = JSON.createObjectNode();
        material.put("tokenId", value.tokenId().toString());
        material.put("tokenDigest", value.tokenDigest());
        material.put("claimsProfile", value.claimsProfile());
        material.put("issuer", value.issuer());
        material.put("audience", value.audience());
        material.put("enterpriseId", value.enterpriseId());
        material.put("userId", value.userId());
        material.put("deviceId", value.deviceId());
        material.put("verifiedIdentityId", value.verifiedIdentityId().toString());
        material.put("identitySourceRevision", value.identitySourceRevision());
        material.put("clientInstanceId", value.clientInstanceId().toString());
        material.set("permissions", strings(value.permissions()));
        material.put("identityDigest", value.identityDigest());
        material.put("deviceSourceRevision", value.deviceSourceRevision());
        material.put("deviceRevisionDigest", value.deviceRevisionDigest());
        material.put("permissionRevisionDigest", value.permissionRevisionDigest());
        material.put("compatibilityRevision", value.compatibilityRevision());
        material.put("trustSource", value.trustSource());
        material.put("managedStatus", value.managedStatus());
        material.put("complianceStatus", value.complianceStatus());
        material.put("issuedAt", timestamp(value.issuedAt()));
        material.put("expiresAt", timestamp(value.expiresAt()));
        material.put("trustEvaluatedAt", timestamp(value.trustEvaluatedAt()));
        material.put("challengeId", value.challengeId().toString());
        material.put("challengeBindingDigest", value.challengeBindingDigest());
        material.put("sessionAssertionRevision", value.sessionAssertionRevision());
        material.put("sessionAssertionDigest", value.sessionAssertionDigest());
        material.set("sessionAssertion", parseCanonicalObject(value.sessionAssertionJson()));
        material.put("deviceTrustDecisionRevision", value.deviceTrustDecisionRevision());
        material.put("deviceTrustDecisionDigest", value.deviceTrustDecisionDigest());
        material.set("deviceTrustDecision", parseCanonicalObject(value.deviceTrustDecisionJson()));
        material.put("sourceDecisionDigest", value.sourceDecisionDigest());
        material.put("requestDigest", value.requestDigest());
        return rawDigest(LEASE_RECORD_DOMAIN, material);
    }

    public static String assertionRevisionDigest(EnterpriseSessionLeaseIssuance value) {
        ObjectNode material = JSON.createObjectNode();
        material.put("claimsProfile", value.claimsProfile());
        material.put("audience", value.audience());
        material.set("scope", scope(value));
        material.set("permissions", strings(value.permissions()));
        material.put("identityDigest", wire(value.identityDigest()));
        material.put("deviceRevision", value.deviceRevisionDigest());
        material.put("permissionRevision", value.permissionRevisionDigest());
        material.put("compatibilityRevision", value.compatibilityRevision());
        return wireDigest(ASSERTION_REVISION_DOMAIN, material);
    }

    public static String deviceTrustRevisionDigest(EnterpriseSessionLeaseIssuance value) {
        ObjectNode material = JSON.createObjectNode();
        material.set("ownerIdentity", owner(value));
        material.put("deviceRevision", value.deviceRevisionDigest());
        material.put("trustSource", value.trustSource());
        material.put("managedStatus", value.managedStatus());
        material.put("complianceStatus", value.complianceStatus());
        return wireDigest(DEVICE_TRUST_REVISION_DOMAIN, material);
    }

    public static String sourceDecisionDigest(EnterpriseSessionLeaseIssuance value) {
        ObjectNode material = JSON.createObjectNode();
        material.put("claimsProfile", value.claimsProfile());
        material.put("sessionAssertionDigest", value.sessionAssertionDigest());
        material.put("deviceTrustDecisionDigest", value.deviceTrustDecisionDigest());
        material.put("compatibilityRevision", value.compatibilityRevision());
        material.put("currentClientInstanceId", value.clientInstanceId().toString());
        material.set("requiredPermissions", strings(value.permissions()));
        material.put("issuedAt", timestamp(value.issuedAt()));
        material.put("expiresAt", timestamp(value.expiresAt()));
        return wireDigest(SOURCE_DECISION_DOMAIN, material);
    }

    public static String digestDocument(String domain, ObjectNode document, String digestField) {
        ObjectNode material = document.deepCopy();
        material.remove(digestField);
        return wireDigest(domain, material);
    }

    public static ObjectNode parseCanonicalObject(String raw) {
        try {
            JsonNode parsed = JSON.readTree(raw);
            if (!(parsed instanceof ObjectNode object)) {
                throw new IllegalArgumentException("document must be a JSON object");
            }
            if (!canonicalize(object).equals(raw)) {
                throw new IllegalArgumentException("document must use canonical JSON bytes");
            }
            return object;
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("document is invalid JSON", exception);
        }
    }

    public static String canonicalize(JsonNode value) {
        try {
            return JSON.writeValueAsString(normalizeAndSort(value));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("canonical JSON serialization failed", exception);
        }
    }

    public static String timestamp(Instant value) {
        return TIMESTAMP.format(value);
    }

    private static ObjectNode scope(EnterpriseSessionLeaseIssuance value) {
        ObjectNode scope = JSON.createObjectNode();
        scope.put("enterpriseId", value.enterpriseId());
        scope.put("userId", value.userId());
        scope.put("deviceId", value.deviceId());
        scope.put("clientInstanceId", value.clientInstanceId().toString());
        return scope;
    }

    private static ObjectNode owner(EnterpriseSessionLeaseIssuance value) {
        ObjectNode owner = JSON.createObjectNode();
        owner.put("enterpriseId", value.enterpriseId());
        owner.put("userId", value.userId());
        owner.put("deviceId", value.deviceId());
        return owner;
    }

    private static ArrayNode strings(List<String> values) {
        ArrayNode array = JSON.createArrayNode();
        values.forEach(array::add);
        return array;
    }

    private static String wire(String rawDigest) {
        return "sha256:" + rawDigest;
    }

    public static String rawDigest(String domain, JsonNode material) {
        return sha256(domain + "\n" + canonicalize(material));
    }

    public static String wireDigest(String domain, JsonNode material) {
        return wire(rawDigest(domain, material));
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static JsonNode normalizeAndSort(JsonNode value) {
        if (value.isTextual()) {
            return JSON.getNodeFactory().textNode(
                    Normalizer.normalize(value.textValue(), Normalizer.Form.NFC));
        }
        if (value.isArray()) {
            ArrayNode array = JSON.createArrayNode();
            value.forEach(item -> array.add(normalizeAndSort(item)));
            return array;
        }
        if (value.isObject()) {
            Map<String, JsonNode> normalized = new LinkedHashMap<>();
            value.properties().forEach(entry -> {
                String key = Normalizer.normalize(entry.getKey(), Normalizer.Form.NFC);
                if (normalized.putIfAbsent(key, normalizeAndSort(entry.getValue())) != null) {
                    throw new IllegalArgumentException(
                            "canonical JSON contains duplicate keys after NFC normalization");
                }
            });
            ObjectNode object = JSON.createObjectNode();
            new ArrayList<>(normalized.entrySet()).stream()
                    .sorted(Comparator.comparing(Map.Entry::getKey))
                    .forEach(entry -> object.set(entry.getKey(), entry.getValue()));
            return object;
        }
        return value.deepCopy();
    }
}
