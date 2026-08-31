package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.agentlifecycle.application.AgentLifecycleCommandService;
import com.robothree.central.agentlifecycle.application.RobotAvatarImageValidator;
import com.robothree.central.persistence.mybatis.adapter.MyBatisAgentLifecycleStore;
import com.robothree.central.persistence.mybatis.mapper.AgentLifecyclePersistenceMapper;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import com.robothree.central.persistence.schema.Alignment2aSchemaTestAccess;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

@EnabledOnOs(OS.MAC)
@EnabledIfSystemProperty(named = "os.arch", matches = "aarch64|arm64")
class AgentLifecyclePostgreSqlIntegrationTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String CREATOR = "enterprise.internal-trial:user.internal-trial";
    private static final String ROBOT_ID = "agent.user.contract-review";
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-08-30T12:00:00Z"), ZoneOffset.UTC);

    @Test
    void persistsExactDraftTestSubmissionReviewAndPublishedReleaseAcrossReconstruction()
            throws Exception {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
            CentralPersistenceVariants.MyBatisContext context =
                    CentralPersistenceVariants.openMyBatis(dataSource);
            AgentLifecycleCommandService service = service(context);

            ObjectNode create = command("create_robot_draft");
            create.set("material", material(ROBOT_ID));
            ObjectNode created = service.executeCreator(create, CREATOR);
            assertThat(service.executeCreator(create, CREATOR)).isEqualTo(created);
            String draftRevision = created.required("currentRevision").textValue();

            String taskId = "task:00000000-0000-4000-8000-000000000201";
            ObjectNode begin = command("begin_robot_draft_test")
                    .put("robotId", ROBOT_ID)
                    .put("expectedDraftRevision", draftRevision)
                    .put("taskId", taskId);
            assertThat(service.executeCreator(begin, CREATOR).required("state").textValue())
                    .isEqualTo("test_started");
            ObjectNode complete = command("complete_robot_draft_test")
                    .put("robotId", ROBOT_ID)
                    .put("expectedDraftRevision", draftRevision)
                    .put("taskId", taskId)
                    .put("result", "passed");
            service.executeCreator(complete, CREATOR);

            ObjectNode submit = command("submit_robot_draft")
                    .put("robotId", ROBOT_ID)
                    .put("expectedDraftRevision", draftRevision)
                    .put("semanticVersion", "1.0.0")
                    .put("changeSummary", "首次发布")
                    .put("publicationScope", "enterprise");
            assertThat(service.executeCreator(submit, CREATOR).required("state").textValue())
                    .isEqualTo("submitted");
            ObjectNode review = (ObjectNode) service.listReviews("pending_review")
                    .required("items").required(0);
            ObjectNode approve = command("approve_robot_review")
                    .put("submissionId", review.required("submissionId").textValue())
                    .put("expectedSubmissionRevision",
                            review.required("submissionRevision").textValue());
            assertThat(service.executeReviewer(approve, "internal-trial-admin")
                    .required("state").textValue()).isEqualTo("approved");

            AgentLifecycleCommandService reconstructed = service(
                    CentralPersistenceVariants.openMyBatis(dataSource));
            assertThat(reconstructed.listPublishedReleases().required("items")).hasSize(1);
            assertThat(reconstructed.listPublishedReleases().required("items").required(0)
                    .required("robotId").textValue()).isEqualTo(ROBOT_ID);
        }
    }

    @Test
    void rejectsTheReservedGeneralAgentBeforeWritingAnyFact() throws Exception {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
            AgentLifecycleCommandService service = service(
                    CentralPersistenceVariants.openMyBatis(dataSource));
            ObjectNode create = command("create_robot_draft");
            create.set("material", material("agent.general"));

            assertThatThrownBy(() -> service.executeCreator(create, CREATOR))
                    .extracting("code").isEqualTo("agentlifecycle.robot_id_reserved");
            assertThat(service.listDrafts(CREATOR).required("items")).isEmpty();
        }
    }

    private static AgentLifecycleCommandService service(
            CentralPersistenceVariants.MyBatisContext context) {
        return new AgentLifecycleCommandService(
                new MyBatisAgentLifecycleStore(context.sessions().getMapper(
                        AgentLifecyclePersistenceMapper.class)),
                new SpringCentralTransactionRunner(context.transactionManager()),
                CLOCK,
                new RobotAvatarImageValidator());
    }

    private static ObjectNode command(String kind) {
        return JSON.createObjectNode()
                .put("contractVersion", "agent-lifecycle.v1alpha1")
                .put("kind", kind)
                .put("commandId", UUID.randomUUID().toString())
                .put("correlationId", UUID.randomUUID().toString());
    }

    private static ObjectNode material(String robotId) {
        ObjectNode value = JSON.createObjectNode()
                .put("robotId", robotId)
                .put("name", "合同审阅助手")
                .put("description", "帮助用户审阅合同资料")
                .put("behaviorRules", "只依据用户提供的合同内容给出建议，不编造条款。");
        value.putObject("avatar").put("source", "system")
                .put("assetId", "robot-avatar.default");
        value.putArray("tags").add("合同");
        for (String name : new String[] {"modelRestriction", "skillRestriction",
                "toolRestriction", "knowledgeRestriction"}) {
            ObjectNode restriction = value.putObject(name);
            restriction.put("enabled", false);
            restriction.putArray("selectedReferences");
        }
        return value;
    }
}
