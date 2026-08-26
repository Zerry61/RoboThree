package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.domain.ProviderCacheProjection.MarkerTarget;
import com.robothree.central.modelgateway.domain.ProviderCacheProjection.RetentionPolicy;
import com.robothree.central.shared.json.CanonicalJson;
import java.util.List;
import java.util.Objects;

/** Immutable reviewed meaning of a markerPolicyRevision digest. */
public record PromptCacheMarkerPolicy(
        String policyId,
        String policyRevision,
        PromptCacheProfile.ProjectionMode projectionMode,
        MarkerTarget markerTarget,
        RetentionPolicy retentionPolicy,
        String protocolEvidenceRevision,
        List<String> supportedWireFields) {

    private static final ObjectMapper JSON = new ObjectMapper();

    public PromptCacheMarkerPolicy {
        policyId = text(policyId, "policyId");
        policyRevision = digest(policyRevision, "policyRevision");
        Objects.requireNonNull(projectionMode, "projectionMode");
        Objects.requireNonNull(markerTarget, "markerTarget");
        Objects.requireNonNull(retentionPolicy, "retentionPolicy");
        protocolEvidenceRevision = digest(
                protocolEvidenceRevision,
                "protocolEvidenceRevision");
        supportedWireFields = supportedWireFields == null
                ? List.of()
                : supportedWireFields.stream().map(value -> text(value, "wireField"))
                        .distinct().sorted().toList();
        String expected = computeRevision(
                policyId,
                projectionMode,
                markerTarget,
                retentionPolicy,
                protocolEvidenceRevision,
                supportedWireFields);
        if (!expected.equals(policyRevision)) {
            throw new IllegalArgumentException(
                    "policyRevision does not match marker policy facts");
        }
    }

    public static PromptCacheMarkerPolicy create(
            String policyId,
            PromptCacheProfile.ProjectionMode projectionMode,
            MarkerTarget markerTarget,
            RetentionPolicy retentionPolicy,
            String protocolEvidenceRevision,
            List<String> supportedWireFields) {
        return new PromptCacheMarkerPolicy(
                policyId,
                computeRevision(
                        policyId,
                        projectionMode,
                        markerTarget,
                        retentionPolicy,
                        protocolEvidenceRevision,
                        supportedWireFields),
                projectionMode,
                markerTarget,
                retentionPolicy,
                protocolEvidenceRevision,
                supportedWireFields);
    }

    private static String computeRevision(
            String policyId,
            PromptCacheProfile.ProjectionMode projectionMode,
            MarkerTarget markerTarget,
            RetentionPolicy retentionPolicy,
            String protocolEvidenceRevision,
            List<String> supportedWireFields) {
        ObjectNode value = JSON.createObjectNode();
        value.put("markerPolicySchemaVersion", "v1");
        value.put("policyId", policyId);
        value.put("projectionMode", projectionMode.contractValue());
        value.put("markerTarget", markerTarget.name().toLowerCase());
        value.put("retentionPolicy", retentionPolicy.name().toLowerCase());
        value.put("protocolEvidenceRevision", protocolEvidenceRevision);
        var fields = value.putArray("supportedWireFields");
        supportedWireFields.stream().distinct().sorted().forEach(fields::add);
        return CanonicalJson.sha256(CanonicalJson.canonicalize(value));
    }
}
