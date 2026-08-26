package com.robothree.central.modelgateway.adapter.http;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ModelInvocationHttpMapperTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void acceptsExactUserConfirmedRequestAndBindsItsDigest() {
        ObjectNode document = validDocument();

        var parsed = ModelInvocationHttpMapper.parseAccept(document);

        assertThat(parsed.command().clientRequestId())
                .isEqualTo(UUID.fromString(document.path("clientRequestId").asText()));
        assertThat(parsed.command().admissionType()).isEqualTo("user_confirmed");
        assertThat(parsed.command().requestDigest())
                .isEqualTo(document.path("requestDigest").asText());
        assertThat(parsed.canonicalProviderRequestJson())
                .doesNotContain("confirmationId", "externalTarget", "requestId");
    }

    @Test
    void rejectsSyntheticUnknownFieldsDigestDriftAndNonIntegralNumbers() {
        ObjectNode synthetic = validDocument();
        synthetic.withObject("/admission").put("type", "development_synthetic");
        assertThatThrownBy(() -> ModelInvocationHttpMapper.parseAccept(synthetic))
                .isInstanceOf(IllegalArgumentException.class);

        ObjectNode unknown = validDocument();
        unknown.put("credentialRef", "forbidden");
        assertThatThrownBy(() -> ModelInvocationHttpMapper.parseAccept(unknown))
                .isInstanceOf(IllegalArgumentException.class);

        ObjectNode drift = validDocument();
        drift.put("requestDigest", "f".repeat(64));
        assertThatThrownBy(() -> ModelInvocationHttpMapper.parseAccept(drift))
                .isInstanceOf(IllegalArgumentException.class);

        ObjectNode fractional = validDocument();
        fractional.withObject("/timeoutPolicy")
                .put("providerStreamIdleTimeoutMillis", 30000.5);
        bindDigest(fractional);
        assertThatThrownBy(() -> ModelInvocationHttpMapper.parseAccept(fractional))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void parsesCancelAndOpaqueDurableCursorOutsideTheController() {
        ObjectNode cancel = JSON.createObjectNode();
        cancel.put("contractVersion", "v1alpha1");
        cancel.put("requestId", "019f7447-a784-77b2-a716-000000009706");
        cancel.put("expectedStatusRevision", 3);
        cancel.put("reason", "user_requested");

        assertThat(ModelInvocationHttpMapper.parseCancel(cancel))
                .extracting("expectedStatusRevision", "reason")
                .containsExactly(3L, "user_requested");
        assertThat(ModelInvocationHttpMapper.parseDurableCursor(null)).isZero();
        assertThat(ModelInvocationHttpMapper.parseDurableCursor(
                "cursor:7:0123456789abcdef")).isEqualTo(7);

        cancel.put("expectedStatusRevision", 3.5);
        assertThatThrownBy(() -> ModelInvocationHttpMapper.parseCancel(cancel))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ModelInvocationHttpMapper.parseDurableCursor(
                "cursor:7:../unsafe"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void v1Alpha2RequiresAnOpaqueSelfDigestingCacheContext() {
        ObjectNode document = validDocument();
        document.put("contractVersion", "v1alpha2");
        ObjectNode cacheContext = document.putObject("cacheContext");
        cacheContext.put("sessionScopeDigest", "a".repeat(64));
        document.put("cacheContextDigest", CanonicalJson.sha256(
                CanonicalJson.canonicalize(cacheContext)));

        var parsed = ModelInvocationHttpMapper.parseAcceptV1Alpha2(document);
        assertThat(parsed.sessionScopeDigest())
                .isEqualTo(cacheContext.path("sessionScopeDigest").asText());
        assertThat(parsed.cacheContextDigest())
                .isEqualTo(document.path("cacheContextDigest").asText());

        ObjectNode drift = document.deepCopy();
        drift.put("cacheContextDigest", "f".repeat(64));
        assertThatThrownBy(() -> ModelInvocationHttpMapper.parseAcceptV1Alpha2(drift))
                .isInstanceOf(IllegalArgumentException.class);

        ObjectNode rawSession = document.deepCopy();
        rawSession.withObject("/cacheContext").put("sessionId", UUID.randomUUID().toString());
        assertThatThrownBy(() -> ModelInvocationHttpMapper.parseAcceptV1Alpha2(rawSession))
                .isInstanceOf(IllegalArgumentException.class);

        ObjectNode legacyWithSidecar = validDocument();
        legacyWithSidecar.set("cacheContext", cacheContext);
        legacyWithSidecar.put("cacheContextDigest", document.path("cacheContextDigest").asText());
        assertThatThrownBy(() -> ModelInvocationHttpMapper.parseAccept(legacyWithSidecar))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static ObjectNode validDocument() {
        ObjectNode modelRequest = JSON.createObjectNode();
        modelRequest.put("snapshotId", "019f7447-a784-77b2-a716-000000009701");
        modelRequest.put("contextSourceDigest", "1".repeat(64));
        ObjectNode model = modelRequest.putObject("model");
        model.put("modelId", "model.enterprise");
        model.put("modelRevision", "2".repeat(64));
        model.put("configurationRevision", "3".repeat(64));
        model.put("runtimeRegistryGeneration", "4".repeat(64));
        ArrayNode messages = modelRequest.putArray("messages");
        ObjectNode user = messages.addObject();
        user.put("role", "user");
        user.putArray("content").addObject().put("type", "text").put("text", "canary");
        ObjectNode tool = modelRequest.putArray("tools").addObject();
        tool.put("capabilityId", "tool.echo");
        tool.put("capabilityRevision", "5".repeat(64));
        tool.put("name", "tool.echo");
        tool.put("description", "Echo a value");
        ObjectNode schema = tool.putObject("inputSchema");
        schema.put("type", "object");
        tool.put("inputSchemaDigest", CanonicalJson.sha256(CanonicalJson.canonicalize(schema)));
        modelRequest.put("maxOutputTokens", 512);

        ObjectNode admission = JSON.createObjectNode();
        admission.put("type", "user_confirmed");
        admission.put("taskId", "019f7447-a784-77b2-a716-000000009702");
        admission.put("confirmationId", "019f7447-a784-77b2-a716-000000009703");
        admission.put("externalTarget", "enterprise:model-gateway");
        admission.putArray("dataCategories").add("user_text").add("tool_schema");
        admission.put("dataScopeDigest", "6".repeat(64));
        admission.put("confirmationDigest", "7".repeat(64));

        ObjectNode timeout = JSON.createObjectNode();
        timeout.put("providerRequestDeadlineAt", Instant.parse("2026-08-03T06:05:00Z").toString());
        timeout.put("providerStreamIdleTimeoutMillis", 30_000);

        ObjectNode document = JSON.createObjectNode();
        document.put("contractVersion", "v1alpha1");
        document.put("clientRequestId", "019f7447-a784-77b2-a716-000000009704");
        document.put("requestId", "019f7447-a784-77b2-a716-000000009705");
        document.put("requestDigest", "0".repeat(64));
        document.put("audience", "enterprise-model-gateway");
        document.put("requiredPermission", "model.use");
        document.set("modelRequest", modelRequest);
        document.set("admission", admission);
        document.set("timeoutPolicy", timeout);
        bindDigest(document);
        return document;
    }

    private static void bindDigest(ObjectNode document) {
        ObjectNode material = JSON.createObjectNode();
        material.set("modelRequest", document.path("modelRequest"));
        material.set("admission", document.path("admission"));
        material.set("timeoutPolicy", document.path("timeoutPolicy"));
        document.put("requestDigest", CanonicalJson.sha256(CanonicalJson.canonicalize(material)));
    }
}
