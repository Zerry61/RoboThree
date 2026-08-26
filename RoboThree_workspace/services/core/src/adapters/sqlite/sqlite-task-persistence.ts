import { DatabaseSync } from "node:sqlite";

import {
  CommandReceiptSchema,
  EffectAttemptSchema,
  JsonValueSchema,
  OutboxRecordSchema,
  TaskHeadSchema,
  TaskCapabilityLockSchema,
  TaskSubmitTurnBindingSchema,
  TaskRuntimeSelectionSchema,
  TaskAuthorizationSelectionSchema,
  TaskExecutionSelectionIdentitySchema,
  PersistedUserConfirmationSchema,
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
import type { ReadableTaskRuntimeSelection } from
  "@robothree/contracts/runtime-selection/v1alpha2";

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
import { parseReadableTaskRuntimeSelection } from
  "../../application/runtime-selection-revisions.js";
import { validateSubmitTurnTaskBundle } from "../../persistence/submit-turn-bundle-validation.js";
import { sha256CanonicalJson } from "../../persistence/digest.js";
import { parsePersistedTaskCheckpoint, parsePersistedTaskEvent } from "../../persistence/contract-upgrade.js";
import { configureSqlite, migrateAndPreflight } from "./schema-preflight.js";
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

export class SqliteTaskPersistence implements TaskPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.sqlite";
  readonly #databasePath: string;
  readonly #clock: Clock;
  #database: DatabaseSync | undefined;
  #startupError: string | undefined;

  constructor(input: { databasePath: string; clock: Clock }) {
    this.#databasePath = input.databasePath;
    this.#clock = input.clock;
  }

  async start(): Promise<void> {
    if (this.#database !== undefined) {
      return;
    }
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

  async createTask(input: CreateTaskInput): Promise<PersistenceWriteResult<PersistedTask>> {
    const validated = validateTaskCreation(input);
    if ("ok" in validated) {
      return validated;
    }
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const existing = selectHead(database, validated.head.taskId);
        if (existing !== undefined) {
          if (existing.initializationDigest !== validated.head.initializationDigest) {
            return failure("persistence.initialization_conflict", "taskId already exists with different initialization", {
              taskId: validated.head.taskId,
            });
          }
          return { ok: true, replayed: true, value: loadRequired(database, existing) };
        }
        if (selectCheckpoint(database, validated.checkpoint.checkpointId) !== undefined) {
          return failure("persistence.duplicate_checkpoint", "checkpointId already exists");
        }
        insertHead(database, validated.head);
        insertCheckpoint(database, validated.checkpoint);
        return { ok: true, replayed: false, value: validated };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async commitSubmitTurnTaskBundle(
    input: SubmitTurnTaskBundle,
  ): Promise<PersistenceWriteResult<PersistedSubmitTurnTaskBundle>> {
    const validated = validateSubmitTurnTaskBundle(input);
    if ("ok" in validated) return validated;
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const existing = selectSubmitTurnBinding(
          database,
          validated.binding.submitTurnCommandId,
        );
        if (existing !== undefined) {
          if (existing.bundleDigest !== validated.binding.bundleDigest) {
            return failure(
              "persistence.submit_turn_bundle_conflict",
              "submitTurnCommandId already owns another Task bundle",
            );
          }
          const loaded = loadLegacySubmitTurnTaskBundle(database, existing);
          return loaded === undefined
            ? failure("persistence.integrity_violation", "SubmitTurn binding references missing Task facts")
            : { ok: true, replayed: true, value: loaded };
        }
        const { task, capabilityLocks, runtimeSelection } = validated.input;
        if (
          selectHead(database, task.head.taskId) !== undefined
          || selectCheckpoint(database, task.checkpoint.checkpointId) !== undefined
          || selectTaskRuntimeSelection(database, task.head.taskId) !== undefined
          || database.prepare(`
            SELECT 1 AS present FROM task_submit_turn_bindings
            WHERE task_id = ? OR user_message_id = ? OR runtime_selection_id = ?
          `).get(
            task.head.taskId,
            validated.binding.userMessageId,
            runtimeSelection.runtimeSelectionId,
          ) !== undefined
        ) {
          return failure(
            "persistence.submit_turn_bundle_conflict",
            "SubmitTurn Task bundle identity already exists",
          );
        }
        for (const lock of capabilityLocks) {
          if (
            database.prepare(
              "SELECT 1 AS present FROM task_capability_locks WHERE lock_id = ?",
            ).get(lock.lockId) !== undefined
            || selectTaskCapabilityLock(
              database,
              lock.taskId,
              lock.definitionSnapshot.capabilityId,
            ) !== undefined
          ) {
            return failure(
              "persistence.submit_turn_bundle_conflict",
              "SubmitTurn capability lock identity already exists",
            );
          }
        }
        insertHead(database, task.head);
        insertCheckpoint(database, task.checkpoint);
        for (const lock of capabilityLocks) {
          insertTaskCapabilityLock(database, lock);
        }
        insertTaskRuntimeSelection(database, runtimeSelection);
        database.prepare(`
          INSERT INTO task_submit_turn_bindings (
            submit_turn_command_id, task_id, user_message_id,
            runtime_selection_id, bundle_digest, committed_at, binding_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          validated.binding.submitTurnCommandId,
          validated.binding.taskId,
          validated.binding.userMessageId,
          validated.binding.runtimeSelectionId,
          validated.binding.bundleDigest,
          validated.binding.committedAt,
          JSON.stringify(validated.binding),
        );
        return {
          ok: true,
          replayed: false,
          value: loadLegacySubmitTurnTaskBundle(database, validated.binding)!,
        };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async loadSubmitTurnTaskBundle(
    submitTurnCommandId: string,
  ): Promise<PersistedSubmitTurnTaskBundle | undefined> {
    const database = this.#requireDatabase();
    const binding = selectSubmitTurnBinding(database, submitTurnCommandId);
    return binding === undefined
      ? undefined
      : loadLegacySubmitTurnTaskBundle(database, binding);
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

  async #commitReadableAuthorizationAwareSubmitTurnTaskBundle(
    input: ReadableAuthorizationAwareSubmitTurnTaskBundle,
  ): Promise<PersistenceWriteResult<ReadablePersistedAuthorizationAwareSubmitTurnTaskBundle>> {
    const validated = isReasoningAuthorizationBundle(input)
      ? validateReasoningAwareAuthorizationSubmitTurnTaskBundle(input)
      : validateAuthorizationAwareSubmitTurnTaskBundle(input);
    if ("ok" in validated) return validated;
    const { base, record } = validated;
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const existingBinding = selectSubmitTurnBinding(
          database,
          base.binding.submitTurnCommandId,
        );
        if (existingBinding !== undefined) {
          if (existingBinding.bundleDigest !== base.binding.bundleDigest) {
            return failure(
              "persistence.submit_turn_bundle_conflict",
              "submitTurnCommandId already owns another Task bundle",
            );
          }
          let existingRecord: TaskAuthorizationPersistenceRecord | undefined;
          try {
            existingRecord = selectTaskAuthorizationRecord(
              database,
              existingBinding.taskId,
            );
          } catch {
            return failure(
              "persistence.authorization_selection_corrupt",
              "Authorization-aware bundle contains corrupt authorization facts",
            );
          }
          if (existingRecord === undefined) {
            return failure(
              "persistence.authorization_selection_corrupt",
              "Authorization-aware bundle is missing authorization facts",
            );
          }
          const conflict = authorizationRecordConflict(existingRecord, record);
          if (conflict !== undefined) return conflict;
          const loaded = loadAuthorizationAwareSubmitTurnTaskBundle(
            database,
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
          selectHead(database, task.head.taskId) !== undefined
          || selectCheckpoint(database, task.checkpoint.checkpointId) !== undefined
          || selectTaskRuntimeSelection(database, task.head.taskId) !== undefined
          || selectTaskAuthorizationRecord(database, task.head.taskId) !== undefined
          || database.prepare(`
            SELECT 1 AS present FROM task_authorization_selections
            WHERE runtime_selection_id = ?
          `).get(runtimeSelection.runtimeSelectionId) !== undefined
          || database.prepare(`
            SELECT 1 AS present FROM task_submit_turn_bindings
            WHERE task_id = ? OR user_message_id = ? OR runtime_selection_id = ?
          `).get(
            task.head.taskId,
            base.binding.userMessageId,
            runtimeSelection.runtimeSelectionId,
          ) !== undefined
        ) {
          return failure(
            "persistence.submit_turn_bundle_conflict",
            "Authorization-aware Task bundle identity already exists",
          );
        }
        for (const lock of capabilityLocks) {
          if (
            database.prepare(
              "SELECT 1 AS present FROM task_capability_locks WHERE lock_id = ?",
            ).get(lock.lockId) !== undefined
            || selectTaskCapabilityLock(
              database,
              lock.taskId,
              lock.definitionSnapshot.capabilityId,
            ) !== undefined
          ) {
            return failure(
              "persistence.submit_turn_bundle_conflict",
              "SubmitTurn capability lock identity already exists",
            );
          }
        }
        insertHead(database, task.head);
        insertCheckpoint(database, task.checkpoint);
        for (const lock of capabilityLocks) {
          insertTaskCapabilityLock(database, lock);
        }
        insertTaskRuntimeSelection(database, runtimeSelection);
        insertTaskAuthorizationRecord(database, record);
        insertSubmitTurnBinding(database, base.binding);
        const loaded = loadAuthorizationAwareSubmitTurnTaskBundle(
          database,
          base.binding,
        );
        if (loaded === undefined) {
          throw new Error("Authorization-aware Task bundle reload failed");
        }
        return { ok: true, replayed: false, value: loaded };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async loadAuthorizationAwareSubmitTurnTaskBundle(
    submitTurnCommandId: string,
  ): Promise<PersistedAuthorizationAwareSubmitTurnTaskBundle | undefined> {
    const database = this.#requireDatabase();
    const binding = selectSubmitTurnBinding(database, submitTurnCommandId);
    if (binding === undefined) return undefined;
    const loaded = loadAuthorizationAwareSubmitTurnTaskBundle(database, binding);
    return loaded !== undefined && isLegacyPersistedAuthorizationBundle(loaded)
      ? loaded
      : undefined;
  }

  async loadReasoningAwareSubmitTurnTaskBundle(
    submitTurnCommandId: string,
  ): Promise<PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle | undefined> {
    const database = this.#requireDatabase();
    const binding = selectSubmitTurnBinding(database, submitTurnCommandId);
    if (binding === undefined) return undefined;
    const loaded = loadAuthorizationAwareSubmitTurnTaskBundle(database, binding);
    return loaded !== undefined && isReasoningPersistedAuthorizationBundle(loaded)
      ? loaded
      : undefined;
  }

  async loadExecutableSubmitTurnTaskBundle(submitTurnCommandId: string) {
    const database = this.#requireDatabase();
    const binding = selectSubmitTurnBinding(database, submitTurnCommandId);
    if (binding === undefined) return undefined;
    const authorized = loadAuthorizationAwareSubmitTurnTaskBundle(database, binding);
    if (authorized !== undefined) return authorized;
    if (selectTaskAuthorizationRecord(database, binding.taskId) !== undefined) return undefined;
    return this.loadSubmitTurnTaskBundle(submitTurnCommandId);
  }

  async loadTaskAuthorizationSelection(taskId: string) {
    const record = selectTaskAuthorizationRecord(this.#requireDatabase(), taskId);
    return record === undefined
      ? undefined
      : TaskAuthorizationSelectionSchema.parse(record.selection);
  }

  async loadTaskExecutionSelectionIdentity(taskId: string) {
    const record = selectTaskAuthorizationRecord(this.#requireDatabase(), taskId);
    return record === undefined
      ? undefined
      : TaskExecutionSelectionIdentitySchema.parse(record.executionIdentity);
  }

  async loadTaskAuthorizationMaterializationSnapshot(): Promise<
    TaskAuthorizationMaterializationSnapshot
  > {
    const database = this.#requireDatabase();
    const runtimeSelections = selectAllTaskRuntimeSelections(database);
    const existingAuthorizationRecords = selectAllTaskAuthorizationRecords(
      database,
      runtimeSelections,
    );
    return {
      runtimeSelections,
      existingAuthorizationRecords,
      coverageDigest: taskAuthorizationCoverageDigest(runtimeSelections),
    };
  }

  async commitTaskAuthorizationMaterialization(
    input: TaskAuthorizationMaterializationCommit,
  ): Promise<PersistenceWriteResult<TaskAuthorizationMaterializationResult>> {
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const runtimeSelections = selectAllTaskRuntimeSelections(database);
        const coverageDigest = taskAuthorizationCoverageDigest(runtimeSelections);
        if (coverageDigest !== input.expectedCoverageDigest) {
          return failure(
            "persistence.authorization_materialization_conflict",
            "Runtime Selection coverage changed during authorization materialization",
          );
        }
        let existingRecords: readonly TaskAuthorizationPersistenceRecord[];
        try {
          existingRecords = selectAllTaskAuthorizationRecords(
            database,
            runtimeSelections,
          );
        } catch {
          return failure(
            "persistence.authorization_selection_corrupt",
            "Task authorization persistence facts are corrupt",
          );
        }
        const runtimeByTask = new Map(
          runtimeSelections.map((selection) => [selection.taskId, selection]),
        );
        const staged = new Map(
          existingRecords.map((record) => [record.selection.taskId, record]),
        );
        const stagedRuntimeIds = new Map(
          existingRecords.map((record) => [
            record.selection.runtimeSelectionId,
            record.selection.taskId,
          ]),
        );
        const existingCount = staged.size;
        const toInsert: TaskAuthorizationPersistenceRecord[] = [];
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
            const existing = staged.get(record.selection.taskId);
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
            staged.set(record.selection.taskId, record);
            stagedRuntimeIds.set(
              record.selection.runtimeSelectionId,
              record.selection.taskId,
            );
            toInsert.push(record);
          }
        } catch {
          return failure(
            "persistence.invalid_authorization_selection",
            "Authorization materialization record is invalid",
          );
        }
        if (staged.size !== runtimeSelections.length) {
          return failure(
            "persistence.authorization_materialization_incomplete",
            "Authorization materialization does not cover every Runtime Selection",
          );
        }
        for (const record of toInsert) insertTaskAuthorizationRecord(database, record);
        return {
          ok: true,
          replayed: toInsert.length === 0,
          value: {
            existingCount,
            insertedCount: toInsert.length,
            totalRuntimeSelectionCount: runtimeSelections.length,
            coverageDigest,
          },
        };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async loadSubmitTurnBindingByTaskId(
    taskId: string,
  ): Promise<TaskSubmitTurnBinding | undefined> {
    const row = this.#requireDatabase().prepare(`
      SELECT binding_json FROM task_submit_turn_bindings
      WHERE task_id = ?
    `).get(taskId) as Record<string, unknown> | undefined;
    return row === undefined
      ? undefined
      : TaskSubmitTurnBindingSchema.parse(
        JSON.parse(requireString(row.binding_json, "binding_json")),
      );
  }

  async loadTask(taskId: string): Promise<PersistedTask | undefined> {
    const database = this.#requireDatabase();
    const head = selectHead(database, taskId);
    return head === undefined ? undefined : loadRequired(database, head);
  }

  async loadCheckpoint(checkpointId: string): Promise<TaskCheckpoint | undefined> {
    return selectCheckpoint(this.#requireDatabase(), checkpointId);
  }

  async loadCheckpointAtRevision(taskId: string, stateRevision: number): Promise<TaskCheckpoint | undefined> {
    const row = this.#requireDatabase().prepare(`
      SELECT state_json FROM task_checkpoints
      WHERE task_id = ? AND state_revision = ?
    `).get(taskId, stateRevision) as Record<string, unknown> | undefined;
    return row === undefined
      ? undefined
      : parsePersistedTaskCheckpoint(JSON.parse(requireString(row.state_json, "state_json")));
  }

  async loadEventsAfter(taskId: string, sequence: number): Promise<readonly TaskEvent[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT event_json FROM task_events
      WHERE task_id = ? AND sequence > ?
      ORDER BY sequence
    `).all(taskId, sequence) as Record<string, unknown>[];
    return rows.map((row) => parsePersistedTaskEvent(JSON.parse(requireString(row.event_json, "event_json"))));
  }

  async findCommandReceipt(commandId: string): Promise<CommandReceipt | undefined> {
    return selectReceipt(this.#requireDatabase(), commandId);
  }

  async commitTaskCapabilityLock(
    input: TaskCapabilityLock,
  ): Promise<PersistenceWriteResult<TaskCapabilityLock>> {
    const validated = validateTaskCapabilityLock(input);
    if ("ok" in validated) {
      return validated;
    }
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        if (selectHead(database, validated.taskId) === undefined) {
          return failure("persistence.task_not_found", "task does not exist");
        }
        const existing = selectTaskCapabilityLock(
          database,
          validated.taskId,
          validated.definitionSnapshot.capabilityId,
        );
        if (existing !== undefined) {
          return sha256CanonicalJson(JsonValueSchema.parse(existing)) === sha256CanonicalJson(JsonValueSchema.parse(validated))
            ? { ok: true, replayed: true, value: existing }
            : failure("persistence.capability_lock_conflict", "task capability is already locked to another exact route");
        }
        const duplicateId = database.prepare(
          "SELECT lock_id FROM task_capability_locks WHERE lock_id = ?",
        ).get(validated.lockId);
        if (duplicateId !== undefined) {
          return failure("persistence.capability_lock_conflict", "lockId already belongs to another task capability");
        }
        database.prepare(`
          INSERT INTO task_capability_locks (
            lock_id, task_id, capability_id, registry_revision,
            definition_revision, binding_revision, adapter_descriptor_revision,
            locked_at, lock_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          validated.lockId,
          validated.taskId,
          validated.definitionSnapshot.capabilityId,
          validated.registryRevision,
          validated.definitionSnapshot.revision,
          validated.bindingSnapshot.revision,
          validated.adapterDescriptorSnapshot.revision,
          validated.lockedAt,
          JSON.stringify(validated),
        );
        return { ok: true, replayed: false, value: validated };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async loadTaskCapabilityLock(
    taskId: string,
    capabilityId: string,
  ): Promise<TaskCapabilityLock | undefined> {
    return selectTaskCapabilityLock(this.#requireDatabase(), taskId, capabilityId);
  }

  async listTaskCapabilityLocks(taskId: string): Promise<readonly TaskCapabilityLock[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT lock_json FROM task_capability_locks
      WHERE task_id = ? ORDER BY capability_id
    `).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => TaskCapabilityLockSchema.parse(
      JSON.parse(requireString(row.lock_json, "lock_json")),
    ));
  }

  async listNonTerminalTaskCapabilityLocksByCapabilityId(
    capabilityId: string,
    limit: number,
  ): Promise<BoundedTaskCapabilityLockPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error("task capability lock query limit is invalid");
    }
    const rows = this.#requireDatabase().prepare(`
      SELECT task_capability_locks.lock_json
      FROM task_heads
      JOIN task_capability_locks
        ON task_capability_locks.task_id = task_heads.task_id
      WHERE task_heads.status IN ('created', 'running', 'waiting')
        AND task_capability_locks.capability_id = ?
      ORDER BY task_heads.task_id
      LIMIT ?
    `).all(capabilityId, limit + 1) as Record<string, unknown>[];
    return {
      locks: rows.slice(0, limit).map((row) => TaskCapabilityLockSchema.parse(
        JSON.parse(requireString(row.lock_json, "lock_json")),
      )),
      truncated: rows.length > limit,
    };
  }

  async commitTaskRuntimeSelection(
    input: TaskRuntimeSelection,
  ): Promise<PersistenceWriteResult<TaskRuntimeSelection>> {
    let selection: TaskRuntimeSelection;
    try {
      selection = TaskRuntimeSelectionSchema.parse(input);
    } catch {
      return failure("persistence.invalid_runtime_selection", "TaskRuntimeSelection is invalid");
    }
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        if (selectHead(database, selection.taskId) === undefined) {
          return failure("persistence.task_not_found", "task does not exist");
        }
        const referencedLocks = selectTaskCapabilityLocks(database, selection.taskId);
        if (!selectionReferencesExactLocks(selection, referencedLocks)) {
          return failure(
            "persistence.runtime_selection_reference_missing",
            "TaskRuntimeSelection references a missing or drifted capability lock",
          );
        }
        const existing = selectTaskRuntimeSelection(database, selection.taskId);
        if (existing !== undefined) {
          if (existing.schemaVersion !== "v1alpha1") {
            return failure(
              "persistence.runtime_selection_conflict",
              "task already has a newer runtime selection",
            );
          }
          return existing.selectionDigest === selection.selectionDigest
            ? { ok: true, replayed: true, value: existing }
            : failure("persistence.runtime_selection_conflict", "task already has another runtime selection");
        }
        database.prepare(`
          INSERT INTO task_runtime_selections (
            runtime_selection_id, task_id, selection_digest,
            agent_definition_id, agent_revision, registry_revision,
            created_at, selection_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          selection.runtimeSelectionId,
          selection.taskId,
          selection.selectionDigest,
          selection.agent.agentDefinitionId,
          selection.agent.revision,
          selection.registryRevision,
          selection.createdAt,
          JSON.stringify(selection),
        );
        return { ok: true, replayed: false, value: selection };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async loadTaskRuntimeSelection(taskId: string): Promise<TaskRuntimeSelection | undefined> {
    const selection = selectTaskRuntimeSelection(this.#requireDatabase(), taskId);
    return selection === undefined ? undefined : TaskRuntimeSelectionSchema.parse(selection);
  }

  async loadReadableTaskRuntimeSelection(taskId: string) {
    return selectTaskRuntimeSelection(this.#requireDatabase(), taskId);
  }

  async loadUserConfirmation(confirmationId: string): Promise<PersistedUserConfirmation | undefined> {
    return selectUserConfirmation(this.#requireDatabase(), "confirmation_id", confirmationId);
  }

  async findUserConfirmationByScopeDigest(scopeDigest: string): Promise<PersistedUserConfirmation | undefined> {
    return selectUserConfirmation(this.#requireDatabase(), "scope_digest", scopeDigest);
  }

  async findUserConfirmationByDecisionId(
    decisionId: string,
  ): Promise<PersistedUserConfirmation | undefined> {
    const row = this.#requireDatabase().prepare(`
      SELECT request_json, decision_json
      FROM user_confirmations
      WHERE json_extract(decision_json, '$.decisionId') = ?
      LIMIT 1
    `).get(decisionId) as Record<string, unknown> | undefined;
    return row === undefined ? undefined : parseUserConfirmationRow(row);
  }

  async listUserConfirmationsByTask(
    taskId: string,
  ): Promise<readonly PersistedUserConfirmation[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT request_json, decision_json
      FROM user_confirmations
      WHERE task_id = ?
      ORDER BY updated_at, confirmation_id
    `).all(taskId) as Record<string, unknown>[];
    return rows.map(parseUserConfirmationRow);
  }

  async listPendingUserConfirmations(
    limit: number,
  ): Promise<readonly PersistedUserConfirmation[]> {
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 200);
    const rows = this.#requireDatabase().prepare(`
      SELECT request_json, decision_json
      FROM user_confirmations
      WHERE status = 'pending'
      ORDER BY updated_at, confirmation_id
      LIMIT ?
    `).all(bounded) as Record<string, unknown>[];
    return rows.map(parseUserConfirmationRow);
  }

  async loadEffectAttempt(effectAttemptId: string): Promise<EffectAttempt | undefined> {
    return selectEffect(this.#requireDatabase(), effectAttemptId);
  }

  async findEffectAttemptByIdempotencyKey(idempotencyKey: string): Promise<EffectAttempt | undefined> {
    const row = this.#requireDatabase().prepare(
      "SELECT attempt_json FROM effect_attempts WHERE idempotency_key = ?",
    ).get(idempotencyKey) as Record<string, unknown> | undefined;
    return row === undefined
      ? undefined
      : EffectAttemptSchema.parse(JSON.parse(requireString(row.attempt_json, "attempt_json")));
  }

  async listRecoverableEffectAttempts(): Promise<readonly EffectAttempt[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT attempt_json FROM effect_attempts
      WHERE status IN ('prepared', 'dispatched', 'uncertain')
      ORDER BY updated_at, effect_attempt_id
    `).all() as Record<string, unknown>[];
    return rows.map((row) => EffectAttemptSchema.parse(JSON.parse(requireString(row.attempt_json, "attempt_json"))));
  }

  async listEffectAttemptsByTask(
    taskId: string,
  ): Promise<readonly EffectAttempt[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT attempt_json FROM effect_attempts
      WHERE task_id = ?
      ORDER BY updated_at, effect_attempt_id
    `).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => EffectAttemptSchema.parse(
      JSON.parse(requireString(row.attempt_json, "attempt_json")),
    ));
  }

  async commitEffectTransition(
    input: EffectOnlyCommit,
  ): Promise<PersistenceWriteResult<EffectAttempt>> {
    const validated = validateEffectOnlyCommit(input);
    if ("ok" in validated) {
      return validated;
    }
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const head = selectHead(database, validated.attempt.taskId);
        if (head === undefined) {
          return failure("persistence.task_not_found", "task does not exist");
        }
        const existing = selectEffect(database, validated.attempt.effectAttemptId);
        if (existing !== undefined && sameEffectAttempt(existing, validated.attempt)) {
          const existingEvent = selectEventById(database, validated.event.eventId);
          if (existingEvent?.sequence === validated.event.sequence) {
            return { ok: true, replayed: true, value: existing };
          }
        }
        if (head.lastEventSequence !== validated.expectedEventSequence) {
          return failure("persistence.sequence_conflict", "task event sequence does not match expected sequence");
        }
        if (validated.expectedStatus === undefined) {
          if (existing !== undefined) {
            return failure("persistence.idempotency_conflict", "effectAttemptId already exists with different content");
          }
          const keyOwner = database.prepare(
            "SELECT effect_attempt_id FROM effect_attempts WHERE idempotency_key = ?",
          ).get(validated.attempt.idempotencyKey) as Record<string, unknown> | undefined;
          if (keyOwner !== undefined) {
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

        insertEvent(database, validated.event);
        const updateHead = database.prepare(`
          UPDATE task_heads SET last_event_sequence = ?
          WHERE task_id = ? AND last_event_sequence = ?
        `).run(validated.event.sequence, validated.attempt.taskId, validated.expectedEventSequence);
        if (Number(updateHead.changes) !== 1) {
          throw new Error("optimistic task event sequence update failed");
        }
        if (validated.expectedStatus === undefined) {
          insertEffect(database, validated.attempt);
        } else {
          updateEffect(database, validated.attempt, validated.expectedStatus);
        }
        for (const record of validated.outbox) {
          insertOutbox(database, record);
        }
        return { ok: true, replayed: false, value: validated.attempt };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async commitAuthorizationAudit(input: AuthorizationAuditCommit): Promise<PersistenceWriteResult<TaskEvent>> {
    const validated = validateAuthorizationAudit(input);
    if ("ok" in validated) return validated;
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const head = selectHead(database, validated.event.taskId);
        if (head === undefined) return failure("persistence.task_not_found", "task does not exist");
        if (head.lastEventSequence !== validated.expectedEventSequence) {
          return failure("persistence.sequence_conflict", "task event sequence does not match expected sequence");
        }
        insertEvent(database, validated.event);
        const update = database.prepare(`
          UPDATE task_heads SET last_event_sequence = ?
          WHERE task_id = ? AND last_event_sequence = ?
        `).run(validated.event.sequence, validated.event.taskId, validated.expectedEventSequence);
        if (Number(update.changes) !== 1) throw new Error("optimistic authorization event sequence update failed");
        for (const record of validated.outbox) insertOutbox(database, record);
        return { ok: true, replayed: false, value: validated.event };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async commitRejectedCommandEvent(
    input: RejectedCommandEventCommit,
  ): Promise<PersistenceWriteResult<TaskEvent>> {
    const validated = validateRejectedCommandEvent(input);
    if ("ok" in validated) return validated;
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const head = selectHead(database, validated.event.taskId);
        if (head === undefined) {
          return failure("persistence.task_not_found", "task does not exist");
        }
        if (head.lastEventSequence !== validated.expectedEventSequence) {
          return failure(
            "persistence.sequence_conflict",
            "task event sequence does not match expected sequence",
          );
        }
        insertEvent(database, validated.event);
        const update = database.prepare(`
          UPDATE task_heads SET last_event_sequence = ?
          WHERE task_id = ? AND last_event_sequence = ?
        `).run(
          validated.event.sequence,
          validated.event.taskId,
          validated.expectedEventSequence,
        );
        if (Number(update.changes) !== 1) {
          throw new Error(
            "optimistic rejected command event sequence update failed",
          );
        }
        for (const record of validated.outbox) insertOutbox(database, record);
        return { ok: true, replayed: false, value: validated.event };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async commitAcceptedCommand(input: AcceptedCommandCommit): Promise<PersistenceWriteResult<PersistedTask>> {
    const validated = validateAcceptedCommit(input);
    if ("ok" in validated) {
      return validated;
    }
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const duplicate = selectReceipt(database, validated.receipt.commandId);
        if (duplicate !== undefined) {
          if (duplicate.commandDigest !== validated.receipt.commandDigest || duplicate.outcome !== "accepted") {
            return failure("persistence.idempotency_conflict", "commandId already exists with another outcome or digest");
          }
          const checkpoint = selectCheckpoint(database, duplicate.checkpointId);
          const current = selectHead(database, duplicate.taskId);
          if (checkpoint === undefined || current === undefined) {
            return failure("persistence.integrity_violation", "accepted receipt references missing persisted state");
          }
          return {
            ok: true,
            replayed: true,
            value: { head: headAtCheckpoint(current, checkpoint), checkpoint },
          };
        }

        const current = selectHead(database, validated.head.taskId);
        if (current === undefined) {
          return failure("persistence.task_not_found", "task does not exist");
        }
        const conflict = validateCommitAgainstCurrent(current, validated);
        if (conflict !== undefined) {
          return conflict;
        }
        if (selectCheckpoint(database, validated.checkpoint.checkpointId) !== undefined) {
          return failure("persistence.duplicate_checkpoint", "checkpointId already exists");
        }

        if (validated.effectTransition !== undefined) {
          const existingEffect = selectEffect(database, validated.effectTransition.attempt.effectAttemptId);
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
          const existing = selectUserConfirmation(database, "confirmation_id", transition.request.confirmationId);
          const scopeOwner = selectUserConfirmation(database, "scope_digest", transition.request.scopeDigest);
          if (transition.type === "request") {
            if (existing !== undefined || scopeOwner !== undefined) {
              return failure("persistence.confirmation_conflict", "confirmation request id or scope already exists");
            }
          } else {
            if (existing === undefined || scopeOwner?.request.confirmationId !== transition.request.confirmationId) {
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
        const events = [validated.event, ...(validated.additionalEvents ?? [])];
        for (const event of events) {
          insertEvent(database, event);
        }
        insertCheckpoint(database, validated.checkpoint);
        const update = database.prepare(`
          UPDATE task_heads
          SET schema_version = ?, initialization_digest = ?, state_revision = ?,
              last_event_sequence = ?, latest_checkpoint_id = ?, status = ?, updated_at = ?
          WHERE task_id = ? AND state_revision = ? AND last_event_sequence = ?
        `).run(
          validated.head.schemaVersion,
          validated.head.initializationDigest,
          validated.head.stateRevision,
          validated.head.lastEventSequence,
          validated.head.latestCheckpointId,
          validated.head.status,
          validated.head.updatedAt,
          validated.head.taskId,
          validated.expectedRevision,
          current.lastEventSequence,
        );
        if (Number(update.changes) !== 1) {
          throw new Error("optimistic task head update failed");
        }
        insertReceipt(database, validated.receipt);
        if (validated.effectTransition !== undefined) {
          updateEffect(
            database,
            validated.effectTransition.attempt,
            validated.effectTransition.expectedStatus,
          );
        }
        if (validated.confirmationTransition !== undefined) {
          persistUserConfirmation(database, validated.confirmationTransition);
        }
        for (const record of validated.outbox) {
          insertOutbox(database, record);
        }
        return {
          ok: true,
          replayed: false,
          value: { head: validated.head, checkpoint: validated.checkpoint },
        };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async commitRejectedCommand(
    input: Extract<CommandReceipt, { outcome: "rejected" }>,
  ): Promise<PersistenceWriteResult<CommandReceipt>> {
    const receipt = validateRejectedReceipt(input);
    if ("ok" in receipt) {
      return receipt;
    }
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const duplicate = selectReceipt(database, receipt.commandId);
        if (duplicate !== undefined) {
          if (duplicate.commandDigest !== receipt.commandDigest || duplicate.outcome !== "rejected") {
            return failure("persistence.idempotency_conflict", "commandId already exists with another outcome or digest");
          }
          return { ok: true, replayed: true, value: duplicate };
        }
        const current = selectHead(database, receipt.taskId);
        if (current === undefined) {
          return failure("persistence.task_not_found", "task does not exist");
        }
        if (current.stateRevision !== receipt.stateRevision) {
          return failure("persistence.revision_conflict", "rejected receipt revision is stale", {
            actualRevision: current.stateRevision,
            expectedRevision: receipt.stateRevision,
          });
        }
        insertReceipt(database, receipt);
        return { ok: true, replayed: false, value: receipt };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async listPendingOutbox(limit: number, dueAt?: string): Promise<readonly OutboxRecord[]> {
    requirePositiveLimit(limit);
    const rows = this.#requireDatabase().prepare(`
      SELECT record_json FROM outbox
      WHERE published_at IS NULL
        AND (? IS NULL OR next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY created_at, outbox_id
      LIMIT ?
    `).all(dueAt ?? null, dueAt ?? null, limit) as Record<string, unknown>[];
    return rows.map((row) => OutboxRecordSchema.parse(JSON.parse(requireString(row.record_json, "record_json"))));
  }

  async recordOutboxAttempt(
    input: RecordOutboxAttemptInput,
  ): Promise<PersistenceWriteResult<OutboxRecord>> {
    const database = this.#requireDatabase();
    try {
      return withTransaction(database, () => {
        const current = selectOutbox(database, input.outboxId);
        if (current === undefined) {
          return failure("persistence.outbox_not_found", "outbox record does not exist");
        }
        if (current.publishedAt !== undefined) {
          return { ok: true, replayed: true, value: current };
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
        const parsed = OutboxRecordSchema.safeParse({
          ...material,
          attemptCount: current.attemptCount + 1,
          ...(input.publishedAt === undefined
            ? { ...(input.nextAttemptAt === undefined ? {} : { nextAttemptAt: input.nextAttemptAt }) }
            : { publishedAt: input.publishedAt }),
        });
        if (!parsed.success) {
          return failure("persistence.invalid_record", `invalid outbox attempt: ${parsed.error.issues[0]?.message ?? "unknown"}`);
        }
        const update = database.prepare(`
          UPDATE outbox
          SET attempt_count = ?, published_at = ?, next_attempt_at = ?, record_json = ?
          WHERE outbox_id = ? AND attempt_count = ? AND published_at IS NULL
        `).run(
          parsed.data.attemptCount,
          parsed.data.publishedAt ?? null,
          parsed.data.nextAttemptAt ?? null,
          JSON.stringify(parsed.data),
          parsed.data.outboxId,
          input.expectedAttemptCount,
        );
        if (Number(update.changes) !== 1) {
          return failure("persistence.outbox_attempt_conflict", "outbox record changed during attempt update");
        }
        return { ok: true, replayed: false, value: parsed.data };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async listRecoveryCandidates(): Promise<readonly PersistedTask[]> {
    const database = this.#requireDatabase();
    const rows = database.prepare(`
      SELECT * FROM task_heads
      WHERE status IN ('created', 'running', 'waiting')
      ORDER BY task_id
    `).all() as Record<string, unknown>[];
    return rows.map((row) => loadRequired(database, parseHeadRow(row)));
  }

  async listTasks(): Promise<readonly PersistedTask[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT * FROM task_heads ORDER BY task_id
    `).all() as Record<string, unknown>[];
    return rows.map((row) => loadRequired(
      this.#requireDatabase(),
      parseHeadRow(row),
    ));
  }

  async listTasksBySession(sessionId: string): Promise<readonly PersistedTask[]> {
    const database = this.#requireDatabase();
    const rows = database.prepare(`
      SELECT task_heads.*
      FROM task_heads
      JOIN task_checkpoints
        ON task_checkpoints.checkpoint_id = task_heads.latest_checkpoint_id
      WHERE json_extract(task_checkpoints.state_json, '$.state.sessionId') = ?
      ORDER BY task_heads.task_id
    `).all(sessionId) as Record<string, unknown>[];
    return rows.map((row) => loadRequired(database, parseHeadRow(row)));
  }

  #requireDatabase(): DatabaseSync {
    if (this.#database === undefined) {
      throw new Error("SqliteTaskPersistence is not started");
    }
    return this.#database;
  }
}

function insertHead(database: DatabaseSync, head: TaskHead): void {
  database.prepare(`
    INSERT INTO task_heads (
      task_id, schema_version, initialization_digest, state_revision,
      last_event_sequence, latest_checkpoint_id, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    head.taskId,
    head.schemaVersion,
    head.initializationDigest,
    head.stateRevision,
    head.lastEventSequence,
    head.latestCheckpointId,
    head.status,
    head.updatedAt,
  );
}

function insertCheckpoint(database: DatabaseSync, checkpoint: TaskCheckpoint): void {
  database.prepare(`
    INSERT INTO task_checkpoints (
      checkpoint_id, task_id, schema_version, state_revision, last_event_sequence,
      parent_checkpoint_id, state_digest, state_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    checkpoint.checkpointId,
    checkpoint.taskId,
    checkpoint.schemaVersion,
    checkpoint.stateRevision,
    checkpoint.lastEventSequence,
    checkpoint.parentCheckpointId ?? null,
    checkpoint.stateDigest,
    JSON.stringify(checkpoint),
    checkpoint.createdAt,
  );
}

function insertEvent(database: DatabaseSync, event: AcceptedCommandCommit["event"]): void {
  database.prepare(`
    INSERT INTO task_events (
      event_id, task_id, sequence, type, occurred_at, causation_id, correlation_id, event_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventId,
    event.taskId,
    event.sequence,
    event.type,
    event.occurredAt,
    event.causationId,
    event.correlationId,
    JSON.stringify(event),
  );
}

function insertEffect(database: DatabaseSync, attempt: EffectAttempt): void {
  database.prepare(`
    INSERT INTO effect_attempts (
      effect_attempt_id, task_id, idempotency_key, status, attempt_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    attempt.effectAttemptId,
    attempt.taskId,
    attempt.idempotencyKey,
    attempt.status,
    JSON.stringify(attempt),
    attempt.updatedAt,
  );
}

function updateEffect(database: DatabaseSync, attempt: EffectAttempt, expectedStatus: string): void {
  const update = database.prepare(`
    UPDATE effect_attempts
    SET status = ?, attempt_json = ?, updated_at = ?
    WHERE effect_attempt_id = ? AND status = ?
  `).run(
    attempt.status,
    JSON.stringify(attempt),
    attempt.updatedAt,
    attempt.effectAttemptId,
    expectedStatus,
  );
  if (Number(update.changes) !== 1) {
    throw new Error("optimistic effect status update failed");
  }
}

function insertOutbox(database: DatabaseSync, record: OutboxRecord): void {
  database.prepare(`
    INSERT INTO outbox (
      outbox_id, event_id, task_event_id, task_id, destination, attempt_count,
      created_at, next_attempt_at, published_at, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.outboxId,
    record.eventId,
    record.eventId,
    record.taskId,
    record.destination,
    record.attemptCount,
    record.createdAt,
    record.nextAttemptAt ?? null,
    record.publishedAt ?? null,
    JSON.stringify(record),
  );
}

function insertReceipt(database: DatabaseSync, receipt: CommandReceipt): void {
  database.prepare(`
    INSERT INTO command_receipts (
      command_id, task_id, command_digest, outcome, state_revision, received_at, receipt_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    receipt.commandId,
    receipt.taskId,
    receipt.commandDigest,
    receipt.outcome,
    receipt.stateRevision,
    receipt.receivedAt,
    JSON.stringify(receipt),
  );
}

function selectHead(database: DatabaseSync, taskId: string): TaskHead | undefined {
  const row = database.prepare("SELECT * FROM task_heads WHERE task_id = ?").get(taskId) as Record<string, unknown> | undefined;
  return row === undefined ? undefined : parseHeadRow(row);
}

function parseHeadRow(row: Record<string, unknown>): TaskHead {
  return TaskHeadSchema.parse({
    schemaVersion: row.schema_version,
    taskId: row.task_id,
    initializationDigest: row.initialization_digest,
    stateRevision: row.state_revision,
    lastEventSequence: row.last_event_sequence,
    latestCheckpointId: row.latest_checkpoint_id,
    status: row.status,
    updatedAt: row.updated_at,
  });
}

function selectCheckpoint(database: DatabaseSync, checkpointId: string): TaskCheckpoint | undefined {
  const row = database.prepare(
    "SELECT state_json FROM task_checkpoints WHERE checkpoint_id = ?",
  ).get(checkpointId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return undefined;
  }
  return parsePersistedTaskCheckpoint(JSON.parse(requireString(row.state_json, "state_json")));
}

function selectReceipt(database: DatabaseSync, commandId: string): CommandReceipt | undefined {
  const row = database.prepare(
    "SELECT receipt_json FROM command_receipts WHERE command_id = ?",
  ).get(commandId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return undefined;
  }
  return CommandReceiptSchema.parse(JSON.parse(requireString(row.receipt_json, "receipt_json")));
}

function selectEffect(database: DatabaseSync, effectAttemptId: string): EffectAttempt | undefined {
  const row = database.prepare(
    "SELECT attempt_json FROM effect_attempts WHERE effect_attempt_id = ?",
  ).get(effectAttemptId) as Record<string, unknown> | undefined;
  return row === undefined
    ? undefined
    : EffectAttemptSchema.parse(JSON.parse(requireString(row.attempt_json, "attempt_json")));
}

function selectTaskCapabilityLock(
  database: DatabaseSync,
  taskId: string,
  capabilityId: string,
): TaskCapabilityLock | undefined {
  const row = database.prepare(`
    SELECT lock_json FROM task_capability_locks
    WHERE task_id = ? AND capability_id = ?
  `).get(taskId, capabilityId) as Record<string, unknown> | undefined;
  return row === undefined
    ? undefined
    : TaskCapabilityLockSchema.parse(JSON.parse(requireString(row.lock_json, "lock_json")));
}

function insertTaskCapabilityLock(
  database: DatabaseSync,
  lock: TaskCapabilityLock,
): void {
  database.prepare(`
    INSERT INTO task_capability_locks (
      lock_id, task_id, capability_id, registry_revision,
      definition_revision, binding_revision, adapter_descriptor_revision,
      locked_at, lock_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    lock.lockId,
    lock.taskId,
    lock.definitionSnapshot.capabilityId,
    lock.registryRevision,
    lock.definitionSnapshot.revision,
    lock.bindingSnapshot.revision,
    lock.adapterDescriptorSnapshot.revision,
    lock.lockedAt,
    JSON.stringify(lock),
  );
}

function selectTaskCapabilityLocks(
  database: DatabaseSync,
  taskId: string,
): readonly TaskCapabilityLock[] {
  const rows = database.prepare(`
    SELECT lock_json FROM task_capability_locks
    WHERE task_id = ? ORDER BY capability_id
  `).all(taskId) as Record<string, unknown>[];
  return rows.map((row) => TaskCapabilityLockSchema.parse(
    JSON.parse(requireString(row.lock_json, "lock_json")),
  ));
}

function selectionReferencesExactLocks(
  selection: ReadableTaskRuntimeSelection,
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

function selectTaskRuntimeSelection(
  database: DatabaseSync,
  taskId: string,
): ReadableTaskRuntimeSelection | undefined {
  const row = database.prepare(`
    SELECT runtime_selection_id, selection_digest, agent_definition_id,
           agent_revision, registry_revision, selection_json
    FROM task_runtime_selections WHERE task_id = ?
  `).get(taskId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const selection = parseReadableTaskRuntimeSelection(
    JSON.parse(requireString(row.selection_json, "selection_json")),
  );
  if (
    selection.runtimeSelectionId !== row.runtime_selection_id
    || selection.selectionDigest !== row.selection_digest
    || selection.agent.agentDefinitionId !== row.agent_definition_id
    || selection.agent.revision !== row.agent_revision
    || selection.registryRevision !== row.registry_revision
  ) throw new Error("TaskRuntimeSelection indexed fields or digest are invalid");
  return selection;
}

function insertTaskRuntimeSelection(
  database: DatabaseSync,
  selection: ReadableTaskRuntimeSelection,
): void {
  database.prepare(`
    INSERT INTO task_runtime_selections (
      runtime_selection_id, task_id, selection_digest,
      agent_definition_id, agent_revision, registry_revision,
      created_at, selection_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    selection.runtimeSelectionId,
    selection.taskId,
    selection.selectionDigest,
    selection.agent.agentDefinitionId,
    selection.agent.revision,
    selection.registryRevision,
    selection.createdAt,
    JSON.stringify(selection),
  );
}

function selectAllTaskRuntimeSelections(
  database: DatabaseSync,
): readonly TaskRuntimeSelection[] {
  const rows = database.prepare(`
    SELECT task_id FROM task_runtime_selections ORDER BY task_id
  `).all() as Record<string, unknown>[];
  return rows.flatMap((row) => {
    const taskId = requireString(row.task_id, "task_id");
    const selection = selectTaskRuntimeSelection(database, taskId);
    if (selection === undefined) {
      throw new Error("Runtime Selection disappeared during snapshot");
    }
    return selection.schemaVersion === "v1alpha1" ? [selection] : [];
  });
}

function selectTaskAuthorizationRecord(
  database: DatabaseSync,
  taskId: string,
): TaskAuthorizationPersistenceRecord | undefined {
  const row = database.prepare(`
    SELECT task_id, runtime_selection_id, runtime_selection_digest,
           requested_mode, resolved_mode, policy_revision,
           resolution_source, authorization_selection_digest,
           execution_selection_digest, created_at, record_json
    FROM task_authorization_selections WHERE task_id = ?
  `).get(taskId) as Record<string, unknown> | undefined;
  return row === undefined ? undefined : parseTaskAuthorizationRow(database, row);
}

function selectAllTaskAuthorizationRecords(
  database: DatabaseSync,
  runtimeSelections: readonly TaskRuntimeSelection[],
): readonly TaskAuthorizationPersistenceRecord[] {
  const runtimeByTask = new Map(
    runtimeSelections.map((selection) => [selection.taskId, selection]),
  );
  const rows = database.prepare(`
    SELECT task_id, runtime_selection_id, runtime_selection_digest,
           requested_mode, resolved_mode, policy_revision,
           resolution_source, authorization_selection_digest,
           execution_selection_digest, created_at, record_json
    FROM task_authorization_selections ORDER BY task_id
  `).all() as Record<string, unknown>[];
  return rows.map((row) => {
    const taskId = requireString(row.task_id, "task_id");
    const runtimeSelection = runtimeByTask.get(taskId);
    if (runtimeSelection === undefined) {
      throw new Error("Authorization record references missing Runtime Selection");
    }
    const record = parseTaskAuthorizationRow(database, row);
    return validateTaskAuthorizationRecordAgainstRuntimeSelection(
      record,
      runtimeSelection,
    );
  });
}

function parseTaskAuthorizationRow(
  database: DatabaseSync,
  row: Record<string, unknown>,
): TaskAuthorizationPersistenceRecord {
  const record = parseTaskAuthorizationPersistenceRecord(
    JSON.parse(requireString(row.record_json, "record_json")),
  );
  if (
    record.selection.taskId !== row.task_id
    || record.selection.runtimeSelectionId !== row.runtime_selection_id
    || record.executionIdentity.runtimeSelectionDigest !== row.runtime_selection_digest
    || record.selection.requestedMode !== row.requested_mode
    || record.selection.resolvedMode !== row.resolved_mode
    || record.selection.policyRevision !== row.policy_revision
    || record.selection.source !== row.resolution_source
    || record.selection.authorizationSelectionDigest !== row.authorization_selection_digest
    || record.executionIdentity.executionSelectionDigest !== row.execution_selection_digest
    || record.selection.createdAt !== row.created_at
  ) {
    throw new Error("Task authorization indexed fields do not match record JSON");
  }
  const runtimeSelection = selectTaskRuntimeSelection(
    database,
    record.selection.taskId,
  );
  if (runtimeSelection === undefined) {
    throw new Error("Task authorization record references missing Runtime Selection");
  }
  return validateTaskAuthorizationRecordAgainstRuntimeSelection(
    record,
    runtimeSelection,
  );
}

function insertTaskAuthorizationRecord(
  database: DatabaseSync,
  input: TaskAuthorizationPersistenceRecord,
): void {
  const record = parseTaskAuthorizationPersistenceRecord(input);
  database.prepare(`
    INSERT INTO task_authorization_selections (
      task_id, runtime_selection_id, runtime_selection_digest,
      requested_mode, resolved_mode, policy_revision,
      resolution_source, authorization_selection_digest,
      execution_selection_digest, created_at, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.selection.taskId,
    record.selection.runtimeSelectionId,
    record.executionIdentity.runtimeSelectionDigest,
    record.selection.requestedMode,
    record.selection.resolvedMode,
    record.selection.policyRevision,
    record.selection.source,
    record.selection.authorizationSelectionDigest,
    record.executionIdentity.executionSelectionDigest,
    record.selection.createdAt,
    JSON.stringify(record),
  );
}

function selectSubmitTurnBinding(
  database: DatabaseSync,
  submitTurnCommandId: string,
): TaskSubmitTurnBinding | undefined {
  const row = database.prepare(`
    SELECT binding_json FROM task_submit_turn_bindings
    WHERE submit_turn_command_id = ?
  `).get(submitTurnCommandId) as Record<string, unknown> | undefined;
  return row === undefined
    ? undefined
    : TaskSubmitTurnBindingSchema.parse(
      JSON.parse(requireString(row.binding_json, "binding_json")),
    );
}

function insertSubmitTurnBinding(
  database: DatabaseSync,
  binding: TaskSubmitTurnBinding,
): void {
  database.prepare(`
    INSERT INTO task_submit_turn_bindings (
      submit_turn_command_id, task_id, user_message_id,
      runtime_selection_id, bundle_digest, committed_at, binding_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    binding.submitTurnCommandId,
    binding.taskId,
    binding.userMessageId,
    binding.runtimeSelectionId,
    binding.bundleDigest,
    binding.committedAt,
    JSON.stringify(binding),
  );
}

function loadSubmitTurnTaskBundle(
  database: DatabaseSync,
  binding: TaskSubmitTurnBinding,
): ReadablePersistedSubmitTurnTaskBundle | undefined {
  const head = selectHead(database, binding.taskId);
  const selection = selectTaskRuntimeSelection(database, binding.taskId);
  if (head === undefined || selection === undefined) return undefined;
  const task = loadRequired(database, head);
  const locks = selectTaskCapabilityLocks(database, binding.taskId);
  if (
    selection.runtimeSelectionId !== binding.runtimeSelectionId
    || !selectionReferencesExactLocks(selection, locks)
  ) return undefined;
  return {
    binding,
    task,
    capabilityLocks: locks,
    runtimeSelection: selection,
  } as ReadablePersistedSubmitTurnTaskBundle;
}

function loadLegacySubmitTurnTaskBundle(
  database: DatabaseSync,
  binding: TaskSubmitTurnBinding,
): PersistedSubmitTurnTaskBundle | undefined {
  const loaded = loadSubmitTurnTaskBundle(database, binding);
  return loaded !== undefined && loaded.runtimeSelection.schemaVersion === "v1alpha1"
    ? loaded as PersistedSubmitTurnTaskBundle
    : undefined;
}

function loadAuthorizationAwareSubmitTurnTaskBundle(
  database: DatabaseSync,
  binding: TaskSubmitTurnBinding,
): ReadablePersistedAuthorizationAwareSubmitTurnTaskBundle | undefined {
  const base = loadSubmitTurnTaskBundle(database, binding);
  const record = selectTaskAuthorizationRecord(database, binding.taskId);
  if (base === undefined || record === undefined) return undefined;
  const validated = validateTaskAuthorizationRecordAgainstRuntimeSelection(
    record,
    base.runtimeSelection,
  );
  return { ...base, ...validated } as ReadablePersistedAuthorizationAwareSubmitTurnTaskBundle;
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

function selectUserConfirmation(
  database: DatabaseSync,
  field: "confirmation_id" | "scope_digest",
  value: string,
): PersistedUserConfirmation | undefined {
  const row = database.prepare(`
    SELECT request_json, decision_json FROM user_confirmations WHERE ${field} = ?
  `).get(value) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return undefined;
  }
  return parseUserConfirmationRow(row);
}

function parseUserConfirmationRow(
  row: Record<string, unknown>,
): PersistedUserConfirmation {
  const decisionJson = row.decision_json;
  return PersistedUserConfirmationSchema.parse({
    request: JSON.parse(requireString(row.request_json, "request_json")),
    ...(decisionJson === null || decisionJson === undefined
      ? {}
      : { decision: JSON.parse(requireString(decisionJson, "decision_json")) }),
  });
}

function persistUserConfirmation(
  database: DatabaseSync,
  transition: AcceptedCommandCommit["confirmationTransition"] & {},
): void {
  if (transition.type === "request") {
    database.prepare(`
      INSERT INTO user_confirmations (
        confirmation_id, task_id, scope_digest, status, request_json, decision_json, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, NULL, ?)
    `).run(
      transition.request.confirmationId,
      transition.request.scope.taskId,
      transition.request.scopeDigest,
      JSON.stringify(transition.request),
      transition.request.requestedAt,
    );
    return;
  }
  const update = database.prepare(`
    UPDATE user_confirmations
    SET status = ?, decision_json = ?, updated_at = ?
    WHERE confirmation_id = ? AND status = 'pending' AND scope_digest = ?
  `).run(
    transition.decision.decision,
    JSON.stringify(transition.decision),
    transition.decision.decidedAt,
    transition.request.confirmationId,
    transition.request.scopeDigest,
  );
  if (Number(update.changes) !== 1) {
    throw new Error("optimistic user confirmation update failed");
  }
}

function selectEventById(database: DatabaseSync, eventId: string): TaskEvent | undefined {
  const row = database.prepare(
    "SELECT event_json FROM task_events WHERE event_id = ?",
  ).get(eventId) as Record<string, unknown> | undefined;
  return row === undefined
    ? undefined
    : parsePersistedTaskEvent(JSON.parse(requireString(row.event_json, "event_json")));
}

function selectOutbox(database: DatabaseSync, outboxId: string): OutboxRecord | undefined {
  const row = database.prepare(
    "SELECT record_json FROM outbox WHERE outbox_id = ?",
  ).get(outboxId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return undefined;
  }
  return OutboxRecordSchema.parse(JSON.parse(requireString(row.record_json, "record_json")));
}

function loadRequired(database: DatabaseSync, head: TaskHead): PersistedTask {
  const checkpoint = selectCheckpoint(database, head.latestCheckpointId);
  if (checkpoint === undefined) {
    throw new Error(`Persistence integrity error: missing checkpoint ${head.latestCheckpointId}`);
  }
  return { head, checkpoint };
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

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`SQLite field ${field} must be a string`);
  }
  return value;
}

function requirePositiveLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Outbox query limit must be a positive integer");
  }
}

function sameEffectAttempt(left: EffectAttempt, right: EffectAttempt): boolean {
  return sha256CanonicalJson(JsonValueSchema.parse(left)) === sha256CanonicalJson(JsonValueSchema.parse(right));
}

function withTransaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve original failure.
    }
    throw error;
  }
}

function sqliteFailure(error: unknown): ReturnType<typeof failure> {
  return failure(
    "persistence.sqlite_write_failed",
    error instanceof Error ? error.message : "SQLite write failed",
  );
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
