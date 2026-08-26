import type {
  ArtifactCatalogItemProjection,
  ArtifactLifecycleProjection,
  RuntimeError,
  SessionSummary,
  WorkspaceGrantProjection,
} from "@robothree/contracts";

import type { PersistenceAdapter } from "./persistence.js";

export type WorkspaceGrantRecord = WorkspaceGrantProjection & {
  rootRealPath: string;
};

export type DesktopSessionRecord = {
  internalSessionId: string;
  summary: SessionSummary;
};

export type DesktopSessionCreateIntent = {
  commandId: string;
  requestDigest: string;
  internalSessionId: string;
  desktopSessionId: string;
  preparedAt: string;
};

export type DesktopFoundationReceipt =
  | {
    commandId: string;
    commandType: "create_workspace_grant" | "revoke_workspace_grant";
    requestDigest: string;
    resourceId: string;
    committedAt: string;
    projection: WorkspaceGrantProjection;
  }
  | {
    commandId: string;
    commandType: "create_session" | "rename_session" | "delete_session";
    requestDigest: string;
    resourceId: string;
    committedAt: string;
    summary: SessionSummary;
  }
  | {
    commandId: string;
    commandType: "set_artifact_lifecycle";
    requestDigest: string;
    resourceId: string;
    committedAt: string;
    artifactId: string;
    lifecycle: ArtifactLifecycleProjection;
  }
  | {
    commandId: string;
    commandType: "register_workspace_artifact";
    requestDigest: string;
    resourceId: string;
    committedAt: string;
    artifact: ArtifactCatalogItemProjection;
  };

export type DesktopFoundationWriteResult<T> =
  | { ok: true; replayed: boolean; value: T }
  | { ok: false; error: RuntimeError };

export type DesktopFoundationPersistenceFaultPoint =
  | "workspace.create.after_commit"
  | "workspace.revoke.after_commit"
  | "session.metadata.create.after_commit"
  | "session.metadata.rename.after_commit"
  | "session.metadata.tombstone.after_commit";

export type DesktopFoundationPersistenceFaultInjector = (
  point: DesktopFoundationPersistenceFaultPoint,
) => void;

export interface WorkspaceGrantPersistence extends PersistenceAdapter {
  findWorkspaceCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined>;
  loadWorkspaceGrant(
    workspaceGrantId: string,
  ): Promise<WorkspaceGrantRecord | undefined>;
  listWorkspaceGrants(): Promise<readonly WorkspaceGrantRecord[]>;
  commitWorkspaceGrantCreation(input: {
    record: WorkspaceGrantRecord;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<WorkspaceGrantProjection>>;
  commitWorkspaceGrantRevocation(input: {
    workspaceGrantId: string;
    commandId: string;
    requestDigest: string;
    revokedAt: string;
  }): Promise<DesktopFoundationWriteResult<WorkspaceGrantProjection>>;
}

export interface DesktopSessionMetadataPersistence extends PersistenceAdapter {
  findSessionMetadataCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined>;
  loadDesktopSession(
    desktopSessionId: string,
  ): Promise<DesktopSessionRecord | undefined>;
  listDesktopSessions(
    includeTombstoned?: boolean,
  ): Promise<readonly DesktopSessionRecord[]>;
  prepareDesktopSessionCreation(
    intent: DesktopSessionCreateIntent,
  ): Promise<DesktopFoundationWriteResult<DesktopSessionCreateIntent>>;
  commitDesktopSessionCreation(input: {
    record: DesktopSessionRecord;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<SessionSummary>>;
  commitDesktopSessionRename(input: {
    desktopSessionId: string;
    title: string;
    expectedRevision: number;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<SessionSummary>>;
  commitDesktopSessionTombstone(input: {
    desktopSessionId: string;
    expectedRevision: number;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<SessionSummary>>;
}

export type ArtifactLifecycleRecord = {
  artifactId: string;
  taskId?: string;
  sourceDigest: string;
  lifecycle: ArtifactLifecycleProjection;
};

export type ManualArtifactRegistrationRecord = {
  artifactId: string;
  workspaceGrantId: string;
  relativePath: string;
  sourceId: string;
  sourceDigest: string;
  fileSha256: string;
  byteSize: number;
  displayName: string;
  kind: ArtifactCatalogItemProjection["kind"];
  mediaType: string;
  createdAt: string;
  previewState: ArtifactCatalogItemProjection["previewState"];
  metadata: ArtifactCatalogItemProjection["metadata"];
};

export interface ArtifactLifecyclePersistence extends PersistenceAdapter {
  findArtifactLifecycleCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined>;
  loadArtifactLifecycle(
    artifactId: string,
  ): Promise<ArtifactLifecycleRecord | undefined>;
  listArtifactLifecycleByTask(
    taskId: string,
  ): Promise<readonly ArtifactLifecycleRecord[]>;
  commitArtifactLifecycle(input: {
    artifactId: string;
    taskId?: string;
    sourceDigest: string;
    lifecycle: ArtifactLifecycleProjection;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<ArtifactLifecycleProjection>>;
}

export interface ManualArtifactRegistrationPersistence extends PersistenceAdapter {
  findManualArtifactRegistrationCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined>;
  loadManualArtifactRegistration(
    artifactId: string,
  ): Promise<ManualArtifactRegistrationRecord | undefined>;
  findManualArtifactRegistrationByWorkspacePath(input: {
    workspaceGrantId: string;
    relativePath: string;
  }): Promise<ManualArtifactRegistrationRecord | undefined>;
  listManualArtifactRegistrations(): Promise<readonly ManualArtifactRegistrationRecord[]>;
  commitManualArtifactRegistration(input: {
    record: ManualArtifactRegistrationRecord;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<ArtifactCatalogItemProjection>>;
}
