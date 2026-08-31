import {
  CommandReceiptSchema,
  EffectAttemptSchema,
  OutboxRecordSchema,
  TaskEventSchema,
  TaskHeadSchema,
  TaskCapabilityLockSchema,
  TaskSubmitTurnBindingSchema,
  TaskRuntimeSelectionSchema,
  TaskAuthorizationSelectionSchema,
  TaskExecutionSelectionIdentitySchema,
  PersistedUserConfirmationSchema,
  JsonValueSchema,
} from "@robothree/contracts";
import type {
  CommandReceipt,
  ComponentHealth,
  EffectAttempt,
  OutboxRecord,
  TaskCheckpoint,
  TaskEvent,
  TaskHead,
  TaskCapabilityLock,
  TaskSubmitTurnBinding,
  TaskRuntimeSelection,
  PersistedUserConfirmation,
} from "@robothree/contracts";
import type { ReadableTaskRuntimeSelectionV1Alpha4 } from
  "@robothree/contracts/runtime-selection/v1alpha4";

import type { Clock } from "../../ports/clock.js";
import type {
  AcceptedCommandCommit,
  AuthorizationAuditCommit,
  CreateTaskInput,
  EffectOnlyCommit,
  PersistedTask,
  PersistenceWriteResult,
  PersistedSubmitTurnTaskBundle,
  AuthorizationAwareSubmitTurnTaskBundle,
  BoundedTaskCapabilityLockPage,
  PersistedAuthorizationAwareSubmitTurnTaskBundle,
  PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle,
  PersistedReasoningAwareSubmitTurnTaskBundle,
  PersistedR2D3SubmitTurnTaskBundle,
  R2D3SubmitTurnTaskBundle,
  Dfi541SubmitTurnTaskBundle,
  PersistedDfi541SubmitTurnTaskBundle,
  ReasoningAwareAuthorizationSubmitTurnTaskBundle,
  TaskAuthorizationMaterializationCommit,
  TaskAuthorizationMaterializationResult,
  TaskAuthorizationMaterializationSnapshot,
  TaskAuthorizationPersistenceRecord,
  RejectedCommandEventCommit,
  RecordOutboxAttemptInput,
  TaskPersistence,
  SubmitTurnTaskBundle,
} from "../../ports/task-persistence.js";
import {
  failure,
  validateAcceptedCommit,
  validateAuthorizationAudit,
  validateCommitAgainstCurrent,
  validateEffectOnlyCommit,
  validateEffectTransition,
  validateRejectedCommandEvent,
  validateRejectedReceipt,
  validateTaskCreation,
  validateTaskCapabilityLock,
} from "../../persistence/validation.js";
import { parseReadableTaskRuntimeSelectionV1Alpha4 } from
  "../../application/runtime-selection-revisions.js";
import { sha256CanonicalJson } from "../../persistence/digest.js";
import { parsePersistedTaskCheckpoint, parsePersistedTaskEvent } from "../../persistence/contract-upgrade.js";
import { validateSubmitTurnTaskBundle } from "../../persistence/submit-turn-bundle-validation.js";
import { validateR2D3SubmitTurnTaskBundle } from
  "../../persistence/r2d3-task-bundle-validation.js";
import { validateDfi541SubmitTurnTaskBundle } from
  "../../persistence/dfi541-task-bundle-validation.js";
import {
  validateR2D3TaskBundleBindingEnvelopeV1,
  type PersistedR2D3TaskBundleBindingEnvelopeV1,
} from "../../application/r2d3-durable-acceptance.js";
import {
  validateDfi541TaskBundleEnvelopeV1,
  type PersistedDfi541TaskBundleEnvelopeV1,
} from "../../application/dfi541-durable-acceptance.js";
import {
  parseTaskAuthorizationPersistenceRecord,
  sameTaskAuthorizationPersistenceRecord,
  taskAuthorizationCoverageDigest,
  validateAuthorizationAwareSubmitTurnTaskBundle,
  validateReasoningAwareAuthorizationSubmitTurnTaskBundle,
  validateTaskAuthorizationRecordAgainstRuntimeSelection,
} from "../../persistence/task-authorization-selection-record.js";

type ReadableAuthorizationAwareSubmitTurnTaskBundle =
  | AuthorizationAwareSubmitTurnTaskBundle
  | ReasoningAwareAuthorizationSubmitTurnTaskBundle;
type ReadablePersistedSubmitTurnTaskBundle =
  | PersistedSubmitTurnTaskBundle
  | PersistedReasoningAwareSubmitTurnTaskBundle;
type ReadablePersistedAuthorizationAwareSubmitTurnTaskBundle =
  | PersistedAuthorizationAwareSubmitTurnTaskBundle
  | PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle;

type InMemoryTaskBundleState = {
  heads: Map<string, TaskHead>;
  checkpoints: Map<string, TaskCheckpoint>;
  capabilityLocks: Map<string, TaskCapabilityLock>;
  runtimeSelections: Map<string, ReadableTaskRuntimeSelectionV1Alpha4>;
  submitTurnBindings: Map<string, TaskSubmitTurnBinding>;
  authorizationRecords: Map<string, TaskAuthorizationPersistenceRecord>;
  authorizationRuntimeSelectionIds: Map<string, string>;
  capabilityLockIds: Map<string, string>;
  r2d3BindingEnvelopes: Map<string, PersistedR2D3TaskBundleBindingEnvelopeV1>;
  dfi541BindingEnvelopes: Map<string, PersistedDfi541TaskBundleEnvelopeV1>;
};

export class InMemoryTaskPersistence implements TaskPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.memory";
  readonly #clock: Clock;
  #bundleState = createBundleState();
  get #heads(): Map<string, TaskHead> { return this.#bundleState.heads; }
  get #checkpoints(): Map<string, TaskCheckpoint> {
    return this.#bundleState.checkpoints;
  }
  readonly #events = new Map<string, Map<number, TaskEvent>>();
  readonly #eventIds = new Set<string>();
  readonly #receipts = new Map<string, CommandReceipt>();
  get #capabilityLocks(): Map<string, TaskCapabilityLock> {
    return this.#bundleState.capabilityLocks;
  }
  get #runtimeSelections(): Map<string, ReadableTaskRuntimeSelectionV1Alpha4> {
    return this.#bundleState.runtimeSelections;
  }
  get #submitTurnBindings(): Map<string, TaskSubmitTurnBinding> {
    return this.#bundleState.submitTurnBindings;
  }
  get #authorizationRecords(): Map<string, TaskAuthorizationPersistenceRecord> {
    return this.#bundleState.authorizationRecords;
  }
  get #authorizationRuntimeSelectionIds(): Map<string, string> {
    return this.#bundleState.authorizationRuntimeSelectionIds;
  }
  get #capabilityLockIds(): Map<string, string> {
    return this.#bundleState.capabilityLockIds;
  }
  readonly #confirmations = new Map<string, PersistedUserConfirmation>();
  readonly #confirmationScopeIds = new Map<string, string>();
  readonly #effects = new Map<string, EffectAttempt>();
  readonly #effectIdempotencyKeys = new Map<string, string>();
  readonly #outbox = new Map<string, OutboxRecord>();
  readonly #outboxDestinations = new Set<string>();
  #started = false;

  constructor(clock: Clock) {
    this.#clock = clock;
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

  async createTask(input: CreateTaskInput): Promise<PersistenceWriteResult<PersistedTask>> {
    this.#requireStarted();
    const validated = validateTaskCreation(input);
    if ("ok" in validated) {
      return validated;
    }
    const existing = this.#heads.get(validated.head.taskId);
    if (existing !== undefined) {
      if (existing.initializationDigest !== validated.head.initializationDigest) {
        return failure("persistence.initialization_conflict", "taskId already exists with different initialization", {
          taskId: validated.head.taskId,
        });
      }
      return { ok: true, replayed: true, value: this.#loadRequired(existing) };
    }
    if (this.#checkpoints.has(validated.checkpoint.checkpointId)) {
      return failure("persistence.duplicate_checkpoint", "checkpointId already exists");
    }
    this.#heads.set(validated.head.taskId, cloneHead(validated.head));
    this.#checkpoints.set(validated.checkpoint.checkpointId, cloneCheckpoint(validated.checkpoint));
    return { ok: true, replayed: false, value: cloneTask(validated) };
  }

  async commitSubmitTurnTaskBundle(
    input: SubmitTurnTaskBundle,
  ): Promise<PersistenceWriteResult<PersistedSubmitTurnTaskBundle>> {
    this.#requireStarted();
    const validated = validateSubmitTurnTaskBundle(input);
    if ("ok" in validated) return validated;
    const existing = this.#submitTurnBindings.get(
      validated.binding.submitTurnCommandId,
    );
    if (existing !== undefined) {
      if (existing.bundleDigest !== validated.binding.bundleDigest) {
        return failure(
          "persistence.submit_turn_bundle_conflict",
          "submitTurnCommandId already owns another Task bundle",
        );
      }
      const loaded = this.#loadLegacySubmitTurnTaskBundle(existing);
      return loaded === undefined
        ? failure("persistence.integrity_violation", "SubmitTurn binding references missing Task facts")
        : { ok: true, replayed: true, value: loaded };
    }
    const { task, capabilityLocks, runtimeSelection } = validated.input;
    if (
      this.#heads.has(task.head.taskId)
      || this.#checkpoints.has(task.checkpoint.checkpointId)
      || this.#runtimeSelections.has(task.head.taskId)
      || [...this.#submitTurnBindings.values()].some((binding) =>
        binding.taskId === task.head.taskId
        || binding.userMessageId === validated.binding.userMessageId
        || binding.runtimeSelectionId === runtimeSelection.runtimeSelectionId)
      || capabilityLocks.some((lock) =>
        this.#capabilityLockIds.has(lock.lockId)
        || this.#capabilityLocks.has(lockKey(
          lock.taskId,
          lock.definitionSnapshot.capabilityId,
        )))
    ) {
      return failure(
        "persistence.submit_turn_bundle_conflict",
        "SubmitTurn Task bundle identity already exists",
      );
    }
    this.#heads.set(task.head.taskId, cloneHead(task.head));
    this.#checkpoints.set(
      task.checkpoint.checkpointId,
      cloneCheckpoint(task.checkpoint),
    );
    for (const lock of capabilityLocks) {
      const key = lockKey(lock.taskId, lock.definitionSnapshot.capabilityId);
      this.#capabilityLocks.set(key, TaskCapabilityLockSchema.parse(lock));
      this.#capabilityLockIds.set(lock.lockId, key);
    }
    this.#runtimeSelections.set(
      runtimeSelection.taskId,
      parseReadableTaskRuntimeSelectionV1Alpha4(runtimeSelection),
    );
    this.#submitTurnBindings.set(
      validated.binding.submitTurnCommandId,
      TaskSubmitTurnBindingSchema.parse(validated.binding),
    );
    return {
      ok: true,
      replayed: false,
      value: this.#loadLegacySubmitTurnTaskBundle(validated.binding)!,
    };
  }

  async loadSubmitTurnTaskBundle(
    submitTurnCommandId: string,
  ): Promise<PersistedSubmitTurnTaskBundle | undefined> {
    this.#requireStarted();
    const binding = this.#submitTurnBindings.get(submitTurnCommandId);
    if (binding === undefined) return undefined;
    return this.#loadLegacySubmitTurnTaskBundle(binding);
  }

  async commitAuthorizationAwareSubmitTurnTaskBundle(
    input: AuthorizationAwareSubmitTurnTaskBundle,
  ): Promise<PersistenceWriteResult<PersistedAuthorizationAwareSubmitTurnTaskBundle>> {
    const committed = await this.#commitReadableAuthorizationAwareSubmitTurnTaskBundle(input);
    if (!committed.ok) return committed;
    return isLegacyPersistedAuthorizationBundle(committed.value)
      ? { ok: true, replayed: committed.replayed, value: committed.value }
      : failure(
        "persistence.invalid_runtime_selection",
        "Legacy Task bundle cannot return Runtime Selection v1alpha2",
      );
  }

  async commitReasoningAwareSubmitTurnTaskBundle(
    input: ReasoningAwareAuthorizationSubmitTurnTaskBundle,
  ): Promise<PersistenceWriteResult<PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle>> {
    const committed = await this.#commitReadableAuthorizationAwareSubmitTurnTaskBundle(input);
    if (!committed.ok) return committed;
    return isReasoningPersistedAuthorizationBundle(committed.value)
      ? { ok: true, replayed: committed.replayed, value: committed.value }
      : failure(
        "persistence.invalid_runtime_selection",
        "Reasoning-aware Task bundle requires Runtime Selection v1alpha2",
      );
  }

  async commitR2D3SubmitTurnTaskBundle(
    input: R2D3SubmitTurnTaskBundle,
  ): Promise<PersistenceWriteResult<PersistedR2D3SubmitTurnTaskBundle>> {
    this.#requireStarted();
    const validated = validateR2D3SubmitTurnTaskBundle(input);
    if ("ok" in validated) return validated;
    const existing = this.#bundleState.r2d3BindingEnvelopes.get(
      validated.binding.submitTurnCommandId,
    );
    if (existing !== undefined) {
      if (existing.submitTurnBinding.bundleDigest !== validated.binding.bundleDigest) {
        return failure(
          "r2d.task_bundle_conflict",
          "SubmitTurn command already owns another R2D3 Task bundle",
        );
      }
      const replay = loadR2D3BundleFromState(this.#bundleState, existing);
      return replay === undefined
        ? failure("r2d.task_bundle_invalid", "Persisted R2D3 Task bundle is invalid")
        : { ok: true, replayed: true, value: replay };
    }
    const staged = cloneBundleState(this.#bundleState);
    const { task, capabilityLocks, runtimeSelection } = validated.input;
    if (
      staged.heads.has(task.head.taskId)
      || staged.checkpoints.has(task.checkpoint.checkpointId)
      || staged.runtimeSelections.has(task.head.taskId)
      || staged.authorizationRecords.has(task.head.taskId)
      || staged.authorizationRuntimeSelectionIds.has(runtimeSelection.runtimeSelectionId)
      || [...staged.submitTurnBindings.values()].some((binding) =>
        binding.taskId === task.head.taskId
        || binding.userMessageId === validated.binding.userMessageId
        || binding.runtimeSelectionId === runtimeSelection.runtimeSelectionId)
      || capabilityLocks.some((lock) =>
        staged.capabilityLockIds.has(lock.lockId)
        || staged.capabilityLocks.has(lockKey(
          lock.taskId,
          lock.definitionSnapshot.capabilityId,
        )))
    ) {
      return failure(
        "r2d.task_bundle_conflict",
        "R2D3 Task bundle identity already exists",
      );
    }
    staged.heads.set(task.head.taskId, cloneHead(task.head));
    staged.checkpoints.set(
      task.checkpoint.checkpointId,
      cloneCheckpoint(task.checkpoint),
    );
    for (const lock of capabilityLocks) {
      const key = lockKey(lock.taskId, lock.definitionSnapshot.capabilityId);
      staged.capabilityLocks.set(key, TaskCapabilityLockSchema.parse(lock));
      staged.capabilityLockIds.set(lock.lockId, key);
    }
    staged.runtimeSelections.set(
      runtimeSelection.taskId,
      parseReadableTaskRuntimeSelectionV1Alpha4(runtimeSelection),
    );
    const authorization = parseTaskAuthorizationPersistenceRecord({
      selection: validated.input.selection,
      executionIdentity: validated.input.executionIdentity,
    });
    staged.authorizationRecords.set(task.head.taskId, authorization);
    staged.authorizationRuntimeSelectionIds.set(
      runtimeSelection.runtimeSelectionId,
      task.head.taskId,
    );
    staged.submitTurnBindings.set(
      validated.binding.submitTurnCommandId,
      TaskSubmitTurnBindingSchema.parse(validated.binding),
    );
    staged.r2d3BindingEnvelopes.set(
      validated.binding.submitTurnCommandId,
      structuredClone(validated.bindingEnvelope),
    );
    const persisted = loadR2D3BundleFromState(staged, validated.bindingEnvelope);
    if (persisted === undefined) {
      return failure("r2d.task_bundle_invalid", "Staged R2D3 Task bundle is invalid");
    }
    this.#bundleState = staged;
    return { ok: true, replayed: false, value: persisted };
  }

  async loadR2D3SubmitTurnTaskBundle(
    submitTurnCommandId: string,
  ): Promise<PersistedR2D3SubmitTurnTaskBundle | undefined> {
    this.#requireStarted();
    const envelope = this.#bundleState.r2d3BindingEnvelopes.get(
      submitTurnCommandId,
    );
    return envelope === undefined
      ? undefined
      : loadR2D3BundleFromState(this.#bundleState, envelope);
  }

  async commitDfi541SubmitTurnTaskBundle(
    input: Dfi541SubmitTurnTaskBundle,
  ): Promise<PersistenceWriteResult<PersistedDfi541SubmitTurnTaskBundle>> {
    this.#requireStarted();
    const validated = validateDfi541SubmitTurnTaskBundle(input);
    if ("ok" in validated) return validated;
    const commandId = validated.binding.submitTurnCommandId;
    const existing = this.#bundleState.dfi541BindingEnvelopes.get(commandId);
    if (existing !== undefined) {
      if (existing.submitTurnBinding.bundleDigest !== validated.binding.bundleDigest) {
        return failure("dfi541.task_bundle_conflict",
          "SubmitTurn command already owns another DFI-5.4.1 Task bundle");
      }
      const replay = loadDfi541BundleFromState(this.#bundleState, existing);
      return replay === undefined
        ? failure("dfi541.task_bundle_invalid", "Persisted DFI-5.4.1 bundle is invalid")
        : { ok: true, replayed: true, value: replay };
    }
    const staged = cloneBundleState(this.#bundleState);
    const { task, capabilityLocks, runtimeSelection } = validated.input;
    if (
      staged.heads.has(task.head.taskId)
      || staged.checkpoints.has(task.checkpoint.checkpointId)
      || staged.runtimeSelections.has(task.head.taskId)
      || staged.authorizationRecords.has(task.head.taskId)
      || staged.authorizationRuntimeSelectionIds.has(runtimeSelection.runtimeSelectionId)
      || [...staged.submitTurnBindings.values()].some((binding) =>
        binding.taskId === task.head.taskId
        || binding.userMessageId === validated.binding.userMessageId
        || binding.runtimeSelectionId === runtimeSelection.runtimeSelectionId)
      || capabilityLocks.some((lock) => staged.capabilityLockIds.has(lock.lockId)
        || staged.capabilityLocks.has(lockKey(
          lock.taskId,
          lock.definitionSnapshot.capabilityId,
        )))
    ) return failure("dfi541.task_bundle_conflict",
      "DFI-5.4.1 Task bundle identity already exists");
    staged.heads.set(task.head.taskId, cloneHead(task.head));
    staged.checkpoints.set(task.checkpoint.checkpointId,
      cloneCheckpoint(task.checkpoint));
    for (const lock of capabilityLocks) {
      const key = lockKey(lock.taskId, lock.definitionSnapshot.capabilityId);
      staged.capabilityLocks.set(key, TaskCapabilityLockSchema.parse(lock));
      staged.capabilityLockIds.set(lock.lockId, key);
    }
    staged.runtimeSelections.set(runtimeSelection.taskId,
      parseReadableTaskRuntimeSelectionV1Alpha4(runtimeSelection));
    const authorization = parseTaskAuthorizationPersistenceRecord({
      selection: validated.input.selection,
      executionIdentity: validated.input.executionIdentity,
    });
    staged.authorizationRecords.set(task.head.taskId, authorization);
    staged.authorizationRuntimeSelectionIds.set(runtimeSelection.runtimeSelectionId,
      task.head.taskId);
    staged.submitTurnBindings.set(commandId,
      TaskSubmitTurnBindingSchema.parse(validated.binding));
    staged.dfi541BindingEnvelopes.set(commandId,
      structuredClone(validated.bindingEnvelope));
    const persisted = loadDfi541BundleFromState(staged, validated.bindingEnvelope);
    if (persisted === undefined) return failure("dfi541.task_bundle_invalid",
      "Staged DFI-5.4.1 Task bundle is invalid");
    this.#bundleState = staged;
    return { ok: true, replayed: false, value: persisted };
  }

  async loadDfi541SubmitTurnTaskBundle(
    submitTurnCommandId: string,
  ): Promise<PersistedDfi541SubmitTurnTaskBundle | undefined> {
    this.#requireStarted();
    const envelope = this.#bundleState.dfi541BindingEnvelopes.get(
      submitTurnCommandId,
    );
    return envelope === undefined
      ? undefined
      : loadDfi541BundleFromState(this.#bundleState, envelope);
  }

  async #commitReadableAuthorizationAwareSubmitTurnTaskBundle(
    input: ReadableAuthorizationAwareSubmitTurnTaskBundle,
  ): Promise<PersistenceWriteResult<ReadablePersistedAuthorizationAwareSubmitTurnTaskBundle>> {
    this.#requireStarted();
    const validated = isReasoningAuthorizationBundle(input)
      ? validateReasoningAwareAuthorizationSubmitTurnTaskBundle(input)
      : validateAuthorizationAwareSubmitTurnTaskBundle(input);
    if ("ok" in validated) return validated;
    const { base, record } = validated;
    const existingBinding = this.#submitTurnBindings.get(
      base.binding.submitTurnCommandId,
    );
    if (existingBinding !== undefined) {
      if (existingBinding.bundleDigest !== base.binding.bundleDigest) {
        return failure(
          "persistence.submit_turn_bundle_conflict",
          "submitTurnCommandId already owns another Task bundle",
        );
      }
      const existingRecord = this.#authorizationRecords.get(
        existingBinding.taskId,
      );
      if (existingRecord === undefined) {
        return failure(
          "persistence.authorization_selection_corrupt",
          "Authorization-aware bundle is missing authorization facts",
        );
      }
      const conflict = authorizationRecordConflict(existingRecord, record);
      if (conflict !== undefined) return conflict;
      const loaded = this.#loadAuthorizationAwareSubmitTurnTaskBundle(
        existingBinding,
      );
      return loaded === undefined
        ? failure(
          "persistence.authorization_selection_corrupt",
          "Authorization-aware bundle references invalid facts",
        )
        : { ok: true, replayed: true, value: loaded };
    }
    const { task, capabilityLocks, runtimeSelection } = base.input;
    if (
      this.#heads.has(task.head.taskId)
      || this.#checkpoints.has(task.checkpoint.checkpointId)
      || this.#runtimeSelections.has(task.head.taskId)
      || this.#authorizationRecords.has(task.head.taskId)
      || this.#authorizationRuntimeSelectionIds.has(
        runtimeSelection.runtimeSelectionId,
      )
      || [...this.#submitTurnBindings.values()].some((binding) =>
        binding.taskId === task.head.taskId
        || binding.userMessageId === base.binding.userMessageId
        || binding.runtimeSelectionId === runtimeSelection.runtimeSelectionId)
      || capabilityLocks.some((lock) =>
        this.#capabilityLockIds.has(lock.lockId)
        || this.#capabilityLocks.has(lockKey(
          lock.taskId,
          lock.definitionSnapshot.capabilityId,
        )))
    ) {
      return failure(
        "persistence.submit_turn_bundle_conflict",
        "Authorization-aware Task bundle identity already exists",
      );
    }
    this.#heads.set(task.head.taskId, cloneHead(task.head));
    this.#checkpoints.set(
      task.checkpoint.checkpointId,
      cloneCheckpoint(task.checkpoint),
    );
    for (const lock of capabilityLocks) {
      const key = lockKey(lock.taskId, lock.definitionSnapshot.capabilityId);
      this.#capabilityLocks.set(key, TaskCapabilityLockSchema.parse(lock));
      this.#capabilityLockIds.set(lock.lockId, key);
    }
    this.#runtimeSelections.set(
      runtimeSelection.taskId,
      parseReadableTaskRuntimeSelectionV1Alpha4(runtimeSelection),
    );
    this.#authorizationRecords.set(
      task.head.taskId,
      parseTaskAuthorizationPersistenceRecord(record),
    );
    this.#authorizationRuntimeSelectionIds.set(
      runtimeSelection.runtimeSelectionId,
      task.head.taskId,
    );
    this.#submitTurnBindings.set(
      base.binding.submitTurnCommandId,
      TaskSubmitTurnBindingSchema.parse(base.binding),
    );
    return {
      ok: true,
      replayed: false,
      value: this.#loadAuthorizationAwareSubmitTurnTaskBundle(base.binding)!,
    };
  }

  async loadAuthorizationAwareSubmitTurnTaskBundle(
    submitTurnCommandId: string,
  ): Promise<PersistedAuthorizationAwareSubmitTurnTaskBundle | undefined> {
    this.#requireStarted();
    const binding = this.#submitTurnBindings.get(submitTurnCommandId);
    if (binding === undefined) return undefined;
    const loaded = this.#loadAuthorizationAwareSubmitTurnTaskBundle(binding);
    return loaded !== undefined && isLegacyPersistedAuthorizationBundle(loaded)
      ? loaded
      : undefined;
  }

  async loadReasoningAwareSubmitTurnTaskBundle(
    submitTurnCommandId: string,
  ): Promise<PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle | undefined> {
    this.#requireStarted();
    const binding = this.#submitTurnBindings.get(submitTurnCommandId);
    if (binding === undefined) return undefined;
    const loaded = this.#loadAuthorizationAwareSubmitTurnTaskBundle(binding);
    return loaded !== undefined && isReasoningPersistedAuthorizationBundle(loaded)
      ? loaded
      : undefined;
  }

  async loadExecutableSubmitTurnTaskBundle(submitTurnCommandId: string) {
    this.#requireStarted();
    const dfi541 = await this.loadDfi541SubmitTurnTaskBundle(submitTurnCommandId);
    if (dfi541 !== undefined) return dfi541;
    const binding = this.#submitTurnBindings.get(submitTurnCommandId);
    if (binding === undefined) return undefined;
    const authorized = this.#loadAuthorizationAwareSubmitTurnTaskBundle(binding);
    if (authorized !== undefined) return authorized;
    if (this.#authorizationRecords.has(binding.taskId)) return undefined;
    return this.loadSubmitTurnTaskBundle(submitTurnCommandId);
  }

  async loadTaskAuthorizationSelection(taskId: string) {
    this.#requireStarted();
    const record = this.#authorizationRecords.get(taskId);
    return record === undefined
      ? undefined
      : TaskAuthorizationSelectionSchema.parse(record.selection);
  }

  async loadTaskExecutionSelectionIdentity(taskId: string) {
    this.#requireStarted();
    const record = this.#authorizationRecords.get(taskId);
    return record === undefined
      ? undefined
      : TaskExecutionSelectionIdentitySchema.parse(record.executionIdentity);
  }

  async loadTaskAuthorizationMaterializationSnapshot(): Promise<
    TaskAuthorizationMaterializationSnapshot
  > {
    this.#requireStarted();
    const runtimeSelections = [...this.#runtimeSelections.values()]
      .filter((selection) => selection.schemaVersion === "v1alpha1")
      .map((selection) => TaskRuntimeSelectionSchema.parse(selection))
      .sort((left, right) => left.taskId.localeCompare(right.taskId));
    const existingAuthorizationRecords = [...this.#authorizationRecords.values()]
      .filter((record) => this.#runtimeSelections.get(
        record.selection.taskId,
      )?.schemaVersion === "v1alpha1")
      .map((record) => {
        const runtimeSelection = this.#runtimeSelections.get(record.selection.taskId);
        if (runtimeSelection === undefined) {
          throw new Error("Authorization record references missing Runtime Selection");
        }
        return validateTaskAuthorizationRecordAgainstRuntimeSelection(
          record,
          TaskRuntimeSelectionSchema.parse(runtimeSelection),
        );
      })
      .sort((left, right) => left.selection.taskId.localeCompare(right.selection.taskId));
    return {
      runtimeSelections,
      existingAuthorizationRecords,
      coverageDigest: taskAuthorizationCoverageDigest(runtimeSelections),
    };
  }

  async commitTaskAuthorizationMaterialization(
    input: TaskAuthorizationMaterializationCommit,
  ): Promise<PersistenceWriteResult<TaskAuthorizationMaterializationResult>> {
    this.#requireStarted();
    const runtimeSelections = [...this.#runtimeSelections.values()]
      .filter((selection) => selection.schemaVersion === "v1alpha1")
      .map((selection) => TaskRuntimeSelectionSchema.parse(selection))
      .sort((left, right) => left.taskId.localeCompare(right.taskId));
    const coverageDigest = taskAuthorizationCoverageDigest(runtimeSelections);
    if (coverageDigest !== input.expectedCoverageDigest) {
      return failure(
        "persistence.authorization_materialization_conflict",
        "Runtime Selection coverage changed during authorization materialization",
      );
    }
    const runtimeByTask = new Map(
      runtimeSelections.map((selection) => [selection.taskId, selection]),
    );
    const stagedRecords = new Map(this.#authorizationRecords);
    const stagedRuntimeIds = new Map(this.#authorizationRuntimeSelectionIds);
    const existingCount = stagedRecords.size;
    let insertedCount = 0;
    try {
      for (const candidate of input.records) {
        const runtimeSelection = runtimeByTask.get(candidate.selection.taskId);
        if (runtimeSelection === undefined) {
          return failure(
            "persistence.authorization_materialization_conflict",
            "Authorization materialization references unknown Runtime Selection",
          );
        }
        const record = validateTaskAuthorizationRecordAgainstRuntimeSelection(
          candidate,
          runtimeSelection,
        );
        const existing = stagedRecords.get(record.selection.taskId);
        if (existing !== undefined) {
          const conflict = authorizationRecordConflict(existing, record);
          if (conflict !== undefined) return conflict;
          continue;
        }
        const owner = stagedRuntimeIds.get(record.selection.runtimeSelectionId);
        if (owner !== undefined && owner !== record.selection.taskId) {
          return failure(
            "persistence.authorization_materialization_conflict",
            "Runtime Selection already owns another authorization record",
          );
        }
        stagedRecords.set(record.selection.taskId, record);
        stagedRuntimeIds.set(
          record.selection.runtimeSelectionId,
          record.selection.taskId,
        );
        insertedCount += 1;
      }
    } catch {
      return failure(
        "persistence.invalid_authorization_selection",
        "Authorization materialization record is invalid",
      );
    }
    if (stagedRecords.size !== runtimeSelections.length) {
      return failure(
        "persistence.authorization_materialization_incomplete",
        "Authorization materialization does not cover every Runtime Selection",
      );
    }
    this.#authorizationRecords.clear();
    this.#authorizationRuntimeSelectionIds.clear();
    for (const [taskId, record] of stagedRecords) {
      this.#authorizationRecords.set(
        taskId,
        parseTaskAuthorizationPersistenceRecord(record),
      );
    }
    for (const [runtimeSelectionId, taskId] of stagedRuntimeIds) {
      this.#authorizationRuntimeSelectionIds.set(runtimeSelectionId, taskId);
    }
    return {
      ok: true,
      replayed: insertedCount === 0,
      value: {
        existingCount,
        insertedCount,
        totalRuntimeSelectionCount: runtimeSelections.length,
        coverageDigest,
      },
    };
  }

  async loadSubmitTurnBindingByTaskId(
    taskId: string,
  ): Promise<TaskSubmitTurnBinding | undefined> {
    this.#requireStarted();
    const binding = [...this.#submitTurnBindings.values()].find(
      (candidate) => candidate.taskId === taskId,
    );
    return binding === undefined
      ? undefined
      : TaskSubmitTurnBindingSchema.parse(binding);
  }

  async loadTask(taskId: string): Promise<PersistedTask | undefined> {
    this.#requireStarted();
    const head = this.#heads.get(taskId);
    return head === undefined ? undefined : this.#loadRequired(head);
  }

  async loadCheckpoint(checkpointId: string): Promise<TaskCheckpoint | undefined> {
    this.#requireStarted();
    const checkpoint = this.#checkpoints.get(checkpointId);
    return checkpoint === undefined ? undefined : cloneCheckpoint(checkpoint);
  }

  async loadCheckpointAtRevision(taskId: string, stateRevision: number): Promise<TaskCheckpoint | undefined> {
    this.#requireStarted();
    const checkpoint = [...this.#checkpoints.values()].find(
      (candidate) => candidate.taskId === taskId && candidate.stateRevision === stateRevision,
    );
    return checkpoint === undefined ? undefined : cloneCheckpoint(checkpoint);
  }

  async loadEventsAfter(taskId: string, sequence: number): Promise<readonly TaskEvent[]> {
    this.#requireStarted();
    return [...(this.#events.get(taskId)?.values() ?? [])]
      .filter((event) => event.sequence > sequence)
      .sort((left, right) => left.sequence - right.sequence)
      .map((event) => parsePersistedTaskEvent(event));
  }

  async findCommandReceipt(commandId: string): Promise<CommandReceipt | undefined> {
    this.#requireStarted();
    const receipt = this.#receipts.get(commandId);
    return receipt === undefined ? undefined : cloneReceipt(receipt);
  }

  async commitTaskCapabilityLock(
    input: TaskCapabilityLock,
  ): Promise<PersistenceWriteResult<TaskCapabilityLock>> {
    this.#requireStarted();
    const validated = validateTaskCapabilityLock(input);
    if ("ok" in validated) {
      return validated;
    }
    if (!this.#heads.has(validated.taskId)) {
      return failure("persistence.task_not_found", "task does not exist");
    }
    const key = lockKey(validated.taskId, validated.definitionSnapshot.capabilityId);
    const existing = this.#capabilityLocks.get(key);
    if (existing !== undefined) {
      return sha256CanonicalJson(JsonValueSchema.parse(existing)) === sha256CanonicalJson(JsonValueSchema.parse(validated))
        ? { ok: true, replayed: true, value: TaskCapabilityLockSchema.parse(existing) }
        : failure("persistence.capability_lock_conflict", "task capability is already locked to another exact route");
    }
    const existingKey = this.#capabilityLockIds.get(validated.lockId);
    if (existingKey !== undefined) {
      return failure("persistence.capability_lock_conflict", "lockId already belongs to another task capability");
    }
    this.#capabilityLocks.set(key, TaskCapabilityLockSchema.parse(validated));
    this.#capabilityLockIds.set(validated.lockId, key);
    return { ok: true, replayed: false, value: TaskCapabilityLockSchema.parse(validated) };
  }

  async loadTaskCapabilityLock(
    taskId: string,
    capabilityId: string,
  ): Promise<TaskCapabilityLock | undefined> {
    this.#requireStarted();
    const lock = this.#capabilityLocks.get(lockKey(taskId, capabilityId));
    return lock === undefined ? undefined : TaskCapabilityLockSchema.parse(lock);
  }

  async listTaskCapabilityLocks(taskId: string): Promise<readonly TaskCapabilityLock[]> {
    this.#requireStarted();
    return [...this.#capabilityLocks.values()]
      .filter((lock) => lock.taskId === taskId)
      .sort((left, right) => left.definitionSnapshot.capabilityId.localeCompare(right.definitionSnapshot.capabilityId))
      .map((lock) => TaskCapabilityLockSchema.parse(lock));
  }

  async listNonTerminalTaskCapabilityLocksByCapabilityId(
    capabilityId: string,
    limit: number,
  ): Promise<BoundedTaskCapabilityLockPage> {
    this.#requireStarted();
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error("task capability lock query limit is invalid");
    }
    const rows = [...this.#capabilityLocks.values()]
      .filter((lock) => {
        const head = this.#heads.get(lock.taskId);
        return lock.definitionSnapshot.capabilityId === capabilityId
          && head !== undefined
          && (head.status === "created" || head.status === "running" || head.status === "waiting");
      })
      .sort((left, right) => left.taskId.localeCompare(right.taskId));
    return {
      locks: rows.slice(0, limit).map((lock) => TaskCapabilityLockSchema.parse(lock)),
      truncated: rows.length > limit,
    };
  }

  async commitTaskRuntimeSelection(
    input: TaskRuntimeSelection,
  ): Promise<PersistenceWriteResult<TaskRuntimeSelection>> {
    this.#requireStarted();
    let selection: TaskRuntimeSelection;
    try {
      selection = TaskRuntimeSelectionSchema.parse(input);
    } catch {
      return failure("persistence.invalid_runtime_selection", "TaskRuntimeSelection is invalid");
    }
    if (!this.#heads.has(selection.taskId)) {
      return failure("persistence.task_not_found", "task does not exist");
    }
    const referencedLocks = [...this.#capabilityLocks.values()]
      .filter((lock) => lock.taskId === selection.taskId);
    if (!selectionReferencesExactLocks(selection, referencedLocks)) {
      return failure(
        "persistence.runtime_selection_reference_missing",
        "TaskRuntimeSelection references a missing or drifted capability lock",
      );
    }
    const existing = this.#runtimeSelections.get(selection.taskId);
    if (existing !== undefined) {
      return existing.selectionDigest === selection.selectionDigest
        ? { ok: true, replayed: true, value: TaskRuntimeSelectionSchema.parse(existing) }
        : failure("persistence.runtime_selection_conflict", "task already has another runtime selection");
    }
    this.#runtimeSelections.set(selection.taskId, structuredClone(selection));
    return { ok: true, replayed: false, value: structuredClone(selection) };
  }

  async loadTaskRuntimeSelection(taskId: string): Promise<TaskRuntimeSelection | undefined> {
    this.#requireStarted();
    const selection = this.#runtimeSelections.get(taskId);
    return selection === undefined
      ? undefined
      : TaskRuntimeSelectionSchema.parse(structuredClone(selection));
  }

  async loadReadableTaskRuntimeSelection(taskId: string) {
    this.#requireStarted();
    const selection = this.#runtimeSelections.get(taskId);
    return selection === undefined
      ? undefined
      : parseReadableTaskRuntimeSelectionV1Alpha4(structuredClone(selection));
  }

  async loadUserConfirmation(confirmationId: string): Promise<PersistedUserConfirmation | undefined> {
    this.#requireStarted();
    const record = this.#confirmations.get(confirmationId);
    return record === undefined ? undefined : cloneConfirmation(record);
  }

  async findUserConfirmationByScopeDigest(scopeDigest: string): Promise<PersistedUserConfirmation | undefined> {
    this.#requireStarted();
    const confirmationId = this.#confirmationScopeIds.get(scopeDigest);
    return confirmationId === undefined ? undefined : this.loadUserConfirmation(confirmationId);
  }

  async findUserConfirmationByDecisionId(
    decisionId: string,
  ): Promise<PersistedUserConfirmation | undefined> {
    this.#requireStarted();
    const record = [...this.#confirmations.values()].find(
      (candidate) => candidate.decision?.decisionId === decisionId,
    );
    return record === undefined
      ? undefined
      : PersistedUserConfirmationSchema.parse(record);
  }

  async listUserConfirmationsByTask(
    taskId: string,
  ): Promise<readonly PersistedUserConfirmation[]> {
    this.#requireStarted();
    return [...this.#confirmations.values()]
      .filter((record) => record.request.scope.taskId === taskId)
      .sort((left, right) =>
        left.request.requestedAt.localeCompare(right.request.requestedAt)
        || left.request.confirmationId.localeCompare(right.request.confirmationId))
      .map((record) => PersistedUserConfirmationSchema.parse(record));
  }

  async listPendingUserConfirmations(
    limit: number,
  ): Promise<readonly PersistedUserConfirmation[]> {
    this.#requireStarted();
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 200);
    return [...this.#confirmations.values()]
      .filter((record) => record.decision === undefined)
      .sort((left, right) =>
        left.request.requestedAt.localeCompare(right.request.requestedAt)
        || left.request.confirmationId.localeCompare(right.request.confirmationId))
      .slice(0, bounded)
      .map((record) => PersistedUserConfirmationSchema.parse(record));
  }

  async loadEffectAttempt(effectAttemptId: string): Promise<EffectAttempt | undefined> {
    this.#requireStarted();
    const attempt = this.#effects.get(effectAttemptId);
    return attempt === undefined ? undefined : cloneEffectAttempt(attempt);
  }

  async findEffectAttemptByIdempotencyKey(idempotencyKey: string): Promise<EffectAttempt | undefined> {
    this.#requireStarted();
    const effectAttemptId = this.#effectIdempotencyKeys.get(idempotencyKey);
    return effectAttemptId === undefined ? undefined : this.loadEffectAttempt(effectAttemptId);
  }

  async listRecoverableEffectAttempts(): Promise<readonly EffectAttempt[]> {
    this.#requireStarted();
    return [...this.#effects.values()]
      .filter((attempt) => attempt.status === "prepared" || attempt.status === "dispatched" || attempt.status === "uncertain")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.effectAttemptId.localeCompare(right.effectAttemptId))
      .map(cloneEffectAttempt);
  }

  async listEffectAttemptsByTask(
    taskId: string,
  ): Promise<readonly EffectAttempt[]> {
    this.#requireStarted();
    return [...this.#effects.values()]
      .filter((attempt) => attempt.taskId === taskId)
      .sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt)
        || left.effectAttemptId.localeCompare(right.effectAttemptId))
      .map((attempt) => EffectAttemptSchema.parse(attempt));
  }

  async commitEffectTransition(
    input: EffectOnlyCommit,
  ): Promise<PersistenceWriteResult<EffectAttempt>> {
    this.#requireStarted();
    const validated = validateEffectOnlyCommit(input);
    if ("ok" in validated) {
      return validated;
    }
    const currentHead = this.#heads.get(validated.attempt.taskId);
    if (currentHead === undefined) {
      return failure("persistence.task_not_found", "task does not exist");
    }
    const existing = this.#effects.get(validated.attempt.effectAttemptId);
    const taskEvents = this.#events.get(validated.attempt.taskId) ?? new Map<number, TaskEvent>();
    const existingEvent = taskEvents.get(validated.event.sequence);
    if (existing !== undefined && sameEffectAttempt(existing, validated.attempt)) {
      if (existingEvent?.eventId === validated.event.eventId) {
        return { ok: true, replayed: true, value: cloneEffectAttempt(existing) };
      }
    }
    if (currentHead.lastEventSequence !== validated.expectedEventSequence) {
      return failure("persistence.sequence_conflict", "task event sequence does not match expected sequence");
    }
    if (validated.expectedStatus === undefined) {
      if (existing !== undefined) {
        return failure("persistence.idempotency_conflict", "effectAttemptId already exists with different content");
      }
      const effectForKey = this.#effectIdempotencyKeys.get(validated.attempt.idempotencyKey);
      if (effectForKey !== undefined) {
        return failure("persistence.idempotency_conflict", "effect idempotencyKey already belongs to another attempt");
      }
    } else {
      if (existing === undefined) {
        return failure("persistence.effect_not_found", "effect attempt does not exist");
      }
      const transitionError = validateEffectTransition(existing, validated.expectedStatus, validated.attempt);
      if (transitionError !== undefined) {
        return transitionError;
      }
    }
    if (existingEvent !== undefined || this.#eventIds.has(validated.event.eventId)) {
      return failure("persistence.duplicate_event", "effect event already exists");
    }
    const outboxError = this.#validateOutboxUniqueness(validated.outbox);
    if (outboxError !== undefined) {
      return outboxError;
    }

    this.#heads.set(currentHead.taskId, cloneHead({
      ...currentHead,
      lastEventSequence: validated.event.sequence,
    }));
    taskEvents.set(validated.event.sequence, TaskEventSchema.parse(validated.event));
    this.#eventIds.add(validated.event.eventId);
    this.#events.set(validated.attempt.taskId, taskEvents);
    this.#effects.set(validated.attempt.effectAttemptId, cloneEffectAttempt(validated.attempt));
    this.#effectIdempotencyKeys.set(validated.attempt.idempotencyKey, validated.attempt.effectAttemptId);
    this.#storeOutbox(validated.outbox);
    return { ok: true, replayed: false, value: cloneEffectAttempt(validated.attempt) };
  }

  async commitAuthorizationAudit(input: AuthorizationAuditCommit): Promise<PersistenceWriteResult<TaskEvent>> {
    this.#requireStarted();
    const validated = validateAuthorizationAudit(input);
    if ("ok" in validated) return validated;
    const head = this.#heads.get(validated.event.taskId);
    if (head === undefined) return failure("persistence.task_not_found", "task does not exist");
    if (head.lastEventSequence !== validated.expectedEventSequence) {
      return failure("persistence.sequence_conflict", "task event sequence does not match expected sequence");
    }
    const events = this.#events.get(validated.event.taskId) ?? new Map<number, TaskEvent>();
    if (events.has(validated.event.sequence) || this.#eventIds.has(validated.event.eventId)) {
      return failure("persistence.duplicate_event", "authorization event already exists");
    }
    const outboxError = this.#validateOutboxUniqueness(validated.outbox);
    if (outboxError !== undefined) return outboxError;
    this.#heads.set(head.taskId, cloneHead({ ...head, lastEventSequence: validated.event.sequence }));
    events.set(validated.event.sequence, TaskEventSchema.parse(validated.event));
    this.#events.set(head.taskId, events);
    this.#eventIds.add(validated.event.eventId);
    this.#storeOutbox(validated.outbox);
    return { ok: true, replayed: false, value: TaskEventSchema.parse(validated.event) };
  }

  async commitRejectedCommandEvent(
    input: RejectedCommandEventCommit,
  ): Promise<PersistenceWriteResult<TaskEvent>> {
    this.#requireStarted();
    const validated = validateRejectedCommandEvent(input);
    if ("ok" in validated) return validated;
    const head = this.#heads.get(validated.event.taskId);
    if (head === undefined) {
      return failure("persistence.task_not_found", "task does not exist");
    }
    if (head.lastEventSequence !== validated.expectedEventSequence) {
      return failure(
        "persistence.sequence_conflict",
        "task event sequence does not match expected sequence",
      );
    }
    const events = this.#events.get(validated.event.taskId)
      ?? new Map<number, TaskEvent>();
    if (
      events.has(validated.event.sequence)
      || this.#eventIds.has(validated.event.eventId)
    ) {
      return failure(
        "persistence.duplicate_event",
        "rejected command event already exists",
      );
    }
    const outboxError = this.#validateOutboxUniqueness(validated.outbox);
    if (outboxError !== undefined) return outboxError;
    this.#heads.set(head.taskId, cloneHead({
      ...head,
      lastEventSequence: validated.event.sequence,
    }));
    events.set(
      validated.event.sequence,
      TaskEventSchema.parse(validated.event),
    );
    this.#events.set(head.taskId, events);
    this.#eventIds.add(validated.event.eventId);
    this.#storeOutbox(validated.outbox);
    return {
      ok: true,
      replayed: false,
      value: TaskEventSchema.parse(validated.event),
    };
  }

  async commitAcceptedCommand(input: AcceptedCommandCommit): Promise<PersistenceWriteResult<PersistedTask>> {
    this.#requireStarted();
    const validated = validateAcceptedCommit(input);
    if ("ok" in validated) {
      return validated;
    }
    const duplicate = this.#receipts.get(validated.receipt.commandId);
    if (duplicate !== undefined) {
      if (duplicate.commandDigest !== validated.receipt.commandDigest || duplicate.outcome !== "accepted") {
        return failure("persistence.idempotency_conflict", "commandId already exists with another outcome or digest");
      }
      const checkpoint = this.#checkpoints.get(duplicate.checkpointId);
      const current = this.#heads.get(duplicate.taskId);
      if (checkpoint === undefined || current === undefined) {
        return failure("persistence.integrity_violation", "accepted receipt references missing persisted state");
      }
      return {
        ok: true,
        replayed: true,
        value: { head: headAtCheckpoint(current, checkpoint), checkpoint: cloneCheckpoint(checkpoint) },
      };
    }

    const current = this.#heads.get(validated.head.taskId);
    if (current === undefined) {
      return failure("persistence.task_not_found", "task does not exist");
    }
    const conflict = validateCommitAgainstCurrent(current, validated);
    if (conflict !== undefined) {
      return conflict;
    }
    if (this.#checkpoints.has(validated.checkpoint.checkpointId)) {
      return failure("persistence.duplicate_checkpoint", "checkpointId already exists");
    }
    const events = [validated.event, ...(validated.additionalEvents ?? [])];
    const taskEvents = this.#events.get(validated.head.taskId) ?? new Map<number, TaskEvent>();
    if (events.some((event) => taskEvents.has(event.sequence) || this.#eventIds.has(event.eventId))
      || new Set(events.map((event) => event.eventId)).size !== events.length) {
      return failure("persistence.duplicate_event", "task event sequence or eventId already exists");
    }
    const outboxError = this.#validateOutboxUniqueness(validated.outbox);
    if (outboxError !== undefined) {
      return outboxError;
    }
    if (validated.effectTransition !== undefined) {
      const existingEffect = this.#effects.get(validated.effectTransition.attempt.effectAttemptId);
      if (existingEffect === undefined) {
        return failure("persistence.effect_not_found", "effect attempt does not exist");
      }
      const transitionError = validateEffectTransition(
        existingEffect,
        validated.effectTransition.expectedStatus,
        validated.effectTransition.attempt,
      );
      if (transitionError !== undefined) {
        return transitionError;
      }
    }
    if (validated.confirmationTransition !== undefined) {
      const transition = validated.confirmationTransition;
      const existing = this.#confirmations.get(transition.request.confirmationId);
      const scopeOwner = this.#confirmationScopeIds.get(transition.request.scopeDigest);
      if (transition.type === "request") {
        if (existing !== undefined || scopeOwner !== undefined) {
          return failure("persistence.confirmation_conflict", "confirmation request id or scope already exists");
        }
      } else {
        if (existing === undefined || scopeOwner !== transition.request.confirmationId) {
          return failure("persistence.confirmation_not_found", "confirmation request does not exist");
        }
        if (sha256CanonicalJson(JsonValueSchema.parse(existing.request))
          !== sha256CanonicalJson(JsonValueSchema.parse(transition.request))) {
          return failure("persistence.confirmation_conflict", "confirmation request changed before decision");
        }
        if (existing.decision !== undefined) {
          return failure("persistence.confirmation_already_decided", "confirmation request already has a decision");
        }
      }
    }

    this.#heads.set(validated.head.taskId, cloneHead(validated.head));
    this.#checkpoints.set(validated.checkpoint.checkpointId, cloneCheckpoint(validated.checkpoint));
    for (const event of events) {
      taskEvents.set(event.sequence, TaskEventSchema.parse(event));
      this.#eventIds.add(event.eventId);
    }
    this.#events.set(validated.head.taskId, taskEvents);
    this.#receipts.set(validated.receipt.commandId, cloneReceipt(validated.receipt));
    if (validated.effectTransition !== undefined) {
      this.#effects.set(
        validated.effectTransition.attempt.effectAttemptId,
        cloneEffectAttempt(validated.effectTransition.attempt),
      );
    }
    if (validated.confirmationTransition !== undefined) {
      const transition = validated.confirmationTransition;
      const record = PersistedUserConfirmationSchema.parse({
        request: transition.request,
        ...(transition.type === "decision" ? { decision: transition.decision } : {}),
      });
      this.#confirmations.set(transition.request.confirmationId, record);
      this.#confirmationScopeIds.set(transition.request.scopeDigest, transition.request.confirmationId);
    }
    this.#storeOutbox(validated.outbox);
    return { ok: true, replayed: false, value: { head: cloneHead(validated.head), checkpoint: cloneCheckpoint(validated.checkpoint) } };
  }

  async commitRejectedCommand(
    input: Extract<CommandReceipt, { outcome: "rejected" }>,
  ): Promise<PersistenceWriteResult<CommandReceipt>> {
    this.#requireStarted();
    const receipt = validateRejectedReceipt(input);
    if ("ok" in receipt) {
      return receipt;
    }
    const duplicate = this.#receipts.get(receipt.commandId);
    if (duplicate !== undefined) {
      if (duplicate.commandDigest !== receipt.commandDigest || duplicate.outcome !== "rejected") {
        return failure("persistence.idempotency_conflict", "commandId already exists with another outcome or digest");
      }
      return { ok: true, replayed: true, value: cloneReceipt(duplicate) };
    }
    const current = this.#heads.get(receipt.taskId);
    if (current === undefined) {
      return failure("persistence.task_not_found", "task does not exist");
    }
    if (current.stateRevision !== receipt.stateRevision) {
      return failure("persistence.revision_conflict", "rejected receipt revision is stale", {
        actualRevision: current.stateRevision,
        expectedRevision: receipt.stateRevision,
      });
    }
    this.#receipts.set(receipt.commandId, cloneReceipt(receipt));
    return { ok: true, replayed: false, value: cloneReceipt(receipt) };
  }

  async listPendingOutbox(limit: number, dueAt?: string): Promise<readonly OutboxRecord[]> {
    this.#requireStarted();
    requirePositiveLimit(limit);
    return [...this.#outbox.values()]
      .filter((record) => record.publishedAt === undefined
        && (dueAt === undefined || record.nextAttemptAt === undefined || record.nextAttemptAt <= dueAt))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.outboxId.localeCompare(right.outboxId))
      .slice(0, limit)
      .map(cloneOutboxRecord);
  }

  async recordOutboxAttempt(
    input: RecordOutboxAttemptInput,
  ): Promise<PersistenceWriteResult<OutboxRecord>> {
    this.#requireStarted();
    const current = this.#outbox.get(input.outboxId);
    if (current === undefined) {
      return failure("persistence.outbox_not_found", "outbox record does not exist");
    }
    if (current.publishedAt !== undefined) {
      return { ok: true, replayed: true, value: cloneOutboxRecord(current) };
    }
    if (current.attemptCount !== input.expectedAttemptCount) {
      return failure("persistence.outbox_attempt_conflict", "outbox attempt count does not match", {
        actualAttemptCount: current.attemptCount,
        expectedAttemptCount: input.expectedAttemptCount,
      });
    }
    const material = { ...current };
    if (input.publishedAt !== undefined) {
      delete material.nextAttemptAt;
    }
    const next = OutboxRecordSchema.safeParse({
      ...material,
      attemptCount: current.attemptCount + 1,
      ...(input.publishedAt === undefined
        ? { ...(input.nextAttemptAt === undefined ? {} : { nextAttemptAt: input.nextAttemptAt }) }
        : { publishedAt: input.publishedAt }),
    });
    if (!next.success) {
      return failure("persistence.invalid_record", `invalid outbox attempt: ${next.error.issues[0]?.message ?? "unknown"}`);
    }
    this.#outbox.set(input.outboxId, next.data);
    return { ok: true, replayed: false, value: cloneOutboxRecord(next.data) };
  }

  async listRecoveryCandidates(): Promise<readonly PersistedTask[]> {
    this.#requireStarted();
    return [...this.#heads.values()]
      .filter((head) => head.status === "created" || head.status === "running" || head.status === "waiting")
      .sort((left, right) => left.taskId.localeCompare(right.taskId))
      .map((head) => this.#loadRequired(head));
  }

  async listTasks(): Promise<readonly PersistedTask[]> {
    this.#requireStarted();
    return [...this.#heads.values()]
      .sort((left, right) => left.taskId.localeCompare(right.taskId))
      .map((head) => this.#loadRequired(head));
  }

  async listTasksBySession(sessionId: string): Promise<readonly PersistedTask[]> {
    this.#requireStarted();
    return [...this.#heads.values()]
      .map((head) => this.#loadRequired(head))
      .filter((task) => task.checkpoint.state.sessionId === sessionId)
      .sort((left, right) => left.head.taskId.localeCompare(right.head.taskId));
  }

  #loadRequired(head: TaskHead): PersistedTask {
    const checkpoint = this.#checkpoints.get(head.latestCheckpointId);
    if (checkpoint === undefined) {
      throw new Error(`Persistence integrity error: missing checkpoint ${head.latestCheckpointId}`);
    }
    return { head: cloneHead(head), checkpoint: cloneCheckpoint(checkpoint) };
  }

  #requireStarted(): void {
    if (!this.#started) {
      throw new Error("InMemoryTaskPersistence is not started");
    }
  }

  #validateOutboxUniqueness(records: readonly OutboxRecord[]): ReturnType<typeof failure> | undefined {
    const incomingOutboxIds = new Set<string>();
    const incomingDestinations = new Set<string>();
    for (const record of records) {
      const destinationKey = `${record.eventId}\u0000${record.destination}`;
      if (
        this.#outbox.has(record.outboxId)
        || this.#outboxDestinations.has(destinationKey)
        || incomingOutboxIds.has(record.outboxId)
        || incomingDestinations.has(destinationKey)
      ) {
        return failure("persistence.duplicate_outbox", "outbox record already exists");
      }
      incomingOutboxIds.add(record.outboxId);
      incomingDestinations.add(destinationKey);
    }
    return undefined;
  }

  #storeOutbox(records: readonly OutboxRecord[]): void {
    for (const record of records) {
      this.#outbox.set(record.outboxId, cloneOutboxRecord(record));
      this.#outboxDestinations.add(`${record.eventId}\u0000${record.destination}`);
    }
  }

  #loadSubmitTurnTaskBundle(
    binding: TaskSubmitTurnBinding,
  ): ReadablePersistedSubmitTurnTaskBundle | undefined {
    const head = this.#heads.get(binding.taskId);
    const selection = this.#runtimeSelections.get(binding.taskId);
    if (head === undefined || selection === undefined) return undefined;
    const task = this.#loadRequired(head);
    const locks = [...this.#capabilityLocks.values()]
      .filter((lock) => lock.taskId === binding.taskId)
      .sort((left, right) =>
        left.definitionSnapshot.capabilityId.localeCompare(
          right.definitionSnapshot.capabilityId,
        ))
      .map((lock) => TaskCapabilityLockSchema.parse(lock));
    if (
      selection.runtimeSelectionId !== binding.runtimeSelectionId
      || !selectionReferencesExactLocks(selection, locks)
    ) return undefined;
    return {
      binding: TaskSubmitTurnBindingSchema.parse(binding),
      task,
      capabilityLocks: locks,
      runtimeSelection: parseReadableTaskRuntimeSelectionV1Alpha4(selection),
    } as ReadablePersistedSubmitTurnTaskBundle;
  }

  #loadLegacySubmitTurnTaskBundle(
    binding: TaskSubmitTurnBinding,
  ): PersistedSubmitTurnTaskBundle | undefined {
    const loaded = this.#loadSubmitTurnTaskBundle(binding);
    return loaded !== undefined && loaded.runtimeSelection.schemaVersion === "v1alpha1"
      ? loaded as PersistedSubmitTurnTaskBundle
      : undefined;
  }

  #loadAuthorizationAwareSubmitTurnTaskBundle(
    binding: TaskSubmitTurnBinding,
  ): ReadablePersistedAuthorizationAwareSubmitTurnTaskBundle | undefined {
    const base = this.#loadSubmitTurnTaskBundle(binding);
    const record = this.#authorizationRecords.get(binding.taskId);
    if (base === undefined || record === undefined) return undefined;
    try {
      const validated = validateTaskAuthorizationRecordAgainstRuntimeSelection(
        record,
        base.runtimeSelection,
      );
      return { ...base, ...validated } as ReadablePersistedAuthorizationAwareSubmitTurnTaskBundle;
    } catch {
      return undefined;
    }
  }

}

function isReasoningAuthorizationBundle(
  input: ReadableAuthorizationAwareSubmitTurnTaskBundle,
): input is ReasoningAwareAuthorizationSubmitTurnTaskBundle {
  return input.runtimeSelection.schemaVersion === "v1alpha2";
}

function isLegacyPersistedAuthorizationBundle(
  input: ReadablePersistedAuthorizationAwareSubmitTurnTaskBundle,
): input is PersistedAuthorizationAwareSubmitTurnTaskBundle {
  return input.runtimeSelection.schemaVersion === "v1alpha1";
}

function isReasoningPersistedAuthorizationBundle(
  input: ReadablePersistedAuthorizationAwareSubmitTurnTaskBundle,
): input is PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle {
  return input.runtimeSelection.schemaVersion === "v1alpha2";
}

function authorizationRecordConflict(
  existing: TaskAuthorizationPersistenceRecord,
  incoming: TaskAuthorizationPersistenceRecord,
): ReturnType<typeof failure> | undefined {
  if (
    existing.selection.authorizationSelectionDigest
      !== incoming.selection.authorizationSelectionDigest
  ) {
    return failure(
      "persistence.authorization_selection_conflict",
      "Task already owns another authorization selection",
    );
  }
  if (
    existing.executionIdentity.executionSelectionDigest
      !== incoming.executionIdentity.executionSelectionDigest
  ) {
    return failure(
      "persistence.execution_selection_conflict",
      "Task already owns another execution selection identity",
    );
  }
  return sameTaskAuthorizationPersistenceRecord(existing, incoming)
    ? undefined
    : failure(
      "persistence.authorization_selection_corrupt",
      "Task authorization record does not match its digests",
    );
}

function headAtCheckpoint(current: TaskHead, checkpoint: TaskCheckpoint): TaskHead {
  return TaskHeadSchema.parse({
    ...current,
    stateRevision: checkpoint.stateRevision,
    lastEventSequence: checkpoint.lastEventSequence,
    latestCheckpointId: checkpoint.checkpointId,
    status: checkpoint.state.status,
    updatedAt: checkpoint.state.updatedAt,
  });
}

function cloneTask(task: PersistedTask): PersistedTask {
  return { head: cloneHead(task.head), checkpoint: cloneCheckpoint(task.checkpoint) };
}

function cloneHead(head: TaskHead): TaskHead {
  return TaskHeadSchema.parse(head);
}

function cloneCheckpoint(checkpoint: TaskCheckpoint): TaskCheckpoint {
  return parsePersistedTaskCheckpoint(checkpoint);
}

function cloneReceipt(receipt: CommandReceipt): CommandReceipt {
  return CommandReceiptSchema.parse(receipt);
}

function cloneOutboxRecord(record: OutboxRecord): OutboxRecord {
  return OutboxRecordSchema.parse(record);
}

function cloneEffectAttempt(attempt: EffectAttempt): EffectAttempt {
  return EffectAttemptSchema.parse(attempt);
}

function cloneConfirmation(record: PersistedUserConfirmation): PersistedUserConfirmation {
  return PersistedUserConfirmationSchema.parse(record);
}

function sameEffectAttempt(left: EffectAttempt, right: EffectAttempt): boolean {
  return sha256CanonicalJson(JsonValueSchema.parse(left)) === sha256CanonicalJson(JsonValueSchema.parse(right));
}

function requirePositiveLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Outbox query limit must be a positive integer");
  }
}

function lockKey(taskId: string, capabilityId: string): string {
  return `${taskId}\u0000${capabilityId}`;
}

function selectionReferencesExactLocks(
  selection: ReadableTaskRuntimeSelectionV1Alpha4,
  locks: readonly TaskCapabilityLock[],
): boolean {
  const locksById = new Map(locks.map((lock) => [lock.lockId, lock]));
  return [selection.resolvedModelLock, ...selection.toolLocks].every((reference) => {
    const lock = locksById.get(reference.lockId);
    return lock !== undefined
      && lock.taskId === selection.taskId
      && lock.registryRevision === selection.registryRevision
      && lock.definitionSnapshot.capabilityId === reference.capabilityId
      && sha256CanonicalJson(JsonValueSchema.parse(lock)) === reference.lockDigest;
  });
}

function createBundleState(): InMemoryTaskBundleState {
  return {
    heads: new Map(),
    checkpoints: new Map(),
    capabilityLocks: new Map(),
    runtimeSelections: new Map(),
    submitTurnBindings: new Map(),
    authorizationRecords: new Map(),
    authorizationRuntimeSelectionIds: new Map(),
    capabilityLockIds: new Map(),
    r2d3BindingEnvelopes: new Map(),
    dfi541BindingEnvelopes: new Map(),
  };
}

function cloneBundleState(current: InMemoryTaskBundleState): InMemoryTaskBundleState {
  return {
    heads: cloneMap(current.heads),
    checkpoints: cloneMap(current.checkpoints),
    capabilityLocks: cloneMap(current.capabilityLocks),
    runtimeSelections: cloneMap(current.runtimeSelections),
    submitTurnBindings: cloneMap(current.submitTurnBindings),
    authorizationRecords: cloneMap(current.authorizationRecords),
    authorizationRuntimeSelectionIds: new Map(current.authorizationRuntimeSelectionIds),
    capabilityLockIds: new Map(current.capabilityLockIds),
    r2d3BindingEnvelopes: cloneMap(current.r2d3BindingEnvelopes),
    dfi541BindingEnvelopes: cloneMap(current.dfi541BindingEnvelopes),
  };
}

function cloneMap<T>(source: ReadonlyMap<string, T>): Map<string, T> {
  return new Map([...source].map(([key, value]) => [key, structuredClone(value)]));
}

function loadR2D3BundleFromState(
  state: InMemoryTaskBundleState,
  rawEnvelope: PersistedR2D3TaskBundleBindingEnvelopeV1,
): PersistedR2D3SubmitTurnTaskBundle | undefined {
  try {
    const envelope = validateR2D3TaskBundleBindingEnvelopeV1(rawEnvelope);
    const binding = envelope.submitTurnBinding;
    const head = state.heads.get(binding.taskId);
    const selection = state.runtimeSelections.get(binding.taskId);
    const authorization = state.authorizationRecords.get(binding.taskId);
    if (head === undefined || selection?.schemaVersion !== "v1alpha3"
      || authorization === undefined) return undefined;
    const checkpoint = state.checkpoints.get(head.latestCheckpointId);
    if (checkpoint === undefined) return undefined;
    const locksById = new Map(
      [...state.capabilityLocks.values()].map((lock) => [lock.lockId, lock]),
    );
    const locks = [selection.resolvedModelLock, ...selection.toolLocks]
      .map((reference) => locksById.get(reference.lockId));
    if (locks.some((lock) => lock === undefined)) return undefined;
    const input: R2D3SubmitTurnTaskBundle = {
      submitTurnCommandId: binding.submitTurnCommandId,
      userMessageId: binding.userMessageId,
      task: { head: cloneHead(head), checkpoint: cloneCheckpoint(checkpoint) },
      capabilityLocks: locks as TaskCapabilityLock[],
      runtimeSelection: selection,
      selection: authorization.selection,
      executionIdentity: authorization.executionIdentity,
      submitTurnBinding: binding,
      taskInstructionBinding: envelope.taskInstructionBinding,
      committedAt: binding.committedAt,
    };
    const validated = validateR2D3SubmitTurnTaskBundle(input);
    if ("ok" in validated) return undefined;
    return {
      binding: validated.binding,
      taskInstructionBinding: validated.input.taskInstructionBinding,
      task: cloneTask(validated.input.task),
      capabilityLocks: validated.input.capabilityLocks.map((lock) =>
        TaskCapabilityLockSchema.parse(lock)),
      runtimeSelection: validated.input.runtimeSelection,
      selection: validated.input.selection,
      executionIdentity: validated.input.executionIdentity,
    };
  } catch {
    return undefined;
  }
}

function loadDfi541BundleFromState(
  state: InMemoryTaskBundleState,
  rawEnvelope: PersistedDfi541TaskBundleEnvelopeV1,
): PersistedDfi541SubmitTurnTaskBundle | undefined {
  try {
    const envelope = validateDfi541TaskBundleEnvelopeV1(rawEnvelope);
    const binding = envelope.submitTurnBinding;
    const head = state.heads.get(binding.taskId);
    const selection = state.runtimeSelections.get(binding.taskId);
    const authorization = state.authorizationRecords.get(binding.taskId);
    if (head === undefined || selection?.schemaVersion !== "v1alpha4"
      || authorization === undefined) return undefined;
    const checkpoint = state.checkpoints.get(head.latestCheckpointId);
    if (checkpoint === undefined) return undefined;
    const locksById = new Map([...state.capabilityLocks.values()]
      .map((lock) => [lock.lockId, lock]));
    const locks = [selection.resolvedModelLock, ...selection.toolLocks]
      .map((reference) => locksById.get(reference.lockId));
    if (locks.some((lock) => lock === undefined)) return undefined;
    const validated = validateDfi541SubmitTurnTaskBundle({
      submitTurnCommandId: binding.submitTurnCommandId,
      userMessageId: binding.userMessageId,
      task: { head: cloneHead(head), checkpoint: cloneCheckpoint(checkpoint) },
      capabilityLocks: locks as TaskCapabilityLock[],
      runtimeSelection: selection,
      selection: authorization.selection,
      executionIdentity: authorization.executionIdentity,
      submitTurnBinding: binding,
      taskInstructionBinding: envelope.taskInstructionBinding,
      admissionEvidence: envelope.admissionEvidence,
      ...(envelope.resolutionEvidence === undefined
        ? {}
        : { resolutionEvidence: envelope.resolutionEvidence }),
      committedAt: binding.committedAt,
    });
    if ("ok" in validated) return undefined;
    return {
      binding: validated.binding,
      taskInstructionBinding: validated.input.taskInstructionBinding,
      task: cloneTask(validated.input.task),
      capabilityLocks: validated.input.capabilityLocks.map((lock) =>
        TaskCapabilityLockSchema.parse(lock)),
      runtimeSelection: validated.input.runtimeSelection,
      selection: validated.input.selection,
      executionIdentity: validated.input.executionIdentity,
      admissionEvidence: validated.input.admissionEvidence,
      ...(validated.input.resolutionEvidence === undefined
        ? {}
        : { resolutionEvidence: validated.input.resolutionEvidence }),
    };
  } catch {
    return undefined;
  }
}
