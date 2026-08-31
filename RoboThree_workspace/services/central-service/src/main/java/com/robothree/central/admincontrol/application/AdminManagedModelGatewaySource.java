package com.robothree.central.admincontrol.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.domain.AdminManagedModel;
import com.robothree.central.modelgateway.application.ModelDispatchDecision;
import com.robothree.central.modelgateway.application.ModelGatewayException;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.CredentialResolution;
import com.robothree.central.modelgateway.port.ModelBindingRuntimeStateProvider;
import com.robothree.central.modelgateway.port.ModelCredentialResolver;
import com.robothree.central.modelgateway.port.ModelEndpointBindingResolver;
import com.robothree.central.shared.json.CanonicalJson;
import java.net.URI;
import java.time.Clock;
import java.util.Set;

/**
 * Narrow internal-trial bridge from immutable Admin model revisions to the
 * existing Gateway ports. New selections require the current revision to be
 * enabled; recovery resolves the persisted exact binding and does not re-read
 * the mutable head.
 */
public final class AdminManagedModelGatewaySource implements
        ModelEndpointBindingResolver,
        ModelBindingRuntimeStateProvider,
        ModelCredentialResolver {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String CAPABILITY_PROFILE_REVISION = CanonicalJson.sha256(
            "robothree.admin-model.openai-compatible.capability-profile.v1");
    private static final String TIMEOUT_PROFILE_REVISION = CanonicalJson.sha256(
            "robothree.admin-model.openai-compatible.timeout-profile.v1");
    private static final Set<String> BINDING_FIELDS = Set.of(
            "bindingId", "bindingRevision", "bindingDigest", "modelId",
            "upstreamModelId", "modelRevision", "configurationRevision",
            "runtimeRegistryGeneration", "endpoint", "credentialReference",
            "credentialRevision", "capabilityProfileRevision", "timeoutProfileRevision");

    private final AdminModelStore store;
    private final Clock clock;

    public AdminManagedModelGatewaySource(
            AdminModelStore store,
            Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    @Override
    public ModelEndpointBinding resolveForSelection(ModelEndpointBinding.Selection selection) {
        AdminManagedModel model = store.findCurrent(selection.modelId())
                .orElseThrow(AdminManagedModelGatewaySource::bindingUnavailable);
        if (!model.lifecycle().equals("enabled")
                || !stripWireDigest(model.modelRevision()).equals(selection.configurationRevision())
                || !model.credentialConfigured()) {
            throw bindingUnavailable();
        }
        ModelEndpointBinding binding = binding(selection, model);
        String decisionDigest = ModelDispatchDecision.fromBinding(binding).decisionDigest();
        ObjectNode document = document(binding);
        String bindingJson = CanonicalJson.canonicalize(document);
        AdminModelStore.GatewayBinding record = new AdminModelStore.GatewayBinding(
                decisionDigest,
                binding.bindingRevision(),
                binding.bindingDigest(),
                bindingJson,
                clock.instant());
        if (store.insertGatewayBinding(record) == 0) {
            AdminModelStore.GatewayBinding existing = store.findGatewayBinding(decisionDigest)
                    .orElseThrow(AdminManagedModelGatewaySource::bindingUnavailable);
            if (!existing.bindingJson().equals(bindingJson)) {
                throw ModelGatewayException.conflict(
                        "model_gateway.binding_revision_conflict",
                        "The exact model binding conflicts with its durable record.");
            }
        }
        return binding;
    }

    @Override
    public ModelEndpointBinding resolveDispatchDecision(String decisionDigest) {
        if (decisionDigest == null || !decisionDigest.matches("^[a-f0-9]{64}$")) {
            throw bindingUnavailable();
        }
        AdminModelStore.GatewayBinding record = store.findGatewayBinding(decisionDigest)
                .orElseThrow(AdminManagedModelGatewaySource::bindingUnavailable);
        ModelEndpointBinding binding = parse(record.bindingJson());
        if (!record.bindingRevision().equals(binding.bindingRevision())
                || !record.bindingDigest().equals(binding.bindingDigest())
                || !decisionDigest.equals(
                        ModelDispatchDecision.fromBinding(binding).decisionDigest())) {
            throw bindingUnavailable();
        }
        return binding;
    }

    @Override
    public RuntimeState resolve(ModelEndpointBinding.Reference reference) {
        AdminModelStore.GatewayBinding binding = store.findGatewayBindingByReference(
                        reference.bindingRevision(), reference.bindingDigest())
                .orElseThrow(AdminManagedModelGatewaySource::bindingUnavailable);
        if (!parse(binding.bindingJson()).reference().equals(reference)) {
            throw bindingUnavailable();
        }
        // A binding is immutable once accepted. Disabling a model only prevents
        // future selections and never rewrites an already accepted Task lock.
        return new RuntimeState(true, false, true);
    }

    @Override
    public CredentialResolution resolve(
            String credentialReference,
            String expectedCredentialRevision) {
        String wireRevision = wireDigest(expectedCredentialRevision);
        if (store.findCredential(credentialReference, wireRevision).isEmpty()) {
            throw credentialUnavailable();
        }
        return new CredentialResolution(credentialReference, expectedCredentialRevision);
    }

    private static ModelEndpointBinding binding(
            ModelEndpointBinding.Selection selection,
            AdminManagedModel model) {
        ObjectNode material = JSON.createObjectNode();
        material.put("domain", "robothree.admin-model.gateway-binding.v1");
        material.put("modelId", selection.modelId());
        material.put("modelRevision", selection.modelRevision());
        material.put("configurationRevision", selection.configurationRevision());
        material.put("runtimeRegistryGeneration", selection.runtimeRegistryGeneration());
        material.put("endpoint", model.endpoint());
        material.put("upstreamModelId", model.providerModelId());
        material.put("credentialReference", model.credentialReference());
        material.put("credentialRevision", stripWireDigest(model.credentialRevision()));
        String canonical = CanonicalJson.canonicalize(material);
        String bindingRevision = CanonicalJson.sha256("revision\n" + canonical);
        String bindingDigest = CanonicalJson.sha256("digest\n" + canonical);
        return new ModelEndpointBinding(
                "binding.admin-model:" + selection.modelId(),
                bindingRevision,
                bindingDigest,
                selection.modelId(),
                model.providerModelId(),
                selection.modelRevision(),
                selection.configurationRevision(),
                selection.runtimeRegistryGeneration(),
                ConnectionMode.DIRECT_PROVIDER,
                Protocol.OPENAI_COMPATIBLE,
                URI.create(model.endpoint()).normalize(),
                model.credentialReference(),
                stripWireDigest(model.credentialRevision()),
                CAPABILITY_PROFILE_REVISION,
                TIMEOUT_PROFILE_REVISION,
                RecoveryMode.MANUAL_RECONCILIATION);
    }

    private static ObjectNode document(ModelEndpointBinding binding) {
        ObjectNode value = JSON.createObjectNode();
        value.put("bindingId", binding.bindingId());
        value.put("bindingRevision", binding.bindingRevision());
        value.put("bindingDigest", binding.bindingDigest());
        value.put("modelId", binding.modelId());
        value.put("upstreamModelId", binding.upstreamModelId());
        value.put("modelRevision", binding.modelRevision());
        value.put("configurationRevision", binding.configurationRevision());
        value.put("runtimeRegistryGeneration", binding.runtimeRegistryGeneration());
        value.put("endpoint", binding.endpoint().toString());
        value.put("credentialReference", binding.credentialReference());
        value.put("credentialRevision", binding.credentialRevision());
        value.put("capabilityProfileRevision", binding.capabilityProfileRevision());
        value.put("timeoutProfileRevision", binding.timeoutProfileRevision());
        return value;
    }

    private static ModelEndpointBinding parse(String json) {
        ObjectNode value = CanonicalJson.parseObject(json, 32_768);
        if (!BINDING_FIELDS.equals(java.util.stream.StreamSupport.stream(
                        ((Iterable<String>) value::fieldNames).spliterator(), false)
                .collect(java.util.stream.Collectors.toUnmodifiableSet()))) {
            throw bindingUnavailable();
        }
        return new ModelEndpointBinding(
                text(value, "bindingId"),
                text(value, "bindingRevision"),
                text(value, "bindingDigest"),
                text(value, "modelId"),
                text(value, "upstreamModelId"),
                text(value, "modelRevision"),
                text(value, "configurationRevision"),
                text(value, "runtimeRegistryGeneration"),
                ConnectionMode.DIRECT_PROVIDER,
                Protocol.OPENAI_COMPATIBLE,
                URI.create(text(value, "endpoint")).normalize(),
                text(value, "credentialReference"),
                text(value, "credentialRevision"),
                text(value, "capabilityProfileRevision"),
                text(value, "timeoutProfileRevision"),
                RecoveryMode.MANUAL_RECONCILIATION);
    }

    private static String text(ObjectNode value, String field) {
        JsonNode node = value.get(field);
        if (node == null || !node.isTextual() || node.textValue().isBlank()) {
            throw bindingUnavailable();
        }
        return node.textValue();
    }

    private static String stripWireDigest(String value) {
        if (value == null || !value.matches("^sha256:[a-f0-9]{64}$")) {
            throw bindingUnavailable();
        }
        return value.substring("sha256:".length());
    }

    static String wireDigest(String value) {
        if (value == null || !value.matches("^[a-f0-9]{64}$")) {
            throw credentialUnavailable();
        }
        return "sha256:" + value;
    }

    private static ModelGatewayException bindingUnavailable() {
        return ModelGatewayException.unavailable(
                "model_gateway.binding_unavailable",
                "The exact model binding is unavailable.");
    }

    static ModelGatewayException credentialUnavailable() {
        return ModelGatewayException.unavailable(
                "model_gateway.credential_unavailable",
                "The model provider credential is unavailable.");
    }
}
