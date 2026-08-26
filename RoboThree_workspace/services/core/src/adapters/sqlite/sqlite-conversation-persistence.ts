import { DatabaseSync } from "node:sqlite";

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
  CompactionModelInvocationLinkSchema,
  samePreparedCompactionModelInvocationLink,
  withCompactionInvocationDigest,
  type CompactionModelInvocationLink,
  type CompactionModelInvocationLinkWriteResult,
  type PrepareCompactionModelInvocationLinkInput,
} from "../../ports/compaction-model-invocation-link-persistence.js";
import { configureSqlite, migrateAndPreflight } from "./schema-preflight.js";

export class SqliteConversationPersistence implements ConversationPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.conversation.sqlite";
  readonly #databasePath: string;
  readonly #clock: Clock;
  readonly #faultInjector: ConversationPersistenceFaultInjector | undefined;
  #database: DatabaseSync | undefined;
  #startupError: string | undefined;

  constructor(input: {
    databasePath: string;
    clock: Clock;
    faultInjector?: ConversationPersistenceFaultInjector;
  }) {
    this.#databasePath = input.databasePath;
    this.#clock = input.clock;
    this.#faultInjector = input.faultInjector;
  }

  async start(): Promise<void> {
    if (this.#database !== undefined) return;
    const database = new DatabaseSync(this.#databasePath, { allowExtension: false });
    try {
      configureSqlite(database);
      migrateAndPreflight(database, this.#clock);
      database.enableDefensive(true);
      this.#database = database;
      this.#startupError = undefined;
    } catch (error) {
      this.#startupError = error instanceof Error ? error.message : String(error);
      database.close();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.#database?.close();
    this.#database = undefined;
  }

  async health(): Promise<ComponentHealth> {
    return {
      componentId: this.componentId,
      status: this.#database === undefined ? "unavailable" : "ready",
      checkedAt: this.#clock.now(),
      ...(this.#startupError === undefined ? {} : { details: { startupError: this.#startupError } }),
    };
  }

  async createSession(head: SessionHead): Promise<ConversationWriteResult<SessionHead>> {
    const validated = validateSessionCreation(head);
    if ("ok" in validated) return validated;
    const database = this.#requireDatabase();
    try {
      return withImmediateTransaction(database, () => {
        const existing = selectSessionHead(database, validated.sessionId);
        if (existing !== undefined) {
          return JSON.stringify(existing) === JSON.stringify(validated)
            ? { ok: true, replayed: true, value: existing }
            : conversationFailure("persistence.session_initialization_conflict", "sessionId already exists");
        }
        insertSessionHead(database, validated);
        return { ok: true, replayed: false, value: validated };
      });
    } catch (error) {
      return sqliteConversationFailure(error);
    }
  }

  async loadSession(sessionId: string): Promise<SessionHead | undefined> {
    return selectSessionHead(this.#requireDatabase(), sessionId);
  }

  async prepareMessage(
    input: PreparedConversationMessage,
  ): Promise<ConversationWriteResult<PreparedConversationMessage>> {
    const validated = validatePreparedMessage(input);
    if (!validated.ok) return validated;
    try {
      return withImmediateTransaction(this.#requireDatabase(), () => {
        const database = this.#requireDatabase();
        if (selectSessionHead(database, validated.value.sessionId) === undefined) {
          return conversationFailure("persistence.session_not_found", "session does not exist");
        }
        const appended = selectMessageById(database, validated.value.messageId);
        if (appended !== undefined) {
          return appended.envelope.sessionId === validated.value.sessionId
            && appended.envelope.taskId === validated.value.taskId
            && appended.envelope.messageDigest === validated.value.messageDigest
            && sameJson(appended.message, validated.value.message)
            ? { ok: true, replayed: true, value: validated.value }
            : conversationFailure("persistence.message_intent_conflict", "messageId already has different content");
        }
        const existing = selectPreparedMessage(database, validated.value.messageId);
        if (existing !== undefined) {
          return sameJson(existing, validated.value)
            ? { ok: true, replayed: true, value: existing }
            : conversationFailure("persistence.message_intent_conflict", "messageId already has another intent");
        }
        database.prepare(`
          INSERT INTO conversation_message_intents (
            message_id, session_id, task_id, message_digest, created_at, intent_json
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          validated.value.messageId,
          validated.value.sessionId,
          validated.value.taskId,
          validated.value.messageDigest,
          validated.value.createdAt,
          JSON.stringify(validated.value),
        );
        return { ok: true, replayed: false, value: validated.value };
      });
    } catch (error) {
      return sqliteConversationFailure(error);
    }
  }

  async loadPreparedMessage(
    messageId: string,
  ): Promise<PreparedConversationMessage | undefined> {
    return selectPreparedMessage(this.#requireDatabase(), messageId);
  }

  async appendPreparedMessage(
    messageId: string,
    updatedAt: string,
  ): Promise<ConversationWriteResult<ConversationMessage>> {
    try {
      return withImmediateTransaction(this.#requireDatabase(), () => {
        const database = this.#requireDatabase();
        const existing = selectMessageById(database, messageId);
        if (existing !== undefined) {
          return { ok: true, replayed: true, value: existing };
        }
        const intent = selectPreparedMessage(database, messageId);
        if (intent === undefined) {
          return conversationFailure(
            "persistence.message_intent_not_found",
            "prepared message does not exist",
          );
        }
        const head = selectSessionHead(database, intent.sessionId);
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
        insertMessage(database, message);
        const next = SessionHeadSchema.parse({
          ...head,
          messageSequence: message.envelope.sequence,
          updatedAt,
        });
        const update = database.prepare(`
          UPDATE session_heads
          SET message_sequence = ?, updated_at = ?, head_json = ?
          WHERE session_id = ? AND message_sequence = ?
        `).run(
          next.messageSequence,
          next.updatedAt,
          JSON.stringify(next),
          head.sessionId,
          head.messageSequence,
        );
        if (Number(update.changes) !== 1) {
          throw new ConversationAbort(conversationFailure(
            "persistence.message_sequence_conflict",
            "message sequence changed",
          ));
        }
        database.prepare(
          "DELETE FROM conversation_message_intents WHERE message_id = ?",
        ).run(messageId);
        return { ok: true, replayed: false, value: message };
      });
    } catch (error) {
      return sqliteConversationFailure(error);
    }
  }

  async loadMessageById(messageId: string): Promise<ConversationMessage | undefined> {
    return selectMessageById(this.#requireDatabase(), messageId);
  }

  async appendMessage(
    input: AppendConversationMessageInput,
  ): Promise<ConversationWriteResult<ConversationMessage>> {
    const validated = validateMessageAppend(input);
    if ("ok" in validated) return validated;
    const database = this.#requireDatabase();
    try {
      return withImmediateTransaction(database, () => {
        const envelope = validated.message.envelope;
        const head = selectSessionHead(database, envelope.sessionId);
        if (head === undefined) return conversationFailure("persistence.session_not_found", "session does not exist");
        const existing = selectMessageAt(database, head.sessionId, envelope.sequence);
        if (existing !== undefined && JSON.stringify(existing) === JSON.stringify(validated.message)) {
          return { ok: true, replayed: true, value: existing };
        }
        if (
          head.messageSequence !== validated.expectedMessageSequence
          || envelope.sequence !== validated.expectedMessageSequence + 1
        ) return conversationFailure("persistence.message_sequence_conflict", "message sequence changed");
        if (existing !== undefined || selectMessageById(database, envelope.messageId) !== undefined) {
          return conversationFailure("persistence.duplicate_message", "message sequence or messageId already exists");
        }
        insertMessage(database, validated.message);
        const update = database.prepare(`
          UPDATE session_heads
          SET message_sequence = ?, updated_at = ?, head_json = ?
          WHERE session_id = ? AND message_sequence = ?
        `).run(
          envelope.sequence,
          validated.updatedAt,
          JSON.stringify({ ...head, messageSequence: envelope.sequence, updatedAt: validated.updatedAt }),
          head.sessionId,
          validated.expectedMessageSequence,
        );
        if (Number(update.changes) !== 1) {
          throw new ConversationAbort(
            conversationFailure("persistence.message_sequence_conflict", "message sequence changed"),
          );
        }
        return { ok: true, replayed: false, value: validated.message };
      });
    } catch (error) {
      return sqliteConversationFailure(error);
    }
  }

  async appendAssistantToolCallBatch(
    input: AppendAssistantToolCallBatchInput,
  ): Promise<ConversationWriteResult<ToolCallBatchCommit>> {
    const validated = validateAssistantToolCallBatchAppend(input);
    if ("ok" in validated) return validated;
    const database = this.#requireDatabase();
    try {
      return withImmediateTransaction(database, () => {
        const existingBatch = selectToolCallBatch(database, validated.batch.batchId);
        const existingMessage = selectMessageById(
          database,
          validated.message.envelope.messageId,
        );
        const existingDispositions = selectToolCallDispositions(
          database,
          validated.batch.batchId,
        );
        if (
          existingBatch !== undefined
          || existingMessage !== undefined
          || existingDispositions.length > 0
        ) {
          if (existingBatch !== undefined
            && existingMessage !== undefined
            && existingMessage.message.role === "assistant"
            && sameJson(existingBatch, validated.batch)
            && sameJson(existingMessage, validated.message)
            && haveSameToolCallDispositionIdentities(
              existingDispositions,
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
                batch: existingBatch,
                dispositions: existingDispositions,
              }),
            };
          }
          return conversationFailure(
            "persistence.tool_call_batch_conflict",
            "batch identity already exists with different or incomplete facts",
          );
        }
        const conflictingBatch = database.prepare(`
          SELECT batch_id FROM tool_call_batches
          WHERE assistant_message_id = ? OR batch_digest = ?
        `).get(
          validated.batch.assistantMessageId,
          validated.batch.batchDigest,
        );
        if (conflictingBatch !== undefined) {
          return conversationFailure(
            "persistence.tool_call_batch_conflict",
            "assistant message or batch digest already belongs to another batch",
          );
        }
        const head = selectSessionHead(database, validated.batch.sessionId);
        if (head === undefined) {
          return conversationFailure("persistence.session_not_found", "session does not exist");
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
        if (selectMessageAt(
          database,
          head.sessionId,
          validated.message.envelope.sequence,
        ) !== undefined) {
          return conversationFailure(
            "persistence.duplicate_message",
            "message sequence already exists",
          );
        }

        insertMessage(database, validated.message);
        this.#faultInjector?.("append_assistant_batch.after_message");
        insertToolCallBatch(database, validated.batch);
        this.#faultInjector?.("append_assistant_batch.after_batch");
        for (const disposition of validated.dispositions) {
          insertToolCallDisposition(database, disposition);
        }
        updateMessageSequence(
          database,
          head,
          validated.message.envelope.sequence,
          validated.updatedAt,
        );
        return {
          ok: true,
          replayed: false,
          value: cloneToolCallBatchCommit({
            message: validated.message,
            batch: validated.batch,
            dispositions: validated.dispositions,
          }),
        };
      });
    } catch (error) {
      return sqliteConversationFailure(error);
    }
  }

  async loadToolCallBatch(batchId: string): Promise<ToolCallBatchRecord | undefined> {
    return selectToolCallBatch(this.#requireDatabase(), batchId);
  }

  async listToolCallDispositions(
    batchId: string,
  ): Promise<readonly ToolCallDispositionRecord[]> {
    return selectToolCallDispositions(this.#requireDatabase(), batchId);
  }

  async listToolCallBatchEvidenceBySessionRange(
    sessionId: string,
    startSequence: number,
    endSequence: number,
  ): Promise<readonly Readonly<{
    batch: ToolCallBatchRecord;
    dispositions: readonly ToolCallDispositionRecord[];
  }>[]> {
    assertSequenceRange(startSequence, endSequence);
    const database = this.#requireDatabase();
    const rows = database.prepare(`
      SELECT batch_id FROM tool_call_batches
      WHERE session_id = ? AND assistant_message_sequence BETWEEN ? AND ?
      ORDER BY assistant_message_sequence, batch_id
    `).all(sessionId, startSequence, endSequence) as Record<string, unknown>[];
    return Object.freeze(rows.map((row) => {
      const batchId = requireString(row.batch_id, "batch_id");
      const batch = selectToolCallBatch(database, batchId);
      if (batch === undefined) throw new Error("Tool Call batch index references a missing record");
      return Object.freeze({
        batch,
        dispositions: Object.freeze(selectToolCallDispositions(database, batchId)),
      });
    }));
  }

  async loadToolCallDisposition(
    batchId: string,
    toolCallId: string,
  ): Promise<ToolCallDispositionRecord | undefined> {
    return selectToolCallDisposition(this.#requireDatabase(), batchId, toolCallId);
  }

  async listRecoverableToolCallBatches(): Promise<readonly ToolCallBatchRecord[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT batch.record_json
      FROM tool_call_batches AS batch
      WHERE EXISTS (
        SELECT 1 FROM tool_call_dispositions AS disposition
        WHERE disposition.batch_id = batch.batch_id
          AND disposition.disposition NOT IN (
            'result_committed',
            'cancelled_before_dispatch',
            'denied_before_dispatch'
          )
      )
      ORDER BY batch.created_at, batch.batch_id
    `).all() as Record<string, unknown>[];
    return rows.map((row) => ToolCallBatchRecordSchema.parse(
      JSON.parse(requireString(row.record_json, "record_json")),
    ));
  }

  async transitionToolCallDisposition(
    input: TransitionToolCallDispositionInput,
  ): Promise<ConversationWriteResult<ToolCallDispositionRecord>> {
    const validated = validateToolCallDispositionTransition(input);
    if ("ok" in validated) return validated;
    const database = this.#requireDatabase();
    try {
      return withImmediateTransaction(database, () => {
        const current = selectToolCallDisposition(
          database,
          validated.batchId,
          validated.toolCallId,
        );
        if (current === undefined) {
          return conversationFailure(
            "persistence.tool_call_disposition_not_found",
            "Tool Call disposition does not exist",
          );
        }
        if (sameJson(current, validated.next)) {
          return { ok: true, replayed: true, value: current };
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
        updateToolCallDisposition(database, validated.next, validated.expectedRevision);
        return { ok: true, replayed: false, value: validated.next };
      });
    } catch (error) {
      return sqliteConversationFailure(error);
    }
  }

  async appendToolResultAndCompleteDisposition(
    input: AppendToolResultAndCompleteDispositionInput,
  ): Promise<ConversationWriteResult<ConversationMessage>> {
    const validated = validateToolResultCompletion(input);
    if ("ok" in validated) return validated;
    const database = this.#requireDatabase();
    try {
      return withImmediateTransaction(database, () => {
        const batch = selectToolCallBatch(database, validated.batchId);
        const current = selectToolCallDisposition(
          database,
          validated.batchId,
          validated.toolCallId,
        );
        if (batch === undefined || current === undefined) {
          return conversationFailure(
            "persistence.tool_call_disposition_not_found",
            "Tool Call batch or disposition does not exist",
          );
        }
        const existingMessage = selectMessageById(
          database,
          validated.message.envelope.messageId,
        );
        if (existingMessage !== undefined || current.disposition === "result_committed") {
          const replay = existingMessage !== undefined
            && current.disposition === "result_committed"
            && sameJson(existingMessage, validated.message)
            && sameJson(current, validated.completedDisposition);
          return replay
            ? { ok: true, replayed: true, value: existingMessage }
            : conversationFailure(
              "persistence.tool_result_completion_conflict",
              "Tool Result completion already exists with different or incomplete facts",
            );
        }
        const head = selectSessionHead(database, batch.sessionId);
        if (head === undefined) {
          return conversationFailure("persistence.session_not_found", "session does not exist");
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
        if (selectMessageAt(
          database,
          head.sessionId,
          validated.message.envelope.sequence,
        ) !== undefined) {
          return conversationFailure(
            "persistence.duplicate_message",
            "message sequence already exists",
          );
        }

        insertMessage(database, validated.message);
        this.#faultInjector?.("append_tool_result.after_message");
        updateToolCallDisposition(
          database,
          validated.completedDisposition,
          validated.expectedDispositionRevision,
        );
        updateMessageSequence(
          database,
          head,
          validated.message.envelope.sequence,
          validated.updatedAt,
        );
        return { ok: true, replayed: false, value: validated.message };
      });
    } catch (error) {
      return sqliteConversationFailure(error);
    }
  }

  async loadMessageRange(
    sessionId: string,
    startSequence: number,
    endSequence: number,
  ): Promise<readonly ConversationMessage[]> {
    return selectMessageRange(this.#requireDatabase(), sessionId, startSequence, endSequence);
  }

  async loadSessionEventsAfter(sessionId: string, sequence: number): Promise<readonly SessionEvent[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT event_json FROM session_events
      WHERE session_id = ? AND sequence > ?
      ORDER BY sequence
    `).all(sessionId, sequence) as Record<string, unknown>[];
    return rows.map((row) => SessionEventSchema.parse(JSON.parse(requireString(row.event_json, "event_json"))));
  }

  async findSessionCommandReceipt(commandId: string): Promise<SessionCommandReceipt | undefined> {
    return selectReceipt(this.#requireDatabase(), commandId);
  }

  async loadCompactionJob(compactionJobId: string): Promise<CompactionJob | undefined> {
    return selectJob(this.#requireDatabase(), compactionJobId);
  }

  async loadCompactionExecutionBinding(
    compactionJobId: string,
  ): Promise<ReadableCompactionExecutionBinding | undefined> {
    return selectCompactionExecutionBinding(this.#requireDatabase(), compactionJobId);
  }

  async loadCompactionRecord(compactionId: string): Promise<CompactionRecord | undefined> {
    return selectRecord(this.#requireDatabase(), compactionId);
  }

  async loadByCompactionJobId(
    compactionJobId: string,
  ): Promise<CompactionModelInvocationLink | undefined> {
    EntityIdSchema.parse(compactionJobId);
    return selectCompactionModelInvocationLink(this.#requireDatabase(), compactionJobId);
  }

  async prepare(
    input: PrepareCompactionModelInvocationLinkInput,
  ): Promise<CompactionModelInvocationLinkWriteResult> {
    const next = withCompactionInvocationDigest({ ...input, updatedAt: input.createdAt });
    try {
      return withImmediateTransaction(this.#requireDatabase(), () => {
        const database = this.#requireDatabase();
        const existing = selectCompactionModelInvocationLink(database, next.compactionJobId);
        if (existing !== undefined) {
          return samePreparedCompactionModelInvocationLink(existing, input)
            ? { ok: true, replayed: true, value: existing }
            : compactionInvocationFailure("compaction_model_invocation_link.conflict", "link identity conflicts");
        }
        const collision = database.prepare(`
          SELECT compaction_job_id FROM compaction_model_invocation_links
          WHERE client_request_id = ? OR model_request_id = ?
        `).get(next.clientRequestId, next.modelRequestId);
        if (collision !== undefined) {
          return compactionInvocationFailure("compaction_model_invocation_link.conflict", "request identity is already used");
        }
        insertCompactionModelInvocationLink(database, next);
        return { ok: true, replayed: false, value: next };
      });
    } catch (error) {
      return sqliteCompactionInvocationFailure(error);
    }
  }

  async recordAccepted(input: Readonly<{
    compactionJobId: string;
    expectedRecordDigest: string;
    invocationId: string;
    statusRevision: number;
    durableCursor?: string;
    acceptedAt: string;
  }>): Promise<CompactionModelInvocationLinkWriteResult> {
    return this.#advanceCompactionInvocation(input.compactionJobId, input.expectedRecordDigest, (current) => ({
      ...withoutCompactionInvocationDigest(current),
      invocationId: input.invocationId,
      statusRevision: input.statusRevision,
      ...(input.durableCursor === undefined ? {} : { durableCursor: input.durableCursor }),
      acceptedAt: input.acceptedAt,
      updatedAt: input.acceptedAt,
    }));
  }

  async recordStreamProgress(input: Readonly<{
    compactionJobId: string;
    expectedRecordDigest: string;
    statusRevision: number;
    durableCursor?: string;
    outputStartedAt?: string;
    updatedAt: string;
  }>): Promise<CompactionModelInvocationLinkWriteResult> {
    return this.#advanceCompactionInvocation(input.compactionJobId, input.expectedRecordDigest, (current) => ({
      ...withoutCompactionInvocationDigest(current),
      statusRevision: input.statusRevision,
      ...(input.durableCursor === undefined ? {} : { durableCursor: input.durableCursor }),
      ...(current.outputStartedAt === undefined && input.outputStartedAt !== undefined
        ? { outputStartedAt: input.outputStartedAt }
        : {}),
      updatedAt: input.updatedAt,
    }));
  }

  async listPendingCompactionJobs(): Promise<readonly CompactionJob[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT job_json FROM compaction_jobs
      WHERE status = 'pending'
      ORDER BY created_at, compaction_job_id
    `).all() as Record<string, unknown>[];
    return rows.map((row) => CompactionJobSchema.parse(JSON.parse(requireString(row.job_json, "job_json"))));
  }

  async requestCompaction(
    input: RequestCompactionInput,
  ): Promise<ConversationWriteResult<CompactionJob>> {
    const validated = validateRequestCompaction(input);
    if ("ok" in validated) return validated;
    const database = this.#requireDatabase();
    try {
      const result = withImmediateTransaction<ConversationWriteResult<CompactionJob>>(database, () => {
        const replay = replayJob(database, validated.receipt);
        if (replay !== undefined) {
          if (!replay.ok) return replay;
          const existingBinding = selectCompactionExecutionBinding(
            database,
            validated.job.compactionJobId,
          );
          return existingBinding !== undefined
            && existingBinding.bindingDigest === validated.executionBinding.bindingDigest
            ? replay
            : conversationFailure(
              "persistence.compaction_execution_binding_conflict",
              "compaction request replay changed its execution binding",
            );
        }
        const head = selectSessionHead(database, validated.command.sessionId);
        if (head === undefined) return conversationFailure("persistence.session_not_found", "session does not exist");
        const pending = database.prepare(
          "SELECT compaction_job_id FROM compaction_jobs WHERE session_id = ? AND status = 'pending'",
        ).get(head.sessionId);
        if (pending !== undefined) {
          return conversationFailure("persistence.pending_compaction_exists", "session already has a pending compaction");
        }
        const range = selectMessageRange(
          database,
          head.sessionId,
          validated.command.sourceStartSequence,
          validated.command.sourceEndSequence,
        );
        const expectedCount = validated.command.sourceEndSequence - validated.command.sourceStartSequence + 1;
        if (
          validated.command.sourceEndSequence > head.messageSequence
          || range.length !== expectedCount
          || digestConversationRange(range) !== validated.command.sourceDigest
        ) return conversationFailure("persistence.compaction_source_changed", "locked source range or digest changed");
        if (
          head.activeCompactionId !== validated.command.baseActiveCompactionId
          || head.contextRevision !== validated.command.baseContextRevision
        ) return conversationFailure("persistence.compaction_stale", "compaction base view changed");
        if (
          validated.event.sequence !== head.sessionEventSequence + 1
          || validated.receipt.contextRevision !== head.contextRevision
        ) return conversationFailure("persistence.integrity_violation", "request event or receipt does not match SessionHead");

        insertJob(database, validated.job);
        this.#faultInjector?.("request_compaction.after_job_before_binding");
        insertCompactionExecutionBinding(database, validated.executionBinding);
        insertSessionEvent(database, validated.event, validated.job.compactionJobId);
        insertSessionReceipt(database, validated.receipt);
        for (const record of validated.outbox) insertSessionOutbox(database, record);
        updateHeadEventSequence(database, head, validated.event.sequence, validated.command.issuedAt);
        return { ok: true, replayed: false, value: validated.job };
      });
      this.#faultInjector?.("request_compaction.after_commit");
      return result;
    } catch (error) {
      return sqliteConversationFailure(error);
    }
  }

  async commitCompaction(
    input: CommitCompactionInput,
  ): Promise<ConversationWriteResult<CompactionRecord>> {
    const validated = validateCommitCompaction(input);
    if ("ok" in validated) return validated;
    const database = this.#requireDatabase();
    try {
      const result = withImmediateTransaction<ConversationWriteResult<CompactionRecord>>(database, () => {
        const existingReceipt = selectReceipt(database, validated.receipt.commandId);
        if (existingReceipt !== undefined) {
          if (!sameReceipt(existingReceipt, validated.receipt)) return idempotencyConflict();
          const existingRecord = selectRecord(database, validated.command.compactionId);
          return existingRecord === undefined
            ? conversationFailure("persistence.integrity_violation", "receipt references missing compaction record")
            : { ok: true, replayed: true, value: existingRecord };
        }
        const job = selectJob(database, validated.command.compactionJobId);
        const head = selectSessionHead(database, validated.command.sessionId);
        if (job === undefined) return conversationFailure("persistence.compaction_job_not_found", "compaction job does not exist");
        if (head === undefined) return conversationFailure("persistence.session_not_found", "session does not exist");
        if (job.status !== "pending") {
          return conversationFailure(
            job.status === "completed" ? "persistence.compaction_stale" : "persistence.compaction_job_not_pending",
            "compaction result lost the commit race",
          );
        }
        const record = validated.command.record;
        const range = selectMessageRange(
          database,
          job.sessionId,
          job.sourceStartSequence,
          job.sourceEndSequence,
        );
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
        if (validated.event.sequence !== head.sessionEventSequence + 1) {
          return conversationFailure("persistence.session_event_sequence_conflict", "session event sequence changed");
        }
        if (validated.summaryInvocationCommit !== undefined) {
          const link = selectCompactionModelInvocationLink(database, job.compactionJobId);
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

        insertRecord(database, record);
        const nextHead = SessionHeadSchema.parse({
          ...head,
          activeCompactionId: record.compactionId,
          contextRevision: job.baseContextRevision + 1,
          sessionEventSequence: validated.event.sequence,
          updatedAt: validated.command.issuedAt,
        });
        const cas = database.prepare(`
          UPDATE session_heads
          SET active_compaction_id = ?, context_revision = ?,
              session_event_sequence = ?, updated_at = ?, head_json = ?
          WHERE session_id = ? AND context_revision = ?
            AND (
              (active_compaction_id IS NULL AND ? IS NULL)
              OR active_compaction_id = ?
            )
        `).run(
          record.compactionId,
          job.baseContextRevision + 1,
          validated.event.sequence,
          validated.command.issuedAt,
          JSON.stringify(nextHead),
          head.sessionId,
          job.baseContextRevision,
          job.baseActiveCompactionId ?? null,
          job.baseActiveCompactionId ?? null,
        );
        if (Number(cas.changes) !== 1) {
          throw new ConversationAbort(
            conversationFailure("persistence.compaction_stale", "compaction compare-and-set lost"),
          );
        }
        const completed = CompactionJobSchema.parse({
          ...job,
          status: "completed",
          commitCommandId: validated.command.commandId,
          completedAt: validated.command.issuedAt,
          updatedAt: validated.command.issuedAt,
        });
        updateJob(database, completed, "pending");
        insertSessionEvent(database, validated.event, job.compactionJobId);
        insertSessionReceipt(database, validated.receipt);
        for (const outbox of validated.outbox) insertSessionOutbox(database, outbox);
        if (validated.summaryInvocationCommit !== undefined) {
          const current = selectCompactionModelInvocationLink(database, job.compactionJobId)!;
          const committed = withCompactionInvocationDigest({
            ...withoutCompactionInvocationDigest(current),
            summaryCommittedAt: validated.summaryInvocationCommit.summaryCommittedAt,
            updatedAt: validated.summaryInvocationCommit.summaryCommittedAt,
          });
          updateCompactionModelInvocationLink(database, committed, current.recordDigest);
        }
        return { ok: true, replayed: false, value: record };
      });
      this.#faultInjector?.("commit_compaction.after_commit");
      return result;
    } catch (error) {
      return sqliteConversationFailure(error);
    }
  }

  async terminateCompaction(
    input: TerminateCompactionInput,
  ): Promise<ConversationWriteResult<CompactionJob>> {
    const validated = validateTerminateCompaction(input);
    if ("ok" in validated) return validated;
    const database = this.#requireDatabase();
    try {
      return withImmediateTransaction(database, () => {
        const replay = replayJob(database, validated.receipt);
        if (replay !== undefined) return replay;
        const current = selectJob(database, validated.command.compactionJobId);
        const head = selectSessionHead(database, validated.command.sessionId);
        if (current === undefined) return conversationFailure("persistence.compaction_job_not_found", "compaction job does not exist");
        if (head === undefined) return conversationFailure("persistence.session_not_found", "session does not exist");
        if (current.status !== "pending") {
          return conversationFailure("persistence.compaction_job_not_pending", "compaction job is not pending");
        }
        if (!sameLockedJob(current, validated.job)) {
          return conversationFailure("persistence.integrity_violation", "terminal job changed locked compaction fields");
        }
        if (validated.event.sequence !== head.sessionEventSequence + 1) {
          return conversationFailure("persistence.session_event_sequence_conflict", "session event sequence changed");
        }
        updateJob(database, validated.job, "pending");
        insertSessionEvent(database, validated.event, current.compactionJobId);
        insertSessionReceipt(database, validated.receipt);
        for (const outbox of validated.outbox) insertSessionOutbox(database, outbox);
        updateHeadEventSequence(database, head, validated.event.sequence, validated.command.issuedAt);
        return { ok: true, replayed: false, value: validated.job };
      });
    } catch (error) {
      return sqliteConversationFailure(error);
    }
  }

  #requireDatabase(): DatabaseSync {
    if (this.#database === undefined) throw new Error("SqliteConversationPersistence is not started");
    return this.#database;
  }

  #advanceCompactionInvocation(
    compactionJobId: string,
    expectedRecordDigest: string,
    update: (current: CompactionModelInvocationLink) => Omit<CompactionModelInvocationLink, "recordDigest">,
  ): CompactionModelInvocationLinkWriteResult {
    try {
      return withImmediateTransaction(this.#requireDatabase(), () => {
        const database = this.#requireDatabase();
        const current = selectCompactionModelInvocationLink(database, compactionJobId);
        if (current === undefined) {
          return compactionInvocationFailure("compaction_model_invocation_link.not_found", "link not found");
        }
        if (current.recordDigest !== expectedRecordDigest) {
          return compactionInvocationFailure("compaction_model_invocation_link.stale_revision", "link digest changed");
        }
        const next = withCompactionInvocationDigest(update(current));
        updateCompactionModelInvocationLink(database, next, expectedRecordDigest);
        return { ok: true, replayed: false, value: next };
      });
    } catch (error) {
      return sqliteCompactionInvocationFailure(error);
    }
  }
}

function insertSessionHead(database: DatabaseSync, head: SessionHead): void {
  database.prepare(`
    INSERT INTO session_heads (
      session_id, schema_version, message_sequence, session_event_sequence,
      context_revision, active_compaction_id, created_at, updated_at, head_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    head.sessionId,
    head.schemaVersion,
    head.messageSequence,
    head.sessionEventSequence,
    head.contextRevision,
    head.activeCompactionId ?? null,
    head.createdAt,
    head.updatedAt,
    JSON.stringify(head),
  );
}

function selectSessionHead(database: DatabaseSync, sessionId: string): SessionHead | undefined {
  const row = database.prepare(
    "SELECT head_json FROM session_heads WHERE session_id = ?",
  ).get(sessionId) as Record<string, unknown> | undefined;
  return row === undefined
    ? undefined
    : SessionHeadSchema.parse(JSON.parse(requireString(row.head_json, "head_json")));
}

function insertMessage(database: DatabaseSync, message: ConversationMessage): void {
  const envelope = message.envelope;
  database.prepare(`
    INSERT INTO conversation_messages (
      message_id, session_id, sequence, schema_version, message_schema_version,
      message_digest, task_id, created_at, message_json, content_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    envelope.messageId,
    envelope.sessionId,
    envelope.sequence,
    envelope.schemaVersion,
    envelope.messageSchemaVersion,
    envelope.messageDigest,
    envelope.taskId ?? null,
    envelope.createdAt,
    JSON.stringify(envelope),
    JSON.stringify(message.message),
  );
}

function selectMessageAt(
  database: DatabaseSync,
  sessionId: string,
  sequence: number,
): ConversationMessage | undefined {
  const row = database.prepare(
    "SELECT message_json, content_json FROM conversation_messages WHERE session_id = ? AND sequence = ?",
  ).get(sessionId, sequence) as Record<string, unknown> | undefined;
  return parseOptionalMessage(row);
}

function selectMessageById(
  database: DatabaseSync,
  messageId: string,
): ConversationMessage | undefined {
  const row = database.prepare(
    "SELECT message_json, content_json FROM conversation_messages WHERE message_id = ?",
  ).get(messageId) as Record<string, unknown> | undefined;
  return parseOptionalMessage(row);
}

function selectPreparedMessage(
  database: DatabaseSync,
  messageId: string,
): PreparedConversationMessage | undefined {
  const row = database.prepare(
    "SELECT intent_json FROM conversation_message_intents WHERE message_id = ?",
  ).get(messageId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const parsed = JSON.parse(requireString(row.intent_json, "intent_json")) as
    PreparedConversationMessage;
  const validated = validatePreparedMessage(parsed);
  if (!validated.ok) throw new Error("SQLite prepared conversation message is invalid");
  return validated.value;
}

function parseOptionalMessage(row: Record<string, unknown> | undefined): ConversationMessage | undefined {
  if (row === undefined) return undefined;
  if (row.content_json === null) {
    throw new Error("SQLite conversation message contains a pre-KAF-5.1 envelope without rich content");
  }
  const record = ConversationMessageSchema.parse({
    envelope: JSON.parse(requireString(row.message_json, "message_json")),
    message: JSON.parse(requireString(row.content_json, "content_json")),
  });
  if (sha256CanonicalJson(JsonValueSchema.parse(record.message)) !== record.envelope.messageDigest) {
    throw new Error("SQLite conversation message content does not match messageDigest");
  }
  return record;
}

function selectMessageRange(
  database: DatabaseSync,
  sessionId: string,
  start: number,
  end: number,
): readonly ConversationMessage[] {
  const rows = database.prepare(`
    SELECT message_json, content_json FROM conversation_messages
    WHERE session_id = ? AND sequence BETWEEN ? AND ?
    ORDER BY sequence
  `).all(sessionId, start, end) as Record<string, unknown>[];
  return rows.map((row) => {
    const parsed = parseOptionalMessage(row);
    if (parsed === undefined) throw new Error("SQLite conversation message row disappeared");
    return parsed;
  });
}

function insertToolCallBatch(database: DatabaseSync, batch: ToolCallBatchRecord): void {
  database.prepare(`
    INSERT INTO tool_call_batches (
      batch_id, session_id, task_id, run_id, assistant_message_id,
      assistant_message_sequence, assistant_message_digest, batch_digest,
      call_count, created_at, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    batch.batchId,
    batch.sessionId,
    batch.taskId,
    batch.runId,
    batch.assistantMessageId,
    batch.assistantMessageSequence,
    batch.assistantMessageDigest,
    batch.batchDigest,
    batch.callCount,
    batch.createdAt,
    JSON.stringify(batch),
  );
}

function selectToolCallBatch(
  database: DatabaseSync,
  batchId: string,
): ToolCallBatchRecord | undefined {
  const row = database.prepare(
    "SELECT record_json FROM tool_call_batches WHERE batch_id = ?",
  ).get(batchId) as Record<string, unknown> | undefined;
  return row === undefined
    ? undefined
    : ToolCallBatchRecordSchema.parse(
      JSON.parse(requireString(row.record_json, "record_json")),
    );
}

function insertToolCallDisposition(
  database: DatabaseSync,
  record: ToolCallDispositionRecord,
): void {
  database.prepare(`
    INSERT INTO tool_call_dispositions (
      batch_id, tool_call_id, action_id, ordinal, disposition, revision,
      confirmation_id, effect_attempt_id, result_message_id, result_digest,
      updated_at, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.batchId,
    record.toolCallId,
    record.actionId,
    record.ordinal,
    record.disposition,
    record.revision,
    record.confirmationId ?? null,
    record.effectAttemptId ?? null,
    record.resultMessageId ?? null,
    record.resultDigest ?? null,
    record.updatedAt,
    JSON.stringify(record),
  );
}

function selectToolCallDisposition(
  database: DatabaseSync,
  batchId: string,
  toolCallId: string,
): ToolCallDispositionRecord | undefined {
  const row = database.prepare(`
    SELECT record_json FROM tool_call_dispositions
    WHERE batch_id = ? AND tool_call_id = ?
  `).get(batchId, toolCallId) as Record<string, unknown> | undefined;
  return row === undefined
    ? undefined
    : ToolCallDispositionRecordSchema.parse(
      JSON.parse(requireString(row.record_json, "record_json")),
    );
}

function selectToolCallDispositions(
  database: DatabaseSync,
  batchId: string,
): readonly ToolCallDispositionRecord[] {
  const rows = database.prepare(`
    SELECT record_json FROM tool_call_dispositions
    WHERE batch_id = ?
    ORDER BY ordinal
  `).all(batchId) as Record<string, unknown>[];
  return rows.map((row) => ToolCallDispositionRecordSchema.parse(
    JSON.parse(requireString(row.record_json, "record_json")),
  ));
}

function updateToolCallDisposition(
  database: DatabaseSync,
  record: ToolCallDispositionRecord,
  expectedRevision: number,
): void {
  const result = database.prepare(`
    UPDATE tool_call_dispositions
    SET disposition = ?, revision = ?, confirmation_id = ?, effect_attempt_id = ?,
        result_message_id = ?, result_digest = ?, updated_at = ?, record_json = ?
    WHERE batch_id = ? AND tool_call_id = ? AND revision = ?
  `).run(
    record.disposition,
    record.revision,
    record.confirmationId ?? null,
    record.effectAttemptId ?? null,
    record.resultMessageId ?? null,
    record.resultDigest ?? null,
    record.updatedAt,
    JSON.stringify(record),
    record.batchId,
    record.toolCallId,
    expectedRevision,
  );
  if (Number(result.changes) !== 1) {
    throw new ConversationAbort(conversationFailure(
      "persistence.tool_call_disposition_revision_conflict",
      "Tool Call disposition revision changed",
    ));
  }
}

function updateMessageSequence(
  database: DatabaseSync,
  head: SessionHead,
  sequence: number,
  updatedAt: string,
): void {
  const next = SessionHeadSchema.parse({
    ...head,
    messageSequence: sequence,
    updatedAt,
  });
  const result = database.prepare(`
    UPDATE session_heads
    SET message_sequence = ?, updated_at = ?, head_json = ?
    WHERE session_id = ? AND message_sequence = ?
  `).run(
    sequence,
    updatedAt,
    JSON.stringify(next),
    head.sessionId,
    head.messageSequence,
  );
  if (Number(result.changes) !== 1) {
    throw new ConversationAbort(conversationFailure(
      "persistence.message_sequence_conflict",
      "message sequence changed",
    ));
  }
}

function insertJob(database: DatabaseSync, job: CompactionJob): void {
  database.prepare(`
    INSERT INTO compaction_jobs (
      compaction_job_id, compaction_id, session_id, request_command_id, status,
      source_start_sequence, source_end_sequence, source_digest,
      base_active_compaction_id, base_context_revision, created_at, updated_at, job_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.compactionJobId,
    job.compactionId,
    job.sessionId,
    job.requestCommandId,
    job.status,
    job.sourceStartSequence,
    job.sourceEndSequence,
    job.sourceDigest,
    job.baseActiveCompactionId ?? null,
    job.baseContextRevision,
    job.createdAt,
    job.updatedAt,
    JSON.stringify(job),
  );
}

function insertCompactionExecutionBinding(
  database: DatabaseSync,
  binding: ReadableCompactionExecutionBinding,
): void {
  database.prepare(`
    INSERT INTO compaction_execution_bindings (
      compaction_job_id, session_id, task_id, runtime_selection_id,
      runtime_selection_digest, model_lock_id, model_capability_id,
      model_lock_digest, registry_revision, adapter_descriptor_id,
      adapter_descriptor_revision, external_target_digest,
      summarizer_prompt_revision, binding_digest, created_at, binding_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    binding.compactionJobId,
    binding.sessionId,
    binding.taskId,
    binding.runtimeSelectionId,
    binding.runtimeSelectionDigest,
    binding.modelLockId,
    binding.modelCapabilityId,
    binding.modelLockDigest,
    binding.registryRevision,
    binding.adapterDescriptorId,
    binding.adapterDescriptorRevision,
    binding.externalTargetDigest,
    binding.summarizerPromptRevision,
    binding.bindingDigest,
    binding.createdAt,
    JSON.stringify(binding),
  );
}

function selectCompactionExecutionBinding(
  database: DatabaseSync,
  compactionJobId: string,
): ReadableCompactionExecutionBinding | undefined {
  const row = database.prepare(`
    SELECT compaction_job_id, session_id, task_id, runtime_selection_id,
           runtime_selection_digest, model_lock_id, model_capability_id,
           model_lock_digest, registry_revision, adapter_descriptor_id,
           adapter_descriptor_revision, external_target_digest,
           summarizer_prompt_revision, binding_digest, created_at, binding_json
    FROM compaction_execution_bindings
    WHERE compaction_job_id = ?
  `).get(compactionJobId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const binding = ReadableCompactionExecutionBindingSchema.parse(
    JSON.parse(requireString(row.binding_json, "binding_json")),
  );
  const indexed = [
    ["compaction_job_id", binding.compactionJobId],
    ["session_id", binding.sessionId],
    ["task_id", binding.taskId],
    ["runtime_selection_id", binding.runtimeSelectionId],
    ["runtime_selection_digest", binding.runtimeSelectionDigest],
    ["model_lock_id", binding.modelLockId],
    ["model_capability_id", binding.modelCapabilityId],
    ["model_lock_digest", binding.modelLockDigest],
    ["registry_revision", binding.registryRevision],
    ["adapter_descriptor_id", binding.adapterDescriptorId],
    ["adapter_descriptor_revision", binding.adapterDescriptorRevision],
    ["external_target_digest", binding.externalTargetDigest],
    ["summarizer_prompt_revision", binding.summarizerPromptRevision],
    ["binding_digest", binding.bindingDigest],
    ["created_at", binding.createdAt],
  ] as const;
  if (indexed.some(([column, expected]) => requireString(row[column], column) !== expected)) {
    throw new Error("CompactionExecutionBinding indexed columns drifted from binding_json");
  }
  return binding;
}

function insertCompactionModelInvocationLink(
  database: DatabaseSync,
  link: CompactionModelInvocationLink,
): void {
  database.prepare(`
    INSERT INTO compaction_model_invocation_links (
      compaction_job_id, client_request_id, model_request_id, model_request_digest,
      execution_binding_digest, confirmation_id, scope_digest, data_scope_digest,
      invocation_id, status_revision, durable_cursor, accepted_at, output_started_at,
      summary_committed_at, record_digest, created_at, updated_at, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...compactionInvocationSqlValues(link));
}

function updateCompactionModelInvocationLink(
  database: DatabaseSync,
  link: CompactionModelInvocationLink,
  expectedRecordDigest: string,
): void {
  const result = database.prepare(`
    UPDATE compaction_model_invocation_links
    SET invocation_id = ?, status_revision = ?, durable_cursor = ?, accepted_at = ?,
        output_started_at = ?, summary_committed_at = ?, record_digest = ?,
        updated_at = ?, record_json = ?
    WHERE compaction_job_id = ? AND record_digest = ?
  `).run(
    link.invocationId ?? null,
    link.statusRevision ?? null,
    link.durableCursor ?? null,
    link.acceptedAt ?? null,
    link.outputStartedAt ?? null,
    link.summaryCommittedAt ?? null,
    link.recordDigest,
    link.updatedAt,
    JSON.stringify(link),
    link.compactionJobId,
    expectedRecordDigest,
  );
  if (Number(result.changes) !== 1) throw new Error("Compaction Model invocation link compare-and-set lost");
}

function selectCompactionModelInvocationLink(
  database: DatabaseSync,
  compactionJobId: string,
): CompactionModelInvocationLink | undefined {
  const row = database.prepare(`
    SELECT compaction_job_id, client_request_id, model_request_id, model_request_digest,
           execution_binding_digest, confirmation_id, scope_digest, data_scope_digest,
           invocation_id, status_revision, durable_cursor, accepted_at, output_started_at,
           summary_committed_at, record_digest, created_at, updated_at, record_json
    FROM compaction_model_invocation_links WHERE compaction_job_id = ?
  `).get(compactionJobId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const link = CompactionModelInvocationLinkSchema.parse(JSON.parse(requireString(row.record_json, "record_json")));
  const indexed = [
    ["compaction_job_id", link.compactionJobId],
    ["client_request_id", link.clientRequestId],
    ["model_request_id", link.modelRequestId],
    ["model_request_digest", link.modelRequestDigest],
    ["execution_binding_digest", link.executionBindingDigest],
    ["confirmation_id", link.confirmationId],
    ["scope_digest", link.scopeDigest],
    ["data_scope_digest", link.dataScopeDigest],
    ["record_digest", link.recordDigest],
    ["created_at", link.createdAt],
    ["updated_at", link.updatedAt],
  ] as const;
  if (indexed.some(([column, expected]) => requireString(row[column], column) !== expected)) {
    throw new Error("Compaction Model invocation link indexed columns drifted from record_json");
  }
  return link;
}

function compactionInvocationSqlValues(link: CompactionModelInvocationLink): readonly (string | number | null)[] {
  return [
    link.compactionJobId, link.clientRequestId, link.modelRequestId, link.modelRequestDigest,
    link.executionBindingDigest, link.confirmationId, link.scopeDigest, link.dataScopeDigest,
    link.invocationId ?? null, link.statusRevision ?? null, link.durableCursor ?? null,
    link.acceptedAt ?? null, link.outputStartedAt ?? null, link.summaryCommittedAt ?? null,
    link.recordDigest, link.createdAt, link.updatedAt, JSON.stringify(link),
  ];
}

function withoutCompactionInvocationDigest(
  link: CompactionModelInvocationLink,
): Omit<CompactionModelInvocationLink, "recordDigest"> {
  const { recordDigest: _recordDigest, ...material } = link;
  return material;
}

function compactionInvocationFailure(
  code: "compaction_model_invocation_link.conflict" | "compaction_model_invocation_link.not_found" | "compaction_model_invocation_link.stale_revision",
  message: string,
): CompactionModelInvocationLinkWriteResult {
  return { ok: false, error: { code, message } };
}

function sqliteCompactionInvocationFailure(error: unknown): CompactionModelInvocationLinkWriteResult {
  return compactionInvocationFailure(
    "compaction_model_invocation_link.conflict",
    error instanceof Error ? error.message : "SQLite compaction Model invocation write failed",
  );
}

function assertSequenceRange(startSequence: number, endSequence: number): void {
  if (
    !Number.isSafeInteger(startSequence)
    || !Number.isSafeInteger(endSequence)
    || startSequence < 1
    || endSequence < startSequence
  ) throw new Error("Conversation sequence range is invalid");
}

function updateJob(database: DatabaseSync, job: CompactionJob, expectedStatus: "pending"): void {
  const result = database.prepare(`
    UPDATE compaction_jobs
    SET status = ?, updated_at = ?, job_json = ?
    WHERE compaction_job_id = ? AND status = ?
  `).run(job.status, job.updatedAt, JSON.stringify(job), job.compactionJobId, expectedStatus);
  if (Number(result.changes) !== 1) {
    throw new ConversationAbort(
      conversationFailure("persistence.compaction_job_not_pending", "compaction job changed"),
    );
  }
}

function selectJob(database: DatabaseSync, compactionJobId: string): CompactionJob | undefined {
  const row = database.prepare(
    "SELECT job_json FROM compaction_jobs WHERE compaction_job_id = ?",
  ).get(compactionJobId) as Record<string, unknown> | undefined;
  return row === undefined
    ? undefined
    : CompactionJobSchema.parse(JSON.parse(requireString(row.job_json, "job_json")));
}

function insertRecord(database: DatabaseSync, record: CompactionRecord): void {
  database.prepare(`
    INSERT INTO compaction_records (
      compaction_id, compaction_job_id, session_id, source_start_sequence,
      source_end_sequence, source_digest, base_active_compaction_id,
      base_context_revision, record_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.compactionId,
    record.compactionJobId,
    record.sessionId,
    record.sourceStartSequence,
    record.sourceEndSequence,
    record.sourceDigest,
    record.baseActiveCompactionId ?? null,
    record.baseContextRevision,
    JSON.stringify(record),
    record.createdAt,
  );
}

function selectRecord(database: DatabaseSync, compactionId: string): CompactionRecord | undefined {
  const row = database.prepare(
    "SELECT record_json FROM compaction_records WHERE compaction_id = ?",
  ).get(compactionId) as Record<string, unknown> | undefined;
  return row === undefined
    ? undefined
    : CompactionRecordSchema.parse(JSON.parse(requireString(row.record_json, "record_json")));
}

function insertSessionEvent(
  database: DatabaseSync,
  event: SessionEvent,
  compactionJobId: string,
): void {
  database.prepare(`
    INSERT INTO session_events (
      event_id, session_id, sequence, compaction_job_id, type, occurred_at,
      causation_id, correlation_id, event_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventId,
    event.sessionId,
    event.sequence,
    compactionJobId,
    event.type,
    event.occurredAt,
    event.causationId,
    event.correlationId,
    JSON.stringify(event),
  );
}

function insertSessionReceipt(
  database: DatabaseSync,
  receipt: Extract<SessionCommandReceipt, { outcome: "accepted" }>,
): void {
  database.prepare(`
    INSERT INTO session_command_receipts (
      command_id, session_id, compaction_job_id, command_type, command_digest,
      outcome, context_revision, received_at, receipt_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    receipt.commandId,
    receipt.sessionId,
    receipt.compactionJobId,
    receipt.commandType,
    receipt.commandDigest,
    receipt.outcome,
    receipt.contextRevision,
    receipt.receivedAt,
    JSON.stringify(receipt),
  );
}

function selectReceipt(database: DatabaseSync, commandId: string): SessionCommandReceipt | undefined {
  const row = database.prepare(
    "SELECT receipt_json FROM session_command_receipts WHERE command_id = ?",
  ).get(commandId) as Record<string, unknown> | undefined;
  return row === undefined
    ? undefined
    : SessionCommandReceiptSchema.parse(JSON.parse(requireString(row.receipt_json, "receipt_json")));
}

function insertSessionOutbox(database: DatabaseSync, record: SessionOutboxRecord): void {
  database.prepare(`
    INSERT INTO outbox (
      outbox_id, event_id, session_event_id, session_id, destination,
      attempt_count, created_at, next_attempt_at, published_at, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.outboxId,
    record.eventId,
    record.eventId,
    record.sessionId,
    record.destination,
    record.attemptCount,
    record.createdAt,
    record.nextAttemptAt ?? null,
    record.publishedAt ?? null,
    JSON.stringify(record),
  );
}

function updateHeadEventSequence(
  database: DatabaseSync,
  head: SessionHead,
  sequence: number,
  updatedAt: string,
): void {
  const next = SessionHeadSchema.parse({
    ...head,
    sessionEventSequence: sequence,
    updatedAt,
  });
  const result = database.prepare(`
    UPDATE session_heads
    SET session_event_sequence = ?, updated_at = ?, head_json = ?
    WHERE session_id = ? AND session_event_sequence = ?
  `).run(sequence, updatedAt, JSON.stringify(next), head.sessionId, head.sessionEventSequence);
  if (Number(result.changes) !== 1) {
    throw new ConversationAbort(
      conversationFailure("persistence.session_event_sequence_conflict", "session event sequence changed"),
    );
  }
}

function replayJob(
  database: DatabaseSync,
  receipt: Extract<SessionCommandReceipt, { outcome: "accepted" }>,
): ConversationWriteResult<CompactionJob> | undefined {
  const existing = selectReceipt(database, receipt.commandId);
  if (existing === undefined) return undefined;
  if (!sameReceipt(existing, receipt)) return idempotencyConflict();
  const job = selectJob(database, receipt.compactionJobId);
  return job === undefined
    ? conversationFailure("persistence.integrity_violation", "receipt references missing compaction job")
    : { ok: true, replayed: true, value: job };
}

function sameReceipt(left: SessionCommandReceipt, right: SessionCommandReceipt): boolean {
  return left.commandDigest === right.commandDigest && left.commandType === right.commandType;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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

function idempotencyConflict(): ConversationWriteFailure {
  return conversationFailure(
    "persistence.session_command_idempotency_conflict",
    "commandId already exists with a different canonical digest",
  );
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

function withImmediateTransaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the original transaction failure.
    }
    throw error;
  }
}

class ConversationAbort extends Error {
  readonly failure: ConversationWriteFailure;

  constructor(failure: ConversationWriteFailure) {
    super(failure.error.message);
    this.failure = failure;
  }
}

function sqliteConversationFailure(error: unknown): ConversationWriteFailure {
  if (error instanceof ConversationAbort) return error.failure;
  const message = error instanceof Error ? error.message : "SQLite conversation write failed";
  if (message.includes("compaction_jobs_one_pending_per_session_idx")) {
    return conversationFailure(
      "persistence.pending_compaction_exists",
      "session already has a pending compaction",
    );
  }
  return conversationFailure("persistence.sqlite_write_failed", message);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`SQLite field ${field} must be a string`);
  return value;
}
