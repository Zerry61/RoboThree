package com.robothree.central.modelgateway.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.domain.PromptCacheCompatibility;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.shared.json.CanonicalJson;
import java.util.HashSet;
import java.util.Set;

/** Exhaustive classifier for the current provider-neutral request format. */
public final class PromptCacheCompatibilityClassifier {

    private static final int MAX_REQUEST_BYTES = 4 * 1024 * 1024;
    private static final String FORMAT_REVISION =
            CanonicalJson.sha256("robothree.provider-neutral.model-request.v1");

    public PromptCacheCompatibility classify(
            String canonicalProviderRequestJson,
            PromptCacheProfile profile) {
        ObjectNode request = CanonicalJson.parseObject(
                canonicalProviderRequestJson,
                MAX_REQUEST_BYTES);
        ClassificationProof proof = inspect(request);
        String fingerprint = CanonicalJson.sha256(CanonicalJson.canonicalize(
                request.objectNode()
                        .put("canonicalFormatRevision", FORMAT_REVISION)
                        .put("profileRevision", profile.profileRevision())
                        .put("profileDigest", profile.profileDigest())
                        .put("classifiedShape", proof.shapeDigest())));
        return new PromptCacheCompatibility(proof.classification(), fingerprint);
    }

    private static ClassificationProof inspect(ObjectNode request) {
        if (!exact(request, Set.of(
                "snapshotId", "contextSourceDigest", "model", "messages", "tools",
                "maxOutputTokens"))) {
            return unreviewed(request);
        }
        JsonNode model = request.get("model");
        JsonNode messages = request.get("messages");
        JsonNode tools = request.get("tools");
        if (!(model instanceof ObjectNode modelObject)
                || !(messages instanceof ArrayNode messageArray)
                || !(tools instanceof ArrayNode toolArray)
                || !exact(modelObject, Set.of(
                        "modelId", "modelRevision", "configurationRevision",
                        "runtimeRegistryGeneration"))) {
            return unreviewed(request);
        }
        Set<String> observedRoles = new HashSet<>();
        for (JsonNode value : messageArray) {
            if (!(value instanceof ObjectNode message) || !message.has("role")) {
                return unreviewed(request);
            }
            String role = message.path("role").asText("");
            observedRoles.add(role);
            Set<String> expected = switch (role) {
                case "system" -> Set.of(
                        "role", "sourceId", "sourceRevision", "sourceDigest", "content");
                case "user" -> Set.of("role", "content");
                case "assistant" -> Set.of("role", "content", "toolCalls");
                case "tool" -> Set.of(
                        "role", "toolCallId", "outcome", "resultDigest", "content");
                default -> null;
            };
            if (expected == null || !exact(message, expected)
                    || !contentReviewed(message.path("content"))) {
                return unreviewed(request);
            }
            if (role.equals("assistant") && !toolCallsReviewed(message.path("toolCalls"))) {
                return unreviewed(request);
            }
        }
        for (JsonNode value : toolArray) {
            if (!(value instanceof ObjectNode tool) || !exact(tool, Set.of(
                    "capabilityId", "capabilityRevision", "name", "description",
                    "inputSchema", "inputSchemaDigest"))) {
                return unreviewed(request);
            }
        }
        String shape = CanonicalJson.sha256("format=" + FORMAT_REVISION
                + ";roles=" + observedRoles.stream().sorted().toList()
                + ";toolFields=v1;content=text;maxOutputTokens=classified");
        return new ClassificationProof(
                PromptCacheCompatibility.Classification.COMPATIBLE,
                shape);
    }

    private static ClassificationProof unreviewed(ObjectNode request) {
        return new ClassificationProof(
                PromptCacheCompatibility.Classification.CACHE_DISABLED_UNTIL_REVIEWED,
                CanonicalJson.sha256("unreviewed:"
                        + CanonicalJson.sha256(CanonicalJson.canonicalize(request))));
    }

    private static boolean exact(ObjectNode node, Set<String> expected) {
        Set<String> actual = new HashSet<>();
        node.fieldNames().forEachRemaining(actual::add);
        return actual.equals(expected);
    }

    private static boolean contentReviewed(JsonNode content) {
        if (!(content instanceof ArrayNode values)) return false;
        for (JsonNode value : values) {
            if (!(value instanceof ObjectNode part)
                    || !exact(part, Set.of("type", "text"))
                    || !"text".equals(part.path("type").asText())) {
                return false;
            }
        }
        return true;
    }

    private static boolean toolCallsReviewed(JsonNode calls) {
        if (!(calls instanceof ArrayNode values)) return false;
        for (JsonNode value : values) {
            if (!(value instanceof ObjectNode call) || !exact(call, Set.of(
                    "toolCallId", "name", "arguments", "argumentsDigest"))) {
                return false;
            }
        }
        return true;
    }

    private record ClassificationProof(
            PromptCacheCompatibility.Classification classification,
            String shapeDigest) {}
}
