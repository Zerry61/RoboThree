import {
  CompactionJobSchema,
  ConversationMessageSchema,
  JsonValueSchema,
  SessionCommandReceiptSchema,
  SessionCommandSchema,
  SessionEventSchema,
  SessionHeadSchema,
} from "@robothree/contracts";
import type {
  ConversationMessage,
  RuntimeError,
  SessionHead,
} from "@robothree/contracts";

import type {
  AppendConversationMessageInput,
  CommitCompactionInput,
  ConversationWriteFailure,
  RequestCompactionInput,
  SessionOutboxRecord,
  TerminateCompactionInput,
} from "../ports/conversation-persistence.js";
import { ReadableCompactionExecutionBindingSchema } from "./compaction-execution-binding.js";
import { sha256CanonicalJson } from "./digest.js";

export function conversationFailure(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ConversationWriteFailure {
  const error: RuntimeError = {
    code,
    category: "persistence",
    message,
    retryable: false,
    ...(details === undefined ? {} : { details }),
  };
  return { ok: false, error };
}

export function validateSessionCreation(
  input: SessionHead,
): SessionHead | ConversationWriteFailure {
  const parsed = SessionHeadSchema.safeParse(input);
  if (!parsed.success) return invalid("session head", parsed.error.issues[0]?.message);
  const head = parsed.data;
  if (
    head.messageSequence !== 0
    || head.sessionEventSequence !== 0
    || head.contextRevision !== 0
    || head.activeCompactionId !== undefined
  ) {
    return conversationFailure(
      "persistence.invalid_initial_session",
      "initial SessionHead must start with zero sequences and no active compaction",
    );
  }
  return head;
}

export function validateMessageAppend(
  input: AppendConversationMessageInput,
): AppendConversationMessageInput | ConversationWriteFailure {
  const parsed = ConversationMessageSchema.safeParse(input.message);
  if (!parsed.success) return invalid("conversation message", parsed.error.issues[0]?.message);
  if (!Number.isSafeInteger(input.expectedMessageSequence) || input.expectedMessageSequence < 0) {
    return invalid("expectedMessageSequence", "must be a non-negative safe integer");
  }
  if (Number.isNaN(Date.parse(input.updatedAt))) {
    return invalid("updatedAt", "must be an RFC 3339 timestamp");
  }
  const digest = sha256CanonicalJson(JsonValueSchema.parse(parsed.data.message));
  if (digest !== parsed.data.envelope.messageDigest) {
    return conversationFailure(
      "persistence.message_digest_mismatch",
      "messageDigest must match canonical provider-neutral message content",
    );
  }
  return { ...input, message: parsed.data };
}

export function validateRequestCompaction(
  input: RequestCompactionInput,
): RequestCompactionInput | ConversationWriteFailure {
  const command = SessionCommandSchema.safeParse(input.command);
  const job = CompactionJobSchema.safeParse(input.job);
  const event = SessionEventSchema.safeParse(input.event);
  const receipt = SessionCommandReceiptSchema.safeParse(input.receipt);
  const binding = ReadableCompactionExecutionBindingSchema.safeParse(input.executionBinding);
  if (!command.success || command.data.type !== "request_compaction") {
    return invalid("request compaction command", command.success ? "wrong command type" : command.error.issues[0]?.message);
  }
  if (!job.success || job.data.status !== "pending") {
    return invalid("pending compaction job", job.success ? "wrong job status" : job.error.issues[0]?.message);
  }
  if (!event.success || event.data.type !== "context.compaction_requested") {
    return invalid("compaction requested event", event.success ? "wrong event type" : event.error.issues[0]?.message);
  }
  if (!receipt.success || receipt.data.outcome !== "accepted") {
    return invalid("accepted session receipt", receipt.success ? "wrong receipt outcome" : receipt.error.issues[0]?.message);
  }
  if (!binding.success) {
    return invalid("compaction execution binding", binding.error.issues[0]?.message);
  }
  const outbox = validateSessionOutbox(input.outbox, event.data);
  if ("ok" in outbox) return outbox;
  const digest = sha256CanonicalJson(JsonValueSchema.parse(command.data));
  const allMatch =
    job.data.sessionId === command.data.sessionId
    && job.data.compactionJobId === command.data.compactionJobId
    && job.data.compactionId === command.data.compactionId
    && job.data.requestCommandId === command.data.commandId
    && job.data.sourceStartSequence === command.data.sourceStartSequence
    && job.data.sourceEndSequence === command.data.sourceEndSequence
    && job.data.sourceDigest === command.data.sourceDigest
    && job.data.baseActiveCompactionId === command.data.baseActiveCompactionId
    && job.data.baseContextRevision === command.data.baseContextRevision
    && event.data.sessionId === command.data.sessionId
    && event.data.causationId === command.data.commandId
    && event.data.payload.compactionJobId === command.data.compactionJobId
    && event.data.payload.compactionId === command.data.compactionId
    && event.data.payload.sourceStartSequence === command.data.sourceStartSequence
    && event.data.payload.sourceEndSequence === command.data.sourceEndSequence
    && event.data.payload.sourceDigest === command.data.sourceDigest
    && event.data.payload.baseActiveCompactionId === command.data.baseActiveCompactionId
    && event.data.payload.baseContextRevision === command.data.baseContextRevision
    && receipt.data.commandId === command.data.commandId
    && receipt.data.sessionId === command.data.sessionId
    && receipt.data.commandType === command.data.type
    && receipt.data.commandDigest === digest
    && receipt.data.compactionJobId === command.data.compactionJobId;
  const bindingMatches = binding.data.compactionJobId === command.data.compactionJobId
    && binding.data.sessionId === command.data.sessionId
    && binding.data.createdAt === job.data.createdAt;
  return allMatch
    && bindingMatches
    ? {
      command: command.data,
      job: job.data,
      executionBinding: binding.data,
      event: event.data,
      receipt: receipt.data,
      outbox,
    }
    : conversationFailure("persistence.integrity_violation", "request compaction records do not agree");
}

export function validateCommitCompaction(
  input: CommitCompactionInput,
): CommitCompactionInput | ConversationWriteFailure {
  const command = SessionCommandSchema.safeParse(input.command);
  const event = SessionEventSchema.safeParse(input.event);
  const receipt = SessionCommandReceiptSchema.safeParse(input.receipt);
  if (!command.success || command.data.type !== "commit_compaction") {
    return invalid("commit compaction command", command.success ? "wrong command type" : command.error.issues[0]?.message);
  }
  if (!event.success || event.data.type !== "context.compaction_committed") {
    return invalid("compaction committed event", event.success ? "wrong event type" : event.error.issues[0]?.message);
  }
  if (!receipt.success || receipt.data.outcome !== "accepted") {
    return invalid("accepted session receipt", receipt.success ? "wrong receipt outcome" : receipt.error.issues[0]?.message);
  }
  const outbox = validateSessionOutbox(input.outbox, event.data);
  if ("ok" in outbox) return outbox;
  const summaryInvocationCommit = input.summaryInvocationCommit;
  if (summaryInvocationCommit !== undefined) {
    const valid =
      typeof summaryInvocationCommit.compactionJobId === "string"
      && typeof summaryInvocationCommit.clientRequestId === "string"
      && typeof summaryInvocationCommit.expectedRecordDigest === "string"
      && /^sha256:[a-f0-9]{64}$/u.test(summaryInvocationCommit.expectedRecordDigest)
      && !Number.isNaN(Date.parse(summaryInvocationCommit.summaryCommittedAt));
    if (!valid || summaryInvocationCommit.compactionJobId !== command.data.compactionJobId) {
      return invalid("summary invocation commit", "identity or timestamp is invalid");
    }
  }
  const digest = sha256CanonicalJson(JsonValueSchema.parse(command.data));
  const record = command.data.record;
  const allMatch =
    event.data.sessionId === command.data.sessionId
    && event.data.causationId === command.data.commandId
    && event.data.payload.compactionJobId === command.data.compactionJobId
    && event.data.payload.compactionId === command.data.compactionId
    && event.data.payload.previousContextRevision === record.baseContextRevision
    && event.data.payload.contextRevision === record.baseContextRevision + 1
    && event.data.payload.sourceEndSequence === record.sourceEndSequence
    && receipt.data.commandId === command.data.commandId
    && receipt.data.sessionId === command.data.sessionId
    && receipt.data.commandType === command.data.type
    && receipt.data.commandDigest === digest
    && receipt.data.compactionJobId === command.data.compactionJobId
    && receipt.data.compactionId === command.data.compactionId
    && receipt.data.contextRevision === record.baseContextRevision + 1;
  return allMatch
    ? {
      command: command.data,
      event: event.data,
      receipt: receipt.data,
      outbox,
      ...(summaryInvocationCommit === undefined ? {} : { summaryInvocationCommit }),
    }
    : conversationFailure("persistence.integrity_violation", "commit compaction records do not agree");
}

export function validateTerminateCompaction(
  input: TerminateCompactionInput,
): TerminateCompactionInput | ConversationWriteFailure {
  const command = SessionCommandSchema.safeParse(input.command);
  const job = CompactionJobSchema.safeParse(input.job);
  const event = SessionEventSchema.safeParse(input.event);
  const receipt = SessionCommandReceiptSchema.safeParse(input.receipt);
  if (
    !command.success
    || (command.data.type !== "fail_compaction" && command.data.type !== "mark_compaction_stale")
  ) return invalid("terminal compaction command", command.success ? "wrong command type" : command.error.issues[0]?.message);
  if (!job.success || (job.data.status !== "failed" && job.data.status !== "stale")) {
    return invalid("terminal compaction job", job.success ? "wrong job status" : job.error.issues[0]?.message);
  }
  if (
    !event.success
    || (event.data.type !== "context.compaction_failed" && event.data.type !== "context.compaction_stale")
  ) return invalid("terminal compaction event", event.success ? "wrong event type" : event.error.issues[0]?.message);
  if (!receipt.success || receipt.data.outcome !== "accepted") {
    return invalid("accepted session receipt", receipt.success ? "wrong receipt outcome" : receipt.error.issues[0]?.message);
  }
  const outbox = validateSessionOutbox(input.outbox, event.data);
  if ("ok" in outbox) return outbox;
  const digest = sha256CanonicalJson(JsonValueSchema.parse(command.data));
  const allMatch =
    job.data.compactionJobId === command.data.compactionJobId
    && job.data.sessionId === command.data.sessionId
    && event.data.sessionId === command.data.sessionId
    && event.data.causationId === command.data.commandId
    && event.data.payload.compactionJobId === command.data.compactionJobId
    && receipt.data.commandId === command.data.commandId
    && receipt.data.sessionId === command.data.sessionId
    && receipt.data.commandType === command.data.type
    && receipt.data.commandDigest === digest
    && receipt.data.compactionJobId === command.data.compactionJobId
    && ((command.data.type === "fail_compaction"
      && job.data.status === "failed"
      && event.data.type === "context.compaction_failed"
      && job.data.terminalCommandId === command.data.commandId
      && job.data.failureReason === command.data.failureReason
      && event.data.payload.failureReason === command.data.failureReason)
    || (command.data.type === "mark_compaction_stale"
      && job.data.status === "stale"
      && event.data.type === "context.compaction_stale"
      && job.data.terminalCommandId === command.data.commandId
      && job.data.observedContextRevision === command.data.observedContextRevision
      && job.data.observedActiveCompactionId === command.data.observedActiveCompactionId
      && event.data.payload.observedContextRevision === command.data.observedContextRevision
      && event.data.payload.observedActiveCompactionId === command.data.observedActiveCompactionId));
  return allMatch
    ? { command: command.data, job: job.data, event: event.data, receipt: receipt.data, outbox }
    : conversationFailure("persistence.integrity_violation", "terminal compaction records do not agree");
}

export function digestConversationRange(
  messages: readonly ConversationMessage[],
): string {
  return sha256CanonicalJson(JsonValueSchema.parse(messages.map((message) => message.envelope)));
}

function validateSessionOutbox(
  records: readonly SessionOutboxRecord[],
  event: { eventId: string; sessionId: string },
): readonly SessionOutboxRecord[] | ConversationWriteFailure {
  const ids = new Set<string>();
  const destinations = new Set<string>();
  for (const record of records) {
    const valid =
      typeof record.outboxId === "string"
      && typeof record.eventId === "string"
      && typeof record.sessionId === "string"
      && typeof record.destination === "string"
      && record.destination.length > 0
      && record.eventId === event.eventId
      && record.sessionId === event.sessionId
      && record.attemptCount === 0
      && Number.isFinite(Date.parse(record.createdAt))
      && record.nextAttemptAt === undefined
      && record.publishedAt === undefined
      && JsonValueSchema.safeParse(record.payload).success;
    if (!valid || ids.has(record.outboxId) || destinations.has(record.destination)) {
      return invalid("session outbox", "invalid or duplicate session outbox record");
    }
    ids.add(record.outboxId);
    destinations.add(record.destination);
  }
  return records.map((record) => ({ ...record, payload: { ...record.payload } }));
}

function invalid(record: string, reason = "unknown validation failure"): ConversationWriteFailure {
  return conversationFailure("persistence.invalid_record", `invalid ${record}: ${reason}`);
}
