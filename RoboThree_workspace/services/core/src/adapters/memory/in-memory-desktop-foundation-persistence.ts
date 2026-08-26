import {
  ArtifactCatalogItemProjectionSchema,
  ArtifactLifecycleProjectionSchema,
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

export class InMemoryDesktopFoundationPersistence
implements
  WorkspaceGrantPersistence,
  DesktopSessionMetadataPersistence,
  ArtifactLifecyclePersistence,
  ManualArtifactRegistrationPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.desktop-foundation.memory";
  readonly #clock: Clock;
  readonly #faultInjector: DesktopFoundationPersistenceFaultInjector | undefined;
  readonly #workspaceGrants = new Map<string, WorkspaceGrantRecord>();
  readonly #sessions = new Map<string, DesktopSessionRecord>();
  readonly #artifactLifecycles = new Map<string, ArtifactLifecycleRecord>();
  readonly #manualArtifacts = new Map<string, ManualArtifactRegistrationRecord>();
  readonly #sessionCreateIntents = new Map<string, DesktopSessionCreateIntent>();
  readonly #receipts = new Map<string, DesktopFoundationReceipt>();
  #started = false;

  constructor(input: {
    clock: Clock;
    faultInjector?: DesktopFoundationPersistenceFaultInjector;
  }) {
    this.#clock = input.clock;
    this.#faultInjector = input.faultInjector;
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

  async findWorkspaceCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined> {
    return this.#findReceipt(commandId);
  }

  async findSessionMetadataCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined> {
    return this.#findReceipt(commandId);
  }

  async findArtifactLifecycleCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined> {
    return this.#findReceipt(commandId);
  }

  async findManualArtifactRegistrationCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined> {
    return this.#findReceipt(commandId);
  }

  async loadWorkspaceGrant(
    workspaceGrantId: string,
  ): Promise<WorkspaceGrantRecord | undefined> {
    this.#requireStarted();
    return clone(this.#workspaceGrants.get(workspaceGrantId));
  }

  async listWorkspaceGrants(): Promise<readonly WorkspaceGrantRecord[]> {
    this.#requireStarted();
    return [...this.#workspaceGrants.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
        || left.workspaceGrantId.localeCompare(right.workspaceGrantId))
      .map((record) => clone(record)!);
  }

  async commitWorkspaceGrantCreation(input: {
    record: WorkspaceGrantRecord;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<WorkspaceGrantProjection>> {
    this.#requireStarted();
    const replay = this.#replayWorkspace(input.commandId, input.requestDigest, "create_workspace_grant");
    if (replay !== undefined) return replay;
    const validated = validateWorkspaceRecord(input.record);
    if (!validated.ok) return validated;
    if (this.#workspaceGrants.has(input.record.workspaceGrantId)) {
      return failure("desktop.workspace_conflict", "workspaceGrantId already exists");
    }
    const projection = toWorkspaceProjection(input.record);
    this.#workspaceGrants.set(input.record.workspaceGrantId, clone(input.record)!);
    this.#receipts.set(input.commandId, {
      commandId: input.commandId,
      commandType: "create_workspace_grant",
      requestDigest: input.requestDigest,
      resourceId: input.record.workspaceGrantId,
      committedAt: input.committedAt,
      projection,
    });
    this.#faultInjector?.("workspace.create.after_commit");
    return { ok: true, replayed: false, value: clone(projection)! };
  }

  async commitWorkspaceGrantRevocation(input: {
    workspaceGrantId: string;
    commandId: string;
    requestDigest: string;
    revokedAt: string;
  }): Promise<DesktopFoundationWriteResult<WorkspaceGrantProjection>> {
    this.#requireStarted();
    const replay = this.#replayWorkspace(input.commandId, input.requestDigest, "revoke_workspace_grant");
    if (replay !== undefined) return replay;
    const current = this.#workspaceGrants.get(input.workspaceGrantId);
    if (current === undefined) {
      return failure("desktop.workspace_not_found", "workspace grant does not exist");
    }
    if (current.status === "revoked") {
      return failure("desktop.workspace_revoked", "workspace grant is already revoked");
    }
    const next: WorkspaceGrantRecord = {
      ...current,
      status: "revoked",
      revokedAt: input.revokedAt,
    };
    const projection = toWorkspaceProjection(next);
    this.#workspaceGrants.set(input.workspaceGrantId, clone(next)!);
    this.#receipts.set(input.commandId, {
      commandId: input.commandId,
      commandType: "revoke_workspace_grant",
      requestDigest: input.requestDigest,
      resourceId: input.workspaceGrantId,
      committedAt: input.revokedAt,
      projection,
    });
    this.#faultInjector?.("workspace.revoke.after_commit");
    return { ok: true, replayed: false, value: clone(projection)! };
  }

  async loadDesktopSession(
    desktopSessionId: string,
  ): Promise<DesktopSessionRecord | undefined> {
    this.#requireStarted();
    return clone(this.#sessions.get(desktopSessionId));
  }

  async listDesktopSessions(
    includeTombstoned = false,
  ): Promise<readonly DesktopSessionRecord[]> {
    this.#requireStarted();
    return [...this.#sessions.values()]
      .filter((record) => includeTombstoned || !record.summary.tombstoned)
      .sort((left, right) => right.summary.updatedAt.localeCompare(left.summary.updatedAt)
        || left.summary.sessionId.localeCompare(right.summary.sessionId))
      .map((record) => clone(record)!);
  }

  async prepareDesktopSessionCreation(
    intent: DesktopSessionCreateIntent,
  ): Promise<DesktopFoundationWriteResult<DesktopSessionCreateIntent>> {
    this.#requireStarted();
    const existing = this.#sessionCreateIntents.get(intent.commandId);
    if (existing !== undefined) {
      return existing.requestDigest === intent.requestDigest
        && existing.internalSessionId === intent.internalSessionId
        && existing.desktopSessionId === intent.desktopSessionId
        ? { ok: true, replayed: true, value: clone(existing)! }
        : idempotencyConflict();
    }
    this.#sessionCreateIntents.set(intent.commandId, clone(intent)!);
    return { ok: true, replayed: false, value: clone(intent)! };
  }

  async commitDesktopSessionCreation(input: {
    record: DesktopSessionRecord;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<SessionSummary>> {
    this.#requireStarted();
    const replay = this.#replaySession(input.commandId, input.requestDigest, "create_session");
    if (replay !== undefined) return replay;
    const intent = this.#sessionCreateIntents.get(input.commandId);
    if (
      intent === undefined
      || intent.requestDigest !== input.requestDigest
      || intent.internalSessionId !== input.record.internalSessionId
      || intent.desktopSessionId !== input.record.summary.sessionId
    ) return failure("desktop.session_intent_conflict", "session create intent does not match metadata");
    const parsed = SessionSummarySchema.safeParse(input.record.summary);
    if (!parsed.success || input.record.internalSessionId.length === 0) {
      return failure("desktop.invalid_session_record", "session metadata is invalid");
    }
    if (this.#sessions.has(input.record.summary.sessionId)) {
      return failure("desktop.session_conflict", "session metadata already exists");
    }
    const record = clone({ ...input.record, summary: parsed.data })!;
    this.#sessions.set(record.summary.sessionId, record);
    this.#receipts.set(input.commandId, {
      commandId: input.commandId,
      commandType: "create_session",
      requestDigest: input.requestDigest,
      resourceId: record.summary.sessionId,
      committedAt: input.committedAt,
      summary: record.summary,
    });
    this.#faultInjector?.("session.metadata.create.after_commit");
    return { ok: true, replayed: false, value: clone(record.summary)! };
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
    this.#requireStarted();
    return clone(this.#artifactLifecycles.get(artifactId));
  }

  async listArtifactLifecycleByTask(
    taskId: string,
  ): Promise<readonly ArtifactLifecycleRecord[]> {
    this.#requireStarted();
    return [...this.#artifactLifecycles.values()]
      .filter((record) => record.taskId === taskId)
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
      .map((record) => clone(record)!);
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
    this.#requireStarted();
    const replay = this.#replayArtifactLifecycle(input.commandId, input.requestDigest);
    if (replay !== undefined) return replay;
    const lifecycle = ArtifactLifecycleProjectionSchema.parse(input.lifecycle);
    const current = this.#artifactLifecycles.get(input.artifactId);
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
    this.#artifactLifecycles.set(input.artifactId, clone(record)!);
    this.#receipts.set(input.commandId, {
      commandId: input.commandId,
      commandType: "set_artifact_lifecycle",
      requestDigest: input.requestDigest,
      resourceId: input.artifactId,
      committedAt: input.committedAt,
      artifactId: input.artifactId,
      lifecycle,
    });
    return { ok: true, replayed: false, value: clone(lifecycle)! };
  }

  async loadManualArtifactRegistration(
    artifactId: string,
  ): Promise<ManualArtifactRegistrationRecord | undefined> {
    this.#requireStarted();
    return clone(this.#manualArtifacts.get(artifactId));
  }

  async findManualArtifactRegistrationByWorkspacePath(input: {
    workspaceGrantId: string;
    relativePath: string;
  }): Promise<ManualArtifactRegistrationRecord | undefined> {
    this.#requireStarted();
    return clone([...this.#manualArtifacts.values()].find((record) =>
      record.workspaceGrantId === input.workspaceGrantId
      && record.relativePath === input.relativePath));
  }

  async listManualArtifactRegistrations(): Promise<readonly ManualArtifactRegistrationRecord[]> {
    this.#requireStarted();
    return [...this.#manualArtifacts.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)
        || left.artifactId.localeCompare(right.artifactId))
      .map((record) => clone(record)!);
  }

  async commitManualArtifactRegistration(input: {
    record: ManualArtifactRegistrationRecord;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<ArtifactCatalogItemProjection>> {
    this.#requireStarted();
    const replay = this.#replayManualArtifactRegistration(input.commandId, input.requestDigest);
    if (replay !== undefined) return replay;
    const projection = manualArtifactProjection(input.record);
    const samePath = [...this.#manualArtifacts.values()].find((record) =>
      record.workspaceGrantId === input.record.workspaceGrantId
      && record.relativePath === input.record.relativePath);
    if (samePath !== undefined) {
      if (samePath.sourceDigest !== input.record.sourceDigest) {
        return failure("desktop.artifact_registration_conflict", "manual artifact source changed");
      }
      const existing = manualArtifactProjection(samePath);
      this.#receipts.set(input.commandId, {
        commandId: input.commandId,
        commandType: "register_workspace_artifact",
        requestDigest: input.requestDigest,
        resourceId: samePath.artifactId,
        committedAt: input.committedAt,
        artifact: existing,
      });
      return { ok: true, replayed: false, value: clone(existing)! };
    }
    if (this.#manualArtifacts.has(input.record.artifactId)) {
      return failure("desktop.artifact_registration_conflict", "manual artifact already exists");
    }
    this.#manualArtifacts.set(input.record.artifactId, clone(input.record)!);
    this.#receipts.set(input.commandId, {
      commandId: input.commandId,
      commandType: "register_workspace_artifact",
      requestDigest: input.requestDigest,
      resourceId: input.record.artifactId,
      committedAt: input.committedAt,
      artifact: projection,
    });
    return { ok: true, replayed: false, value: clone(projection)! };
  }

  #findReceipt(commandId: string): DesktopFoundationReceipt | undefined {
    this.#requireStarted();
    return clone(this.#receipts.get(commandId));
  }

  #replayWorkspace(
    commandId: string,
    requestDigest: string,
    commandType: "create_workspace_grant" | "revoke_workspace_grant",
  ): DesktopFoundationWriteResult<WorkspaceGrantProjection> | undefined {
    const receipt = this.#receipts.get(commandId);
    if (receipt === undefined) return undefined;
    if (
      receipt.commandType !== commandType
      || receipt.requestDigest !== requestDigest
      || !("projection" in receipt)
    ) return idempotencyConflict();
    return { ok: true, replayed: true, value: clone(receipt.projection)! };
  }

  #replaySession(
    commandId: string,
    requestDigest: string,
    commandType: "create_session" | "rename_session" | "delete_session",
  ): DesktopFoundationWriteResult<SessionSummary> | undefined {
    const receipt = this.#receipts.get(commandId);
    if (receipt === undefined) return undefined;
    if (
      receipt.commandType !== commandType
      || receipt.requestDigest !== requestDigest
      || !("summary" in receipt)
    ) return idempotencyConflict();
    return { ok: true, replayed: true, value: clone(receipt.summary)! };
  }

  #replayArtifactLifecycle(
    commandId: string,
    requestDigest: string,
  ): DesktopFoundationWriteResult<ArtifactLifecycleProjection> | undefined {
    const receipt = this.#receipts.get(commandId);
    if (receipt === undefined) return undefined;
    if (
      receipt.commandType !== "set_artifact_lifecycle"
      || receipt.requestDigest !== requestDigest
      || !("lifecycle" in receipt)
    ) return idempotencyConflict();
    return { ok: true, replayed: true, value: clone(receipt.lifecycle)! };
  }

  #replayManualArtifactRegistration(
    commandId: string,
    requestDigest: string,
  ): DesktopFoundationWriteResult<ArtifactCatalogItemProjection> | undefined {
    const receipt = this.#receipts.get(commandId);
    if (receipt === undefined) return undefined;
    if (
      receipt.commandType !== "register_workspace_artifact"
      || receipt.requestDigest !== requestDigest
      || !("artifact" in receipt)
    ) return idempotencyConflict();
    return { ok: true, replayed: true, value: clone(receipt.artifact)! };
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
  ): DesktopFoundationWriteResult<SessionSummary> {
    this.#requireStarted();
    const replay = this.#replaySession(input.commandId, input.requestDigest, commandType);
    if (replay !== undefined) return replay;
    const current = this.#sessions.get(input.desktopSessionId);
    if (current === undefined) {
      return failure("desktop.session_not_found", "session metadata does not exist");
    }
    if (current.summary.tombstoned) {
      return failure("desktop.session_tombstoned", "session is tombstoned");
    }
    if (current.summary.revision !== input.expectedRevision) {
      return failure("desktop.session_revision_conflict", "session revision changed");
    }
    const parsed = SessionSummarySchema.safeParse(mutate(current.summary));
    if (!parsed.success) {
      return failure("desktop.invalid_session_record", "session metadata is invalid");
    }
    const next: DesktopSessionRecord = { ...current, summary: parsed.data };
    this.#sessions.set(input.desktopSessionId, clone(next)!);
    this.#receipts.set(input.commandId, {
      commandId: input.commandId,
      commandType,
      requestDigest: input.requestDigest,
      resourceId: input.desktopSessionId,
      committedAt: input.committedAt,
      summary: parsed.data,
    });
    this.#faultInjector?.(faultPoint);
    return { ok: true, replayed: false, value: clone(parsed.data)! };
  }

  #requireStarted(): void {
    if (!this.#started) throw new Error("desktop foundation persistence is not started");
  }
}

function validateWorkspaceRecord(
  record: WorkspaceGrantRecord,
): { ok: true } | DesktopFoundationWriteResult<never> {
  const { rootRealPath: _rootRealPath, ...projection } = record;
  return typeof record.rootRealPath === "string"
    && record.rootRealPath.length > 0
    && WorkspaceGrantProjectionSchema.safeParse(projection).success
    ? { ok: true }
    : failure("desktop.invalid_workspace_record", "workspace grant record is invalid");
}

function toWorkspaceProjection(
  record: WorkspaceGrantRecord,
): WorkspaceGrantProjection {
  const { rootRealPath: _rootRealPath, ...projection } = record;
  return WorkspaceGrantProjectionSchema.parse(projection);
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

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
