package com.robothree.central.modelgateway.adapter.http;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer.EphemeralEvent;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import com.robothree.central.shared.json.CanonicalJson;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public final class ModelInvocationHttpResponseAssembler {

    private static final ObjectMapper JSON = new ObjectMapper();

    private ModelInvocationHttpResponseAssembler() {}

    public static ObjectNode accepted(ModelInvocation invocation) {
        return accepted(invocation, "v1alpha1");
    }

    public static ObjectNode accepted(ModelInvocation invocation, String contractVersion) {
        ObjectNode response = JSON.createObjectNode();
        response.put("contractVersion", contractVersion);
        response.put("invocationId", invocation.invocationId().toString());
        response.put("clientRequestId", invocation.clientRequestId().toString());
        response.put("requestDigest", invocation.requestDigest());
        response.put("status", "accepted");
        response.put("statusRevision", 0);
        response.put("createdAt", invocation.createdAt().toString());
        response.put("lastDurableEventSequence", 1);
        response.put("durableCursor", cursor(1, invocation.durableEventStreamDigest()));
        return response;
    }

    public static ObjectNode status(ModelInvocation invocation) {
        return status(invocation, "v1alpha1");
    }

    public static ObjectNode status(ModelInvocation invocation, String contractVersion) {
        ObjectNode response = JSON.createObjectNode();
        response.put("contractVersion", contractVersion);
        response.put("invocationId", invocation.invocationId().toString());
        response.put("clientRequestId", invocation.clientRequestId().toString());
        response.put("requestDigest", invocation.requestDigest());
        response.put("modelId", invocation.modelId());
        response.put("modelRevision", invocation.modelRevision());
        response.put("configurationRevision", invocation.configurationRevision());
        response.put("runtimeRegistryGeneration", invocation.runtimeRegistryGeneration());
        response.put("status", invocation.status().contractValue());
        response.put("statusRevision", invocation.statusRevision());
        response.put("createdAt", invocation.createdAt().toString());
        optional(response, "startedAt", invocation.startedAt());
        optional(response, "endedAt", invocation.endedAt());
        if (invocation.usageJson() != null) {
            response.set("usage", CanonicalJson.parseObject(invocation.usageJson(), 16_384));
        }
        optional(response, "finishReason", invocation.finishReason());
        optional(response, "safeErrorCode", invocation.safeErrorCode());
        optional(response, "safeSummary", invocation.safeSummary());
        response.put("lastDurableEventSequence", invocation.lastDurableEventSequence());
        if (invocation.durableEventStreamDigest() != null) {
            response.put("durableEventStreamDigest", invocation.durableEventStreamDigest());
        }
        response.put("durableCursor", cursor(
                invocation.lastDurableEventSequence(),
                invocation.durableEventStreamDigest()));
        return response;
    }

    public static ObjectNode durable(ModelInvocationDurableEvent event) {
        return durable(event, "v1alpha1");
    }

    public static ObjectNode durable(
            ModelInvocationDurableEvent event,
            String contractVersion) {
        ObjectNode response = JSON.createObjectNode();
        response.put("contractVersion", contractVersion);
        response.put("invocationId", event.invocationId().toString());
        response.put("eventId", event.eventId().toString());
        response.put("eventClass", "durable");
        response.put("durableSequence", event.eventSequence());
        response.put("eventType", event.eventType());
        ObjectNode metadata = CanonicalJson.parseObject(event.metadataJson(), 16_384);
        if ("usage_recorded".equals(event.eventType())) {
            ObjectNode payload = JSON.createObjectNode();
            payload.set("usage", metadata);
            response.set("eventPayload", payload);
        } else {
            response.set("eventPayload", metadata);
        }
        response.put("eventDigest", event.eventDigest());
        response.put("durableCursor", cursor(event.eventSequence(), event.streamDigest()));
        response.put("occurredAt", event.createdAt().toString());
        return response;
    }

    public static ObjectNode ephemeral(UUID invocationId, EphemeralEvent event) {
        return ephemeral(invocationId, event, "v1alpha1");
    }

    public static ObjectNode ephemeral(
            UUID invocationId,
            EphemeralEvent event,
            String contractVersion) {
        ObjectNode response = JSON.createObjectNode();
        response.put("contractVersion", contractVersion);
        response.put("invocationId", invocationId.toString());
        UUID eventId = UUID.nameUUIDFromBytes((
                invocationId + ":" + event.streamSequence() + ":" + event.eventType())
                .getBytes(StandardCharsets.UTF_8));
        response.put("eventId", eventId.toString());
        response.put("eventClass", "ephemeral");
        response.put("streamSequence", event.streamSequence());
        response.put("eventType", event.eventType());
        JsonNode payload = "text_delta".equals(event.eventType())
                ? JSON.createObjectNode().put("delta", event.delta())
                : CanonicalJson.parseObject(event.payloadJson(), 1_048_576);
        response.set("eventPayload", payload);
        ObjectNode digestMaterial = response.deepCopy();
        response.put("eventDigest", CanonicalJson.sha256(
                CanonicalJson.canonicalize(digestMaterial)));
        response.put("occurredAt", event.occurredAt().toString());
        return response;
    }

    public static String cursor(long sequence, String streamDigest) {
        String suffix = streamDigest == null ? "root" : streamDigest.substring(0, 16);
        return "cursor:" + sequence + ":" + suffix;
    }

    private static void optional(ObjectNode node, String name, Object value) {
        if (value != null) node.put(name, value.toString());
    }
}
