import {
  AgentProjectionSchema,
  DeleteArtifactSourceFileCommandSchema,
  DeleteArtifactRecordCommandSchema,
  ArtifactPreviewQuerySchema,
  ArtifactCatalogProjectionSchema,
  ArtifactSourceFileDeletionReceiptSchema,
  ArtifactLifecycleReceiptSchema,
  RegisterWorkspaceArtifactCommandSchema,
  RegisterWorkspaceArtifactReceiptSchema,
  RestoreArtifactRecordCommandSchema,
  SetArtifactLifecycleCommandSchema,
  ArtifactTextPreviewProjectionSchema,
  CompatibilityProjectionSchema,
  CompatibilityQuerySchema,
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
  ToolCatalogDetailSchema,
  ToolCatalogPageSchema,
  WorkspaceDirectoryProjectionSchema,
  ConversationSnapshotQuerySchema,
  ConversationSnapshotSchema,
  CreateSessionCommandSchema,
  CreateWorkspaceGrantCommandSchema,
  DeleteSessionCommandSchema,
  DesktopErrorEnvelopeSchema,
  DesktopEventEnvelopeSchema,
  DesktopEventSubscriptionQuerySchema,
  DesktopHeartbeatSchema,
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
  UserConfirmationProjectionSchema,
  WorkspaceGrantProjectionSchema,
  type AgentProjection,
  type ArtifactPreviewQuery,
  type ArtifactCatalogProjection,
  type ArtifactSourceFileDeletionReceipt,
  type RegisterWorkspaceArtifactCommand,
  type RegisterWorkspaceArtifactReceipt,
  type SetArtifactLifecycleCommand,
  type CompatibilityProjection,
  type CompatibilityQuery,
  type CompatibilityQueryV1Alpha2,
  type GetRobotCatalogQuery,
  type GetToolCatalogQuery,
  type ListWorkspaceEntriesQuery,
  type ListRobotCatalogQuery,
  type ListToolCatalogQuery,
  type OpenTaskWorkspaceLocationCommand,
  type ConversationSnapshot,
  type ConversationSnapshotQuery,
  type CreateSessionCommand,
  type CreateWorkspaceGrantCommand,
  type DeleteArtifactSourceFileCommand,
  type DeleteArtifactRecordCommand,
  type DeleteSessionCommand,
  type DesktopErrorEnvelope,
  type DesktopEventEnvelope,
  type DesktopEventSubscriptionQuery,
  type DesktopHeartbeat,
  type ListAgentsQuery,
  type ListArtifactsQuery,
  type ListModelsQuery,
  type ListPendingUserConfirmationsQuery,
  type ListTasksQuery,
  type ListSessionsQuery,
  type ListWorkspaceGrantsQuery,
  type ModelProjection,
  type OpenSessionQuery,
  type RenameSessionCommand,
  type ReplayResetRequired,
  type RevokeWorkspaceGrantCommand,
  type RuntimeStatusProjection,
  type RuntimeStatusQuery,
  type SessionSummary,
  type RestoreArtifactRecordCommand,
  type SubmitTurnCommand,
  type SubmitTurnReceipt,
  type SubmitTurnStatusQuery,
  type TaskDetailQuery,
  type TaskControlCommand,
  type WorkspaceGrantProjection,
} from "@robothree/contracts";

const CORE_PRIVATE_ORIGIN = "robothree://desktop-main";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SSE_FRAME_BYTES = 256 * 1024;

const ROUTES = Object.freeze({
  compatibilityV1Alpha2: "/v1alpha2/control/compatibility",
  listRobotCatalogV1Alpha2: "/v1alpha2/catalog/robots/list",
  getRobotCatalogV1Alpha2: "/v1alpha2/catalog/robots/detail",
  listToolCatalogV1Alpha2: "/v1alpha2/catalog/tools/list",
  getToolCatalogV1Alpha2: "/v1alpha2/catalog/tools/detail",
  workspaceEntriesV1Alpha2: "/v1alpha2/workspaces/entries",
  workspaceRevealAuthorityV1Alpha2: "/v1alpha2/workspaces/reveal-authority",
  compatibility: "/v1alpha1/control/compatibility",
  runtimeStatus: "/v1alpha1/control/runtime-status",
  registerWorkspaceSelection: "/v1alpha1/workspaces/register-selection",
  discardWorkspaceSelection: "/v1alpha1/workspaces/discard-selection",
  createWorkspaceGrant: "/v1alpha1/workspaces/create",
  revokeWorkspaceGrant: "/v1alpha1/workspaces/revoke",
  listWorkspaceGrants: "/v1alpha1/workspaces/list",
  listWorkspaceGrantAuthorities: "/v1alpha1/workspaces/private-authorities",
  createSession: "/v1alpha1/sessions/create",
  renameSession: "/v1alpha1/sessions/rename",
  deleteSession: "/v1alpha1/sessions/delete",
  listSessions: "/v1alpha1/sessions/list",
  openSession: "/v1alpha1/sessions/open",
  listAgents: "/v1alpha1/catalog/agents",
  listModels: "/v1alpha1/catalog/models",
  conversationSnapshot: "/v1alpha1/conversations/snapshot",
  listTasks: "/v1alpha1/tasks/list",
  taskDetail: "/v1alpha1/tasks/detail",
  artifactPreview: "/v1alpha1/artifacts/preview",
  artifactList: "/v1alpha1/artifacts/list",
  artifactRegister: "/v1alpha1/artifacts/register",
  artifactLifecycle: "/v1alpha1/artifacts/lifecycle",
  artifactRecordDelete: "/v1alpha1/artifacts/record/delete",
  artifactRecordRestore: "/v1alpha1/artifacts/record/restore",
  artifactSourceDeletePrepare: "/v1alpha1/artifacts/source/delete/prepare",
  artifactSourceDeleteCommit: "/v1alpha1/artifacts/source/delete/commit",
  artifactFileSource: "/v1alpha1/artifacts/file-source",
  listPendingUserConfirmations: "/v1alpha1/confirmations/pending",
  taskControl: "/v1alpha1/tasks/control",
  submitTurn: "/v1alpha1/turns/submit",
  submitTurnStatus: "/v1alpha1/turns/status",
  events: "/v1alpha1/events",
});

export type CorePrivateResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: DesktopErrorEnvelope }>;

export type CorePrivateResultV1Alpha2<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ReturnType<typeof DesktopErrorEnvelopeV1Alpha2Schema.parse> }>;

type Parser<T> = Readonly<{ parse(value: unknown): T }>;

export type ArtifactFileSource = Readonly<{
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

export type WorkspaceGrantAuthority = Readonly<{
  workspaceGrantId: string;
  displayName: string;
  rootDisplayPath: string;
  rootRealPath: string;
  accessMode: "read" | "read_write";
  status: "active";
}>;

export type ConsumedWorkspaceRevealAuthority = Readonly<{
  commandId: string;
  taskId: string;
  workspaceGrantId: string;
  root: Readonly<{
    rootRealPath: string;
    device: string;
    inode: string;
    mode: number;
  }>;
}>;

const ArtifactFileSourceSchema: Parser<ArtifactFileSource> = {
  parse: (value) => {
    if (!isRecord(value) || Object.keys(value).some((key) =>
      ![
        "artifactId",
        "taskId",
        "displayName",
        "relativePath",
        "workspaceGrantId",
        "rootRealPath",
      ].includes(key)
    )) throw new Error("Core returned an invalid artifact file source");
    const source: ArtifactFileSource = {
      artifactId: requireBoundedString(value.artifactId, /^artifact:[0-9a-f]{64}$/u, 256),
      ...(value.taskId === undefined
        ? {}
        : { taskId: requireBoundedString(value.taskId, /^task:.+/u, 256) }),
      displayName: requireBoundedString(value.displayName, undefined, 320),
      relativePath: requireBoundedString(value.relativePath, undefined, 1024),
      workspaceGrantId: requireBoundedString(value.workspaceGrantId, undefined, 256),
      rootRealPath: requireBoundedString(value.rootRealPath, undefined, 4096),
    };
    if (!isSafeRelativePath(source.relativePath)) {
      throw new Error("Core returned an unsafe artifact relative path");
    }
    return Object.freeze(source);
  },
};

const PreparedArtifactSourceFileDeletionSchema: Parser<
  PreparedArtifactSourceFileDeletion | ArtifactSourceFileDeletionReceipt
> = {
  parse: (value) => {
    const receipt = ArtifactSourceFileDeletionReceiptSchema.safeParse(value);
    if (receipt.success) return receipt.data;
    if (!isRecord(value) || Object.keys(value).some((key) =>
      ![
        "commandId",
        "requestDigest",
        "artifactId",
        "taskId",
        "displayName",
        "relativePath",
        "workspaceGrantId",
        "rootRealPath",
        "expectedArtifactRevision",
        "expectedConfirmationText",
      ].includes(key)
    )) throw new Error("Core returned an invalid artifact source delete preparation");
    const prepared: PreparedArtifactSourceFileDeletion = {
      commandId: requireBoundedString(value.commandId, undefined, 128),
      requestDigest: requireBoundedString(value.requestDigest, /^sha256:[0-9a-f]{64}$/u, 80),
      artifactId: requireBoundedString(value.artifactId, /^artifact:[0-9a-f]{64}$/u, 256),
      ...(value.taskId === undefined
        ? {}
        : { taskId: requireBoundedString(value.taskId, /^task:.+/u, 256) }),
      displayName: requireBoundedString(value.displayName, undefined, 320),
      relativePath: requireBoundedString(value.relativePath, undefined, 1024),
      workspaceGrantId: requireBoundedString(value.workspaceGrantId, undefined, 256),
      rootRealPath: requireBoundedString(value.rootRealPath, undefined, 4096),
      expectedArtifactRevision: requireNonnegativeInteger(value.expectedArtifactRevision),
      expectedConfirmationText: requireBoundedString(value.expectedConfirmationText, undefined, 512),
    };
    if (!isSafeRelativePath(prepared.relativePath)) {
      throw new Error("Core returned an unsafe artifact source delete path");
    }
    return Object.freeze(prepared);
  },
};

const WorkspaceGrantAuthoritySchema: Parser<WorkspaceGrantAuthority> = {
  parse: (value) => {
    if (!isRecord(value) || Object.keys(value).some((key) =>
      ![
        "workspaceGrantId",
        "displayName",
        "rootDisplayPath",
        "rootRealPath",
        "accessMode",
        "status",
      ].includes(key)
    )) throw new Error("Core returned an invalid workspace authority");
    const authority: WorkspaceGrantAuthority = {
      workspaceGrantId: requireBoundedString(value.workspaceGrantId, undefined, 256),
      displayName: requireBoundedString(value.displayName, undefined, 320),
      rootDisplayPath: requireBoundedString(value.rootDisplayPath, undefined, 4096),
      rootRealPath: requireBoundedString(value.rootRealPath, undefined, 4096),
      accessMode: value.accessMode === "read" || value.accessMode === "read_write"
        ? value.accessMode
        : (() => {
          throw new Error("Core returned an invalid workspace authority access mode");
        })(),
      status: value.status === "active"
        ? value.status
        : (() => {
          throw new Error("Core returned an invalid workspace authority status");
        })(),
    };
    return Object.freeze(authority);
  },
};

const WorkspaceRevealPreparationSchema: Parser<Readonly<{ authorityToken: string }>> = {
  parse: (value) => {
    if (
      !isRecord(value)
      || Object.keys(value).length !== 1
      || typeof value.authorityToken !== "string"
      || !/^wra1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value.authorityToken)
      || value.authorityToken.length > 8192
    ) throw new Error("Core returned an invalid workspace reveal authority");
    return Object.freeze({ authorityToken: value.authorityToken });
  },
};

const ConsumedWorkspaceRevealAuthoritySchema: Parser<ConsumedWorkspaceRevealAuthority> = {
  parse: (value) => {
    if (
      !isRecord(value)
      || Object.keys(value).some((key) => !["commandId", "taskId", "workspaceGrantId", "root"].includes(key))
      || !isRecord(value.root)
      || Object.keys(value.root).some((key) => !["rootRealPath", "device", "inode", "mode"].includes(key))
    ) throw new Error("Core returned an invalid consumed workspace reveal authority");
    const root = {
      rootRealPath: requireBoundedString(value.root.rootRealPath, undefined, 4096),
      device: requireBoundedString(value.root.device, /^[0-9]+$/u, 64),
      inode: requireBoundedString(value.root.inode, /^[0-9]+$/u, 64),
      mode: requireNonnegativeInteger(value.root.mode),
    };
    return Object.freeze({
      commandId: requireBoundedString(value.commandId, undefined, 128),
      taskId: requireBoundedString(value.taskId, /^task:/u, 256),
      workspaceGrantId: requireBoundedString(value.workspaceGrantId, undefined, 256),
      root: Object.freeze(root),
    });
  },
};

export class CorePrivateClient {
  readonly #baseUrl: string;
  readonly #authorizationToken: string;

  constructor(input: { baseUrl: string; authorizationToken: string }) {
    const url = new URL(input.baseUrl);
    if (
      url.protocol !== "http:"
      || url.hostname !== "127.0.0.1"
      || url.username !== ""
      || url.password !== ""
      || url.pathname !== "/"
      || url.search !== ""
      || url.hash !== ""
      || input.authorizationToken.length < 32
    ) {
      throw new Error("Core private client requires a tokenized loopback endpoint");
    }
    this.#baseUrl = url.origin;
    this.#authorizationToken = input.authorizationToken;
  }

  compatibility(input: CompatibilityQuery) {
    return this.#post(
      ROUTES.compatibility,
      CompatibilityQuerySchema.parse(input),
      CompatibilityProjectionSchema,
    );
  }

  compatibilityV1Alpha2(input: CompatibilityQueryV1Alpha2) {
    return this.#postV1Alpha2(
      ROUTES.compatibilityV1Alpha2,
      CompatibilityQueryV1Alpha2Schema.parse(input),
      CompatibilityProjectionV1Alpha2Schema,
      3_000,
    );
  }

  listWorkspaceEntriesV1Alpha2(input: ListWorkspaceEntriesQuery) {
    return this.#postV1Alpha2(
      ROUTES.workspaceEntriesV1Alpha2,
      ListWorkspaceEntriesQuerySchema.parse(input),
      WorkspaceDirectoryProjectionSchema,
      5_000,
    );
  }

  listRobotCatalogV1Alpha2(input: ListRobotCatalogQuery) {
    return this.#postV1Alpha2(
      ROUTES.listRobotCatalogV1Alpha2,
      ListRobotCatalogQuerySchema.parse(input),
      RobotCatalogPageSchema,
      5_000,
    );
  }

  getRobotCatalogV1Alpha2(input: GetRobotCatalogQuery) {
    return this.#postV1Alpha2(
      ROUTES.getRobotCatalogV1Alpha2,
      GetRobotCatalogQuerySchema.parse(input),
      RobotCatalogDetailSchema,
      5_000,
    );
  }

  listToolCatalogV1Alpha2(input: ListToolCatalogQuery) {
    return this.#postV1Alpha2(
      ROUTES.listToolCatalogV1Alpha2,
      ListToolCatalogQuerySchema.parse(input),
      ToolCatalogPageSchema,
      5_000,
    );
  }

  getToolCatalogV1Alpha2(input: GetToolCatalogQuery) {
    return this.#postV1Alpha2(
      ROUTES.getToolCatalogV1Alpha2,
      GetToolCatalogQuerySchema.parse(input),
      ToolCatalogDetailSchema,
      5_000,
    );
  }

  prepareWorkspaceRevealV1Alpha2(input: OpenTaskWorkspaceLocationCommand) {
    const command = OpenTaskWorkspaceLocationCommandSchema.parse(input);
    return this.#postV1Alpha2(
      ROUTES.workspaceRevealAuthorityV1Alpha2,
      { phase: "prepare", command },
      WorkspaceRevealPreparationSchema,
      3_000,
    );
  }

  consumeWorkspaceRevealV1Alpha2(input: Readonly<{
    command: OpenTaskWorkspaceLocationCommand;
    authorityToken: string;
  }>) {
    const command = OpenTaskWorkspaceLocationCommandSchema.parse(input.command);
    if (!/^wra1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(input.authorityToken)) {
      throw new Error("Workspace reveal authority token is invalid");
    }
    return this.#postV1Alpha2(
      ROUTES.workspaceRevealAuthorityV1Alpha2,
      { phase: "consume", command, authorityToken: input.authorityToken },
      ConsumedWorkspaceRevealAuthoritySchema,
      3_000,
    );
  }

  runtimeStatus(input: RuntimeStatusQuery) {
    return this.#post(
      ROUTES.runtimeStatus,
      RuntimeStatusQuerySchema.parse(input),
      RuntimeStatusProjectionSchema,
    );
  }

  registerWorkspaceSelection(input: {
    selectedPath: string;
    clientInstanceId: string;
    correlationId: string;
    ttlMs?: number;
  }): Promise<CorePrivateResult<{ selectionHandle: string }>> {
    return this.#post(ROUTES.registerWorkspaceSelection, input, {
      parse: (value) => {
        if (
          !isRecord(value)
          || Object.keys(value).some((key) => key !== "selectionHandle")
          || typeof value.selectionHandle !== "string"
          || value.selectionHandle.length < 16
          || value.selectionHandle.length > 512
        ) throw new Error("Core returned an invalid selection handle");
        return { selectionHandle: value.selectionHandle };
      },
    });
  }

  discardWorkspaceSelection(
    selectionHandle: string,
  ): Promise<CorePrivateResult<{ discarded: true }>> {
    if (selectionHandle.length < 16 || selectionHandle.length > 512) {
      throw new Error("Workspace selection handle is invalid");
    }
    return this.#post(ROUTES.discardWorkspaceSelection, { selectionHandle }, {
      parse: (value) => {
        if (
          !isRecord(value)
          || Object.keys(value).length !== 1
          || value.discarded !== true
        ) throw new Error("Core returned an invalid selection discard result");
        return { discarded: true as const };
      },
    });
  }

  createWorkspaceGrant(input: CreateWorkspaceGrantCommand) {
    return this.#post(
      ROUTES.createWorkspaceGrant,
      CreateWorkspaceGrantCommandSchema.parse(input),
      WorkspaceGrantProjectionSchema,
    );
  }

  revokeWorkspaceGrant(input: RevokeWorkspaceGrantCommand) {
    return this.#post(
      ROUTES.revokeWorkspaceGrant,
      RevokeWorkspaceGrantCommandSchema.parse(input),
      WorkspaceGrantProjectionSchema,
    );
  }

  listWorkspaceGrants(input: ListWorkspaceGrantsQuery) {
    return this.#post(
      ROUTES.listWorkspaceGrants,
      ListWorkspaceGrantsQuerySchema.parse(input),
      arrayOf(WorkspaceGrantProjectionSchema),
    );
  }

  listWorkspaceGrantAuthorities(input: { correlationId?: string }) {
    if (
      Object.keys(input).some((key) => key !== "correlationId")
      || (
        input.correlationId !== undefined
        && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
          .test(input.correlationId)
      )
    ) throw new Error("Workspace authority query is invalid");
    return this.#post(
      ROUTES.listWorkspaceGrantAuthorities,
      input,
      arrayOf(WorkspaceGrantAuthoritySchema),
    );
  }

  createSession(input: CreateSessionCommand) {
    return this.#post(
      ROUTES.createSession,
      CreateSessionCommandSchema.parse(input),
      SessionSummarySchema,
    );
  }

  renameSession(input: RenameSessionCommand) {
    return this.#post(
      ROUTES.renameSession,
      RenameSessionCommandSchema.parse(input),
      SessionSummarySchema,
    );
  }

  deleteSession(input: DeleteSessionCommand) {
    return this.#post(
      ROUTES.deleteSession,
      DeleteSessionCommandSchema.parse(input),
      SessionSummarySchema,
    );
  }

  listSessions(input: ListSessionsQuery) {
    return this.#post(
      ROUTES.listSessions,
      ListSessionsQuerySchema.parse(input),
      arrayOf(SessionSummarySchema),
    );
  }

  openSession(input: OpenSessionQuery) {
    return this.#post(
      ROUTES.openSession,
      OpenSessionQuerySchema.parse(input),
      SessionSummarySchema,
    );
  }

  listAgents(input: ListAgentsQuery) {
    return this.#post(
      ROUTES.listAgents,
      ListAgentsQuerySchema.parse(input),
      arrayOf(AgentProjectionSchema),
    );
  }

  listModels(input: ListModelsQuery) {
    return this.#post(
      ROUTES.listModels,
      ListModelsQuerySchema.parse(input),
      arrayOf(ModelProjectionSchema),
    );
  }

  loadConversationSnapshot(input: ConversationSnapshotQuery) {
    return this.#post(
      ROUTES.conversationSnapshot,
      ConversationSnapshotQuerySchema.parse(input),
      ConversationSnapshotSchema,
    );
  }

  listTasks(input: ListTasksQuery) {
    return this.#post(
      ROUTES.listTasks,
      ListTasksQuerySchema.parse(input),
      arrayOf(TaskSummaryProjectionSchema),
    );
  }

  loadTaskDetail(input: TaskDetailQuery) {
    return this.#post(
      ROUTES.taskDetail,
      TaskDetailQuerySchema.parse(input),
      TaskDetailProjectionSchema,
    );
  }

  previewArtifact(input: ArtifactPreviewQuery) {
    return this.#post(
      ROUTES.artifactPreview,
      ArtifactPreviewQuerySchema.parse(input),
      ArtifactTextPreviewProjectionSchema,
    );
  }

  listArtifacts(input: ListArtifactsQuery): Promise<CorePrivateResult<ArtifactCatalogProjection>> {
    return this.#post(
      ROUTES.artifactList,
      ListArtifactsQuerySchema.parse(input),
      ArtifactCatalogProjectionSchema,
    );
  }

  registerWorkspaceArtifact(input: {
    command: RegisterWorkspaceArtifactCommand;
    workspaceGrantId: string;
    relativePath: string;
    fileSha256: string;
    byteSize: number;
    mediaType: string;
    displayName?: string;
    createdAt?: string;
  }): Promise<CorePrivateResult<RegisterWorkspaceArtifactReceipt>> {
    return this.#post(
      ROUTES.artifactRegister,
      {
        ...input,
        command: RegisterWorkspaceArtifactCommandSchema.parse(input.command),
      },
      RegisterWorkspaceArtifactReceiptSchema,
    );
  }

  setArtifactLifecycle(input: SetArtifactLifecycleCommand) {
    return this.#post(
      ROUTES.artifactLifecycle,
      SetArtifactLifecycleCommandSchema.parse(input),
      ArtifactLifecycleReceiptSchema,
    );
  }

  deleteArtifactRecord(input: DeleteArtifactRecordCommand) {
    return this.#post(
      ROUTES.artifactRecordDelete,
      DeleteArtifactRecordCommandSchema.parse(input),
      ArtifactLifecycleReceiptSchema,
    );
  }

  restoreArtifactRecord(input: RestoreArtifactRecordCommand) {
    return this.#post(
      ROUTES.artifactRecordRestore,
      RestoreArtifactRecordCommandSchema.parse(input),
      ArtifactLifecycleReceiptSchema,
    );
  }

  prepareArtifactSourceFileDeletion(input: DeleteArtifactSourceFileCommand) {
    return this.#post(
      ROUTES.artifactSourceDeletePrepare,
      DeleteArtifactSourceFileCommandSchema.parse(input),
      PreparedArtifactSourceFileDeletionSchema,
    );
  }

  commitArtifactSourceFileDeletion(input: DeleteArtifactSourceFileCommand) {
    return this.#post(
      ROUTES.artifactSourceDeleteCommit,
      DeleteArtifactSourceFileCommandSchema.parse(input),
      ArtifactSourceFileDeletionReceiptSchema,
    );
  }

  resolveArtifactFileSource(input: { artifactId: string }) {
    if (
      Object.keys(input).length !== 1
      || !/^artifact:[0-9a-f]{64}$/u.test(input.artifactId)
    ) throw new Error("Artifact file source request is invalid");
    return this.#post(
      ROUTES.artifactFileSource,
      input,
      ArtifactFileSourceSchema,
    );
  }

  listPendingUserConfirmations(input: ListPendingUserConfirmationsQuery) {
    return this.#post(
      ROUTES.listPendingUserConfirmations,
      ListPendingUserConfirmationsQuerySchema.parse(input),
      arrayOf(UserConfirmationProjectionSchema),
    );
  }

  controlTask(input: TaskControlCommand) {
    return this.#post(
      ROUTES.taskControl,
      TaskControlCommandSchema.parse(input),
      TaskControlReceiptSchema,
    );
  }

  submitTurn(input: SubmitTurnCommand) {
    return this.#post(
      ROUTES.submitTurn,
      SubmitTurnCommandSchema.parse(input),
      SubmitTurnReceiptSchema,
    );
  }

  querySubmitTurn(input: SubmitTurnStatusQuery) {
    return this.#post(
      ROUTES.submitTurnStatus,
      SubmitTurnStatusQuerySchema.parse(input),
      SubmitTurnReceiptSchema,
    );
  }

  async subscribe(input: {
    query: DesktopEventSubscriptionQuery;
    signal: AbortSignal;
    onEvent: (event: DesktopEventEnvelope) => void;
    onReplayReset?: (reset: ReplayResetRequired) => void;
    onHeartbeat?: (heartbeat: DesktopHeartbeat) => void;
  }): Promise<void> {
    const query = DesktopEventSubscriptionQuerySchema.parse(input.query);
    const url = new URL(ROUTES.events, this.#baseUrl);
    if (query.durableCursor !== undefined) {
      url.searchParams.set("cursor", query.durableCursor);
    }
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: this.#headers(),
      signal: input.signal,
    });
    if (!response.ok || response.body === null) {
      throw new Error(`Core event stream failed with HTTP ${response.status}`);
    }
    await parseSse(response.body, {
      onFrame: (event, data) => {
        const value: unknown = JSON.parse(data);
        if (event === "desktop_event") {
          input.onEvent(DesktopEventEnvelopeSchema.parse(value));
        } else if (event === "replay_reset") {
          input.onReplayReset?.(ReplayResetRequiredSchema.parse(value));
        } else if (event === "heartbeat") {
          input.onHeartbeat?.(DesktopHeartbeatSchema.parse(value));
        } else {
          throw new Error("Core event stream emitted an unknown event type");
        }
      },
    });
  }

  async #post<T>(
    route: string,
    input: unknown,
    parser: Parser<T>,
  ): Promise<CorePrivateResult<T>> {
    const body = JSON.stringify(input);
    const response = await fetch(new URL(route, this.#baseUrl), {
      method: "POST",
      redirect: "manual",
      headers: {
        ...this.#headers(),
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
      },
      body,
    });
    const value = await readBoundedJson(response);
    if (!isRecord(value) || typeof value.ok !== "boolean") {
      throw new Error("Core returned an invalid private response envelope");
    }
    if (!value.ok) {
      return { ok: false, error: DesktopErrorEnvelopeSchema.parse(value.error) };
    }
    return { ok: true, value: parser.parse(value.value) };
  }

  async #postV1Alpha2<T>(
    route: string,
    input: unknown,
    parser: Parser<T>,
    timeoutMs: number,
  ): Promise<CorePrivateResultV1Alpha2<T>> {
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body) > 16 * 1024) {
      throw new Error("Core private v1alpha2 request exceeds the byte limit");
    }
    const response = await fetch(new URL(route, this.#baseUrl), {
      method: "POST",
      redirect: "manual",
      headers: {
        ...this.#headers(),
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const value = await readBoundedJson(response);
    if (!isRecord(value) || typeof value.ok !== "boolean") {
      throw new Error("Core returned an invalid private response envelope");
    }
    if (!value.ok) {
      return { ok: false, error: DesktopErrorEnvelopeV1Alpha2Schema.parse(value.error) };
    }
    return { ok: true, value: parser.parse(value.value) };
  }

  #headers(): Readonly<Record<string, string>> {
    return {
      authorization: `Bearer ${this.#authorizationToken}`,
      origin: CORE_PRIVATE_ORIGIN,
      accept: "application/json, text/event-stream",
    };
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (response.status >= 300 && response.status < 400) {
    throw new Error("Core private client refuses redirects");
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("Core private response exceeds the byte limit");
  }
  if (response.body === null) throw new Error("Core returned an empty response");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      throw new Error("Core private response exceeds the byte limit");
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function parseSse(
  stream: ReadableStream<Uint8Array>,
  input: { onFrame: (event: string, data: string) => void },
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  while (true) {
    const item = await reader.read();
    if (item.done) {
      buffer += decoder.decode();
      break;
    }
    buffer += decoder.decode(item.value, { stream: true });
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      if (encoder.encode(frame).byteLength > MAX_SSE_FRAME_BYTES) {
        throw new Error("Core event stream frame exceeds the byte limit");
      }
      const event = frame.split("\n").find((line) => line.startsWith("event: "))
        ?.slice(7);
      const data = frame.split("\n").filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6)).join("\n");
      if (event === undefined || data.length === 0) {
        throw new Error("Core event stream frame is malformed");
      }
      input.onFrame(event, data);
      separator = buffer.indexOf("\n\n");
    }
    if (encoder.encode(buffer).byteLength > MAX_SSE_FRAME_BYTES) {
      throw new Error("Core event stream frame exceeds the byte limit");
    }
  }
  if (buffer.length > 0) {
    throw new Error("Core event stream ended with an incomplete frame");
  }
}

function arrayOf<T>(parser: Parser<T>): Parser<readonly T[]> {
  return {
    parse: (value) => {
      if (!Array.isArray(value)) throw new Error("Core response is not an array");
      return value.map((item) => parser.parse(item));
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireBoundedString(
  value: unknown,
  pattern: RegExp | undefined,
  maxLength: number,
): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maxLength
    || (pattern !== undefined && !pattern.test(value))
  ) throw new Error("Core response contains an invalid string");
  return value;
}

function requireNonnegativeInteger(value: unknown): number {
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < 0
  ) throw new Error("Core response contains an invalid number");
  return value;
}

function isSafeRelativePath(value: string): boolean {
  if (value.includes("\0") || value.includes("\\")) return false;
  if (value.startsWith("/") || value.startsWith("//")) return false;
  if (/^[a-zA-Z]:/u.test(value)) return false;
  return value.split("/").every((segment) =>
    segment.length > 0 && segment !== "." && segment !== "..");
}

export type CorePrivateCompatibility = CompatibilityProjection;
export type CorePrivateRuntimeStatus = RuntimeStatusProjection;
export type CorePrivateWorkspaceGrant = WorkspaceGrantProjection;
export type CorePrivateSession = SessionSummary;
export type CorePrivateAgent = AgentProjection;
export type CorePrivateModel = ModelProjection;
export type CorePrivateConversation = ConversationSnapshot;
export type CorePrivateSubmitTurn = SubmitTurnReceipt;
