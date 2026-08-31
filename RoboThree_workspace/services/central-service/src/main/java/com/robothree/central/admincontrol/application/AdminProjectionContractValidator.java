package com.robothree.central.admincontrol.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.domain.AdminInventoryItem;
import com.robothree.central.admincontrol.domain.AdminModule;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

public final class AdminProjectionContractValidator {

    private static final Pattern RESOURCE_ID = Pattern.compile(
            "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$");
    private static final Pattern REVISION = Pattern.compile("^sha256:[a-f0-9]{64}$");
    private static final Pattern UUID = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    private static final Set<String> LIFECYCLE = Set.of(
            "draft", "review", "published", "disabled", "gated", "unavailable");
    private static final Set<String> CREDENTIAL = Set.of("configured", "missing", "unavailable");
    private static final Set<String> RESTRICTION = Set.of(
            "unrestricted", "restricted_nonempty", "restricted_empty");
    private static final Set<String> CONFIGURATION = Set.of(
            "configured", "missing", "unavailable", "gated");
    private static final Set<String> KNOWLEDGE = Set.of(
            "unconfigured", "unavailable", "gated", "partial", "ready");

    private AdminProjectionContractValidator() {}

    public static void validate(AdminModule module, AdminInventoryItem item) {
        switch (module) {
            case MODELS -> model(item);
            case ROBOTS -> robot(item);
            case SKILLS -> skill(item);
            case TOOLS -> tool(item);
            case KNOWLEDGE -> knowledge(item);
            case SYSTEM -> audit(item);
        }
    }

    private static void model(AdminInventoryItem item) {
        ObjectNode summary = item.summary();
        fields(summary, "modelId", "modelRevision", "displayName", "providerLabel",
                "lifecycle", "credentialStatus", "safeSummary");
        resource(summary, "modelId");
        revision(summary, "modelRevision");
        text(summary, "displayName", 512);
        text(summary, "providerLabel", 512);
        member(summary, "lifecycle", LIFECYCLE);
        member(summary, "credentialStatus", CREDENTIAL);
        text(summary, "safeSummary", 4096);
        ObjectNode detail = item.detail();
        fields(detail, "modelId", "modelRevision", "displayName", "providerLabel",
                "lifecycle", "credentialStatus", "safeSummary",
                "contextWindowState", "defaultForNewTasks");
        member(detail, "contextWindowState", Set.of("known", "unknown", "unavailable"));
        bool(detail, "defaultForNewTasks");
    }

    private static void robot(AdminInventoryItem item) {
        ObjectNode summary = item.summary();
        fields(summary, "robotId", "publishedRobotRevision", "displayName", "description",
                "source", "lifecycle", "restrictionSummary");
        resource(summary, "robotId");
        revision(summary, "publishedRobotRevision");
        text(summary, "displayName", 512);
        text(summary, "description", 4096);
        member(summary, "source", Set.of("local_trusted", "enterprise_published", "official_builtin"));
        member(summary, "lifecycle", LIFECYCLE);
        ObjectNode restrictions = object(summary, "restrictionSummary");
        fields(restrictions, "models", "skills", "tools", "knowledge");
        for (String field : Set.of("models", "skills", "tools", "knowledge")) {
            member(restrictions, field, RESTRICTION);
        }
        ObjectNode detail = item.detail();
        fields(detail, "robotId", "publishedRobotRevision", "displayName", "description",
                "source", "lifecycle", "restrictionSummary", "reviewState", "policyState");
        member(detail, "reviewState", Set.of(
                "not_required", "pending", "approved", "rejected", "unavailable"));
        member(detail, "policyState", CREDENTIAL);
    }

    private static void skill(AdminInventoryItem item) {
        ObjectNode summary = item.summary();
        fields(summary, "skillId", "skillRevision", "displayName", "description",
                "lifecycle", "packageValidationState");
        resource(summary, "skillId");
        revision(summary, "skillRevision");
        text(summary, "displayName", 512);
        text(summary, "description", 4096);
        member(summary, "lifecycle", LIFECYCLE);
        member(summary, "packageValidationState", Set.of(
                "not_started", "valid", "invalid", "unavailable"));
        ObjectNode detail = item.detail();
        Set<String> allowed = Set.of("skillId", "skillRevision", "displayName", "description",
                "lifecycle", "packageValidationState", "packageDigest", "validationSummary");
        fieldsSubset(detail, allowed, Set.of("skillId", "skillRevision", "displayName", "description",
                "lifecycle", "packageValidationState"));
        optionalRevision(detail, "packageDigest");
        optionalText(detail, "validationSummary", 4096);
    }

    private static void tool(AdminInventoryItem item) {
        ObjectNode summary = item.summary();
        fields(summary, "toolId", "toolDefinitionRevision", "displayName", "description",
                "source", "lifecycle", "readOnly", "riskSummary", "policyState",
                "connectionState", "credentialStatus", "healthState");
        resource(summary, "toolId");
        if (!summary.path("toolId").asText().startsWith("tool.")) fail();
        revision(summary, "toolDefinitionRevision");
        text(summary, "displayName", 512);
        text(summary, "description", 4096);
        member(summary, "source", Set.of("enterprise_package", "official_package"));
        member(summary, "lifecycle", LIFECYCLE);
        bool(summary, "readOnly");
        JsonNode risk = summary.get("riskSummary");
        if (risk == null || !risk.isArray() || risk.size() > 6) fail();
        risk.forEach(value -> {
            if (!value.isTextual() || !Set.of(
                    "destructive", "external_side_effect", "privileged_access",
                    "sensitive_data", "routine_file", "network_access")
                    .contains(value.textValue())) fail();
        });
        member(summary, "policyState", CONFIGURATION);
        member(summary, "connectionState", CONFIGURATION);
        member(summary, "credentialStatus", CREDENTIAL);
        member(summary, "healthState", CONFIGURATION);
        ObjectNode detail = item.detail();
        fieldsSubset(detail, Set.of(
                "toolId", "toolDefinitionRevision", "displayName", "description", "source",
                "lifecycle", "readOnly", "riskSummary", "policyState", "connectionState",
                "credentialStatus", "healthState", "inputSummary", "outputSummary"),
                Set.of("toolId", "toolDefinitionRevision", "displayName", "description", "source",
                        "lifecycle", "readOnly", "riskSummary", "policyState", "connectionState",
                        "credentialStatus", "healthState"));
        optionalText(detail, "inputSummary", 4096);
        optionalText(detail, "outputSummary", 4096);
    }

    private static void knowledge(AdminInventoryItem item) {
        ObjectNode summary = item.summary();
        fieldsSubset(summary, Set.of(
                "knowledgeId", "knowledgeRevision", "displayName", "safeSummary", "state"),
                Set.of("knowledgeId", "displayName", "safeSummary", "state"));
        resource(summary, "knowledgeId");
        optionalRevision(summary, "knowledgeRevision");
        text(summary, "displayName", 512);
        text(summary, "safeSummary", 4096);
        member(summary, "state", KNOWLEDGE);
        ObjectNode detail = item.detail();
        fieldsSubset(detail, Set.of(
                "knowledgeId", "knowledgeRevision", "displayName", "safeSummary", "state",
                "retrievalState"),
                Set.of("knowledgeId", "displayName", "safeSummary", "state", "retrievalState"));
        member(detail, "retrievalState", KNOWLEDGE);
    }

    private static void audit(AdminInventoryItem item) {
        ObjectNode summary = item.summary();
        fields(summary, "auditEventId", "auditRevision", "occurredAt", "actorSummary",
                "actionSummary", "result");
        if (!UUID.matcher(summary.path("auditEventId").asText()).matches()) fail();
        revision(summary, "auditRevision");
        text(summary, "occurredAt", 64);
        text(summary, "actorSummary", 512);
        text(summary, "actionSummary", 4096);
        member(summary, "result", Set.of("allowed", "denied", "failed", "unavailable"));
        if (!summary.equals(item.detail())) fail();
    }

    private static void fields(ObjectNode node, String... expected) {
        fieldsSubset(node, Set.of(expected), Set.of(expected));
    }

    private static void fieldsSubset(ObjectNode node, Set<String> allowed, Set<String> required) {
        Set<String> actual = StreamSupport.stream(
                        ((Iterable<String>) () -> node.fieldNames()).spliterator(), false)
                .collect(Collectors.toSet());
        if (!allowed.containsAll(actual) || !actual.containsAll(required)) fail();
    }

    private static void resource(ObjectNode node, String field) {
        String value = node.path(field).asText();
        if (value.length() > 160 || !RESOURCE_ID.matcher(value).matches()) fail();
    }

    private static void revision(ObjectNode node, String field) {
        if (!REVISION.matcher(node.path(field).asText()).matches()) fail();
    }

    private static void optionalRevision(ObjectNode node, String field) {
        if (node.has(field)) revision(node, field);
    }

    private static void text(ObjectNode node, String field, int maximum) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || value.textValue().isBlank()
                || value.textValue().length() > maximum || unsafe(value.textValue())) fail();
    }

    private static void optionalText(ObjectNode node, String field, int maximum) {
        if (node.has(field)) text(node, field, maximum);
    }

    private static boolean unsafe(String value) {
        String lower = value.toLowerCase();
        return value.contains("Bearer ") || value.contains("-----BEGIN")
                || value.contains("/Users/") || lower.contains("api_key")
                || lower.contains("credentialreference") || lower.contains("stacktrace")
                || lower.contains("http://") || lower.contains("https://")
                || value.matches(".*(?:^|[^a-zA-Z0-9])sk-[A-Za-z0-9_-]{12,}.*");
    }

    private static void member(ObjectNode node, String field, Set<String> allowed) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || !allowed.contains(value.textValue())) fail();
    }

    private static void bool(ObjectNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isBoolean()) fail();
    }

    private static ObjectNode object(ObjectNode node, String field) {
        JsonNode value = node.get(field);
        if (!(value instanceof ObjectNode object)) fail();
        return (ObjectNode) value;
    }

    private static void fail() {
        throw new IllegalArgumentException("admin.projection_contract_invalid");
    }
}
