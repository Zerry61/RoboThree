package com.robothree.central.agentlifecycle.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** Minimal RSL-1 source of truth. It owns lifecycle facts, not Task execution. */
public final class AgentLifecycleCommandService {
    public static final String CONTRACT_VERSION = "agent-lifecycle.v1alpha1";
    public static final String RESERVED_ROBOT_ID = "agent.general";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern ROBOT_ID = Pattern.compile(
            "^agent\\.[a-z0-9][a-z0-9._:-]*$");
    private static final Pattern RESOURCE_ID = Pattern.compile(
            "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$");
    private static final Set<String> COMMAND_METADATA = Set.of(
            "kind", "contractVersion", "commandId", "correlationId");

    private final AgentLifecycleStore store;
    private final CentralTransactionRunner transactions;
    private final Clock clock;
    private final RobotAvatarImageValidator avatarValidator;

    public AgentLifecycleCommandService(
            AgentLifecycleStore store, CentralTransactionRunner transactions, Clock clock,
            RobotAvatarImageValidator avatarValidator) {
        this.store = store;
        this.transactions = transactions;
        this.clock = clock;
        this.avatarValidator = avatarValidator;
    }

    public ObjectNode executeCreator(ObjectNode command, String creatorSubject) {
        validateMetadata(command);
        UUID commandId = uuid(command, "commandId");
        UUID correlationId = uuid(command, "correlationId");
        String commandDigest = digest(command);
        Optional<AgentLifecycleStore.CommandReceipt> prior = store.findReceipt(commandId);
        if (prior.isPresent()) {
            if (!prior.get().commandDigest().equals(commandDigest)) throw AgentLifecycleException.conflict();
            return parse(prior.get().resultJson());
        }
        return switch (text(command, "kind", 80)) {
            case "create_robot_draft" -> create(command, creatorSubject, commandId,
                    correlationId, commandDigest);
            case "update_robot_draft" -> update(command, creatorSubject, commandId,
                    correlationId, commandDigest);
            case "begin_robot_draft_test" -> beginTest(command, creatorSubject, commandId,
                    correlationId, commandDigest);
            case "complete_robot_draft_test" -> completeTest(command, creatorSubject, commandId,
                    correlationId, commandDigest);
            case "submit_robot_draft" -> submit(command, creatorSubject, commandId,
                    correlationId, commandDigest);
            case "withdraw_robot_submission" -> withdraw(command, creatorSubject, commandId,
                    correlationId, commandDigest);
            default -> throw AgentLifecycleException.invalid();
        };
    }

    public ObjectNode executeReviewer(ObjectNode command, String reviewerSummary) {
        validateMetadata(command);
        UUID commandId = uuid(command, "commandId");
        UUID correlationId = uuid(command, "correlationId");
        String commandDigest = digest(command);
        Optional<AgentLifecycleStore.CommandReceipt> prior = store.findReceipt(commandId);
        if (prior.isPresent()) {
            if (!prior.get().commandDigest().equals(commandDigest)) throw AgentLifecycleException.conflict();
            return parse(prior.get().resultJson());
        }
        return switch (text(command, "kind", 80)) {
            case "approve_robot_review" -> approve(command, reviewerSummary, commandId,
                    correlationId, commandDigest);
            case "reject_robot_review" -> reject(command, reviewerSummary, commandId,
                    correlationId, commandDigest);
            default -> throw AgentLifecycleException.invalid();
        };
    }

    public ObjectNode listDrafts(String creatorSubject) {
        ArrayNode items = JSON.createArrayNode();
        store.listCurrentDraftJson(creatorSubject).stream()
                .map(AgentLifecycleCommandService::parse)
                .map(this::draftSummary)
                .forEach(items::add);
        ObjectNode page = JSON.createObjectNode();
        page.put("contractVersion", CONTRACT_VERSION);
        page.put("queryRevision", digest(items));
        page.set("items", items);
        return page;
    }

    public ObjectNode getDraft(String robotId, String creatorSubject) {
        reserved(robotId);
        return draftDetail(parse(store.findCurrentDraftJson(robotId, creatorSubject)
                .orElseThrow(AgentLifecycleException::notFound)));
    }

    public ObjectNode listReviews(String state) {
        if (state != null && !Set.of("pending_review", "approved", "rejected", "withdrawn")
                .contains(state)) throw AgentLifecycleException.invalid();
        ArrayNode items = JSON.createArrayNode();
        store.listSubmissions(state).stream().map(this::reviewSummary).forEach(items::add);
        ObjectNode page = JSON.createObjectNode();
        page.put("contractVersion", CONTRACT_VERSION);
        page.put("queryRevision", digest(items));
        page.set("items", items);
        return page;
    }

    public ObjectNode getReview(UUID submissionId) {
        AgentLifecycleStore.Submission submission = store.findSubmission(submissionId)
                .orElseThrow(AgentLifecycleException::notFound);
        ObjectNode detail = reviewSummary(submission);
        detail.set("agentPackage", parse(submission.packageJson()));
        if (submission.rejectionReason() != null) {
            detail.put("rejectionReason", submission.rejectionReason());
        }
        return detail;
    }

    public ObjectNode listPublishedReleases() {
        ArrayNode items = JSON.createArrayNode();
        for (AgentLifecycleStore.Release release : store.listReleases()) {
            AgentLifecycleStore.Submission submission = store.findSubmission(release.submissionId())
                    .orElseThrow(AgentLifecycleException::notFound);
            ObjectNode item = JSON.createObjectNode();
            item.put("robotId", release.robotId());
            item.put("releaseRevision", release.releaseRevision());
            item.put("packageDigest", release.packageDigest());
            item.set("agentPackage", parse(submission.packageJson()));
            item.put("publishedAt", release.publishedAt().toString());
            items.add(item);
        }
        ObjectNode page = JSON.createObjectNode();
        page.put("contractVersion", CONTRACT_VERSION);
        page.put("queryRevision", digest(items));
        page.set("items", items);
        return page;
    }

    private ObjectNode create(ObjectNode command, String creator, UUID commandId,
            UUID correlationId, String commandDigest) {
        exact(command, union(COMMAND_METADATA,
                command.has("avatarUpload") ? Set.of("material", "avatarUpload") : Set.of("material")));
        PreparedMaterial prepared = prepareMaterial(command, creator, null);
        ObjectNode material = prepared.material();
        String robotId = robotId(material.path("robotId").asText());
        validateDraftMaterial(material, false);
        if (store.findCurrentDraftJson(robotId, creator).isPresent()) {
            throw AgentLifecycleException.conflict();
        }
        Instant now = clock.instant();
        ObjectNode record = draftRecord(material, creator, now);
        return transactions.required(() -> {
            insertAvatar(prepared.avatarAsset());
            insertDraft(record);
            if (store.createDraftHead(robotId, record.path("draftRevision").asText(), now) != 1) {
                throw AgentLifecycleException.conflict();
            }
            return commit(commandId, correlationId, commandDigest, creator, "draft_create",
                    robotId, record.path("draftRevision").asText(), "draft_saved");
        });
    }

    private ObjectNode update(ObjectNode command, String creator, UUID commandId,
            UUID correlationId, String commandDigest) {
        exact(command, union(COMMAND_METADATA, command.has("avatarUpload")
                ? Set.of("robotId", "expectedDraftRevision", "material", "avatarUpload")
                : Set.of("robotId", "expectedDraftRevision", "material")));
        String robotId = robotId(text(command, "robotId", 200));
        String expected = revision(command, "expectedDraftRevision");
        ObjectNode current = ownedDraft(robotId, creator);
        if (!current.path("draftRevision").asText().equals(expected)) {
            throw AgentLifecycleException.conflict();
        }
        PreparedMaterial prepared = prepareMaterial(command, creator, object(current, "material"));
        ObjectNode material = prepared.material();
        validateDraftMaterial(material, false);
        if (!robotId.equals(material.path("robotId").asText())) throw AgentLifecycleException.invalid();
        Instant now = clock.instant();
        ObjectNode record = draftRecord(material, creator, now);
        return transactions.required(() -> {
            insertAvatar(prepared.avatarAsset());
            insertDraft(record);
            if (store.advanceDraftHead(robotId, expected,
                    record.path("draftRevision").asText(), now) != 1) {
                throw AgentLifecycleException.conflict();
            }
            return commit(commandId, correlationId, commandDigest, creator, "draft_update",
                    robotId, record.path("draftRevision").asText(), "draft_saved");
        });
    }

    private ObjectNode beginTest(ObjectNode command, String creator, UUID commandId,
            UUID correlationId, String commandDigest) {
        exact(command, union(COMMAND_METADATA,
                Set.of("robotId", "expectedDraftRevision", "taskId")));
        String robotId = robotId(text(command, "robotId", 200));
        String expected = revision(command, "expectedDraftRevision");
        String taskId = resourceId(command, "taskId", "task:");
        ObjectNode current = ownedDraft(robotId, creator);
        requireCurrent(current, expected);
        validateDraftMaterial(object(current, "material"), true);
        validatePublishableResources(object(current, "material"), false);
        return transactions.required(() -> {
            if (store.upsertTestFact(new AgentLifecycleStore.TestFact(
                    robotId, expected, "running", taskId, null, null)) != 1) {
                throw AgentLifecycleException.conflict();
            }
            return commit(commandId, correlationId, commandDigest, creator, "test_started",
                    robotId, expected, "test_started");
        });
    }

    private ObjectNode completeTest(ObjectNode command, String creator, UUID commandId,
            UUID correlationId, String commandDigest) {
        exact(command, union(COMMAND_METADATA,
                command.has("safeReason")
                        ? Set.of("robotId", "expectedDraftRevision", "taskId", "result", "safeReason")
                        : Set.of("robotId", "expectedDraftRevision", "taskId", "result")));
        String robotId = robotId(text(command, "robotId", 200));
        String expected = revision(command, "expectedDraftRevision");
        String taskId = resourceId(command, "taskId", "task:");
        String result = text(command, "result", 16);
        if (!Set.of("passed", "failed").contains(result)) throw AgentLifecycleException.invalid();
        String safeReason = command.has("safeReason") ? text(command, "safeReason", 1000) : null;
        if ((result.equals("failed")) != (safeReason != null)) throw AgentLifecycleException.invalid();
        ObjectNode current = ownedDraft(robotId, creator);
        requireCurrent(current, expected);
        AgentLifecycleStore.TestFact running = store.findTestFact(robotId, expected)
                .orElseThrow(AgentLifecycleException::testRequired);
        if (!running.state().equals("running") || !running.taskId().equals(taskId)) {
            throw AgentLifecycleException.conflict();
        }
        Instant now = clock.instant();
        return transactions.required(() -> {
            if (store.upsertTestFact(new AgentLifecycleStore.TestFact(
                    robotId, expected, result, taskId, now, safeReason)) != 1) {
                throw AgentLifecycleException.conflict();
            }
            return commit(commandId, correlationId, commandDigest, creator, "test_completed",
                    robotId, expected, "draft_saved");
        });
    }

    private ObjectNode submit(ObjectNode command, String creator, UUID commandId,
            UUID correlationId, String commandDigest) {
        exact(command, union(COMMAND_METADATA, Set.of("robotId", "expectedDraftRevision",
                "semanticVersion", "changeSummary", "publicationScope")));
        String robotId = robotId(text(command, "robotId", 200));
        String expected = revision(command, "expectedDraftRevision");
        if (!"enterprise".equals(text(command, "publicationScope", 20))) {
            throw AgentLifecycleException.invalid();
        }
        ObjectNode current = ownedDraft(robotId, creator);
        requireCurrent(current, expected);
        ObjectNode material = object(current, "material");
        validateDraftMaterial(material, true);
        validatePublishableResources(material, true);
        AgentLifecycleStore.TestFact test = store.findTestFact(robotId, expected)
                .filter(value -> value.state().equals("passed"))
                .orElseThrow(AgentLifecycleException::testRequired);
        if (store.findPendingSubmission(robotId).isPresent()) {
            throw AgentLifecycleException.submissionConflict();
        }
        Instant now = clock.instant();
        ObjectNode agentDefinition = agentDefinition(current, now);
        ObjectNode packageMaterial = JSON.createObjectNode();
        packageMaterial.put("robotId", robotId);
        packageMaterial.put("draftRevision", expected);
        packageMaterial.put("origin", "personal_draft");
        packageMaterial.put("name", material.path("name").asText());
        packageMaterial.put("description", material.path("description").asText());
        packageMaterial.put("behaviorRules", material.path("behaviorRules").asText());
        packageMaterial.set("avatar", material.path("avatar").deepCopy());
        packageMaterial.set("tags", material.path("tags").deepCopy());
        packageMaterial.set("agentDefinition", agentDefinition);
        packageMaterial.put("publicationScope", "enterprise");
        packageMaterial.put("semanticVersion", text(command, "semanticVersion", 64));
        packageMaterial.put("changeSummary", text(command, "changeSummary", 2000));
        packageMaterial.put("createdAt", current.path("createdAt").asText());
        packageMaterial.put("submittedAt", now.toString());
        String packageDigest = digest(packageMaterial);
        ObjectNode agentPackage = packageMaterial.deepCopy();
        agentPackage.put("packageRevision", packageDigest);
        agentPackage.put("packageDigest", packageDigest);
        UUID submissionId = UUID.randomUUID();
        String submissionRevision = digest(JSON.createObjectNode()
                .put("submissionId", submissionId.toString())
                .put("packageDigest", packageDigest)
                .put("state", "pending_review"));
        AgentLifecycleStore.Submission submission = new AgentLifecycleStore.Submission(
                submissionId, submissionRevision, robotId, expected, creator, "pending_review",
                canonical(agentPackage), packageDigest, now, null, null, null);
        return transactions.required(() -> {
            if (store.insertSubmission(submission) != 1) throw AgentLifecycleException.conflict();
            return commit(commandId, correlationId, commandDigest, creator, "submission_created",
                    robotId, submissionRevision, "submitted");
        });
    }

    private ObjectNode withdraw(ObjectNode command, String creator, UUID commandId,
            UUID correlationId, String commandDigest) {
        exact(command, union(COMMAND_METADATA,
                Set.of("robotId", "submissionId", "expectedSubmissionRevision")));
        String robotId = robotId(text(command, "robotId", 200));
        UUID submissionId = uuid(command, "submissionId");
        String expected = revision(command, "expectedSubmissionRevision");
        AgentLifecycleStore.Submission submission = store.findSubmission(submissionId)
                .filter(value -> value.robotId().equals(robotId)
                        && value.creatorSubject().equals(creator))
                .orElseThrow(AgentLifecycleException::notFound);
        requireSubmission(submission, expected, "pending_review");
        Instant now = clock.instant();
        String nextRevision = transitionRevision(submission, "withdrawn", now, null);
        return transactions.required(() -> {
            if (store.transitionSubmission(submissionId, expected, "pending_review", "withdrawn",
                    now, null, null, nextRevision) != 1) throw AgentLifecycleException.conflict();
            return commit(commandId, correlationId, commandDigest, creator, "submission_withdrawn",
                    robotId, nextRevision, "withdrawn");
        });
    }

    private ObjectNode approve(ObjectNode command, String reviewer, UUID commandId,
            UUID correlationId, String commandDigest) {
        exact(command, union(COMMAND_METADATA,
                Set.of("submissionId", "expectedSubmissionRevision")));
        UUID submissionId = uuid(command, "submissionId");
        String expected = revision(command, "expectedSubmissionRevision");
        AgentLifecycleStore.Submission submission = store.findSubmission(submissionId)
                .orElseThrow(AgentLifecycleException::notFound);
        reserved(submission.robotId());
        requireSubmission(submission, expected, "pending_review");
        ObjectNode agentPackage = parse(submission.packageJson());
        if (!digestWithoutPackageIdentity(agentPackage).equals(submission.packageDigest())) {
            throw AgentLifecycleException.conflict();
        }
        Instant now = clock.instant();
        String nextRevision = transitionRevision(submission, "approved", now, reviewer);
        String releaseRevision = digest(JSON.createObjectNode()
                .put("robotId", submission.robotId())
                .put("packageDigest", submission.packageDigest())
                .put("publishedAt", now.toString()));
        AgentLifecycleStore.Release release = new AgentLifecycleStore.Release(
                submission.robotId(), releaseRevision, submissionId, submission.packageDigest(),
                canonical(object(agentPackage, "agentDefinition")), now);
        return transactions.required(() -> {
            if (store.transitionSubmission(submissionId, expected, "pending_review", "approved",
                    now, reviewer, null, nextRevision) != 1
                    || store.insertRelease(release) != 1) throw AgentLifecycleException.conflict();
            return commit(commandId, correlationId, commandDigest, reviewer, "review_approved",
                    submission.robotId(), releaseRevision, "approved");
        });
    }

    private ObjectNode reject(ObjectNode command, String reviewer, UUID commandId,
            UUID correlationId, String commandDigest) {
        exact(command, union(COMMAND_METADATA,
                Set.of("submissionId", "expectedSubmissionRevision", "reason")));
        UUID submissionId = uuid(command, "submissionId");
        String expected = revision(command, "expectedSubmissionRevision");
        String reason = text(command, "reason", 1000);
        AgentLifecycleStore.Submission submission = store.findSubmission(submissionId)
                .orElseThrow(AgentLifecycleException::notFound);
        requireSubmission(submission, expected, "pending_review");
        Instant now = clock.instant();
        String nextRevision = transitionRevision(submission, "rejected", now, reviewer);
        return transactions.required(() -> {
            if (store.transitionSubmission(submissionId, expected, "pending_review", "rejected",
                    now, reviewer, reason, nextRevision) != 1) throw AgentLifecycleException.conflict();
            return commit(commandId, correlationId, commandDigest, reviewer, "review_rejected",
                    submission.robotId(), nextRevision, "rejected");
        });
    }

    private ObjectNode draftRecord(ObjectNode material, String creator, Instant now) {
        String instructionRevision = instructionRevision(material);
        ObjectNode identity = JSON.createObjectNode();
        identity.set("material", material.deepCopy());
        identity.put("creatorSubject", creator);
        identity.put("createdAt", now.toString());
        String draftRevision = digest(identity);
        ObjectNode record = JSON.createObjectNode();
        record.put("robotId", material.path("robotId").asText());
        record.put("draftRevision", draftRevision);
        record.put("instructionRevision", instructionRevision);
        record.put("creatorSubject", creator);
        record.set("material", material.deepCopy());
        record.put("createdAt", now.toString());
        record.put("updatedAt", now.toString());
        return record;
    }

    private void insertDraft(ObjectNode record) {
        String json = canonical(record);
        AgentLifecycleStore.DraftRevision value = new AgentLifecycleStore.DraftRevision(
                record.path("robotId").asText(), record.path("draftRevision").asText(),
                record.path("instructionRevision").asText(), record.path("creatorSubject").asText(),
                record.path("material").path("name").asText(), json,
                CanonicalJson.sha256(json), Instant.parse(record.path("createdAt").asText()));
        if (store.insertDraftRevision(value) != 1) throw AgentLifecycleException.conflict();
    }

    private PreparedMaterial prepareMaterial(ObjectNode command, String creator,
            ObjectNode currentMaterial) {
        ObjectNode material = object(command, "material").deepCopy();
        AgentLifecycleStore.AvatarAsset avatarAsset = null;
        if (command.has("avatarUpload")) {
            ObjectNode upload = object(command, "avatarUpload");
            exact(upload, Set.of("mediaType", "contentBase64"));
            String declaredMediaType = text(upload, "mediaType", 20);
            byte[] bytes;
            try {
                bytes = Base64.getDecoder().decode(text(upload, "contentBase64", 2_796_204));
            } catch (IllegalArgumentException exception) {
                throw AgentLifecycleException.avatarInvalid();
            }
            RobotAvatarImageValidator.ValidatedAvatar validated;
            try {
                validated = avatarValidator.validate(bytes);
            } catch (IllegalArgumentException exception) {
                throw AgentLifecycleException.avatarInvalid();
            }
            if (!validated.mediaType().equals(declaredMediaType)) {
                throw AgentLifecycleException.avatarInvalid();
            }
            String suffix = validated.contentDigest().substring("sha256:".length(), "sha256:".length() + 32);
            String assetId = "robot-avatar.uploaded." + suffix;
            ObjectNode avatar = JSON.createObjectNode();
            avatar.put("source", "uploaded");
            avatar.put("assetId", assetId);
            avatar.put("contentDigest", validated.contentDigest());
            material.set("avatar", avatar);
            avatarAsset = new AgentLifecycleStore.AvatarAsset(assetId, creator,
                    validated.mediaType(), validated.contentDigest(), validated.width(),
                    validated.height(), bytes, clock.instant());
        } else if (material.path("avatar").path("source").asText().equals("uploaded")) {
            if (currentMaterial == null
                    || !material.path("avatar").equals(currentMaterial.path("avatar"))) {
                throw AgentLifecycleException.avatarInvalid();
            }
        }
        return new PreparedMaterial(material, avatarAsset);
    }

    private void insertAvatar(AgentLifecycleStore.AvatarAsset avatar) {
        if (avatar != null) store.insertAvatarAsset(avatar);
    }

    private ObjectNode draftDetail(ObjectNode record) {
        String robotId = record.path("robotId").asText();
        String draftRevision = record.path("draftRevision").asText();
        ObjectNode material = object(record, "material");
        ObjectNode detail = JSON.createObjectNode();
        detail.put("robotId", robotId);
        detail.put("draftRevision", draftRevision);
        detail.put("instructionRevision", record.path("instructionRevision").asText());
        detail.put("name", material.path("name").asText());
        if (material.has("description")) detail.put("description", material.path("description").asText());
        detail.set("avatar", material.path("avatar").deepCopy());
        detail.set("tags", material.path("tags").deepCopy());
        Optional<AgentLifecycleStore.TestFact> test = store.findTestFact(robotId, draftRevision);
        AgentLifecycleStore.TestFact effective = test.orElse(null);
        detail.put("testState", effective == null ? "untested" : effective.state());
        Optional<AgentLifecycleStore.Submission> latest = store.findLatestSubmission(robotId);
        latest.ifPresent(value -> {
            detail.put("submissionState", value.state());
            if (value.rejectionReason() != null) detail.put("rejectionReason", value.rejectionReason());
        });
        detail.put("updatedAt", record.path("updatedAt").asText());
        detail.set("material", material.deepCopy());
        if (effective != null) {
            ObjectNode fact = detail.putObject("testFact");
            fact.put("draftRevision", draftRevision);
            fact.put("state", effective.state());
            if (effective.taskId() != null) fact.put("taskId", effective.taskId().toString());
            if (effective.testedAt() != null) fact.put("testedAt", effective.testedAt().toString());
            if (effective.safeReason() != null) fact.put("safeReason", effective.safeReason());
        }
        return detail;
    }

    private ObjectNode draftSummary(ObjectNode record) {
        ObjectNode summary = draftDetail(record);
        summary.remove(List.of("material", "testFact", "rejectionReason"));
        return summary;
    }

    private ObjectNode reviewSummary(AgentLifecycleStore.Submission submission) {
        ObjectNode agentPackage = parse(submission.packageJson());
        ObjectNode value = JSON.createObjectNode();
        value.put("submissionId", submission.submissionId().toString());
        value.put("submissionRevision", submission.submissionRevision());
        value.put("robotId", submission.robotId());
        value.put("name", agentPackage.path("name").asText());
        value.put("creatorDisplayName", "内部试用创建者");
        value.put("state", submission.state());
        value.put("semanticVersion", agentPackage.path("semanticVersion").asText());
        value.put("submittedAt", submission.submittedAt().toString());
        if (submission.reviewedAt() != null) value.put("reviewedAt", submission.reviewedAt().toString());
        return value;
    }

    private ObjectNode agentDefinition(ObjectNode draft, Instant now) {
        ObjectNode material = object(draft, "material");
        ObjectNode definition = JSON.createObjectNode();
        definition.put("schemaVersion", "v1alpha2");
        definition.put("agentDefinitionId", material.path("robotId").asText());
        definition.put("managementClass", "managed");
        definition.put("name", material.path("name").asText());
        definition.put("identity", material.path("description").asText());
        definition.put("goal", material.path("description").asText());
        definition.put("instructions", material.path("behaviorRules").asText());
        definition.set("modelRestriction", effectiveRestriction(object(material, "modelRestriction")));
        definition.set("skillRestriction", effectiveRestriction(object(material, "skillRestriction")));
        definition.set("toolRestriction", effectiveRestriction(object(material, "toolRestriction")));
        definition.set("knowledgeRestriction", effectiveRestriction(object(material, "knowledgeRestriction")));
        ObjectNode capabilities = definition.putObject("requiredModelCapabilities");
        capabilities.putArray("inputModalities").add("text");
        capabilities.putArray("outputModalities").add("text");
        capabilities.put("supportsToolCalling", true);
        capabilities.put("supportsStreaming", true);
        definition.put("createdAt", now.toString());
        ObjectNode digestMaterial = JSON.createObjectNode();
        digestMaterial.put("domain", "robothree.agent-definition-revision.v1alpha2\n");
        digestMaterial.set("material", definition.deepCopy());
        String digest = digest(digestMaterial);
        definition.put("revision", digest);
        definition.put("digest", digest);
        return definition;
    }

    private ObjectNode effectiveRestriction(ObjectNode draft) {
        ObjectNode value = JSON.createObjectNode();
        if (!draft.path("enabled").asBoolean()) {
            value.put("mode", "unrestricted");
        } else {
            value.put("mode", "allowlist");
            value.set("references", draft.path("selectedReferences").deepCopy());
        }
        return value;
    }

    private String instructionRevision(ObjectNode material) {
        ObjectNode instructions = JSON.createObjectNode();
        instructions.put("domain", "robothree.robot-draft-instruction.v1\n");
        instructions.put("robotId", material.path("robotId").asText());
        instructions.put("name", material.path("name").asText());
        if (material.has("description")) instructions.put("description", material.path("description").asText());
        if (material.has("behaviorRules")) instructions.put("behaviorRules", material.path("behaviorRules").asText());
        instructions.set("modelRestriction", effectiveRestriction(object(material, "modelRestriction")));
        instructions.set("skillRestriction", effectiveRestriction(object(material, "skillRestriction")));
        instructions.set("toolRestriction", effectiveRestriction(object(material, "toolRestriction")));
        instructions.set("knowledgeRestriction", effectiveRestriction(object(material, "knowledgeRestriction")));
        return digest(instructions);
    }

    private void validateDraftMaterial(ObjectNode material, boolean complete) {
        Set<String> required = Set.of("robotId", "name", "avatar", "tags", "modelRestriction",
                "skillRestriction", "toolRestriction", "knowledgeRestriction");
        Set<String> presentOptional = new HashSet<>();
        if (material.has("description")) presentOptional.add("description");
        if (material.has("behaviorRules")) presentOptional.add("behaviorRules");
        exact(material, union(required, presentOptional));
        for (String field : required) if (!material.has(field)) throw AgentLifecycleException.invalid();
        robotId(text(material, "robotId", 200));
        text(material, "name", 128);
        if (complete) {
            text(material, "description", 4096);
            text(material, "behaviorRules", 128 * 1024);
        }
        validateAvatar(object(material, "avatar"));
        if (!material.path("tags").isArray() || material.path("tags").size() > 12) {
            throw AgentLifecycleException.invalid();
        }
        validateRestriction(object(material, "modelRestriction"), 64);
        validateRestriction(object(material, "skillRestriction"), 64);
        validateRestriction(object(material, "toolRestriction"), 128);
        validateRestriction(object(material, "knowledgeRestriction"), 64);
    }

    private void validatePublishableResources(ObjectNode material, boolean enterprisePackage) {
        ObjectNode model = object(material, "modelRestriction");
        if (model.path("enabled").asBoolean() && model.path("selectedReferences").isEmpty()) {
            throw AgentLifecycleException.resourceUnavailable();
        }
        if (enterprisePackage
                && (!object(material, "skillRestriction").path("selectedReferences").isEmpty()
                || !object(material, "knowledgeRestriction").path("selectedReferences").isEmpty())) {
            throw AgentLifecycleException.resourceUnavailable();
        }
    }

    private void validateAvatar(ObjectNode avatar) {
        String source = text(avatar, "source", 20);
        if (source.equals("system")) {
            exact(avatar, Set.of("source", "assetId"));
            if (!"robot-avatar.default".equals(avatar.path("assetId").asText())) throw AgentLifecycleException.invalid();
        } else if (source.equals("preset")) {
            exact(avatar, Set.of("source", "assetId"));
            if (!avatar.path("assetId").asText().startsWith("robot-avatar.")) throw AgentLifecycleException.invalid();
        } else if (source.equals("uploaded")) {
            exact(avatar, Set.of("source", "assetId", "contentDigest"));
            revision(avatar, "contentDigest");
        } else throw AgentLifecycleException.invalid();
    }

    private void validateRestriction(ObjectNode restriction, int maximum) {
        exact(restriction, Set.of("enabled", "selectedReferences"));
        if (!restriction.path("enabled").isBoolean()
                || !restriction.path("selectedReferences").isArray()
                || restriction.path("selectedReferences").size() > maximum) {
            throw AgentLifecycleException.invalid();
        }
    }

    private ObjectNode ownedDraft(String robotId, String creator) {
        return parse(store.findCurrentDraftJson(robotId, creator)
                .orElseThrow(AgentLifecycleException::notFound));
    }

    private void requireCurrent(ObjectNode current, String expected) {
        if (!current.path("draftRevision").asText().equals(expected)) {
            throw AgentLifecycleException.conflict();
        }
    }

    private void requireSubmission(AgentLifecycleStore.Submission value,
            String expectedRevision, String expectedState) {
        if (!value.submissionRevision().equals(expectedRevision)
                || !value.state().equals(expectedState)) throw AgentLifecycleException.conflict();
    }

    private ObjectNode commit(UUID commandId, UUID correlationId, String commandDigest,
            String actor, String action, String robotId, String revision, String state) {
        ObjectNode receipt = JSON.createObjectNode();
        receipt.put("commandId", commandId.toString());
        receipt.put("correlationId", correlationId.toString());
        receipt.put("robotId", robotId);
        receipt.put("currentRevision", revision);
        receipt.put("state", state);
        Instant now = clock.instant();
        String result = canonical(receipt);
        if (store.insertReceipt(new AgentLifecycleStore.CommandReceipt(
                commandId, correlationId, commandDigest, result, now)) != 1
                || store.insertAudit(new AgentLifecycleStore.AuditEvent(UUID.randomUUID(), actor,
                        action, robotId, revision, now, "success", correlationId)) != 1) {
            throw AgentLifecycleException.conflict();
        }
        return receipt;
    }

    private String transitionRevision(AgentLifecycleStore.Submission value, String state,
            Instant at, String reviewer) {
        ObjectNode material = JSON.createObjectNode();
        material.put("submissionId", value.submissionId().toString());
        material.put("previousRevision", value.submissionRevision());
        material.put("state", state);
        material.put("at", at.toString());
        if (reviewer != null) material.put("reviewer", reviewer);
        return digest(material);
    }

    private record PreparedMaterial(ObjectNode material, AgentLifecycleStore.AvatarAsset avatarAsset) {}

    private String digestWithoutPackageIdentity(ObjectNode value) {
        ObjectNode material = value.deepCopy();
        material.remove(List.of("packageRevision", "packageDigest"));
        return digest(material);
    }

    private void validateMetadata(ObjectNode command) {
        if (!CONTRACT_VERSION.equals(text(command, "contractVersion", 80))) {
            throw AgentLifecycleException.invalid();
        }
        uuid(command, "commandId");
        uuid(command, "correlationId");
    }

    private static String robotId(String value) {
        if (value == null || value.length() > 200 || !ROBOT_ID.matcher(value).matches()) {
            throw AgentLifecycleException.invalid();
        }
        reserved(value);
        return value;
    }

    private static void reserved(String robotId) {
        if (RESERVED_ROBOT_ID.equals(robotId)) throw AgentLifecycleException.reserved();
    }

    private static String revision(JsonNode node, String field) {
        String value = node.path(field).asText("");
        if (!value.matches("^sha256:[a-f0-9]{64}$")) throw AgentLifecycleException.invalid();
        return value;
    }

    private static UUID uuid(JsonNode node, String field) {
        try { return UUID.fromString(node.path(field).asText()); }
        catch (RuntimeException exception) { throw AgentLifecycleException.invalid(); }
    }

    private static String resourceId(JsonNode node, String field, String namespace) {
        String value = node.path(field).asText("");
        if (value.length() > 160 || !value.startsWith(namespace)
                || !RESOURCE_ID.matcher(value).matches()) {
            throw AgentLifecycleException.invalid();
        }
        return value;
    }

    private static String text(JsonNode node, String field, int maximum) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || value.textValue().isBlank()
                || value.textValue().length() > maximum) throw AgentLifecycleException.invalid();
        return value.textValue();
    }

    private static ObjectNode object(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (!(value instanceof ObjectNode object)) throw AgentLifecycleException.invalid();
        return object;
    }

    private static void exact(ObjectNode value, Set<String> allowed) {
        Set<String> actual = new HashSet<>();
        value.fieldNames().forEachRemaining(actual::add);
        if (!actual.equals(allowed)) throw AgentLifecycleException.invalid();
    }

    private static Set<String> union(Set<String> left, Set<String> right) {
        Set<String> result = new HashSet<>(left);
        result.addAll(right);
        return Set.copyOf(result);
    }

    private static String canonical(JsonNode value) {
        return CanonicalJson.canonicalize(value);
    }

    private static String digest(JsonNode value) {
        return "sha256:" + CanonicalJson.sha256(canonical(value));
    }

    private static ObjectNode parse(String value) {
        return CanonicalJson.parseObject(value, 1024 * 1024);
    }
}
