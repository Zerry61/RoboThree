import type {
  AgentProjection,
  ArtifactCatalogProjection,
  ArtifactHtmlPreviewProjection,
  ArtifactHtmlPreviewQuery,
  ArtifactExportCommand,
  ArtifactExportReceipt,
  ArtifactLifecycleReceipt,
  ArtifactSourceFileDeletionReceipt,
  ArtifactPreviewQuery,
  ArtifactPreviewCloseReceipt,
  ArtifactOpenLocationCommand,
  ArtifactOpenLocationReceipt,
  ArtifactTextPreviewProjection,
  CloseArtifactPreviewCommand,
  ConversationSnapshot,
  ConversationSnapshotQuery,
  CreateSessionCommand,
  DeleteArtifactSourceFileCommand,
  DeleteArtifactRecordCommand,
  DeleteSessionCommand,
  DesktopErrorEnvelope,
  DesktopEventEnvelope,
  ReplayResetRequired,
  ListAgentsQuery,
  ListArtifactsQuery,
  ListModelsQuery,
  ListPendingUserConfirmationsQuery,
  ListTasksQuery,
  ListSessionsQuery,
  ListWorkspaceGrantsQuery,
  ModelProjection,
  OpenSessionQuery,
  RenameSessionCommand,
  RegisterWorkspaceArtifactCommand,
  RegisterWorkspaceArtifactReceipt,
  RevokeWorkspaceGrantCommand,
  RuntimeStatusProjection,
  RuntimeStatusQuery,
  SessionSummary,
  SetArtifactLifecycleCommand,
  RestoreArtifactRecordCommand,
  SubmitTurnCommand,
  SubmitTurnReceipt,
  SubmitTurnStatusQuery,
  TaskDetailProjection,
  TaskDetailQuery,
  TaskControlCommand,
  TaskControlReceipt,
  TaskSummaryProjection,
  UserConfirmationProjection,
  WorkspaceAccessMode,
  WorkspaceGrantProjection,
  CompatibilityProjectionV1Alpha2,
  CompatibilityQueryV1Alpha2,
  DesktopErrorEnvelopeV1Alpha2,
  GetRobotCatalogQuery,
  GetToolCatalogQuery,
  ListWorkspaceEntriesQuery,
  ListRobotCatalogQuery,
  ListToolCatalogQuery,
  OpenTaskWorkspaceLocationCommand,
  RobotCatalogDetail,
  RobotCatalogPage,
  TaskWorkspaceOpenReceipt,
  ToolCatalogDetail,
  ToolCatalogPage,
  WorkspaceDirectoryProjection,
} from "@robothree/contracts";

export const FOUNDATION_STATUS_CHANNEL = "robothree:foundation-status" as const;
export const FOUNDATION_FIXTURE_SCHEMA = "robothree.desktop.foundation-fixture.v1" as const;

export const DESKTOP_IPC_CHANNELS = Object.freeze({
  runtimeStatus: "robothree:v1alpha1:runtime-status",
  createWorkspaceGrantFromPicker:
    "robothree:v1alpha1:create-workspace-grant-from-picker",
  revokeWorkspaceGrant: "robothree:v1alpha1:revoke-workspace-grant",
  listWorkspaceGrants: "robothree:v1alpha1:list-workspace-grants",
  createSession: "robothree:v1alpha1:create-session",
  renameSession: "robothree:v1alpha1:rename-session",
  deleteSession: "robothree:v1alpha1:delete-session",
  listSessions: "robothree:v1alpha1:list-sessions",
  openSession: "robothree:v1alpha1:open-session",
  listAgents: "robothree:v1alpha1:list-agents",
  listModels: "robothree:v1alpha1:list-models",
  conversationSnapshot: "robothree:v1alpha1:conversation-snapshot",
  listTasks: "robothree:v1alpha1:list-tasks",
  taskDetail: "robothree:v1alpha1:task-detail",
  listArtifacts: "robothree:v1alpha1:list-artifacts",
  registerWorkspaceArtifactFromPicker:
    "robothree:v1alpha1:register-workspace-artifact-from-picker",
  artifactPreview: "robothree:v1alpha1:artifact-preview",
  artifactHtmlPreview: "robothree:v1alpha1:artifact-html-preview",
  closeArtifactPreview: "robothree:v1alpha1:close-artifact-preview",
  setArtifactLifecycle: "robothree:v1alpha1:set-artifact-lifecycle",
  deleteArtifactRecord: "robothree:v1alpha1:delete-artifact-record",
  restoreArtifactRecord: "robothree:v1alpha1:restore-artifact-record",
  deleteArtifactSourceFile: "robothree:v1alpha1:delete-artifact-source-file",
  openArtifactLocation: "robothree:v1alpha1:open-artifact-location",
  exportArtifact: "robothree:v1alpha1:export-artifact",
  listPendingUserConfirmations:
    "robothree:v1alpha1:list-pending-user-confirmations",
  taskControl: "robothree:v1alpha1:task-control",
  submitTurn: "robothree:v1alpha1:submit-turn",
  submitTurnStatus: "robothree:v1alpha1:submit-turn-status",
  desktopEvent: "robothree:v1alpha1:desktop-event",
} as const);

export type DesktopInvokeChannel = Exclude<
  (typeof DESKTOP_IPC_CHANNELS)[keyof typeof DESKTOP_IPC_CHANNELS],
  typeof DESKTOP_IPC_CHANNELS.desktopEvent
>;

export const DESKTOP_V1ALPHA2_IPC_CHANNELS = Object.freeze({
  compatibility: "robothree:v1alpha2:compatibility",
  listRobotCatalog: "robothree:v1alpha2:list-robot-catalog",
  getRobotCatalog: "robothree:v1alpha2:get-robot-catalog",
  listToolCatalog: "robothree:v1alpha2:list-tool-catalog",
  getToolCatalog: "robothree:v1alpha2:get-tool-catalog",
  listWorkspaceEntries: "robothree:v1alpha2:list-workspace-entries",
  openTaskWorkspaceLocation: "robothree:v1alpha2:open-task-workspace-location",
} as const);

export type DesktopV1Alpha2InvokeChannel =
  (typeof DESKTOP_V1ALPHA2_IPC_CHANNELS)[keyof typeof DESKTOP_V1ALPHA2_IPC_CHANNELS];

export type FoundationRuntimeState =
  | "stopped"
  | "starting"
  | "ready"
  | "restarting"
  | "stopping"
  | "failed";

export interface FoundationStatus {
  readonly fixtureSchema: typeof FOUNDATION_FIXTURE_SCHEMA;
  readonly fixtureOnly: boolean;
  readonly runtimeState: FoundationRuntimeState;
  readonly coreReady: boolean;
  readonly compatible: boolean;
  readonly unexpectedRestartCount: number;
}

export interface RoboThreeDesktopApi {
  getFoundationStatus(): Promise<FoundationStatus>;
}

export type RendererSafeResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: DesktopErrorEnvelope }>;

export type RendererSafeResultV1Alpha2<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: DesktopErrorEnvelopeV1Alpha2 }>;

export interface RoboThreeDesktopApiV1Alpha2 {
  readonly contractVersion: "v1alpha2";
  getCompatibility(
    query: CompatibilityQueryV1Alpha2,
  ): Promise<RendererSafeResultV1Alpha2<CompatibilityProjectionV1Alpha2>>;
  listRobotCatalog(
    query: ListRobotCatalogQuery,
  ): Promise<RendererSafeResultV1Alpha2<RobotCatalogPage>>;
  getRobotCatalog(
    query: GetRobotCatalogQuery,
  ): Promise<RendererSafeResultV1Alpha2<RobotCatalogDetail>>;
  listToolCatalog(
    query: ListToolCatalogQuery,
  ): Promise<RendererSafeResultV1Alpha2<ToolCatalogPage>>;
  getToolCatalog(
    query: GetToolCatalogQuery,
  ): Promise<RendererSafeResultV1Alpha2<ToolCatalogDetail>>;
  listWorkspaceEntries(
    query: ListWorkspaceEntriesQuery,
  ): Promise<RendererSafeResultV1Alpha2<WorkspaceDirectoryProjection>>;
  openTaskWorkspaceLocation(
    command: OpenTaskWorkspaceLocationCommand,
  ): Promise<RendererSafeResultV1Alpha2<TaskWorkspaceOpenReceipt>>;
}

export type CreateWorkspaceGrantFromPickerRequest = Readonly<{
  commandId: string;
  correlationId: string;
  clientInstanceId: string;
  displayName: string;
  accessMode: WorkspaceAccessMode;
}>;

export type DesktopRendererEvent =
  | DesktopEventEnvelope
  | ReplayResetRequired;

/**
 * Frozen DCF-1.2A Renderer-safe view. DCF-1.2B may implement this exact surface
 * but must not add Core transport details, selection handles or filesystem paths.
 */
export interface RoboThreeDesktopApiV1Alpha1 {
  readonly contractVersion: "v1alpha1";
  getRuntimeStatus(
    query: RuntimeStatusQuery,
  ): Promise<RendererSafeResult<RuntimeStatusProjection>>;
  createWorkspaceGrantFromPicker(
    request: CreateWorkspaceGrantFromPickerRequest,
  ): Promise<RendererSafeResult<WorkspaceGrantProjection | undefined>>;
  revokeWorkspaceGrant(
    command: RevokeWorkspaceGrantCommand,
  ): Promise<RendererSafeResult<WorkspaceGrantProjection>>;
  listWorkspaceGrants(
    query: ListWorkspaceGrantsQuery,
  ): Promise<RendererSafeResult<readonly WorkspaceGrantProjection[]>>;
  createSession(
    command: CreateSessionCommand,
  ): Promise<RendererSafeResult<SessionSummary>>;
  renameSession(
    command: RenameSessionCommand,
  ): Promise<RendererSafeResult<SessionSummary>>;
  deleteSession(
    command: DeleteSessionCommand,
  ): Promise<RendererSafeResult<SessionSummary>>;
  listSessions(
    query: ListSessionsQuery,
  ): Promise<RendererSafeResult<readonly SessionSummary[]>>;
  openSession(
    query: OpenSessionQuery,
  ): Promise<RendererSafeResult<SessionSummary>>;
  listAgents(
    query: ListAgentsQuery,
  ): Promise<RendererSafeResult<readonly AgentProjection[]>>;
  listModels(
    query: ListModelsQuery,
  ): Promise<RendererSafeResult<readonly ModelProjection[]>>;
  loadConversationSnapshot(
    query: ConversationSnapshotQuery,
  ): Promise<RendererSafeResult<ConversationSnapshot>>;
  listTasks(
    query: ListTasksQuery,
  ): Promise<RendererSafeResult<readonly TaskSummaryProjection[]>>;
  loadTaskDetail(
    query: TaskDetailQuery,
  ): Promise<RendererSafeResult<TaskDetailProjection>>;
  listArtifacts(
    query: ListArtifactsQuery,
  ): Promise<RendererSafeResult<ArtifactCatalogProjection>>;
  registerWorkspaceArtifactFromPicker(
    command: RegisterWorkspaceArtifactCommand,
  ): Promise<RendererSafeResult<RegisterWorkspaceArtifactReceipt | undefined>>;
  previewArtifact(
    query: ArtifactPreviewQuery,
  ): Promise<RendererSafeResult<ArtifactTextPreviewProjection>>;
  startArtifactHtmlPreview(
    query: ArtifactHtmlPreviewQuery,
  ): Promise<RendererSafeResult<ArtifactHtmlPreviewProjection>>;
  closeArtifactPreview(
    command: CloseArtifactPreviewCommand,
  ): Promise<RendererSafeResult<ArtifactPreviewCloseReceipt>>;
  setArtifactLifecycle(
    command: SetArtifactLifecycleCommand,
  ): Promise<RendererSafeResult<ArtifactLifecycleReceipt>>;
  deleteArtifactRecord(
    command: DeleteArtifactRecordCommand,
  ): Promise<RendererSafeResult<ArtifactLifecycleReceipt>>;
  restoreArtifactRecord(
    command: RestoreArtifactRecordCommand,
  ): Promise<RendererSafeResult<ArtifactLifecycleReceipt>>;
  deleteArtifactSourceFile(
    command: DeleteArtifactSourceFileCommand,
  ): Promise<RendererSafeResult<ArtifactSourceFileDeletionReceipt>>;
  openArtifactLocation(
    command: ArtifactOpenLocationCommand,
  ): Promise<RendererSafeResult<ArtifactOpenLocationReceipt>>;
  exportArtifact(
    command: ArtifactExportCommand,
  ): Promise<RendererSafeResult<ArtifactExportReceipt>>;
  listPendingUserConfirmations(
    query: ListPendingUserConfirmationsQuery,
  ): Promise<RendererSafeResult<readonly UserConfirmationProjection[]>>;
  controlTask(
    command: TaskControlCommand,
  ): Promise<RendererSafeResult<TaskControlReceipt>>;
  submitTurn(
    command: SubmitTurnCommand,
  ): Promise<RendererSafeResult<SubmitTurnReceipt>>;
  querySubmitTurn(
    query: SubmitTurnStatusQuery,
  ): Promise<RendererSafeResult<SubmitTurnReceipt>>;
  onDesktopEvent(listener: (event: DesktopRendererEvent) => void): () => void;
}
