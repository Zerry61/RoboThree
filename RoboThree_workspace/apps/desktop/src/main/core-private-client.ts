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
import {
  CompatibilityProjectionV1Alpha4Schema,
  CompatibilityQueryV1Alpha4Schema,
  DesktopErrorEnvelopeV1Alpha4Schema,
  SubmitTurnCommandV1Alpha4Schema,
  SubmitTurnReceiptV1Alpha4Schema,
  SubmitTurnStatusQueryV1Alpha4Schema,
  type CompatibilityQueryV1Alpha4,
  type SubmitTurnCommandV1Alpha4,
  type SubmitTurnStatusQueryV1Alpha4,
} from "@robothree/contracts/desktop-local/v1alpha4";
import {
  CompatibilityProjectionV1Alpha5Schema,
  CompatibilityQueryV1Alpha5Schema,
  DesktopErrorEnvelopeV1Alpha5Schema,
  GetReasoningModePreferenceQueryV1Alpha5Schema,
  PreviewReasoningModeQueryV1Alpha5Schema,
  ReasoningModePreferenceProjectionV1Alpha5Schema,
  ReasoningModePreferenceReceiptV1Alpha5Schema,
  ReasoningModePreviewV1Alpha5Schema,
  SubmitTurnCommandV1Alpha5Schema,
  SubmitTurnReceiptV1Alpha5Schema,
  SubmitTurnStatusQueryV1Alpha5Schema,
  UpdateReasoningModePreferenceCommandV1Alpha5Schema,
  type CompatibilityQueryV1Alpha5,
  type GetReasoningModePreferenceQueryV1Alpha5,
  type PreviewReasoningModeQueryV1Alpha5,
  type SubmitTurnCommandV1Alpha5,
  type SubmitTurnStatusQueryV1Alpha5,
  type UpdateReasoningModePreferenceCommandV1Alpha5,
} from "@robothree/contracts/desktop-local/v1alpha5";
import {
  GetTaskReasoningModeQueryV1Alpha1Schema,
  TaskReasoningErrorEnvelopeV1Alpha1Schema,
  TaskReasoningModeProjectionV1Alpha1Schema,
  type GetTaskReasoningModeQueryV1Alpha1,
} from "@robothree/contracts/desktop-local/task-reasoning/v1alpha1";
import {
  GetPersonalModelQueryV1Alpha1Schema,
  ListPersonalModelsQueryV1Alpha1Schema,
  PersonalModelManagementCompatibilityProjectionV1Alpha1Schema,
  PersonalModelManagementCompatibilityQueryV1Alpha1Schema,
  PersonalModelManagementErrorEnvelopeV1Alpha1Schema,
  PersonalModelPageV1Alpha1Schema,
  PersonalModelSafeProjectionV1Alpha1Schema,
  type GetPersonalModelQueryV1Alpha1,
  type ListPersonalModelsQueryV1Alpha1,
  type PersonalModelManagementCompatibilityQueryV1Alpha1,
} from "@robothree/contracts/desktop-local/personal-model-management/v1alpha1";
import {
  CreatePersonalModelCommandV1Alpha2Schema,
  DeletePersonalModelCommandV1Alpha2Schema,
  GetPersonalModelQueryV1Alpha2Schema,
  ListPersonalModelsQueryV1Alpha2Schema,
  PersonalModelCommandPreparationV1Alpha2Schema,
  PersonalModelManagementCompatibilityProjectionV1Alpha2Schema,
  PersonalModelManagementCompatibilityQueryV1Alpha2Schema,
  PersonalModelManagementErrorEnvelopeV1Alpha2Schema,
  PersonalModelOperationReceiptV1Alpha2Schema,
  PersonalModelPageV1Alpha2Schema,
  PersonalModelSafeProjectionV1Alpha2Schema,
  QueryPersonalModelOperationV1Alpha2Schema,
  RevealPersonalModelKeyCommandV1Alpha2Schema,
  UpdatePersonalModelCommandV1Alpha2Schema,
  type CreatePersonalModelCommandV1Alpha2,
  type DeletePersonalModelCommandV1Alpha2,
  type GetPersonalModelQueryV1Alpha2,
  type ListPersonalModelsQueryV1Alpha2,
  type PersonalModelManagementCompatibilityQueryV1Alpha2,
  type QueryPersonalModelOperationV1Alpha2,
  type RevealPersonalModelKeyCommandV1Alpha2,
  type UpdatePersonalModelCommandV1Alpha2,
} from "@robothree/contracts/desktop-local/personal-model-management/v1alpha2";
import {
  CreateRobotDraftCommandSchema,
  AgentLifecycleSafeErrorSchema,
  GetMyRobotDraftQuerySchema,
  ListMyRobotDraftsQuerySchema,
  RobotDraftDetailSchema,
  RobotDraftPageSchema,
  RobotLifecycleMutationReceiptSchema,
  StartRobotDraftTestCommandSchema,
  SubmitRobotDraftCommandSchema,
  UpdateRobotDraftCommandSchema,
  WithdrawRobotSubmissionCommandSchema,
  type CreateRobotDraftCommand,
  type GetMyRobotDraftQuery,
  type ListMyRobotDraftsQuery,
  type StartRobotDraftTestCommand,
  type SubmitRobotDraftCommand,
  type UpdateRobotDraftCommand,
  type WithdrawRobotSubmissionCommand,
} from "@robothree/contracts/agent-lifecycle/v1alpha1";
import {
  GetSkillLifecycleCompatibilityQuerySchema,
  GetSkillQuerySchema,
  ListSkillsQuerySchema,
  SkillDetailSchema,
  SkillLifecycleCompatibilitySchema,
  SkillLifecycleMutationReceiptSchema,
  SkillLifecycleSafeErrorSchema,
  SkillPageSchema,
  StartSkillDraftTestCommandSchema,
  SubmitSkillDraftCommandSchema,
  SubmitSkillDraftReceiptSchema,
  WithdrawSkillSubmissionCommandSchema,
  type GetSkillLifecycleCompatibilityQuery,
  type GetSkillQuery,
  type ListSkillsQuery,
  type StartSkillDraftTestCommand,
  type SubmitSkillDraftCommand,
  type WithdrawSkillSubmissionCommand,
} from "@robothree/contracts/skill-lifecycle/v1alpha1";

const CORE_PRIVATE_ORIGIN = "robothree://desktop-main";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SSE_FRAME_BYTES = 256 * 1024;

const ROUTES = Object.freeze({
  listMyRobotDraftsV1Alpha1: "/agent-lifecycle/v1alpha1/drafts/list",
  getMyRobotDraftV1Alpha1: "/agent-lifecycle/v1alpha1/drafts/detail",
  createRobotDraftV1Alpha1: "/agent-lifecycle/v1alpha1/drafts/create",
  updateRobotDraftV1Alpha1: "/agent-lifecycle/v1alpha1/drafts/update",
  startRobotDraftTestV1Alpha1: "/agent-lifecycle/v1alpha1/drafts/test",
  submitRobotDraftV1Alpha1: "/agent-lifecycle/v1alpha1/drafts/submit",
  withdrawRobotSubmissionV1Alpha1: "/agent-lifecycle/v1alpha1/drafts/withdraw",
  getSkillLifecycleCompatibilityV1Alpha1: "/skill-lifecycle/v1alpha1/compatibility",
  listSkillsV1Alpha1: "/skill-lifecycle/v1alpha1/list",
  getSkillV1Alpha1: "/skill-lifecycle/v1alpha1/detail",
  syncSkillDraftV1Alpha1: "/skill-lifecycle/v1alpha1/internal/sync-draft",
  stageSkillReleaseV1Alpha1: "/skill-lifecycle/v1alpha1/internal/stage-release",
  pollAdminSkillDraftTestV1Alpha1: "/skill-lifecycle/v1alpha1/internal/admin-test/poll",
  stageAdminSkillDraftTestV1Alpha1: "/skill-lifecycle/v1alpha1/internal/admin-test/stage",
  startAdminSkillDraftTestV1Alpha1: "/skill-lifecycle/v1alpha1/internal/admin-test/start",
  queryAdminSkillDraftTestV1Alpha1: "/skill-lifecycle/v1alpha1/internal/admin-test/query",
  checkSkillInstallationUseV1Alpha1: "/skill-lifecycle/v1alpha1/internal/check-installation-use",
  startSkillDraftTestV1Alpha1: "/skill-lifecycle/v1alpha1/drafts/test",
  submitSkillDraftV1Alpha1: "/skill-lifecycle/v1alpha1/drafts/submit",
  withdrawSkillSubmissionV1Alpha1: "/skill-lifecycle/v1alpha1/drafts/withdraw",
  personalModelManagementCompatibilityV1Alpha2: "/personal-model-management/v1alpha2/compatibility",
  listPersonalModelsV1Alpha2: "/personal-model-management/v1alpha2/list",
  getPersonalModelV1Alpha2: "/personal-model-management/v1alpha2/detail",
  createPersonalModelV1Alpha2: "/personal-model-management/v1alpha2/create",
  updatePersonalModelV1Alpha2: "/personal-model-management/v1alpha2/update",
  deletePersonalModelV1Alpha2: "/personal-model-management/v1alpha2/delete",
  revealPersonalModelV1Alpha2: "/personal-model-management/v1alpha2/reveal",
  queryPersonalModelOperationV1Alpha2: "/personal-model-management/v1alpha2/operation",
  personalModelManagementCompatibilityV1Alpha1:
    "/personal-model-management/v1alpha1/compatibility",
  listPersonalModelsV1Alpha1: "/personal-model-management/v1alpha1/list",
  getPersonalModelV1Alpha1: "/personal-model-management/v1alpha1/detail",
  getTaskReasoningModeV1Alpha1: "/task-reasoning/v1alpha1/get",
  compatibilityV1Alpha5: "/v1alpha5/control/compatibility",
  previewReasoningModeV1Alpha5: "/v1alpha5/reasoning/preview",
  getReasoningModePreferenceV1Alpha5: "/v1alpha5/reasoning/preference/get",
  updateReasoningModePreferenceV1Alpha5: "/v1alpha5/reasoning/preference/update",
  submitTurnV1Alpha5: "/v1alpha5/turns/submit",
  submitTurnStatusV1Alpha5: "/v1alpha5/turns/status",
  compatibilityV1Alpha4: "/v1alpha4/control/compatibility",
  submitTurnV1Alpha4: "/v1alpha4/turns/submit",
  submitTurnStatusV1Alpha4: "/v1alpha4/turns/status",
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

export type CorePrivateResultV1Alpha4<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ReturnType<typeof DesktopErrorEnvelopeV1Alpha4Schema.parse> }>;

export type CorePrivateResultV1Alpha5<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ReturnType<typeof DesktopErrorEnvelopeV1Alpha5Schema.parse> }>;

export type CorePrivateTaskReasoningResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ReturnType<typeof TaskReasoningErrorEnvelopeV1Alpha1Schema.parse> }>;

export type CorePrivatePersonalModelManagementResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
    ok: false;
    error: ReturnType<typeof PersonalModelManagementErrorEnvelopeV1Alpha1Schema.parse>;
  }>;

export type CorePrivatePersonalModelManagementResultV1Alpha2<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ReturnType<typeof PersonalModelManagementErrorEnvelopeV1Alpha2Schema.parse> }>;

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

  listMyRobotDraftsV1Alpha1(input: ListMyRobotDraftsQuery) {
    return this.#postAgentLifecycle(ROUTES.listMyRobotDraftsV1Alpha1,
      ListMyRobotDraftsQuerySchema.parse(input), RobotDraftPageSchema);
  }

  getMyRobotDraftV1Alpha1(input: GetMyRobotDraftQuery) {
    return this.#postAgentLifecycle(ROUTES.getMyRobotDraftV1Alpha1,
      GetMyRobotDraftQuerySchema.parse(input), RobotDraftDetailSchema);
  }

  createRobotDraftV1Alpha1(input: CreateRobotDraftCommand) {
    return this.#postAgentLifecycle(ROUTES.createRobotDraftV1Alpha1,
      CreateRobotDraftCommandSchema.parse(input), RobotLifecycleMutationReceiptSchema);
  }

  updateRobotDraftV1Alpha1(input: UpdateRobotDraftCommand) {
    return this.#postAgentLifecycle(ROUTES.updateRobotDraftV1Alpha1,
      UpdateRobotDraftCommandSchema.parse(input), RobotLifecycleMutationReceiptSchema);
  }

  startRobotDraftTestV1Alpha1(input: StartRobotDraftTestCommand) {
    return this.#postAgentLifecycle(ROUTES.startRobotDraftTestV1Alpha1,
      StartRobotDraftTestCommandSchema.parse(input), RobotLifecycleMutationReceiptSchema);
  }

  submitRobotDraftV1Alpha1(input: SubmitRobotDraftCommand) {
    return this.#postAgentLifecycle(ROUTES.submitRobotDraftV1Alpha1,
      SubmitRobotDraftCommandSchema.parse(input), RobotLifecycleMutationReceiptSchema);
  }

  withdrawRobotSubmissionV1Alpha1(input: WithdrawRobotSubmissionCommand) {
    return this.#postAgentLifecycle(ROUTES.withdrawRobotSubmissionV1Alpha1,
      WithdrawRobotSubmissionCommandSchema.parse(input), RobotLifecycleMutationReceiptSchema);
  }

  getSkillLifecycleCompatibilityV1Alpha1(input: GetSkillLifecycleCompatibilityQuery) {
    return this.#postSkillLifecycle(
      ROUTES.getSkillLifecycleCompatibilityV1Alpha1,
      GetSkillLifecycleCompatibilityQuerySchema.parse(input),
      SkillLifecycleCompatibilitySchema,
    );
  }

  listSkillsV1Alpha1(input: ListSkillsQuery) {
    return this.#postSkillLifecycle(
      ROUTES.listSkillsV1Alpha1,
      ListSkillsQuerySchema.parse(input),
      SkillPageSchema,
    );
  }

  getSkillV1Alpha1(input: GetSkillQuery) {
    return this.#postSkillLifecycle(
      ROUTES.getSkillV1Alpha1,
      GetSkillQuerySchema.parse(input),
      SkillDetailSchema,
    );
  }

  syncSkillDraftV1Alpha1(input: Readonly<{
    commandId: string;
    correlationId: string;
    workspaceGrantId: string;
    skillId: string;
    expectedDraftRevision?: string;
    material: Readonly<{
      skillId: string;
      technicalName: string;
      displayTitle: string;
      displayDescription: string;
      primaryFunction: string;
    }>;
  }>) {
    return this.#postSkillLifecycle(
      ROUTES.syncSkillDraftV1Alpha1,
      input,
      SkillLifecycleMutationReceiptSchema,
    );
  }

  stageSkillReleaseV1Alpha1(input: Readonly<{
    workspaceGrantId: string;
    skillId: string;
    releaseRevision: string;
    packageDigest: string;
  }>) {
    return this.#postSkillLifecycle(ROUTES.stageSkillReleaseV1Alpha1, input, {
      parse(value) {
        if (!isRecord(value) || Object.keys(value).length !== 9
          || typeof value.packageDigest !== "string"
          || typeof value.manifestDigest !== "string"
          || typeof value.byteLength !== "number" || !Number.isSafeInteger(value.byteLength)
          || value.byteLength < 1 || value.byteLength > 200 * 1024 * 1024
          || typeof value.technicalName !== "string" || typeof value.displayTitle !== "string"
          || typeof value.displayDescription !== "string"
          || typeof value.semanticVersion !== "string"
          || (value.sourceKind !== "personal_creator" && value.sourceKind !== "admin_upload")
          || typeof value.publishedAt !== "string") {
          throw new Error("Core returned an invalid staged Skill package receipt");
        }
        return {
          packageDigest: value.packageDigest,
          manifestDigest: value.manifestDigest,
          byteLength: value.byteLength,
          technicalName: value.technicalName,
          displayTitle: value.displayTitle,
          displayDescription: value.displayDescription,
          semanticVersion: value.semanticVersion,
          sourceKind: value.sourceKind,
          publishedAt: value.publishedAt,
        };
      },
    });
  }

  pollAdminSkillDraftTestV1Alpha1() {
    return this.#postSkillLifecycle(ROUTES.pollAdminSkillDraftTestV1Alpha1, {}, {
      parse(value) {
        if (!isRecord(value) || typeof value.pending !== "boolean") {
          throw new Error("Core returned an invalid Admin Skill test poll result");
        }
        if (!value.pending) return { pending: false as const };
        for (const field of ["operationId", "correlationId", "skillId", "draftRevision",
          "packageDigest", "manifestDigest", "skillMarkdownDigest"] as const) {
          if (typeof value[field] !== "string") {
            throw new Error("Core returned an invalid Admin Skill test poll result");
          }
        }
        return { pending: true as const, operationId: value.operationId as string,
          correlationId: value.correlationId as string, skillId: value.skillId as string,
          draftRevision: value.draftRevision as string, packageDigest: value.packageDigest as string,
          manifestDigest: value.manifestDigest as string,
          skillMarkdownDigest: value.skillMarkdownDigest as string };
      },
    });
  }

  stageAdminSkillDraftTestV1Alpha1(input: Readonly<{
    workspaceGrantId: string; operationId: string; packageDigest: string; manifestDigest: string;
  }>) {
    return this.#postSkillLifecycle(ROUTES.stageAdminSkillDraftTestV1Alpha1, input, {
      parse(value) {
        if (!isRecord(value) || typeof value.packageDigest !== "string"
          || typeof value.manifestDigest !== "string" || typeof value.byteLength !== "number") {
          throw new Error("Core returned an invalid Admin Skill staged package receipt");
        }
        return { packageDigest: value.packageDigest, manifestDigest: value.manifestDigest,
          byteLength: value.byteLength };
      },
    });
  }

  startAdminSkillDraftTestV1Alpha1(operationId: string) {
    return this.#postSkillLifecycle(ROUTES.startAdminSkillDraftTestV1Alpha1,
      { operationId }, { parse(value) {
        if (!isRecord(value) || typeof value.taskId !== "string") {
          throw new Error("Core returned an invalid Admin Skill test start receipt");
        }
        return { taskId: value.taskId };
      } });
  }

  queryAdminSkillDraftTestV1Alpha1(operationId: string) {
    return this.#postSkillLifecycle(ROUTES.queryAdminSkillDraftTestV1Alpha1,
      { operationId }, { parse(value) {
        if (!isRecord(value) || !["accepted", "running", "succeeded", "failed"]
          .includes(value.state as string)) {
          throw new Error("Core returned an invalid Admin Skill test operation");
        }
        return { state: value.state as "accepted" | "running" | "succeeded" | "failed" };
      } });
  }

  checkSkillInstallationUseV1Alpha1(input: Readonly<{
    skillId: string;
    releaseRevision: string;
  }>) {
    return this.#postSkillLifecycle(ROUTES.checkSkillInstallationUseV1Alpha1, input, {
      parse(value) {
        if (!isRecord(value) || Object.keys(value).length !== 1
          || typeof value.inUse !== "boolean") {
          throw new Error("Core returned an invalid Skill installation-use result");
        }
        return { inUse: value.inUse };
      },
    });
  }

  startSkillDraftTestV1Alpha1(input: StartSkillDraftTestCommand) {
    return this.#postSkillLifecycle(
      ROUTES.startSkillDraftTestV1Alpha1,
      StartSkillDraftTestCommandSchema.parse(input),
      SkillLifecycleMutationReceiptSchema,
    );
  }

  submitSkillDraftV1Alpha1(input: SubmitSkillDraftCommand) {
    return this.#postSkillLifecycle(
      ROUTES.submitSkillDraftV1Alpha1,
      SubmitSkillDraftCommandSchema.parse(input),
      SubmitSkillDraftReceiptSchema,
    );
  }

  withdrawSkillSubmissionV1Alpha1(input: WithdrawSkillSubmissionCommand) {
    return this.#postSkillLifecycle(
      ROUTES.withdrawSkillSubmissionV1Alpha1,
      WithdrawSkillSubmissionCommandSchema.parse(input),
      SkillLifecycleMutationReceiptSchema,
    );
  }

  compatibility(input: CompatibilityQuery) {
    return this.#post(
      ROUTES.compatibility,
      CompatibilityQuerySchema.parse(input),
      CompatibilityProjectionSchema,
    );
  }

  getTaskReasoningModeV1Alpha1(input: GetTaskReasoningModeQueryV1Alpha1) {
    return this.#postTaskReasoning(
      ROUTES.getTaskReasoningModeV1Alpha1,
      GetTaskReasoningModeQueryV1Alpha1Schema.parse(input),
      TaskReasoningModeProjectionV1Alpha1Schema,
      10_000,
    );
  }

  personalModelManagementCompatibilityV1Alpha1(
    input: PersonalModelManagementCompatibilityQueryV1Alpha1,
  ) {
    return this.#postPersonalModelManagement(
      ROUTES.personalModelManagementCompatibilityV1Alpha1,
      PersonalModelManagementCompatibilityQueryV1Alpha1Schema.parse(input),
      PersonalModelManagementCompatibilityProjectionV1Alpha1Schema,
      3_000,
    );
  }

  listPersonalModelsV1Alpha1(input: ListPersonalModelsQueryV1Alpha1) {
    return this.#postPersonalModelManagement(
      ROUTES.listPersonalModelsV1Alpha1,
      ListPersonalModelsQueryV1Alpha1Schema.parse(input),
      PersonalModelPageV1Alpha1Schema,
      5_000,
    );
  }

  getPersonalModelV1Alpha1(input: GetPersonalModelQueryV1Alpha1) {
    return this.#postPersonalModelManagement(
      ROUTES.getPersonalModelV1Alpha1,
      GetPersonalModelQueryV1Alpha1Schema.parse(input),
      PersonalModelSafeProjectionV1Alpha1Schema,
      5_000,
    );
  }

  personalModelManagementCompatibilityV1Alpha2(input: PersonalModelManagementCompatibilityQueryV1Alpha2) {
    return this.#postPersonalModelManagementV1Alpha2(ROUTES.personalModelManagementCompatibilityV1Alpha2, PersonalModelManagementCompatibilityQueryV1Alpha2Schema.parse(input), PersonalModelManagementCompatibilityProjectionV1Alpha2Schema, 3_000);
  }

  listPersonalModelsV1Alpha2(input: ListPersonalModelsQueryV1Alpha2) {
    return this.#postPersonalModelManagementV1Alpha2(ROUTES.listPersonalModelsV1Alpha2, ListPersonalModelsQueryV1Alpha2Schema.parse(input), PersonalModelPageV1Alpha2Schema, 5_000);
  }

  getPersonalModelV1Alpha2(input: GetPersonalModelQueryV1Alpha2) {
    return this.#postPersonalModelManagementV1Alpha2(ROUTES.getPersonalModelV1Alpha2, GetPersonalModelQueryV1Alpha2Schema.parse(input), PersonalModelSafeProjectionV1Alpha2Schema, 5_000);
  }

  createPersonalModelV1Alpha2(input: CreatePersonalModelCommandV1Alpha2) {
    return this.#postPersonalModelManagementV1Alpha2(ROUTES.createPersonalModelV1Alpha2, CreatePersonalModelCommandV1Alpha2Schema.parse(input), PersonalModelCommandPreparationV1Alpha2Schema, 5_000);
  }

  updatePersonalModelV1Alpha2(input: UpdatePersonalModelCommandV1Alpha2) {
    return this.#postPersonalModelManagementV1Alpha2(ROUTES.updatePersonalModelV1Alpha2, UpdatePersonalModelCommandV1Alpha2Schema.parse(input), PersonalModelCommandPreparationV1Alpha2Schema, 5_000);
  }

  deletePersonalModelV1Alpha2(input: DeletePersonalModelCommandV1Alpha2) {
    return this.#postPersonalModelManagementV1Alpha2(ROUTES.deletePersonalModelV1Alpha2, DeletePersonalModelCommandV1Alpha2Schema.parse(input), PersonalModelCommandPreparationV1Alpha2Schema, 5_000);
  }

  revealPersonalModelV1Alpha2(input: RevealPersonalModelKeyCommandV1Alpha2) {
    return this.#postPersonalModelManagementV1Alpha2(ROUTES.revealPersonalModelV1Alpha2, RevealPersonalModelKeyCommandV1Alpha2Schema.parse(input), PersonalModelCommandPreparationV1Alpha2Schema, 5_000);
  }

  queryPersonalModelOperationV1Alpha2(input: QueryPersonalModelOperationV1Alpha2) {
    return this.#postPersonalModelManagementV1Alpha2(ROUTES.queryPersonalModelOperationV1Alpha2, QueryPersonalModelOperationV1Alpha2Schema.parse(input), PersonalModelOperationReceiptV1Alpha2Schema, 5_000);
  }

  compatibilityV1Alpha2(input: CompatibilityQueryV1Alpha2) {
    return this.#postV1Alpha2(
      ROUTES.compatibilityV1Alpha2,
      CompatibilityQueryV1Alpha2Schema.parse(input),
      CompatibilityProjectionV1Alpha2Schema,
      3_000,
    );
  }

  compatibilityV1Alpha4(input: CompatibilityQueryV1Alpha4) {
    return this.#postV1Alpha4(
      ROUTES.compatibilityV1Alpha4,
      CompatibilityQueryV1Alpha4Schema.parse(input),
      CompatibilityProjectionV1Alpha4Schema,
      3_000,
    );
  }

  compatibilityV1Alpha5(input: CompatibilityQueryV1Alpha5) {
    return this.#postV1Alpha5(
      ROUTES.compatibilityV1Alpha5,
      CompatibilityQueryV1Alpha5Schema.parse(input),
      CompatibilityProjectionV1Alpha5Schema,
      3_000,
    );
  }

  previewReasoningModeV1Alpha5(input: PreviewReasoningModeQueryV1Alpha5) {
    return this.#postV1Alpha5(
      ROUTES.previewReasoningModeV1Alpha5,
      PreviewReasoningModeQueryV1Alpha5Schema.parse(input),
      ReasoningModePreviewV1Alpha5Schema,
      10_000,
    );
  }

  getReasoningModePreferenceV1Alpha5(input: GetReasoningModePreferenceQueryV1Alpha5) {
    return this.#postV1Alpha5(
      ROUTES.getReasoningModePreferenceV1Alpha5,
      GetReasoningModePreferenceQueryV1Alpha5Schema.parse(input),
      ReasoningModePreferenceProjectionV1Alpha5Schema,
      10_000,
    );
  }

  updateReasoningModePreferenceV1Alpha5(
    input: UpdateReasoningModePreferenceCommandV1Alpha5,
  ) {
    return this.#postV1Alpha5(
      ROUTES.updateReasoningModePreferenceV1Alpha5,
      UpdateReasoningModePreferenceCommandV1Alpha5Schema.parse(input),
      ReasoningModePreferenceReceiptV1Alpha5Schema,
      10_000,
    );
  }

  submitTurnV1Alpha5(input: SubmitTurnCommandV1Alpha5) {
    return this.#postV1Alpha5(
      ROUTES.submitTurnV1Alpha5,
      SubmitTurnCommandV1Alpha5Schema.parse(input),
      SubmitTurnReceiptV1Alpha5Schema,
      30_000,
    );
  }

  querySubmitTurnV1Alpha5(input: SubmitTurnStatusQueryV1Alpha5) {
    return this.#postV1Alpha5(
      ROUTES.submitTurnStatusV1Alpha5,
      SubmitTurnStatusQueryV1Alpha5Schema.parse(input),
      SubmitTurnReceiptV1Alpha5Schema,
      10_000,
    );
  }

  submitTurnV1Alpha4(input: SubmitTurnCommandV1Alpha4) {
    return this.#postV1Alpha4(
      ROUTES.submitTurnV1Alpha4,
      SubmitTurnCommandV1Alpha4Schema.parse(input),
      SubmitTurnReceiptV1Alpha4Schema,
      30_000,
    );
  }

  querySubmitTurnV1Alpha4(input: SubmitTurnStatusQueryV1Alpha4) {
    return this.#postV1Alpha4(
      ROUTES.submitTurnStatusV1Alpha4,
      SubmitTurnStatusQueryV1Alpha4Schema.parse(input),
      SubmitTurnReceiptV1Alpha4Schema,
      10_000,
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

  async #postAgentLifecycle<T>(route: string, input: unknown, parser: Parser<T>) {
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body) > 256 * 1024) {
      throw new Error("Core private Agent lifecycle request exceeds the byte limit");
    }
    const response = await fetch(new URL(route, this.#baseUrl), {
      method: "POST",
      redirect: "manual",
      headers: { ...this.#headers(), "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)) },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const value = await readBoundedJson(response);
    if (!isRecord(value) || typeof value.ok !== "boolean") {
      throw new Error("Core returned an invalid Agent lifecycle envelope");
    }
    if (!value.ok) {
      return { ok: false as const, error: AgentLifecycleSafeErrorSchema.parse(value.error) };
    }
    return { ok: true as const, value: parser.parse(value.value) };
  }

  async #postSkillLifecycle<T>(route: string, input: unknown, parser: Parser<T>) {
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body) > 256 * 1024) {
      throw new Error("Core private Skill lifecycle request exceeds the byte limit");
    }
    const response = await fetch(new URL(route, this.#baseUrl), {
      method: "POST",
      redirect: "manual",
      headers: { ...this.#headers(), "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)) },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const value = await readBoundedJson(response);
    if (!isRecord(value) || typeof value.ok !== "boolean") {
      throw new Error("Core returned an invalid Skill lifecycle envelope");
    }
    if (!value.ok) {
      return { ok: false as const, error: SkillLifecycleSafeErrorSchema.parse(value.error) };
    }
    return { ok: true as const, value: parser.parse(value.value) };
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

  async #postV1Alpha4<T>(
    route: string,
    input: unknown,
    parser: Parser<T>,
    timeoutMs: number,
  ): Promise<CorePrivateResultV1Alpha4<T>> {
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body) > 160 * 1024) {
      throw new Error("Core private v1alpha4 request exceeds the byte limit");
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
      return { ok: false, error: DesktopErrorEnvelopeV1Alpha4Schema.parse(value.error) };
    }
    return { ok: true, value: parser.parse(value.value) };
  }

  async #postV1Alpha5<T>(
    route: string,
    input: unknown,
    parser: Parser<T>,
    timeoutMs: number,
  ): Promise<CorePrivateResultV1Alpha5<T>> {
    const body = JSON.stringify(input);
    const maxBytes = route === ROUTES.submitTurnV1Alpha5 ? 160 * 1024 : 16 * 1024;
    if (Buffer.byteLength(body) > maxBytes) {
      throw new Error("Core private v1alpha5 request exceeds the byte limit");
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
      return { ok: false, error: DesktopErrorEnvelopeV1Alpha5Schema.parse(value.error) };
    }
    return { ok: true, value: parser.parse(value.value) };
  }

  async #postTaskReasoning<T>(
    route: string,
    input: unknown,
    parser: Parser<T>,
    timeoutMs: number,
  ): Promise<CorePrivateTaskReasoningResult<T>> {
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body) > 16 * 1024) {
      throw new Error("Core private Task Reasoning request exceeds the byte limit");
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
      return {
        ok: false,
        error: TaskReasoningErrorEnvelopeV1Alpha1Schema.parse(value.error),
      };
    }
    return { ok: true, value: parser.parse(value.value) };
  }

  async #postPersonalModelManagement<T>(
    route: string,
    input: unknown,
    parser: Parser<T>,
    timeoutMs: number,
  ): Promise<CorePrivatePersonalModelManagementResult<T>> {
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body) > 16 * 1024) {
      throw new Error("Core private Personal Model request exceeds the byte limit");
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
      return {
        ok: false,
        error: PersonalModelManagementErrorEnvelopeV1Alpha1Schema.parse(value.error),
      };
    }
    return { ok: true, value: parser.parse(value.value) };
  }

  async #postPersonalModelManagementV1Alpha2<T>(route: string, input: unknown, parser: Parser<T>, timeoutMs: number): Promise<CorePrivatePersonalModelManagementResultV1Alpha2<T>> {
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body) > 16 * 1024) throw new Error("Core private Personal Model request exceeds the byte limit");
    const response = await fetch(new URL(route, this.#baseUrl), {
      method: "POST", redirect: "manual", headers: { ...this.#headers(), "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }, body, signal: AbortSignal.timeout(timeoutMs),
    });
    const value = await readBoundedJson(response);
    if (!isRecord(value) || typeof value.ok !== "boolean") throw new Error("Core returned an invalid private response envelope");
    if (!value.ok) return { ok: false, error: PersonalModelManagementErrorEnvelopeV1Alpha2Schema.parse(value.error) };
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
