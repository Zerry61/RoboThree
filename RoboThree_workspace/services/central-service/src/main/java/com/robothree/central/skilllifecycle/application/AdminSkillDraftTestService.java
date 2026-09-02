package com.robothree.central.skilllifecycle.application;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Durable, content-free authority for Admin draft-test operations.
 *
 * <p>The user-supplied test input is deliberately held only in this process and is removed as
 * soon as Core claims the operation. PostgreSQL stores operation state and Task identity only.
 * An accepted operation that outlives this process fails closed and must be explicitly retried.</p>
 */
public final class AdminSkillDraftTestService {
    private static final String CONTRACT_VERSION = "skill-lifecycle.v1alpha1";
    private static final int MAX_PENDING_INPUTS = 64;
    private final SkillLifecycleStore store;
    private final CentralTransactionRunner transactions;
    private final Clock clock;
    private final SkillLifecycleProjectionService projections;
    private final Map<UUID, String> pendingInputs = new ConcurrentHashMap<>();

    public AdminSkillDraftTestService(
            SkillLifecycleStore store,
            CentralTransactionRunner transactions,
            Clock clock,
            SkillLifecycleProjectionService projections) {
        this.store = store;
        this.transactions = transactions;
        this.clock = clock;
        this.projections = projections;
    }

    public ObjectNode start(
            UUID commandId,
            UUID correlationId,
            String skillId,
            String expectedDraftRevision,
            String testInput) {
        requireInput(testInput);
        SkillLifecycleStore.DraftRevision draft = store.findCurrentDraft(skillId)
                .filter(value -> value.sourceKind().equals("admin_upload"))
                .filter(value -> value.draftRevision().equals(expectedDraftRevision))
                .orElseThrow(SkillLifecycleException::conflict);
        SkillLifecycleStore.TestOperation existing = store.findTestOperation(commandId)
                .orElse(null);
        if (existing != null) {
            if (!existing.correlationId().equals(correlationId)
                    || !existing.skillId().equals(skillId)
                    || !existing.draftRevision().equals(expectedDraftRevision)) {
                throw SkillLifecycleException.conflict();
            }
            return receipt(existing);
        }
        if (pendingInputs.size() >= MAX_PENDING_INPUTS) {
            throw new SkillLifecycleException(
                    "skilllifecycle.service_unavailable", "技能测试任务繁忙，请稍后重试。");
        }
        Instant now = clock.instant();
        SkillLifecycleStore.TestOperation operation = new SkillLifecycleStore.TestOperation(
                commandId, correlationId, draft.skillId(), draft.draftRevision(),
                "admin_upload", "accepted", null, null, null, now, now);
        transactions.required(() -> {
            if (store.insertTestOperation(operation) != 1) {
                throw SkillLifecycleException.conflict();
            }
            store.insertAudit(new SkillLifecycleStore.AuditEvent(
                    UUID.randomUUID(), "internal-trial-admin", "admin_draft_test_accept",
                    skillId, expectedDraftRevision, now, "accepted", correlationId));
            return null;
        });
        pendingInputs.put(commandId, testInput);
        return receipt(operation);
    }

    public ObjectNode query(UUID operationId) {
        return operation(store.findTestOperation(operationId)
                .orElseThrow(SkillLifecycleException::notFound));
    }

    public ObjectNode listRunningForCore(int limit) {
        if (limit < 1 || limit > 64) throw SkillLifecycleException.invalid();
        ObjectNode result = CanonicalJson.parseObject("{}", 2);
        ArrayNode items = result.putArray("items");
        for (SkillLifecycleStore.TestOperation value : store.listRunningTestOperations(limit)) {
            items.add(operation(value));
        }
        return result;
    }

    public ObjectNode listAcceptedForCore(int limit) {
        if (limit < 1 || limit > 16) throw SkillLifecycleException.invalid();
        ObjectNode result = CanonicalJson.parseObject("{}", 2);
        ArrayNode items = result.putArray("items");
        for (SkillLifecycleStore.TestOperation operation : store.listAcceptedTestOperations(limit)) {
            String input = pendingInputs.get(operation.operationId());
            if (input == null) {
                failLostInput(operation);
                continue;
            }
            ObjectNode item = items.addObject();
            item.put("operationId", operation.operationId().toString());
            item.put("correlationId", operation.correlationId().toString());
            item.put("skillId", operation.skillId());
            item.put("draftRevision", operation.draftRevision());
            SkillLifecycleStore.PackageBlob pack = projections.packageForDraft(
                    operation.skillId(), operation.draftRevision());
            item.put("packageDigest", pack.packageDigest());
            item.put("manifestDigest", pack.manifestDigest());
            item.put("skillMarkdownDigest", pack.skillMarkdownDigest());
            item.put("testInput", input);
        }
        return result;
    }

    public ObjectNode claim(UUID operationId, String taskId) {
        SkillLifecycleStore.TestOperation operation = store.findTestOperation(operationId)
                .orElseThrow(SkillLifecycleException::notFound);
        String testInput = pendingInputs.get(operationId);
        if (testInput == null) {
            failLostInput(operation);
            throw new SkillLifecycleException(
                    "skilllifecycle.service_unavailable", "技能测试输入已失效，请重新运行。");
        }
        Instant now = clock.instant();
        transactions.required(() -> {
            if (store.claimTestOperation(operationId, taskId, now) != 1
                    || store.upsertTestFact(new SkillLifecycleStore.TestFact(
                            operation.skillId(), operation.draftRevision(), "running", taskId,
                            now, null, null, null)) != 1) {
                throw SkillLifecycleException.conflict();
            }
            return null;
        });
        pendingInputs.remove(operationId);
        return operation(store.findTestOperation(operationId)
                .orElseThrow(SkillLifecycleException::notFound));
    }

    public ObjectNode complete(
            UUID operationId,
            String taskId,
            boolean passed,
            String safeSummary,
            String resultDigest) {
        SkillLifecycleStore.TestOperation operation = store.findTestOperation(operationId)
                .orElseThrow(SkillLifecycleException::notFound);
        if (!operation.state().equals("running") || !taskId.equals(operation.taskId())) {
            throw SkillLifecycleException.conflict();
        }
        if (passed && safeSummary != null) throw SkillLifecycleException.invalid();
        if (!passed && (safeSummary == null || safeSummary.isBlank()
                || safeSummary.length() > 1000)) throw SkillLifecycleException.invalid();
        requireDigest(resultDigest);
        String state = passed ? "succeeded" : "failed";
        String factState = passed ? "passed" : "failed";
        Instant now = clock.instant();
        transactions.required(() -> {
            if (store.completeTestOperation(operationId, taskId, state, safeSummary,
                    resultDigest, now) != 1
                    || store.upsertTestFact(new SkillLifecycleStore.TestFact(
                            operation.skillId(), operation.draftRevision(), factState, taskId,
                            operation.updatedAt(), now, safeSummary, resultDigest)) != 1) {
                throw SkillLifecycleException.conflict();
            }
            store.insertAudit(new SkillLifecycleStore.AuditEvent(
                    UUID.randomUUID(), "internal-trial-core", "admin_draft_test_complete",
                    operation.skillId(), operation.draftRevision(), now, factState,
                    operation.correlationId()));
            return null;
        });
        return operation(store.findTestOperation(operationId)
                .orElseThrow(SkillLifecycleException::notFound));
    }

    private void failLostInput(SkillLifecycleStore.TestOperation operation) {
        if (!operation.state().equals("accepted")) return;
        Instant now = clock.instant();
        String digest = "sha256:" + CanonicalJson.sha256("admin-test-input-unavailable");
        store.failAcceptedTestOperation(operation.operationId(),
                "测试输入已失效，请重新运行。", digest, now);
    }

    private static ObjectNode receipt(SkillLifecycleStore.TestOperation value) {
        ObjectNode result = CanonicalJson.parseObject("{}", 2);
        result.put("contractVersion", CONTRACT_VERSION);
        result.put("commandId", value.operationId().toString());
        result.put("correlationId", value.correlationId().toString());
        result.put("skillId", value.skillId());
        result.put("currentRevision", value.draftRevision());
        result.put("state", "test_started");
        result.put("operationId", value.operationId().toString());
        return result;
    }

    private static ObjectNode operation(SkillLifecycleStore.TestOperation value) {
        ObjectNode result = CanonicalJson.parseObject("{}", 2);
        result.put("contractVersion", CONTRACT_VERSION);
        result.put("operationId", value.operationId().toString());
        result.put("correlationId", value.correlationId().toString());
        result.put("operationKind", "admin_draft_test");
        result.put("state", value.state());
        result.put("skillId", value.skillId());
        result.put("targetRevision", value.draftRevision());
        if (value.taskId() != null) result.put("taskId", value.taskId());
        if (value.safeSummary() != null) result.put("safeReason", value.safeSummary());
        result.put("updatedAt", value.updatedAt().toString());
        return result;
    }

    private static void requireInput(String value) {
        if (value == null || value.isBlank() || value.length() > 65_536) {
            throw SkillLifecycleException.invalid();
        }
    }

    private static void requireDigest(String value) {
        if (value == null || !value.matches("^sha256:[a-f0-9]{64}$")) {
            throw SkillLifecycleException.invalid();
        }
    }
}
