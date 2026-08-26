import { JsonValueSchema } from "@robothree/contracts";
import type { ModelRequest } from "@robothree/contracts";

import type { ConversationPersistence } from "../ports/conversation-persistence.js";
import { digestConversationRange } from "../persistence/conversation-validation.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type { CompactionRunResult } from "./compaction-coordinator.js";
import { CompactedContextViewBuilder } from "./compacted-context-view.js";
import { CompactionSourceRangePlanner } from "./compaction-source-range-planner.js";
import type { ContextPipeline, ContextPipelineResult } from "./context-pipeline.js";
import type { ContextPipelineInput } from "./context-types.js";
import type { TurnSnapshotBuilder } from "./turn-snapshot-builder.js";

export type ContextPreparationDecision =
  | "not_required"
  | "skipped"
  | "compacted"
  | "pending_recovered"
  | "stale_reloaded"
  | "failed";

export type ContextPreparationReason =
  | "below_threshold"
  | "bounded_preview_only"
  | "no_eligible_old_prefix"
  | "current_turn_too_large"
  | "static_context_too_large"
  | "compacted_still_over_budget"
  | "admission_pending"
  | "admission_rejected"
  | "compaction_failed";

export type ContextPreparationReceipt = Readonly<{
  decision: ContextPreparationDecision;
  reason: ContextPreparationReason;
  initialEstimatedInputTokens: number;
  previewedEstimatedInputTokens: number;
  finalEstimatedInputTokens: number;
  compactionThresholdTokens: number;
  availableInputTokens: number;
  sourceRangeDigest?: string;
  compactionJobId?: string;
  compactionId?: string;
}>;

export type PreparedContext = Readonly<{
  request: ModelRequest;
  context: ContextPipelineResult;
  receipt: ContextPreparationReceipt;
  conversationMessages: ContextPipelineInput["conversationMessages"];
}>;

export class ContextPreparationError extends Error {
  readonly code:
    | "context.current_turn_too_large"
    | "context.static_context_too_large"
    | "context.available_input_exceeded"
    | "context.compaction_failed";
  readonly retryable = false;
  readonly safeSummary: string;
  readonly receipt: ContextPreparationReceipt;

  constructor(input: Readonly<{
    code: ContextPreparationError["code"];
    safeSummary: string;
    receipt: ContextPreparationReceipt;
  }>) {
    super(input.safeSummary);
    this.name = "ContextPreparationError";
    this.code = input.code;
    this.safeSummary = input.safeSummary;
    this.receipt = input.receipt;
  }
}

export class ContextPreparationAdmissionInterruption extends Error {
  readonly code: "model.user_confirmation_required" | "authorization.user_rejected";
  readonly receipt: ContextPreparationReceipt;
  readonly original: unknown;

  constructor(input: Readonly<{
    code: ContextPreparationAdmissionInterruption["code"];
    receipt: ContextPreparationReceipt;
    original: unknown;
  }>) {
    super(input.code === "model.user_confirmation_required"
      ? "Compaction Summary admission is waiting for user confirmation"
      : "Compaction Summary admission was rejected");
    this.name = "ContextPreparationAdmissionInterruption";
    this.code = input.code;
    this.receipt = input.receipt;
    this.original = input.original;
  }
}

export class ContextPreparationCoordinator {
  readonly #conversation: ConversationPersistence;
  readonly #snapshots: TurnSnapshotBuilder;
  readonly #context: ContextPipeline;
  readonly #views: CompactedContextViewBuilder;
  readonly #sourcePlanner: CompactionSourceRangePlanner;

  constructor(input: Readonly<{
    conversation: ConversationPersistence;
    snapshots: TurnSnapshotBuilder;
    context: ContextPipeline;
    views?: CompactedContextViewBuilder;
    sourcePlanner?: CompactionSourceRangePlanner;
  }>) {
    this.#conversation = input.conversation;
    this.#snapshots = input.snapshots;
    this.#context = input.context;
    this.#views = input.views ?? new CompactedContextViewBuilder(input.conversation);
    this.#sourcePlanner = input.sourcePlanner ?? new CompactionSourceRangePlanner();
  }

  async prepare(input: Readonly<{
    sessionId: string;
    snapshotId: () => string;
    requestId: () => string;
    createdAt: () => string;
    pipelineInput: (
      facts: Readonly<{
        snapshot: Awaited<ReturnType<TurnSnapshotBuilder["build"]>>;
        messages: ContextPipelineInput["conversationMessages"];
        compactionSummary?: NonNullable<ContextPipelineInput["compactionSummary"]>;
        toolCallBatches: NonNullable<ContextPipelineInput["toolCallBatches"]>;
        requestId: string;
      }>,
    ) => ContextPipelineInput;
    authorizeAndCompact: (facts: Readonly<{
      sourceStartSequence: number;
      sourceEndSequence: number;
      sourceDigest: string;
      activeCompactionId?: string;
    }>) => Promise<CompactionRunResult>;
  }>): Promise<PreparedContext> {
    const first = await this.#loadView(input);
    const assessment = this.#context.assess(input.pipelineInput({
      ...first,
      requestId: input.requestId(),
    }));
    const budget = assessment.candidate.receipt;
    if (budget.initialEstimatedInputTokens <= budget.compactionThresholdTokens) {
      const reason = assessment.estimatedBeforeBoundedPreviewTokens > budget.compactionThresholdTokens
        && assessment.boundedPreviewApplied
        ? "bounded_preview_only"
        : "below_threshold";
      return prepared(assessment.candidate, first.messages, receipt(
        reason === "below_threshold" ? "not_required" : "skipped",
        reason,
        assessment,
      ));
    }

    const plan = this.#sourcePlanner.plan({
      rawMessages: first.messages,
      ...(first.compactionSummary === undefined ? {} : { activeCompaction: first.compactionSummary.record }),
      toolCallBatches: first.toolCallBatches,
    });
    if (plan === undefined) {
      if (assessment.exceedsAvailableInput) {
        const hasConversation = assessment.candidate.receipt.includedSegments.some((segment) =>
          segment.sourceKind === "conversation_message");
        const reason = hasConversation ? "current_turn_too_large" : "static_context_too_large";
        const prepReceipt = receipt("failed", reason, assessment);
        throw new ContextPreparationError({
          code: hasConversation ? "context.current_turn_too_large" : "context.static_context_too_large",
          safeSummary: hasConversation
            ? "当前任务输入过长，请缩短任务输入或开始新会话。"
            : "机器人说明或工具定义占用过多上下文，请减少启用的能力后重试。",
          receipt: prepReceipt,
        });
      }
      return prepared(
        assessment.candidate,
        first.messages,
        receipt("skipped", "no_eligible_old_prefix", assessment),
      );
    }

    const source = await this.#conversation.loadMessageRange(
      input.sessionId,
      plan.sourceStartSequence,
      plan.sourceEndSequence,
    );
    const sourceRangeDigest = digestConversationRange(source);
    let compacted: CompactionRunResult;
    try {
      compacted = await input.authorizeAndCompact({
        sourceStartSequence: plan.sourceStartSequence,
        sourceEndSequence: plan.sourceEndSequence,
        sourceDigest: sourceRangeDigest,
        ...(first.compactionSummary === undefined
          ? {}
          : { activeCompactionId: first.compactionSummary.record.compactionId }),
      });
    } catch (error) {
      const code = errorCode(error);
      if (code === "model.user_confirmation_required" || code === "authorization.user_rejected") {
        throw new ContextPreparationAdmissionInterruption({
          code,
          original: error,
          receipt: Object.freeze({
            ...receipt(
              code === "model.user_confirmation_required" ? "skipped" : "failed",
              code === "model.user_confirmation_required" ? "admission_pending" : "admission_rejected",
              assessment,
            ),
            sourceRangeDigest,
          }),
        });
      }
      throw error;
    }
    if (compacted.status === "failed" || compacted.status === "rejected") {
      const prepReceipt = {
        ...receipt("failed", "compaction_failed", assessment),
        sourceRangeDigest,
        ...(compacted.status === "failed" ? { compactionJobId: compacted.job.compactionJobId } : {}),
      } as ContextPreparationReceipt;
      throw new ContextPreparationError({
        code: "context.compaction_failed",
        safeSummary: "上下文压缩未完成，请重试；原始会话内容仍然保留。",
        receipt: prepReceipt,
      });
    }

    const reloaded = await this.#loadView(input);
    let final: ContextPipelineResult;
    try {
      final = this.#context.run(input.pipelineInput({ ...reloaded, requestId: input.requestId() }));
    } catch {
      const prepReceipt = {
        ...receipt("failed", "compacted_still_over_budget", assessment),
        sourceRangeDigest,
        ...(compacted.status === "completed"
          ? {
            compactionJobId: compacted.record.compactionJobId,
            compactionId: compacted.record.compactionId,
          }
          : { compactionJobId: compacted.job.compactionJobId }),
      } as ContextPreparationReceipt;
      throw new ContextPreparationError({
        code: "context.available_input_exceeded",
        safeSummary: "压缩后上下文仍然过长，请缩短任务输入或开始新会话。",
        receipt: prepReceipt,
      });
    }
    const decision = compacted.status === "completed"
      ? (compacted.replayed ? "pending_recovered" : "compacted")
      : "stale_reloaded";
    return prepared(final, reloaded.messages, Object.freeze({
      decision,
      reason: compacted.status === "stale" ? "no_eligible_old_prefix" : "below_threshold",
      initialEstimatedInputTokens: assessment.estimatedBeforeBoundedPreviewTokens,
      previewedEstimatedInputTokens: assessment.candidate.receipt.initialEstimatedInputTokens,
      finalEstimatedInputTokens: final.receipt.finalEstimatedInputTokens,
      compactionThresholdTokens: final.receipt.compactionThresholdTokens,
      availableInputTokens: final.receipt.availableInputTokens,
      sourceRangeDigest,
      ...(compacted.status === "completed"
        ? {
          compactionJobId: compacted.record.compactionJobId,
          compactionId: compacted.record.compactionId,
        }
        : { compactionJobId: compacted.job.compactionJobId }),
    }));
  }

  async #loadView(input: Readonly<{
    sessionId: string;
    snapshotId: () => string;
    createdAt: () => string;
  }>): Promise<Readonly<{
    snapshot: Awaited<ReturnType<TurnSnapshotBuilder["build"]>>;
    messages: ContextPipelineInput["conversationMessages"];
    compactionSummary?: NonNullable<ContextPipelineInput["compactionSummary"]>;
    toolCallBatches: NonNullable<ContextPipelineInput["toolCallBatches"]>;
  }>> {
    const view = await this.#views.build(input.sessionId);
    const head = await this.#conversation.loadSession(input.sessionId);
    if (head === undefined) throw new Error("Context preparation Session is unavailable");
    const from = view.activeCompaction === undefined ? 1 : view.activeCompaction.sourceEndSequence + 1;
    const snapshot = await this.#snapshots.build({
      snapshotId: input.snapshotId(),
      sessionId: input.sessionId,
      fromMessageSequence: from > head.messageSequence ? head.messageSequence + 1 : from,
      createdAt: input.createdAt(),
    });
    const toolCallBatches = head.messageSequence === 0 || from > head.messageSequence
      ? []
      : await this.#conversation.listToolCallBatchEvidenceBySessionRange(
        input.sessionId,
        from,
        head.messageSequence,
      );
    return Object.freeze({
      snapshot,
      messages: view.rawTail,
      ...(view.activeCompaction === undefined
        ? {}
        : {
          compactionSummary: {
            snapshotId: snapshot.snapshotId,
            contextRevision: head.contextRevision,
            record: view.activeCompaction,
            summaryDigest: sha256CanonicalJson(JsonValueSchema.parse(view.activeCompaction.summary)),
          },
        }),
      toolCallBatches,
    });
  }
}

function receipt(
  decision: ContextPreparationDecision,
  reason: ContextPreparationReason,
  assessment: ReturnType<ContextPipeline["assess"]>,
): ContextPreparationReceipt {
  return Object.freeze({
    decision,
    reason,
    initialEstimatedInputTokens: assessment.estimatedBeforeBoundedPreviewTokens,
    previewedEstimatedInputTokens: assessment.candidate.receipt.initialEstimatedInputTokens,
    finalEstimatedInputTokens: assessment.candidate.receipt.finalEstimatedInputTokens,
    compactionThresholdTokens: assessment.candidate.receipt.compactionThresholdTokens,
    availableInputTokens: assessment.candidate.receipt.availableInputTokens,
  });
}

function prepared(
  context: ContextPipelineResult,
  messages: ContextPipelineInput["conversationMessages"],
  preparationReceipt: ContextPreparationReceipt,
): PreparedContext {
  return Object.freeze({
    request: context.request,
    context,
    receipt: preparationReceipt,
    conversationMessages: Object.freeze([...messages]),
  });
}

function errorCode(error: unknown): unknown {
  return error instanceof Error && "code" in error
    ? (error as Error & { code?: unknown }).code
    : undefined;
}
