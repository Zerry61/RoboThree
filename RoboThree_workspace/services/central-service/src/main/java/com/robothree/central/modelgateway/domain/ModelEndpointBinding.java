package com.robothree.central.modelgateway.domain;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

import java.net.URI;
import java.util.Objects;

public record ModelEndpointBinding(
        String bindingId,
        String bindingRevision,
        String bindingDigest,
        String modelId,
        String upstreamModelId,
        String modelRevision,
        String configurationRevision,
        String runtimeRegistryGeneration,
        ConnectionMode connectionMode,
        Protocol protocol,
        URI endpoint,
        String credentialReference,
        String credentialRevision,
        String capabilityProfileRevision,
        String timeoutProfileRevision,
        RecoveryMode recoveryMode) {

    public ModelEndpointBinding {
        bindingId = text(bindingId, "bindingId");
        bindingRevision = digest(bindingRevision, "bindingRevision");
        bindingDigest = digest(bindingDigest, "bindingDigest");
        modelId = text(modelId, "modelId");
        upstreamModelId = text(upstreamModelId, "upstreamModelId");
        modelRevision = digest(modelRevision, "modelRevision");
        configurationRevision = digest(configurationRevision, "configurationRevision");
        runtimeRegistryGeneration =
                digest(runtimeRegistryGeneration, "runtimeRegistryGeneration");
        Objects.requireNonNull(connectionMode, "connectionMode");
        Objects.requireNonNull(protocol, "protocol");
        Objects.requireNonNull(endpoint, "endpoint");
        credentialReference = text(credentialReference, "credentialReference");
        credentialRevision = digest(credentialRevision, "credentialRevision");
        capabilityProfileRevision =
                digest(capabilityProfileRevision, "capabilityProfileRevision");
        timeoutProfileRevision = digest(timeoutProfileRevision, "timeoutProfileRevision");
        Objects.requireNonNull(recoveryMode, "recoveryMode");
    }

    public Selection selection() {
        return new Selection(
                modelId,
                modelRevision,
                configurationRevision,
                runtimeRegistryGeneration);
    }

    public Reference reference() {
        return new Reference(bindingId, bindingRevision, bindingDigest);
    }

    public enum ConnectionMode {
        DIRECT_PROVIDER,
        CUSTOM_RELAY
    }

    public enum Protocol {
        ANTHROPIC_COMPATIBLE,
        OPENAI_COMPATIBLE
    }

    public enum RecoveryMode {
        IDEMPOTENT_RETRY,
        QUERY_THEN_RETRY,
        MANUAL_RECONCILIATION
    }

    public record Selection(
            String modelId,
            String modelRevision,
            String configurationRevision,
            String runtimeRegistryGeneration) {

        public Selection {
            modelId = text(modelId, "modelId");
            modelRevision = digest(modelRevision, "modelRevision");
            configurationRevision = digest(configurationRevision, "configurationRevision");
            runtimeRegistryGeneration =
                    digest(runtimeRegistryGeneration, "runtimeRegistryGeneration");
        }
    }

    public record Reference(
            String bindingId,
            String bindingRevision,
            String bindingDigest) {

        public Reference {
            bindingId = text(bindingId, "bindingId");
            bindingRevision = digest(bindingRevision, "bindingRevision");
            bindingDigest = digest(bindingDigest, "bindingDigest");
        }
    }
}
