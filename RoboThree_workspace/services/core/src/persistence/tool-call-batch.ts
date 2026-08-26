import {
  ConversationMessageSchema,
  EntityIdSchema,
  JsonValueSchema,
  Sha256DigestSchema,
  TimestampSchema,
  type AssistantToolCall,
} from "@robothree/contracts";
import { z } from "zod";

import type {
  AppendAssistantToolCallBatchInput,
  AppendToolResultAndCompleteDispositionInput,
  AssistantConversationMessage,
  ToolResultConversationMessage,
  ToolCallBatchCommit,
  TransitionToolCallDispositionInput,
} from "../ports/conversation-persistence.js";
import type { ConversationWriteFailure } from "../ports/conversation-persistence.js";
import { conversationFailure, validateMessageAppend } from "./conversation-validation.js";
import { sha256CanonicalJson } from "./digest.js";

export const TOOL_CALL_BATCH_SCHEMA_VERSION = "v1alpha1" as const;

export const ToolCallDispositionSchema = z.enum([
  "ready_to_dispatch",
  "waiting_user_confirmation",
  "blocked_by_prior_confirmation",
  "effect_linked",
  "result_committed",
  "cancelled_before_dispatch",
  "denied_before_dispatch",
]);

export const ToolCallBatchRecordSchema = z.object({
  schemaVersion: z.literal(TOOL_CALL_BATCH_SCHEMA_VERSION),
  batchId: EntityIdSchema,
  sessionId: EntityIdSchema,
  taskId: EntityIdSchema,
  runId: EntityIdSchema,
  assistantMessageId: EntityIdSchema,
  assistantMessageSequence: z.number().int().positive(),
  assistantMessageDigest: Sha256DigestSchema,
  batchDigest: Sha256DigestSchema,
  callCount: z.number().int().min(1).max(32),
  createdAt: TimestampSchema,
}).strict();

export const ToolCallDispositionRecordSchema = z.object({
  schemaVersion: z.literal(TOOL_CALL_BATCH_SCHEMA_VERSION),
  batchId: EntityIdSchema,
  toolCallId: EntityIdSchema,
  actionId: EntityIdSchema,
  ordinal: z.number().int().nonnegative().max(31),
  disposition: ToolCallDispositionSchema,
  revision: z.number().int().nonnegative(),
  confirmationId: EntityIdSchema.optional(),
  effectAttemptId: EntityIdSchema.optional(),
  resultMessageId: EntityIdSchema.optional(),
  resultDigest: Sha256DigestSchema.optional(),
  updatedAt: TimestampSchema,
}).strict().superRefine((record, context) => {
  if (
    record.disposition === "waiting_user_confirmation"
    && record.confirmationId === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "waiting_user_confirmation requires confirmationId",
      path: ["confirmationId"],
    });
  }
  if (
    record.disposition !== "waiting_user_confirmation"
    && record.confirmationId !== undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "confirmationId is only valid while waiting_user_confirmation",
      path: ["confirmationId"],
    });
  }
  if (
    (record.disposition === "effect_linked" || record.disposition === "result_committed")
    && record.effectAttemptId === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "Effect-linked and result-committed dispositions require effectAttemptId",
      path: ["effectAttemptId"],
    });
  }
  if (
    record.disposition !== "effect_linked"
    && record.disposition !== "result_committed"
    && record.effectAttemptId !== undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "effectAttemptId is only valid for an Effect-linked disposition",
      path: ["effectAttemptId"],
    });
  }
  const hasResultIdentity = record.resultMessageId !== undefined || record.resultDigest !== undefined;
  if (
    record.disposition === "result_committed"
    && (record.resultMessageId === undefined || record.resultDigest === undefined)
  ) {
    context.addIssue({
      code: "custom",
      message: "result_committed requires resultMessageId and resultDigest",
      path: ["resultMessageId"],
    });
  }
  if (record.disposition !== "result_committed" && hasResultIdentity) {
    context.addIssue({
      code: "custom",
      message: "result identity is only valid for result_committed",
      path: ["resultMessageId"],
    });
  }
});

export type ToolCallDisposition = z.infer<typeof ToolCallDispositionSchema>;
export type ToolCallBatchRecord = z.infer<typeof ToolCallBatchRecordSchema>;
export type ToolCallDispositionRecord = z.infer<typeof ToolCallDispositionRecordSchema>;

export function calculateToolCallBatchDigest(input: {
  sessionId: string;
  taskId: string;
  runId: string;
  assistantMessageId: string;
  assistantMessageSequence: number;
  assistantMessageDigest: string;
  toolCalls: readonly AssistantToolCall[];
}): string {
  return sha256CanonicalJson(JsonValueSchema.parse({
    schemaVersion: TOOL_CALL_BATCH_SCHEMA_VERSION,
    sessionId: input.sessionId,
    taskId: input.taskId,
    runId: input.runId,
    assistantMessageId: input.assistantMessageId,
    assistantMessageSequence: input.assistantMessageSequence,
    assistantMessageDigest: input.assistantMessageDigest,
    orderedCalls: input.toolCalls.map((call) => ({
      toolCallId: call.toolCallId,
      actionId: call.actionId,
    })),
  }));
}

export function validateAssistantToolCallBatchAppend(
  input: AppendAssistantToolCallBatchInput,
): AppendAssistantToolCallBatchInput | ConversationWriteFailure {
  const message = ConversationMessageSchema.safeParse(input.message);
  const batch = ToolCallBatchRecordSchema.safeParse(input.batch);
  const dispositions = input.dispositions.map((record) =>
    ToolCallDispositionRecordSchema.safeParse(record));
  if (!message.success || message.data.message.role !== "assistant") {
    return invalidBatch("assistant message", message.success
      ? "message role must be assistant"
      : message.error.issues[0]?.message);
  }
  if (!batch.success) {
    return invalidBatch("ToolCallBatchRecord", batch.error.issues[0]?.message);
  }
  const firstInvalidDisposition = dispositions.find((record) => !record.success);
  if (firstInvalidDisposition !== undefined && !firstInvalidDisposition.success) {
    return invalidBatch(
      "ToolCallDispositionRecord",
      firstInvalidDisposition.error.issues[0]?.message,
    );
  }
  if (!Number.isSafeInteger(input.expectedMessageSequence) || input.expectedMessageSequence < 0) {
    return invalidBatch("expectedMessageSequence", "must be a non-negative safe integer");
  }
  if (!TimestampSchema.safeParse(input.updatedAt).success) {
    return invalidBatch("updatedAt", "must be an RFC 3339 timestamp");
  }
  const validatedMessage = validateMessageAppend({
    expectedMessageSequence: input.expectedMessageSequence,
    message: message.data,
    updatedAt: input.updatedAt,
  });
  if ("ok" in validatedMessage) return validatedMessage;
  const parsedDispositions = dispositions.map((record) => {
    if (!record.success) throw new Error("unreachable invalid disposition");
    return record.data;
  });
  const assistant: AssistantConversationMessage = {
    envelope: message.data.envelope,
    message: message.data.message,
  };
  const calls = assistant.message.toolCalls;
  const expectedDigest = calculateToolCallBatchDigest({
    sessionId: assistant.envelope.sessionId,
    taskId: batch.data.taskId,
    runId: batch.data.runId,
    assistantMessageId: assistant.envelope.messageId,
    assistantMessageSequence: assistant.envelope.sequence,
    assistantMessageDigest: assistant.envelope.messageDigest,
    toolCalls: calls,
  });
  const identitiesMatch =
    calls.length > 0
    && assistant.envelope.taskId === batch.data.taskId
    && batch.data.sessionId === assistant.envelope.sessionId
    && batch.data.assistantMessageId === assistant.envelope.messageId
    && batch.data.assistantMessageSequence === assistant.envelope.sequence
    && batch.data.assistantMessageDigest === assistant.envelope.messageDigest
    && batch.data.callCount === calls.length
    && batch.data.batchDigest === expectedDigest
    && batch.data.createdAt === assistant.envelope.createdAt
    && parsedDispositions.length === calls.length
    && parsedDispositions.every((disposition, ordinal) => {
      const call = calls[ordinal];
      return call !== undefined
        && disposition.batchId === batch.data.batchId
        && disposition.toolCallId === call.toolCallId
        && disposition.actionId === call.actionId
        && disposition.ordinal === ordinal
        && disposition.disposition === "ready_to_dispatch"
        && disposition.revision === 0
        && disposition.updatedAt === batch.data.createdAt;
    });
  if (!identitiesMatch) {
    return conversationFailure(
      "persistence.tool_call_batch_integrity_violation",
      "assistant message, batch, dispositions, or canonical digest do not agree",
    );
  }
  return {
    expectedMessageSequence: input.expectedMessageSequence,
    message: assistant,
    batch: batch.data,
    dispositions: parsedDispositions,
    updatedAt: input.updatedAt,
  };
}

export function validateToolCallDispositionTransition(
  input: TransitionToolCallDispositionInput,
): TransitionToolCallDispositionInput | ConversationWriteFailure {
  const next = ToolCallDispositionRecordSchema.safeParse(input.next);
  if (!next.success) {
    return invalidBatch("ToolCallDispositionRecord", next.error.issues[0]?.message);
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    return invalidBatch("expectedRevision", "must be a non-negative safe integer");
  }
  if (
    input.batchId !== next.data.batchId
    || input.toolCallId !== next.data.toolCallId
    || next.data.revision !== input.expectedRevision + 1
  ) {
    return conversationFailure(
      "persistence.tool_call_disposition_integrity_violation",
      "transition identity or revision does not match its expected value",
    );
  }
  return { ...input, next: next.data };
}

export function validateToolResultCompletion(
  input: AppendToolResultAndCompleteDispositionInput,
): AppendToolResultAndCompleteDispositionInput | ConversationWriteFailure {
  const message = ConversationMessageSchema.safeParse(input.message);
  const completed = ToolCallDispositionRecordSchema.safeParse(input.completedDisposition);
  if (!message.success || message.data.message.role !== "tool") {
    return invalidBatch("Tool Result message", message.success
      ? "message role must be tool"
      : message.error.issues[0]?.message);
  }
  if (!completed.success || completed.data.disposition !== "result_committed") {
    return invalidBatch("completed disposition", completed.success
      ? "disposition must be result_committed"
      : completed.error.issues[0]?.message);
  }
  if (
    !Number.isSafeInteger(input.expectedMessageSequence)
    || input.expectedMessageSequence < 0
    || !Number.isSafeInteger(input.expectedDispositionRevision)
    || input.expectedDispositionRevision < 0
  ) {
    return invalidBatch("expected revision", "message and disposition revisions must be non-negative safe integers");
  }
  if (!TimestampSchema.safeParse(input.updatedAt).success) {
    return invalidBatch("updatedAt", "must be an RFC 3339 timestamp");
  }
  const validatedMessage = validateMessageAppend({
    expectedMessageSequence: input.expectedMessageSequence,
    message: message.data,
    updatedAt: input.updatedAt,
  });
  if ("ok" in validatedMessage) return validatedMessage;
  const tool: ToolResultConversationMessage = {
    envelope: message.data.envelope,
    message: message.data.message,
  };
  const matches =
    input.batchId === completed.data.batchId
    && input.toolCallId === completed.data.toolCallId
    && completed.data.actionId === tool.message.actionId
    && completed.data.resultMessageId === tool.envelope.messageId
    && completed.data.resultDigest === tool.message.resultDigest
    && completed.data.revision === input.expectedDispositionRevision + 1
    && tool.message.toolCallId === input.toolCallId;
  if (!matches) {
    return conversationFailure(
      "persistence.tool_result_completion_integrity_violation",
      "Tool Result message and completed disposition do not agree",
    );
  }
  return {
    expectedMessageSequence: input.expectedMessageSequence,
    expectedDispositionRevision: input.expectedDispositionRevision,
    batchId: input.batchId,
    toolCallId: input.toolCallId,
    message: tool,
    completedDisposition: completed.data,
    updatedAt: input.updatedAt,
  };
}

export function isAllowedToolCallDispositionTransition(
  current: ToolCallDispositionRecord,
  next: ToolCallDispositionRecord,
): boolean {
  if (
    current.batchId !== next.batchId
    || current.toolCallId !== next.toolCallId
    || current.actionId !== next.actionId
    || current.ordinal !== next.ordinal
    || next.revision !== current.revision + 1
    || Date.parse(next.updatedAt) < Date.parse(current.updatedAt)
  ) return false;
  const allowed: Readonly<Record<ToolCallDisposition, readonly ToolCallDisposition[]>> = {
    ready_to_dispatch: [
      "waiting_user_confirmation",
      "blocked_by_prior_confirmation",
      "effect_linked",
      "cancelled_before_dispatch",
      "denied_before_dispatch",
    ],
    waiting_user_confirmation: [
      "ready_to_dispatch",
      "cancelled_before_dispatch",
      "denied_before_dispatch",
    ],
    blocked_by_prior_confirmation: [
      "ready_to_dispatch",
      "cancelled_before_dispatch",
      "denied_before_dispatch",
    ],
    effect_linked: [],
    result_committed: [],
    cancelled_before_dispatch: [],
    denied_before_dispatch: [],
  };
  return allowed[current.disposition].includes(next.disposition);
}

export function haveSameToolCallDispositionIdentities(
  current: readonly ToolCallDispositionRecord[],
  initial: readonly ToolCallDispositionRecord[],
): boolean {
  return current.length === initial.length && current.every((record, ordinal) => {
    const expected = initial[ordinal];
    return expected !== undefined
      && record.batchId === expected.batchId
      && record.toolCallId === expected.toolCallId
      && record.actionId === expected.actionId
      && record.ordinal === expected.ordinal;
  });
}

export function isValidToolResultCompletionTransition(
  current: ToolCallDispositionRecord,
  completed: ToolCallDispositionRecord,
): boolean {
  return current.disposition === "effect_linked"
    && completed.disposition === "result_committed"
    && current.batchId === completed.batchId
    && current.toolCallId === completed.toolCallId
    && current.actionId === completed.actionId
    && current.ordinal === completed.ordinal
    && current.effectAttemptId === completed.effectAttemptId
    && completed.revision === current.revision + 1
    && Date.parse(completed.updatedAt) >= Date.parse(current.updatedAt);
}

export function cloneToolCallBatchCommit(value: ToolCallBatchCommit): ToolCallBatchCommit {
  const message = ConversationMessageSchema.parse(value.message);
  if (message.message.role !== "assistant") {
    throw new Error("Tool Call batch commit must contain an Assistant message");
  }
  return {
    message: { envelope: message.envelope, message: message.message },
    batch: ToolCallBatchRecordSchema.parse(value.batch),
    dispositions: value.dispositions.map((record) =>
      ToolCallDispositionRecordSchema.parse(record)),
  };
}

function invalidBatch(record: string, reason = "unknown validation failure"): ConversationWriteFailure {
  return conversationFailure("persistence.invalid_tool_call_batch_record", `invalid ${record}: ${reason}`);
}
