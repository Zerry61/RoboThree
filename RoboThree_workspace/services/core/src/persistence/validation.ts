import {
  CommandReceiptSchema,
  EffectAttemptSchema,
  JsonValueSchema,
  OutboxRecordSchema,
  TaskCheckpointSchema,
  TaskEventSchema,
  TaskHeadSchema,
  TaskCapabilityLockSchema,
  UserConfirmationDecisionSchema,
  UserConfirmationRequestSchema,
} from "@robothree/contracts";
import type {
  EffectAttempt,
  EffectAttemptStatus,
  RejectedCommandReceipt,
  RuntimeError,
  TaskHead,
  TaskCapabilityLock,
} from "@robothree/contracts";

import type {
  AcceptedCommandCommit,
  AuthorizationAuditCommit,
  CreateTaskInput,
  EffectOnlyCommit,
  PersistedTask,
  PersistenceWriteFailure,
  RejectedCommandEventCommit,
} from "../ports/task-persistence.js";
import { sha256CanonicalJson } from "./digest.js";
import { validateTaskCapabilityLockRevisions } from "../registry/capability-revision.js";

export function validateTaskCapabilityLock(
  input: TaskCapabilityLock,
): TaskCapabilityLock | PersistenceWriteFailure {
  const parsed = TaskCapabilityLockSchema.safeParse(input);
  if (!parsed.success) {
    return invalidRecord("task capability lock", parsed.error.issues[0]?.message);
  }
  try {
    return validateTaskCapabilityLockRevisions(parsed.data);
  } catch (error) {
    return invalidRecord(
      "task capability lock",
      error instanceof Error ? error.message : "revision validation failed",
    );
  }
}

export function validateTaskCreation(input: CreateTaskInput): PersistedTask | PersistenceWriteFailure {
  const parsedHead = TaskHeadSchema.safeParse(input.head);
  if (!parsedHead.success) {
    return invalidRecord("task head", parsedHead.error.issues[0]?.message);
  }
  const parsedCheckpoint = TaskCheckpointSchema.safeParse(input.checkpoint);
  if (!parsedCheckpoint.success) {
    return invalidRecord("task checkpoint", parsedCheckpoint.error.issues[0]?.message);
  }
  const head = parsedHead.data;
  const checkpoint = parsedCheckpoint.data;
  const error = firstIntegrityError([
    [head.stateRevision === 0, "initial task head revision must be zero"],
    [head.lastEventSequence === 0, "initial task event sequence must be zero"],
    [checkpoint.stateRevision === 0, "initial checkpoint revision must be zero"],
    [checkpoint.lastEventSequence === 0, "initial checkpoint event sequence must be zero"],
    [head.taskId === checkpoint.taskId, "task head and checkpoint taskId must match"],
    [head.latestCheckpointId === checkpoint.checkpointId, "task head must reference initial checkpoint"],
    [head.status === checkpoint.state.status, "task head status must match checkpoint state"],
    [checkpoint.stateDigest === sha256CanonicalJson(JsonValueSchema.parse(checkpoint.state)),
      "checkpoint state digest must match canonical state"],
  ]);
  return error === undefined ? { head, checkpoint } : failure("persistence.integrity_violation", error);
}

export function validateAcceptedCommit(input: AcceptedCommandCommit): AcceptedCommandCommit | PersistenceWriteFailure {
  const parsedHead = TaskHeadSchema.safeParse(input.head);
  if (!parsedHead.success) {
    return invalidRecord("task head", parsedHead.error.issues[0]?.message);
  }
  const parsedEvent = TaskEventSchema.safeParse(input.event);
  if (!parsedEvent.success) {
    return invalidRecord("task event", parsedEvent.error.issues[0]?.message);
  }
  const parsedCheckpoint = TaskCheckpointSchema.safeParse(input.checkpoint);
  if (!parsedCheckpoint.success) {
    return invalidRecord("task checkpoint", parsedCheckpoint.error.issues[0]?.message);
  }
  const parsedReceipt = CommandReceiptSchema.safeParse(input.receipt);
  if (!parsedReceipt.success) {
    return invalidRecord("command receipt", parsedReceipt.error.issues[0]?.message);
  }
  const head = parsedHead.data;
  const event = parsedEvent.data;
  const additionalEvents = [];
  for (const candidate of input.additionalEvents ?? []) {
    const parsed = TaskEventSchema.safeParse(candidate);
    if (!parsed.success) {
      return invalidRecord("additional task event", parsed.error.issues[0]?.message);
    }
    additionalEvents.push(parsed.data);
  }
  const events = [event, ...additionalEvents];
  const checkpoint = parsedCheckpoint.data;
  const receipt = parsedReceipt.data;
  if (receipt.outcome !== "accepted") {
    return failure("persistence.integrity_violation", "accepted commit requires accepted receipt");
  }
  const outbox = [];
  for (const record of input.outbox) {
    const parsedRecord = OutboxRecordSchema.safeParse(record);
    if (!parsedRecord.success) {
      return invalidRecord("outbox record", parsedRecord.error.issues[0]?.message);
    }
    outbox.push(parsedRecord.data);
  }
  let effectTransition = input.effectTransition;
  if (effectTransition !== undefined) {
    const parsedAttempt = EffectAttemptSchema.safeParse(effectTransition.attempt);
    if (!parsedAttempt.success) {
      return invalidRecord("effect attempt", parsedAttempt.error.issues[0]?.message);
    }
    effectTransition = { expectedStatus: effectTransition.expectedStatus, attempt: parsedAttempt.data };
  }
  let confirmationTransition = input.confirmationTransition;
  if (confirmationTransition !== undefined) {
    const parsedRequest = UserConfirmationRequestSchema.safeParse(confirmationTransition.request);
    if (!parsedRequest.success) {
      return invalidRecord("user confirmation request", parsedRequest.error.issues[0]?.message);
    }
    if (confirmationTransition.type === "decision") {
      const parsedDecision = UserConfirmationDecisionSchema.safeParse(confirmationTransition.decision);
      if (!parsedDecision.success) {
        return invalidRecord("user confirmation decision", parsedDecision.error.issues[0]?.message);
      }
      if (parsedDecision.data.confirmationId !== parsedRequest.data.confirmationId
        || parsedDecision.data.scopeDigest !== parsedRequest.data.scopeDigest) {
        return failure("persistence.integrity_violation", "confirmation decision must reference the exact request");
      }
      confirmationTransition = {
        type: "decision",
        request: parsedRequest.data,
        decision: parsedDecision.data,
      };
    } else {
      confirmationTransition = { type: "request", request: parsedRequest.data };
    }
  }
  const nextRevision = input.expectedRevision + 1;
  const lastEvent = events.at(-1)!;
  const error = firstIntegrityError([
    [head.taskId === event.taskId && head.taskId === checkpoint.taskId && head.taskId === receipt.taskId,
      "accepted commit records must target one task"],
    [head.stateRevision === nextRevision, "task head revision must increment exactly once"],
    [checkpoint.stateRevision === nextRevision, "checkpoint revision must match next revision"],
    [receipt.stateRevision === nextRevision, "receipt revision must match next revision"],
    [head.latestCheckpointId === checkpoint.checkpointId, "task head must reference committed checkpoint"],
    [receipt.checkpointId === checkpoint.checkpointId, "receipt must reference committed checkpoint"],
    [receipt.eventId === event.eventId, "receipt must reference committed event"],
    [event.causationId === receipt.commandId, "event causationId must reference command"],
    [events.every((candidate, index) => candidate.sequence === event.sequence + index),
      "accepted commit event sequences must be contiguous"],
    [events.every((candidate) => candidate.taskId === head.taskId),
      "accepted commit events must target one task"],
    [head.lastEventSequence === lastEvent.sequence && checkpoint.lastEventSequence === lastEvent.sequence,
      "head, final event, and checkpoint sequence must agree"],
    [head.status === checkpoint.state.status, "task head status must match checkpoint state"],
    [checkpoint.parentCheckpointId !== undefined, "accepted command checkpoint requires parent"],
    [checkpoint.stateDigest === sha256CanonicalJson(JsonValueSchema.parse(checkpoint.state)),
      "checkpoint state digest must match canonical state"],
    [outbox.every((record) => record.taskId === head.taskId && events.some((candidate) => candidate.eventId === record.eventId)),
      "outbox must reference a committed task event"],
    [effectTransition === undefined || effectTransition.attempt.taskId === head.taskId,
      "effect transition must target the committed task"],
    [effectTransition === undefined || additionalEvents.some(
      (candidate) => candidate.causationId === effectTransition?.attempt.effectAttemptId,
    ), "effect transition requires a causally linked additional event"],
    [confirmationTransition === undefined || additionalEvents.some(
      (candidate) => candidate.causationId === (confirmationTransition?.type === "decision"
        ? confirmationTransition.decision.decisionId
        : confirmationTransition?.request.confirmationId),
    ), "confirmation transition requires a causally linked additional event"],
  ]);
  return error === undefined
    ? {
      expectedRevision: input.expectedRevision,
      head,
      event,
      ...(additionalEvents.length === 0 ? {} : { additionalEvents }),
      checkpoint,
      receipt,
      outbox,
      ...(effectTransition === undefined ? {} : { effectTransition }),
      ...(confirmationTransition === undefined ? {} : { confirmationTransition }),
    }
    : failure("persistence.integrity_violation", error);
}

export function validateEffectOnlyCommit(
  input: EffectOnlyCommit,
): EffectOnlyCommit | PersistenceWriteFailure {
  const parsedAttempt = EffectAttemptSchema.safeParse(input.attempt);
  if (!parsedAttempt.success) {
    return invalidRecord("effect attempt", parsedAttempt.error.issues[0]?.message);
  }
  const parsedEvent = TaskEventSchema.safeParse(input.event);
  if (!parsedEvent.success) {
    return invalidRecord("effect event", parsedEvent.error.issues[0]?.message);
  }
  const outbox = [];
  for (const record of input.outbox) {
    const parsed = OutboxRecordSchema.safeParse(record);
    if (!parsed.success) {
      return invalidRecord("effect outbox record", parsed.error.issues[0]?.message);
    }
    outbox.push(parsed.data);
  }
  const attempt = parsedAttempt.data;
  const event = parsedEvent.data;
  const expectedEventType = effectEventType(attempt.status);
  const error = firstIntegrityError([
    [attempt.status === "prepared" || attempt.status === "dispatched",
      "effect-only commit supports only prepared or dispatched status"],
    [input.expectedStatus !== undefined || attempt.status === "prepared",
      "new effect attempt must start prepared"],
    [attempt.taskId === event.taskId, "effect attempt and event taskId must match"],
    [event.sequence === input.expectedEventSequence + 1, "effect event sequence must increment exactly once"],
    [event.causationId === attempt.effectAttemptId, "effect event causationId must reference attempt"],
    [event.type === expectedEventType, "effect event type must match attempt status"],
    [outbox.every((record) => record.taskId === attempt.taskId && record.eventId === event.eventId),
      "effect outbox must reference committed event"],
  ]);
  return error === undefined
    ? {
      expectedEventSequence: input.expectedEventSequence,
      ...(input.expectedStatus === undefined ? {} : { expectedStatus: input.expectedStatus }),
      attempt,
      event,
      outbox,
    }
    : failure("persistence.integrity_violation", error);
}

export function validateAuthorizationAudit(
  input: AuthorizationAuditCommit,
): AuthorizationAuditCommit | PersistenceWriteFailure {
  const parsedEvent = TaskEventSchema.safeParse(input.event);
  if (!parsedEvent.success) {
    return invalidRecord("authorization audit event", parsedEvent.error.issues[0]?.message);
  }
  if (parsedEvent.data.type !== "authorization.allowed" && parsedEvent.data.type !== "authorization.denied") {
    return failure("persistence.integrity_violation", "authorization audit only accepts allowed or denied events");
  }
  const outbox = [];
  for (const record of input.outbox) {
    const parsed = OutboxRecordSchema.safeParse(record);
    if (!parsed.success) {
      return invalidRecord("authorization audit outbox", parsed.error.issues[0]?.message);
    }
    outbox.push(parsed.data);
  }
  const error = firstIntegrityError([
    [parsedEvent.data.sequence === input.expectedEventSequence + 1,
      "authorization event sequence must increment exactly once"],
    [outbox.every((record) => record.taskId === parsedEvent.data.taskId && record.eventId === parsedEvent.data.eventId),
      "authorization outbox must reference the committed event"],
  ]);
  return error === undefined
    ? { expectedEventSequence: input.expectedEventSequence, event: parsedEvent.data, outbox }
    : failure("persistence.integrity_violation", error);
}

export function validateRejectedCommandEvent(
  input: RejectedCommandEventCommit,
): RejectedCommandEventCommit | PersistenceWriteFailure {
  const parsedEvent = TaskEventSchema.safeParse(input.event);
  if (!parsedEvent.success) {
    return invalidRecord(
      "rejected command event",
      parsedEvent.error.issues[0]?.message,
    );
  }
  if (parsedEvent.data.type !== "runtime.command_rejected") {
    return failure(
      "persistence.integrity_violation",
      "rejected command event only accepts runtime.command_rejected",
    );
  }
  const outbox = [];
  for (const record of input.outbox) {
    const parsed = OutboxRecordSchema.safeParse(record);
    if (!parsed.success) {
      return invalidRecord(
        "rejected command event outbox",
        parsed.error.issues[0]?.message,
      );
    }
    outbox.push(parsed.data);
  }
  const error = firstIntegrityError([
    [
      parsedEvent.data.sequence === input.expectedEventSequence + 1,
      "rejected command event sequence must increment exactly once",
    ],
    [
      outbox.every((record) =>
        record.taskId === parsedEvent.data.taskId
        && record.eventId === parsedEvent.data.eventId),
      "rejected command outbox must reference the committed event",
    ],
  ]);
  return error === undefined
    ? {
      expectedEventSequence: input.expectedEventSequence,
      event: parsedEvent.data,
      outbox,
    }
    : failure("persistence.integrity_violation", error);
}

export function validateEffectTransition(
  current: EffectAttempt,
  expectedStatus: EffectAttemptStatus,
  next: EffectAttempt,
): PersistenceWriteFailure | undefined {
  if (current.status !== expectedStatus) {
    return failure("persistence.effect_status_conflict", "effect status does not match expected status", {
      actualStatus: current.status,
      expectedStatus,
    });
  }
  if (!isAllowedEffectTransition(current.status, next.status)) {
    return failure("persistence.invalid_effect_transition", `cannot transition effect from ${current.status} to ${next.status}`);
  }
  const immutableMatches = current.effectAttemptId === next.effectAttemptId
    && current.taskId === next.taskId
    && current.runId === next.runId
    && current.stepId === next.stepId
    && current.actionId === next.actionId
    && current.idempotencyKey === next.idempotencyKey
    && current.executorCapability === next.executorCapability
    && current.recoveryMode === next.recoveryMode
    && current.requestRef === next.requestRef
    && current.createdAt === next.createdAt;
  if (!immutableMatches) {
    return failure("persistence.integrity_violation", "effect attempt identity fields cannot change");
  }
  if (Date.parse(next.updatedAt) < Date.parse(current.updatedAt)) {
    return failure("persistence.integrity_violation", "effect attempt time cannot move backwards");
  }
  return undefined;
}

export function validateRejectedReceipt(
  input: RejectedCommandReceipt,
): RejectedCommandReceipt | PersistenceWriteFailure {
  const parsed = CommandReceiptSchema.safeParse(input);
  if (!parsed.success) {
    return invalidRecord("rejected command receipt", parsed.error.issues[0]?.message);
  }
  if (parsed.data.outcome !== "rejected") {
    return failure("persistence.integrity_violation", "rejected commit requires rejected receipt");
  }
  return parsed.data;
}

export function validateCommitAgainstCurrent(
  current: TaskHead,
  input: AcceptedCommandCommit,
): PersistenceWriteFailure | undefined {
  if (current.stateRevision !== input.expectedRevision) {
    return failure("persistence.revision_conflict", "task revision does not match expected revision", {
      actualRevision: current.stateRevision,
      expectedRevision: input.expectedRevision,
    });
  }
  if (input.event.sequence !== current.lastEventSequence + 1) {
    return failure("persistence.sequence_conflict", "task event sequence must increment exactly once");
  }
  if (input.checkpoint.parentCheckpointId !== current.latestCheckpointId) {
    return failure("persistence.checkpoint_parent_conflict", "checkpoint parent must be current checkpoint");
  }
  if (input.head.initializationDigest !== current.initializationDigest) {
    return failure("persistence.integrity_violation", "task initialization digest cannot change");
  }
  return undefined;
}

function effectEventType(status: EffectAttemptStatus): "runtime.effect_intent_recorded"
  | "runtime.effect_dispatched"
  | "runtime.effect_result_recorded"
  | "runtime.effect_uncertain" {
  switch (status) {
    case "prepared":
      return "runtime.effect_intent_recorded";
    case "dispatched":
      return "runtime.effect_dispatched";
    case "uncertain":
      return "runtime.effect_uncertain";
    case "succeeded":
    case "failed":
    case "cancelled":
      return "runtime.effect_result_recorded";
  }
}

function isAllowedEffectTransition(current: EffectAttemptStatus, next: EffectAttemptStatus): boolean {
  if (current === "prepared") {
    return next === "dispatched" || next === "cancelled";
  }
  if (current === "dispatched") {
    return next === "succeeded" || next === "failed" || next === "cancelled" || next === "uncertain";
  }
  return false;
}

export function persistenceError(code: string, message: string, details?: Record<string, unknown>): RuntimeError {
  return {
    code,
    category: "persistence",
    message,
    retryable: code === "persistence.revision_conflict",
    ...(details === undefined ? {} : { details }),
  };
}

export function failure(code: string, message: string, details?: Record<string, unknown>): PersistenceWriteFailure {
  return { ok: false, error: persistenceError(code, message, details) };
}

function firstIntegrityError(checks: readonly (readonly [boolean, string])[]): string | undefined {
  return checks.find(([valid]) => !valid)?.[1];
}

function invalidRecord(recordName: string, reason?: string): PersistenceWriteFailure {
  return failure(
    "persistence.invalid_record",
    `invalid ${recordName}${reason === undefined ? "" : `: ${reason}`}`,
  );
}
