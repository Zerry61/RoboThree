package com.robothree.central.modelgateway.adapter.runtime;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import com.robothree.central.shared.json.CanonicalJson;
import java.net.URI;

final class CustomRelayBindingSeed {

    static final String BINDING_ID = "binding.cgf2b3.custom-relay";
    static final String SEED_VERSION = "cgf-2b.3.1-v1";
    static final String MODEL_REVISION = "7".repeat(64);
    static final String CONFIGURATION_REVISION = "6".repeat(64);
    static final String REGISTRY_GENERATION = "5".repeat(64);
    static final String CREDENTIAL_REFERENCE = "credential.cgf2b3.custom-relay";
    static final String CREDENTIAL_REVISION = "4".repeat(64);
    static final String CAPABILITY_PROFILE_REVISION = "3".repeat(64);
    static final String TIMEOUT_PROFILE_REVISION = "2".repeat(64);

    private CustomRelayBindingSeed() {}

    static ModelEndpointBinding create(
            URI endpoint,
            Protocol protocol,
            String modelId,
            String upstreamModelId) {
        URI normalizedEndpoint = endpoint.normalize();
        String bindingRevision = CanonicalJson.sha256(bound(
                SEED_VERSION,
                BINDING_ID,
                protocol.name(),
                normalizedEndpoint.toString(),
                modelId,
                upstreamModelId,
                CREDENTIAL_REFERENCE,
                CREDENTIAL_REVISION));
        String bindingDigest = CanonicalJson.sha256(bound(
                bindingRevision,
                MODEL_REVISION,
                CONFIGURATION_REVISION,
                REGISTRY_GENERATION,
                CAPABILITY_PROFILE_REVISION,
                TIMEOUT_PROFILE_REVISION,
                RecoveryMode.MANUAL_RECONCILIATION.name()));
        return new ModelEndpointBinding(
                BINDING_ID,
                bindingRevision,
                bindingDigest,
                modelId,
                upstreamModelId,
                MODEL_REVISION,
                CONFIGURATION_REVISION,
                REGISTRY_GENERATION,
                ConnectionMode.CUSTOM_RELAY,
                protocol,
                normalizedEndpoint,
                CREDENTIAL_REFERENCE,
                CREDENTIAL_REVISION,
                CAPABILITY_PROFILE_REVISION,
                TIMEOUT_PROFILE_REVISION,
                RecoveryMode.MANUAL_RECONCILIATION);
    }

    private static String bound(String... values) {
        StringBuilder input = new StringBuilder();
        for (String value : values) {
            input.append(value.length())
                    .append(':')
                    .append(value)
                    .append('|');
        }
        return input.toString();
    }
}
