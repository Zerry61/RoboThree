import type {
  CompactionJob,
  CompactionRecord,
  ConversationMessage,
  JsonObject,
  ProviderNeutralMessage,
  RuntimeError,
  SessionCommand,
  SessionCommandReceipt,
  SessionEvent,
  SessionHead,
} from "@robothree/contracts";

import type { PersistenceAdapter } from "./persistence.js";
import type {
  ToolCallBatchRecord,
  ToolCallDispositionRecord,
} from "../persistence/tool-call-batch.js";
import type {
  ReadableCompactionExecutionBinding,
} from "../persistence/compaction-execution-binding.js";
import type {
  CompactionModelInvocationLinkPersistence,
  CompactionModelInvocationLink,
} from "./compaction-model-invocation-link-persistence.js";

export type ConversationWriteSuccess<T> = {
  ok: true;
  replayed: boolean;
  value: T;
};

export type ConversationWriteFailure = {
  ok: false;
  error: RuntimeError;
};

export type ConversationWriteResult<T> =
  | ConversationWriteSuccess<T>
  | ConversationWriteFailure;

export type SessionOutboxRecord = {
  outboxId: string;
  eventId: string;
  sessionId: string;
  destination: string;
  payload: JsonObject;
  attemptCount: number;
  createdAt: string;
  nextAttemptAt?: string;
  publishedAt?: string;
};

export type AppendConversationMessageInput = {
  expectedMessageSequence: number;
  message: ConversationMessage;
  updatedAt: string;
};

export type AssistantConversationMessage = Omit<ConversationMessage, "message"> & {
  message: Extract<ProviderNeutralMessage, { role: "assistant" }>;
};

export type ToolResultConversationMessage = Omit<ConversationMessage, "message"> & {
  message: Extract<ProviderNeutralMessage, { role: "tool" }>;
};

export type ToolCallBatchCommit = {
  message: AssistantConversationMessage;
  batch: ToolCallBatchRecord;
  dispositions: readonly ToolCallDispositionRecord[];
};

export type AppendAssistantToolCallBatchInput = {
  expectedMessageSequence: number;
  message: AssistantConversationMessage;
  batch: ToolCallBatchRecord;
  dispositions: readonly ToolCallDispositionRecord[];
  updatedAt: string;
};

export type TransitionToolCallDispositionInput = {
  batchId: string;
  toolCallId: string;
  expectedRevision: number;
  next: ToolCallDispositionRecord;
};

export type AppendToolResultAndCompleteDispositionInput = {
  expectedMessageSequence: number;
  expectedDispositionRevision: number;
  batchId: string;
  toolCallId: string;
  message: ToolResultConversationMessage;
  completedDisposition: ToolCallDispositionRecord;
  updatedAt: string;
};

export type PreparedConversationMessage = {
  messageId: string;
  sessionId: string;
  taskId: string;
  messageDigest: string;
  message: Extract<ProviderNeutralMessage, { role: "user" }>;
  createdAt: string;
};

export type RequestCompactionInput = {
  command: Extract<SessionCommand, { type: "request_compaction" }>;
  job: Extract<CompactionJob, { status: "pending" }>;
  executionBinding: ReadableCompactionExecutionBinding;
  event: Extract<SessionEvent, { type: "context.compaction_requested" }>;
  receipt: Extract<SessionCommandReceipt, { outcome: "accepted" }>;
  outbox: readonly SessionOutboxRecord[];
};

export type CommitCompactionInput = {
  command: Extract<SessionCommand, { type: "commit_compaction" }>;
  event: Extract<SessionEvent, { type: "context.compaction_committed" }>;
  receipt: Extract<SessionCommandReceipt, { outcome: "accepted" }>;
  outbox: readonly SessionOutboxRecord[];
  summaryInvocationCommit?: Readonly<{
    compactionJobId: string;
    clientRequestId: string;
    expectedRecordDigest: string;
    summaryCommittedAt: string;
  }>;
};

export type TerminateCompactionInput = {
  command: Extract<SessionCommand, {
    type: "fail_compaction" | "mark_compaction_stale";
  }>;
  job: Extract<CompactionJob, { status: "failed" | "stale" }>;
  event: Extract<SessionEvent, {
    type: "context.compaction_failed" | "context.compaction_stale";
  }>;
  receipt: Extract<SessionCommandReceipt, { outcome: "accepted" }>;
  outbox: readonly SessionOutboxRecord[];
};

export type ConversationPersistenceFaultPoint =
  | "request_compaction.after_job_before_binding"
  | "request_compaction.after_commit"
  | "commit_compaction.after_commit"
  | "append_assistant_batch.after_message"
  | "append_assistant_batch.after_batch"
  | "append_tool_result.after_message";

export type ConversationPersistenceFaultInjector = (
  point: ConversationPersistenceFaultPoint,
) => void;

export interface ConversationPersistence extends PersistenceAdapter, CompactionModelInvocationLinkPersistence {
  createSession(head: SessionHead): Promise<ConversationWriteResult<SessionHead>>;
  loadSession(sessionId: string): Promise<SessionHead | undefined>;
  prepareMessage(
    intent: PreparedConversationMessage,
  ): Promise<ConversationWriteResult<PreparedConversationMessage>>;
  loadPreparedMessage(
    messageId: string,
  ): Promise<PreparedConversationMessage | undefined>;
  appendPreparedMessage(
    messageId: string,
    updatedAt: string,
  ): Promise<ConversationWriteResult<ConversationMessage>>;
  loadMessageById(messageId: string): Promise<ConversationMessage | undefined>;
  appendMessage(
    input: AppendConversationMessageInput,
  ): Promise<ConversationWriteResult<ConversationMessage>>;
  appendAssistantToolCallBatch(
    input: AppendAssistantToolCallBatchInput,
  ): Promise<ConversationWriteResult<ToolCallBatchCommit>>;
  loadToolCallBatch(batchId: string): Promise<ToolCallBatchRecord | undefined>;
  listToolCallDispositions(
    batchId: string,
  ): Promise<readonly ToolCallDispositionRecord[]>;
  listToolCallBatchEvidenceBySessionRange(
    sessionId: string,
    startSequence: number,
    endSequence: number,
  ): Promise<readonly Readonly<{
    batch: ToolCallBatchRecord;
    dispositions: readonly ToolCallDispositionRecord[];
  }>[] >;
  loadToolCallDisposition(
    batchId: string,
    toolCallId: string,
  ): Promise<ToolCallDispositionRecord | undefined>;
  listRecoverableToolCallBatches(): Promise<readonly ToolCallBatchRecord[]>;
  transitionToolCallDisposition(
    input: TransitionToolCallDispositionInput,
  ): Promise<ConversationWriteResult<ToolCallDispositionRecord>>;
  appendToolResultAndCompleteDisposition(
    input: AppendToolResultAndCompleteDispositionInput,
  ): Promise<ConversationWriteResult<ConversationMessage>>;
  loadMessageRange(
    sessionId: string,
    startSequence: number,
    endSequence: number,
  ): Promise<readonly ConversationMessage[]>;
  loadSessionEventsAfter(
    sessionId: string,
    sequence: number,
  ): Promise<readonly SessionEvent[]>;
  findSessionCommandReceipt(
    commandId: string,
  ): Promise<SessionCommandReceipt | undefined>;
  loadCompactionJob(compactionJobId: string): Promise<CompactionJob | undefined>;
  loadCompactionExecutionBinding(
    compactionJobId: string,
  ): Promise<ReadableCompactionExecutionBinding | undefined>;
  loadCompactionRecord(compactionId: string): Promise<CompactionRecord | undefined>;
  listPendingCompactionJobs(): Promise<readonly CompactionJob[]>;
  requestCompaction(
    input: RequestCompactionInput,
  ): Promise<ConversationWriteResult<CompactionJob>>;
  commitCompaction(
    input: CommitCompactionInput,
  ): Promise<ConversationWriteResult<CompactionRecord>>;
  terminateCompaction(
    input: TerminateCompactionInput,
  ): Promise<ConversationWriteResult<CompactionJob>>;
}

export type { CompactionModelInvocationLink };
