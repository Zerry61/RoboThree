import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import * as publicContracts from "../src/index.js";
import {
  COMPACTION_SCHEMA_VERSION,
  CONTEXT_SCHEMA_VERSION,
  CONVERSATION_SCHEMA_VERSION,
  MODEL_PROTOCOL_VERSION,
  CompactionJobSchema,
  CompactionRecordSchema,
  CompactionSchemaVersionSchema,
  ContextSchemaVersionSchema,
  ConversationMessageEnvelopeSchema,
  ConversationSchemaVersionSchema,
  ModelProtocolVersionSchema,
  SessionCommandReceiptSchema,
  SessionCommandSchema,
  SessionEventSchema,
  SessionHeadSchema,
  canonicalSessionCommandStringify,
} from "../src/index.js";

const entityId = (value: number) =>
  `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const digest = (value: string) => `sha256:${value.repeat(64)}`;
const createdAt = "2026-07-23T08:00:00.000Z";
const updatedAt = "2026-07-23T08:01:00.000Z";

const ids = {
  session: entityId(1),
  task: entityId(2),
  message: entityId(3),
  requestCommand: entityId(4),
  commitCommand: entityId(5),
  event: entityId(6),
  job: entityId(7),
  compaction: entityId(8),
};

function compactionRecord() {
  return {
    schemaVersion: COMPACTION_SCHEMA_VERSION,
    compactionId: ids.compaction,
    compactionJobId: ids.job,
    sessionId: ids.session,
    sourceStartSequence: 1,
    sourceEndSequence: 20,
    sourceDigest: digest("a"),
    baseContextRevision: 0,
    summary: "User requested a bounded, provider-neutral Session context.",
    summarySchemaVersion: "v1alpha1",
    summarizerModelRef: "model.fake-summary",
    summarizerPromptRevision: digest("b"),
    estimatedTokensBefore: 4_000,
    estimatedTokensAfter: 800,
    createdAt: updatedAt,
  } as const;
}

function requestCommand() {
  return {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    commandId: ids.requestCommand,
    sessionId: ids.session,
    issuedAt: createdAt,
    type: "request_compaction",
    compactionSchemaVersion: COMPACTION_SCHEMA_VERSION,
    compactionJobId: ids.job,
    compactionId: ids.compaction,
    sourceStartSequence: 1,
    sourceEndSequence: 20,
    sourceDigest: digest("a"),
    baseContextRevision: 0,
  } as const;
}

function commitCommand() {
  return {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    commandId: ids.commitCommand,
    sessionId: ids.session,
    issuedAt: updatedAt,
    type: "commit_compaction",
    compactionJobId: ids.job,
    compactionId: ids.compaction,
    record: compactionRecord(),
  } as const;
}

describe("KAF-5.0a domain versions", () => {
  it("starts each new domain at an independently named v1alpha1 boundary", () => {
    expect(CONVERSATION_SCHEMA_VERSION).toBe("v1alpha1");
    expect(CONTEXT_SCHEMA_VERSION).toBe("v1alpha1");
    expect(COMPACTION_SCHEMA_VERSION).toBe("v1alpha1");
    expect(MODEL_PROTOCOL_VERSION).toBe("v1alpha1");

    expect(ConversationSchemaVersionSchema.parse("v1alpha1")).toBe("v1alpha1");
    expect(ContextSchemaVersionSchema.parse("v1alpha1")).toBe("v1alpha1");
    expect(CompactionSchemaVersionSchema.parse("v1alpha1")).toBe("v1alpha1");
    expect(ModelProtocolVersionSchema.parse("v1alpha1")).toBe("v1alpha1");
  });

  it.each([
    ConversationSchemaVersionSchema,
    ContextSchemaVersionSchema,
    CompactionSchemaVersionSchema,
    ModelProtocolVersionSchema,
  ])("fails closed for legacy-global, current-global, and unknown versions", (schema) => {
    expect(schema.safeParse("v1alpha2").success).toBe(false);
    expect(schema.safeParse("v9").success).toBe(false);
    expect(schema.safeParse(undefined).success).toBe(false);
  });
});

describe("KAF-5.0a Session and Compaction contracts", () => {
  it("accepts the strict minimum persistence spine records", () => {
    expect(ConversationMessageEnvelopeSchema.parse({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: ids.message,
      sessionId: ids.session,
      sequence: 1,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: digest("c"),
      taskId: ids.task,
      createdAt,
    })).toBeDefined();

    expect(SessionHeadSchema.parse({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      sessionId: ids.session,
      messageSequence: 1,
      sessionEventSequence: 0,
      contextRevision: 0,
      createdAt,
      updatedAt,
    })).toBeDefined();

    expect(SessionCommandSchema.parse(requestCommand())).toBeDefined();
    expect(SessionCommandSchema.parse(commitCommand())).toBeDefined();
    expect(CompactionRecordSchema.parse(compactionRecord())).toBeDefined();

    expect(CompactionJobSchema.parse({
      schemaVersion: COMPACTION_SCHEMA_VERSION,
      compactionJobId: ids.job,
      compactionId: ids.compaction,
      sessionId: ids.session,
      requestCommandId: ids.requestCommand,
      sourceStartSequence: 1,
      sourceEndSequence: 20,
      sourceDigest: digest("a"),
      baseContextRevision: 0,
      status: "pending",
      createdAt,
      updatedAt: createdAt,
    })).toBeDefined();

    expect(SessionEventSchema.parse({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      eventId: ids.event,
      sessionId: ids.session,
      sequence: 1,
      occurredAt: createdAt,
      causationId: ids.requestCommand,
      correlationId: ids.session,
      type: "context.compaction_requested",
      payload: {
        compactionJobId: ids.job,
        compactionId: ids.compaction,
        sourceStartSequence: 1,
        sourceEndSequence: 20,
        sourceDigest: digest("a"),
        baseContextRevision: 0,
      },
    })).toBeDefined();

    expect(SessionCommandReceiptSchema.parse({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      commandId: ids.requestCommand,
      sessionId: ids.session,
      commandType: "request_compaction",
      commandDigest: digest("d"),
      receivedAt: createdAt,
      outcome: "accepted",
      contextRevision: 0,
      sessionEventId: ids.event,
      compactionJobId: ids.job,
    })).toBeDefined();
  });

  it("rejects undeclared Secret, body, Runtime Handle, PID, and Provider fields", () => {
    const forbiddenFields = [
      { token: "qa-secret" },
      { credential: "credential-ref" },
      { body: "raw prompt body" },
      { runtimeHandle: { close: true } },
      { pid: 123 },
      { providerSdkObject: {} },
    ];

    for (const forbidden of forbiddenFields) {
      expect(SessionCommandSchema.safeParse({ ...requestCommand(), ...forbidden }).success).toBe(false);
      expect(CompactionRecordSchema.safeParse({ ...compactionRecord(), ...forbidden }).success).toBe(false);
    }

    expect(SessionEventSchema.safeParse({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      eventId: ids.event,
      sessionId: ids.session,
      sequence: 1,
      occurredAt: createdAt,
      causationId: ids.requestCommand,
      correlationId: ids.session,
      type: "context.compaction_failed",
      payload: {
        compactionJobId: ids.job,
        failureReason: "summary_invalid",
        token: "qa-secret",
      },
    }).success).toBe(false);
    expect(ConversationMessageEnvelopeSchema.safeParse({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: ids.message,
      sessionId: ids.session,
      sequence: 1,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: digest("c"),
      createdAt,
      token: "qa-secret",
    }).success).toBe(false);
    expect(SessionHeadSchema.safeParse({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      sessionId: ids.session,
      messageSequence: 0,
      sessionEventSequence: 0,
      contextRevision: 0,
      createdAt,
      updatedAt,
      pid: 123,
    }).success).toBe(false);
    expect(CompactionJobSchema.safeParse({
      schemaVersion: COMPACTION_SCHEMA_VERSION,
      compactionJobId: ids.job,
      compactionId: ids.compaction,
      sessionId: ids.session,
      requestCommandId: ids.requestCommand,
      sourceStartSequence: 1,
      sourceEndSequence: 20,
      sourceDigest: digest("a"),
      baseContextRevision: 0,
      status: "pending",
      createdAt,
      updatedAt: createdAt,
      runtimeHandle: {},
    }).success).toBe(false);
    expect(SessionCommandReceiptSchema.safeParse({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      commandId: ids.requestCommand,
      sessionId: ids.session,
      commandType: "request_compaction",
      commandDigest: digest("d"),
      receivedAt: createdAt,
      outcome: "rejected",
      contextRevision: 0,
      reasonCode: "invalid_command",
      retryable: false,
      providerSdkObject: {},
    }).success).toBe(false);
  });

  it("rejects non-JSON and structurally invalid values", () => {
    expect(CompactionRecordSchema.safeParse({
      ...compactionRecord(),
      summary: () => "not data",
    }).success).toBe(false);
    expect(SessionCommandSchema.safeParse({
      ...requestCommand(),
      sourceStartSequence: 21,
      sourceEndSequence: 20,
    }).success).toBe(false);
    expect(CompactionRecordSchema.safeParse({
      ...compactionRecord(),
      estimatedTokensAfter: 4_000,
    }).success).toBe(false);
    expect(SessionHeadSchema.safeParse({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      sessionId: ids.session,
      messageSequence: 0,
      sessionEventSequence: 0,
      contextRevision: 0,
      activeCompactionId: ids.compaction,
      createdAt,
      updatedAt,
    }).success).toBe(false);
    expect(SessionCommandSchema.safeParse({
      ...requestCommand(),
      type: "unknown_compaction_command",
    }).success).toBe(false);
    const { sourceDigest: _sourceDigest, ...incompleteRequest } = requestCommand();
    expect(SessionCommandSchema.safeParse(incompleteRequest).success).toBe(false);
    expect(SessionCommandSchema.safeParse({
      ...requestCommand(),
      schemaVersion: "v1alpha2",
    }).success).toBe(false);
    expect(CompactionRecordSchema.safeParse({
      ...compactionRecord(),
      schemaVersion: "v1alpha2",
    }).success).toBe(false);
    expect(ConversationMessageEnvelopeSchema.safeParse({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: ids.message,
      sessionId: ids.session,
      sequence: 1,
      messageSchemaVersion: "v1alpha2",
      messageDigest: digest("c"),
      createdAt,
    }).success).toBe(false);
  });

  it("enforces cross-record references and revision increments", () => {
    expect(SessionCommandSchema.safeParse({
      ...commitCommand(),
      record: { ...compactionRecord(), sessionId: entityId(99) },
    }).success).toBe(false);
    expect(SessionCommandSchema.safeParse({
      ...commitCommand(),
      record: { ...compactionRecord(), compactionJobId: entityId(98) },
    }).success).toBe(false);

    const committedEvent = {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      eventId: ids.event,
      sessionId: ids.session,
      sequence: 2,
      occurredAt: updatedAt,
      causationId: ids.commitCommand,
      correlationId: ids.session,
      type: "context.compaction_committed",
      payload: {
        compactionJobId: ids.job,
        compactionId: ids.compaction,
        previousContextRevision: 0,
        contextRevision: 1,
        sourceEndSequence: 20,
      },
    } as const;
    expect(SessionEventSchema.parse(committedEvent)).toBeDefined();
    expect(SessionEventSchema.safeParse({
      ...committedEvent,
      payload: { ...committedEvent.payload, contextRevision: 2 },
    }).success).toBe(false);

    expect(SessionCommandReceiptSchema.safeParse({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      commandId: ids.commitCommand,
      sessionId: ids.session,
      commandType: "commit_compaction",
      commandDigest: digest("d"),
      receivedAt: updatedAt,
      outcome: "accepted",
      contextRevision: 1,
      sessionEventId: ids.event,
      compactionJobId: ids.job,
    }).success).toBe(false);
  });

  it("canonicalizes Session Commands deterministically for Core hashing", () => {
    const command = requestCommand();
    const reordered = {
      sourceDigest: command.sourceDigest,
      sourceEndSequence: command.sourceEndSequence,
      sourceStartSequence: command.sourceStartSequence,
      baseContextRevision: command.baseContextRevision,
      compactionId: command.compactionId,
      compactionJobId: command.compactionJobId,
      compactionSchemaVersion: command.compactionSchemaVersion,
      type: command.type,
      issuedAt: command.issuedAt,
      sessionId: command.sessionId,
      commandId: command.commandId,
      schemaVersion: command.schemaVersion,
    } as const;

    const canonical = canonicalSessionCommandStringify(command);
    expect(canonicalSessionCommandStringify(reordered)).toBe(canonical);
    expect(canonicalSessionCommandStringify(command)).toBe(canonical);
    expect(canonicalSessionCommandStringify(JSON.parse(JSON.stringify(command)) as typeof command))
      .toBe(canonical);
    expect(createHash("sha256").update(canonical).digest("hex"))
      .toBe(createHash("sha256").update(canonicalSessionCommandStringify(reordered)).digest("hex"));
  });

  it("does not export the Core-internal SelectedSkillContext type", () => {
    expect("SelectedSkillContext" in publicContracts).toBe(false);
    expect("SelectedSkillContextSchema" in publicContracts).toBe(false);
  });
});
