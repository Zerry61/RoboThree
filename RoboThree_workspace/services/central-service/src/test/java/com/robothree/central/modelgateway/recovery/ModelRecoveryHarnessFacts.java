package com.robothree.central.modelgateway.recovery;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import java.net.URI;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.json.CanonicalJson;

final class ModelRecoveryHarnessFacts {

    static final String ACCESS_TOKEN = "model-recovery-harness-access";
    static final String ENTERPRISE_ID = "enterprise.model-recovery";
    static final String USER_ID = "user.model-recovery";
    static final String DEVICE_ID = "device.model-recovery";
    static final String CLIENT_INSTANCE_ID = "client.model-recovery";
    static final String MODEL_ID = "model.recovery-fixture";
    static final String CREDENTIAL_REFERENCE = "credential.model-recovery";

    static final String MODEL_REVISION = "a".repeat(64);
    static final String BINDING_REVISION = "b".repeat(64);
    static final String BINDING_DIGEST = "c".repeat(64);
    static final String CONFIGURATION_REVISION = "d".repeat(64);
    static final String REGISTRY_GENERATION = "e".repeat(64);
    static final String CREDENTIAL_REVISION = "f".repeat(64);
    static final String CAPABILITY_PROFILE_REVISION = "1".repeat(64);
    static final String TIMEOUT_PROFILE_REVISION = "2".repeat(64);
    static final String ADMISSION_DIGEST = "3".repeat(64);
    static final String MARKER_POLICY_REVISION = "4".repeat(64);
    static final String SESSION_SCOPE_DIGEST = "5".repeat(64);
    static final String CACHE_CONTEXT_DIGEST = "6".repeat(64);

    private ModelRecoveryHarnessFacts() {}

    static ModelEndpointBinding binding() {
        return new ModelEndpointBinding(
                "binding.model-recovery",
                BINDING_REVISION,
                BINDING_DIGEST,
                MODEL_ID,
                MODEL_ID,
                MODEL_REVISION,
                CONFIGURATION_REVISION,
                REGISTRY_GENERATION,
                ConnectionMode.CUSTOM_RELAY,
                Protocol.ANTHROPIC_COMPATIBLE,
                URI.create("https://model-recovery.invalid/anthropic"),
                CREDENTIAL_REFERENCE,
                CREDENTIAL_REVISION,
                CAPABILITY_PROFILE_REVISION,
                TIMEOUT_PROFILE_REVISION,
                RecoveryMode.QUERY_THEN_RETRY);
    }

    static String providerRequest() {
        ObjectMapper json = new ObjectMapper();
        ObjectNode request = json.createObjectNode();
        request.put("snapshotId", "00000000-0000-4000-8000-000000000001");
        request.put("contextSourceDigest", "7".repeat(64));
        request.putObject("model")
                .put("modelId", MODEL_ID)
                .put("modelRevision", MODEL_REVISION)
                .put("configurationRevision", CONFIGURATION_REVISION)
                .put("runtimeRegistryGeneration", REGISTRY_GENERATION);
        ObjectNode system = request.putArray("messages").addObject()
                .put("role", "system")
                .put("sourceId", "platform.model-recovery")
                .put("sourceRevision", "8".repeat(64))
                .put("sourceDigest", "9".repeat(64));
        ArrayNode content = system.putArray("content");
        content.addObject()
                .put("type", "text")
                .put("text", "Synthetic model recovery instruction.");
        request.putArray("tools");
        request.put("maxOutputTokens", 64);
        return CanonicalJson.canonicalize(request);
    }
}
