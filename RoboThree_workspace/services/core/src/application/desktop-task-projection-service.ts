import {
  ArtifactCatalogProjectionSchema,
  ArtifactCatalogItemProjectionSchema,
  ArtifactTextPreviewProjectionSchema,
  DeleteArtifactSourceFileCommandSchema,
  DeleteArtifactRecordCommandSchema,
  ArtifactSourceFileDeletionReceiptSchema,
  ArtifactLifecycleProjectionSchema,
  ArtifactLifecycleReceiptSchema,
  JsonObjectSchema,
  ListArtifactsQuerySchema,
  RestoreArtifactRecordCommandSchema,
  RegisterWorkspaceArtifactCommandSchema,
  RegisterWorkspaceArtifactReceiptSchema,
  SetArtifactLifecycleCommandSchema,
  JsonValueSchema,
  TaskCommandSchema,
  TaskDetailProjectionSchema,
  TaskSummaryProjectionSchema,
  TaskTransitionSchema,
  ToolActivityProjectionSchema,
  UserConfirmationProjectionSchema,
} from "@robothree/contracts";
import type {
  EffectAttempt,
  ListPendingUserConfirmationsQuery,
  ListArtifactsQuery,
  ListTasksQuery,
  RegisterWorkspaceArtifactCommand,
  RegisterWorkspaceArtifactReceipt,
  ArtifactLifecycleProjection,
  Action,
  ArtifactCatalogItemProjection,
  ArtifactCatalogProjection,
  ArtifactLifecycleReceipt,
  ArtifactPreviewQuery,
  ArtifactSourceFileDeletionReceipt,
  DeleteArtifactSourceFileCommand,
  DeleteArtifactRecordCommand,
  PersistedUserConfirmation,
  RestoreArtifactRecordCommand,
  RuntimeError,
  SetArtifactLifecycleCommand,
  TaskDetailProjection,
  TaskDisplayStatus,
  TaskRunState,
  TaskStepProjection,
  TaskSummaryProjection,
  ToolActivityProjection,
  ArtifactProjection,
  ArtifactTextPreviewProjection,
  UserConfirmationProjection,
} from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type { DesktopSessionMetadataPersistence } from "../ports/desktop-foundation-persistence.js";
import type {
  PersistedTask,
  TaskPersistence,
} from "../ports/task-persistence.js";
import type {
  DesktopDeliveryDraft,
  SubmitTurnPersistence,
} from "../ports/submit-turn-persistence.js";
import type {
  ArtifactLifecyclePersistence,
  WorkspaceGrantPersistence,
  ManualArtifactRegistrationPersistence,
  ManualArtifactRegistrationRecord,
} from "../ports/desktop-foundation-persistence.js";
import { desktopFoundationError } from "./desktop-foundation-errors.js";
import type { DesktopTaskSummaryReader } from "./desktop-conversation-projection-service.js";
import {
  projectArtifactIndexForTask,
  projectArtifactTextPreview,
} from "./artifact-preview-projection.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

export class DesktopTaskProjectionService
implements DesktopTaskSummaryReader {
  readonly #tasks: TaskPersistence;
  readonly #metadata: DesktopSessionMetadataPersistence;
  readonly #deliveries: SubmitTurnPersistence;
  readonly #artifactLifecycles: ArtifactLifecyclePersistence | undefined;
  readonly #workspaces: WorkspaceGrantPersistence | undefined;
  readonly #manualArtifacts: ManualArtifactRegistrationPersistence | undefined;
  readonly #clock: Clock;
  readonly #projectionStartedAt: string;
  readonly #projectedSequences = new Map<string, number>();

  constructor(input: {
    tasks: TaskPersistence;
    metadata: DesktopSessionMetadataPersistence;
    deliveries: SubmitTurnPersistence;
    artifactLifecycles?: ArtifactLifecyclePersistence;
    workspaces?: WorkspaceGrantPersistence;
    manualArtifacts?: ManualArtifactRegistrationPersistence;
    clock: Clock;
    projectionStartedAt: string;
  }) {
    this.#tasks = input.tasks;
    this.#metadata = input.metadata;
    this.#deliveries = input.deliveries;
    this.#artifactLifecycles = input.artifactLifecycles;
    this.#workspaces = input.workspaces;
    this.#manualArtifacts = input.manualArtifacts;
    this.#clock = input.clock;
    this.#projectionStartedAt = input.projectionStartedAt;
  }

  async listActiveTaskSummaries(
    internalSessionId: string,
  ): Promise<readonly TaskSummaryProjection[]> {
    const session = (await this.#metadata.listDesktopSessions()).find(
      (candidate) => candidate.internalSessionId === internalSessionId,
    );
    if (session === undefined) return [];
    const tasks = await this.#tasks.listTasksBySession(internalSessionId);
    for (const task of tasks) {
      await this.#syncDeliveries(task, session.summary.sessionId);
    }
    const summaries = await Promise.all(tasks
      .filter((task) => ["created", "running", "waiting"].includes(task.head.status))
      .map((task) => this.#projectSummary(task, session.summary.sessionId)));
    return summaries.filter(
      (summary): summary is TaskSummaryProjection => summary !== undefined,
    ).slice(0, 64);
  }

  async syncDesktopSession(desktopSessionId: string): Promise<void> {
    const session = (await this.#metadata.listDesktopSessions()).find(
      (candidate) => candidate.summary.sessionId === desktopSessionId,
    );
    if (session === undefined) return;
    const tasks = await this.#tasks.listTasksBySession(
      session.internalSessionId,
    );
    for (const task of tasks) {
      await this.#syncDeliveries(task, desktopSessionId);
    }
  }

  async syncAll(): Promise<void> {
    for (const session of await this.#metadata.listDesktopSessions()) {
      const tasks = await this.#tasks.listTasksBySession(
        session.internalSessionId,
      );
      for (const task of tasks) {
        await this.#syncDeliveries(task, session.summary.sessionId);
      }
    }
  }

  async list(
    query: ListTasksQuery,
  ): Promise<
    | { ok: true; value: readonly TaskSummaryProjection[] }
    | { ok: false; error: RuntimeError }
  > {
    const sessions = await this.#metadata.listDesktopSessions();
    const selected = query.sessionId === undefined
      ? sessions
      : sessions.filter((item) => item.summary.sessionId === query.sessionId);
    if (query.sessionId !== undefined && selected.length === 0) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.task_session_not_found",
          "Task Session is unavailable",
        ),
      };
    }
    const summaries: TaskSummaryProjection[] = [];
    for (const session of selected) {
      const tasks = await this.#tasks.listTasksBySession(
        session.internalSessionId,
      );
      for (const task of tasks) {
        await this.#syncDeliveries(task, session.summary.sessionId);
        const summary = await this.#projectSummary(
          task,
          session.summary.sessionId,
        );
        if (
          summary !== undefined
          && (
            query.displayStatuses === undefined
            || query.displayStatuses.includes(summary.displayStatus)
          )
        ) {
          summaries.push(summary);
        }
      }
    }
    summaries.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || left.taskId.localeCompare(right.taskId));
    return {
      ok: true,
      value: summaries.slice(0, query.limit ?? 100),
    };
  }

  async loadDetail(input: {
    desktopTaskId: string;
  }): Promise<
    | { ok: true; value: TaskDetailProjection }
    | { ok: false; error: RuntimeError }
  > {
    const internalTaskId = fromDesktopId(input.desktopTaskId, "task");
    if (internalTaskId === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.task_not_found",
          "Task is unavailable",
        ),
      };
    }
    const task = await this.#tasks.loadTask(internalTaskId);
    if (task === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.task_not_found",
          "Task is unavailable",
        ),
      };
    }
    const state = task.checkpoint.state;
    if (state.sessionId === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.task_not_found",
          "Task is not associated with a Desktop Session",
        ),
      };
    }
    const session = (await this.#metadata.listDesktopSessions()).find(
      (candidate) => candidate.internalSessionId === state.sessionId,
    );
    if (session === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.task_integrity_failure",
          "Task references an unavailable Desktop Session",
        ),
      };
    }
    await this.#syncDeliveries(task, session.summary.sessionId);
    const summary = await this.#projectSummary(task, session.summary.sessionId);
    if (summary === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.task_integrity_failure",
          "Task references incomplete runtime selection facts",
        ),
      };
    }
    const [attempts, confirmations, artifactLifecycles] = await Promise.all([
      this.#tasks.listEffectAttemptsByTask(internalTaskId),
      this.#tasks.listUserConfirmationsByTask(internalTaskId),
      this.#artifactLifecycles?.listArtifactLifecycleByTask(internalTaskId) ?? [],
    ]);
    const lifecycleByArtifactId = new Map(
      artifactLifecycles.map((record) => [record.artifactId, record.lifecycle]),
    );
    const bounds = await this.#deliveries.deliveryBounds();
    return {
      ok: true,
      value: TaskDetailProjectionSchema.parse({
        summary,
        goalSummary: state.goal.slice(0, 4_096),
        runs: state.runs.map((run) => ({
          runId: toDesktopId("run", run.runId),
          attempt: run.attempt,
          displayStatus: projectRunStatus(run, attempts),
          steps: run.steps.map((step) => projectStep(step, attempts)),
          startedAt: run.startedAt,
          updatedAt: run.updatedAt,
          ...(run.endedAt === undefined ? {} : { endedAt: run.endedAt }),
        })),
        toolActivities: attempts.map((attempt) =>
          projectToolActivityForDesktop(attempt, state)),
        userConfirmations: confirmations.map((record) =>
          projectUserConfirmationForDesktop(
            record,
            this.#clock.now(),
            actionForConfirmation(state, record),
          )),
        artifacts: projectArtifactIndexForTask({
          task,
          desktopSessionId: session.summary.sessionId,
        }).map((artifact) =>
          projectArtifactForDesktop(
            artifact,
            lifecycleByArtifactId.get(artifact.artifactId),
          )),
        latestDurableCursor: `delivery:${bounds.latestSequence}`,
      }),
    };
  }

  async setArtifactLifecycle(
    command: SetArtifactLifecycleCommand,
  ): Promise<
    | { ok: true; value: ArtifactLifecycleReceipt }
    | { ok: false; error: RuntimeError }
  > {
    const parsed = SetArtifactLifecycleCommandSchema.safeParse(command);
    if (!parsed.success) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.contract_invalid",
          "Artifact lifecycle command is invalid",
        ),
      };
    }
    if (this.#artifactLifecycles === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_unavailable",
          "Artifact lifecycle is unavailable",
        ),
      };
    }
    const match = await this.#findArtifact(parsed.data.artifactId);
    if (match === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_not_found",
          "Artifact is unavailable",
        ),
      };
    }
    const current = await this.#artifactLifecycles.loadArtifactLifecycle(
      parsed.data.artifactId,
    );
    if (current?.lifecycle.deleted) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_deleted",
          "Artifact record is deleted",
          "validation",
        ),
      };
    }
    const now = this.#clock.now();
    const lifecycle = ArtifactLifecycleProjectionSchema.parse({
      revision: (current?.lifecycle.revision ?? 0) + 1,
      pinned: parsed.data.pinned ?? current?.lifecycle.pinned ?? false,
      dismissed: parsed.data.dismissed ?? current?.lifecycle.dismissed ?? false,
      deleted: false,
      updatedAt: now,
      ...(parsed.data.pinned === true
        ? { pinnedAt: now }
        : parsed.data.pinned === false
          ? {}
          : current?.lifecycle.pinnedAt === undefined ? {} : { pinnedAt: current.lifecycle.pinnedAt }),
      ...(parsed.data.dismissed === true
        ? { dismissedAt: now }
        : parsed.data.dismissed === false
          ? {}
          : current?.lifecycle.dismissedAt === undefined ? {} : { dismissedAt: current.lifecycle.dismissedAt }),
    });
    const result = await this.#artifactLifecycles.commitArtifactLifecycle({
      artifactId: match.artifact.artifactId,
      ...(match.internalTaskId === undefined ? {} : { taskId: match.internalTaskId }),
      sourceDigest: match.artifact.sourceDigest,
      lifecycle,
      commandId: parsed.data.commandId,
      requestDigest: sha256CanonicalJson(JsonValueSchema.parse({
        type: parsed.data.type,
        artifactId: parsed.data.artifactId,
        ...(parsed.data.pinned === undefined ? {} : { pinned: parsed.data.pinned }),
        ...(parsed.data.dismissed === undefined ? {} : { dismissed: parsed.data.dismissed }),
      })),
      committedAt: now,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      value: ArtifactLifecycleReceiptSchema.parse({
        commandId: parsed.data.commandId,
        artifactId: parsed.data.artifactId,
        status: result.replayed ? "replayed" : "accepted",
        lifecycle: result.value,
      }),
    };
  }

  async listArtifactCatalog(
    query: ListArtifactsQuery,
  ): Promise<
    | { ok: true; value: ArtifactCatalogProjection }
    | { ok: false; error: RuntimeError }
  > {
    const parsed = ListArtifactsQuerySchema.safeParse(query);
    if (!parsed.success) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.contract_invalid",
          "Artifact catalog query is invalid",
          "validation",
        ),
      };
    }
    const artifacts: ArtifactCatalogItemProjection[] = [];
    for (const session of await this.#metadata.listDesktopSessions()) {
      const tasks = await this.#tasks.listTasksBySession(session.internalSessionId);
      for (const task of tasks) {
        for (const artifact of projectArtifactIndexForTask({
          task,
          desktopSessionId: session.summary.sessionId,
        })) {
          const lifecycle = await this.#artifactLifecycles?.loadArtifactLifecycle(
            artifact.artifactId,
          );
          artifacts.push(projectArtifactCatalogItemFromTask(
            artifact,
            lifecycle?.lifecycle,
          ));
        }
      }
    }
    for (const record of await this.#manualArtifacts?.listManualArtifactRegistrations() ?? []) {
      const lifecycle = await this.#artifactLifecycles?.loadArtifactLifecycle(
        record.artifactId,
      );
      artifacts.push(projectManualArtifactCatalogItem(
        record,
        lifecycle?.lifecycle,
      ));
    }
    const sourceKinds = new Set(parsed.data.sourceKinds ?? []);
    const filtered = artifacts
      .filter((artifact) => sourceKinds.size === 0 || sourceKinds.has(artifact.sourceKind))
      .filter((artifact) => parsed.data.includeDeleted === true || !artifact.lifecycle.deleted)
      .sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
        || left.artifactId.localeCompare(right.artifactId))
      .slice(0, parsed.data.limit ?? 256);
    return {
      ok: true,
      value: ArtifactCatalogProjectionSchema.parse({
        artifacts: filtered,
        generatedAt: this.#clock.now(),
      }),
    };
  }

  async registerManualArtifact(
    input: RegisterManualArtifactInput,
  ): Promise<
    | { ok: true; value: RegisterWorkspaceArtifactReceipt }
    | { ok: false; error: RuntimeError }
  > {
    const parsedCommand = RegisterWorkspaceArtifactCommandSchema.safeParse(input.command);
    if (!parsedCommand.success) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.contract_invalid",
          "Manual Artifact registration command is invalid",
          "validation",
        ),
      };
    }
    if (this.#manualArtifacts === undefined || this.#workspaces === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_registration_unavailable",
          "Manual Artifact registration is unavailable",
        ),
      };
    }
    if (!isSafeWorkspaceRelativePath(input.relativePath)) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_registration_invalid",
          "Manual Artifact relative path is invalid",
          "validation",
        ),
      };
    }
    const grant = await this.#workspaces.loadWorkspaceGrant(input.workspaceGrantId);
    if (grant === undefined || grant.status !== "active") {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.workspace_unavailable",
          "Manual Artifact workspace authority is unavailable",
        ),
      };
    }
    let record: ManualArtifactRegistrationRecord;
    try {
      record = manualArtifactRegistrationRecord({
        workspaceGrantId: input.workspaceGrantId,
        relativePath: input.relativePath,
        fileSha256: input.fileSha256,
        byteSize: input.byteSize,
        mediaType: input.mediaType,
        createdAt: input.createdAt ?? this.#clock.now(),
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      });
    } catch {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_registration_invalid",
          "Manual Artifact registration facts are invalid",
          "validation",
        ),
      };
    }
    const requestDigest = sha256CanonicalJson(JsonValueSchema.parse({
      type: parsedCommand.data.type,
      workspaceGrantId: input.workspaceGrantId,
      relativePath: input.relativePath,
      sourceDigest: record.sourceDigest,
    }));
    const committed = await this.#manualArtifacts.commitManualArtifactRegistration({
      record,
      commandId: parsedCommand.data.commandId,
      requestDigest,
      committedAt: input.createdAt ?? this.#clock.now(),
    });
    if (!committed.ok) return committed;
    return {
      ok: true,
      value: RegisterWorkspaceArtifactReceiptSchema.parse({
        commandId: parsedCommand.data.commandId,
        artifactId: committed.value.artifactId,
        status: committed.replayed ? "replayed" : "accepted",
        artifact: committed.value,
      }),
    };
  }

  async deleteArtifactRecord(
    command: DeleteArtifactRecordCommand,
  ): Promise<
    | { ok: true; value: ArtifactLifecycleReceipt }
    | { ok: false; error: RuntimeError }
  > {
    const parsed = DeleteArtifactRecordCommandSchema.safeParse(command);
    if (!parsed.success) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.contract_invalid",
          "Artifact record delete command is invalid",
          "validation",
        ),
      };
    }
    const requestDigest = artifactRecordCommandDigest(parsed.data);
    const replay = await this.#replayArtifactLifecycleCommand(
      parsed.data.commandId,
      requestDigest,
      parsed.data.artifactId,
    );
    if (replay !== undefined) return replay;
    if (this.#artifactLifecycles === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_unavailable",
          "Artifact lifecycle is unavailable",
        ),
      };
    }
    const match = await this.#findArtifact(parsed.data.artifactId);
    if (match === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_not_found",
          "Artifact is unavailable",
        ),
      };
    }
    const current = await this.#artifactLifecycles.loadArtifactLifecycle(
      parsed.data.artifactId,
    );
    const currentRevision = current?.lifecycle.revision ?? 0;
    if (currentRevision !== parsed.data.expectedArtifactRevision) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_revision_conflict",
          "Artifact record revision changed",
          "validation",
        ),
      };
    }
    if (current?.lifecycle.deleted) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_already_deleted",
          "Artifact record is already deleted",
          "validation",
        ),
      };
    }
    const now = this.#clock.now();
    const lifecycle = ArtifactLifecycleProjectionSchema.parse({
      revision: currentRevision + 1,
      pinned: current?.lifecycle.pinned ?? false,
      dismissed: current?.lifecycle.dismissed ?? false,
      deleted: true,
      updatedAt: now,
      deletedAt: now,
      ...(current?.lifecycle.pinnedAt === undefined ? {} : { pinnedAt: current.lifecycle.pinnedAt }),
      ...(current?.lifecycle.dismissedAt === undefined ? {} : { dismissedAt: current.lifecycle.dismissedAt }),
      ...(parsed.data.reasonSummary === undefined ? {} : {
        deletionReasonSummary: parsed.data.reasonSummary,
      }),
    });
    return await this.#commitArtifactLifecycle({
      commandId: parsed.data.commandId,
      requestDigest,
      artifactId: parsed.data.artifactId,
      lifecycle,
      match,
      committedAt: now,
    });
  }

  async restoreArtifactRecord(
    command: RestoreArtifactRecordCommand,
  ): Promise<
    | { ok: true; value: ArtifactLifecycleReceipt }
    | { ok: false; error: RuntimeError }
  > {
    const parsed = RestoreArtifactRecordCommandSchema.safeParse(command);
    if (!parsed.success) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.contract_invalid",
          "Artifact record restore command is invalid",
          "validation",
        ),
      };
    }
    const requestDigest = artifactRecordCommandDigest(parsed.data);
    const replay = await this.#replayArtifactLifecycleCommand(
      parsed.data.commandId,
      requestDigest,
      parsed.data.artifactId,
    );
    if (replay !== undefined) return replay;
    if (this.#artifactLifecycles === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_unavailable",
          "Artifact lifecycle is unavailable",
        ),
      };
    }
    const match = await this.#findArtifact(parsed.data.artifactId);
    if (match === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_not_found",
          "Artifact is unavailable",
        ),
      };
    }
    const current = await this.#artifactLifecycles.loadArtifactLifecycle(
      parsed.data.artifactId,
    );
    const currentRevision = current?.lifecycle.revision ?? 0;
    if (currentRevision !== parsed.data.expectedArtifactRevision) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_revision_conflict",
          "Artifact record revision changed",
          "validation",
        ),
      };
    }
    if (!current?.lifecycle.deleted) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_restore_unavailable",
          "Artifact record is not deleted",
          "validation",
        ),
      };
    }
    if (current.lifecycle.sourceDeleted) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_restore_unavailable",
          "Artifact source file is deleted",
          "validation",
        ),
      };
    }
    const now = this.#clock.now();
    const lifecycle = ArtifactLifecycleProjectionSchema.parse({
      revision: currentRevision + 1,
      pinned: current.lifecycle.pinned,
      dismissed: current.lifecycle.dismissed,
      deleted: false,
      updatedAt: now,
      restoredAt: now,
      ...(current.lifecycle.pinnedAt === undefined ? {} : { pinnedAt: current.lifecycle.pinnedAt }),
      ...(current.lifecycle.dismissedAt === undefined ? {} : { dismissedAt: current.lifecycle.dismissedAt }),
    });
    return await this.#commitArtifactLifecycle({
      commandId: parsed.data.commandId,
      requestDigest,
      artifactId: parsed.data.artifactId,
      lifecycle,
      match,
      committedAt: now,
    });
  }

  async prepareArtifactSourceFileDeletion(
    command: DeleteArtifactSourceFileCommand,
  ): Promise<
    | { ok: true; value: PreparedArtifactSourceFileDeletion }
    | { ok: true; receipt: ArtifactSourceFileDeletionReceipt }
    | { ok: false; error: RuntimeError }
  > {
    const parsed = DeleteArtifactSourceFileCommandSchema.safeParse(command);
    if (!parsed.success) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.contract_invalid",
          "Artifact source delete command is invalid",
          "validation",
        ),
      };
    }
    const requestDigest = artifactSourceDeleteCommandDigest(parsed.data);
    const replay = await this.#replayArtifactSourceFileDeletionCommand(
      parsed.data.commandId,
      requestDigest,
      parsed.data.artifactId,
    );
    if (replay !== undefined) return replay;
    if (this.#artifactLifecycles === undefined || this.#workspaces === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_source_unavailable",
          "Artifact source authority is unavailable",
        ),
      };
    }
    const match = await this.#findArtifact(parsed.data.artifactId);
    if (match === undefined || match.artifact.relativePath === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_not_found",
          "Artifact source is unavailable",
        ),
      };
    }
    const current = await this.#artifactLifecycles.loadArtifactLifecycle(
      parsed.data.artifactId,
    );
    const currentRevision = current?.lifecycle.revision ?? 0;
    if (currentRevision !== parsed.data.expectedArtifactRevision) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_revision_conflict",
          "Artifact record revision changed",
          "validation",
        ),
      };
    }
    if (current?.lifecycle.sourceDeleted) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_source_unavailable",
          "Artifact source is already deleted",
          "validation",
        ),
      };
    }
    if (current?.lifecycle.deleted) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_deleted",
          "Artifact record is deleted",
          "validation",
        ),
      };
    }
    const expectedConfirmationText =
      artifactSourceDeleteConfirmation(match.artifact.displayName);
    if (
      normalizeConfirmation(parsed.data.confirmationText)
      !== expectedConfirmationText
    ) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_delete_confirmation_mismatch",
          "Artifact source delete confirmation does not match",
          "validation",
        ),
      };
    }
    const workspaceGrantId = await this.#workspaceGrantIdForArtifactMatch(match);
    if (workspaceGrantId === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_source_unavailable",
          "Artifact workspace authority is unavailable",
        ),
      };
    }
    const grant = await this.#workspaces.loadWorkspaceGrant(workspaceGrantId);
    if (grant === undefined || grant.status !== "active") {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.workspace_unavailable",
          "Artifact workspace authority is unavailable",
        ),
      };
    }
    return {
      ok: true,
      value: Object.freeze({
        commandId: parsed.data.commandId,
        requestDigest,
        artifactId: match.artifact.artifactId,
        ...(match.artifact.taskId === undefined ? {} : { taskId: match.artifact.taskId }),
        displayName: match.artifact.displayName,
        relativePath: match.artifact.relativePath,
        workspaceGrantId,
        rootRealPath: grant.rootRealPath,
        expectedArtifactRevision: parsed.data.expectedArtifactRevision,
        expectedConfirmationText,
      }),
    };
  }

  async commitArtifactSourceFileDeletion(
    command: DeleteArtifactSourceFileCommand,
  ): Promise<
    | { ok: true; value: ArtifactSourceFileDeletionReceipt }
    | { ok: false; error: RuntimeError }
  > {
    const parsed = DeleteArtifactSourceFileCommandSchema.safeParse(command);
    if (!parsed.success) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.contract_invalid",
          "Artifact source delete command is invalid",
          "validation",
        ),
      };
    }
    const requestDigest = artifactSourceDeleteCommandDigest(parsed.data);
    const replay = await this.#replayArtifactSourceFileDeletionCommand(
      parsed.data.commandId,
      requestDigest,
      parsed.data.artifactId,
    );
    if (replay !== undefined) {
      return replay.ok ? { ok: true, value: replay.receipt } : replay;
    }
    if (this.#artifactLifecycles === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_source_unavailable",
          "Artifact lifecycle is unavailable",
        ),
      };
    }
    const match = await this.#findArtifact(parsed.data.artifactId);
    if (match === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_not_found",
          "Artifact is unavailable",
        ),
      };
    }
    const current = await this.#artifactLifecycles.loadArtifactLifecycle(
      parsed.data.artifactId,
    );
    const currentRevision = current?.lifecycle.revision ?? 0;
    if (currentRevision !== parsed.data.expectedArtifactRevision) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_delete_uncertain",
          "Artifact record changed after source delete",
          "persistence",
          { artifactId: parsed.data.artifactId },
        ),
      };
    }
    const now = this.#clock.now();
    const lifecycle = ArtifactLifecycleProjectionSchema.parse({
      revision: currentRevision + 1,
      pinned: current?.lifecycle.pinned ?? false,
      dismissed: current?.lifecycle.dismissed ?? false,
      deleted: true,
      sourceDeleted: true,
      sourceDeletedAt: now,
      sourceDeletionMode: "os_trash",
      updatedAt: now,
      deletedAt: now,
      ...(current?.lifecycle.pinnedAt === undefined ? {} : { pinnedAt: current.lifecycle.pinnedAt }),
      ...(current?.lifecycle.dismissedAt === undefined ? {} : { dismissedAt: current.lifecycle.dismissedAt }),
      deletionReasonSummary: "Source file moved to operating system Trash.",
    });
    const committed = await this.#commitArtifactLifecycle({
      commandId: parsed.data.commandId,
      requestDigest,
      artifactId: parsed.data.artifactId,
      lifecycle,
      match,
      committedAt: now,
    });
    if (!committed.ok) return committed;
    return {
      ok: true,
      value: ArtifactSourceFileDeletionReceiptSchema.parse({
        commandId: parsed.data.commandId,
        artifactId: parsed.data.artifactId,
        status: committed.value.status,
        sourceFileDeleted: true,
        deletionMode: "os_trash",
        lifecycle: committed.value.lifecycle,
      }),
    };
  }

  async resolveArtifactFileSource(input: {
    artifactId: string;
  }): Promise<
    | { ok: true; value: ResolvedArtifactFileSource }
    | { ok: false; error: RuntimeError }
  > {
    const match = await this.#findArtifact(input.artifactId);
    if (match === undefined || match.artifact.relativePath === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_not_found",
          "Artifact is unavailable",
        ),
      };
    }
    if (await this.#artifactDeleted(input.artifactId)) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_deleted",
          "Artifact record is deleted",
          "validation",
        ),
      };
    }
    const workspaceGrantId = await this.#workspaceGrantIdForArtifactMatch(match);
    if (workspaceGrantId === undefined || this.#workspaces === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_unavailable",
          "Artifact workspace authority is unavailable",
        ),
      };
    }
    const grant = await this.#workspaces.loadWorkspaceGrant(workspaceGrantId);
    if (grant === undefined || grant.status !== "active") {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.workspace_unavailable",
          "Artifact workspace authority is unavailable",
        ),
      };
    }
    return {
      ok: true,
      value: Object.freeze({
        artifactId: match.artifact.artifactId,
        ...(match.artifact.taskId === undefined ? {} : { taskId: match.artifact.taskId }),
        displayName: match.artifact.displayName,
        relativePath: match.artifact.relativePath,
        workspaceGrantId,
        rootRealPath: grant.rootRealPath,
      }),
    };
  }

  async listPendingConfirmations(
    query: ListPendingUserConfirmationsQuery,
  ): Promise<
    | { ok: true; value: readonly UserConfirmationProjection[] }
    | { ok: false; error: RuntimeError }
  > {
    const internalTaskId = query.taskId === undefined
      ? undefined
      : fromDesktopId(query.taskId, "task");
    if (query.taskId !== undefined && internalTaskId === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.task_not_found",
          "Task is unavailable",
        ),
      };
    }
    const records = internalTaskId === undefined
      ? await this.#tasks.listPendingUserConfirmations(query.limit ?? 100)
      : await this.#tasks.listUserConfirmationsByTask(internalTaskId);
    const now = this.#clock.now();
    return {
      ok: true,
      value: records
        .map((record) => projectUserConfirmationForDesktop(record, now))
        .filter((record) => record.status === "pending")
        .slice(0, query.limit ?? 100),
    };
  }

  async previewArtifact(
    query: ArtifactPreviewQuery,
  ): Promise<
    | { ok: true; value: ArtifactTextPreviewProjection }
    | { ok: false; error: RuntimeError }
  > {
    for (const session of await this.#metadata.listDesktopSessions()) {
      const tasks = await this.#tasks.listTasksBySession(
        session.internalSessionId,
      );
      for (const task of tasks) {
        if (await this.#artifactDeleted(query.artifactId)) {
          return {
            ok: false,
            error: desktopFoundationError(
              "desktop.artifact_deleted",
              "Artifact record is deleted",
              "validation",
            ),
          };
        }
        const preview = projectArtifactTextPreview({
          task,
          desktopSessionId: session.summary.sessionId,
          artifactId: query.artifactId,
          mode: query.mode,
          maxBytes: query.maxBytes,
        });
        if (preview.ok) {
          return {
            ok: true,
            value: ArtifactTextPreviewProjectionSchema.parse(preview.value),
          };
        }
        if (preview.reason !== "not_found") {
          return {
            ok: false,
            error: desktopFoundationError(
              "desktop.artifact_unavailable",
              "Artifact preview is unavailable",
              "validation",
              { reason: preview.reason },
            ),
          };
        }
      }
    }
    return {
      ok: false,
      error: desktopFoundationError(
        "desktop.artifact_not_found",
        "Artifact is unavailable",
      ),
    };
  }

  async #workspaceGrantIdForArtifactMatch(
    match: ResolvedArtifactMatch,
  ): Promise<string | undefined> {
    if (match.workspaceGrantId !== undefined) return match.workspaceGrantId;
    const payload = match.step === undefined
      ? {}
      : actionPayloadRecord(match.step.action.payload);
    if (typeof payload.workspaceGrantId === "string") return payload.workspaceGrantId;
    if (match.internalTaskId === undefined) return undefined;
    const selection = await this.#tasks.loadReadableTaskRuntimeSelection(match.internalTaskId);
    return selection?.workspaceGrantId;
  }

  async #findArtifact(
    artifactId: string,
  ): Promise<ResolvedArtifactMatch | undefined> {
    const sessions = await this.#metadata.listDesktopSessions();
    for (const session of sessions) {
      const tasks = await this.#tasks.listTasksBySession(session.internalSessionId);
      for (const task of tasks) {
        for (const step of task.checkpoint.state.runs.flatMap((run) => run.steps)) {
          if (step.observation?.outcome !== "succeeded") continue;
          const artifact = projectArtifactIndexForTask({
            task,
            desktopSessionId: session.summary.sessionId,
          }).find((entry) => entry.artifactId === artifactId);
          if (
            artifact === undefined
            || artifact.sourceId !== step.observation.observationId
          ) continue;
          return {
            artifact: projectArtifactForDesktop(artifact),
            task,
            step,
            internalTaskId: task.head.taskId,
          };
        }
      }
    }
    for (const task of await this.#tasks.listTasks()) {
      if (task.checkpoint.state.sessionId === undefined) continue;
      for (const step of task.checkpoint.state.runs.flatMap((run) => run.steps)) {
        if (step.observation?.outcome !== "succeeded") continue;
        const artifact = projectArtifactIndexForTask({
          task,
          desktopSessionId: toDesktopId("session", task.checkpoint.state.sessionId),
        }).find((entry) => entry.artifactId === artifactId);
        if (
          artifact === undefined
          || artifact.sourceId !== step.observation.observationId
        ) continue;
        return {
          artifact: projectArtifactForDesktop(artifact),
          task,
          step,
          internalTaskId: task.head.taskId,
        };
      }
    }
    const manual = await this.#manualArtifacts?.loadManualArtifactRegistration(artifactId);
    if (manual !== undefined) {
      const lifecycle = await this.#artifactLifecycles?.loadArtifactLifecycle(artifactId);
      return {
        artifact: projectManualArtifactAsResolvedArtifact(
          manual,
          lifecycle?.lifecycle,
        ),
        workspaceGrantId: manual.workspaceGrantId,
      };
    }
    return undefined;
  }

  async #artifactDeleted(artifactId: string): Promise<boolean> {
    return (await this.#artifactLifecycles?.loadArtifactLifecycle(artifactId))
      ?.lifecycle.deleted === true;
  }

  async #replayArtifactLifecycleCommand(
    commandId: string,
    requestDigest: string,
    artifactId: string,
  ): Promise<
    | { ok: true; value: ArtifactLifecycleReceipt }
    | { ok: false; error: RuntimeError }
    | undefined
  > {
    const receipt = await this.#artifactLifecycles
      ?.findArtifactLifecycleCommandReceipt(commandId);
    if (receipt === undefined) return undefined;
    if (
      receipt.commandType !== "set_artifact_lifecycle"
      || receipt.requestDigest !== requestDigest
      || receipt.artifactId !== artifactId
    ) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.command_idempotency_conflict",
          "Command idempotency conflict",
          "validation",
        ),
      };
    }
    return {
      ok: true,
      value: ArtifactLifecycleReceiptSchema.parse({
        commandId,
        artifactId,
        status: "replayed",
        lifecycle: receipt.lifecycle,
      }),
    };
  }

  async #replayArtifactSourceFileDeletionCommand(
    commandId: string,
    requestDigest: string,
    artifactId: string,
  ): Promise<
    | { ok: true; receipt: ArtifactSourceFileDeletionReceipt }
    | { ok: false; error: RuntimeError }
    | undefined
  > {
    const receipt = await this.#artifactLifecycles
      ?.findArtifactLifecycleCommandReceipt(commandId);
    if (receipt === undefined) return undefined;
    if (
      receipt.commandType !== "set_artifact_lifecycle"
      || receipt.requestDigest !== requestDigest
      || receipt.artifactId !== artifactId
      || !receipt.lifecycle.sourceDeleted
      || receipt.lifecycle.sourceDeletionMode !== "os_trash"
    ) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.command_idempotency_conflict",
          "Command idempotency conflict",
          "validation",
        ),
      };
    }
    return {
      ok: true,
      receipt: ArtifactSourceFileDeletionReceiptSchema.parse({
        commandId,
        artifactId,
        status: "replayed",
        sourceFileDeleted: true,
        deletionMode: "os_trash",
        lifecycle: receipt.lifecycle,
      }),
    };
  }

  async #commitArtifactLifecycle(input: {
    commandId: string;
    requestDigest: string;
    artifactId: string;
    lifecycle: ArtifactLifecycleProjection;
    match: ResolvedArtifactMatch;
    committedAt: string;
  }): Promise<
    | { ok: true; value: ArtifactLifecycleReceipt }
    | { ok: false; error: RuntimeError }
  > {
    if (this.#artifactLifecycles === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.artifact_unavailable",
          "Artifact lifecycle is unavailable",
        ),
      };
    }
    const result = await this.#artifactLifecycles.commitArtifactLifecycle({
      artifactId: input.match.artifact.artifactId,
      ...(input.match.internalTaskId === undefined ? {} : { taskId: input.match.internalTaskId }),
      sourceDigest: input.match.artifact.sourceDigest,
      lifecycle: input.lifecycle,
      commandId: input.commandId,
      requestDigest: input.requestDigest,
      committedAt: input.committedAt,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      value: ArtifactLifecycleReceiptSchema.parse({
        commandId: input.commandId,
        artifactId: input.artifactId,
        status: result.replayed ? "replayed" : "accepted",
        lifecycle: result.value,
      }),
    };
  }

  async #projectSummary(
    task: PersistedTask,
    desktopSessionId: string,
  ): Promise<TaskSummaryProjection | undefined> {
    const [binding, selection, attempts] = await Promise.all([
      this.#tasks.loadSubmitTurnBindingByTaskId(task.head.taskId),
      this.#tasks.loadReadableTaskRuntimeSelection(task.head.taskId),
      this.#tasks.listEffectAttemptsByTask(task.head.taskId),
    ]);
    if (binding === undefined || selection === undefined) return undefined;
    const displayStatus = projectTaskStatusForDesktop(
      task.checkpoint.state,
      attempts,
    );
    return TaskSummaryProjectionSchema.parse({
      taskId: toDesktopId("task", task.head.taskId),
      sessionId: desktopSessionId,
      userMessageId: toDesktopId("message", binding.userMessageId),
      revision: task.head.stateRevision,
      displayStatus,
      createdAt: task.checkpoint.state.createdAt,
      updatedAt: task.head.updatedAt,
      resolvedAgentId: selection.agent.agentDefinitionId,
      resolvedModelId: selection.resolvedModelLock.capabilityId,
      ...(failureSummary(displayStatus) === undefined
        ? {}
        : { failureSummary: failureSummary(displayStatus) }),
    });
  }

  async #syncDeliveries(
    task: PersistedTask,
    desktopSessionId: string,
  ): Promise<void> {
    const binding = await this.#tasks.loadSubmitTurnBindingByTaskId(
      task.head.taskId,
    );
    if (binding === undefined) return;
    let projectedSequence = this.#projectedSequences.get(task.head.taskId);
    if (projectedSequence === undefined) {
      projectedSequence = task.checkpoint.state.createdAt < this.#projectionStartedAt
        ? task.head.lastEventSequence
        : 0;
      this.#projectedSequences.set(task.head.taskId, projectedSequence);
    }
    const events = await this.#tasks.loadEventsAfter(
      task.head.taskId,
      projectedSequence,
    );
    for (const event of events) {
      const draft = event.type === "runtime.command_applied"
        ? projectTaskStatusDelivery(
          event,
          binding.submitTurnCommandId,
          desktopSessionId,
        )
        : event.type.startsWith("runtime.effect_")
          ? projectToolActivityDelivery(
            event,
            binding.submitTurnCommandId,
            desktopSessionId,
          )
          : event.type === "authorization.user_confirmation_requested"
              || event.type === "authorization.user_confirmation_decided"
            ? projectUserConfirmationDelivery(
              event,
              binding.submitTurnCommandId,
              desktopSessionId,
            )
          : undefined;
      if (draft === undefined) {
        this.#projectedSequences.set(task.head.taskId, event.sequence);
        continue;
      }
      const result = await this.#deliveries.appendDelivery(draft);
      if (!result.ok) {
        throw new Error(
          `Desktop Task delivery projection failed: ${result.error.code}: ${result.error.message}`,
        );
      }
      this.#projectedSequences.set(task.head.taskId, event.sequence);
    }
  }
}

export function projectUserConfirmationForDesktop(
  record: PersistedUserConfirmation,
  now: string,
  action?: Action,
): UserConfirmationProjection {
  const expired = record.decision === undefined
    && record.request.expiresAt !== undefined
    && Date.parse(record.request.expiresAt) <= Date.parse(now);
  const status = record.decision?.decision
    ?? (expired ? "expired" as const : "pending" as const);
  const externalTarget = record.request.scope.type === "task_external_scope"
    ? record.request.scope.externalTarget
    : undefined;
  const overwriteSummary = xlsxOverwriteConfirmationSummary(action);
  return UserConfirmationProjectionSchema.parse({
    confirmationId: toDesktopId(
      "confirmation",
      record.request.confirmationId,
    ),
    taskId: toDesktopId("task", record.request.scope.taskId),
    requestDigest: sha256CanonicalJson(
      JsonValueSchema.parse(record.request),
    ),
    status,
    reasonSummary: overwriteSummary?.reasonSummary ?? record.request.displaySummary,
    riskSummary: overwriteSummary?.riskSummary ?? (externalTarget === undefined
      ? "This exact Tool action may create a high-impact side effect."
      : "Task data will be sent outside the local runtime."),
    targetSummary: overwriteSummary?.targetSummary
      ?? externalTarget
      ?? "The exact locked Tool action",
    consequenceSummary: record.decision?.decision === "rejected"
      ? "The Tool action will not run."
      : overwriteSummary?.consequenceSummary
        ?? "Confirming permits only this exact locked request to continue.",
    requestedAt: record.request.requestedAt,
    ...(record.request.expiresAt === undefined
      ? {}
      : { expiresAt: record.request.expiresAt }),
    ...(record.decision === undefined
      ? {}
      : { decidedAt: record.decision.decidedAt }),
  });
}

function actionForConfirmation(
  state: TaskRunState,
  record: PersistedUserConfirmation,
): Action | undefined {
  const scope = record.request.scope;
  if (scope.type !== "single_action") return undefined;
  const run = state.runs.find((candidate) => candidate.runId === scope.runId);
  const step = run?.steps.find((candidate) => candidate.stepId === scope.stepId);
  if (step?.action.actionId !== scope.actionId) return undefined;
  return step.action;
}

function xlsxOverwriteConfirmationSummary(action: Action | undefined): {
  reasonSummary: string;
  riskSummary: string;
  targetSummary: string;
  consequenceSummary: string;
} | undefined {
  if (action?.kind !== "tool.document.xlsx.write") return undefined;
  const payload = action.payload;
  if (payload.mode !== "overwrite_existing") return undefined;
  const relativePath = typeof payload.relativePath === "string"
    && payload.relativePath.length > 0
    && payload.relativePath.length <= 240
    ? payload.relativePath
    : "selected XLSX file";
  return {
    reasonSummary: "Overwrite one existing XLSX file.",
    riskSummary: "Destructive file change.",
    targetSummary: relativePath,
    consequenceSummary: "This replaces the existing workbook. RoboThree cannot undo this operation.",
  };
}

export function projectTaskStatusForDesktop(
  state: TaskRunState,
  attempts: readonly EffectAttempt[],
): TaskDisplayStatus {
  if (attempts.some((attempt) => attempt.status === "uncertain")) {
    return "manual_attention";
  }
  switch (state.status) {
    case "created": return "preparing";
    case "running": return "running";
    case "completed": return "completed";
    case "failed": return "failed";
    case "cancelled": return "cancelled";
    case "timed_out": return "timed_out";
    case "waiting": {
      const step = activeStep(state);
      if (step?.wait?.reason === "user_confirmation") {
        return "waiting_confirmation";
      }
      if (step?.wait?.reason === "user_input") return "waiting_input";
      return "recovering";
    }
  }
}

function projectRunStatus(
  run: TaskRunState["runs"][number],
  attempts: readonly EffectAttempt[],
): TaskDisplayStatus {
  if (
    attempts.some((attempt) =>
      attempt.runId === run.runId && attempt.status === "uncertain")
  ) return "manual_attention";
  switch (run.status) {
    case "running": return "running";
    case "waiting": {
      const step = run.steps.find((item) => item.stepId === run.activeStepId);
      if (step?.wait?.reason === "user_confirmation") {
        return "waiting_confirmation";
      }
      if (step?.wait?.reason === "user_input") return "waiting_input";
      return "recovering";
    }
    case "succeeded": return "completed";
    case "failed": return "failed";
    case "cancelled": return "cancelled";
    case "timed_out": return "timed_out";
  }
}

function projectStep(
  step: TaskRunState["runs"][number]["steps"][number],
  attempts: readonly EffectAttempt[],
): TaskStepProjection {
  const uncertain = attempts.some((attempt) =>
    attempt.stepId === step.stepId && attempt.status === "uncertain");
  const displayStatus: TaskDisplayStatus = uncertain
    ? "manual_attention"
    : step.status === "running"
      ? "running"
      : step.status === "waiting"
        ? step.wait?.reason === "user_confirmation"
          ? "waiting_confirmation"
          : step.wait?.reason === "user_input"
            ? "waiting_input"
            : "recovering"
        : step.status === "succeeded"
          ? "completed"
          : step.status === "cancelled"
            ? "cancelled"
            : step.status === "timed_out"
              ? "timed_out"
              : "failed";
  return {
    stepId: toDesktopId("step", step.stepId),
    sequence: step.sequence,
    displayStatus,
    actionType: step.action.kind,
    actionSummary: `Action ${step.action.kind}`,
    ...(step.observation === undefined
      ? {}
      : { observationSummary: `Action ${step.observation.outcome}` }),
    startedAt: step.startedAt,
    updatedAt: step.updatedAt,
    ...(step.endedAt === undefined ? {} : { endedAt: step.endedAt }),
  };
}

export function projectToolActivityForDesktop(
  attempt: EffectAttempt,
  state: TaskRunState,
): ToolActivityProjection {
  const step = state.runs
    .flatMap((run) => run.steps)
    .find((candidate) => candidate.stepId === attempt.stepId);
  const status = attempt.status === "prepared"
    ? "preparing"
    : attempt.status === "dispatched"
      ? "running"
      : attempt.status === "succeeded"
        ? "completed"
        : attempt.status;
  return ToolActivityProjectionSchema.parse({
    activityId: toDesktopId("activity", attempt.effectAttemptId),
    taskId: toDesktopId("task", attempt.taskId),
    toolName: attempt.executorCapability,
    operationType: step?.action.kind ?? "tool_action",
    status,
    safetySummary: "Tool arguments and results are hidden.",
    statusSummary: activityStatusSummary(status),
    startedAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    ...(["completed", "failed", "cancelled", "timed_out", "uncertain"].includes(status)
      ? { endedAt: attempt.updatedAt }
      : {}),
  });
}

export type ResolvedArtifactFileSource = Readonly<{
  artifactId: string;
  taskId?: string;
  displayName: string;
  relativePath: string;
  workspaceGrantId: string;
  rootRealPath: string;
}>;

export type PreparedArtifactSourceFileDeletion = Readonly<{
  commandId: string;
  requestDigest: string;
  artifactId: string;
  taskId?: string;
  displayName: string;
  relativePath: string;
  workspaceGrantId: string;
  rootRealPath: string;
  expectedArtifactRevision: number;
  expectedConfirmationText: string;
}>;

type ResolvedArtifactMatch = Readonly<{
  artifact: ResolvedArtifactProjection;
  task?: PersistedTask;
  step?: TaskRunState["runs"][number]["steps"][number];
  internalTaskId?: string;
  workspaceGrantId?: string;
}>;

type ResolvedArtifactProjection = Readonly<{
  artifactId: string;
  taskId?: string | undefined;
  sourceKind: "tool_observation" | "workspace_file" | "generated_preview";
  sourceId: string;
  sourceDigest: string;
  displayName: string;
  kind: ArtifactProjection["kind"];
  mediaType: string;
  relativePath?: string | undefined;
  byteSize?: number | undefined;
  createdAt: string;
  previewState: ArtifactProjection["previewState"];
  lifecycle: ArtifactLifecycleProjection;
  metadata: ArtifactProjection["metadata"];
}>;

export type RegisterManualArtifactInput = Readonly<{
  command: RegisterWorkspaceArtifactCommand;
  workspaceGrantId: string;
  relativePath: string;
  fileSha256: string;
  byteSize: number;
  mediaType: string;
  displayName?: string;
  createdAt?: string;
}>;

function projectArtifactForDesktop(input: ReturnType<
  typeof projectArtifactIndexForTask
>[number], lifecycle?: ArtifactLifecycleProjection): ArtifactProjection {
  return {
    artifactId: input.artifactId,
    taskId: input.taskId,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceDigest: input.sourceDigest,
    displayName: input.displayName,
    kind: input.kind,
    mediaType: input.mediaType,
    ...(input.relativePath === undefined ? {} : { relativePath: input.relativePath }),
    ...(input.byteSize === undefined ? {} : { byteSize: input.byteSize }),
    createdAt: input.createdAt,
    previewState: input.previewState,
    lifecycle: lifecycle ?? {
      revision: 0,
      pinned: false,
      dismissed: false,
      deleted: false,
      sourceDeleted: false,
    },
    metadata: input.metadata,
  };
}

function projectManualArtifactAsResolvedArtifact(
  input: ManualArtifactRegistrationRecord,
  lifecycle?: ArtifactLifecycleProjection,
): ResolvedArtifactProjection {
  return {
    artifactId: input.artifactId,
    sourceKind: "workspace_file",
    sourceId: input.sourceId,
    sourceDigest: input.sourceDigest,
    displayName: input.displayName,
    kind: input.kind,
    mediaType: input.mediaType,
    relativePath: input.relativePath,
    byteSize: input.byteSize,
    createdAt: input.createdAt,
    previewState: input.previewState,
    lifecycle: lifecycle ?? defaultArtifactLifecycle(),
    metadata: input.metadata,
  };
}

function projectArtifactCatalogItemFromTask(
  input: ReturnType<typeof projectArtifactIndexForTask>[number],
  lifecycle?: ArtifactLifecycleProjection,
): ArtifactCatalogItemProjection {
  return ArtifactCatalogItemProjectionSchema.parse({
    artifactId: input.artifactId,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceDigest: input.sourceDigest,
    displayName: input.displayName,
    kind: input.kind,
    mediaType: input.mediaType,
    ...(input.relativePath === undefined ? {} : { relativePath: input.relativePath }),
    ...(input.byteSize === undefined ? {} : { byteSize: input.byteSize }),
    createdAt: input.createdAt,
    previewState: input.previewState,
    lifecycle: lifecycle ?? defaultArtifactLifecycle(),
    originTaskId: input.taskId,
    metadata: input.metadata,
  });
}

function projectManualArtifactCatalogItem(
  input: ManualArtifactRegistrationRecord,
  lifecycle?: ArtifactLifecycleProjection,
): ArtifactCatalogItemProjection {
  return ArtifactCatalogItemProjectionSchema.parse({
    artifactId: input.artifactId,
    sourceKind: "workspace_file",
    sourceId: input.sourceId,
    sourceDigest: input.sourceDigest,
    displayName: input.displayName,
    kind: input.kind,
    mediaType: input.mediaType,
    relativePath: input.relativePath,
    byteSize: input.byteSize,
    createdAt: input.createdAt,
    previewState: input.previewState,
    lifecycle: lifecycle ?? defaultArtifactLifecycle(),
    metadata: input.metadata,
  });
}

function defaultArtifactLifecycle(): ArtifactLifecycleProjection {
  return {
    revision: 0,
    pinned: false,
    dismissed: false,
    deleted: false,
    sourceDeleted: false,
  };
}

function manualArtifactRegistrationRecord(input: {
  workspaceGrantId: string;
  relativePath: string;
  fileSha256: string;
  byteSize: number;
  mediaType: string;
  createdAt: string;
  displayName?: string;
}): ManualArtifactRegistrationRecord {
  if (!/^[0-9a-f]{64}$/u.test(input.fileSha256)) {
    throw new Error("manual artifact fileSha256 must be lowercase SHA-256 hex");
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize < 0) {
    throw new Error("manual artifact byteSize must be nonnegative");
  }
  const registrationSchema = "robothree.manual-artifact-registration/v1alpha1";
  const sourceId = sha256CanonicalJson(JsonValueSchema.parse({
    workspaceGrantId: input.workspaceGrantId,
    relativePath: input.relativePath,
    registrationKind: "manual_workspace_file",
  }));
  const sourceDigest = sha256CanonicalJson(JsonValueSchema.parse({
    fileSha256: input.fileSha256,
    byteSize: input.byteSize,
    mediaType: input.mediaType,
    registrationSchema,
  }));
  const artifactIdDigest = sha256CanonicalJson(JsonValueSchema.parse({
    sourceKind: "workspace_file",
    sourceId,
    sourceDigest,
  }));
  const record: ManualArtifactRegistrationRecord = {
    artifactId: `artifact:${artifactIdDigest.slice("sha256:".length)}`,
    workspaceGrantId: input.workspaceGrantId,
    relativePath: input.relativePath,
    sourceId,
    sourceDigest,
    fileSha256: input.fileSha256,
    byteSize: input.byteSize,
    displayName: boundedDisplayName(input.displayName ?? basename(input.relativePath)),
    kind: kindForManualMedia(input.mediaType, input.relativePath),
    mediaType: input.mediaType,
    createdAt: input.createdAt,
    previewState: previewStateForManualMedia(input.mediaType, input.relativePath),
    metadata: JsonObjectSchema.parse({
      registrationKind: "manual_workspace_file",
      pathAllowed: true,
      previewReason: previewReasonForManualMedia(input.mediaType, input.relativePath),
    }),
  };
  projectManualArtifactCatalogItem(record);
  return record;
}

function previewStateForManualMedia(
  mediaType: string,
  relativePath: string,
): ManualArtifactRegistrationRecord["previewState"] {
  return isManualPreviewMedia(mediaType, relativePath) ? "available" : "unsupported";
}

function previewReasonForManualMedia(
  mediaType: string,
  relativePath: string,
): string {
  return isManualPreviewMedia(mediaType, relativePath)
    ? "Manual text and HTML preview is available through Desktop Main."
    : "Manual file preview is not supported for this file type.";
}

function isManualPreviewMedia(mediaType: string, relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return mediaType === "text/plain"
    || mediaType === "text/markdown"
    || mediaType === "text/html"
    || lower.endsWith(".txt")
    || lower.endsWith(".md")
    || lower.endsWith(".markdown")
    || lower.endsWith(".html")
    || lower.endsWith(".htm");
}

function kindForManualMedia(
  mediaType: string,
  relativePath: string,
): ManualArtifactRegistrationRecord["kind"] {
  const lower = relativePath.toLowerCase();
  if (
    mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || lower.endsWith(".xlsx")
  ) return "spreadsheet";
  if (
    mediaType === "application/pdf"
    || mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || lower.endsWith(".pdf")
    || lower.endsWith(".docx")
  ) return "document";
  if (mediaType === "text/markdown" || lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "markdown";
  }
  if (mediaType === "text/html" || lower.endsWith(".html") || lower.endsWith(".htm")) {
    return "html";
  }
  if (mediaType.startsWith("text/") || lower.endsWith(".txt")) return "text";
  if (mediaType.startsWith("image/")) return "image";
  return "unknown";
}

function basename(relativePath: string): string {
  const parts = relativePath.split("/");
  return parts.at(-1) ?? relativePath;
}

function boundedDisplayName(value: string): string {
  const normalized = value.normalize("NFC").trim();
  const scalars = Array.from(normalized.length === 0 ? "Artifact" : normalized);
  return scalars.slice(0, 160).join("");
}

function isSafeWorkspaceRelativePath(value: string): boolean {
  return value.length > 0
    && value.length <= 1024
    && !value.includes("\0")
    && !value.includes("\\")
    && !value.startsWith("/")
    && !value.startsWith("//")
    && !/^[a-zA-Z]:/u.test(value)
    && value.split("/").every((segment) =>
      segment.length > 0 && segment !== "." && segment !== "..");
}

function artifactRecordCommandDigest(
  command: DeleteArtifactRecordCommand | RestoreArtifactRecordCommand,
): string {
  return sha256CanonicalJson(JsonValueSchema.parse({
    type: command.type,
    artifactId: command.artifactId,
    expectedArtifactRevision: command.expectedArtifactRevision,
    ...("reasonSummary" in command && command.reasonSummary !== undefined
      ? { reasonSummary: command.reasonSummary }
      : {}),
  }));
}

function artifactSourceDeleteCommandDigest(
  command: DeleteArtifactSourceFileCommand,
): string {
  return sha256CanonicalJson(JsonValueSchema.parse({
    type: command.type,
    artifactId: command.artifactId,
    expectedArtifactRevision: command.expectedArtifactRevision,
    confirmationText: normalizeConfirmation(command.confirmationText),
  }));
}

function artifactSourceDeleteConfirmation(displayName: string): string {
  return normalizeConfirmation(`DELETE ${displayName}`);
}

function normalizeConfirmation(value: string): string {
  return value.normalize("NFC").trim();
}

function actionPayloadRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function projectTaskStatusDelivery(
  event: Awaited<ReturnType<TaskPersistence["loadEventsAfter"]>>[number],
  submitTurnCommandId: string,
  desktopSessionId: string,
): DesktopDeliveryDraft | undefined {
  const command = TaskCommandSchema.safeParse(event.payload.command);
  const transition = TaskTransitionSchema.safeParse(event.payload.transition);
  if (!command.success || !transition.success) return undefined;
  const displayStatus = transition.data.taskStatusAfter === "created"
    ? "preparing"
    : transition.data.taskStatusAfter === "running"
      ? "running"
      : transition.data.taskStatusAfter === "completed"
        ? "completed"
        : transition.data.taskStatusAfter === "failed"
          ? "failed"
          : transition.data.taskStatusAfter === "cancelled"
            ? "cancelled"
            : transition.data.taskStatusAfter === "timed_out"
              ? "timed_out"
              : command.data.type === "wait_step"
                ? command.data.reason === "user_confirmation"
                  ? "waiting_confirmation"
                  : command.data.reason === "user_input"
                    ? "waiting_input"
                    : "recovering"
                : "recovering";
  return {
    schemaVersion: "v1alpha1",
    deliveryId: event.eventId,
    submitTurnCommandId,
    type: "task.status_changed",
    sessionId: desktopSessionId,
    taskId: toDesktopId("task", event.taskId),
    taskRevision: transition.data.revision,
    taskDisplayStatus: displayStatus,
    createdAt: event.occurredAt,
  };
}

function projectToolActivityDelivery(
  event: Awaited<ReturnType<TaskPersistence["loadEventsAfter"]>>[number],
  submitTurnCommandId: string,
  desktopSessionId: string,
): DesktopDeliveryDraft {
  return {
    schemaVersion: "v1alpha1",
    deliveryId: event.eventId,
    submitTurnCommandId,
    type: "tool.activity_changed",
    sessionId: desktopSessionId,
    taskId: toDesktopId("task", event.taskId),
    activityId: toDesktopId("activity", event.causationId),
    createdAt: event.occurredAt,
  };
}

function projectUserConfirmationDelivery(
  event: Awaited<ReturnType<TaskPersistence["loadEventsAfter"]>>[number],
  submitTurnCommandId: string,
  desktopSessionId: string,
): DesktopDeliveryDraft | undefined {
  const request = event.payload.request;
  if (
    typeof request !== "object"
    || request === null
    || !("confirmationId" in request)
    || typeof request.confirmationId !== "string"
  ) return undefined;
  return {
    schemaVersion: "v1alpha1",
    deliveryId: event.eventId,
    submitTurnCommandId,
    type: "user_confirmation.changed",
    sessionId: desktopSessionId,
    taskId: toDesktopId("task", event.taskId),
    confirmationId: toDesktopId("confirmation", request.confirmationId),
    createdAt: event.occurredAt,
  };
}

function activeStep(state: TaskRunState) {
  const run = state.runs.find((candidate) =>
    candidate.runId === state.activeRunId);
  return run?.steps.find((candidate) =>
    candidate.stepId === run.activeStepId);
}

function failureSummary(status: TaskDisplayStatus): string | undefined {
  switch (status) {
    case "failed": return "Task failed.";
    case "cancelled": return "Task was cancelled.";
    case "timed_out": return "Task timed out.";
    case "manual_attention": return "Task needs manual attention.";
    default: return undefined;
  }
}

function activityStatusSummary(
  status: ToolActivityProjection["status"],
): string {
  switch (status) {
    case "uncertain": return "External result could not be confirmed.";
    case "failed": return "Tool action failed.";
    case "cancelled": return "Tool action was cancelled.";
    case "completed": return "Tool action completed.";
    case "running": return "Tool action is running.";
    case "preparing": return "Tool action is preparing.";
    case "waiting_confirmation": return "Tool action is waiting for confirmation.";
    case "timed_out": return "Tool action timed out.";
  }
}

function toDesktopId(namespace: string, internalId: string): string {
  return `${namespace}:${internalId}`;
}

function fromDesktopId(value: string, namespace: string): string | undefined {
  const prefix = `${namespace}:`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : undefined;
}
