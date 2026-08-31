import { JsonValueSchema, type RuntimeError } from "@robothree/contracts";
import {
  RuntimeSelectionSummaryV1Alpha5Schema,
  SubmitTurnCommandV1Alpha5Schema,
  SubmitTurnReceiptV1Alpha5Schema,
  type SubmitTurnCommandV1Alpha5,
} from "@robothree/contracts/desktop-local/v1alpha5";
import {
  PersistedSubmitTurnReceiptV1Alpha5Schema,
  ReadableSubmitTurnRecordV1Alpha5Schema,
  type SubmitTurnRecordV1Alpha5,
} from "@robothree/contracts/submit-turn-coordination/v1alpha5";

import type { AgentLoopStarter } from "../ports/agent-loop-starter.js";
import type { Clock } from "../ports/clock.js";
import type { ConversationPersistence } from "../ports/conversation-persistence.js";
import type { DesktopSessionMetadataPersistence } from
  "../ports/desktop-foundation-persistence.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { SubmitTurnPersistence } from "../ports/submit-turn-persistence.js";
import type {
  Dfi541SubmitTurnTaskBundle,
  PersistedDfi541SubmitTurnTaskBundle,
  TaskPersistence,
} from "../ports/task-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type {
  Dfi541SubmitTurnHandler,
  SubmitTurnCoordinatorResult,
} from "./submit-turn-coordinator.js";
import type { R2D3DurableAcceptancePlanner } from
  "./r2d3-durable-acceptance-planner.js";

/** The single production v1alpha5 handler. It reuses the established
 * accepted -> message_appended -> task_committed -> completed state machine. */
export class Dfi543LocalPersonalSubmitTurnHandler
implements Dfi541SubmitTurnHandler {
  constructor(private readonly dependencies: Readonly<{
    clock: Clock;
    ids: IdGenerator;
    conversation: ConversationPersistence;
    sessions: DesktopSessionMetadataPersistence;
    tasks: TaskPersistence;
    coordination: SubmitTurnPersistence;
    loopStarter: AgentLoopStarter;
    planner: R2D3DurableAcceptancePlanner;
  }>) {}

  async submit(raw: SubmitTurnCommandV1Alpha5): Promise<SubmitTurnCoordinatorResult> {
    const parsed = SubmitTurnCommandV1Alpha5Schema.safeParse(raw);
    if (!parsed.success) return fail("submit_turn.invalid_command",
      "SubmitTurn command is invalid", "validation");
    const command = parsed.data;
    const requestDigest = sha256CanonicalJson(JsonValueSchema.parse(command));
    const existing = await this.dependencies.coordination.loadRecord(command.commandId)
      ?? await this.dependencies.coordination.loadRecordByClientTurnId(command.clientTurnId);
    if (existing !== undefined) {
      if (existing.schemaVersion !== "v1alpha5"
        || existing.submitTurnCommandId !== command.commandId
        || existing.clientTurnId !== command.clientTurnId
        || existing.requestDigest !== requestDigest) {
        return fail("submit_turn.idempotency_conflict",
          "SubmitTurn identity conflicts with a durable command", "persistence");
      }
      return this.#progress(existing, true);
    }
    const session = await this.dependencies.sessions.loadDesktopSession(command.sessionId);
    if (session === undefined || session.summary.tombstoned) {
      return fail("submit_turn.session_unavailable",
        "Desktop Session is missing or tombstoned", "validation");
    }
    if (await this.dependencies.conversation.loadSession(
      session.internalSessionId) === undefined) {
      return fail("submit_turn.session_integrity",
        "Desktop Session does not reference a Conversation SessionHead", "persistence");
    }
    const planned = await this.dependencies.planner.prepareDfi543({
      command, requestDigest, internalSessionId: session.internalSessionId,
    });
    if (!planned.ok) return planned;
    const plan = planned.value.envelope.acceptedPlan;
    const userMessage = { schemaVersion: "v1alpha1" as const, role: "user" as const,
      content: [{ type: "text" as const, text: command.userInput }] };
    const prepared = await this.dependencies.conversation.prepareMessage({
      messageId: plan.userMessageId, sessionId: session.internalSessionId,
      taskId: plan.internalTaskId,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(userMessage)),
      message: userMessage, createdAt: plan.acceptedAt,
    });
    if (!prepared.ok) return { ok: false, error: prepared.error };
    const accepted = await this.dependencies.coordination.prepareAcceptedDfi541(
      planned.value.envelope);
    if (!accepted.ok) return { ok: false, error: accepted.error };
    return this.#progress(requireDfiRecord(accepted.value));
  }

  async resume(submitTurnCommandId: string): Promise<SubmitTurnCoordinatorResult> {
    const record = await this.dependencies.coordination.loadRecord(submitTurnCommandId);
    return record === undefined || record.schemaVersion !== "v1alpha5"
      ? fail("submit_turn.not_found", "SubmitTurn record is unavailable", "persistence")
      : this.#progress(record, true);
  }

  async #progress(initial: SubmitTurnRecordV1Alpha5, replayed = false) {
    let record = initial;
    while (true) {
      const envelope = await this.dependencies.coordination.loadDfi541Envelope(
        record.submitTurnCommandId);
      if (envelope === undefined) return fail("dfi541.acceptance_plan_unavailable",
        "Task acceptance plan is unavailable", "persistence");
      record = envelope.record;
      const plan = envelope.acceptedPlan;
      if (record.status === "accepted") {
        const appended = await this.dependencies.conversation.appendPreparedMessage(
          plan.userMessageId, plan.acceptedAt);
        if (!appended.ok) return { ok: false as const, error: appended.error };
        const next = await this.dependencies.coordination.transition(
          ReadableSubmitTurnRecordV1Alpha5Schema.parse({ ...record,
            status: "message_appended", updatedAt: this.dependencies.clock.now() }),
          "accepted");
        if (!next.ok) return { ok: false as const, error: next.error };
        record = requireDfiRecord(next.value);
        continue;
      }
      if (record.status === "message_appended") {
        if (plan.recoveryMaterial === undefined) return fail(
          "dfi543.recovery_material_unavailable",
          "Task recovery material is unavailable", "persistence");
        const committed = await this.dependencies.tasks.commitDfi541SubmitTurnTaskBundle(
          plan.recoveryMaterial as unknown as Dfi541SubmitTurnTaskBundle);
        if (!committed.ok) return { ok: false as const, error: committed.error };
        const next = await this.dependencies.coordination.transition(
          ReadableSubmitTurnRecordV1Alpha5Schema.parse({ ...record,
            status: "task_committed", updatedAt: this.dependencies.clock.now() }),
          "message_appended");
        if (!next.ok) return { ok: false as const, error: next.error };
        record = requireDfiRecord(next.value);
        continue;
      }
      if (record.status === "task_committed") {
        const bundle = await this.dependencies.tasks.loadDfi541SubmitTurnTaskBundle(
          record.submitTurnCommandId);
        if (bundle === undefined
          || bundle.binding.bundleDigest
            !== record.resourcePlan.plannedTaskBundleDigest
          || bundle.runtimeSelection.selectionDigest !== record.plannedSelectionDigest) {
          return fail("dfi541.task_bundle_invalid",
            "Task bundle cannot be verified", "persistence");
        }
        const completedAt = this.dependencies.clock.now();
        const receipt = persistedReceipt(record, bundle, completedAt);
        const completedRecord = requireDfiRecord(
          ReadableSubmitTurnRecordV1Alpha5Schema.parse({ ...record,
            status: "completed", updatedAt: completedAt }));
        const completed = await this.dependencies.coordination.complete({
          record: completedRecord, expectedStatus: "task_committed", receipt,
          delivery: { schemaVersion: "v1alpha1", deliveryId: this.dependencies.ids.next(),
            submitTurnCommandId: record.submitTurnCommandId, type: "turn.accepted",
            sessionId: record.desktopSessionId,
            userMessageId: publicId("message", record.internalUserMessageId),
            taskId: publicId("task", record.internalTaskId), createdAt: completedAt },
        });
        if (!completed.ok) return { ok: false as const, error: completed.error };
        record = completedRecord;
        continue;
      }
      const receipt = await this.dependencies.coordination.loadReceipt(
        record.submitTurnCommandId);
      if (receipt === undefined || !("contractVersion" in receipt)
        || receipt.contractVersion !== "v1alpha5") {
        return fail("submit_turn.receipt_missing",
          "Completed SubmitTurn receipt is unavailable", "persistence");
      }
      if (record.loopStartedAt === undefined && receipt.status === "accepted") {
        try {
          await this.dependencies.loopStarter.start({
            submitTurnCommandId: record.submitTurnCommandId,
            taskId: record.internalTaskId,
            runtimeSelectionId: record.internalRuntimeSelectionId,
            sessionId: record.internalSessionId,
            userMessageId: record.internalUserMessageId,
          });
          await this.dependencies.coordination.markLoopStarted(
            record.submitTurnCommandId, this.dependencies.clock.now());
        } catch {
          // Completion is durable. Recovery retries the idempotent starter.
        }
      }
      const { requestDigest: _request, completedAt: _completed,
        terminalError: _terminal, ...publicValue } = receipt;
      return { ok: true as const, receipt: SubmitTurnReceiptV1Alpha5Schema.parse({
        ...publicValue,
        status: publicValue.status === "accepted" && replayed
          ? "replayed" : publicValue.status,
      }) };
    }
  }
}

function persistedReceipt(record: SubmitTurnRecordV1Alpha5,
  bundle: PersistedDfi541SubmitTurnTaskBundle, completedAt: string) {
  return PersistedSubmitTurnReceiptV1Alpha5Schema.parse({
    contractVersion: "v1alpha5", submitTurnCommandId: record.submitTurnCommandId,
    clientTurnId: record.clientTurnId,
    userMessageId: publicId("message", record.internalUserMessageId),
    taskId: publicId("task", record.internalTaskId),
    runtimeSelectionId: publicId("runtime-selection", record.internalRuntimeSelectionId),
    status: "accepted", runtimeSelectionSummary: summary(bundle),
    acceptedAt: record.createdAt, requestDigest: record.requestDigest, completedAt,
  });
}

function summary(bundle: PersistedDfi541SubmitTurnTaskBundle) {
  const selection = bundle.runtimeSelection;
  const locks = new Map(bundle.capabilityLocks.map((lock) => [lock.lockId, lock]));
  const model = locks.get(selection.resolvedModelLock.lockId);
  if (model === undefined) throw new Error("DFI-5.4.3 Model lock is unavailable");
  const lock = selection.reasoningModeLock;
  const reason = lock.resolution === "default_passthrough" ? "requested_default"
    : lock.resolution === "max_applied" ? "applied"
      : lock.resolution === "max_unsupported_default" ? "unsupported"
        : lock.resolution === "max_capability_unknown_default" ? "capability_unknown"
          : lock.resolution === "max_support_changed_default"
            ? "support_changed_default" : "mapping_unavailable_default";
  return RuntimeSelectionSummaryV1Alpha5Schema.parse({
    runtimeSelectionId: publicId("runtime-selection", selection.runtimeSelectionId),
    digest: selection.selectionDigest,
    agent: { id: selection.agent.agentDefinitionId, revision: selection.agent.revision },
    ...(selection.requestedModelId === undefined ? {} : {
      requestedModelId: selection.requestedModelId }),
    resolvedModel: { id: selection.resolvedModelLock.capabilityId,
      revision: model.definitionSnapshot.revision },
    activeSkills: selection.activeSkillRevisions.map((ref) => ({
      id: ref.skillId, revision: ref.revision })),
    allowedTools: selection.toolLocks.map((ref) => {
      const item = locks.get(ref.lockId);
      if (item === undefined) throw new Error("DFI-5.4.3 Tool lock is unavailable");
      return { id: ref.capabilityId, revision: item.definitionSnapshot.revision };
    }),
    knowledge: selection.knowledgeRevisions.map((ref) => ({
      id: ref.knowledgeId, revision: ref.revision })),
    ...(selection.workspaceGrantId === undefined ? {} : {
      workspaceGrantId: selection.workspaceGrantId }),
    resolvedAuthorization: {
      requestedMode: bundle.selection.requestedMode,
      resolvedMode: bundle.selection.resolvedMode,
      policyRevision: bundle.selection.policyRevision,
      source: bundle.selection.source,
      authorizationSelectionDigest: bundle.selection.authorizationSelectionDigest,
    },
    executionSelectionDigest: bundle.executionIdentity.executionSelectionDigest,
    reasoning: {
      requestedMode: lock.requestedMode,
      resolvedMode: lock.resolution === "max_applied" ? "max" : "model_default",
      resolutionReason: reason,
      reasoningModeLockId: lock.reasoningModeLockId,
      reasoningModeLockDigest: lock.reasoningModeLockDigest,
      ...(!("resolutionEvidenceRevision" in lock) ? {} : {
        reasoningResolutionRevision: lock.resolutionEvidenceRevision,
        reasoningResolutionDigest: lock.resolutionEvidenceDigest }),
    },
  });
}

function requireDfiRecord(value: unknown): SubmitTurnRecordV1Alpha5 {
  const parsed = ReadableSubmitTurnRecordV1Alpha5Schema.parse(value);
  if (parsed.schemaVersion !== "v1alpha5") throw new Error("DFI record drifted");
  return parsed;
}

function publicId(kind: string, internalId: string): string {
  return `${kind}:${internalId}`;
}

function fail(code: string, message: string,
  category: RuntimeError["category"]): SubmitTurnCoordinatorResult {
  return { ok: false, error: { code, message, category, retryable: false } };
}
