import {
  COMPACTION_SCHEMA_VERSION,
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
} from "@robothree/contracts";
import type {
  CompactionJob,
  CompactionRecord,
  ConversationMessage,
  SessionCommand,
  SessionCommandReceipt,
  SessionEvent,
  SessionHead,
} from "@robothree/contracts";

import {
  digestConversationRange,
  sha256CanonicalJson,
} from "../src/index.js";
import { createCompactionExecutionBinding } from "../src/index.js";
import type {
  CommitCompactionInput,
  RequestCompactionInput,
  SessionOutboxRecord,
  TerminateCompactionInput,
} from "../src/index.js";

export const conversationIds = {
  session: "019f7b00-0000-7000-8000-000000000001",
  message1: "019f7b00-0000-7000-8000-000000000002",
  message2: "019f7b00-0000-7000-8000-000000000003",
  message3: "019f7b00-0000-7000-8000-000000000004",
  requestCommand: "019f7b00-0000-7000-8000-000000000005",
  requestEvent: "019f7b00-0000-7000-8000-000000000006",
  requestOutbox: "019f7b00-0000-7000-8000-000000000007",
  job: "019f7b00-0000-7000-8000-000000000008",
  compaction: "019f7b00-0000-7000-8000-000000000009",
  commitCommand: "019f7b00-0000-7000-8000-000000000010",
  commitEvent: "019f7b00-0000-7000-8000-000000000011",
  commitOutbox: "019f7b00-0000-7000-8000-000000000012",
  staleCommand: "019f7b00-0000-7000-8000-000000000013",
  staleEvent: "019f7b00-0000-7000-8000-000000000014",
  staleOutbox: "019f7b00-0000-7000-8000-000000000015",
  secondJob: "019f7b00-0000-7000-8000-000000000016",
  secondCompaction: "019f7b00-0000-7000-8000-000000000017",
  competingCommitCommand: "019f7b00-0000-7000-8000-000000000018",
  competingCommitEvent: "019f7b00-0000-7000-8000-000000000019",
  competingCommitOutbox: "019f7b00-0000-7000-8000-000000000020",
  failCommand: "019f7b00-0000-7000-8000-000000000021",
  failEvent: "019f7b00-0000-7000-8000-000000000022",
  failOutbox: "019f7b00-0000-7000-8000-000000000023",
};

export const conversationAt = {
  created: "2026-07-23T08:00:00.000Z",
  message1: "2026-07-23T08:01:00.000Z",
  message2: "2026-07-23T08:02:00.000Z",
  requested: "2026-07-23T08:03:00.000Z",
  message3: "2026-07-23T08:04:00.000Z",
  committed: "2026-07-23T08:05:00.000Z",
  stale: "2026-07-23T08:06:00.000Z",
};

export function initialSessionHead(): SessionHead {
  return {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    sessionId: conversationIds.session,
    messageSequence: 0,
    sessionEventSequence: 0,
    contextRevision: 0,
    createdAt: conversationAt.created,
    updatedAt: conversationAt.created,
  };
}

export function conversationMessage(
  sequence: 1 | 2 | 3,
): ConversationMessage {
  const ids = {
    1: conversationIds.message1,
    2: conversationIds.message2,
    3: conversationIds.message3,
  } as const;
  const times = {
    1: conversationAt.message1,
    2: conversationAt.message2,
    3: conversationAt.message3,
  } as const;
  const message = sequence === 1
    ? {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user" as const,
      content: [{ type: "text" as const, text: `fixture-message-${sequence}` }],
    }
    : {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "assistant" as const,
      content: [{ type: "text" as const, text: `fixture-message-${sequence}` }],
      toolCalls: [],
    };
  return {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: ids[sequence],
      sessionId: conversationIds.session,
      sequence,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      createdAt: times[sequence],
    },
    message,
  };
}

export function requestCompactionInput(overrides: {
  commandId?: string;
  jobId?: string;
  compactionId?: string;
  issuedAt?: string;
  eventId?: string;
  outboxId?: string;
  eventSequence?: number;
  sourceMessages?: readonly ConversationMessage[];
  sourceEndSequence?: number;
} = {}): RequestCompactionInput {
  const sourceMessages = overrides.sourceMessages ?? [
    conversationMessage(1),
    conversationMessage(2),
  ];
  const commandId = overrides.commandId ?? conversationIds.requestCommand;
  const jobId = overrides.jobId ?? conversationIds.job;
  const compactionId = overrides.compactionId ?? conversationIds.compaction;
  const issuedAt = overrides.issuedAt ?? conversationAt.requested;
  const eventId = overrides.eventId ?? conversationIds.requestEvent;
  const sourceDigest = digestConversationRange(sourceMessages);
  const command: Extract<SessionCommand, { type: "request_compaction" }> = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    commandId,
    sessionId: conversationIds.session,
    issuedAt,
    type: "request_compaction",
    compactionSchemaVersion: COMPACTION_SCHEMA_VERSION,
    compactionJobId: jobId,
    compactionId,
    sourceStartSequence: sourceMessages[0]!.envelope.sequence,
    sourceEndSequence: overrides.sourceEndSequence ?? sourceMessages.at(-1)!.envelope.sequence,
    sourceDigest,
    baseContextRevision: 0,
  };
  const job: Extract<CompactionJob, { status: "pending" }> = {
    schemaVersion: COMPACTION_SCHEMA_VERSION,
    compactionJobId: jobId,
    compactionId,
    sessionId: conversationIds.session,
    requestCommandId: commandId,
    sourceStartSequence: command.sourceStartSequence,
    sourceEndSequence: command.sourceEndSequence,
    sourceDigest,
    baseContextRevision: 0,
    status: "pending",
    createdAt: issuedAt,
    updatedAt: issuedAt,
  };
  const event: Extract<SessionEvent, { type: "context.compaction_requested" }> = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    eventId,
    sessionId: conversationIds.session,
    sequence: overrides.eventSequence ?? 1,
    occurredAt: issuedAt,
    causationId: commandId,
    correlationId: conversationIds.session,
    type: "context.compaction_requested",
    payload: {
      compactionJobId: jobId,
      compactionId,
      sourceStartSequence: command.sourceStartSequence,
      sourceEndSequence: command.sourceEndSequence,
      sourceDigest,
      baseContextRevision: 0,
    },
  };
  const receipt: Extract<SessionCommandReceipt, { outcome: "accepted" }> = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    commandId,
    sessionId: conversationIds.session,
    commandType: "request_compaction",
    commandDigest: sha256CanonicalJson(JsonValueSchema.parse(command)),
    receivedAt: issuedAt,
    outcome: "accepted",
    contextRevision: 0,
    sessionEventId: eventId,
    compactionJobId: jobId,
  };
  return {
    command,
    job,
    executionBinding: createCompactionExecutionBinding({
      schemaVersion: "v1alpha1",
      compactionJobId: jobId,
      sessionId: conversationIds.session,
      taskId: "019f7b00-0000-7000-8000-000000000060",
      runtimeSelectionId: "019f7b00-0000-7000-8000-000000000061",
      runtimeSelectionDigest: `sha256:${"1".repeat(64)}`,
      modelLockId: "019f7b00-0000-7000-8000-000000000062",
      modelCapabilityId: "model.fixture",
      modelLockDigest: `sha256:${"2".repeat(64)}`,
      registryRevision: `sha256:${"3".repeat(64)}`,
      adapterDescriptorId: "adapter.model.fixture",
      adapterDescriptorRevision: `sha256:${"4".repeat(64)}`,
      externalTargetDigest: `sha256:${"5".repeat(64)}`,
      summarizerPromptRevision: `sha256:${"6".repeat(64)}`,
      createdAt: issuedAt,
    }),
    event,
    receipt,
    outbox: [sessionOutbox(
      overrides.outboxId ?? conversationIds.requestOutbox,
      eventId,
      issuedAt,
    )],
  };
}

export function commitCompactionInput(): CommitCompactionInput {
  const request = requestCompactionInput();
  const record: CompactionRecord = {
    schemaVersion: COMPACTION_SCHEMA_VERSION,
    compactionId: conversationIds.compaction,
    compactionJobId: conversationIds.job,
    sessionId: conversationIds.session,
    sourceStartSequence: 1,
    sourceEndSequence: 2,
    sourceDigest: request.command.sourceDigest,
    baseContextRevision: 0,
    summary: "The user requested fixture work and the assistant acknowledged it.",
    summarySchemaVersion: "v1alpha1",
    summarizerModelRef: "model.fixture-summarizer",
    summarizerPromptRevision: sha256CanonicalJson(JsonValueSchema.parse({ prompt: "fixture-v1" })),
    estimatedTokensBefore: 120,
    estimatedTokensAfter: 30,
    createdAt: conversationAt.committed,
  };
  const command: Extract<SessionCommand, { type: "commit_compaction" }> = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    commandId: conversationIds.commitCommand,
    sessionId: conversationIds.session,
    issuedAt: conversationAt.committed,
    type: "commit_compaction",
    compactionJobId: conversationIds.job,
    compactionId: conversationIds.compaction,
    record,
  };
  const event: Extract<SessionEvent, { type: "context.compaction_committed" }> = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    eventId: conversationIds.commitEvent,
    sessionId: conversationIds.session,
    sequence: 2,
    occurredAt: conversationAt.committed,
    causationId: conversationIds.commitCommand,
    correlationId: conversationIds.session,
    type: "context.compaction_committed",
    payload: {
      compactionJobId: conversationIds.job,
      compactionId: conversationIds.compaction,
      previousContextRevision: 0,
      contextRevision: 1,
      sourceEndSequence: 2,
    },
  };
  const receipt: Extract<SessionCommandReceipt, { outcome: "accepted" }> = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    commandId: conversationIds.commitCommand,
    sessionId: conversationIds.session,
    commandType: "commit_compaction",
    commandDigest: sha256CanonicalJson(JsonValueSchema.parse(command)),
    receivedAt: conversationAt.committed,
    outcome: "accepted",
    contextRevision: 1,
    sessionEventId: conversationIds.commitEvent,
    compactionJobId: conversationIds.job,
    compactionId: conversationIds.compaction,
  };
  return {
    command,
    event,
    receipt,
    outbox: [sessionOutbox(
      conversationIds.commitOutbox,
      conversationIds.commitEvent,
      conversationAt.committed,
    )],
  };
}

export function staleCompactionInput(): TerminateCompactionInput {
  const request = requestCompactionInput();
  const command: Extract<SessionCommand, { type: "mark_compaction_stale" }> = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    commandId: conversationIds.staleCommand,
    sessionId: conversationIds.session,
    issuedAt: conversationAt.stale,
    type: "mark_compaction_stale",
    compactionJobId: conversationIds.job,
    observedContextRevision: 1,
    observedActiveCompactionId: conversationIds.compaction,
  };
  const job: Extract<CompactionJob, { status: "stale" }> = {
    ...request.job,
    status: "stale",
    terminalCommandId: conversationIds.staleCommand,
    observedContextRevision: 1,
    observedActiveCompactionId: conversationIds.compaction,
    staleAt: conversationAt.stale,
    updatedAt: conversationAt.stale,
  };
  const event: Extract<SessionEvent, { type: "context.compaction_stale" }> = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    eventId: conversationIds.staleEvent,
    sessionId: conversationIds.session,
    sequence: 2,
    occurredAt: conversationAt.stale,
    causationId: conversationIds.staleCommand,
    correlationId: conversationIds.session,
    type: "context.compaction_stale",
    payload: {
      compactionJobId: conversationIds.job,
      observedContextRevision: 1,
      observedActiveCompactionId: conversationIds.compaction,
    },
  };
  const receipt: Extract<SessionCommandReceipt, { outcome: "accepted" }> = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    commandId: conversationIds.staleCommand,
    sessionId: conversationIds.session,
    commandType: "mark_compaction_stale",
    commandDigest: sha256CanonicalJson(JsonValueSchema.parse(command)),
    receivedAt: conversationAt.stale,
    outcome: "accepted",
    contextRevision: 0,
    sessionEventId: conversationIds.staleEvent,
    compactionJobId: conversationIds.job,
  };
  return {
    command,
    job,
    event,
    receipt,
    outbox: [sessionOutbox(
      conversationIds.staleOutbox,
      conversationIds.staleEvent,
      conversationAt.stale,
    )],
  };
}

export function competingCommitCompactionInput(): CommitCompactionInput {
  const input = structuredClone(commitCompactionInput());
  input.command.commandId = conversationIds.competingCommitCommand;
  input.command.record.summary = "A different valid summary result lost the commit race.";
  input.event.eventId = conversationIds.competingCommitEvent;
  input.event.causationId = conversationIds.competingCommitCommand;
  input.receipt.commandId = conversationIds.competingCommitCommand;
  input.receipt.commandDigest = sha256CanonicalJson(JsonValueSchema.parse(input.command));
  input.receipt.sessionEventId = conversationIds.competingCommitEvent;
  input.outbox = [sessionOutbox(
    conversationIds.competingCommitOutbox,
    conversationIds.competingCommitEvent,
    conversationAt.committed,
  )];
  return input;
}

export function failedCompactionInput(): TerminateCompactionInput {
  const request = requestCompactionInput();
  const command: Extract<SessionCommand, { type: "fail_compaction" }> = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    commandId: conversationIds.failCommand,
    sessionId: conversationIds.session,
    issuedAt: conversationAt.stale,
    type: "fail_compaction",
    compactionJobId: conversationIds.job,
    failureReason: "summary_generation_failed",
  };
  const job: Extract<CompactionJob, { status: "failed" }> = {
    ...request.job,
    status: "failed",
    terminalCommandId: conversationIds.failCommand,
    failureReason: "summary_generation_failed",
    failedAt: conversationAt.stale,
    updatedAt: conversationAt.stale,
  };
  const event: Extract<SessionEvent, { type: "context.compaction_failed" }> = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    eventId: conversationIds.failEvent,
    sessionId: conversationIds.session,
    sequence: 2,
    occurredAt: conversationAt.stale,
    causationId: conversationIds.failCommand,
    correlationId: conversationIds.session,
    type: "context.compaction_failed",
    payload: {
      compactionJobId: conversationIds.job,
      failureReason: "summary_generation_failed",
    },
  };
  const receipt: Extract<SessionCommandReceipt, { outcome: "accepted" }> = {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    commandId: conversationIds.failCommand,
    sessionId: conversationIds.session,
    commandType: "fail_compaction",
    commandDigest: sha256CanonicalJson(JsonValueSchema.parse(command)),
    receivedAt: conversationAt.stale,
    outcome: "accepted",
    contextRevision: 0,
    sessionEventId: conversationIds.failEvent,
    compactionJobId: conversationIds.job,
  };
  return {
    command,
    job,
    event,
    receipt,
    outbox: [sessionOutbox(
      conversationIds.failOutbox,
      conversationIds.failEvent,
      conversationAt.stale,
    )],
  };
}

function sessionOutbox(
  outboxId: string,
  eventId: string,
  createdAt: string,
): SessionOutboxRecord {
  return {
    outboxId,
    eventId,
    sessionId: conversationIds.session,
    destination: "session.events",
    payload: { eventId },
    attemptCount: 0,
    createdAt,
  };
}
