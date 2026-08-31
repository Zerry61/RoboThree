package com.robothree.central.modelgateway.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.shared.json.CanonicalJson;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Single pure source of truth for static-prefix digests and cache-enabled wire order. */
public final class CanonicalStaticPromptMaterialPlanner {

    private static final int MAX_REQUEST_BYTES = 4 * 1024 * 1024;
    private static final String REQUEST_SCOPED_SYSTEM_SOURCE_ID =
            "core.request-context.v1";
    private static final String TASK_SCOPED_INSTRUCTION_BUNDLE_SOURCE_ID =
            "core.instruction-bundle.v1";
    private static final String PROJECTION_REVISION =
            CanonicalJson.sha256("robothree.static-prefix-projection.v1");

    public Material plan(String canonicalProviderRequestJson) {
        ObjectNode request = CanonicalJson.parseObject(
                canonicalProviderRequestJson,
                MAX_REQUEST_BYTES);
        return plan(request);
    }

    public Material plan(ObjectNode request) {
        ArrayNode messages = requireArray(request, "messages");
        ArrayNode tools = requireArray(request, "tools");
        List<ObjectNode> leadingSystems = new ArrayList<>();
        for (JsonNode value : messages) {
            if (!(value instanceof ObjectNode message)) {
                throw new IllegalArgumentException("message must be an object");
            }
            if (!"system".equals(message.path("role").asText())) break;
            String sourceId = message.path("sourceId").asText();
            if (REQUEST_SCOPED_SYSTEM_SOURCE_ID.equals(sourceId)
                    || TASK_SCOPED_INSTRUCTION_BUNDLE_SOURCE_ID.equals(sourceId)) {
                break;
            }
            leadingSystems.add(message.deepCopy());
        }
        List<ObjectNode> sortedTools = new ArrayList<>();
        for (JsonNode value : tools) {
            if (!(value instanceof ObjectNode tool)) {
                throw new IllegalArgumentException("tool must be an object");
            }
            sortedTools.add(tool.deepCopy());
        }
        sortedTools.sort(Comparator
                .comparing((ObjectNode tool) -> tool.path("capabilityId").asText())
                .thenComparing(tool -> tool.path("capabilityRevision").asText())
                .thenComparing(tool -> tool.path("name").asText()));

        ObjectNode sourceLock = request.objectNode();
        sourceLock.put("staticSourceLockSchemaVersion", "v1");
        ArrayNode systemLocks = sourceLock.putArray("systemSources");
        for (ObjectNode system : leadingSystems) {
            systemLocks.addObject()
                    .put("sourceId", system.path("sourceId").asText())
                    .put("sourceRevision", system.path("sourceRevision").asText());
        }
        ArrayNode toolLocks = sourceLock.putArray("allowedTools");
        for (ObjectNode tool : sortedTools) {
            toolLocks.addObject()
                    .put("capabilityId", tool.path("capabilityId").asText())
                    .put("capabilityRevision", tool.path("capabilityRevision").asText());
        }

        ObjectNode staticMaterial = request.objectNode();
        ArrayNode staticSystems = staticMaterial.putArray("leadingSystemMessages");
        leadingSystems.forEach(system -> staticSystems.add(system.deepCopy()));
        ArrayNode staticTools = staticMaterial.putArray("tools");
        sortedTools.forEach(tool -> staticTools.add(tool.deepCopy()));
        return new Material(
                leadingSystems,
                sortedTools,
                CanonicalJson.sha256(CanonicalJson.canonicalize(sourceLock)),
                CanonicalJson.sha256(CanonicalJson.canonicalize(staticMaterial)),
                PROJECTION_REVISION);
    }

    private static ArrayNode requireArray(ObjectNode object, String name) {
        JsonNode value = object.get(name);
        if (!(value instanceof ArrayNode array)) {
            throw new IllegalArgumentException(name + " must be an array");
        }
        return array;
    }

    public record Material(
            List<ObjectNode> leadingSystems,
            List<ObjectNode> sortedTools,
            String staticSourceLockDigest,
            String staticPrefixDigest,
            String canonicalProjectionRevision) {

        public Material {
            leadingSystems = copy(leadingSystems);
            sortedTools = copy(sortedTools);
        }

        @Override
        public List<ObjectNode> leadingSystems() {
            return copy(leadingSystems);
        }

        @Override
        public List<ObjectNode> sortedTools() {
            return copy(sortedTools);
        }

        public boolean hasEligiblePrefix() {
            return !leadingSystems.isEmpty() || !sortedTools.isEmpty();
        }

        private static List<ObjectNode> copy(List<ObjectNode> values) {
            return values.stream().map(ObjectNode::deepCopy).toList();
        }
    }
}
