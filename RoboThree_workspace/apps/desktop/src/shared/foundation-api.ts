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
import type {
  CompatibilityProjectionV1Alpha4,
  CompatibilityQueryV1Alpha4,
  DesktopErrorEnvelopeV1Alpha4,
  SubmitTurnCommandV1Alpha4,
  SubmitTurnReceiptV1Alpha4,
  SubmitTurnStatusQueryV1Alpha4,
} from "@robothree/contracts/desktop-local/v1alpha4";
import type {
  CompatibilityProjectionV1Alpha5,
  CompatibilityQueryV1Alpha5,
  DesktopErrorEnvelopeV1Alpha5,
  GetReasoningModePreferenceQueryV1Alpha5,
  PreviewReasoningModeQueryV1Alpha5,
  ReasoningModePreferenceProjectionV1Alpha5,
  ReasoningModePreferenceReceiptV1Alpha5,
  ReasoningModePreviewV1Alpha5,
  SubmitTurnCommandV1Alpha5,
  SubmitTurnReceiptV1Alpha5,
  SubmitTurnStatusQueryV1Alpha5,
  UpdateReasoningModePreferenceCommandV1Alpha5,
} from "@robothree/contracts/desktop-local/v1alpha5";
import type {
  GetTaskReasoningModeQueryV1Alpha1,
  TaskReasoningErrorEnvelopeV1Alpha1,
  TaskReasoningModeProjectionV1Alpha1,
} from "@robothree/contracts/desktop-local/task-reasoning/v1alpha1";
import type {
  GetPersonalModelQueryV1Alpha1,
  ListPersonalModelsQueryV1Alpha1,
  PersonalModelManagementCompatibilityProjectionV1Alpha1,
  PersonalModelManagementCompatibilityQueryV1Alpha1,
  PersonalModelManagementErrorEnvelopeV1Alpha1,
  PersonalModelPageV1Alpha1,
  PersonalModelSafeProjectionV1Alpha1,
} from "@robothree/contracts/desktop-local/personal-model-management/v1alpha1";
import type {
  CreatePersonalModelCommandV1Alpha2,
  DeletePersonalModelCommandV1Alpha2,
  GetPersonalModelQueryV1Alpha2,
  ListPersonalModelsQueryV1Alpha2,
  PersonalModelManagementCompatibilityProjectionV1Alpha2,
  PersonalModelManagementCompatibilityQueryV1Alpha2,
  PersonalModelManagementErrorEnvelopeV1Alpha2,
  PersonalModelOperationReceiptV1Alpha2,
  PersonalModelPageV1Alpha2,
  PersonalModelSafeProjectionV1Alpha2,
  QueryPersonalModelOperationV1Alpha2,
  RevealPersonalModelKeyCommandV1Alpha2,
  RevealedPersonalModelKeyV1Alpha2,
  UpdatePersonalModelCommandV1Alpha2,
} from "@robothree/contracts/desktop-local/personal-model-management/v1alpha2";
import type {
  AgentLifecycleSafeError,
  CreateRobotDraftCommand,
  GetMyRobotDraftQuery,
  ListMyRobotDraftsQuery,
  RobotDraftDetail,
  RobotDraftPage,
  RobotLifecycleMutationReceipt,
  StartRobotDraftTestCommand,
  SubmitRobotDraftCommand,
  UpdateRobotDraftCommand,
  WithdrawRobotSubmissionCommand,
} from "@robothree/contracts/agent-lifecycle/v1alpha1";
import {
  ArtifactCatalogItemProjectionSchema,
  RegisterWorkspaceArtifactCommandSchema,
  WorkspaceGrantProjectionSchema,
} from "@robothree/contracts";

export const WorkbenchAttachmentPickerCommandSchema =
  RegisterWorkspaceArtifactCommandSchema.extend({
    workspaceGrantId: WorkspaceGrantProjectionSchema.shape.workspaceGrantId,
  }).strict();

export const WorkbenchAttachmentValidationCommandSchema =
  RegisterWorkspaceArtifactCommandSchema.extend({
    workspaceGrantId: WorkspaceGrantProjectionSchema.shape.workspaceGrantId,
    artifact: ArtifactCatalogItemProjectionSchema,
  }).strict();

export type WorkbenchAttachmentPickerCommand = ReturnType<
  typeof WorkbenchAttachmentPickerCommandSchema.parse
>;
export type WorkbenchAttachmentValidationCommand = ReturnType<
  typeof WorkbenchAttachmentValidationCommandSchema.parse
>;

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
  pickWorkbenchAttachment:
    "robothree:workbench-attachment:v1alpha1:pick",
  validateWorkbenchAttachment:
    "robothree:workbench-attachment:v1alpha1:validate",
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

export const DESKTOP_V1ALPHA4_IPC_CHANNELS = Object.freeze({
  compatibility: "robothree:v1alpha4:compatibility",
  submitTurn: "robothree:v1alpha4:submit-turn",
  querySubmitTurn: "robothree:v1alpha4:query-submit-turn",
} as const);

export const DESKTOP_V1ALPHA5_IPC_CHANNELS = Object.freeze({
  compatibility: "robothree:v1alpha5:compatibility",
  previewReasoningMode: "robothree:v1alpha5:preview-reasoning-mode",
  getReasoningModePreference: "robothree:v1alpha5:get-reasoning-mode-preference",
  updateReasoningModePreference: "robothree:v1alpha5:update-reasoning-mode-preference",
  submitTurn: "robothree:v1alpha5:submit-turn",
  getSubmitTurnStatus: "robothree:v1alpha5:get-submit-turn-status",
} as const);

export const DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS = Object.freeze({
  getTaskReasoningMode: "robothree:task-reasoning:v1alpha1:get",
} as const);

export const PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS = Object.freeze({
  compatibility: "robothree:personal-model:v1alpha1:compatibility",
  listPersonalModels: "robothree:personal-model:v1alpha1:list",
  getPersonalModel: "robothree:personal-model:v1alpha1:detail",
} as const);

export const PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS = Object.freeze({
  compatibility: "robothree:personal-model:v1alpha2:compatibility",
  listPersonalModels: "robothree:personal-model:v1alpha2:list",
  getPersonalModel: "robothree:personal-model:v1alpha2:detail",
  createPersonalModel: "robothree:personal-model:v1alpha2:create",
  updatePersonalModel: "robothree:personal-model:v1alpha2:update",
  deletePersonalModel: "robothree:personal-model:v1alpha2:delete",
  revealPersonalModelKey: "robothree:personal-model:v1alpha2:reveal",
  queryPersonalModelOperation: "robothree:personal-model:v1alpha2:operation",
} as const);

export const AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS = Object.freeze({
  listMyRobotDrafts: "robothree:agent-lifecycle:v1alpha1:list-my-drafts",
  getMyRobotDraft: "robothree:agent-lifecycle:v1alpha1:get-my-draft",
  createRobotDraft: "robothree:agent-lifecycle:v1alpha1:create-draft",
  updateRobotDraft: "robothree:agent-lifecycle:v1alpha1:update-draft",
  startRobotDraftTest: "robothree:agent-lifecycle:v1alpha1:start-test",
  submitRobotDraft: "robothree:agent-lifecycle:v1alpha1:submit-draft",
  withdrawRobotSubmission: "robothree:agent-lifecycle:v1alpha1:withdraw-submission",
} as const);

export type AgentLifecycleV1Alpha1InvokeChannel =
  (typeof AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS)[keyof
    typeof AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS];

export type PersonalModelV1Alpha2InvokeChannel =
  (typeof PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS)[keyof typeof PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS];

export type PersonalModelV1Alpha1InvokeChannel =
  (typeof PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS)[keyof
    typeof PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS];

export type DesktopTaskReasoningV1Alpha1InvokeChannel =
  (typeof DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS)[keyof
    typeof DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS];

export type DesktopV1Alpha5InvokeChannel =
  (typeof DESKTOP_V1ALPHA5_IPC_CHANNELS)[keyof typeof DESKTOP_V1ALPHA5_IPC_CHANNELS];

export type DesktopV1Alpha4InvokeChannel =
  (typeof DESKTOP_V1ALPHA4_IPC_CHANNELS)[keyof typeof DESKTOP_V1ALPHA4_IPC_CHANNELS];

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

export type RendererSafeResultV1Alpha4<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: DesktopErrorEnvelopeV1Alpha4 }>;

export type RendererSafeResultV1Alpha5<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: DesktopErrorEnvelopeV1Alpha5 }>;

export type RendererTaskReasoningSafeResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: TaskReasoningErrorEnvelopeV1Alpha1 }>;

export type RendererPersonalModelManagementSafeResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: PersonalModelManagementErrorEnvelopeV1Alpha1 }>;

export type RendererAgentLifecycleSafeResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: AgentLifecycleSafeError }>;

export interface RoboThreeAgentLifecycleApiV1Alpha1 {
  readonly contractVersion: "agent-lifecycle.v1alpha1";
  listMyRobotDrafts(query: ListMyRobotDraftsQuery): Promise<RendererAgentLifecycleSafeResult<RobotDraftPage>>;
  getMyRobotDraft(query: GetMyRobotDraftQuery): Promise<RendererAgentLifecycleSafeResult<RobotDraftDetail>>;
  createRobotDraft(command: CreateRobotDraftCommand): Promise<RendererAgentLifecycleSafeResult<RobotLifecycleMutationReceipt>>;
  updateRobotDraft(command: UpdateRobotDraftCommand): Promise<RendererAgentLifecycleSafeResult<RobotLifecycleMutationReceipt>>;
  startRobotDraftTest(command: StartRobotDraftTestCommand): Promise<RendererAgentLifecycleSafeResult<RobotLifecycleMutationReceipt>>;
  submitRobotDraft(command: SubmitRobotDraftCommand): Promise<RendererAgentLifecycleSafeResult<RobotLifecycleMutationReceipt>>;
  withdrawRobotSubmission(command: WithdrawRobotSubmissionCommand): Promise<RendererAgentLifecycleSafeResult<RobotLifecycleMutationReceipt>>;
}

export type RendererPersonalModelManagementSafeResultV1Alpha2<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: PersonalModelManagementErrorEnvelopeV1Alpha2 }>;

export interface RoboThreePersonalModelApiV1Alpha2 {
  readonly contractVersion: "personal-model-management.v1alpha2";
  getCompatibility(query: PersonalModelManagementCompatibilityQueryV1Alpha2): Promise<RendererPersonalModelManagementSafeResultV1Alpha2<PersonalModelManagementCompatibilityProjectionV1Alpha2>>;
  listPersonalModels(query: ListPersonalModelsQueryV1Alpha2): Promise<RendererPersonalModelManagementSafeResultV1Alpha2<PersonalModelPageV1Alpha2>>;
  getPersonalModel(query: GetPersonalModelQueryV1Alpha2): Promise<RendererPersonalModelManagementSafeResultV1Alpha2<PersonalModelSafeProjectionV1Alpha2>>;
  createPersonalModel(command: CreatePersonalModelCommandV1Alpha2, apiKeyBytes: Uint8Array): Promise<RendererPersonalModelManagementSafeResultV1Alpha2<PersonalModelOperationReceiptV1Alpha2>>;
  updatePersonalModel(command: UpdatePersonalModelCommandV1Alpha2, apiKeyBytes?: Uint8Array): Promise<RendererPersonalModelManagementSafeResultV1Alpha2<PersonalModelOperationReceiptV1Alpha2>>;
  deletePersonalModel(command: DeletePersonalModelCommandV1Alpha2): Promise<RendererPersonalModelManagementSafeResultV1Alpha2<PersonalModelOperationReceiptV1Alpha2>>;
  revealPersonalModelKey(command: RevealPersonalModelKeyCommandV1Alpha2): Promise<RendererPersonalModelManagementSafeResultV1Alpha2<RevealedPersonalModelKeyV1Alpha2>>;
  queryPersonalModelOperation(query: QueryPersonalModelOperationV1Alpha2): Promise<RendererPersonalModelManagementSafeResultV1Alpha2<PersonalModelOperationReceiptV1Alpha2>>;
}

export interface RoboThreePersonalModelReadApiV1Alpha1 {
  readonly contractVersion: "personal-model-management.v1alpha1";
  getCompatibility(
    query: PersonalModelManagementCompatibilityQueryV1Alpha1,
  ): Promise<RendererPersonalModelManagementSafeResult<
    PersonalModelManagementCompatibilityProjectionV1Alpha1
  >>;
  listPersonalModels(
    query: ListPersonalModelsQueryV1Alpha1,
  ): Promise<RendererPersonalModelManagementSafeResult<PersonalModelPageV1Alpha1>>;
  getPersonalModel(
    query: GetPersonalModelQueryV1Alpha1,
  ): Promise<RendererPersonalModelManagementSafeResult<PersonalModelSafeProjectionV1Alpha1>>;
}

export interface RoboThreeDesktopTaskReasoningApiV1Alpha1 {
  readonly contractVersion: "task-reasoning.v1alpha1";
  getTaskReasoningMode(
    query: GetTaskReasoningModeQueryV1Alpha1,
  ): Promise<RendererTaskReasoningSafeResult<TaskReasoningModeProjectionV1Alpha1>>;
}

export interface RoboThreeDesktopApiV1Alpha5 {
  readonly contractVersion: "v1alpha5";
  getCompatibility(
    query: CompatibilityQueryV1Alpha5,
  ): Promise<RendererSafeResultV1Alpha5<CompatibilityProjectionV1Alpha5>>;
  previewReasoningMode(
    query: PreviewReasoningModeQueryV1Alpha5,
  ): Promise<RendererSafeResultV1Alpha5<ReasoningModePreviewV1Alpha5>>;
  getReasoningModePreference(
    query: GetReasoningModePreferenceQueryV1Alpha5,
  ): Promise<RendererSafeResultV1Alpha5<ReasoningModePreferenceProjectionV1Alpha5>>;
  updateReasoningModePreference(
    command: UpdateReasoningModePreferenceCommandV1Alpha5,
  ): Promise<RendererSafeResultV1Alpha5<ReasoningModePreferenceReceiptV1Alpha5>>;
  submitTurn(
    command: SubmitTurnCommandV1Alpha5,
  ): Promise<RendererSafeResultV1Alpha5<SubmitTurnReceiptV1Alpha5>>;
  getSubmitTurnStatus(
    query: SubmitTurnStatusQueryV1Alpha5,
  ): Promise<RendererSafeResultV1Alpha5<SubmitTurnReceiptV1Alpha5>>;
}

export interface RoboThreeDesktopApiV1Alpha4 {
  readonly contractVersion: "v1alpha4";
  getCompatibility(
    query: CompatibilityQueryV1Alpha4,
  ): Promise<RendererSafeResultV1Alpha4<CompatibilityProjectionV1Alpha4>>;
  submitTurn(
    command: SubmitTurnCommandV1Alpha4,
  ): Promise<RendererSafeResultV1Alpha4<SubmitTurnReceiptV1Alpha4>>;
  querySubmitTurn(
    query: SubmitTurnStatusQueryV1Alpha4,
  ): Promise<RendererSafeResultV1Alpha4<SubmitTurnReceiptV1Alpha4>>;
}

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
  pickWorkbenchAttachment(
    command: WorkbenchAttachmentPickerCommand,
  ): Promise<RendererSafeResult<RegisterWorkspaceArtifactReceipt | undefined>>;
  validateWorkbenchAttachment(
    command: WorkbenchAttachmentValidationCommand,
  ): Promise<RendererSafeResult<RegisterWorkspaceArtifactReceipt>>;
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
