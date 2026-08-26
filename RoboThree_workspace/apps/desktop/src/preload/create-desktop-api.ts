import {
  AgentProjectionSchema,
  ArtifactHtmlPreviewProjectionSchema,
  ArtifactHtmlPreviewQuerySchema,
  ArtifactCatalogProjectionSchema,
  ArtifactExportCommandSchema,
  ArtifactExportReceiptSchema,
  ArtifactLifecycleReceiptSchema,
  ArtifactOpenLocationCommandSchema,
  ArtifactOpenLocationReceiptSchema,
  ArtifactPreviewCloseReceiptSchema,
  ArtifactPreviewQuerySchema,
  ArtifactTextPreviewProjectionSchema,
  ConversationSnapshotQuerySchema,
  ConversationSnapshotSchema,
  CreateSessionCommandSchema,
  DeleteSessionCommandSchema,
  DesktopErrorEnvelopeSchema,
  DesktopEventEnvelopeSchema,
  DesktopDisplayTextSchema,
  EntityIdSchema,
  ListAgentsQuerySchema,
  ListArtifactsQuerySchema,
  ListModelsQuerySchema,
  ListPendingUserConfirmationsQuerySchema,
  ListTasksQuerySchema,
  ListSessionsQuerySchema,
  ListWorkspaceGrantsQuerySchema,
  ModelProjectionSchema,
  OpenSessionQuerySchema,
  RenameSessionCommandSchema,
  ReplayResetRequiredSchema,
  RevokeWorkspaceGrantCommandSchema,
  RuntimeStatusProjectionSchema,
  RuntimeStatusQuerySchema,
  SessionSummarySchema,
  SubmitTurnCommandSchema,
  SubmitTurnReceiptSchema,
  SubmitTurnStatusQuerySchema,
  TaskDetailProjectionSchema,
  TaskDetailQuerySchema,
  TaskControlCommandSchema,
  TaskControlReceiptSchema,
  TaskSummaryProjectionSchema,
  CloseArtifactPreviewCommandSchema,
  DeleteArtifactSourceFileCommandSchema,
  DeleteArtifactRecordCommandSchema,
  ArtifactSourceFileDeletionReceiptSchema,
  RestoreArtifactRecordCommandSchema,
  RegisterWorkspaceArtifactCommandSchema,
  RegisterWorkspaceArtifactReceiptSchema,
  SetArtifactLifecycleCommandSchema,
  UserConfirmationProjectionSchema,
  WorkspaceGrantProjectionSchema,
  WorkspaceAccessModeSchema,
  type CompatibilityQueryV1Alpha2,
  type GetRobotCatalogQuery,
  type GetToolCatalogQuery,
  type ListWorkspaceEntriesQuery,
  type ListRobotCatalogQuery,
  type ListToolCatalogQuery,
  type OpenTaskWorkspaceLocationCommand,
  CompatibilityProjectionV1Alpha2Schema,
  CompatibilityQueryV1Alpha2Schema,
  DesktopErrorEnvelopeV1Alpha2Schema,
  GetRobotCatalogQuerySchema,
  GetToolCatalogQuerySchema,
  ListWorkspaceEntriesQuerySchema,
  ListRobotCatalogQuerySchema,
  ListToolCatalogQuerySchema,
  OpenTaskWorkspaceLocationCommandSchema,
  RobotCatalogDetailSchema,
  RobotCatalogPageSchema,
  TaskWorkspaceOpenReceiptSchema,
  ToolCatalogDetailSchema,
  ToolCatalogPageSchema,
  WorkspaceDirectoryProjectionSchema,
} from "@robothree/contracts";

import {
  DESKTOP_IPC_CHANNELS,
  DESKTOP_V1ALPHA2_IPC_CHANNELS,
  FOUNDATION_STATUS_CHANNEL,
  type CreateWorkspaceGrantFromPickerRequest,
  type DesktopInvokeChannel,
  type DesktopRendererEvent,
  type FoundationStatus,
  type RoboThreeDesktopApi,
  type RoboThreeDesktopApiV1Alpha1,
  type RendererSafeResult,
  type DesktopV1Alpha2InvokeChannel,
  type RoboThreeDesktopApiV1Alpha2,
  type RendererSafeResultV1Alpha2,
} from "../shared/foundation-api.js";

export type InvokeFoundationStatus = (channel: typeof FOUNDATION_STATUS_CHANNEL) => Promise<FoundationStatus>;

export function createDesktopApi(invoke: InvokeFoundationStatus): RoboThreeDesktopApi {
  const api: RoboThreeDesktopApi = {
    getFoundationStatus: () => invoke(FOUNDATION_STATUS_CHANNEL),
  };
  return Object.freeze(api);
}

export type InvokeDesktopBusinessApi = (
  channel: DesktopInvokeChannel,
  input: unknown,
) => Promise<unknown>;

export type InvokeDesktopV1Alpha2Api = (
  channel: DesktopV1Alpha2InvokeChannel,
  input: unknown,
) => Promise<unknown>;

export function createDesktopApiV1Alpha2(
  invokeRaw: InvokeDesktopV1Alpha2Api,
): RoboThreeDesktopApiV1Alpha2 {
  const invoke = <T>(
    channel: DesktopV1Alpha2InvokeChannel,
    request: unknown,
    parser: Parser<T>,
  ): Promise<RendererSafeResultV1Alpha2<T>> => invokeRaw(channel, request)
    .then((value) => parseSafeResultV1Alpha2(value, parser));
  return Object.freeze({
    contractVersion: "v1alpha2" as const,
    getCompatibility: (query: CompatibilityQueryV1Alpha2) => invoke(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.compatibility,
      CompatibilityQueryV1Alpha2Schema.parse(query),
      CompatibilityProjectionV1Alpha2Schema,
    ),
    listRobotCatalog: (query: ListRobotCatalogQuery) => invoke(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.listRobotCatalog,
      ListRobotCatalogQuerySchema.parse(query),
      RobotCatalogPageSchema,
    ),
    getRobotCatalog: (query: GetRobotCatalogQuery) => invoke(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.getRobotCatalog,
      GetRobotCatalogQuerySchema.parse(query),
      RobotCatalogDetailSchema,
    ),
    listToolCatalog: (query: ListToolCatalogQuery) => invoke(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.listToolCatalog,
      ListToolCatalogQuerySchema.parse(query),
      ToolCatalogPageSchema,
    ),
    getToolCatalog: (query: GetToolCatalogQuery) => invoke(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.getToolCatalog,
      GetToolCatalogQuerySchema.parse(query),
      ToolCatalogDetailSchema,
    ),
    listWorkspaceEntries: (query: ListWorkspaceEntriesQuery) => invoke(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.listWorkspaceEntries,
      ListWorkspaceEntriesQuerySchema.parse(query),
      WorkspaceDirectoryProjectionSchema,
    ),
    openTaskWorkspaceLocation: (command: OpenTaskWorkspaceLocationCommand) => invoke(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.openTaskWorkspaceLocation,
      OpenTaskWorkspaceLocationCommandSchema.parse(command),
      TaskWorkspaceOpenReceiptSchema,
    ),
  });
}

export type SubscribeDesktopEvent = (
  channel: typeof DESKTOP_IPC_CHANNELS.desktopEvent,
  listener: (event: unknown) => void,
) => () => void;

export function createDesktopApiV1Alpha1(input: {
  invoke: InvokeDesktopBusinessApi;
  subscribe: SubscribeDesktopEvent;
}): RoboThreeDesktopApiV1Alpha1 {
  const invoke = <T>(
    channel: DesktopInvokeChannel,
    request: unknown,
    parser: Parser<T>,
  ): Promise<RendererSafeResult<T>> =>
    input.invoke(channel, request).then((value) => parseSafeResult(value, parser));

  const api: RoboThreeDesktopApiV1Alpha1 = {
    contractVersion: "v1alpha1" as const,
    getRuntimeStatus: (query) => invoke(
      DESKTOP_IPC_CHANNELS.runtimeStatus,
      RuntimeStatusQuerySchema.parse(query),
      RuntimeStatusProjectionSchema,
    ),
    createWorkspaceGrantFromPicker: (request) => invoke(
      DESKTOP_IPC_CHANNELS.createWorkspaceGrantFromPicker,
      parsePickerRequest(request),
      optional(WorkspaceGrantProjectionSchema),
    ),
    revokeWorkspaceGrant: (command) => invoke(
      DESKTOP_IPC_CHANNELS.revokeWorkspaceGrant,
      RevokeWorkspaceGrantCommandSchema.parse(command),
      WorkspaceGrantProjectionSchema,
    ),
    listWorkspaceGrants: (query) => invoke(
      DESKTOP_IPC_CHANNELS.listWorkspaceGrants,
      ListWorkspaceGrantsQuerySchema.parse(query),
      arrayOf(WorkspaceGrantProjectionSchema),
    ),
    createSession: (command) => invoke(
      DESKTOP_IPC_CHANNELS.createSession,
      CreateSessionCommandSchema.parse(command),
      SessionSummarySchema,
    ),
    renameSession: (command) => invoke(
      DESKTOP_IPC_CHANNELS.renameSession,
      RenameSessionCommandSchema.parse(command),
      SessionSummarySchema,
    ),
    deleteSession: (command) => invoke(
      DESKTOP_IPC_CHANNELS.deleteSession,
      DeleteSessionCommandSchema.parse(command),
      SessionSummarySchema,
    ),
    listSessions: (query) => invoke(
      DESKTOP_IPC_CHANNELS.listSessions,
      ListSessionsQuerySchema.parse(query),
      arrayOf(SessionSummarySchema),
    ),
    openSession: (query) => invoke(
      DESKTOP_IPC_CHANNELS.openSession,
      OpenSessionQuerySchema.parse(query),
      SessionSummarySchema,
    ),
    listAgents: (query) => invoke(
      DESKTOP_IPC_CHANNELS.listAgents,
      ListAgentsQuerySchema.parse(query),
      arrayOf(AgentProjectionSchema),
    ),
    listModels: (query) => invoke(
      DESKTOP_IPC_CHANNELS.listModels,
      ListModelsQuerySchema.parse(query),
      arrayOf(ModelProjectionSchema),
    ),
    loadConversationSnapshot: (query) => invoke(
      DESKTOP_IPC_CHANNELS.conversationSnapshot,
      ConversationSnapshotQuerySchema.parse(query),
      ConversationSnapshotSchema,
    ),
    listTasks: (query) => invoke(
      DESKTOP_IPC_CHANNELS.listTasks,
      ListTasksQuerySchema.parse(query),
      arrayOf(TaskSummaryProjectionSchema),
    ),
    loadTaskDetail: (query) => invoke(
      DESKTOP_IPC_CHANNELS.taskDetail,
      TaskDetailQuerySchema.parse(query),
      TaskDetailProjectionSchema,
    ),
    listArtifacts: (query) => invoke(
      DESKTOP_IPC_CHANNELS.listArtifacts,
      ListArtifactsQuerySchema.parse(query),
      ArtifactCatalogProjectionSchema,
    ),
    registerWorkspaceArtifactFromPicker: (command) => invoke(
      DESKTOP_IPC_CHANNELS.registerWorkspaceArtifactFromPicker,
      RegisterWorkspaceArtifactCommandSchema.parse(command),
      optional(RegisterWorkspaceArtifactReceiptSchema),
    ),
    previewArtifact: (query) => invoke(
      DESKTOP_IPC_CHANNELS.artifactPreview,
      ArtifactPreviewQuerySchema.parse(query),
      ArtifactTextPreviewProjectionSchema,
    ),
    startArtifactHtmlPreview: (query) => invoke(
      DESKTOP_IPC_CHANNELS.artifactHtmlPreview,
      ArtifactHtmlPreviewQuerySchema.parse(query),
      ArtifactHtmlPreviewProjectionSchema,
    ),
    closeArtifactPreview: (command) => invoke(
      DESKTOP_IPC_CHANNELS.closeArtifactPreview,
      CloseArtifactPreviewCommandSchema.parse(command),
      ArtifactPreviewCloseReceiptSchema,
    ),
    setArtifactLifecycle: (command) => invoke(
      DESKTOP_IPC_CHANNELS.setArtifactLifecycle,
      SetArtifactLifecycleCommandSchema.parse(command),
      ArtifactLifecycleReceiptSchema,
    ),
    deleteArtifactRecord: (command) => invoke(
      DESKTOP_IPC_CHANNELS.deleteArtifactRecord,
      DeleteArtifactRecordCommandSchema.parse(command),
      ArtifactLifecycleReceiptSchema,
    ),
    restoreArtifactRecord: (command) => invoke(
      DESKTOP_IPC_CHANNELS.restoreArtifactRecord,
      RestoreArtifactRecordCommandSchema.parse(command),
      ArtifactLifecycleReceiptSchema,
    ),
    deleteArtifactSourceFile: (command) => invoke(
      DESKTOP_IPC_CHANNELS.deleteArtifactSourceFile,
      DeleteArtifactSourceFileCommandSchema.parse(command),
      ArtifactSourceFileDeletionReceiptSchema,
    ),
    openArtifactLocation: (command) => invoke(
      DESKTOP_IPC_CHANNELS.openArtifactLocation,
      ArtifactOpenLocationCommandSchema.parse(command),
      ArtifactOpenLocationReceiptSchema,
    ),
    exportArtifact: (command) => invoke(
      DESKTOP_IPC_CHANNELS.exportArtifact,
      ArtifactExportCommandSchema.parse(command),
      ArtifactExportReceiptSchema,
    ),
    listPendingUserConfirmations: (query) => invoke(
      DESKTOP_IPC_CHANNELS.listPendingUserConfirmations,
      ListPendingUserConfirmationsQuerySchema.parse(query),
      arrayOf(UserConfirmationProjectionSchema),
    ),
    controlTask: (command) => invoke(
      DESKTOP_IPC_CHANNELS.taskControl,
      TaskControlCommandSchema.parse(command),
      TaskControlReceiptSchema,
    ),
    submitTurn: (command) => invoke(
      DESKTOP_IPC_CHANNELS.submitTurn,
      SubmitTurnCommandSchema.parse(command),
      SubmitTurnReceiptSchema,
    ),
    querySubmitTurn: (query) => invoke(
      DESKTOP_IPC_CHANNELS.submitTurnStatus,
      SubmitTurnStatusQuerySchema.parse(query),
      SubmitTurnReceiptSchema,
    ),
    onDesktopEvent(listener: (event: DesktopRendererEvent) => void) {
      if (typeof listener !== "function") {
        throw new Error("Desktop event listener must be a function");
      }
      return input.subscribe(DESKTOP_IPC_CHANNELS.desktopEvent, (value) => {
        const event = DesktopEventEnvelopeSchema.safeParse(value);
        if (event.success) {
          listener(event.data);
          return;
        }
        const reset = ReplayResetRequiredSchema.safeParse(value);
        if (reset.success) listener(reset.data);
      });
    },
  };
  return Object.freeze(api);
}

type Parser<T> = Readonly<{ parse(value: unknown): T }>;

function parseSafeResult<T>(
  value: unknown,
  parser: Parser<T>,
): RendererSafeResult<T> {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    throw new Error("Desktop Main returned an invalid result envelope");
  }
  const keys = Object.keys(value);
  if (value.ok) {
    if (!keys.every((key) => key === "ok" || key === "value")) {
      throw new Error("Desktop Main returned an invalid success envelope");
    }
    return { ok: true, value: parser.parse(value.value) };
  }
  if (!keys.every((key) => key === "ok" || key === "error")) {
    throw new Error("Desktop Main returned an invalid error envelope");
  }
  return {
    ok: false,
    error: DesktopErrorEnvelopeSchema.parse(value.error),
  };
}

function parseSafeResultV1Alpha2<T>(
  value: unknown,
  parser: Parser<T>,
): RendererSafeResultV1Alpha2<T> {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    throw new Error("Desktop Main returned an invalid v1alpha2 result envelope");
  }
  const keys = Object.keys(value);
  if (value.ok) {
    if (!keys.every((key) => key === "ok" || key === "value")) {
      throw new Error("Desktop Main returned an invalid v1alpha2 success envelope");
    }
    return { ok: true, value: parser.parse(value.value) };
  }
  if (!keys.every((key) => key === "ok" || key === "error")) {
    throw new Error("Desktop Main returned an invalid v1alpha2 error envelope");
  }
  return { ok: false, error: DesktopErrorEnvelopeV1Alpha2Schema.parse(value.error) };
}

function parsePickerRequest(
  input: CreateWorkspaceGrantFromPickerRequest,
): CreateWorkspaceGrantFromPickerRequest {
  if (!isRecord(input) || Object.keys(input).length !== 5) {
    throw new Error("Invalid workspace picker request");
  }
  return {
    commandId: EntityIdSchema.parse(input.commandId),
    correlationId: EntityIdSchema.parse(input.correlationId),
    clientInstanceId: EntityIdSchema.parse(input.clientInstanceId),
    displayName: DesktopDisplayTextSchema.parse(input.displayName),
    accessMode: WorkspaceAccessModeSchema.parse(input.accessMode),
  };
}

function arrayOf<T>(parser: Parser<T>): Parser<readonly T[]> {
  return {
    parse(value) {
      if (!Array.isArray(value)) throw new Error("Expected an array");
      return value.map((item) => parser.parse(item));
    },
  };
}

function optional<T>(parser: Parser<T>): Parser<T | undefined> {
  return {
    parse: (value) => value === undefined ? undefined : parser.parse(value),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
