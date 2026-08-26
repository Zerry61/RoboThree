import {
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  ProviderNeutralMessageSchema,
  type AssistantToolCall,
  type ProviderNeutralMessage,
  type RuntimeError,
} from "@robothree/contracts";
import { createHash } from "node:crypto";

import type { AgentToolCallExecutor } from "../ports/agent-tool-call-executor.js";
import type {
  AssistantConversationMessage,
  ConversationPersistence,
  ToolCallBatchCommit,
  ToolResultConversationMessage,
} from "../ports/conversation-persistence.js";
import type { Clock } from "../ports/clock.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import {
  TOOL_CALL_BATCH_SCHEMA_VERSION,
  calculateToolCallBatchDigest,
  type ToolCallBatchRecord,
  type ToolCallDisposition,
  type ToolCallDispositionRecord,
} from "../persistence/tool-call-batch.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

type ToolResultMessage = Extract<ProviderNeutralMessage, { role: "tool" }>;

export type ToolCallBatchDispatchResult =
  | Readonly<{
    status: "completed";
    batch: ToolCallBatchRecord;
    results: readonly ToolResultMessage[];
  }>
  | Readonly<{
    status: "waiting_user_confirmation";
    batch: ToolCallBatchRecord;
    call: AssistantToolCall;
    confirmationId: string;
  }>
  | Readonly<{
    status: "cancelled";
    batch: ToolCallBatchRecord;
  }>
  | Readonly<{
    status: "denied" | "failed";
    batch: ToolCallBatchRecord;
    error: RuntimeError;
  }>;

export type RecoverToolCallBatchesInput = Readonly<{
  sessionId?: string;
  taskId?: string;
  runId?: string;
}>;

/**
 * Application owner for ADR-017 ordered Tool Call batches. Conversation facts
 * and Task/Effect facts remain in their existing persistence boundaries; this
 * coordinator only applies the frozen ordering and reconciliation rules.
 */
export class ToolCallBatchCoordinator {
  readonly #conversation: ConversationPersistence;
  readonly #tasks: TaskPersistence;
  readonly #tools: AgentToolCallExecutor;
  readonly #clock: Clock;
  readonly #mailboxes = new Map<string, Promise<void>>();

  constructor(input: {
    conversation: ConversationPersistence;
    tasks: TaskPersistence;
    tools: AgentToolCallExecutor;
    clock: Clock;
  }) {
    this.#conversation = input.conversation;
    this.#tasks = input.tasks;
    this.#tools = input.tools;
    this.#clock = input.clock;
  }

  async appendAssistantBatch(input: {
    messageId: string;
    sessionId: string;
    taskId: string;
    runId: string;
    text: string;
    toolCalls: readonly AssistantToolCall[];
  }): Promise<ToolCallBatchCommit> {
    if (input.toolCalls.length === 0) {
      throw new Error("A Tool Call batch requires at least one Tool Call");
    }
    if (input.toolCalls.some((call) => call.taskId !== input.taskId)) {
      throw new Error("Tool Call batch cannot span durable Tasks");
    }
    const batchId = stableUuid(input.messageId, "tool-call-batch");
    const existing = await this.#conversation.loadToolCallBatch(batchId);
    if (existing !== undefined) {
      return this.#loadExactCommit(existing, input);
    }
    const head = await this.#conversation.loadSession(input.sessionId);
    if (head === undefined) {
      throw new Error(`Agent conversation session not found: ${input.sessionId}`);
    }
    const createdAt = this.#clock.now();
    const providerMessage: AssistantConversationMessage["message"] = {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "assistant",
      content: input.text.length === 0 ? [] : [{ type: "text", text: input.text }],
      toolCalls: [...input.toolCalls],
    };
    const message: AssistantConversationMessage = {
      envelope: {
        schemaVersion: CONVERSATION_SCHEMA_VERSION,
        messageId: input.messageId,
        sessionId: input.sessionId,
        sequence: head.messageSequence + 1,
        messageSchemaVersion: MODEL_PROTOCOL_VERSION,
        messageDigest: sha256CanonicalJson(JsonValueSchema.parse(providerMessage)),
        taskId: input.taskId,
        createdAt,
      },
      message: providerMessage,
    };
    const batch: ToolCallBatchRecord = {
      schemaVersion: TOOL_CALL_BATCH_SCHEMA_VERSION,
      batchId,
      sessionId: input.sessionId,
      taskId: input.taskId,
      runId: input.runId,
      assistantMessageId: input.messageId,
      assistantMessageSequence: message.envelope.sequence,
      assistantMessageDigest: message.envelope.messageDigest,
      batchDigest: calculateToolCallBatchDigest({
        sessionId: input.sessionId,
        taskId: input.taskId,
        runId: input.runId,
        assistantMessageId: input.messageId,
        assistantMessageSequence: message.envelope.sequence,
        assistantMessageDigest: message.envelope.messageDigest,
        toolCalls: input.toolCalls,
      }),
      callCount: input.toolCalls.length,
      createdAt,
    };
    const dispositions = input.toolCalls.map((call, ordinal) => ({
      schemaVersion: TOOL_CALL_BATCH_SCHEMA_VERSION,
      batchId,
      toolCallId: call.toolCallId,
      actionId: call.actionId,
      ordinal,
      disposition: "ready_to_dispatch" as const,
      revision: 0,
      updatedAt: createdAt,
    }));
    const committed = await this.#conversation.appendAssistantToolCallBatch({
      expectedMessageSequence: head.messageSequence,
      message,
      batch,
      dispositions,
      updatedAt: createdAt,
    });
    if (!committed.ok) {
      throw new Error(`${committed.error.code}: ${committed.error.message}`);
    }
    return committed.value;
  }

  dispatchBatch(
    batchId: string,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<ToolCallBatchDispatchResult> {
    return this.#enqueue(batchId, () => this.#dispatchBatch(batchId, signal));
  }

  async recover(
    input: RecoverToolCallBatchesInput = {},
    signal: AbortSignal = new AbortController().signal,
  ): Promise<readonly ToolCallBatchDispatchResult[]> {
    const candidates = (await this.#conversation.listRecoverableToolCallBatches())
      .filter((batch) => input.sessionId === undefined || batch.sessionId === input.sessionId)
      .filter((batch) => input.taskId === undefined || batch.taskId === input.taskId)
      .filter((batch) => input.runId === undefined || batch.runId === input.runId);
    const outcomes: ToolCallBatchDispatchResult[] = [];
    for (const batch of candidates) {
      if (signal.aborted) break;
      outcomes.push(await this.dispatchBatch(batch.batchId, signal));
    }
    return Object.freeze(outcomes);
  }

  async #dispatchBatch(
    batchId: string,
    signal: AbortSignal,
  ): Promise<ToolCallBatchDispatchResult> {
    const { batch, calls } = await this.#loadBatchContext(batchId);
    let task = await this.#tasks.loadTask(batch.taskId);
    if (task === undefined) {
      return failed(batch, "agent.batch_task_not_found", "Tool Call batch Task is unavailable");
    }

    for (let ordinal = 0; ordinal < calls.length; ordinal += 1) {
      const call = calls[ordinal]!;
      let disposition = await this.#requireDisposition(batch, call);

      if (disposition.disposition === "result_committed") continue;

      task = await this.#tasks.loadTask(batch.taskId);
      if (task === undefined) {
        return failed(batch, "agent.batch_task_not_found", "Tool Call batch Task is unavailable");
      }
      const activeExactRun = (
        (task.checkpoint.state.status === "running" || task.checkpoint.state.status === "waiting")
        && task.checkpoint.state.activeRunId === batch.runId
      );

      if (disposition.disposition === "waiting_user_confirmation") {
        if (!activeExactRun || signal.aborted) {
          await this.#settleUnlinked(batch, ordinal, "cancelled_before_dispatch");
          return { status: "cancelled", batch };
        }
        const confirmation = await this.#tasks.loadUserConfirmation(
          disposition.confirmationId!,
        );
        if (confirmation === undefined) {
          return failed(
            batch,
            "agent.confirmation_fact_missing",
            "Durable Tool confirmation fact is unavailable",
          );
        }
        if (confirmation.decision === undefined) {
          await this.#blockLaterCalls(batch, ordinal + 1);
          return {
            status: "waiting_user_confirmation",
            batch,
            call,
            confirmationId: disposition.confirmationId!,
          };
        }
        if (confirmation.decision.decision === "rejected") {
          await this.#settleUnlinked(batch, ordinal, "denied_before_dispatch");
          return denied(batch, "authorization.user_rejected", "The user rejected this exact Tool Action");
        }
        disposition = await this.#transition(disposition, "ready_to_dispatch");
      }

      if (disposition.disposition === "blocked_by_prior_confirmation") {
        if (!activeExactRun || signal.aborted) {
          await this.#settleUnlinked(batch, ordinal, "cancelled_before_dispatch");
          return { status: "cancelled", batch };
        }
        if (await this.#hasUnresolvedPriorConfirmation(batch, ordinal)) {
          const prior = (await this.#conversation.listToolCallDispositions(batch.batchId))
            .find((record) => record.disposition === "waiting_user_confirmation");
          if (prior?.confirmationId === undefined) {
            return failed(batch, "agent.confirmation_order_invalid", "Blocked Tool Call has no prior confirmation point");
          }
          const priorCall = calls[prior.ordinal];
          if (priorCall === undefined) {
            return failed(batch, "agent.batch_integrity_violation", "Blocked Tool Call ordinal is invalid");
          }
          return {
            status: "waiting_user_confirmation",
            batch,
            call: priorCall,
            confirmationId: prior.confirmationId,
          };
        }
        disposition = await this.#transition(disposition, "ready_to_dispatch");
      }

      if (disposition.disposition === "ready_to_dispatch") {
        const reconciled = await this.#findExactEffect(batch, disposition);
        if (reconciled !== undefined) {
          disposition = await this.#linkEffect(disposition, reconciled);
        }
      }

      if (!activeExactRun || signal.aborted) {
        if (disposition.disposition !== "effect_linked") {
          await this.#settleUnlinked(batch, ordinal, "cancelled_before_dispatch");
        } else {
          await this.#settleUnlinked(batch, ordinal + 1, "cancelled_before_dispatch");
        }
        return { status: "cancelled", batch };
      }

      if (disposition.disposition !== "ready_to_dispatch"
        && disposition.disposition !== "effect_linked") {
        if (disposition.disposition === "cancelled_before_dispatch") {
          return { status: "cancelled", batch };
        }
        if (disposition.disposition === "denied_before_dispatch") {
          return denied(batch, "authorization.tool_denied", "Tool Call batch was denied before dispatch");
        }
        return failed(batch, "agent.batch_disposition_invalid", "Tool Call disposition cannot be dispatched");
      }

      if (disposition.disposition === "effect_linked") {
        const restored = await this.#tools.loadResult?.(call, disposition.effectAttemptId!);
        if (restored !== undefined) {
          await this.#commitResult(batch, disposition, call, restored);
          continue;
        }
      }

      try {
        const executed = await this.#tools.execute(call, signal, {
          onEffectPrepared: async (effectAttemptId) => {
            disposition = await this.#linkEffect(disposition, effectAttemptId);
          },
        });
        if ("status" in executed && executed.status === "waiting_user_confirmation") {
          if (disposition.disposition !== "ready_to_dispatch") {
            return failed(batch, "agent.confirmation_after_effect", "Confirmation cannot be requested after Effect preparation");
          }
          await this.#transition(disposition, "waiting_user_confirmation", {
            confirmationId: executed.request.confirmationId,
          });
          await this.#blockLaterCalls(batch, ordinal + 1);
          return {
            status: "waiting_user_confirmation",
            batch,
            call,
            confirmationId: executed.request.confirmationId,
          };
        }
        if ("status" in executed && executed.status === "denied") {
          if (disposition.disposition === "effect_linked") {
            return failed(batch, "agent.denial_after_effect", "A prepared Effect cannot become a pre-dispatch denial");
          }
          await this.#settleUnlinked(batch, ordinal, "denied_before_dispatch");
          return { status: "denied", batch, error: executed.error };
        }
        if (disposition.disposition !== "effect_linked") {
          return failed(batch, "agent.effect_link_missing", "Tool result arrived without a durable Effect link");
        }
        const result = validateToolResult(call, executed);
        await this.#commitResult(batch, disposition, call, result);
      } catch (cause) {
        if (signal.aborted) {
          const current = await this.#requireDisposition(batch, call);
          await this.#settleUnlinked(
            batch,
            current.disposition === "effect_linked" ? ordinal + 1 : ordinal,
            "cancelled_before_dispatch",
          );
          return { status: "cancelled", batch };
        }
        return failed(
          batch,
          "agent.tool_execution_failed",
          cause instanceof Error ? cause.message : "Tool execution failed",
        );
      }
    }

    const results = await this.#loadCompleteResults(batch, calls);
    if (results === undefined) {
      const dispositions = await this.#conversation.listToolCallDispositions(batch.batchId);
      if (dispositions.some((record) => record.disposition === "cancelled_before_dispatch")) {
        return { status: "cancelled", batch };
      }
      if (dispositions.some((record) => record.disposition === "denied_before_dispatch")) {
        return denied(batch, "authorization.tool_denied", "Tool Call batch was denied before dispatch");
      }
      return failed(batch, "agent.provider_message_incomplete", "Tool Call batch is not complete enough for the next Model Request");
    }
    return { status: "completed", batch, results };
  }

  async #loadExactCommit(
    batch: ToolCallBatchRecord,
    input: {
      messageId: string;
      sessionId: string;
      taskId: string;
      runId: string;
      text: string;
      toolCalls: readonly AssistantToolCall[];
    },
  ): Promise<ToolCallBatchCommit> {
    const message = await this.#conversation.loadMessageById(batch.assistantMessageId);
    const dispositions = await this.#conversation.listToolCallDispositions(batch.batchId);
    if (
      message === undefined
      || message.message.role !== "assistant"
      || batch.sessionId !== input.sessionId
      || batch.taskId !== input.taskId
      || batch.runId !== input.runId
      || batch.assistantMessageId !== input.messageId
      || message.message.content.map((part) => part.text).join("") !== input.text
      || sha256CanonicalJson(JsonValueSchema.parse(message.message.toolCalls))
        !== sha256CanonicalJson(JsonValueSchema.parse(input.toolCalls))
      || dispositions.length !== input.toolCalls.length
    ) {
      throw new Error("persistence.tool_call_batch_conflict: stable Assistant batch identity drifted");
    }
    return {
      message: { envelope: message.envelope, message: message.message },
      batch,
      dispositions,
    };
  }

  async #loadBatchContext(batchId: string): Promise<{
    batch: ToolCallBatchRecord;
    calls: readonly AssistantToolCall[];
  }> {
    const batch = await this.#conversation.loadToolCallBatch(batchId);
    if (batch === undefined) throw new Error(`Tool Call batch not found: ${batchId}`);
    const message = await this.#conversation.loadMessageById(batch.assistantMessageId);
    if (message === undefined || message.message.role !== "assistant") {
      throw new Error("Tool Call batch Assistant Message is unavailable");
    }
    const expectedDigest = calculateToolCallBatchDigest({
      sessionId: batch.sessionId,
      taskId: batch.taskId,
      runId: batch.runId,
      assistantMessageId: batch.assistantMessageId,
      assistantMessageSequence: batch.assistantMessageSequence,
      assistantMessageDigest: batch.assistantMessageDigest,
      toolCalls: message.message.toolCalls,
    });
    if (
      message.envelope.sessionId !== batch.sessionId
      || message.envelope.taskId !== batch.taskId
      || message.envelope.sequence !== batch.assistantMessageSequence
      || message.envelope.messageDigest !== batch.assistantMessageDigest
      || message.message.toolCalls.length !== batch.callCount
      || expectedDigest !== batch.batchDigest
    ) throw new Error("Tool Call batch durable identities do not agree");
    return { batch, calls: Object.freeze([...message.message.toolCalls]) };
  }

  async #requireDisposition(
    batch: ToolCallBatchRecord,
    call: AssistantToolCall,
  ): Promise<ToolCallDispositionRecord> {
    const disposition = await this.#conversation.loadToolCallDisposition(
      batch.batchId,
      call.toolCallId,
    );
    if (
      disposition === undefined
      || disposition.actionId !== call.actionId
      || disposition.batchId !== batch.batchId
    ) throw new Error("Tool Call disposition identity is unavailable");
    return disposition;
  }

  async #transition(
    current: ToolCallDispositionRecord,
    disposition: ToolCallDisposition,
    extra: { confirmationId?: string; effectAttemptId?: string } = {},
  ): Promise<ToolCallDispositionRecord> {
    const next: ToolCallDispositionRecord = {
      schemaVersion: TOOL_CALL_BATCH_SCHEMA_VERSION,
      batchId: current.batchId,
      toolCallId: current.toolCallId,
      actionId: current.actionId,
      ordinal: current.ordinal,
      disposition,
      revision: current.revision + 1,
      ...extra,
      updatedAt: this.#clock.now(),
    };
    const transitioned = await this.#conversation.transitionToolCallDisposition({
      batchId: current.batchId,
      toolCallId: current.toolCallId,
      expectedRevision: current.revision,
      next,
    });
    if (transitioned.ok) return transitioned.value;
    const latest = await this.#conversation.loadToolCallDisposition(
      current.batchId,
      current.toolCallId,
    );
    if (
      latest !== undefined
      && latest.disposition === disposition
      && latest.confirmationId === extra.confirmationId
      && latest.effectAttemptId === extra.effectAttemptId
    ) return latest;
    throw new Error(`${transitioned.error.code}: ${transitioned.error.message}`);
  }

  async #linkEffect(
    current: ToolCallDispositionRecord,
    effectAttemptId: string,
  ): Promise<ToolCallDispositionRecord> {
    const latest = await this.#conversation.loadToolCallDisposition(
      current.batchId,
      current.toolCallId,
    );
    if (latest === undefined) throw new Error("Tool Call disposition disappeared");
    if (latest.disposition === "effect_linked") {
      if (latest.effectAttemptId !== effectAttemptId) {
        throw new Error("Tool Call disposition is linked to another Effect Attempt");
      }
      return latest;
    }
    if (latest.disposition === "result_committed") {
      if (latest.effectAttemptId !== effectAttemptId) {
        throw new Error("Tool Call result belongs to another Effect Attempt");
      }
      return latest;
    }
    if (latest.disposition !== "ready_to_dispatch") {
      throw new Error("Only a dispatch-ready Tool Call can link an Effect Attempt");
    }
    return this.#transition(latest, "effect_linked", { effectAttemptId });
  }

  async #findExactEffect(
    batch: ToolCallBatchRecord,
    disposition: ToolCallDispositionRecord,
  ): Promise<string | undefined> {
    const matches = (await this.#tasks.listEffectAttemptsByTask(batch.taskId))
      .filter((attempt) => attempt.runId === batch.runId)
      .filter((attempt) => attempt.actionId === disposition.actionId);
    if (matches.length > 1) {
      throw new Error("Multiple Effect Attempts claim one Tool Call action");
    }
    return matches[0]?.effectAttemptId;
  }

  async #commitResult(
    batch: ToolCallBatchRecord,
    disposition: ToolCallDispositionRecord,
    call: AssistantToolCall,
    candidate: ToolResultMessage,
  ): Promise<void> {
    const result = validateToolResult(call, candidate);
    const current = await this.#requireDisposition(batch, call);
    if (current.disposition === "result_committed") return;
    if (
      current.disposition !== "effect_linked"
      || current.effectAttemptId !== disposition.effectAttemptId
    ) throw new Error("Tool Result requires the exact durable Effect link");
    const messageId = stableUuid(call.toolCallId, `tool-result:${current.effectAttemptId}`);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const head = await this.#conversation.loadSession(batch.sessionId);
      if (head === undefined) throw new Error("Tool Result Session is unavailable");
      const createdAt = this.#clock.now();
      const message: ToolResultConversationMessage = {
        envelope: {
          schemaVersion: CONVERSATION_SCHEMA_VERSION,
          messageId,
          sessionId: batch.sessionId,
          sequence: head.messageSequence + 1,
          messageSchemaVersion: MODEL_PROTOCOL_VERSION,
          messageDigest: sha256CanonicalJson(JsonValueSchema.parse(result)),
          taskId: batch.taskId,
          createdAt,
        },
        message: result,
      };
      const committed = await this.#conversation.appendToolResultAndCompleteDisposition({
        expectedMessageSequence: head.messageSequence,
        expectedDispositionRevision: current.revision,
        batchId: batch.batchId,
        toolCallId: call.toolCallId,
        message,
        completedDisposition: {
          schemaVersion: TOOL_CALL_BATCH_SCHEMA_VERSION,
          batchId: batch.batchId,
          toolCallId: call.toolCallId,
          actionId: call.actionId,
          ordinal: current.ordinal,
          disposition: "result_committed",
          revision: current.revision + 1,
          effectAttemptId: current.effectAttemptId,
          resultMessageId: messageId,
          resultDigest: result.resultDigest,
          updatedAt: createdAt,
        },
        updatedAt: createdAt,
      });
      if (committed.ok) return;
      if (committed.error.code !== "persistence.message_sequence_conflict") {
        throw new Error(`${committed.error.code}: ${committed.error.message}`);
      }
    }
    throw new Error("Tool Result message sequence did not converge");
  }

  async #blockLaterCalls(batch: ToolCallBatchRecord, startOrdinal: number): Promise<void> {
    const dispositions = await this.#conversation.listToolCallDispositions(batch.batchId);
    for (const record of dispositions.filter((candidate) => candidate.ordinal >= startOrdinal)) {
      if (record.disposition === "ready_to_dispatch") {
        await this.#transition(record, "blocked_by_prior_confirmation");
      } else if (record.disposition !== "blocked_by_prior_confirmation") {
        throw new Error("A later Tool Call advanced beyond its prior confirmation point");
      }
    }
  }

  async #settleUnlinked(
    batch: ToolCallBatchRecord,
    startOrdinal: number,
    target: "cancelled_before_dispatch" | "denied_before_dispatch",
  ): Promise<void> {
    const dispositions = await this.#conversation.listToolCallDispositions(batch.batchId);
    for (const record of dispositions.filter((candidate) => candidate.ordinal >= startOrdinal)) {
      if (
        record.disposition === "ready_to_dispatch"
        || record.disposition === "waiting_user_confirmation"
        || record.disposition === "blocked_by_prior_confirmation"
      ) await this.#transition(record, target);
    }
  }

  async #hasUnresolvedPriorConfirmation(
    batch: ToolCallBatchRecord,
    ordinal: number,
  ): Promise<boolean> {
    return (await this.#conversation.listToolCallDispositions(batch.batchId))
      .some((record) => record.ordinal < ordinal
        && record.disposition === "waiting_user_confirmation");
  }

  async #loadCompleteResults(
    batch: ToolCallBatchRecord,
    calls: readonly AssistantToolCall[],
  ): Promise<readonly ToolResultMessage[] | undefined> {
    const dispositions = await this.#conversation.listToolCallDispositions(batch.batchId);
    if (
      dispositions.length !== calls.length
      || dispositions.some((record) => record.disposition !== "result_committed")
    ) return undefined;
    const results: ToolResultMessage[] = [];
    for (const [ordinal, disposition] of dispositions.entries()) {
      const call = calls[ordinal];
      const message = disposition.resultMessageId === undefined
        ? undefined
        : await this.#conversation.loadMessageById(disposition.resultMessageId);
      if (
        call === undefined
        || message === undefined
        || message.message.role !== "tool"
      ) return undefined;
      results.push(validateToolResult(call, message.message));
    }
    if (new Set(results.map((result) => result.toolCallId)).size !== calls.length) {
      throw new Error("Provider Tool Result identities are not one-to-one");
    }
    return Object.freeze(results);
  }

  #enqueue<T>(batchId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#mailboxes.get(batchId) ?? Promise.resolve();
    const result = previous.then(operation);
    const settled = result.then(() => undefined, () => undefined);
    this.#mailboxes.set(batchId, settled);
    void settled.finally(() => {
      if (this.#mailboxes.get(batchId) === settled) this.#mailboxes.delete(batchId);
    });
    return result;
  }
}

function validateToolResult(
  call: AssistantToolCall,
  candidate: ToolResultMessage,
): ToolResultMessage {
  const parsed = ProviderNeutralMessageSchema.parse(candidate);
  if (
    parsed.role !== "tool"
    || parsed.schemaVersion !== MODEL_PROTOCOL_VERSION
    || parsed.toolCallId !== call.toolCallId
    || parsed.taskId !== call.taskId
    || parsed.actionId !== call.actionId
  ) throw new Error("Tool Result does not match its durable Tool Call");
  return parsed;
}

function stableUuid(identity: string, label: string): string {
  const bytes = createHash("sha256")
    .update(`${identity}:${label}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function failed(
  batch: ToolCallBatchRecord,
  code: string,
  message: string,
): ToolCallBatchDispatchResult {
  return {
    status: "failed",
    batch,
    error: { code, category: "internal", message, retryable: false },
  };
}

function denied(
  batch: ToolCallBatchRecord,
  code: string,
  message: string,
): ToolCallBatchDispatchResult {
  return {
    status: "denied",
    batch,
    error: { code, category: "authorization", message, retryable: false },
  };
}
