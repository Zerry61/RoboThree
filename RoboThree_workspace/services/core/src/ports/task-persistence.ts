import type {
  CommandReceipt,
  EffectAttempt,
  EffectAttemptStatus,
  OutboxRecord,
  RuntimeError,
  TaskCheckpoint,
  TaskEvent,
  TaskHead,
  TaskCapabilityLock,
  TaskAuthorizationSelection,
  TaskExecutionSelectionIdentity,
  TaskRuntimeSelection,
  TaskSubmitTurnBinding,
  PersistedUserConfirmation,
  UserConfirmationDecision,
  UserConfirmationRequest,
} from "@robothree/contracts";
import type { ReadableTaskRuntimeSelection } from
  "@robothree/contracts/runtime-selection/v1alpha2";

import type { PersistenceAdapter } from "./persistence.js";

export type PersistedTask = {
  head: TaskHead;
  checkpoint: TaskCheckpoint;
};

export type CreateTaskInput = PersistedTask;

export type SubmitTurnTaskBundle = {
  submitTurnCommandId: string;
  userMessageId: string;
  task: PersistedTask;
  capabilityLocks: readonly TaskCapabilityLock[];
  runtimeSelection: TaskRuntimeSelection;
  committedAt: string;
};

export type PersistedSubmitTurnTaskBundle = {
  binding: TaskSubmitTurnBinding;
  task: PersistedTask;
  capabilityLocks: readonly TaskCapabilityLock[];
  runtimeSelection: TaskRuntimeSelection;
};

export type ReasoningAwareSubmitTurnTaskBundle = Omit<
  SubmitTurnTaskBundle,
  "runtimeSelection"
> & Readonly<{
  runtimeSelection: Extract<ReadableTaskRuntimeSelection, { schemaVersion: "v1alpha2" }>;
}>;

export type PersistedReasoningAwareSubmitTurnTaskBundle = Omit<
  PersistedSubmitTurnTaskBundle,
  "runtimeSelection"
> & Readonly<{
  runtimeSelection: Extract<ReadableTaskRuntimeSelection, { schemaVersion: "v1alpha2" }>;
}>;

export type TaskAuthorizationPersistenceRecord = Readonly<{
  selection: TaskAuthorizationSelection;
  executionIdentity: TaskExecutionSelectionIdentity;
}>;

export type AuthorizationAwareSubmitTurnTaskBundle = SubmitTurnTaskBundle &
  TaskAuthorizationPersistenceRecord;

export type PersistedAuthorizationAwareSubmitTurnTaskBundle =
  PersistedSubmitTurnTaskBundle & TaskAuthorizationPersistenceRecord;

export type ReasoningAwareAuthorizationSubmitTurnTaskBundle =
  ReasoningAwareSubmitTurnTaskBundle & TaskAuthorizationPersistenceRecord;

export type PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle =
  PersistedReasoningAwareSubmitTurnTaskBundle & TaskAuthorizationPersistenceRecord;

export type PersistedExecutableSubmitTurnTaskBundle =
  | PersistedSubmitTurnTaskBundle
  | PersistedAuthorizationAwareSubmitTurnTaskBundle
  | PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle;

export type TaskAuthorizationMaterializationSnapshot = Readonly<{
  runtimeSelections: readonly TaskRuntimeSelection[];
  existingAuthorizationRecords: readonly TaskAuthorizationPersistenceRecord[];
  coverageDigest: string;
}>;

export type TaskAuthorizationMaterializationCommit = Readonly<{
  expectedCoverageDigest: string;
  records: readonly TaskAuthorizationPersistenceRecord[];
}>;

export type TaskAuthorizationMaterializationResult = Readonly<{
  existingCount: number;
  insertedCount: number;
  totalRuntimeSelectionCount: number;
  coverageDigest: string;
}>;

export type BoundedTaskCapabilityLockPage = Readonly<{
  locks: readonly TaskCapabilityLock[];
  truncated: boolean;
}>;

export type AcceptedCommandCommit = {
  expectedRevision: number;
  head: TaskHead;
  event: TaskEvent;
  additionalEvents?: readonly TaskEvent[];
  checkpoint: TaskCheckpoint;
  receipt: Extract<CommandReceipt, { outcome: "accepted" }>;
  outbox: readonly OutboxRecord[];
  effectTransition?: EffectStateTransition;
  confirmationTransition?: UserConfirmationTransition;
};

export type UserConfirmationTransition =
  | { type: "request"; request: UserConfirmationRequest }
  | { type: "decision"; request: UserConfirmationRequest; decision: UserConfirmationDecision };

export type EffectStateTransition = {
  expectedStatus: EffectAttemptStatus;
  attempt: EffectAttempt;
};

export type EffectOnlyCommit = {
  expectedEventSequence: number;
  expectedStatus?: EffectAttemptStatus;
  attempt: EffectAttempt;
  event: TaskEvent;
  outbox: readonly OutboxRecord[];
};

export type AuthorizationAuditCommit = {
  expectedEventSequence: number;
  event: TaskEvent;
  outbox: readonly OutboxRecord[];
};

export type RejectedCommandEventCommit = {
  expectedEventSequence: number;
  event: TaskEvent;
  outbox: readonly OutboxRecord[];
};

export type PersistenceWriteSuccess<T> = {
  ok: true;
  replayed: boolean;
  value: T;
};

export type PersistenceWriteFailure = {
  ok: false;
  error: RuntimeError;
};

export type PersistenceWriteResult<T> = PersistenceWriteSuccess<T> | PersistenceWriteFailure;

export type RecordOutboxAttemptInput = {
  outboxId: string;
  expectedAttemptCount: number;
  nextAttemptAt?: string;
  publishedAt?: string;
};

export interface TaskPersistence extends PersistenceAdapter {
  createTask(input: CreateTaskInput): Promise<PersistenceWriteResult<PersistedTask>>;
  commitSubmitTurnTaskBundle(
    input: SubmitTurnTaskBundle,
  ): Promise<PersistenceWriteResult<PersistedSubmitTurnTaskBundle>>;
  commitAuthorizationAwareSubmitTurnTaskBundle(
    input: AuthorizationAwareSubmitTurnTaskBundle,
  ): Promise<PersistenceWriteResult<PersistedAuthorizationAwareSubmitTurnTaskBundle>>;
  commitReasoningAwareSubmitTurnTaskBundle(
    input: ReasoningAwareAuthorizationSubmitTurnTaskBundle,
  ): Promise<PersistenceWriteResult<PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle>>;
  loadSubmitTurnTaskBundle(
    submitTurnCommandId: string,
  ): Promise<PersistedSubmitTurnTaskBundle | undefined>;
  loadAuthorizationAwareSubmitTurnTaskBundle(
    submitTurnCommandId: string,
  ): Promise<PersistedAuthorizationAwareSubmitTurnTaskBundle | undefined>;
  loadReasoningAwareSubmitTurnTaskBundle(
    submitTurnCommandId: string,
  ): Promise<PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle | undefined>;
  loadExecutableSubmitTurnTaskBundle(
    submitTurnCommandId: string,
  ): Promise<PersistedExecutableSubmitTurnTaskBundle | undefined>;
  loadTaskAuthorizationSelection(
    taskId: string,
  ): Promise<TaskAuthorizationSelection | undefined>;
  loadTaskExecutionSelectionIdentity(
    taskId: string,
  ): Promise<TaskExecutionSelectionIdentity | undefined>;
  loadTaskAuthorizationMaterializationSnapshot(): Promise<
    TaskAuthorizationMaterializationSnapshot
  >;
  commitTaskAuthorizationMaterialization(
    input: TaskAuthorizationMaterializationCommit,
  ): Promise<PersistenceWriteResult<TaskAuthorizationMaterializationResult>>;
  loadSubmitTurnBindingByTaskId(
    taskId: string,
  ): Promise<TaskSubmitTurnBinding | undefined>;
  loadTask(taskId: string): Promise<PersistedTask | undefined>;
  loadCheckpoint(checkpointId: string): Promise<TaskCheckpoint | undefined>;
  loadCheckpointAtRevision(taskId: string, stateRevision: number): Promise<TaskCheckpoint | undefined>;
  loadEventsAfter(taskId: string, sequence: number): Promise<readonly TaskEvent[]>;
  findCommandReceipt(commandId: string): Promise<CommandReceipt | undefined>;
  commitTaskCapabilityLock(lock: TaskCapabilityLock): Promise<PersistenceWriteResult<TaskCapabilityLock>>;
  loadTaskCapabilityLock(taskId: string, capabilityId: string): Promise<TaskCapabilityLock | undefined>;
  listTaskCapabilityLocks(taskId: string): Promise<readonly TaskCapabilityLock[]>;
  listNonTerminalTaskCapabilityLocksByCapabilityId(
    capabilityId: string,
    limit: number,
  ): Promise<BoundedTaskCapabilityLockPage>;
  commitTaskRuntimeSelection(
    selection: TaskRuntimeSelection,
  ): Promise<PersistenceWriteResult<TaskRuntimeSelection>>;
  loadTaskRuntimeSelection(taskId: string): Promise<TaskRuntimeSelection | undefined>;
  loadReadableTaskRuntimeSelection(
    taskId: string,
  ): Promise<ReadableTaskRuntimeSelection | undefined>;
  loadUserConfirmation(confirmationId: string): Promise<PersistedUserConfirmation | undefined>;
  findUserConfirmationByScopeDigest(scopeDigest: string): Promise<PersistedUserConfirmation | undefined>;
  findUserConfirmationByDecisionId(decisionId: string): Promise<PersistedUserConfirmation | undefined>;
  listUserConfirmationsByTask(taskId: string): Promise<readonly PersistedUserConfirmation[]>;
  listPendingUserConfirmations(limit: number): Promise<readonly PersistedUserConfirmation[]>;
  loadEffectAttempt(effectAttemptId: string): Promise<EffectAttempt | undefined>;
  findEffectAttemptByIdempotencyKey(idempotencyKey: string): Promise<EffectAttempt | undefined>;
  listRecoverableEffectAttempts(): Promise<readonly EffectAttempt[]>;
  listEffectAttemptsByTask(taskId: string): Promise<readonly EffectAttempt[]>;
  commitEffectTransition(input: EffectOnlyCommit): Promise<PersistenceWriteResult<EffectAttempt>>;
  commitAuthorizationAudit(input: AuthorizationAuditCommit): Promise<PersistenceWriteResult<TaskEvent>>;
  commitRejectedCommandEvent(input: RejectedCommandEventCommit): Promise<PersistenceWriteResult<TaskEvent>>;
  commitAcceptedCommand(input: AcceptedCommandCommit): Promise<PersistenceWriteResult<PersistedTask>>;
  commitRejectedCommand(
    receipt: Extract<CommandReceipt, { outcome: "rejected" }>,
  ): Promise<PersistenceWriteResult<CommandReceipt>>;
  listPendingOutbox(limit: number, dueAt?: string): Promise<readonly OutboxRecord[]>;
  recordOutboxAttempt(input: RecordOutboxAttemptInput): Promise<PersistenceWriteResult<OutboxRecord>>;
  listRecoveryCandidates(): Promise<readonly PersistedTask[]>;
  listTasks(): Promise<readonly PersistedTask[]>;
  listTasksBySession(sessionId: string): Promise<readonly PersistedTask[]>;
}
