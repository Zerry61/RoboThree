package com.robothree.central.modelgateway.recovery;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import com.robothree.central.shared.json.CanonicalJson;
import java.net.URI;
import java.util.List;

final class Cgf2b32HarnessFacts {

    static final String ACCESS_TOKEN = "cgf2b32-harness-access";
    static final String ENTERPRISE_ID = "enterprise.cgf2b32";
    static final String USER_ID = "user.cgf2b32";
    static final String DEVICE_ID = "device.cgf2b32";
    static final String CLIENT_INSTANCE_ID = "client.cgf2b32";
    static final String MODEL_ID = "model.cgf2b32.synthetic";
    static final String CREDENTIAL_REFERENCE = "credential.cgf2b32.relay";
    static final String MODEL_REVISION_V1 = "a".repeat(64);
    static final String MODEL_REVISION_V2 = "b".repeat(64);
    static final String CONFIGURATION_REVISION_V1 = "c".repeat(64);
    static final String CONFIGURATION_REVISION_V2 = "d".repeat(64);
    static final String REGISTRY_GENERATION_V1 = "e".repeat(64);
    static final String REGISTRY_GENERATION_V2 = "f".repeat(64);
    static final String CREDENTIAL_REVISION = "1".repeat(64);
    static final String CAPABILITY_PROFILE_REVISION = "2".repeat(64);
    static final String TIMEOUT_PROFILE_REVISION = "3".repeat(64);
    static final String ADMISSION_DIGEST = "4".repeat(64);
    static final String POLICY_REVISION = "5".repeat(64);

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String CONTEXT_SOURCE_DIGEST = "6".repeat(64);
    private static final String FIXED_PROMPT =
            "Return the fixed synthetic relay recovery acknowledgement.";

    private Cgf2b32HarnessFacts() {}

    static List<ModelEndpointBinding> bindings(
            URI endpoint,
            BindingMode mode) {
        ModelEndpointBinding v2 = binding(endpoint, BindingVersion.V2, false);
        return switch (mode) {
            case ALL -> List.of(binding(endpoint, BindingVersion.V1, false), v2);
            case MISSING_V1 -> List.of(v2);
            case DRIFT_V1 -> List.of(binding(endpoint, BindingVersion.V1, true), v2);
        };
    }

    static ModelEndpointBinding binding(
            URI endpoint,
            BindingVersion version) {
        return binding(endpoint, version, false);
    }

    static String request(BindingVersion version, String runCanary) {
        if (runCanary == null
                || !runCanary.matches("^robothree-cgf2b32-[0-9a-f-]{36}$")) {
            throw new IllegalArgumentException("CGF-2B.3.2 run canary is invalid");
        }
        ObjectNode root = JSON.createObjectNode();
        root.put("snapshotId", version == BindingVersion.V1
                ? "11111111-1111-4111-8111-111111111111"
                : "22222222-2222-4222-8222-222222222222");
        root.put("contextSourceDigest", CONTEXT_SOURCE_DIGEST);
        ObjectNode model = root.putObject("model");
        model.put("modelId", MODEL_ID);
        model.put("modelRevision", modelRevision(version));
        model.put("configurationRevision", configurationRevision(version));
        model.put("runtimeRegistryGeneration", registryGeneration(version));
        ObjectNode message = root.putArray("messages").addObject();
        message.put("role", "user");
        message.putArray("content")
                .addObject()
                .put("type", "text")
                .put("text", FIXED_PROMPT + " " + runCanary);
        root.putArray("tools");
        root.put("maxOutputTokens", 64);
        return CanonicalJson.canonicalize(root);
    }

    static String requestDigest(BindingVersion version, String runCanary) {
        return CanonicalJson.sha256(request(version, runCanary));
    }

    static String modelRevision(BindingVersion version) {
        return version == BindingVersion.V1
                ? MODEL_REVISION_V1
                : MODEL_REVISION_V2;
    }

    static String configurationRevision(BindingVersion version) {
        return version == BindingVersion.V1
                ? CONFIGURATION_REVISION_V1
                : CONFIGURATION_REVISION_V2;
    }

    static String registryGeneration(BindingVersion version) {
        return version == BindingVersion.V1
                ? REGISTRY_GENERATION_V1
                : REGISTRY_GENERATION_V2;
    }

    private static ModelEndpointBinding binding(
            URI endpoint,
            BindingVersion version,
            boolean drifted) {
        Protocol protocol = version == BindingVersion.V1
                ? Protocol.OPENAI_COMPATIBLE
                : Protocol.ANTHROPIC_COMPATIBLE;
        String upstreamModelId = version == BindingVersion.V1
                ? "relay.synthetic.v1"
                : "relay.synthetic.v2";
        String seed = version.name() + (drifted ? "-drift" : "-sealed");
        String bindingRevision = CanonicalJson.sha256(bound(
                "cgf-2b.3.2-v1",
                seed,
                endpoint.normalize().toString(),
                protocol.name(),
                MODEL_ID,
                upstreamModelId,
                CREDENTIAL_REFERENCE,
                CREDENTIAL_REVISION));
        String bindingDigest = CanonicalJson.sha256(bound(
                bindingRevision,
                modelRevision(version),
                configurationRevision(version),
                registryGeneration(version),
                CAPABILITY_PROFILE_REVISION,
                TIMEOUT_PROFILE_REVISION,
                RecoveryMode.MANUAL_RECONCILIATION.name()));
        return new ModelEndpointBinding(
                "binding.cgf2b32." + version.name().toLowerCase(),
                bindingRevision,
                bindingDigest,
                MODEL_ID,
                upstreamModelId,
                modelRevision(version),
                configurationRevision(version),
                registryGeneration(version),
                ConnectionMode.CUSTOM_RELAY,
                protocol,
                endpoint.normalize(),
                CREDENTIAL_REFERENCE,
                CREDENTIAL_REVISION,
                CAPABILITY_PROFILE_REVISION,
                TIMEOUT_PROFILE_REVISION,
                RecoveryMode.MANUAL_RECONCILIATION);
    }

    private static String bound(String... values) {
        StringBuilder input = new StringBuilder();
        for (String value : values) {
            input.append(value.length()).append(':').append(value).append('|');
        }
        return input.toString();
    }

    enum BindingVersion {
        V1,
        V2
    }

    enum BindingMode {
        ALL,
        MISSING_V1,
        DRIFT_V1
    }

    record RunIdentity(String canary) {

        RunIdentity {
            if (canary == null
                    || !canary.matches("^robothree-cgf2b32-[0-9a-f-]{36}$")) {
                throw new IllegalArgumentException("CGF-2B.3.2 run canary is invalid");
            }
        }
    }
}
