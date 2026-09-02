package com.robothree.central.skilllifecycle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.shared.json.CanonicalJson;
import com.robothree.central.skilllifecycle.application.SkillLifecycleAuthority;
import com.robothree.central.skilllifecycle.application.AdminSkillDraftTestService;
import com.robothree.central.skilllifecycle.application.SkillLifecycleProjectionService;
import com.robothree.central.skilllifecycle.application.SkillLifecycleException;
import com.robothree.central.skilllifecycle.application.SkillLifecycleStore;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SkillLifecycleAuthorityTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Instant NOW = Instant.parse("2026-09-01T00:00:00Z");
    private static final String RESULT_DIGEST = digest("result");
    private InMemoryStore store;
    private SkillLifecycleAuthority authority;

    @BeforeEach
    void setUp() {
        store = new InMemoryStore();
        CentralTransactionRunner transactions = new CentralTransactionRunner() {
            @Override
            public <T> T required(Supplier<T> work) {
                return work.get();
            }
        };
        authority = new SkillLifecycleAuthority(
                store, transactions, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void savesImmutableDraftAndReplaysExactCommandReceipt() {
        SkillLifecycleAuthority.CommandContext context = context();
        ObjectNode first = authority.saveDraft(
                context, packageBlob(), metadata(), "user:creator-1", "personal_creator", null);
        ObjectNode replay = authority.saveDraft(
                context, packageBlob(), metadata(), "user:creator-1", "personal_creator", null);

        assertThat(first.path("state").asText()).isEqualTo("draft_created");
        assertThat(replay).isEqualTo(first);
        assertThat(store.packages).hasSize(1);
        assertThat(store.drafts).hasSize(1);
        assertThat(store.audits).hasSize(1);
    }

    @Test
    void advancesOnlyTheExactCurrentDraftRevision() {
        ObjectNode created = createDraft();
        ObjectNode changed = metadata();
        changed.put("displayTitle", "Revised Research Skill");

        ObjectNode refreshed = authority.saveDraft(
                context(), packageBlob(), changed, "user:creator-1", "personal_creator",
                created.path("currentRevision").asText());

        assertThat(refreshed.path("state").asText()).isEqualTo("draft_refreshed");
        assertThat(refreshed.path("currentRevision").asText())
                .isNotEqualTo(created.path("currentRevision").asText());
        assertThatThrownBy(() -> authority.saveDraft(
                context(), packageBlob(), metadata(), "user:creator-1", "personal_creator",
                created.path("currentRevision").asText()))
                .isInstanceOfSatisfying(SkillLifecycleException.class,
                        error -> assertThat(error.code())
                                .isEqualTo("skilllifecycle.revision_conflict"));
    }

    @Test
    void adminDraftTestOperationKeepsInputOnlyInMemoryAndPersistsContentFreeFacts() {
        ObjectNode adminMetadata = metadata();
        adminMetadata.put("skillId", "skill.enterprise.research-writer");
        ObjectNode draft = authority.saveDraft(context(), packageBlob(), adminMetadata,
                "internal-trial-admin", "admin_upload", null);
        CentralTransactionRunner transactions = new CentralTransactionRunner() {
            @Override public <T> T required(Supplier<T> work) { return work.get(); }
        };
        AdminSkillDraftTestService service = new AdminSkillDraftTestService(
                store, transactions, Clock.fixed(NOW, ZoneOffset.UTC),
                new SkillLifecycleProjectionService(store));
        UUID operationId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();

        ObjectNode receipt = service.start(operationId, correlationId,
                "skill.enterprise.research-writer", draft.path("currentRevision").asText(),
                "Use the exact uploaded Skill in a real Task.");
        ObjectNode pending = service.listAcceptedForCore(8);
        service.claim(operationId, "task-admin-skill-1");
        ObjectNode running = service.listRunningForCore(8);
        service.complete(operationId, "task-admin-skill-1", true, null, RESULT_DIGEST);

        assertThat(receipt.path("operationId").asText()).isEqualTo(operationId.toString());
        assertThat(pending.path("items").get(0).path("testInput").asText())
                .isEqualTo("Use the exact uploaded Skill in a real Task.");
        assertThat(running.path("items").get(0).path("taskId").asText())
                .isEqualTo("task-admin-skill-1");
        assertThat(running.toString()).doesNotContain("Use the exact uploaded Skill");
        assertThat(store.findTestOperation(operationId).orElseThrow().state())
                .isEqualTo("succeeded");
        assertThat(store.findTestFact("skill.enterprise.research-writer",
                draft.path("currentRevision").asText()).orElseThrow().state())
                .isEqualTo("passed");
    }

    @Test
    void requiresCurrentPassedTestBeforeSubmission() {
        ObjectNode created = createDraft();

        assertThatThrownBy(() -> authority.submit(
                context(), "skill.research-writer", created.path("currentRevision").asText(),
                "1.0.0", "Initial enterprise release", "user:creator-1"))
                .isInstanceOfSatisfying(SkillLifecycleException.class,
                        error -> assertThat(error.code())
                                .isEqualTo("skilllifecycle.test_required"));
    }

    @Test
    void persistsContentFreeTestFactAndDurableSubmissionIdentity() {
        ObjectNode created = createDraft();
        String revision = created.path("currentRevision").asText();
        passTest(revision);

        ObjectNode submitted = authority.submit(
                context(), "skill.research-writer", revision, "1.0.0",
                "Initial enterprise release", "user:creator-1");
        ObjectNode replay = authority.submit(
                new SkillLifecycleAuthority.CommandContext(
                        UUID.fromString(submitted.path("commandId").asText()),
                        UUID.fromString(submitted.path("correlationId").asText())),
                "skill.research-writer", revision, "1.0.0",
                "Initial enterprise release", "user:creator-1");

        assertThat(submitted.path("submissionId").asText()).isNotBlank();
        assertThat(submitted.path("submissionRevision").asText()).startsWith("sha256:");
        assertThat(replay).isEqualTo(submitted);
        assertThat(store.tests.values().iterator().next().safeSummary()).isNull();
    }

    @Test
    void withdrawsOnlyWithExactPersistentSubmissionIdentity() {
        ObjectNode submitted = submitPassedDraft();
        UUID submissionId = UUID.fromString(submitted.path("submissionId").asText());

        ObjectNode withdrawn = authority.withdraw(
                context(), submissionId, submitted.path("submissionRevision").asText(),
                "user:creator-1");

        assertThat(withdrawn.path("state").asText()).isEqualTo("withdrawn");
        assertThat(store.submissions.get(submissionId).state()).isEqualTo("withdrawn");
    }

    @Test
    void approvalPublishesOneImmutableReleaseFromExactDraft() {
        ObjectNode submitted = submitPassedDraft();

        ObjectNode approved = authority.review(
                context(), UUID.fromString(submitted.path("submissionId").asText()),
                submitted.path("submissionRevision").asText(), true, "reviewer:admin-1", null);

        assertThat(approved.path("state").asText()).isEqualTo("approved");
        assertThat(store.releases.values()).singleElement().satisfies(release -> {
            assertThat(release.skillId()).isEqualTo("skill.research-writer");
            assertThat(release.packageDigest()).isEqualTo(packageBlob().packageDigest());
            assertThat(release.sourceKind()).isEqualTo("personal_creator");
        });
    }

    @Test
    void rejectsPackageDigestCollisionWithDifferentCanonicalBytes() {
        createDraft();
        SkillLifecycleStore.PackageBlob collision = new SkillLifecycleStore.PackageBlob(
                packageBlob().packageDigest(), packageBlob().archiveDigest(),
                packageBlob().manifestDigest(), packageBlob().skillMarkdownDigest(),
                packageBlob().technicalName(), 2, 42, new byte[] {9, 9, 9}, NOW);
        ObjectNode secondSkill = metadata();
        secondSkill.put("skillId", "skill.research-writer-alt");

        assertThatThrownBy(() -> authority.saveDraft(
                context(), collision, secondSkill, "user:creator-2", "admin_upload", null))
                .isInstanceOfSatisfying(SkillLifecycleException.class,
                        error -> assertThat(error.code())
                                .isEqualTo("skilllifecycle.package_invalid"));
    }

    private ObjectNode createDraft() {
        return authority.saveDraft(
                context(), packageBlob(), metadata(), "user:creator-1", "personal_creator", null);
    }

    private ObjectNode submitPassedDraft() {
        ObjectNode created = createDraft();
        String revision = created.path("currentRevision").asText();
        passTest(revision);
        return authority.submit(
                context(), "skill.research-writer", revision, "1.0.0",
                "Initial enterprise release", "user:creator-1");
    }

    private void passTest(String revision) {
        authority.beginTest(context(), "skill.research-writer", revision,
                "task:skill-test-1", "user:creator-1");
        authority.completeTest(context(), "skill.research-writer", revision,
                "task:skill-test-1", true, null, RESULT_DIGEST, "user:creator-1");
    }

    private static SkillLifecycleAuthority.CommandContext context() {
        return new SkillLifecycleAuthority.CommandContext(UUID.randomUUID(), UUID.randomUUID());
    }

    private static ObjectNode metadata() {
        ObjectNode value = JSON.createObjectNode();
        value.put("skillId", "skill.research-writer");
        value.put("technicalName", "research-writer");
        value.put("displayTitle", "Research Writer");
        value.put("displayDescription", "Produces source-grounded research notes.");
        value.put("primaryFunction", "Read selected sources and write a structured report.");
        return value;
    }

    private static SkillLifecycleStore.PackageBlob packageBlob() {
        return new SkillLifecycleStore.PackageBlob(
                digest("package"), digest("archive"), digest("manifest"), digest("skill-md"),
                "research-writer", 2, 42, new byte[] {1, 2, 3}, NOW);
    }

    private static String digest(String value) {
        return "sha256:" + CanonicalJson.sha256(value);
    }

    private static final class InMemoryStore implements SkillLifecycleStore {
        private final Map<String, PackageBlob> packages = new LinkedHashMap<>();
        private final Map<String, DraftRevision> drafts = new LinkedHashMap<>();
        private final Map<String, String> heads = new LinkedHashMap<>();
        private final Map<String, TestFact> tests = new LinkedHashMap<>();
        private final Map<UUID, TestOperation> testOperations = new LinkedHashMap<>();
        private final Map<UUID, Submission> submissions = new LinkedHashMap<>();
        private final Map<String, Release> releases = new LinkedHashMap<>();
        private final Map<UUID, CommandReceipt> receipts = new LinkedHashMap<>();
        private final List<AuditEvent> audits = new ArrayList<>();

        @Override public int insertPackage(PackageBlob value) {
            return packages.putIfAbsent(value.packageDigest(), value) == null ? 1 : 0;
        }
        @Override public Optional<PackageBlob> findPackage(String digest) {
            return Optional.ofNullable(packages.get(digest));
        }
        @Override public int insertDraftRevision(DraftRevision value) {
            return drafts.putIfAbsent(key(value.skillId(), value.draftRevision()), value) == null ? 1 : 0;
        }
        @Override public int createDraftHead(String id, String revision, Instant at) {
            return heads.putIfAbsent(id, revision) == null ? 1 : 0;
        }
        @Override public int advanceDraftHead(String id, String expected, String revision, Instant at) {
            return heads.replace(id, expected, revision) ? 1 : 0;
        }
        @Override public Optional<DraftRevision> findCurrentDraft(String id) {
            return Optional.ofNullable(heads.get(id)).map(revision -> drafts.get(key(id, revision)));
        }
        @Override public Optional<DraftRevision> findDraftRevision(String id, String revision) {
            return Optional.ofNullable(drafts.get(key(id, revision)));
        }
        @Override public List<DraftRevision> listCurrentDrafts(String creator, String source) {
            return heads.entrySet().stream().map(entry -> drafts.get(key(entry.getKey(), entry.getValue())))
                    .filter(value -> value.creatorSubject().equals(creator)
                            && value.sourceKind().equals(source)).toList();
        }
        @Override public Optional<TestFact> findTestFact(String id, String revision) {
            return Optional.ofNullable(tests.get(key(id, revision)));
        }
        @Override public int upsertTestFact(TestFact value) {
            tests.put(key(value.skillId(), value.draftRevision()), value); return 1;
        }
        @Override public int insertTestOperation(TestOperation value) {
            return testOperations.putIfAbsent(value.operationId(), value) == null ? 1 : 0;
        }
        @Override public Optional<TestOperation> findTestOperation(UUID id) {
            return Optional.ofNullable(testOperations.get(id));
        }
        @Override public List<TestOperation> listAcceptedTestOperations(int limit) {
            return testOperations.values().stream().filter(value -> value.state().equals("accepted"))
                    .limit(limit).toList();
        }
        @Override public List<TestOperation> listRunningTestOperations(int limit) {
            return testOperations.values().stream().filter(value -> value.state().equals("running"))
                    .limit(limit).toList();
        }
        @Override public int claimTestOperation(UUID id, String taskId, Instant at) {
            TestOperation value = testOperations.get(id);
            if (value == null || !value.state().equals("accepted")) return 0;
            testOperations.put(id, new TestOperation(id, value.correlationId(), value.skillId(),
                    value.draftRevision(), value.sourceKind(), "running", taskId, null, null,
                    value.createdAt(), at));
            return 1;
        }
        @Override public int failAcceptedTestOperation(UUID id, String safeSummary,
                String resultDigest, Instant at) {
            TestOperation value = testOperations.get(id);
            if (value == null || !value.state().equals("accepted")) return 0;
            testOperations.put(id, new TestOperation(id, value.correlationId(), value.skillId(),
                    value.draftRevision(), value.sourceKind(), "failed", null, safeSummary,
                    resultDigest, value.createdAt(), at));
            return 1;
        }
        @Override public int completeTestOperation(UUID id, String expectedTaskId, String state,
                String safeSummary, String resultDigest, Instant at) {
            TestOperation value = testOperations.get(id);
            if (value == null || !value.state().equals("running")
                    || !value.taskId().equals(expectedTaskId)) return 0;
            testOperations.put(id, new TestOperation(id, value.correlationId(), value.skillId(),
                    value.draftRevision(), value.sourceKind(), state, value.taskId(), safeSummary,
                    resultDigest, value.createdAt(), at));
            return 1;
        }
        @Override public Optional<Submission> findSubmission(UUID id) {
            return Optional.ofNullable(submissions.get(id));
        }
        @Override public Optional<Submission> findPendingSubmission(String id) {
            return submissions.values().stream()
                    .filter(value -> value.skillId().equals(id) && value.state().equals("pending_review"))
                    .findFirst();
        }
        @Override public List<Submission> listSubmissions(String state) {
            return submissions.values().stream()
                    .filter(value -> state == null || value.state().equals(state)).toList();
        }
        @Override public int insertSubmission(Submission value) {
            return submissions.putIfAbsent(value.submissionId(), value) == null ? 1 : 0;
        }
        @Override public int transitionSubmission(UUID id, String expectedRevision,
                String expectedState, String state, Instant reviewedAt, String reviewer,
                String reason, String submissionRevision) {
            Submission value = submissions.get(id);
            if (value == null || !value.submissionRevision().equals(expectedRevision)
                    || !value.state().equals(expectedState)) return 0;
            submissions.put(id, new Submission(id, submissionRevision, value.skillId(),
                    value.draftRevision(), value.creatorSubject(), value.semanticVersion(),
                    value.changeSummary(), state, value.submittedAt(), reviewedAt, reviewer, reason));
            return 1;
        }
        @Override public int insertRelease(Release value) {
            return releases.putIfAbsent(key(value.skillId(), value.releaseRevision()), value) == null ? 1 : 0;
        }
        @Override public Optional<Release> findRelease(String id, String revision) {
            return Optional.ofNullable(releases.get(key(id, revision)));
        }
        @Override public List<Release> listReleases() { return List.copyOf(releases.values()); }
        @Override public Optional<CommandReceipt> findReceipt(UUID id) {
            return Optional.ofNullable(receipts.get(id));
        }
        @Override public int insertReceipt(CommandReceipt value) {
            return receipts.putIfAbsent(value.commandId(), value) == null ? 1 : 0;
        }
        @Override public int insertAudit(AuditEvent value) { audits.add(value); return 1; }
        private static String key(String id, String revision) { return id + "@" + revision; }
    }
}
