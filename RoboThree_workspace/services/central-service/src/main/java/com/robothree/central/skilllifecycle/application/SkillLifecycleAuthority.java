package com.robothree.central.skilllifecycle.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/**
 * Central source of truth for immutable Skill lifecycle facts.
 *
 * <p>This authority never executes a Skill and never stores test input, model output, Tool
 * arguments, workspace paths, or installation state. Task execution remains in the existing
 * Core pipeline.</p>
 */
public final class SkillLifecycleAuthority {
    public static final String CONTRACT_VERSION = "skill-lifecycle.v1alpha1";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern SKILL_ID = Pattern.compile(
            "^skill\\.[a-z0-9][a-z0-9._:-]*$");
    private static final Pattern TECHNICAL_NAME = Pattern.compile(
            "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$");
    private static final Pattern REVISION = Pattern.compile("^sha256:[a-f0-9]{64}$");
    private static final Pattern SEMANTIC_VERSION = Pattern.compile(
            "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$");
    private static final Set<String> SOURCE_KINDS = Set.of("personal_creator", "admin_upload");

    private final SkillLifecycleStore store;
    private final CentralTransactionRunner transactions;
    private final Clock clock;

    public SkillLifecycleAuthority(
            SkillLifecycleStore store,
            CentralTransactionRunner transactions,
            Clock clock) {
        this.store = store;
        this.transactions = transactions;
        this.clock = clock;
    }

    public ObjectNode saveDraft(
            CommandContext context,
            SkillLifecycleStore.PackageBlob packageBlob,
            ObjectNode metadata,
            String creatorSubject,
            String sourceKind,
            String expectedDraftRevision) {
        requireCommand(context);
        requirePackage(packageBlob);
        requireText(creatorSubject, 200);
        if (!SOURCE_KINDS.contains(sourceKind)) throw SkillLifecycleException.invalid();
        String skillId = text(metadata, "skillId", 200);
        String technicalName = text(metadata, "technicalName", 96);
        String displayTitle = text(metadata, "displayTitle", 128);
        if (!SKILL_ID.matcher(skillId).matches()
                || !TECHNICAL_NAME.matcher(technicalName).matches()
                || !technicalName.equals(packageBlob.technicalName())) {
            throw SkillLifecycleException.invalid();
        }
        text(metadata, "displayDescription", 4096);
        text(metadata, "primaryFunction", 4096);
        String metadataJson = CanonicalJson.canonicalize(metadata);
        String commandDigest = commandDigest("save_draft", context, metadataJson,
                packageBlob.packageDigest(), expectedDraftRevision);
        Optional<ObjectNode> prior = prior(context.commandId(), commandDigest);
        if (prior.isPresent()) return prior.get();

        Optional<SkillLifecycleStore.DraftRevision> current = store.findCurrentDraft(skillId);
        if (expectedDraftRevision == null) {
            if (current.isPresent()) throw SkillLifecycleException.conflict();
        } else {
            revision(expectedDraftRevision);
            if (current.isEmpty()
                    || !current.get().creatorSubject().equals(creatorSubject)
                    || !current.get().sourceKind().equals(sourceKind)
                    || !current.get().draftRevision().equals(expectedDraftRevision)) {
                throw SkillLifecycleException.conflict();
            }
        }

        Instant now = clock.instant();
        ObjectNode record = JSON.createObjectNode();
        record.put("contractVersion", CONTRACT_VERSION);
        record.put("skillId", skillId);
        record.put("creatorSubject", creatorSubject);
        record.put("sourceKind", sourceKind);
        record.put("packageDigest", packageBlob.packageDigest());
        record.put("technicalName", technicalName);
        record.put("displayTitle", displayTitle);
        record.set("metadata", metadata.deepCopy());
        record.put("createdAt", now.toString());
        String draftRevision = revisionOf(record);
        String recordDigest = CanonicalJson.sha256(CanonicalJson.canonicalize(record));
        SkillLifecycleStore.DraftRevision draft = new SkillLifecycleStore.DraftRevision(
                skillId, draftRevision, creatorSubject, sourceKind, packageBlob.packageDigest(),
                technicalName, displayTitle, metadataJson, recordDigest, now);

        return transactions.required(() -> {
            persistPackage(packageBlob);
            if (store.insertDraftRevision(draft) != 1) {
                throw SkillLifecycleException.conflict();
            }
            int updated = expectedDraftRevision == null
                    ? store.createDraftHead(skillId, draftRevision, now)
                    : store.advanceDraftHead(
                            skillId, expectedDraftRevision, draftRevision, now);
            if (updated != 1) throw SkillLifecycleException.conflict();
            String state = expectedDraftRevision == null
                    ? (sourceKind.equals("admin_upload") ? "upload_accepted" : "draft_created")
                    : "draft_refreshed";
            return commit(context, commandDigest, creatorSubject, "draft_save", skillId,
                    draftRevision, state);
        });
    }

    public ObjectNode updateAdminMetadata(
            CommandContext context,
            String skillId,
            String expectedDraftRevision,
            ObjectNode publicMetadata,
            String actorSummary) {
        requireSkill(skillId);
        revision(expectedDraftRevision);
        requireText(actorSummary, 200);
        SkillLifecycleStore.DraftRevision current = requireCurrent(skillId, expectedDraftRevision);
        if (!current.sourceKind().equals("admin_upload")) {
            throw SkillLifecycleException.notFound();
        }
        SkillLifecycleStore.PackageBlob pack = store.findPackage(current.packageDigest())
                .orElseThrow(SkillLifecycleException::notFound);
        ObjectNode metadata = publicMetadata.deepCopy();
        metadata.put("skillId", current.skillId());
        metadata.put("technicalName", current.technicalName());
        metadata.put("primaryFunction", text(publicMetadata, "displayDescription", 4096));
        return saveDraft(context, pack, metadata, actorSummary, "admin_upload",
                expectedDraftRevision);
    }

    public ObjectNode beginTest(
            CommandContext context,
            String skillId,
            String expectedDraftRevision,
            String taskId,
            String actorSummary) {
        requireCommand(context);
        requireSkill(skillId);
        revision(expectedDraftRevision);
        requireText(taskId, 160);
        requireText(actorSummary, 200);
        String commandDigest = commandDigest(
                "begin_test", context, skillId, expectedDraftRevision, taskId);
        Optional<ObjectNode> prior = prior(context.commandId(), commandDigest);
        if (prior.isPresent()) return prior.get();
        SkillLifecycleStore.DraftRevision draft = requireCurrent(skillId, expectedDraftRevision);
        Instant now = clock.instant();
        return transactions.required(() -> {
            if (store.upsertTestFact(new SkillLifecycleStore.TestFact(
                    skillId, draft.draftRevision(), "running", taskId, now,
                    null, null, null)) != 1) {
                throw SkillLifecycleException.conflict();
            }
            return commit(context, commandDigest, actorSummary, "draft_test_begin", skillId,
                    expectedDraftRevision, "test_started");
        });
    }

    public ObjectNode completeTest(
            CommandContext context,
            String skillId,
            String expectedDraftRevision,
            String taskId,
            boolean passed,
            String safeSummary,
            String resultDigest,
            String actorSummary) {
        requireCommand(context);
        requireSkill(skillId);
        revision(expectedDraftRevision);
        requireText(taskId, 160);
        revision(resultDigest);
        requireText(actorSummary, 200);
        if (passed && safeSummary != null) throw SkillLifecycleException.invalid();
        if (!passed) requireText(safeSummary, 1000);
        String commandDigest = commandDigest("complete_test", context, skillId,
                expectedDraftRevision, taskId, Boolean.toString(passed), resultDigest);
        Optional<ObjectNode> prior = prior(context.commandId(), commandDigest);
        if (prior.isPresent()) return prior.get();
        requireCurrent(skillId, expectedDraftRevision);
        SkillLifecycleStore.TestFact running = store.findTestFact(skillId, expectedDraftRevision)
                .orElseThrow(SkillLifecycleException::conflict);
        if (!running.state().equals("running") || !running.taskId().equals(taskId)) {
            throw SkillLifecycleException.conflict();
        }
        Instant now = clock.instant();
        String state = passed ? "passed" : "failed";
        return transactions.required(() -> {
            if (store.upsertTestFact(new SkillLifecycleStore.TestFact(
                    skillId, expectedDraftRevision, state, taskId, running.startedAt(), now,
                    safeSummary, resultDigest)) != 1) {
                throw SkillLifecycleException.conflict();
            }
            return commit(context, commandDigest, actorSummary, "draft_test_complete", skillId,
                    expectedDraftRevision, passed ? "test_passed" : "test_failed");
        });
    }

    public ObjectNode submit(
            CommandContext context,
            String skillId,
            String expectedDraftRevision,
            String semanticVersion,
            String changeSummary,
            String creatorSubject) {
        requireCommand(context);
        requireSkill(skillId);
        revision(expectedDraftRevision);
        if (!SEMANTIC_VERSION.matcher(semanticVersion).matches()) {
            throw SkillLifecycleException.invalid();
        }
        requireText(changeSummary, 2000);
        requireText(creatorSubject, 200);
        String commandDigest = commandDigest("submit", context, skillId,
                expectedDraftRevision, semanticVersion, changeSummary);
        Optional<ObjectNode> prior = prior(context.commandId(), commandDigest);
        if (prior.isPresent()) return prior.get();
        SkillLifecycleStore.DraftRevision draft = requireCurrent(skillId, expectedDraftRevision);
        if (!draft.creatorSubject().equals(creatorSubject)
                || !draft.sourceKind().equals("personal_creator")) {
            throw SkillLifecycleException.notFound();
        }
        requirePassedTest(skillId, expectedDraftRevision);
        if (store.findPendingSubmission(skillId).isPresent()) {
            throw SkillLifecycleException.submissionConflict();
        }
        Instant now = clock.instant();
        UUID submissionId = UUID.randomUUID();
        ObjectNode identity = JSON.createObjectNode();
        identity.put("submissionId", submissionId.toString());
        identity.put("skillId", skillId);
        identity.put("draftRevision", expectedDraftRevision);
        identity.put("semanticVersion", semanticVersion);
        identity.put("state", "pending_review");
        identity.put("submittedAt", now.toString());
        String submissionRevision = revisionOf(identity);
        SkillLifecycleStore.Submission submission = new SkillLifecycleStore.Submission(
                submissionId, submissionRevision, skillId, expectedDraftRevision,
                creatorSubject, semanticVersion, changeSummary, "pending_review", now,
                null, null, null);
        return transactions.required(() -> {
            if (store.insertSubmission(submission) != 1) {
                throw SkillLifecycleException.submissionConflict();
            }
            return commit(context, commandDigest, creatorSubject, "submission_create",
                    skillId, submissionRevision, "submitted", result -> {
                        result.put("submissionId", submissionId.toString());
                        result.put("submissionRevision", submissionRevision);
                    });
        });
    }

    public ObjectNode withdraw(
            CommandContext context,
            UUID submissionId,
            String expectedSubmissionRevision,
            String creatorSubject) {
        requireCommand(context);
        revision(expectedSubmissionRevision);
        requireText(creatorSubject, 200);
        String commandDigest = commandDigest("withdraw", context, submissionId.toString(),
                expectedSubmissionRevision);
        Optional<ObjectNode> prior = prior(context.commandId(), commandDigest);
        if (prior.isPresent()) return prior.get();
        SkillLifecycleStore.Submission submission = store.findSubmission(submissionId)
                .orElseThrow(SkillLifecycleException::notFound);
        if (!submission.creatorSubject().equals(creatorSubject)
                || !submission.state().equals("pending_review")
                || !submission.submissionRevision().equals(expectedSubmissionRevision)) {
            throw SkillLifecycleException.conflict();
        }
        Instant now = clock.instant();
        String nextRevision = transitionRevision(submission, "withdrawn", now, null, null);
        return transactions.required(() -> {
            if (store.transitionSubmission(submissionId, expectedSubmissionRevision,
                    "pending_review", "withdrawn", now, null, null, nextRevision) != 1) {
                throw SkillLifecycleException.conflict();
            }
            return commit(context, commandDigest, creatorSubject, "submission_withdraw",
                    submission.skillId(), nextRevision, "withdrawn");
        });
    }

    public ObjectNode review(
            CommandContext context,
            UUID submissionId,
            String expectedSubmissionRevision,
            boolean approve,
            String reviewerSummary,
            String rejectionReason) {
        requireCommand(context);
        revision(expectedSubmissionRevision);
        requireText(reviewerSummary, 200);
        if (approve && rejectionReason != null) throw SkillLifecycleException.invalid();
        if (!approve) requireText(rejectionReason, 1000);
        String commandDigest = commandDigest(approve ? "approve" : "reject", context,
                submissionId.toString(), expectedSubmissionRevision,
                rejectionReason == null ? "" : rejectionReason);
        Optional<ObjectNode> prior = prior(context.commandId(), commandDigest);
        if (prior.isPresent()) return prior.get();
        SkillLifecycleStore.Submission submission = store.findSubmission(submissionId)
                .orElseThrow(SkillLifecycleException::notFound);
        if (!submission.state().equals("pending_review")
                || !submission.submissionRevision().equals(expectedSubmissionRevision)) {
            throw SkillLifecycleException.conflict();
        }
        requirePassedTest(submission.skillId(), submission.draftRevision());
        Instant now = clock.instant();
        String state = approve ? "approved" : "rejected";
        String nextRevision = transitionRevision(
                submission, state, now, reviewerSummary, rejectionReason);
        return transactions.required(() -> {
            if (store.transitionSubmission(submissionId, expectedSubmissionRevision,
                    "pending_review", state, now, reviewerSummary, rejectionReason,
                    nextRevision) != 1) {
                throw SkillLifecycleException.conflict();
            }
            if (approve) insertRelease(submission, now);
            return commit(context, commandDigest, reviewerSummary,
                    approve ? "submission_approve" : "submission_reject",
                    submission.skillId(), nextRevision, state);
        });
    }

    public ObjectNode publishAdminDraft(
            CommandContext context,
            String skillId,
            String expectedDraftRevision,
            String actorSummary) {
        requireCommand(context);
        requireSkill(skillId);
        revision(expectedDraftRevision);
        requireText(actorSummary, 200);
        String commandDigest = commandDigest(
                "publish_admin_draft", context, skillId, expectedDraftRevision);
        Optional<ObjectNode> prior = prior(context.commandId(), commandDigest);
        if (prior.isPresent()) return prior.get();
        SkillLifecycleStore.DraftRevision draft = requireCurrent(skillId, expectedDraftRevision);
        if (!draft.sourceKind().equals("admin_upload")) throw SkillLifecycleException.notFound();
        requirePassedTest(skillId, expectedDraftRevision);
        ObjectNode metadata = CanonicalJson.parseObject(draft.metadataJson(), 524_288);
        String semanticVersion = text(metadata, "semanticVersion", 32);
        if (!SEMANTIC_VERSION.matcher(semanticVersion).matches()) {
            throw SkillLifecycleException.invalid();
        }
        Instant now = clock.instant();
        return transactions.required(() -> {
            String releaseRevision = insertRelease(draft, null, semanticVersion, now);
            return commit(context, commandDigest, actorSummary, "admin_draft_publish",
                    skillId, releaseRevision, "published");
        });
    }

    private void insertRelease(SkillLifecycleStore.Submission submission, Instant now) {
        SkillLifecycleStore.DraftRevision draft = store.findDraftRevision(
                        submission.skillId(), submission.draftRevision())
                .orElseThrow(SkillLifecycleException::notFound);
        insertRelease(draft, submission.submissionId(), submission.semanticVersion(), now);
    }

    private String insertRelease(
            SkillLifecycleStore.DraftRevision draft,
            UUID submissionId,
            String semanticVersion,
            Instant now) {
        ObjectNode metadata = CanonicalJson.parseObject(draft.metadataJson(), 524_288);
        ObjectNode release = JSON.createObjectNode();
        release.put("contractVersion", CONTRACT_VERSION);
        release.put("skillId", draft.skillId());
        release.put("draftRevision", draft.draftRevision());
        release.put("packageDigest", draft.packageDigest());
        release.put("technicalName", draft.technicalName());
        release.put("displayTitle", draft.displayTitle());
        release.put("displayDescription", text(metadata, "displayDescription", 4096));
        release.put("semanticVersion", semanticVersion);
        release.put("sourceKind", draft.sourceKind());
        release.put("publishedAt", now.toString());
        String releaseRevision = revisionOf(release);
        if (store.insertRelease(new SkillLifecycleStore.Release(
                draft.skillId(), releaseRevision, submissionId, draft.draftRevision(),
                draft.packageDigest(), semanticVersion, draft.sourceKind(),
                CanonicalJson.canonicalize(release), now)) != 1) {
            throw SkillLifecycleException.releaseConflict();
        }
        return releaseRevision;
    }

    private void persistPackage(SkillLifecycleStore.PackageBlob value) {
        if (store.insertPackage(value) == 1) return;
        SkillLifecycleStore.PackageBlob existing = store.findPackage(value.packageDigest())
                .orElseThrow(SkillLifecycleException::packageInvalid);
        if (!existing.archiveDigest().equals(value.archiveDigest())
                || !existing.manifestDigest().equals(value.manifestDigest())
                || !existing.skillMarkdownDigest().equals(value.skillMarkdownDigest())
                || !existing.technicalName().equals(value.technicalName())
                || existing.fileCount() != value.fileCount()
                || existing.expandedByteCount() != value.expandedByteCount()
                || !Arrays.equals(existing.canonicalZipBytes(), value.canonicalZipBytes())) {
            throw SkillLifecycleException.packageInvalid();
        }
    }

    private SkillLifecycleStore.DraftRevision requireCurrent(String skillId, String revision) {
        SkillLifecycleStore.DraftRevision current = store.findCurrentDraft(skillId)
                .orElseThrow(SkillLifecycleException::notFound);
        if (!current.draftRevision().equals(revision)) throw SkillLifecycleException.conflict();
        return current;
    }

    private void requirePassedTest(String skillId, String draftRevision) {
        SkillLifecycleStore.TestFact fact = store.findTestFact(skillId, draftRevision)
                .orElseThrow(SkillLifecycleException::testRequired);
        if (!fact.state().equals("passed")) throw SkillLifecycleException.testRequired();
    }

    private ObjectNode commit(
            CommandContext context,
            String commandDigest,
            String actor,
            String action,
            String skillId,
            String objectRevision,
            String state) {
        return commit(context, commandDigest, actor, action, skillId, objectRevision, state,
                ignored -> {});
    }

    private ObjectNode commit(
            CommandContext context,
            String commandDigest,
            String actor,
            String action,
            String skillId,
            String objectRevision,
            String state,
            Consumer<ObjectNode> enrich) {
        ObjectNode result = JSON.createObjectNode();
        result.put("contractVersion", CONTRACT_VERSION);
        result.put("commandId", context.commandId().toString());
        result.put("correlationId", context.correlationId().toString());
        result.put("skillId", skillId);
        result.put("currentRevision", objectRevision);
        result.put("state", state);
        enrich.accept(result);
        String resultJson = CanonicalJson.canonicalize(result);
        Instant now = clock.instant();
        if (store.insertReceipt(new SkillLifecycleStore.CommandReceipt(
                context.commandId(), context.correlationId(), commandDigest, resultJson, now)) != 1) {
            throw SkillLifecycleException.conflict();
        }
        if (store.insertAudit(new SkillLifecycleStore.AuditEvent(
                UUID.randomUUID(), actor, action, skillId, objectRevision, now,
                "succeeded", context.correlationId())) != 1) {
            throw SkillLifecycleException.conflict();
        }
        return result;
    }

    private Optional<ObjectNode> prior(UUID commandId, String commandDigest) {
        return store.findReceipt(commandId).map(receipt -> {
            if (!receipt.commandDigest().equals(commandDigest)) {
                throw SkillLifecycleException.conflict();
            }
            return CanonicalJson.parseObject(receipt.resultJson(), 65_536);
        });
    }

    private static String transitionRevision(
            SkillLifecycleStore.Submission submission,
            String state,
            Instant at,
            String reviewer,
            String rejectionReason) {
        ObjectNode value = JSON.createObjectNode();
        value.put("submissionId", submission.submissionId().toString());
        value.put("previousRevision", submission.submissionRevision());
        value.put("state", state);
        value.put("reviewedAt", at.toString());
        if (reviewer != null) value.put("reviewerSummary", reviewer);
        if (rejectionReason != null) value.put("rejectionReason", rejectionReason);
        return revisionOf(value);
    }

    private static String commandDigest(String kind, CommandContext context, String... parts) {
        ObjectNode value = JSON.createObjectNode();
        value.put("kind", kind);
        value.put("commandId", context.commandId().toString());
        value.put("correlationId", context.correlationId().toString());
        for (int index = 0; index < parts.length; index++) {
            if (parts[index] != null) value.put("part" + index, parts[index]);
        }
        return revisionOf(value);
    }

    private static String revisionOf(JsonNode value) {
        return "sha256:" + CanonicalJson.sha256(CanonicalJson.canonicalize(value));
    }

    private static void requirePackage(SkillLifecycleStore.PackageBlob value) {
        revision(value.packageDigest());
        revision(value.archiveDigest());
        revision(value.manifestDigest());
        revision(value.skillMarkdownDigest());
        if (!TECHNICAL_NAME.matcher(value.technicalName()).matches()
                || value.fileCount() < 1 || value.fileCount() > 4096
                || value.expandedByteCount() < 1 || value.expandedByteCount() > 536_870_912L
                || value.canonicalZipBytes().length < 1
                || value.canonicalZipBytes().length > 209_715_200) {
            throw SkillLifecycleException.packageInvalid();
        }
    }

    private static void requireSkill(String skillId) {
        if (!SKILL_ID.matcher(skillId).matches()) throw SkillLifecycleException.invalid();
    }

    private static void revision(String value) {
        if (value == null || !REVISION.matcher(value).matches()) {
            throw SkillLifecycleException.invalid();
        }
    }

    private static String text(ObjectNode object, String field, int maximumLength) {
        JsonNode value = object.get(field);
        if (value == null || !value.isTextual()) throw SkillLifecycleException.invalid();
        String text = value.textValue().trim();
        requireText(text, maximumLength);
        return text;
    }

    private static void requireText(String value, int maximumLength) {
        if (value == null || value.isBlank() || value.length() > maximumLength) {
            throw SkillLifecycleException.invalid();
        }
    }

    private static void requireCommand(CommandContext context) {
        if (context == null || context.commandId() == null || context.correlationId() == null) {
            throw SkillLifecycleException.invalid();
        }
    }

    public record CommandContext(UUID commandId, UUID correlationId) {}
}
