import { DatabaseSync } from "node:sqlite";

import {
  ArtifactCatalogItemProjectionSchema,
  ArtifactLifecycleProjectionSchema,
  JsonObjectSchema,
  SessionSummarySchema,
  WorkspaceGrantProjectionSchema,
} from "@robothree/contracts";
import type {
  ArtifactLifecycleProjection,
  ArtifactCatalogItemProjection,
  ComponentHealth,
  RuntimeError,
  SessionSummary,
  WorkspaceGrantProjection,
} from "@robothree/contracts";

import type { Clock } from "../../ports/clock.js";
import type {
  ArtifactLifecyclePersistence,
  ArtifactLifecycleRecord,
  DesktopFoundationPersistenceFaultInjector,
  DesktopFoundationReceipt,
  DesktopFoundationWriteResult,
  DesktopSessionCreateIntent,
  DesktopSessionMetadataPersistence,
  DesktopSessionRecord,
  ManualArtifactRegistrationPersistence,
  ManualArtifactRegistrationRecord,
  WorkspaceGrantPersistence,
  WorkspaceGrantRecord,
} from "../../ports/desktop-foundation-persistence.js";
import { configureSqlite, migrateAndPreflight } from "./schema-preflight.js";

export class SqliteDesktopFoundationPersistence
implements
  WorkspaceGrantPersistence,
  DesktopSessionMetadataPersistence,
  ArtifactLifecyclePersistence,
  ManualArtifactRegistrationPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.desktop-foundation.sqlite";
  readonly #databasePath: string;
  readonly #clock: Clock;
  readonly #faultInjector: DesktopFoundationPersistenceFaultInjector | undefined;
  #database: DatabaseSync | undefined;
  #startupError: string | undefined;

  constructor(input: {
    databasePath: string;
    clock: Clock;
    faultInjector?: DesktopFoundationPersistenceFaultInjector;
  }) {
    this.#databasePath = input.databasePath;
    this.#clock = input.clock;
    this.#faultInjector = input.faultInjector;
  }

  async start(): Promise<void> {
    if (this.#database !== undefined) return;
    const database = new DatabaseSync(this.#databasePath, {
      allowExtension: false,
    });
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
      ...(this.#startupError === undefined
        ? {}
        : { details: { startupError: this.#startupError } }),
    };
  }

  async findWorkspaceCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined> {
    return selectReceipt(this.#requireDatabase(), commandId);
  }

  async findSessionMetadataCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined> {
    return selectReceipt(this.#requireDatabase(), commandId);
  }

  async findArtifactLifecycleCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined> {
    return selectReceipt(this.#requireDatabase(), commandId);
  }

  async findManualArtifactRegistrationCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined> {
    return selectReceipt(this.#requireDatabase(), commandId);
  }

  async loadWorkspaceGrant(
    workspaceGrantId: string,
  ): Promise<WorkspaceGrantRecord | undefined> {
    return selectWorkspaceGrant(this.#requireDatabase(), workspaceGrantId);
  }

  async listWorkspaceGrants(): Promise<readonly WorkspaceGrantRecord[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT record_json FROM desktop_workspace_grants
      ORDER BY created_at, workspace_grant_id
    `).all() as Record<string, unknown>[];
    return rows.map((row) => parseWorkspaceRecord(requireString(row.record_json)));
  }

  async commitWorkspaceGrantCreation(input: {
    record: WorkspaceGrantRecord;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<WorkspaceGrantProjection>> {
    try {
      const record = parseWorkspaceRecord(JSON.stringify(input.record));
      const projection = toWorkspaceProjection(record);
      const result = withImmediateTransaction(this.#requireDatabase(), () => {
        const replay = replayWorkspace(
          this.#requireDatabase(),
          input.commandId,
          input.requestDigest,
          "create_workspace_grant",
        );
        if (replay !== undefined) return replay;
        if (selectWorkspaceGrant(this.#requireDatabase(), record.workspaceGrantId) !== undefined) {
          return failure("desktop.workspace_conflict", "workspaceGrantId already exists");
        }
        this.#requireDatabase().prepare(`
          INSERT INTO desktop_workspace_grants (
            workspace_grant_id, status, created_at, record_json
          ) VALUES (?, ?, ?, ?)
        `).run(
          record.workspaceGrantId,
          record.status,
          record.createdAt,
          JSON.stringify(record),
        );
        insertReceipt(this.#requireDatabase(), {
          commandId: input.commandId,
          commandType: "create_workspace_grant",
          requestDigest: input.requestDigest,
          resourceId: record.workspaceGrantId,
          committedAt: input.committedAt,
          projection,
        });
        return { ok: true, replayed: false, value: projection } as const;
      });
      this.#faultInjector?.("workspace.create.after_commit");
      return result;
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async commitWorkspaceGrantRevocation(input: {
    workspaceGrantId: string;
    commandId: string;
    requestDigest: string;
    revokedAt: string;
  }): Promise<DesktopFoundationWriteResult<WorkspaceGrantProjection>> {
    try {
      const result = withImmediateTransaction(this.#requireDatabase(), () => {
        const replay = replayWorkspace(
          this.#requireDatabase(),
          input.commandId,
          input.requestDigest,
          "revoke_workspace_grant",
        );
        if (replay !== undefined) return replay;
        const current = selectWorkspaceGrant(
          this.#requireDatabase(),
          input.workspaceGrantId,
        );
        if (current === undefined) {
          return failure("desktop.workspace_not_found", "workspace grant does not exist");
        }
        if (current.status === "revoked") {
          return failure("desktop.workspace_revoked", "workspace grant is already revoked");
        }
        const next = parseWorkspaceRecord(JSON.stringify({
          ...current,
          status: "revoked",
          revokedAt: input.revokedAt,
        }));
        const projection = toWorkspaceProjection(next);
        this.#requireDatabase().prepare(`
          UPDATE desktop_workspace_grants
          SET status = 'revoked', record_json = ?
          WHERE workspace_grant_id = ? AND status = 'active'
        `).run(JSON.stringify(next), input.workspaceGrantId);
        insertReceipt(this.#requireDatabase(), {
          commandId: input.commandId,
          commandType: "revoke_workspace_grant",
          requestDigest: input.requestDigest,
          resourceId: input.workspaceGrantId,
          committedAt: input.revokedAt,
          projection,
        });
        return { ok: true, replayed: false, value: projection } as const;
      });
      this.#faultInjector?.("workspace.revoke.after_commit");
      return result;
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async loadDesktopSession(
    desktopSessionId: string,
  ): Promise<DesktopSessionRecord | undefined> {
    return selectDesktopSession(this.#requireDatabase(), desktopSessionId);
  }

  async listDesktopSessions(
    includeTombstoned = false,
  ): Promise<readonly DesktopSessionRecord[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT record_json FROM desktop_session_metadata
      WHERE ? = 1 OR tombstoned = 0
      ORDER BY updated_at DESC, desktop_session_id
    `).all(includeTombstoned ? 1 : 0) as Record<string, unknown>[];
    return rows.map((row) => parseSessionRecord(requireString(row.record_json)));
  }

  async prepareDesktopSessionCreation(
    intent: DesktopSessionCreateIntent,
  ): Promise<DesktopFoundationWriteResult<DesktopSessionCreateIntent>> {
    try {
      return withImmediateTransaction(this.#requireDatabase(), () => {
        const existing = selectSessionCreateIntent(
          this.#requireDatabase(),
          intent.commandId,
        );
        if (existing !== undefined) {
          return existing.requestDigest === intent.requestDigest
            && existing.internalSessionId === intent.internalSessionId
            && existing.desktopSessionId === intent.desktopSessionId
            ? { ok: true, replayed: true, value: existing }
            : idempotencyConflict();
        }
        this.#requireDatabase().prepare(`
          INSERT INTO desktop_session_create_intents (
            command_id, request_digest, internal_session_id,
            desktop_session_id, prepared_at, intent_json
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          intent.commandId,
          intent.requestDigest,
          intent.internalSessionId,
          intent.desktopSessionId,
          intent.preparedAt,
          JSON.stringify(intent),
        );
        return { ok: true, replayed: false, value: intent };
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async commitDesktopSessionCreation(input: {
    record: DesktopSessionRecord;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<SessionSummary>> {
    try {
      const record = parseSessionRecord(JSON.stringify(input.record));
      const result = withImmediateTransaction(this.#requireDatabase(), () => {
        const replay = replaySession(
          this.#requireDatabase(),
          input.commandId,
          input.requestDigest,
          "create_session",
        );
        if (replay !== undefined) return replay;
        const intent = selectSessionCreateIntent(
          this.#requireDatabase(),
          input.commandId,
        );
        if (
          intent === undefined
          || intent.requestDigest !== input.requestDigest
          || intent.internalSessionId !== record.internalSessionId
          || intent.desktopSessionId !== record.summary.sessionId
        ) {
          return failure(
            "desktop.session_intent_conflict",
            "session create intent does not match metadata",
          );
        }
        if (selectDesktopSession(this.#requireDatabase(), record.summary.sessionId) !== undefined) {
          return failure("desktop.session_conflict", "session metadata already exists");
        }
        const head = this.#requireDatabase().prepare(
          "SELECT 1 AS present FROM session_heads WHERE session_id = ?",
        ).get(record.internalSessionId);
        if (head === undefined) {
          return failure(
            "desktop.session_head_not_found",
            "session metadata requires an existing SessionHead",
          );
        }
        this.#requireDatabase().prepare(`
          INSERT INTO desktop_session_metadata (
            desktop_session_id, internal_session_id, revision, tombstoned,
            updated_at, record_json
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          record.summary.sessionId,
          record.internalSessionId,
          record.summary.revision,
          record.summary.tombstoned ? 1 : 0,
          record.summary.updatedAt,
          JSON.stringify(record),
        );
        insertReceipt(this.#requireDatabase(), {
          commandId: input.commandId,
          commandType: "create_session",
          requestDigest: input.requestDigest,
          resourceId: record.summary.sessionId,
          committedAt: input.committedAt,
          summary: record.summary,
        });
        return { ok: true, replayed: false, value: record.summary } as const;
      });
      this.#faultInjector?.("session.metadata.create.after_commit");
      return result;
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async commitDesktopSessionRename(input: {
    desktopSessionId: string;
    title: string;
    expectedRevision: number;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<SessionSummary>> {
    return this.#mutateSession(
      input,
      "rename_session",
      "session.metadata.rename.after_commit",
      (current) => ({
        ...current,
        revision: current.revision + 1,
        title: input.title,
        updatedAt: input.committedAt,
      }),
    );
  }

  async commitDesktopSessionTombstone(input: {
    desktopSessionId: string;
    expectedRevision: number;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<SessionSummary>> {
    return this.#mutateSession(
      input,
      "delete_session",
      "session.metadata.tombstone.after_commit",
      (current) => ({
        ...current,
        revision: current.revision + 1,
        tombstoned: true,
        updatedAt: input.committedAt,
      }),
    );
  }

  async loadArtifactLifecycle(
    artifactId: string,
  ): Promise<ArtifactLifecycleRecord | undefined> {
    return selectArtifactLifecycle(this.#requireDatabase(), artifactId);
  }

  async listArtifactLifecycleByTask(
    taskId: string,
  ): Promise<readonly ArtifactLifecycleRecord[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT record_json FROM artifact_lifecycle_records
      WHERE task_id = ?
      ORDER BY artifact_id
    `).all(taskId) as Record<string, unknown>[];
    return rows.map((row) => parseArtifactLifecycleRecord(requireString(row.record_json)));
  }

  async commitArtifactLifecycle(input: {
    artifactId: string;
    taskId?: string;
    sourceDigest: string;
    lifecycle: ArtifactLifecycleProjection;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<ArtifactLifecycleProjection>> {
    try {
      const lifecycle = ArtifactLifecycleProjectionSchema.parse(input.lifecycle);
      const result = withImmediateTransaction(this.#requireDatabase(), () => {
        const replay = replayArtifactLifecycle(
          this.#requireDatabase(),
          input.commandId,
          input.requestDigest,
        );
        if (replay !== undefined) return replay;
        const current = selectArtifactLifecycle(this.#requireDatabase(), input.artifactId);
        if (
          current !== undefined
          && (
            current.taskId !== input.taskId
            || current.sourceDigest !== input.sourceDigest
          )
        ) return failure("desktop.artifact_conflict", "artifact lifecycle source changed");
        const record: ArtifactLifecycleRecord = {
          artifactId: input.artifactId,
          ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
          sourceDigest: input.sourceDigest,
          lifecycle,
        };
        this.#requireDatabase().prepare(`
          INSERT INTO artifact_lifecycle_records (
            artifact_id, task_id, source_digest, pinned, dismissed,
            updated_at, record_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(artifact_id) DO UPDATE SET
            task_id = excluded.task_id,
            source_digest = excluded.source_digest,
            pinned = excluded.pinned,
            dismissed = excluded.dismissed,
            updated_at = excluded.updated_at,
            record_json = excluded.record_json
        `).run(
          input.artifactId,
          input.taskId ?? null,
          input.sourceDigest,
          lifecycle.pinned ? 1 : 0,
          lifecycle.dismissed ? 1 : 0,
          lifecycle.updatedAt ?? input.committedAt,
          JSON.stringify(record),
        );
        insertReceipt(this.#requireDatabase(), {
          commandId: input.commandId,
          commandType: "set_artifact_lifecycle",
          requestDigest: input.requestDigest,
          resourceId: input.artifactId,
          committedAt: input.committedAt,
          artifactId: input.artifactId,
          lifecycle,
        });
        return { ok: true, replayed: false, value: lifecycle } as const;
      });
      return result;
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async loadManualArtifactRegistration(
    artifactId: string,
  ): Promise<ManualArtifactRegistrationRecord | undefined> {
    return selectManualArtifactRegistration(this.#requireDatabase(), artifactId);
  }

  async findManualArtifactRegistrationByWorkspacePath(input: {
    workspaceGrantId: string;
    relativePath: string;
  }): Promise<ManualArtifactRegistrationRecord | undefined> {
    const row = this.#requireDatabase().prepare(`
      SELECT artifact_id FROM manual_artifact_registrations
      WHERE workspace_grant_id = ? AND relative_path = ?
    `).get(input.workspaceGrantId, input.relativePath) as Record<string, unknown> | undefined;
    if (row === undefined) return undefined;
    return selectManualArtifactRegistration(this.#requireDatabase(), requireString(row.artifact_id));
  }

  async listManualArtifactRegistrations(): Promise<readonly ManualArtifactRegistrationRecord[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT record_json FROM manual_artifact_registrations
      ORDER BY created_at DESC, artifact_id
    `).all() as Record<string, unknown>[];
    return rows.map((row) => parseManualArtifactRegistrationRecord(requireString(row.record_json)));
  }

  async commitManualArtifactRegistration(input: {
    record: ManualArtifactRegistrationRecord;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<ArtifactCatalogItemProjection>> {
    try {
      const record = parseManualArtifactRegistrationRecord(JSON.stringify(input.record));
      const projection = manualArtifactProjection(record);
      return withImmediateTransaction(this.#requireDatabase(), () => {
        const replay = replayManualArtifactRegistration(
          this.#requireDatabase(),
          input.commandId,
          input.requestDigest,
        );
        if (replay !== undefined) return replay;
        const samePath = selectManualArtifactRegistrationByWorkspacePath(
          this.#requireDatabase(),
          record.workspaceGrantId,
          record.relativePath,
        );
        if (samePath !== undefined) {
          if (samePath.sourceDigest !== record.sourceDigest) {
            return failure(
              "desktop.artifact_registration_conflict",
              "manual artifact source changed",
            );
          }
          const existing = manualArtifactProjection(samePath);
          insertReceipt(this.#requireDatabase(), {
            commandId: input.commandId,
            commandType: "register_workspace_artifact",
            requestDigest: input.requestDigest,
            resourceId: samePath.artifactId,
            committedAt: input.committedAt,
            artifact: existing,
          });
          return { ok: true, replayed: false, value: existing } as const;
        }
        if (selectManualArtifactRegistration(this.#requireDatabase(), record.artifactId) !== undefined) {
          return failure(
            "desktop.artifact_registration_conflict",
            "manual artifact already exists",
          );
        }
        this.#requireDatabase().prepare(`
          INSERT INTO manual_artifact_registrations (
            artifact_id, workspace_grant_id, relative_path, source_digest,
            file_sha256, byte_size, media_type, created_at, record_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          record.artifactId,
          record.workspaceGrantId,
          record.relativePath,
          record.sourceDigest,
          record.fileSha256,
          record.byteSize,
          record.mediaType,
          record.createdAt,
          JSON.stringify(record),
        );
        insertReceipt(this.#requireDatabase(), {
          commandId: input.commandId,
          commandType: "register_workspace_artifact",
          requestDigest: input.requestDigest,
          resourceId: record.artifactId,
          committedAt: input.committedAt,
          artifact: projection,
        });
        return { ok: true, replayed: false, value: projection } as const;
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  #mutateSession(
    input: {
      desktopSessionId: string;
      expectedRevision: number;
      commandId: string;
      requestDigest: string;
      committedAt: string;
    },
    commandType: "rename_session" | "delete_session",
    faultPoint:
      | "session.metadata.rename.after_commit"
      | "session.metadata.tombstone.after_commit",
    mutate: (summary: SessionSummary) => SessionSummary,
  ): Promise<DesktopFoundationWriteResult<SessionSummary>> {
    try {
      const result = withImmediateTransaction(this.#requireDatabase(), () => {
        const replay = replaySession(
          this.#requireDatabase(),
          input.commandId,
          input.requestDigest,
          commandType,
        );
        if (replay !== undefined) return replay;
        const current = selectDesktopSession(
          this.#requireDatabase(),
          input.desktopSessionId,
        );
        if (current === undefined) {
          return failure("desktop.session_not_found", "session metadata does not exist");
        }
        if (current.summary.tombstoned) {
          return failure("desktop.session_tombstoned", "session is tombstoned");
        }
        if (current.summary.revision !== input.expectedRevision) {
          return failure("desktop.session_revision_conflict", "session revision changed");
        }
        const summary = SessionSummarySchema.parse(mutate(current.summary));
        const next: DesktopSessionRecord = { ...current, summary };
        const update = this.#requireDatabase().prepare(`
          UPDATE desktop_session_metadata
          SET revision = ?, tombstoned = ?, updated_at = ?, record_json = ?
          WHERE desktop_session_id = ? AND revision = ? AND tombstoned = 0
        `).run(
          summary.revision,
          summary.tombstoned ? 1 : 0,
          summary.updatedAt,
          JSON.stringify(next),
          input.desktopSessionId,
          input.expectedRevision,
        );
        if (Number(update.changes) !== 1) {
          return failure("desktop.session_revision_conflict", "session revision changed");
        }
        insertReceipt(this.#requireDatabase(), {
          commandId: input.commandId,
          commandType,
          requestDigest: input.requestDigest,
          resourceId: input.desktopSessionId,
          committedAt: input.committedAt,
          summary,
        });
        return { ok: true, replayed: false, value: summary } as const;
      });
      this.#faultInjector?.(faultPoint);
      return Promise.resolve(result);
    } catch (error) {
      return Promise.resolve(sqliteFailure(error));
    }
  }

  #requireDatabase(): DatabaseSync {
    if (this.#database === undefined) {
      throw new Error("desktop foundation persistence is not started");
    }
    return this.#database;
  }
}

function replayWorkspace(
  database: DatabaseSync,
  commandId: string,
  requestDigest: string,
  commandType: "create_workspace_grant" | "revoke_workspace_grant",
): DesktopFoundationWriteResult<WorkspaceGrantProjection> | undefined {
  const receipt = selectReceipt(database, commandId);
  if (receipt === undefined) return undefined;
  if (
    receipt.commandType !== commandType
    || receipt.requestDigest !== requestDigest
    || !("projection" in receipt)
  ) return idempotencyConflict();
  return { ok: true, replayed: true, value: receipt.projection };
}

function replaySession(
  database: DatabaseSync,
  commandId: string,
  requestDigest: string,
  commandType: "create_session" | "rename_session" | "delete_session",
): DesktopFoundationWriteResult<SessionSummary> | undefined {
  const receipt = selectReceipt(database, commandId);
  if (receipt === undefined) return undefined;
  if (
    receipt.commandType !== commandType
    || receipt.requestDigest !== requestDigest
    || !("summary" in receipt)
  ) return idempotencyConflict();
  return { ok: true, replayed: true, value: receipt.summary };
}

function replayArtifactLifecycle(
  database: DatabaseSync,
  commandId: string,
  requestDigest: string,
): DesktopFoundationWriteResult<ArtifactLifecycleProjection> | undefined {
  const receipt = selectReceipt(database, commandId);
  if (receipt === undefined) return undefined;
  if (
    receipt.commandType !== "set_artifact_lifecycle"
    || receipt.requestDigest !== requestDigest
    || !("lifecycle" in receipt)
  ) return idempotencyConflict();
  return { ok: true, replayed: true, value: receipt.lifecycle };
}

function replayManualArtifactRegistration(
  database: DatabaseSync,
  commandId: string,
  requestDigest: string,
): DesktopFoundationWriteResult<ArtifactCatalogItemProjection> | undefined {
  const receipt = selectReceipt(database, commandId);
  if (receipt === undefined) return undefined;
  if (
    receipt.commandType !== "register_workspace_artifact"
    || receipt.requestDigest !== requestDigest
    || !("artifact" in receipt)
  ) return idempotencyConflict();
  return { ok: true, replayed: true, value: receipt.artifact };
}

function selectWorkspaceGrant(
  database: DatabaseSync,
  workspaceGrantId: string,
): WorkspaceGrantRecord | undefined {
  const row = database.prepare(`
    SELECT status, record_json FROM desktop_workspace_grants
    WHERE workspace_grant_id = ?
  `).get(workspaceGrantId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const record = parseWorkspaceRecord(requireString(row.record_json));
  if (row.status !== record.status || workspaceGrantId !== record.workspaceGrantId) {
    throw new Error("desktop workspace grant indexed fields do not match record_json");
  }
  return record;
}

function selectDesktopSession(
  database: DatabaseSync,
  desktopSessionId: string,
): DesktopSessionRecord | undefined {
  const row = database.prepare(`
    SELECT internal_session_id, revision, tombstoned, record_json
    FROM desktop_session_metadata WHERE desktop_session_id = ?
  `).get(desktopSessionId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const record = parseSessionRecord(requireString(row.record_json));
  if (
    row.internal_session_id !== record.internalSessionId
    || row.revision !== record.summary.revision
    || row.tombstoned !== (record.summary.tombstoned ? 1 : 0)
    || desktopSessionId !== record.summary.sessionId
  ) throw new Error("desktop session indexed fields do not match record_json");
  return record;
}

function selectArtifactLifecycle(
  database: DatabaseSync,
  artifactId: string,
): ArtifactLifecycleRecord | undefined {
  const row = database.prepare(`
    SELECT task_id, source_digest, pinned, dismissed, record_json
    FROM artifact_lifecycle_records
    WHERE artifact_id = ?
  `).get(artifactId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const record = parseArtifactLifecycleRecord(requireString(row.record_json));
  if (
    record.artifactId !== artifactId
    || nullableString(row.task_id) !== record.taskId
    || row.source_digest !== record.sourceDigest
    || row.pinned !== (record.lifecycle.pinned ? 1 : 0)
    || row.dismissed !== (record.lifecycle.dismissed ? 1 : 0)
  ) throw new Error("artifact lifecycle indexed fields do not match record_json");
  return record;
}

function selectManualArtifactRegistration(
  database: DatabaseSync,
  artifactId: string,
): ManualArtifactRegistrationRecord | undefined {
  const row = database.prepare(`
    SELECT workspace_grant_id, relative_path, source_digest, file_sha256,
           byte_size, media_type, created_at, record_json
    FROM manual_artifact_registrations
    WHERE artifact_id = ?
  `).get(artifactId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const record = parseManualArtifactRegistrationRecord(requireString(row.record_json));
  if (
    record.artifactId !== artifactId
    || row.workspace_grant_id !== record.workspaceGrantId
    || row.relative_path !== record.relativePath
    || row.source_digest !== record.sourceDigest
    || row.file_sha256 !== record.fileSha256
    || row.byte_size !== record.byteSize
    || row.media_type !== record.mediaType
    || row.created_at !== record.createdAt
  ) throw new Error("manual artifact registration indexed fields do not match record_json");
  return record;
}

function selectManualArtifactRegistrationByWorkspacePath(
  database: DatabaseSync,
  workspaceGrantId: string,
  relativePath: string,
): ManualArtifactRegistrationRecord | undefined {
  const row = database.prepare(`
    SELECT artifact_id FROM manual_artifact_registrations
    WHERE workspace_grant_id = ? AND relative_path = ?
  `).get(workspaceGrantId, relativePath) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  return selectManualArtifactRegistration(database, requireString(row.artifact_id));
}

function insertReceipt(database: DatabaseSync, receipt: DesktopFoundationReceipt): void {
  database.prepare(`
    INSERT INTO desktop_command_receipts (
      command_id, command_type, request_digest, resource_id,
      committed_at, receipt_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    receipt.commandId,
    receipt.commandType,
    receipt.requestDigest,
    receipt.resourceId,
    receipt.committedAt,
    JSON.stringify(receipt),
  );
}

function selectReceipt(
  database: DatabaseSync,
  commandId: string,
): DesktopFoundationReceipt | undefined {
  const row = database.prepare(`
    SELECT command_type, request_digest, resource_id, committed_at, receipt_json
    FROM desktop_command_receipts WHERE command_id = ?
  `).get(commandId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const receipt = parseReceipt(requireString(row.receipt_json));
  if (
    receipt.commandType !== row.command_type
    || receipt.requestDigest !== row.request_digest
    || receipt.resourceId !== row.resource_id
    || receipt.committedAt !== row.committed_at
  ) throw new Error("desktop receipt indexed fields do not match receipt_json");
  return receipt;
}

function selectSessionCreateIntent(
  database: DatabaseSync,
  commandId: string,
): DesktopSessionCreateIntent | undefined {
  const row = database.prepare(`
    SELECT request_digest, internal_session_id, desktop_session_id,
           prepared_at, intent_json
    FROM desktop_session_create_intents WHERE command_id = ?
  `).get(commandId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const value = parseObject(requireString(row.intent_json), "session create intent");
  const intent: DesktopSessionCreateIntent = {
    commandId: requireString(value.commandId),
    requestDigest: requireString(value.requestDigest),
    internalSessionId: requireString(value.internalSessionId),
    desktopSessionId: requireString(value.desktopSessionId),
    preparedAt: requireString(value.preparedAt),
  };
  if (
    intent.commandId !== commandId
    || intent.requestDigest !== row.request_digest
    || intent.internalSessionId !== row.internal_session_id
    || intent.desktopSessionId !== row.desktop_session_id
    || intent.preparedAt !== row.prepared_at
  ) throw new Error("desktop session create intent indexed fields do not match intent_json");
  return intent;
}

function parseWorkspaceRecord(json: string): WorkspaceGrantRecord {
  const value = parseObject(json, "workspace grant");
  if (typeof value.rootRealPath !== "string" || value.rootRealPath.length === 0) {
    throw new Error("desktop workspace grant rootRealPath is invalid");
  }
  const { rootRealPath, ...projectionValue } = value;
  return {
    ...WorkspaceGrantProjectionSchema.parse(projectionValue),
    rootRealPath,
  };
}

function toWorkspaceProjection(record: WorkspaceGrantRecord): WorkspaceGrantProjection {
  const { rootRealPath: _rootRealPath, ...projection } = record;
  return WorkspaceGrantProjectionSchema.parse(projection);
}

function parseSessionRecord(json: string): DesktopSessionRecord {
  const value = parseObject(json, "session metadata");
  if (typeof value.internalSessionId !== "string" || value.internalSessionId.length === 0) {
    throw new Error("desktop session internalSessionId is invalid");
  }
  return {
    internalSessionId: value.internalSessionId,
    summary: SessionSummarySchema.parse(value.summary),
  };
}

function parseReceipt(json: string): DesktopFoundationReceipt {
  const value = parseObject(json, "command receipt");
  const commandId = requireString(value.commandId);
  const requestDigest = requireString(value.requestDigest);
  const resourceId = requireString(value.resourceId);
  const committedAt = requireString(value.committedAt);
  const commandType = requireString(value.commandType);
  if (commandType === "create_workspace_grant" || commandType === "revoke_workspace_grant") {
    return {
      commandId,
      commandType,
      requestDigest,
      resourceId,
      committedAt,
      projection: WorkspaceGrantProjectionSchema.parse(value.projection),
    };
  }
  if (commandType === "create_session" || commandType === "rename_session" || commandType === "delete_session") {
    return {
      commandId,
      commandType,
      requestDigest,
      resourceId,
      committedAt,
      summary: SessionSummarySchema.parse(value.summary),
    };
  }
  if (commandType === "set_artifact_lifecycle") {
    return {
      commandId,
      commandType,
      requestDigest,
      resourceId,
      committedAt,
      artifactId: requireString(value.artifactId),
      lifecycle: ArtifactLifecycleProjectionSchema.parse(value.lifecycle),
    };
  }
  if (commandType === "register_workspace_artifact") {
    return {
      commandId,
      commandType,
      requestDigest,
      resourceId,
      committedAt,
      artifact: ArtifactCatalogItemProjectionSchema.parse(value.artifact),
    };
  }
  throw new Error("desktop command receipt type is invalid");
}

function parseArtifactLifecycleRecord(json: string): ArtifactLifecycleRecord {
  const value = parseObject(json, "artifact lifecycle");
  return {
    artifactId: requireString(value.artifactId),
    ...(value.taskId === undefined ? {} : { taskId: requireString(value.taskId) }),
    sourceDigest: requireString(value.sourceDigest),
    lifecycle: ArtifactLifecycleProjectionSchema.parse(value.lifecycle),
  };
}

function parseManualArtifactRegistrationRecord(json: string): ManualArtifactRegistrationRecord {
  const value = parseObject(json, "manual artifact registration");
  const record = {
    artifactId: requireString(value.artifactId),
    workspaceGrantId: requireString(value.workspaceGrantId),
    relativePath: requireString(value.relativePath),
    sourceId: requireString(value.sourceId),
    sourceDigest: requireString(value.sourceDigest),
    fileSha256: requireString(value.fileSha256),
    byteSize: requireNonnegativeInteger(value.byteSize),
    displayName: requireString(value.displayName),
    kind: requireString(value.kind) as ManualArtifactRegistrationRecord["kind"],
    mediaType: requireString(value.mediaType),
    createdAt: requireString(value.createdAt),
    previewState: requireString(value.previewState) as ManualArtifactRegistrationRecord["previewState"],
    metadata: JsonObjectSchema.parse(value.metadata ?? {}),
  };
  manualArtifactProjection(record);
  return record;
}

function manualArtifactProjection(
  record: ManualArtifactRegistrationRecord,
): ArtifactCatalogItemProjection {
  return ArtifactCatalogItemProjectionSchema.parse({
    artifactId: record.artifactId,
    sourceKind: "workspace_file",
    sourceId: record.sourceId,
    sourceDigest: record.sourceDigest,
    displayName: record.displayName,
    kind: record.kind,
    mediaType: record.mediaType,
    relativePath: record.relativePath,
    byteSize: record.byteSize,
    createdAt: record.createdAt,
    previewState: record.previewState,
    lifecycle: {
      revision: 0,
      pinned: false,
      dismissed: false,
      deleted: false,
      sourceDeleted: false,
    },
    metadata: record.metadata,
  });
}

function parseObject(json: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(json);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`desktop ${label} JSON must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") throw new Error("expected SQLite text value");
  return value;
}

function nullableString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return requireString(value);
}

function requireNonnegativeInteger(value: unknown): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0) {
    throw new Error("expected SQLite nonnegative integer value");
  }
  return value;
}

function withImmediateTransaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  }
}

function idempotencyConflict(): DesktopFoundationWriteResult<never> {
  return failure(
    "desktop.command_idempotency_conflict",
    "commandId was already used with another command digest",
  );
}

function failure(
  code: string,
  message: string,
): { ok: false; error: RuntimeError } {
  return {
    ok: false,
    error: {
      code,
      category: "persistence",
      message,
      retryable: false,
    },
  };
}

function sqliteFailure<T>(error: unknown): DesktopFoundationWriteResult<T> {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    && error.code.startsWith("SQLITE_CONSTRAINT")
  ) {
    return failure("desktop.persistence_conflict", "SQLite constraint rejected the write");
  }
  return failure(
    "desktop.persistence_failure",
    error instanceof Error ? error.message : "unknown SQLite failure",
  );
}
