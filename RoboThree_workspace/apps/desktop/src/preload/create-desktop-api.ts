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
  RevealedPersonalModelKeyV1Alpha2Schema,
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
  AgentLifecycleSafeErrorSchema,
  CreateRobotDraftCommandSchema,
  GetMyRobotDraftQuerySchema,
  ListMyRobotDraftsQuerySchema,
  RobotDraftDetailSchema,
  RobotDraftPageSchema,
  RobotLifecycleMutationReceiptSchema,
  StartRobotDraftTestCommandSchema,
  SubmitRobotDraftCommandSchema,
  UpdateRobotDraftCommandSchema,
  WithdrawRobotSubmissionCommandSchema,
} from "@robothree/contracts/agent-lifecycle/v1alpha1";
import {
  CreateSkillDraftWorkspaceCommandSchema,
  CreateSkillDraftWorkspaceReceiptSchema,
  GetSkillLifecycleCompatibilityQuerySchema,
  GetSkillQuerySchema,
  InstallSkillReleaseCommandSchema,
  ListSkillsQuerySchema,
  QuerySkillOperationSchema,
  RefreshSkillDraftCommandSchema,
  SkillDetailSchema,
  SkillLifecycleCompatibilitySchema,
  SkillLifecycleMutationReceiptSchema,
  SkillLifecycleSafeErrorSchema,
  SkillOperationSchema,
  SkillPageSchema,
  StartSkillDraftTestCommandSchema,
  SubmitSkillDraftCommandSchema,
  SubmitSkillDraftReceiptSchema,
  UninstallSkillReleaseCommandSchema,
  WithdrawSkillSubmissionCommandSchema,
} from "@robothree/contracts/skill-lifecycle/v1alpha1";

import {
  DESKTOP_IPC_CHANNELS,
  AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS,
  SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS,
  DESKTOP_V1ALPHA2_IPC_CHANNELS,
  DESKTOP_V1ALPHA4_IPC_CHANNELS,
  DESKTOP_V1ALPHA5_IPC_CHANNELS,
  DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS,
  PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS,
  PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS,
  FOUNDATION_STATUS_CHANNEL,
  WorkbenchAttachmentPickerCommandSchema,
  WorkbenchAttachmentValidationCommandSchema,
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
  type DesktopV1Alpha4InvokeChannel,
  type RoboThreeDesktopApiV1Alpha4,
  type RendererSafeResultV1Alpha4,
  type DesktopV1Alpha5InvokeChannel,
  type RoboThreeDesktopApiV1Alpha5,
  type RendererSafeResultV1Alpha5,
  type DesktopTaskReasoningV1Alpha1InvokeChannel,
  type RendererTaskReasoningSafeResult,
  type RoboThreeDesktopTaskReasoningApiV1Alpha1,
  type PersonalModelV1Alpha1InvokeChannel,
  type RendererPersonalModelManagementSafeResult,
  type RendererPersonalModelManagementSafeResultV1Alpha2,
  type RoboThreePersonalModelReadApiV1Alpha1,
  type RoboThreePersonalModelApiV1Alpha2,
  type PersonalModelV1Alpha2InvokeChannel,
  type AgentLifecycleV1Alpha1InvokeChannel,
  type RendererAgentLifecycleSafeResult,
  type RoboThreeAgentLifecycleApiV1Alpha1,
  type RoboThreeSkillLifecycleApiV1Alpha1,
  type SkillLifecycleV1Alpha1InvokeChannel,
} from "../shared/foundation-api.js";

export type InvokeFoundationStatus = (channel: typeof FOUNDATION_STATUS_CHANNEL) => Promise<FoundationStatus>;

export type InvokeAgentLifecycleV1Alpha1Api = (
  channel: AgentLifecycleV1Alpha1InvokeChannel,
  input: unknown,
) => Promise<unknown>;

export function createAgentLifecycleApiV1Alpha1(
  invokeRaw: InvokeAgentLifecycleV1Alpha1Api,
): RoboThreeAgentLifecycleApiV1Alpha1 {
  const invoke = <T>(channel: AgentLifecycleV1Alpha1InvokeChannel, request: unknown,
    parser: Parser<T>): Promise<RendererAgentLifecycleSafeResult<T>> =>
    invokeRaw(channel, request).then((value) => parseAgentLifecycleResult(value, parser));
  const api: RoboThreeAgentLifecycleApiV1Alpha1 = {
    contractVersion: "agent-lifecycle.v1alpha1" as const,
    listMyRobotDrafts: (query) => invoke(
      AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.listMyRobotDrafts,
      ListMyRobotDraftsQuerySchema.parse(query), RobotDraftPageSchema),
    getMyRobotDraft: (query) => invoke(
      AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.getMyRobotDraft,
      GetMyRobotDraftQuerySchema.parse(query), RobotDraftDetailSchema),
    createRobotDraft: (command) => invoke(
      AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.createRobotDraft,
      CreateRobotDraftCommandSchema.parse(command), RobotLifecycleMutationReceiptSchema),
    updateRobotDraft: (command) => invoke(
      AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.updateRobotDraft,
      UpdateRobotDraftCommandSchema.parse(command), RobotLifecycleMutationReceiptSchema),
    startRobotDraftTest: (command) => invoke(
      AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.startRobotDraftTest,
      StartRobotDraftTestCommandSchema.parse(command), RobotLifecycleMutationReceiptSchema),
    submitRobotDraft: (command) => invoke(
      AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.submitRobotDraft,
      SubmitRobotDraftCommandSchema.parse(command), RobotLifecycleMutationReceiptSchema),
    withdrawRobotSubmission: (command) => invoke(
      AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.withdrawRobotSubmission,
      WithdrawRobotSubmissionCommandSchema.parse(command), RobotLifecycleMutationReceiptSchema),
  };
  return Object.freeze(api);
}

export type InvokeSkillLifecycleV1Alpha1Api = (
  channel: SkillLifecycleV1Alpha1InvokeChannel,
  input: unknown,
) => Promise<unknown>;

export function createSkillLifecycleApiV1Alpha1(
  invokeRaw: InvokeSkillLifecycleV1Alpha1Api,
): RoboThreeSkillLifecycleApiV1Alpha1 {
  const invoke = <T>(channel: SkillLifecycleV1Alpha1InvokeChannel, request: unknown,
    parser: Parser<T>): Promise<T> => invokeRaw(channel, request)
      .then((value) => unwrapSkillLifecycleResult(value, parser));
  return Object.freeze({
    getSkillLifecycleCompatibility: (query) => invoke(
      SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.getSkillLifecycleCompatibility,
      GetSkillLifecycleCompatibilityQuerySchema.parse(query), SkillLifecycleCompatibilitySchema),
    listSkills: (query) => invoke(SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.listSkills,
      ListSkillsQuerySchema.parse(query), SkillPageSchema),
    getSkill: (query) => invoke(SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.getSkill,
      GetSkillQuerySchema.parse(query), SkillDetailSchema),
    createSkillDraftWorkspace: (command) => invoke(
      SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.createSkillDraftWorkspace,
      CreateSkillDraftWorkspaceCommandSchema.parse(command), CreateSkillDraftWorkspaceReceiptSchema),
    refreshSkillDraft: (command) => invoke(
      SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.refreshSkillDraft,
      RefreshSkillDraftCommandSchema.parse(command), SkillLifecycleMutationReceiptSchema),
    startSkillDraftTest: (command) => invoke(
      SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.startSkillDraftTest,
      StartSkillDraftTestCommandSchema.parse(command), SkillLifecycleMutationReceiptSchema),
    submitSkillDraft: (command) => invoke(
      SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.submitSkillDraft,
      SubmitSkillDraftCommandSchema.parse(command), SubmitSkillDraftReceiptSchema),
    withdrawSkillSubmission: (command) => invoke(
      SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.withdrawSkillSubmission,
      WithdrawSkillSubmissionCommandSchema.parse(command), SkillLifecycleMutationReceiptSchema),
    installSkillRelease: (command) => invoke(
      SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.installSkillRelease,
      InstallSkillReleaseCommandSchema.parse(command), SkillLifecycleMutationReceiptSchema),
    uninstallSkillRelease: (command) => invoke(
      SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.uninstallSkillRelease,
      UninstallSkillReleaseCommandSchema.parse(command), SkillLifecycleMutationReceiptSchema),
    querySkillOperation: (query) => invoke(
      SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS.querySkillOperation,
      QuerySkillOperationSchema.parse(query), SkillOperationSchema),
  });
}

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

export type InvokeDesktopV1Alpha4Api = (
  channel: DesktopV1Alpha4InvokeChannel,
  input: unknown,
) => Promise<unknown>;

export function createDesktopApiV1Alpha4(
  invokeRaw: InvokeDesktopV1Alpha4Api,
): RoboThreeDesktopApiV1Alpha4 {
  const invoke = <T>(
    channel: DesktopV1Alpha4InvokeChannel,
    request: unknown,
    parser: Parser<T>,
  ): Promise<RendererSafeResultV1Alpha4<T>> => invokeRaw(channel, request)
    .then((value) => parseSafeResultV1Alpha4(value, parser));
  return Object.freeze({
    contractVersion: "v1alpha4" as const,
    getCompatibility: (query: CompatibilityQueryV1Alpha4) => invoke(
      DESKTOP_V1ALPHA4_IPC_CHANNELS.compatibility,
      CompatibilityQueryV1Alpha4Schema.parse(query),
      CompatibilityProjectionV1Alpha4Schema,
    ),
    submitTurn: (command: SubmitTurnCommandV1Alpha4) => invoke(
      DESKTOP_V1ALPHA4_IPC_CHANNELS.submitTurn,
      SubmitTurnCommandV1Alpha4Schema.parse(command),
      SubmitTurnReceiptV1Alpha4Schema,
    ),
    querySubmitTurn: (query: SubmitTurnStatusQueryV1Alpha4) => invoke(
      DESKTOP_V1ALPHA4_IPC_CHANNELS.querySubmitTurn,
      SubmitTurnStatusQueryV1Alpha4Schema.parse(query),
      SubmitTurnReceiptV1Alpha4Schema,
    ),
  });
}

export type InvokeDesktopV1Alpha5Api = (
  channel: DesktopV1Alpha5InvokeChannel,
  input: unknown,
) => Promise<unknown>;

export function createDesktopApiV1Alpha5(
  invokeRaw: InvokeDesktopV1Alpha5Api,
): RoboThreeDesktopApiV1Alpha5 {
  const invoke = <T>(
    channel: DesktopV1Alpha5InvokeChannel,
    request: unknown,
    parser: Parser<T>,
  ): Promise<RendererSafeResultV1Alpha5<T>> => invokeRaw(channel, request)
    .then((value) => parseSafeResultV1Alpha5(value, parser));
  return Object.freeze({
    contractVersion: "v1alpha5" as const,
    getCompatibility: (query: CompatibilityQueryV1Alpha5) => invoke(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.compatibility,
      CompatibilityQueryV1Alpha5Schema.parse(query),
      CompatibilityProjectionV1Alpha5Schema,
    ),
    previewReasoningMode: (query: PreviewReasoningModeQueryV1Alpha5) => invoke(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.previewReasoningMode,
      PreviewReasoningModeQueryV1Alpha5Schema.parse(query),
      ReasoningModePreviewV1Alpha5Schema,
    ),
    getReasoningModePreference: (query: GetReasoningModePreferenceQueryV1Alpha5) => invoke(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.getReasoningModePreference,
      GetReasoningModePreferenceQueryV1Alpha5Schema.parse(query),
      ReasoningModePreferenceProjectionV1Alpha5Schema,
    ),
    updateReasoningModePreference: (command: UpdateReasoningModePreferenceCommandV1Alpha5) => invoke(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.updateReasoningModePreference,
      UpdateReasoningModePreferenceCommandV1Alpha5Schema.parse(command),
      ReasoningModePreferenceReceiptV1Alpha5Schema,
    ),
    submitTurn: (command: SubmitTurnCommandV1Alpha5) => invoke(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.submitTurn,
      SubmitTurnCommandV1Alpha5Schema.parse(command),
      SubmitTurnReceiptV1Alpha5Schema,
    ),
    getSubmitTurnStatus: (query: SubmitTurnStatusQueryV1Alpha5) => invoke(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.getSubmitTurnStatus,
      SubmitTurnStatusQueryV1Alpha5Schema.parse(query),
      SubmitTurnReceiptV1Alpha5Schema,
    ),
  });
}

export type InvokeDesktopTaskReasoningV1Alpha1Api = (
  channel: DesktopTaskReasoningV1Alpha1InvokeChannel,
  input: unknown,
) => Promise<unknown>;

export function createDesktopTaskReasoningApiV1Alpha1(
  invokeRaw: InvokeDesktopTaskReasoningV1Alpha1Api,
): RoboThreeDesktopTaskReasoningApiV1Alpha1 {
  return Object.freeze({
    contractVersion: "task-reasoning.v1alpha1" as const,
    getTaskReasoningMode: (query: GetTaskReasoningModeQueryV1Alpha1) =>
      invokeRaw(
        DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS.getTaskReasoningMode,
        GetTaskReasoningModeQueryV1Alpha1Schema.parse(query),
      ).then((value): RendererTaskReasoningSafeResult<
        ReturnType<typeof TaskReasoningModeProjectionV1Alpha1Schema.parse>
      > => {
        if (!isRecord(value) || typeof value.ok !== "boolean") {
          throw new Error("Desktop Main returned an invalid Task Reasoning envelope");
        }
        const keys = Object.keys(value);
        if (value.ok) {
          if (!keys.every((key) => key === "ok" || key === "value")) {
            throw new Error("Desktop Main returned an invalid Task Reasoning success envelope");
          }
          return {
            ok: true,
            value: TaskReasoningModeProjectionV1Alpha1Schema.parse(value.value),
          };
        }
        if (!keys.every((key) => key === "ok" || key === "error")) {
          throw new Error("Desktop Main returned an invalid Task Reasoning error envelope");
        }
        return {
          ok: false,
          error: TaskReasoningErrorEnvelopeV1Alpha1Schema.parse(value.error),
        };
      }),
  });
}

export type InvokePersonalModelV1Alpha1Api = (
  channel: PersonalModelV1Alpha1InvokeChannel,
  input: unknown,
) => Promise<unknown>;

export function createPersonalModelReadApiV1Alpha1(
  invokeRaw: InvokePersonalModelV1Alpha1Api,
): RoboThreePersonalModelReadApiV1Alpha1 {
  const invoke = <T>(
    channel: PersonalModelV1Alpha1InvokeChannel,
    request: unknown,
    parser: Parser<T>,
  ): Promise<RendererPersonalModelManagementSafeResult<T>> =>
    invokeRaw(channel, request)
      .then((value) => parsePersonalModelManagementResult(value, parser));
  return Object.freeze({
    contractVersion: "personal-model-management.v1alpha1" as const,
    getCompatibility: (
      query: PersonalModelManagementCompatibilityQueryV1Alpha1,
    ) => invoke(
      PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.compatibility,
      PersonalModelManagementCompatibilityQueryV1Alpha1Schema.parse(query),
      PersonalModelManagementCompatibilityProjectionV1Alpha1Schema,
    ),
    listPersonalModels: (query: ListPersonalModelsQueryV1Alpha1) => invoke(
      PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.listPersonalModels,
      ListPersonalModelsQueryV1Alpha1Schema.parse(query),
      PersonalModelPageV1Alpha1Schema,
    ),
    getPersonalModel: (query: GetPersonalModelQueryV1Alpha1) => invoke(
      PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.getPersonalModel,
      GetPersonalModelQueryV1Alpha1Schema.parse(query),
      PersonalModelSafeProjectionV1Alpha1Schema,
    ),
  });
}

export type PersonalModelSensitiveTransport = Readonly<{
  submitMutationSecret(commandId: string, secret: Uint8Array): Promise<unknown>;
  receiveRevealSecret(commandId: string): Promise<Uint8Array>;
}>;

export function createPersonalModelApiV1Alpha2(
  invokeRaw: (channel: PersonalModelV1Alpha2InvokeChannel, input: unknown) => Promise<unknown>,
  transport: PersonalModelSensitiveTransport,
): RoboThreePersonalModelApiV1Alpha2 {
  const invoke = <T>(channel: PersonalModelV1Alpha2InvokeChannel, request: unknown, parser: Parser<T>): Promise<RendererPersonalModelManagementSafeResultV1Alpha2<T>> =>
    invokeRaw(channel, request).then((value) => parsePersonalModelManagementResultV1Alpha2(value, parser));
  const queryAfterTransport = async (
    command: { commandId: string; correlationId: string; clientInstanceId: string },
  ) => invoke(
    PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.queryPersonalModelOperation,
    QueryPersonalModelOperationV1Alpha2Schema.parse({
      contractVersion: "personal-model-management.v1alpha2",
      type: "query_personal_model_operation",
      queryId: command.commandId,
      commandId: command.commandId,
      correlationId: command.correlationId,
      clientInstanceId: command.clientInstanceId,
    }),
    PersonalModelOperationReceiptV1Alpha2Schema,
  );
  return Object.freeze({
    contractVersion: "personal-model-management.v1alpha2" as const,
    getCompatibility: (query: PersonalModelManagementCompatibilityQueryV1Alpha2) => invoke(PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.compatibility, PersonalModelManagementCompatibilityQueryV1Alpha2Schema.parse(query), PersonalModelManagementCompatibilityProjectionV1Alpha2Schema),
    listPersonalModels: (query: ListPersonalModelsQueryV1Alpha2) => invoke(PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.listPersonalModels, ListPersonalModelsQueryV1Alpha2Schema.parse(query), PersonalModelPageV1Alpha2Schema),
    getPersonalModel: (query: GetPersonalModelQueryV1Alpha2) => invoke(PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.getPersonalModel, GetPersonalModelQueryV1Alpha2Schema.parse(query), PersonalModelSafeProjectionV1Alpha2Schema),
    createPersonalModel: async (command: CreatePersonalModelCommandV1Alpha2, secretInput: Uint8Array) => {
      const parsed = CreatePersonalModelCommandV1Alpha2Schema.parse(command);
      const secret = boundedSecret(secretInput);
      const prepared = await invoke(PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.createPersonalModel, parsed, PersonalModelCommandPreparationV1Alpha2Schema);
      if (!prepared.ok) { secret.fill(0); return prepared; }
      if (prepared.value.state === "completed") {
        secret.fill(0);
        return { ok: true as const, value: prepared.value.receipt };
      }
      await transport.submitMutationSecret(parsed.commandId, secret);
      return queryAfterTransport(parsed);
    },
    updatePersonalModel: async (command: UpdatePersonalModelCommandV1Alpha2, secretInput?: Uint8Array) => {
      const parsed = UpdatePersonalModelCommandV1Alpha2Schema.parse(command);
      if ((parsed.credentialMutation === "replace_secret") !== (secretInput !== undefined)) throw new Error("Personal Model update Secret presence is invalid");
      const secret = secretInput === undefined ? undefined : boundedSecret(secretInput);
      const prepared = await invoke(PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.updatePersonalModel, parsed, PersonalModelCommandPreparationV1Alpha2Schema);
      if (!prepared.ok) {
        secret?.fill(0);
        return prepared;
      }
      if (prepared.value.state === "completed") {
        secret?.fill(0);
        return { ok: true as const, value: prepared.value.receipt };
      }
      if (secret === undefined) throw new Error("Personal Model update transport preparation is invalid");
      await transport.submitMutationSecret(parsed.commandId, secret);
      return queryAfterTransport(parsed);
    },
    deletePersonalModel: async (command: DeletePersonalModelCommandV1Alpha2) => {
      const parsed = DeletePersonalModelCommandV1Alpha2Schema.parse(command);
      const result = await invoke(PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.deletePersonalModel, parsed, PersonalModelCommandPreparationV1Alpha2Schema);
      return result.ok ? { ok: true as const, value: result.value.receipt } : result;
    },
    revealPersonalModelKey: async (command: RevealPersonalModelKeyCommandV1Alpha2) => {
      const parsed = RevealPersonalModelKeyCommandV1Alpha2Schema.parse(command);
      const result = await invoke(PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.revealPersonalModelKey, parsed, PersonalModelCommandPreparationV1Alpha2Schema);
      if (!result.ok) return result;
      const secret = await transport.receiveRevealSecret(parsed.commandId);
      return { ok: true as const, value: RevealedPersonalModelKeyV1Alpha2Schema.parse({ contractVersion: "personal-model-management.v1alpha2", commandId: parsed.commandId, personalModelId: parsed.personalModelId, secret }) };
    },
    queryPersonalModelOperation: (query: QueryPersonalModelOperationV1Alpha2) => invoke(PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.queryPersonalModelOperation, QueryPersonalModelOperationV1Alpha2Schema.parse(query), PersonalModelOperationReceiptV1Alpha2Schema),
  });
}

function boundedSecret(input: Uint8Array): Uint8Array {
  if (!(input instanceof Uint8Array) || input.byteLength === 0 || input.byteLength > 16_384) throw new Error("Personal Model Secret is invalid");
  const copy = Uint8Array.from(input);
  input.fill(0);
  return copy;
}

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
    pickWorkbenchAttachment: (command) => invoke(
      DESKTOP_IPC_CHANNELS.pickWorkbenchAttachment,
      WorkbenchAttachmentPickerCommandSchema.parse(command),
      optional(RegisterWorkspaceArtifactReceiptSchema),
    ),
    validateWorkbenchAttachment: (command) => invoke(
      DESKTOP_IPC_CHANNELS.validateWorkbenchAttachment,
      WorkbenchAttachmentValidationCommandSchema.parse(command),
      RegisterWorkspaceArtifactReceiptSchema,
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

function parseAgentLifecycleResult<T>(value: unknown, parser: Parser<T>): RendererAgentLifecycleSafeResult<T> {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    throw new Error("Desktop Main returned an invalid Agent lifecycle envelope");
  }
  const keys = Object.keys(value);
  if (value.ok) {
    if (!keys.every((key) => key === "ok" || key === "value")) throw new Error("Invalid Agent lifecycle success envelope");
    return { ok: true, value: parser.parse(value.value) };
  }
  if (!keys.every((key) => key === "ok" || key === "error")) throw new Error("Invalid Agent lifecycle error envelope");
  return { ok: false, error: AgentLifecycleSafeErrorSchema.parse(value.error) };
}

function unwrapSkillLifecycleResult<T>(value: unknown, parser: Parser<T>): T {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    throw new Error("Desktop Main returned an invalid Skill lifecycle envelope");
  }
  const keys = Object.keys(value);
  if (value.ok) {
    if (!keys.every((key) => key === "ok" || key === "value")) {
      throw new Error("Invalid Skill lifecycle success envelope");
    }
    return parser.parse(value.value);
  }
  if (!keys.every((key) => key === "ok" || key === "error")) {
    throw new Error("Invalid Skill lifecycle error envelope");
  }
  throw SkillLifecycleSafeErrorSchema.parse(value.error);
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

function parseSafeResultV1Alpha4<T>(
  value: unknown,
  parser: Parser<T>,
): RendererSafeResultV1Alpha4<T> {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    throw new Error("Desktop Main returned an invalid v1alpha4 result envelope");
  }
  const keys = Object.keys(value);
  if (value.ok) {
    if (!keys.every((key) => key === "ok" || key === "value")) {
      throw new Error("Desktop Main returned an invalid v1alpha4 success envelope");
    }
    return { ok: true, value: parser.parse(value.value) };
  }
  if (!keys.every((key) => key === "ok" || key === "error")) {
    throw new Error("Desktop Main returned an invalid v1alpha4 error envelope");
  }
  return { ok: false, error: DesktopErrorEnvelopeV1Alpha4Schema.parse(value.error) };
}

function parseSafeResultV1Alpha5<T>(
  value: unknown,
  parser: Parser<T>,
): RendererSafeResultV1Alpha5<T> {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    throw new Error("Desktop Main returned an invalid v1alpha5 result envelope");
  }
  const keys = Object.keys(value);
  if (value.ok) {
    if (!keys.every((key) => key === "ok" || key === "value")) {
      throw new Error("Desktop Main returned an invalid v1alpha5 success envelope");
    }
    return { ok: true, value: parser.parse(value.value) };
  }
  if (!keys.every((key) => key === "ok" || key === "error")) {
    throw new Error("Desktop Main returned an invalid v1alpha5 error envelope");
  }
  return { ok: false, error: DesktopErrorEnvelopeV1Alpha5Schema.parse(value.error) };
}

function parsePersonalModelManagementResult<T>(
  value: unknown,
  parser: Parser<T>,
): RendererPersonalModelManagementSafeResult<T> {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    throw new Error("Desktop Main returned an invalid Personal Model result envelope");
  }
  const keys = Object.keys(value);
  if (value.ok) {
    if (!keys.every((key) => key === "ok" || key === "value")) {
      throw new Error("Desktop Main returned an invalid Personal Model success envelope");
    }
    return { ok: true, value: parser.parse(value.value) };
  }
  if (!keys.every((key) => key === "ok" || key === "error")) {
    throw new Error("Desktop Main returned an invalid Personal Model error envelope");
  }
  return {
    ok: false,
    error: PersonalModelManagementErrorEnvelopeV1Alpha1Schema.parse(value.error),
  };
}

function parsePersonalModelManagementResultV1Alpha2<T>(
  value: unknown,
  parser: Parser<T>,
): RendererPersonalModelManagementSafeResultV1Alpha2<T> {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    throw new Error("Desktop Main returned an invalid Personal Model v1alpha2 result envelope");
  }
  const keys = Object.keys(value);
  if (value.ok) {
    if (!keys.every((key) => key === "ok" || key === "value")) {
      throw new Error("Desktop Main returned an invalid Personal Model v1alpha2 success envelope");
    }
    return { ok: true, value: parser.parse(value.value) };
  }
  if (!keys.every((key) => key === "ok" || key === "error")) {
    throw new Error("Desktop Main returned an invalid Personal Model v1alpha2 error envelope");
  }
  return {
    ok: false,
    error: PersonalModelManagementErrorEnvelopeV1Alpha2Schema.parse(value.error),
  };
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
