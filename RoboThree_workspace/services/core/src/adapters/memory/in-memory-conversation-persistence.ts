import {
  CompactionJobSchema,
  CompactionRecordSchema,
  ConversationMessageSchema,
  EntityIdSchema,
  JsonValueSchema,
  ProviderNeutralMessageSchema,
  Sha256DigestSchema,
  SessionCommandReceiptSchema,
  SessionEventSchema,
  SessionHeadSchema,
} from "@robothree/contracts";
import type {
  CompactionJob,
  CompactionRecord,
  ComponentHealth,
  ConversationMessage,
  SessionCommandReceipt,
  SessionEvent,
  SessionHead,
} from "@robothree/contracts";

import type { Clock } from "../../ports/clock.js";
import type {
  AppendConversationMessageInput,
  AppendAssistantToolCallBatchInput,
  AppendToolResultAndCompleteDispositionInput,
  CommitCompactionInput,
  ConversationPersistence,
  ConversationPersistenceFaultInjector,
  ConversationWriteFailure,
  ConversationWriteResult,
  PreparedConversationMessage,
  RequestCompactionInput,
  SessionOutboxRecord,
  TerminateCompactionInput,
  ToolCallBatchCommit,
  TransitionToolCallDispositionInput,
} from "../../ports/conversation-persistence.js";
import {
  conversationFailure,
  digestConversationRange,
  validateCommitCompaction,
  validateMessageAppend,
  validateRequestCompaction,
  validateSessionCreation,
  validateTerminateCompaction,
} from "../../persistence/conversation-validation.js";
import { sha256CanonicalJson } from "../../persistence/digest.js";
import {
  ToolCallBatchRecordSchema,
  ToolCallDispositionRecordSchema,
  cloneToolCallBatchCommit,
  haveSameToolCallDispositionIdentities,
  isAllowedToolCallDispositionTransition,
  isValidToolResultCompletionTransition,
  validateAssistantToolCallBatchAppend,
  validateToolCallDispositionTransition,
  validateToolResultCompletion,
  type ToolCallBatchRecord,
  type ToolCallDispositionRecord,
} from "../../persistence/tool-call-batch.js";
import {
  ReadableCompactionExecutionBindingSchema,
  type ReadableCompactionExecutionBinding,
} from "../../persistence/compaction-execution-binding.js";
import {
  InMemoryCompactionModelInvocationLinks,
  memoryCompactionInvocationMethods,
} from "./in-memory-compaction-model-invocation-link-persistence.js";
import type {
  PrepareCompactionModelInvocationLinkInput,
} from "../../ports/compaction-model-invocation-link-persistence.js";

export class InMemoryConversationPersistence implements ConversationPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.conversation.memory";
  readonly #clock: Clock;
  readonly #faultInjector: ConversationPersistenceFaultInjector | undefined;
  readonly #heads = new Map<string, SessionHead>();
  readonly #preparedMessages = new Map<string, PreparedConversationMessage>();
  readonly #messages = new Map<string, Map<number, ConversationMessage>>();
  readonly #messageIds = new Set<string>();
  readonly #toolCallBatches = new Map<string, ToolCallBatchRecord>();
  readonly #toolCallDispositions = new Map<string, Map<string, ToolCallDispositionRecord>>();
  readonly #events = new Map<string, Map<number, SessionEvent>>();
  readonly #eventIds = new Set<string>();
  readonly #receipts = new Map<string, SessionCommandReceipt>();
  readonly #jobs = new Map<string, CompactionJob>();
  readonly #executionBindings = new Map<string, ReadableCompactionExecutionBinding>();
  readonly #records = new Map<string, CompactionRecord>();
  readonly #outbox = new Map<string, SessionOutboxRecord>();
  readonly #compactionInvocationLinks = new InMemoryCompactionModelInvocationLinks();
  #started = false;

  constructor(input: {
    clock: Clock;
    faultInjector?: ConversationPersistenceFaultInjector;
  }) {
    this.#clock = input.clock;
    this.#faultInjector = input.faultInjector;
  }

  async start(): Promise<void> {
    this.#started = true;
  }

  async stop(): Promise<void> {
    this.#started = false;
  }

  async health(): Promise<ComponentHealth> {
    return {
      componentId: this.componentId,
      status: this.#started ? "ready" : "unavailable",
      checkedAt: this.#clock.now(),
    };
  }

  async createSession(head: SessionHead): Promise<ConversationWriteResult<SessionHead>> {
    this.#requireStarted();
    const validated = validateSessionCreation(head);
    if ("ok" in validated) return validated;
    const existing = this.#heads.get(validated.sessionId);
    if (existing !== undefined) {
      return sameJson(existing, validated)
        ? { ok: true, replayed: true, value: cloneHead(existing) }
        : conversationFailure("persistence.session_initialization_conflict", "sessionId already exists");
    }
    this.#heads.set(validated.sessionId, cloneHead(validated));
    return { ok: true, replayed: false, value: cloneHead(validated) };
  }

  async loadSession(sessionId: string): Promise<SessionHead | undefined> {
    this.#requireStarted();
    const head = this.#heads.get(sessionId);
    return head === undefined ? undefined : cloneHead(head);
  }

  async prepareMessage(
    input: PreparedConversationMessage,
  ): Promise<ConversationWriteResult<PreparedConversationMessage>> {
    this.#requireStarted();
    const validated = validatePreparedMessage(input);
    if (!validated.ok) return validated;
    if (!this.#heads.has(validated.value.sessionId)) {
      return conversationFailure("persistence.session_not_found", "session does not exist");
    }
    const appended = await this.loadMessageById(validated.value.messageId);
    if (appended !== undefined) {
      return appended.envelope.sessionId === validated.value.sessionId
        && appended.envelope.taskId === validated.value.taskId
        && appended.envelope.messageDigest === validated.value.messageDigest
        && sameJson(appended.message, validated.value.message)
        ? { ok: true, replayed: true, value: clonePrepared(validated.value) }
        : conversationFailure("persistence.message_intent_conflict", "messageId already has different content");
    }
    const existing = this.#preparedMessages.get(validated.value.messageId);
    if (existing !== undefined) {
      return sameJson(existing, validated.value)
        ? { ok: true, replayed: true, value: clonePrepared(existing) }
        : conversationFailure("persistence.message_intent_conflict", "messageId already has another intent");
    }
    this.#preparedMessages.set(
      validated.value.messageId,
      clonePrepared(validated.value),
    );
    return { ok: true, replayed: false, value: clonePrepared(validated.value) };
  }

  async loadPreparedMessage(
    messageId: string,
  ): Promise<PreparedConversationMessage | undefined> {
    this.#requireStarted();
    const intent = this.#preparedMessages.get(messageId);
    return intent === undefined ? undefined : clonePrepared(intent);
  }

  async appendPreparedMessage(
    messageId: string,
    updatedAt: string,
  ): Promise<ConversationWriteResult<ConversationMessage>> {
    this.#requireStarted();
    const existing = await this.loadMessageById(messageId);
    if (existing !== undefined) {
      return { ok: true, replayed: true, value: cloneMessage(existing) };
    }
    const intent = this.#preparedMessages.get(messageId);
    if (intent === undefined) {
      return conversationFailure(
        "persistence.message_intent_not_found",
        "prepared message does not exist",
      );
    }
    const head = this.#heads.get(intent.sessionId);
    if (head === undefined) {
      return conversationFailure("persistence.session_not_found", "session does not exist");
    }
    const message = ConversationMessageSchema.parse({
      envelope: {
        schemaVersion: "v1alpha1",
        messageId: intent.messageId,
        sessionId: intent.sessionId,
        sequence: head.messageSequence + 1,
        messageSchemaVersion: intent.message.schemaVersion,
        messageDigest: intent.messageDigest,
        taskId: intent.taskId,
        createdAt: intent.createdAt,
      },
      message: intent.message,
    });
    const appended = await this.appendMessage({
      expectedMessageSequence: head.messageSequence,
      message,
      updatedAt,
    });
    if (appended.ok) this.#preparedMessages.delete(messageId);
    return appended;
  }

  async loadMessageById(messageId: string): Promise<ConversationMessage | undefined> {
    this.#requireStarted();
    const message = this.#findMessageById(messageId);
    return message === undefined ? undefined : cloneMessage(message);
  }

  async appendMessage(
    input: AppendConversationMessageInput,
  ): Promise<ConversationWriteResult<ConversationMessage>> {
    this.#requireStarted();
    const validated = validateMessageAppend(input);
    if ("ok" in validated) return validated;
    const envelope = validated.message.envelope;
    const head = this.#heads.get(envelope.sessionId);
    if (head === undefined) return conversationFailure("persistence.session_not_found", "session does not exist");
    const messages = this.#messages.get(head.sessionId) ?? new Map();
    const atSequence = messages.get(envelope.sequence);
    if (atSequence !== undefined && sameJson(atSequence, validated.message)) {
      return { ok: true, replayed: true, value: cloneMessage(atSequence) };
    }
    if (
      head.messageSequence !== validated.expectedMessageSequence
      || envelope.sequence !== validated.expectedMessageSequence + 1
    ) return conversationFailure("persistence.message_sequence_conflict", "message sequence changed");
    if (atSequence !== undefined || this.#messageIds.has(envelope.messageId)) {
      return conversationFailure("persistence.duplicate_message", "message sequence or messageId already exists");
    }
    messages.set(envelope.sequence, cloneMessage(validated.message));
    this.#messages.set(head.sessionId, messages);
    this.#messageIds.add(envelope.messageId);
    this.#heads.set(head.sessionId, cloneHead({
      ...head,
      messageSequence: envelope.sequence,
      updatedAt: validated.updatedAt,
    }));
    return { ok: true, replayed: false, value: cloneMessage(validated.message) };
  }

  async appendAssistantToolCallBatch(
    input: AppendAssistantToolCallBatchInput,
  ): Promise<ConversationWriteResult<ToolCallBatchCommit>> {
    this.#requireStarted();
    const validated = validateAssistantToolCallBatchAppend(input);
    if ("ok" in validated) return validated;
    const head = this.#heads.get(validated.batch.sessionId);
    if (head === undefined) {
      return conversationFailure("persistence.session_not_found", "session does not exist");
    }
    const existing = this.#toolCallBatches.get(validated.batch.batchId);
    const existingMessage = this.#findMessageById(validated.message.envelope.messageId);
    const existingDispositions = this.#toolCallDispositions.get(validated.batch.batchId);
    if (existing !== undefined || existingMessage !== undefined || existingDispositions !== undefined) {
      if (existing !== undefined
        && existingMessage !== undefined
        && existingMessage.message.role === "assistant"
        && existingDispositions !== undefined
        && sameJson(existing, validated.batch)
        && sameJson(existingMessage, validated.message)
        && haveSameToolCallDispositionIdentities(
          [...existingDispositions.values()].sort((left, right) => left.ordinal - right.ordinal),
          validated.dispositions,
        )) {
        return {
          ok: true,
          replayed: true,
          value: cloneToolCallBatchCommit({
            message: {
              envelope: existingMessage.envelope,
              message: existingMessage.message,
            },
            batch: existing,
            dispositions: [...existingDispositions.values()]
              .sort((left, right) => left.ordinal - right.ordinal),
          }),
        };
      }
      return conversationFailure(
        "persistence.tool_call_batch_conflict",
        "batch identity already exists with different or incomplete facts",
      );
    }
    const messages = this.#messages.get(head.sessionId) ?? new Map();
    if (
      head.messageSequence !== validated.expectedMessageSequence
      || validated.message.envelope.sequence !== validated.expectedMessageSequence + 1
    ) {
      return conversationFailure(
        "persistence.message_sequence_conflict",
        "message sequence changed",
      );
    }
    if (
      messages.has(validated.message.envelope.sequence)
      || this.#messageIds.has(validated.message.envelope.messageId)
    ) {
      return conversationFailure(
        "persistence.duplicate_message",
        "message sequence or messageId already exists",
      );
    }
    if ([...this.#toolCallBatches.values()].some((record) =>
      record.assistantMessageId === validated.batch.assistantMessageId
      || record.batchDigest === validated.batch.batchDigest)) {
      return conversationFailure(
        "persistence.tool_call_batch_conflict",
        "assistant message or batch digest already belongs to another batch",
      );
    }

    this.#faultInjector?.("append_assistant_batch.after_message");
    this.#faultInjector?.("append_assistant_batch.after_batch");

    messages.set(validated.message.envelope.sequence, cloneMessage(validated.message));
    this.#messages.set(head.sessionId, messages);
    this.#messageIds.add(validated.message.envelope.messageId);
    this.#toolCallBatches.set(validated.batch.batchId, cloneBatch(validated.batch));
    this.#toolCallDispositions.set(
      validated.batch.batchId,
      new Map(validated.dispositions.map((record) => [record.toolCallId, cloneDisposition(record)])),
    );
    this.#heads.set(head.sessionId, cloneHead({
      ...head,
      messageSequence: validated.message.envelope.sequence,
      updatedAt: validated.updatedAt,
    }));
    return {
      ok: true,
      replayed: false,
      value: cloneToolCallBatchCommit({
        message: validated.message,
        batch: validated.batch,
        dispositions: validated.dispositions,
      }),
    };
  }

  async loadToolCallBatch(batchId: string): Promise<ToolCallBatchRecord | undefined> {
    this.#requireStarted();
    const batch = this.#toolCallBatches.get(batchId);
    return batch === undefined ? undefined : cloneBatch(batch);
  }

  async listToolCallDispositions(
    batchId: string,
  ): Promise<readonly ToolCallDispositionRecord[]> {
    this.#requireStarted();
    return [...(this.#toolCallDispositions.get(batchId)?.values() ?? [])]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map(cloneDisposition);
  }

  async listToolCallBatchEvidenceBySessionRange(
    sessionId: string,
    startSequence: number,
    endSequence: number,
  ): Promise<readonly Readonly<{
    batch: ToolCallBatchRecord;
    dispositions: readonly ToolCallDispositionRecord[];
  }>[]> {
    this.#requireStarted();
    assertSequenceRange(startSequence, endSequence);
    return Object.freeze([...this.#toolCallBatches.values()]
      .filter((batch) => batch.sessionId === sessionId
        && batch.assistantMessageSequence >= startSequence
        && batch.assistantMessageSequence <= endSequence)
      .sort((left, right) => left.assistantMessageSequence - right.assistantMessageSequence
        || left.batchId.localeCompare(right.batchId))
      .map((batch) => Object.freeze({
        batch: cloneBatch(batch),
        dispositions: Object.freeze([...(this.#toolCallDispositions.get(batch.batchId)?.values() ?? [])]
          .sort((left, right) => left.ordinal - right.ordinal)
          .map(cloneDisposition)),
      })));
  }

  async loadToolCallDisposition(
    batchId: string,
    toolCallId: string,
  ): Promise<ToolCallDispositionRecord | undefined> {
    this.#requireStarted();
    const disposition = this.#toolCallDispositions.get(batchId)?.get(toolCallId);
    return disposition === undefined ? undefined : cloneDisposition(disposition);
  }

  async listRecoverableToolCallBatches(): Promise<readonly ToolCallBatchRecord[]> {
    this.#requireStarted();
    return [...this.#toolCallBatches.values()]
      .filter((batch) => [...(this.#toolCallDispositions.get(batch.batchId)?.values() ?? [])]
        .some((record) => !isTerminalDisposition(record)))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
        || left.batchId.localeCompare(right.batchId))
      .map(cloneBatch);
  }

  async transitionToolCallDisposition(
    input: TransitionToolCallDispositionInput,
  ): Promise<ConversationWriteResult<ToolCallDispositionRecord>> {
    this.#requireStarted();
    const validated = validateToolCallDispositionTransition(input);
    if ("ok" in validated) return validated;
    const dispositions = this.#toolCallDispositions.get(validated.batchId);
    const current = dispositions?.get(validated.toolCallId);
    if (current === undefined) {
      return conversationFailure(
        "persistence.tool_call_disposition_not_found",
        "Tool Call disposition does not exist",
      );
    }
    if (sameJson(current, validated.next)) {
      return { ok: true, replayed: true, value: cloneDisposition(current) };
    }
    if (current.revision !== validated.expectedRevision) {
      return conversationFailure(
        "persistence.tool_call_disposition_revision_conflict",
        "Tool Call disposition revision changed",
      );
    }
    if (!isAllowedToolCallDispositionTransition(current, validated.next)) {
      return conversationFailure(
        "persistence.tool_call_disposition_transition_invalid",
        "Tool Call disposition transition is not allowed",
      );
    }
    dispositions?.set(validated.toolCallId, cloneDisposition(validated.next));
    return { ok: true, replayed: false, value: cloneDisposition(validated.next) };
  }

  async appendToolResultAndCompleteDisposition(
    input: AppendToolResultAndCompleteDispositionInput,
  ): Promise<ConversationWriteResult<ConversationMessage>> {
    this.#requireStarted();
    const validated = validateToolResultCompletion(input);
    if ("ok" in validated) return validated;
    const head = this.#heads.get(validated.message.envelope.sessionId);
    if (head === undefined) {
      return conversationFailure("persistence.session_not_found", "session does not exist");
    }
    const batch = this.#toolCallBatches.get(validated.batchId);
    const dispositions = this.#toolCallDispositions.get(validated.batchId);
    const current = dispositions?.get(validated.toolCallId);
    if (batch === undefined || current === undefined) {
      return conversationFailure(
        "persistence.tool_call_disposition_not_found",
        "Tool Call batch or disposition does not exist",
      );
    }
    const existingMessage = this.#findMessageById(validated.message.envelope.messageId);
    if (existingMessage !== undefined || current.disposition === "result_committed") {
      const replay = existingMessage !== undefined
        && current.disposition === "result_committed"
        && sameJson(existingMessage, validated.message)
        && sameJson(current, validated.completedDisposition);
      return replay
        ? { ok: true, replayed: true, value: cloneMessage(existingMessage) }
        : conversationFailure(
          "persistence.tool_result_completion_conflict",
          "Tool Result completion already exists with different or incomplete facts",
        );
    }
    if (
      batch.sessionId !== validated.message.envelope.sessionId
      || batch.taskId !== validated.message.envelope.taskId
      || current.actionId !== validated.message.message.actionId
    ) {
      return conversationFailure(
        "persistence.tool_result_completion_integrity_violation",
        "Tool Result does not belong to the locked batch disposition",
      );
    }
    if (
      head.messageSequence !== validated.expectedMessageSequence
      || validated.message.envelope.sequence !== validated.expectedMessageSequence + 1
    ) {
      return conversationFailure(
        "persistence.message_sequence_conflict",
        "message sequence changed",
      );
    }
    if (current.revision !== validated.expectedDispositionRevision) {
      return conversationFailure(
        "persistence.tool_call_disposition_revision_conflict",
        "Tool Call disposition revision changed",
      );
    }
    if (!isValidToolResultCompletionTransition(current, validated.completedDisposition)) {
      return conversationFailure(
        "persistence.tool_call_disposition_transition_invalid",
        "Tool Result completion must preserve the exact Effect-linked disposition identity",
      );
    }
    const messages = this.#messages.get(head.sessionId) ?? new Map();
    if (
      messages.has(validated.message.envelope.sequence)
      || this.#messageIds.has(validated.message.envelope.messageId)
    ) {
      return conversationFailure(
        "persistence.duplicate_message",
        "message sequence or messageId already exists",
      );
    }

    this.#faultInjector?.("append_tool_result.after_message");

    messages.set(validated.message.envelope.sequence, cloneMessage(validated.message));
    this.#messages.set(head.sessionId, messages);
    this.#messageIds.add(validated.message.envelope.messageId);
    dispositions?.set(validated.toolCallId, cloneDisposition(validated.completedDisposition));
    this.#heads.set(head.sessionId, cloneHead({
      ...head,
      messageSequence: validated.message.envelope.sequence,
      updatedAt: validated.updatedAt,
    }));
    return { ok: true, replayed: false, value: cloneMessage(validated.message) };
  }

  async loadMessageRange(
    sessionId: string,
    startSequence: number,
    endSequence: number,
  ): Promise<readonly ConversationMessage[]> {
    this.#requireStarted();
    return [...(this.#messages.get(sessionId)?.values() ?? [])]
      .filter((message) =>
        message.envelope.sequence >= startSequence && message.envelope.sequence <= endSequence)
      .sort((left, right) => left.envelope.sequence - right.envelope.sequence)
      .map(cloneMessage);
  }

  #findMessageById(messageId: string): ConversationMessage | undefined {
    for (const messages of this.#messages.values()) {
      for (const message of messages.values()) {
        if (message.envelope.messageId === messageId) return message;
      }
    }
    return undefined;
  }

  async loadSessionEventsAfter(sessionId: string, sequence: number): Promise<readonly SessionEvent[]> {
    this.#requireStarted();
    return [...(this.#events.get(sessionId)?.values() ?? [])]
      .filter((event) => event.sequence > sequence)
      .sort((left, right) => left.sequence - right.sequence)
      .map(cloneEvent);
  }

  async findSessionCommandReceipt(commandId: string): Promise<SessionCommandReceipt | undefined> {
    this.#requireStarted();
    const receipt = this.#receipts.get(commandId);
    return receipt === undefined ? undefined : cloneReceipt(receipt);
  }

  async loadCompactionJob(compactionJobId: string): Promise<CompactionJob | undefined> {
    this.#requireStarted();
    const job = this.#jobs.get(compactionJobId);
    return job === undefined ? undefined : cloneJob(job);
  }

  async loadCompactionExecutionBinding(
    compactionJobId: string,
  ): Promise<ReadableCompactionExecutionBinding | undefined> {
    this.#requireStarted();
    const binding = this.#executionBindings.get(compactionJobId);
    return binding === undefined ? undefined : cloneExecutionBinding(binding);
  }

  async loadCompactionRecord(compactionId: string): Promise<CompactionRecord | undefined> {
    this.#requireStarted();
    const record = this.#records.get(compactionId);
    return record === undefined ? undefined : cloneRecord(record);
  }

  async listPendingCompactionJobs(): Promise<readonly CompactionJob[]> {
    this.#requireStarted();
    return [...this.#jobs.values()]
      .filter((job) => job.status === "pending")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
        || left.compactionJobId.localeCompare(right.compactionJobId))
      .map(cloneJob);
  }

  async loadByCompactionJobId(jobId: string) {
    this.#requireStarted();
    return memoryCompactionInvocationMethods(this.#compactionInvocationLinks)
      .loadByCompactionJobId(jobId);
  }

  async prepare(input: PrepareCompactionModelInvocationLinkInput) {
    this.#requireStarted();
    return memoryCompactionInvocationMethods(this.#compactionInvocationLinks).prepare(input);
  }

  async recordAccepted(input: Parameters<ReturnType<typeof memoryCompactionInvocationMethods>["recordAccepted"]>[0]) {
    this.#requireStarted();
    return memoryCompactionInvocationMethods(this.#compactionInvocationLinks).recordAccepted(input);
  }

  async recordStreamProgress(input: Parameters<ReturnType<typeof memoryCompactionInvocationMethods>["recordStreamProgress"]>[0]) {
    this.#requireStarted();
    return memoryCompactionInvocationMethods(this.#compactionInvocationLinks).recordStreamProgress(input);
  }

  async requestCompaction(
    input: RequestCompactionInput,
  ): Promise<ConversationWriteResult<CompactionJob>> {
    this.#requireStarted();
    const validated = validateRequestCompaction(input);
    if ("ok" in validated) return validated;
    const replay = this.#replayJob(validated.receipt);
    if (replay !== undefined) {
      if (!replay.ok) return replay;
      const existingBinding = this.#executionBindings.get(validated.job.compactionJobId);
      return existingBinding !== undefined
        && existingBinding.bindingDigest === validated.executionBinding.bindingDigest
        ? replay
        : conversationFailure(
          "persistence.compaction_execution_binding_conflict",
          "compaction request replay changed its execution binding",
        );
    }
    const head = this.#heads.get(validated.command.sessionId);
    if (head === undefined) return conversationFailure("persistence.session_not_found", "session does not exist");
    if ([...this.#jobs.values()].some((job) => job.sessionId === head.sessionId && job.status === "pending")) {
      return conversationFailure("persistence.pending_compaction_exists", "session already has a pending compaction");
    }
    const range = this.#range(
      head.sessionId,
      validated.command.sourceStartSequence,
      validated.command.sourceEndSequence,
    );
    const conflict = validateRequestAgainstState(head, range, validated);
    if (conflict !== undefined) return conflict;
    if (this.#jobs.has(validated.job.compactionJobId)) {
      return conversationFailure("persistence.compaction_job_conflict", "compactionJobId already exists");
    }
    if (this.#executionBindings.has(validated.job.compactionJobId)) {
      return conversationFailure(
        "persistence.compaction_execution_binding_conflict",
        "compaction execution binding already exists",
      );
    }
    const eventConflict = this.#validateEvent(validated.event, head);
    if (eventConflict !== undefined) return eventConflict;
    const outboxConflict = this.#validateOutbox(validated.outbox);
    if (outboxConflict !== undefined) return outboxConflict;

    this.#jobs.set(validated.job.compactionJobId, cloneJob(validated.job));
    try {
      this.#faultInjector?.("request_compaction.after_job_before_binding");
    } catch (error) {
      this.#jobs.delete(validated.job.compactionJobId);
      throw error;
    }
    this.#executionBindings.set(
      validated.job.compactionJobId,
      cloneExecutionBinding(validated.executionBinding),
    );
    this.#storeEvent(validated.event);
    this.#receipts.set(validated.receipt.commandId, cloneReceipt(validated.receipt));
    this.#storeOutbox(validated.outbox);
    this.#heads.set(head.sessionId, cloneHead({
      ...head,
      sessionEventSequence: validated.event.sequence,
      updatedAt: validated.command.issuedAt,
    }));
    this.#faultInjector?.("request_compaction.after_commit");
    return { ok: true, replayed: false, value: cloneJob(validated.job) };
  }

  async commitCompaction(
    input: CommitCompactionInput,
  ): Promise<ConversationWriteResult<CompactionRecord>> {
    this.#requireStarted();
    const validated = validateCommitCompaction(input);
    if ("ok" in validated) return validated;
    const existingReceipt = this.#receipts.get(validated.receipt.commandId);
    if (existingReceipt !== undefined) {
      if (!sameReceipt(existingReceipt, validated.receipt)) return idempotencyConflict();
      const existing = this.#records.get(validated.command.compactionId);
      return existing === undefined
        ? conversationFailure("persistence.integrity_violation", "receipt references missing compaction record")
        : { ok: true, replayed: true, value: cloneRecord(existing) };
    }
    const job = this.#jobs.get(validated.command.compactionJobId);
    const head = this.#heads.get(validated.command.sessionId);
    if (job === undefined) return conversationFailure("persistence.compaction_job_not_found", "compaction job does not exist");
    if (head === undefined) return conversationFailure("persistence.session_not_found", "session does not exist");
    if (job.status !== "pending") {
      return conversationFailure(
        job.status === "completed" ? "persistence.compaction_stale" : "persistence.compaction_job_not_pending",
        "compaction result lost the commit race",
      );
    }
    const record = validated.command.record;
    const range = this.#range(job.sessionId, job.sourceStartSequence, job.sourceEndSequence);
    if (
      record.compactionJobId !== job.compactionJobId
      || record.compactionId !== job.compactionId
      || record.sessionId !== job.sessionId
      || record.sourceStartSequence !== job.sourceStartSequence
      || record.sourceEndSequence !== job.sourceEndSequence
      || record.sourceDigest !== job.sourceDigest
      || record.baseActiveCompactionId !== job.baseActiveCompactionId
      || record.baseContextRevision !== job.baseContextRevision
      || digestConversationRange(range) !== job.sourceDigest
    ) return conversationFailure("persistence.compaction_source_changed", "locked compaction source changed");
    if (
      head.activeCompactionId !== job.baseActiveCompactionId
      || head.contextRevision !== job.baseContextRevision
    ) return conversationFailure("persistence.compaction_stale", "compaction base view changed");
    const eventConflict = this.#validateEvent(validated.event, head);
    if (eventConflict !== undefined) return eventConflict;
    const outboxConflict = this.#validateOutbox(validated.outbox);
    if (outboxConflict !== undefined) return outboxConflict;
    if (this.#records.has(record.compactionId)) {
      return conversationFailure("persistence.compaction_record_conflict", "compactionId already exists");
    }
    if (validated.summaryInvocationCommit !== undefined) {
      const link = this.#compactionInvocationLinks.load(job.compactionJobId);
      if (
        link === undefined
        || link.clientRequestId !== validated.summaryInvocationCommit.clientRequestId
        || link.recordDigest !== validated.summaryInvocationCommit.expectedRecordDigest
        || link.outputStartedAt === undefined
      ) return conversationFailure(
        "persistence.compaction_model_invocation_link_conflict",
        "summary invocation link does not match the compaction commit",
      );
    }

    const completed = CompactionJobSchema.parse({
      ...job,
      status: "completed",
      commitCommandId: validated.command.commandId,
      completedAt: validated.command.issuedAt,
      updatedAt: validated.command.issuedAt,
    });
    this.#records.set(record.compactionId, cloneRecord(record));
    this.#jobs.set(job.compactionJobId, cloneJob(completed));
    this.#storeEvent(validated.event);
    this.#receipts.set(validated.receipt.commandId, cloneReceipt(validated.receipt));
    this.#storeOutbox(validated.outbox);
    this.#heads.set(head.sessionId, cloneHead({
      ...head,
      activeCompactionId: record.compactionId,
      contextRevision: job.baseContextRevision + 1,
      sessionEventSequence: validated.event.sequence,
      updatedAt: validated.command.issuedAt,
    }));
    if (validated.summaryInvocationCommit !== undefined) {
      const committed = this.#compactionInvocationLinks.commitSummary(validated.summaryInvocationCommit);
      if (!committed.ok) throw new Error(committed.error.message);
    }
    this.#faultInjector?.("commit_compaction.after_commit");
    return { ok: true, replayed: false, value: cloneRecord(record) };
  }

  async terminateCompaction(
    input: TerminateCompactionInput,
  ): Promise<ConversationWriteResult<CompactionJob>> {
    this.#requireStarted();
    const validated = validateTerminateCompaction(input);
    if ("ok" in validated) return validated;
    const replay = this.#replayJob(validated.receipt);
    if (replay !== undefined) return replay;
    const current = this.#jobs.get(validated.command.compactionJobId);
    const head = this.#heads.get(validated.command.sessionId);
    if (current === undefined) return conversationFailure("persistence.compaction_job_not_found", "compaction job does not exist");
    if (head === undefined) return conversationFailure("persistence.session_not_found", "session does not exist");
    if (current.status !== "pending") {
      return conversationFailure("persistence.compaction_job_not_pending", "compaction job is not pending");
    }
    if (!sameLockedJob(current, validated.job)) {
      return conversationFailure("persistence.integrity_violation", "terminal job changed locked compaction fields");
    }
    const eventConflict = this.#validateEvent(validated.event, head);
    if (eventConflict !== undefined) return eventConflict;
    const outboxConflict = this.#validateOutbox(validated.outbox);
    if (outboxConflict !== undefined) return outboxConflict;
    this.#jobs.set(current.compactionJobId, cloneJob(validated.job));
    this.#storeEvent(validated.event);
    this.#receipts.set(validated.receipt.commandId, cloneReceipt(validated.receipt));
    this.#storeOutbox(validated.outbox);
    this.#heads.set(head.sessionId, cloneHead({
      ...head,
      sessionEventSequence: validated.event.sequence,
      updatedAt: validated.command.issuedAt,
    }));
    return { ok: true, replayed: false, value: cloneJob(validated.job) };
  }

  #range(sessionId: string, start: number, end: number): readonly ConversationMessage[] {
    return [...(this.#messages.get(sessionId)?.values() ?? [])]
      .filter((message) => message.envelope.sequence >= start && message.envelope.sequence <= end)
      .sort((left, right) => left.envelope.sequence - right.envelope.sequence);
  }

  #validateEvent(event: SessionEvent, head: SessionHead): ConversationWriteResult<never> | undefined {
    if (event.sequence !== head.sessionEventSequence + 1) {
      return conversationFailure("persistence.session_event_sequence_conflict", "session event sequence changed");
    }
    if (this.#eventIds.has(event.eventId) || this.#events.get(event.sessionId)?.has(event.sequence)) {
      return conversationFailure("persistence.duplicate_session_event", "session event already exists");
    }
    return undefined;
  }

  #validateOutbox(records: readonly SessionOutboxRecord[]): ConversationWriteResult<never> | undefined {
    if (records.some((record) => this.#outbox.has(record.outboxId))) {
      return conversationFailure("persistence.outbox_conflict", "session outboxId already exists");
    }
    return undefined;
  }

  #storeEvent(event: SessionEvent): void {
    const events = this.#events.get(event.sessionId) ?? new Map();
    events.set(event.sequence, cloneEvent(event));
    this.#events.set(event.sessionId, events);
    this.#eventIds.add(event.eventId);
  }

  #storeOutbox(records: readonly SessionOutboxRecord[]): void {
    for (const record of records) this.#outbox.set(record.outboxId, cloneOutbox(record));
  }

  #replayJob(
    receipt: Extract<SessionCommandReceipt, { outcome: "accepted" }>,
  ): ConversationWriteResult<CompactionJob> | undefined {
    const existingReceipt = this.#receipts.get(receipt.commandId);
    if (existingReceipt === undefined) return undefined;
    if (!sameReceipt(existingReceipt, receipt)) return idempotencyConflict();
    const job = this.#jobs.get(receipt.compactionJobId);
    return job === undefined
      ? conversationFailure("persistence.integrity_violation", "receipt references missing compaction job")
      : { ok: true, replayed: true, value: cloneJob(job) };
  }

  #requireStarted(): void {
    if (!this.#started) throw new Error("InMemoryConversationPersistence is not started");
  }
}

function assertSequenceRange(startSequence: number, endSequence: number): void {
  if (
    !Number.isSafeInteger(startSequence)
    || !Number.isSafeInteger(endSequence)
    || startSequence < 1
    || endSequence < startSequence
  ) throw new Error("Conversation sequence range is invalid");
}

function validateRequestAgainstState(
  head: SessionHead,
  range: readonly ConversationMessage[],
  input: RequestCompactionInput,
): ConversationWriteResult<never> | undefined {
  const expectedCount = input.command.sourceEndSequence - input.command.sourceStartSequence + 1;
  if (
    input.command.sourceEndSequence > head.messageSequence
    || range.length !== expectedCount
    || digestConversationRange(range) !== input.command.sourceDigest
  ) return conversationFailure("persistence.compaction_source_changed", "locked source range or digest changed");
  if (
    head.activeCompactionId !== input.command.baseActiveCompactionId
    || head.contextRevision !== input.command.baseContextRevision
  ) return conversationFailure("persistence.compaction_stale", "compaction base view changed");
  if (
    input.receipt.contextRevision !== head.contextRevision
    || input.event.sequence !== head.sessionEventSequence + 1
  ) return conversationFailure("persistence.integrity_violation", "request receipt or event does not match SessionHead");
  return undefined;
}

function sameLockedJob(left: CompactionJob, right: CompactionJob): boolean {
  return left.compactionJobId === right.compactionJobId
    && left.compactionId === right.compactionId
    && left.sessionId === right.sessionId
    && left.requestCommandId === right.requestCommandId
    && left.sourceStartSequence === right.sourceStartSequence
    && left.sourceEndSequence === right.sourceEndSequence
    && left.sourceDigest === right.sourceDigest
    && left.baseActiveCompactionId === right.baseActiveCompactionId
    && left.baseContextRevision === right.baseContextRevision
    && left.createdAt === right.createdAt;
}

function sameReceipt(left: SessionCommandReceipt, right: SessionCommandReceipt): boolean {
  return left.commandDigest === right.commandDigest && left.commandType === right.commandType;
}

function idempotencyConflict(): ConversationWriteFailure {
  return conversationFailure(
    "persistence.session_command_idempotency_conflict",
    "commandId already exists with a different canonical digest",
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const cloneHead = (value: SessionHead): SessionHead => SessionHeadSchema.parse(value);
const cloneMessage = (value: ConversationMessage): ConversationMessage =>
  ConversationMessageSchema.parse(value);
const clonePrepared = (
  value: PreparedConversationMessage,
): PreparedConversationMessage => structuredClone(value);
const cloneBatch = (value: ToolCallBatchRecord): ToolCallBatchRecord =>
  ToolCallBatchRecordSchema.parse(value);
const cloneDisposition = (value: ToolCallDispositionRecord): ToolCallDispositionRecord =>
  ToolCallDispositionRecordSchema.parse(value);
const cloneEvent = (value: SessionEvent): SessionEvent => SessionEventSchema.parse(value);
const cloneReceipt = (value: SessionCommandReceipt): SessionCommandReceipt =>
  SessionCommandReceiptSchema.parse(value);
const cloneJob = (value: CompactionJob): CompactionJob => CompactionJobSchema.parse(value);
const cloneRecord = (value: CompactionRecord): CompactionRecord => CompactionRecordSchema.parse(value);
const cloneExecutionBinding = (
  value: ReadableCompactionExecutionBinding,
): ReadableCompactionExecutionBinding => ReadableCompactionExecutionBindingSchema.parse(value);
const cloneOutbox = (value: SessionOutboxRecord): SessionOutboxRecord => ({
  ...value,
  payload: { ...value.payload },
});

function isTerminalDisposition(record: ToolCallDispositionRecord): boolean {
  return record.disposition === "result_committed"
    || record.disposition === "cancelled_before_dispatch"
    || record.disposition === "denied_before_dispatch";
}

function validatePreparedMessage(
  input: PreparedConversationMessage,
): ConversationWriteResult<PreparedConversationMessage> {
  const messageId = EntityIdSchema.safeParse(input.messageId);
  const sessionId = EntityIdSchema.safeParse(input.sessionId);
  const taskId = EntityIdSchema.safeParse(input.taskId);
  const digest = Sha256DigestSchema.safeParse(input.messageDigest);
  const message = ProviderNeutralMessageSchema.safeParse(input.message);
  if (
    !messageId.success
    || !sessionId.success
    || !taskId.success
    || !digest.success
    || !message.success
    || message.data.role !== "user"
    || !Number.isFinite(Date.parse(input.createdAt))
  ) {
    return conversationFailure(
      "persistence.invalid_message_intent",
      "prepared user message is invalid",
    );
  }
  if (sha256CanonicalJson(JsonValueSchema.parse(message.data)) !== digest.data) {
    return conversationFailure(
      "persistence.invalid_message_intent",
      "prepared message digest is invalid",
    );
  }
  return {
    ok: true,
    replayed: false,
    value: {
      messageId: messageId.data,
      sessionId: sessionId.data,
      taskId: taskId.data,
      messageDigest: digest.data,
      message: message.data,
      createdAt: input.createdAt,
    },
  };
}
