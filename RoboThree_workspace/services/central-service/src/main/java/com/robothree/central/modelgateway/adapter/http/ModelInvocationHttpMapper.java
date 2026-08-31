package com.robothree.central.modelgateway.adapter.http;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime.AcceptCommand;
import com.robothree.central.modelgateway.application.EnterpriseReasoningSafeIdentity;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

public final class ModelInvocationHttpMapper {

    private static final Pattern DIGEST = Pattern.compile("^[a-f0-9]{64}$");
    private static final Pattern RESOURCE = Pattern.compile(
            "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$");
    private static final Set<String> DATA_CATEGORIES = Set.of(
            "user_text",
            "platform_agent_instructions",
            "tool_schema",
            "workspace_content",
            "skill_content",
            "knowledge_content",
            "tool_result");

    private ModelInvocationHttpMapper() {}

    public static ParsedAccept parseAccept(ObjectNode document) {
        return parseAccept(document, "v1alpha1", false);
    }

    public static ParsedAccept parseAcceptV1Alpha2(ObjectNode document) {
        return parseAccept(document, "v1alpha2", true);
    }

    public static ParsedAcceptV1Alpha3 parseAcceptV1Alpha3(ObjectNode document) {
        boolean cachePresent = document.has("cacheContext")
                || document.has("cacheContextDigest");
        if (document.has("cacheContext") != document.has("cacheContextDigest")) {
            throw invalid("cache context and digest must be present together");
        }
        Set<String> fields = new HashSet<>(Set.of(
                "contractVersion", "clientRequestId", "requestId", "requestDigest",
                "audience", "requiredPermission", "modelRequest", "admission",
                "timeoutPolicy"));
        if (cachePresent) {
            fields.add("cacheContext");
            fields.add("cacheContextDigest");
        }
        exact(document, fields);
        requireText(document, "contractVersion", "v1alpha3");
        requireText(document, "audience", "enterprise-model-gateway");
        requireText(document, "requiredPermission", "model.use");
        ObjectNode modelRequest = object(document, "modelRequest");
        EnterpriseReasoningSafeIdentity reasoning = validateReasoning(
                object(modelRequest, "reasoning"));
        validateModelRequest(modelRequest, true);
        ObjectNode admission = object(document, "admission");
        validateUserConfirmedAdmission(admission);
        ObjectNode timeout = object(document, "timeoutPolicy");
        exact(timeout, Set.of(
                "providerRequestDeadlineAt", "providerStreamIdleTimeoutMillis"));
        Instant deadline = Instant.parse(text(timeout, "providerRequestDeadlineAt"));
        long idleTimeout = integer(
                timeout, "providerStreamIdleTimeoutMillis", 1_000, 300_000);
        String sessionScopeDigest = null;
        String cacheContextDigest = null;
        if (cachePresent) {
            ObjectNode cacheContext = object(document, "cacheContext");
            exact(cacheContext, Set.of("sessionScopeDigest"));
            sessionScopeDigest = digest(cacheContext, "sessionScopeDigest");
            cacheContextDigest = digest(document, "cacheContextDigest");
            if (!cacheContextDigest.equals(CanonicalJson.sha256(
                    CanonicalJson.canonicalize(cacheContext)))) {
                throw invalid("cacheContextDigest does not match exact cache context");
            }
        }
        ObjectNode digestMaterial = document.objectNode();
        digestMaterial.set("modelRequest", modelRequest);
        digestMaterial.set("admission", admission);
        digestMaterial.set("timeoutPolicy", timeout);
        if (cacheContextDigest != null) {
            digestMaterial.put("cacheContextDigest", cacheContextDigest);
        }
        String declaredDigest = digest(document, "requestDigest");
        if (!declaredDigest.equals(CanonicalJson.sha256(
                CanonicalJson.canonicalize(digestMaterial)))) {
            throw invalid("requestDigest does not match exact invocation material");
        }
        ObjectNode model = object(modelRequest, "model");
        AcceptCommand command = new AcceptCommand(
                uuid(document, "clientRequestId"),
                uuid(document, "requestId"),
                declaredDigest,
                resource(model, "modelId"),
                digest(model, "modelRevision"),
                digest(model, "configurationRevision"),
                digest(model, "runtimeRegistryGeneration"),
                "user_confirmed",
                CanonicalJson.sha256(CanonicalJson.canonicalize(admission)),
                deadline,
                idleTimeout);
        ObjectNode providerRequest = modelRequest.deepCopy();
        providerRequest.remove("reasoning");
        return new ParsedAcceptV1Alpha3(
                command,
                CanonicalJson.canonicalize(providerRequest),
                sessionScopeDigest,
                cacheContextDigest,
                reasoning);
    }

    private static ParsedAccept parseAccept(
            ObjectNode document,
            String contractVersion,
            boolean cacheContextRequired) {
        Set<String> fields = new HashSet<>(Set.of(
                "contractVersion",
                "clientRequestId",
                "requestId",
                "requestDigest",
                "audience",
                "requiredPermission",
                "modelRequest",
                "admission",
                "timeoutPolicy"));
        if (cacheContextRequired) {
            fields.add("cacheContext");
            fields.add("cacheContextDigest");
        }
        exact(document, fields);
        requireText(document, "contractVersion", contractVersion);
        requireText(document, "audience", "enterprise-model-gateway");
        requireText(document, "requiredPermission", "model.use");
        ObjectNode modelRequest = object(document, "modelRequest");
        validateModelRequest(modelRequest, false);
        ObjectNode admission = object(document, "admission");
        validateUserConfirmedAdmission(admission);
        ObjectNode timeout = object(document, "timeoutPolicy");
        exact(timeout, Set.of(
                "providerRequestDeadlineAt",
                "providerStreamIdleTimeoutMillis"));
        Instant deadline = Instant.parse(text(timeout, "providerRequestDeadlineAt"));
        long idleTimeout = integer(timeout, "providerStreamIdleTimeoutMillis", 1_000, 300_000);
        String declaredDigest = digest(document, "requestDigest");
        ObjectNode digestMaterial = document.objectNode();
        digestMaterial.set("modelRequest", modelRequest);
        digestMaterial.set("admission", admission);
        digestMaterial.set("timeoutPolicy", timeout);
        String actualDigest = CanonicalJson.sha256(
                CanonicalJson.canonicalize(digestMaterial));
        if (!declaredDigest.equals(actualDigest)) {
            throw invalid("requestDigest does not match exact invocation material");
        }
        String sessionScopeDigest = null;
        String cacheContextDigest = null;
        if (cacheContextRequired) {
            ObjectNode cacheContext = object(document, "cacheContext");
            exact(cacheContext, Set.of("sessionScopeDigest"));
            sessionScopeDigest = digest(cacheContext, "sessionScopeDigest");
            cacheContextDigest = digest(document, "cacheContextDigest");
            String actualCacheContextDigest = CanonicalJson.sha256(
                    CanonicalJson.canonicalize(cacheContext));
            if (!cacheContextDigest.equals(actualCacheContextDigest)) {
                throw invalid("cacheContextDigest does not match exact cache context");
            }
        }
        ObjectNode model = object(modelRequest, "model");
        AcceptCommand command = new AcceptCommand(
                uuid(document, "clientRequestId"),
                uuid(document, "requestId"),
                declaredDigest,
                resource(model, "modelId"),
                digest(model, "modelRevision"),
                digest(model, "configurationRevision"),
                digest(model, "runtimeRegistryGeneration"),
                "user_confirmed",
                CanonicalJson.sha256(CanonicalJson.canonicalize(admission)),
                deadline,
                idleTimeout);
        return new ParsedAccept(
                command,
                CanonicalJson.canonicalize(modelRequest),
                sessionScopeDigest,
                cacheContextDigest);
    }

    public static ParsedCancel parseCancel(ObjectNode document) {
        return parseCancel(document, "v1alpha1");
    }

    public static ParsedCancel parseCancelV1Alpha2(ObjectNode document) {
        return parseCancel(document, "v1alpha2");
    }

    public static ParsedCancel parseCancelV1Alpha3(ObjectNode document) {
        return parseCancel(document, "v1alpha3");
    }

    private static ParsedCancel parseCancel(ObjectNode document, String contractVersion) {
        exact(document, Set.of(
                "contractVersion",
                "requestId",
                "expectedStatusRevision",
                "reason"));
        requireText(document, "contractVersion", contractVersion);
        UUID requestId = uuid(document, "requestId");
        long revision = integer(document, "expectedStatusRevision", 0, Long.MAX_VALUE);
        String reason = text(document, "reason");
        requireOneOf(reason, Set.of(
                "user_requested",
                "task_cancelled",
                "deadline_exceeded"));
        return new ParsedCancel(requestId, revision, reason);
    }

    public static long parseDurableCursor(String cursor) {
        if (cursor == null) return 0;
        if (cursor.length() > 512
                || !cursor.matches("^cursor:[0-9]+:(?:root|[a-f0-9]{16})$")) {
            throw invalid("Durable cursor is invalid");
        }
        try {
            return Long.parseLong(cursor.split(":", 3)[1]);
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("Durable cursor is invalid", exception);
        }
    }

    private static void validateModelRequest(ObjectNode request, boolean reasoningRequired) {
        Set<String> fields = new HashSet<>(Set.of(
                "snapshotId",
                "contextSourceDigest",
                "model",
                "messages",
                "tools",
                "maxOutputTokens"));
        if (reasoningRequired) fields.add("reasoning");
        exact(request, fields);
        uuid(request, "snapshotId");
        digest(request, "contextSourceDigest");
        ObjectNode model = object(request, "model");
        exact(model, Set.of(
                "modelId",
                "modelRevision",
                "configurationRevision",
                "runtimeRegistryGeneration"));
        resource(model, "modelId");
        digest(model, "modelRevision");
        digest(model, "configurationRevision");
        digest(model, "runtimeRegistryGeneration");
        ArrayNode messages = array(request, "messages", 1, 512);
        messages.forEach(ModelInvocationHttpMapper::validateMessage);
        ArrayNode tools = array(request, "tools", 0, 64);
        Set<String> names = new HashSet<>();
        tools.forEach(value -> {
            if (!(value instanceof ObjectNode tool)) throw invalid("Tool must be an object");
            exact(tool, Set.of(
                    "capabilityId",
                    "capabilityRevision",
                    "name",
                    "description",
                    "inputSchema",
                    "inputSchemaDigest"));
            resource(tool, "capabilityId");
            digest(tool, "capabilityRevision");
            String name = boundedText(tool, "name", 1, 120);
            if (!names.add(name)) throw invalid("Tool names must be unique");
            boundedText(tool, "description", 1, 2_000);
            ObjectNode inputSchema = object(tool, "inputSchema");
            String schemaDigest = digest(tool, "inputSchemaDigest");
            if (!schemaDigest.equals(CanonicalJson.sha256(
                    CanonicalJson.canonicalize(inputSchema)))) {
                throw invalid("Tool inputSchemaDigest does not match inputSchema");
            }
        });
        integer(request, "maxOutputTokens", 1, 262_144);
    }

    private static EnterpriseReasoningSafeIdentity validateReasoning(
            ObjectNode reasoning) {
        String mode = text(reasoning, "mode");
        if ("default_passthrough".equals(mode)) {
            exact(reasoning, Set.of(
                    "mode", "reasoningModeLockId", "reasoningModeLockDigest"));
            return new EnterpriseReasoningSafeIdentity.DefaultPassthrough(
                    uuid(reasoning, "reasoningModeLockId"),
                    digest(reasoning, "reasoningModeLockDigest"));
        }
        if (!"locked_max_strategy".equals(mode)) {
            throw invalid("reasoning mode is invalid");
        }
        exact(reasoning, Set.of(
                "mode", "reasoningModeLockId", "reasoningModeLockDigest",
                "profileId", "profileRevision", "profileDigest",
                "strategyId", "strategyRevision", "strategyDigest",
                "mappingRevision", "mappingDigest", "timeoutPolicyRef"));
        return new EnterpriseReasoningSafeIdentity.LockedMaxStrategy(
                uuid(reasoning, "reasoningModeLockId"),
                digest(reasoning, "reasoningModeLockDigest"),
                resource(reasoning, "profileId"),
                digest(reasoning, "profileRevision"),
                digest(reasoning, "profileDigest"),
                resource(reasoning, "strategyId"),
                digest(reasoning, "strategyRevision"),
                digest(reasoning, "strategyDigest"),
                digest(reasoning, "mappingRevision"),
                digest(reasoning, "mappingDigest"),
                resource(reasoning, "timeoutPolicyRef"));
    }

    private static void validateMessage(JsonNode value) {
        if (!(value instanceof ObjectNode message)) throw invalid("Message must be an object");
        String role = text(message, "role");
        switch (role) {
            case "system" -> {
                exact(message, Set.of(
                        "role", "sourceId", "sourceRevision", "sourceDigest", "content"));
                boundedText(message, "sourceId", 1, 240);
                boundedText(message, "sourceRevision", 1, 240);
                digest(message, "sourceDigest");
                validateContent(message, 1);
            }
            case "user" -> {
                exact(message, Set.of("role", "content"));
                validateContent(message, 1);
            }
            case "assistant" -> {
                exact(message, Set.of("role", "content", "toolCalls"));
                validateContent(message, 0);
                ArrayNode calls = array(message, "toolCalls", 0, 32);
                calls.forEach(ModelInvocationHttpMapper::validateToolCall);
                if (calls.isEmpty() && array(message, "content", 0, 64).isEmpty()) {
                    throw invalid("Assistant message cannot be empty");
                }
            }
            case "tool" -> {
                exact(message, Set.of(
                        "role", "toolCallId", "outcome", "resultDigest", "content"));
                uuid(message, "toolCallId");
                requireOneOf(text(message, "outcome"), Set.of(
                        "succeeded", "failed", "cancelled", "timed_out", "user_rejected"));
                digest(message, "resultDigest");
                validateContent(message, 0);
            }
            default -> throw invalid("Message role is invalid");
        }
    }

    private static void validateContent(ObjectNode message, int minimum) {
        ArrayNode content = array(message, "content", minimum, 64);
        content.forEach(value -> {
            if (!(value instanceof ObjectNode part)) throw invalid("Content part must be an object");
            exact(part, Set.of("type", "text"));
            requireText(part, "type", "text");
            boundedText(part, "text", 1, 262_144);
        });
    }

    private static void validateToolCall(JsonNode value) {
        if (!(value instanceof ObjectNode call)) throw invalid("Tool Call must be an object");
        exact(call, Set.of("toolCallId", "name", "arguments", "argumentsDigest"));
        uuid(call, "toolCallId");
        boundedText(call, "name", 1, 120);
        ObjectNode arguments = object(call, "arguments");
        if (!digest(call, "argumentsDigest").equals(CanonicalJson.sha256(
                CanonicalJson.canonicalize(arguments)))) {
            throw invalid("Tool Call argumentsDigest does not match arguments");
        }
    }

    private static void validateUserConfirmedAdmission(ObjectNode admission) {
        exact(admission, Set.of(
                "type",
                "taskId",
                "confirmationId",
                "externalTarget",
                "dataCategories",
                "dataScopeDigest",
                "confirmationDigest"));
        requireText(admission, "type", "user_confirmed");
        uuid(admission, "taskId");
        uuid(admission, "confirmationId");
        boundedText(admission, "externalTarget", 3, 500);
        ArrayNode categories = array(admission, "dataCategories", 1, 7);
        Set<String> unique = new HashSet<>();
        categories.forEach(value -> {
            if (!value.isTextual() || !DATA_CATEGORIES.contains(value.textValue())
                    || !unique.add(value.textValue())) {
                throw invalid("Admission data category is invalid or duplicated");
            }
        });
        digest(admission, "dataScopeDigest");
        digest(admission, "confirmationDigest");
    }

    private static void exact(ObjectNode value, Set<String> fields) {
        Set<String> actual = new HashSet<>();
        value.fieldNames().forEachRemaining(actual::add);
        if (!actual.equals(fields)) throw invalid("Object fields do not match the Contract");
    }
    private static ObjectNode object(ObjectNode value, String name) {
        JsonNode child = value.get(name);
        if (!(child instanceof ObjectNode object)) throw invalid(name + " must be an object");
        return object;
    }
    private static ArrayNode array(ObjectNode value, String name, int min, int max) {
        JsonNode child = value.get(name);
        if (!(child instanceof ArrayNode array) || array.size() < min || array.size() > max) {
            throw invalid(name + " has an invalid size");
        }
        return array;
    }
    private static String text(ObjectNode value, String name) {
        JsonNode child = value.get(name);
        if (child == null || !child.isTextual() || child.textValue().isBlank()) {
            throw invalid(name + " must be non-empty text");
        }
        return child.textValue();
    }
    private static String boundedText(ObjectNode value, String name, int min, int max) {
        String text = text(value, name);
        if (text.length() < min || text.length() > max) throw invalid(name + " is outside its limit");
        return text;
    }
    private static void requireText(ObjectNode value, String name, String expected) {
        if (!expected.equals(text(value, name))) throw invalid(name + " is invalid");
    }
    private static void requireOneOf(String value, Set<String> values) {
        if (!values.contains(value)) throw invalid("Enum value is invalid");
    }
    private static String digest(ObjectNode value, String name) {
        String result = text(value, name);
        if (!DIGEST.matcher(result).matches()) throw invalid(name + " must be SHA-256");
        return result;
    }
    private static String resource(ObjectNode value, String name) {
        String result = text(value, name);
        if (!RESOURCE.matcher(result).matches()) throw invalid(name + " is not a resource ID");
        return result;
    }
    private static UUID uuid(ObjectNode value, String name) {
        try { return UUID.fromString(text(value, name)); }
        catch (IllegalArgumentException exception) { throw invalid(name + " must be UUID"); }
    }
    private static long integer(ObjectNode value, String name, long min, long max) {
        JsonNode child = value.get(name);
        if (child == null || !child.isIntegralNumber() || !child.canConvertToLong()) {
            throw invalid(name + " must be integer");
        }
        long result = child.longValue();
        if (result < min || result > max) throw invalid(name + " is outside its limit");
        return result;
    }
    private static IllegalArgumentException invalid(String message) {
        return new IllegalArgumentException(message);
    }

    public record ParsedAccept(
            AcceptCommand command,
            String canonicalProviderRequestJson,
            String sessionScopeDigest,
            String cacheContextDigest) {}

    public record ParsedAcceptV1Alpha3(
            AcceptCommand command,
            String canonicalProviderRequestJson,
            String sessionScopeDigest,
            String cacheContextDigest,
            EnterpriseReasoningSafeIdentity reasoning) {}

    public record ParsedCancel(
            UUID requestId,
            long expectedStatusRevision,
            String reason) {}
}
