package com.robothree.central.admincontrol.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.admincontrol.domain.AdminInventoryItem;
import com.robothree.central.admincontrol.domain.AdminModule;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class AdminProjectionCrossLanguageConformanceTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void validatesTheSameSixProjectionFixturesAsTheTypescriptContract() throws Exception {
        ObjectNode fixture = (ObjectNode) JSON.readTree(Files.readString(Path.of(
                "../../packages/contracts/fixtures/admin-control/v1alpha1/"
                        + "aapi03-read-projections.json")));

        validate(fixture, AdminModule.MODELS, "modelDetail", "modelId", "modelRevision",
                "contextWindowState", "defaultForNewTasks");
        validate(fixture, AdminModule.ROBOTS, "robotDetail", "robotId",
                "publishedRobotRevision", "reviewState", "policyState");
        validate(fixture, AdminModule.SKILLS, "skillDetail", "skillId", "skillRevision",
                "packageDigest", "validationSummary");
        validate(fixture, AdminModule.TOOLS, "toolDetail", "toolId",
                "toolDefinitionRevision");
        validate(fixture, AdminModule.KNOWLEDGE, "knowledgeDetail", "knowledgeId",
                "knowledgeRevision", "retrievalState");
        ObjectNode audit = (ObjectNode) fixture.path("auditSummary");
        AdminProjectionContractValidator.validate(
                AdminModule.SYSTEM,
                new AdminInventoryItem(
                        audit.path("auditEventId").asText(),
                        audit.path("occurredAt").asText(),
                        audit.path("auditRevision").asText(),
                        audit,
                        audit));

        assertThat(fixture.toString()).doesNotContain(
                "apiKey", "credentialRef", "endpoint", "systemPrompt",
                "utf8Content", "workspacePath", "stack");
    }

    private static void validate(
            ObjectNode fixture,
            AdminModule module,
            String field,
            String idField,
            String revisionField,
            String... detailOnly) {
        ObjectNode detail = ((ObjectNode) fixture.path(field)).deepCopy();
        ObjectNode summary = detail.deepCopy();
        for (String name : detailOnly) summary.remove(name);
        AdminProjectionContractValidator.validate(
                module,
                new AdminInventoryItem(
                        detail.path(idField).asText(),
                        detail.path("displayName").asText(),
                        detail.path(revisionField).asText(),
                        summary,
                        detail));
    }
}
