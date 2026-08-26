package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import com.robothree.central.shared.json.CanonicalJson;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/** Immutable, versioned Central seed that explicitly permits a cache projection mode. */
public record PromptCacheProfile(
        String profileId,
        String profileRevision,
        String profileDigest,
        Status status,
        ModelEndpointBinding.Protocol protocol,
        List<ModelEndpointBinding.ConnectionMode> connectionModes,
        ProjectionMode providerProjectionMode,
        String routeFamily,
        Assurance isolationAssurance,
        Assurance retentionAssurance,
        String markerPolicyRevision,
        Integer maxCacheKeyBytes) {

    private static final ObjectMapper JSON = new ObjectMapper();

    public PromptCacheProfile {
        profileId = text(profileId, "profileId");
        profileRevision = digest(profileRevision, "profileRevision");
        profileDigest = digest(profileDigest, "profileDigest");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(protocol, "protocol");
        connectionModes = connectionModes == null ? List.of() : connectionModes.stream()
                .distinct()
                .sorted(Comparator.comparing(Enum::name))
                .toList();
        if (connectionModes.isEmpty()) {
            throw new IllegalArgumentException("connectionModes must not be empty");
        }
        Objects.requireNonNull(providerProjectionMode, "providerProjectionMode");
        routeFamily = text(routeFamily, "routeFamily");
        Objects.requireNonNull(isolationAssurance, "isolationAssurance");
        Objects.requireNonNull(retentionAssurance, "retentionAssurance");
        markerPolicyRevision = digest(markerPolicyRevision, "markerPolicyRevision");
        if (maxCacheKeyBytes != null && (maxCacheKeyBytes < 32 || maxCacheKeyBytes > 4096)) {
            throw new IllegalArgumentException("maxCacheKeyBytes is outside its limit");
        }
        String expected = computeDigest(
                profileId,
                profileRevision,
                status,
                protocol,
                connectionModes,
                providerProjectionMode,
                routeFamily,
                isolationAssurance,
                retentionAssurance,
                markerPolicyRevision,
                maxCacheKeyBytes);
        if (!expected.equals(profileDigest)) {
            throw new IllegalArgumentException("profileDigest does not match profile facts");
        }
    }

    public static PromptCacheProfile create(
            String profileId,
            String profileRevision,
            Status status,
            ModelEndpointBinding.Protocol protocol,
            List<ModelEndpointBinding.ConnectionMode> connectionModes,
            ProjectionMode providerProjectionMode,
            String routeFamily,
            Assurance isolationAssurance,
            Assurance retentionAssurance,
            String markerPolicyRevision,
            Integer maxCacheKeyBytes) {
        return new PromptCacheProfile(
                profileId,
                profileRevision,
                computeDigest(
                        profileId,
                        profileRevision,
                        status,
                        protocol,
                        connectionModes,
                        providerProjectionMode,
                        routeFamily,
                        isolationAssurance,
                        retentionAssurance,
                        markerPolicyRevision,
                        maxCacheKeyBytes),
                status,
                protocol,
                connectionModes,
                providerProjectionMode,
                routeFamily,
                isolationAssurance,
                retentionAssurance,
                markerPolicyRevision,
                maxCacheKeyBytes);
    }

    public boolean supports(ModelEndpointBinding binding) {
        return protocol == binding.protocol()
                && connectionModes.contains(binding.connectionMode())
                && profileRevision.equals(binding.capabilityProfileRevision());
    }

    private static String computeDigest(
            String profileId,
            String profileRevision,
            Status status,
            ModelEndpointBinding.Protocol protocol,
            List<ModelEndpointBinding.ConnectionMode> connectionModes,
            ProjectionMode providerProjectionMode,
            String routeFamily,
            Assurance isolationAssurance,
            Assurance retentionAssurance,
            String markerPolicyRevision,
            Integer maxCacheKeyBytes) {
        ObjectNode value = JSON.createObjectNode();
        ArrayNode modes = value.putArray("connectionModes");
        connectionModes.stream().map(Enum::name).sorted()
                .map(String::toLowerCase)
                .forEach(modes::add);
        value.put("isolationAssurance", isolationAssurance.contractValue);
        value.put("markerPolicyRevision", markerPolicyRevision);
        if (maxCacheKeyBytes == null) value.putNull("maxCacheKeyBytes");
        else value.put("maxCacheKeyBytes", maxCacheKeyBytes);
        value.put("profileId", profileId);
        value.put("profileRevision", profileRevision);
        value.put("projectionMode", providerProjectionMode.contractValue);
        value.put("protocol", protocol.name().toLowerCase());
        value.put("retentionAssurance", retentionAssurance.contractValue);
        value.put("routeFamily", routeFamily);
        value.put("status", status.contractValue);
        return CanonicalJson.sha256(CanonicalJson.canonicalize(value));
    }

    public enum Status {
        ACTIVE("active"), RETIRED("retired"), DISABLED("disabled");
        private final String contractValue;
        Status(String value) { this.contractValue = value; }
        public String contractValue() { return contractValue; }
    }

    public enum ProjectionMode {
        ANTHROPIC_EXPLICIT("anthropic_explicit"),
        OPENAI_PROVIDER_AUTOMATIC_OBSERVED("openai_provider_automatic_observed"),
        OPENAI_PROMPT_CACHE_KEY("openai_prompt_cache_key");
        private final String contractValue;
        ProjectionMode(String value) { this.contractValue = value; }
        public String contractValue() { return contractValue; }
        public boolean supportsExplicitKey() { return this == OPENAI_PROMPT_CACHE_KEY; }
        public static ProjectionMode fromContractValue(String value) {
            for (ProjectionMode candidate : values()) {
                if (candidate.contractValue.equals(value)) return candidate;
            }
            throw new IllegalArgumentException("unknown prompt cache projection mode");
        }
    }

    public enum Assurance {
        PROVEN("proven"), UNPROVEN("unproven"), PROVIDER_DOCUMENTED("provider_documented");
        private final String contractValue;
        Assurance(String value) { this.contractValue = value; }
        public String contractValue() { return contractValue; }
    }
}
