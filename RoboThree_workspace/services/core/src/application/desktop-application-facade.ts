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
  ConversationSnapshotQuerySchema,
  CreateSessionCommandSchema,
  CreateWorkspaceGrantCommandSchema,
  DeleteSessionCommandSchema,
  DesktopErrorEnvelopeSchema,
  DesktopErrorEnvelopeV1Alpha2Schema,
  DurableDesktopEventEnvelopeSchema,
  ListAgentsQuerySchema,
  ListArtifactsQuerySchema,
  ListModelsQuerySchema,
  ListPendingUserConfirmationsQuerySchema,
  ListTasksQuerySchema,
  ListSessionsQuerySchema,
  ListWorkspaceGrantsQuerySchema,
  OpenSessionQuerySchema,
  RenameSessionCommandSchema,
  RevokeWorkspaceGrantCommandSchema,
  RuntimeStatusProjectionSchema,
  ReplayResetRequiredSchema,
  RuntimeStatusQuerySchema,
  SessionSummarySchema,
  TaskDetailProjectionSchema,
  TaskDetailQuerySchema,
  TaskControlCommandSchema,
  TaskControlReceiptSchema,
  TaskSummaryProjectionSchema,
  UserConfirmationProjectionSchema,
  SubmitTurnCommandSchema,
  SubmitTurnCommandV1Alpha2Schema,
  SubmitTurnReceiptSchema,
  SubmitTurnReceiptV1Alpha2Schema,
  SubmitTurnStatusQuerySchema,
  SubmitTurnStatusQueryV1Alpha2Schema,
  WorkspaceGrantProjectionSchema,
  type AgentProjection,
  type ArtifactPreviewQuery,
  type ArtifactCatalogProjection,
  type ArtifactSourceFileDeletionReceipt,
  type ArtifactLifecycleReceipt,
  type ArtifactTextPreviewProjection,
  type RegisterWorkspaceArtifactReceipt,
  type CompatibilityProjection,
  type CompatibilityQuery,
  type CompatibilityProjectionV1Alpha2,
  type CompatibilityQueryV1Alpha2,
  type DesktopErrorEnvelopeV1Alpha2,
  type GetRobotCatalogQuery,
  type GetToolCatalogQuery,
  type ListWorkspaceEntriesQuery,
  type ListRobotCatalogQuery,
  type ListToolCatalogQuery,
  type OpenTaskWorkspaceLocationCommand,
  type RobotCatalogDetail,
  type RobotCatalogPage,
  type ToolCatalogDetail,
  type ToolCatalogPage,
  type WorkspaceDirectoryProjection,
  type ConversationSnapshot,
  type ConversationSnapshotQuery,
  type CreateSessionCommand,
  type CreateWorkspaceGrantCommand,
  type DeleteArtifactSourceFileCommand,
  type DeleteArtifactRecordCommand,
  type DeleteSessionCommand,
  type DesktopErrorEnvelope,
  type DurableDesktopEventEnvelope,
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
  type RevokeWorkspaceGrantCommand,
  type RuntimeError,
  type RestoreArtifactRecordCommand,
  type SetArtifactLifecycleCommand,
  type RuntimeStatusProjection,
  type RuntimeStatusQuery,
  type ReplayResetRequired,
  type SessionSummary,
  type SubmitTurnCommand,
  type SubmitTurnCommandV1Alpha2,
  type SubmitTurnReceipt,
  type SubmitTurnReceiptV1Alpha2,
  type SubmitTurnStatusQuery,
  type SubmitTurnStatusQueryV1Alpha2,
  type TaskDetailProjection,
  type TaskDetailQuery,
  type TaskControlCommand,
  type TaskControlReceipt,
  type TaskSummaryProjection,
  type UserConfirmationProjection,
  type WorkspaceGrantProjection,
} from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import { CatalogQueryError } from "../ports/catalog-query.js";
import type {
  RobotCatalogQuery,
  ToolCatalogQuery,
} from "../ports/catalog-query.js";
import type { RuntimeSelectionContextProvider } from "../ports/runtime-selection-context-provider.js";
import type { SubmitTurnPersistence } from "../ports/submit-turn-persistence.js";
import type { WorkspaceSelectionIssuer } from "../ports/workspace-selection.js";
import {
  WorkspaceBrowserPortError,
  type WorkspaceBrowser,
  type WorkspaceRevealAuthorityServicePort,
} from "../ports/workspace-browser.js";
import type { DesktopConversationProjectionService } from "./desktop-conversation-projection-service.js";
import type { DesktopSessionService } from "./desktop-session-service.js";
import type { DesktopTaskProjectionService } from "./desktop-task-projection-service.js";
import type { PreparedArtifactSourceFileDeletion } from "./desktop-task-projection-service.js";
import type { DesktopTaskControlService } from "./desktop-task-control-service.js";
import type { RuntimeCatalogProjectionService } from "./runtime-selection-service.js";
import type {
  SubmitTurnCoordinator,
  SubmitTurnCoordinatorResult,
} from "./submit-turn-coordinator.js";
import type { WorkspaceGrantService } from "./workspace-grant-service.js";

export type DesktopApplicationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: DesktopErrorEnvelope }>;

export type DesktopApplicationResultV1Alpha2<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: DesktopErrorEnvelopeV1Alpha2 }>;

export type DesktopDurableEventPage = Readonly<{
  events: readonly DurableDesktopEventEnvelope[];
  durableCursor: string;
  reset?: ReplayResetRequired;
}>;

export type DesktopWorkspaceGrantAuthority = Readonly<{
  workspaceGrantId: string;
  displayName: string;
  rootDisplayPath: string;
  rootRealPath: string;
  accessMode: "read" | "read_write";
  status: "active";
}>;

export class DesktopApplicationFacade {
  readonly #clock: Clock;
  readonly #runtimeInstanceId: string;
  readonly #coreVersion: string;
  readonly #runtimeStatus: () => RuntimeStatusProjection["status"];
  readonly #pendingRuntimeActivation: () => boolean;
  readonly #workspaceSelections: WorkspaceSelectionIssuer;
  readonly #workspaces: WorkspaceGrantService;
  readonly #sessions: DesktopSessionService;
  readonly #conversations: DesktopConversationProjectionService;
  readonly #tasks: DesktopTaskProjectionService | undefined;
  readonly #taskControl: DesktopTaskControlService | undefined;
  readonly #catalog: RuntimeCatalogProjectionService;
  readonly #selectionContexts: RuntimeSelectionContextProvider;
  readonly #submitTurns: SubmitTurnCoordinator;
  readonly #coordination: SubmitTurnPersistence;
  readonly #workspaceBrowser: WorkspaceBrowser | undefined;
  readonly #workspaceReveal: WorkspaceRevealAuthorityServicePort | undefined;
  readonly #robotCatalog: RobotCatalogQuery | undefined;
  readonly #toolCatalog: ToolCatalogQuery | undefined;

  constructor(input: {
    clock: Clock;
    runtimeInstanceId: string;
    coreVersion: string;
    runtimeStatus: () => RuntimeStatusProjection["status"];
    pendingRuntimeActivation?: () => boolean;
    workspaceSelections: WorkspaceSelectionIssuer;
    workspaces: WorkspaceGrantService;
    sessions: DesktopSessionService;
    conversations: DesktopConversationProjectionService;
    tasks?: DesktopTaskProjectionService;
    taskControl?: DesktopTaskControlService;
    catalog: RuntimeCatalogProjectionService;
    selectionContexts: RuntimeSelectionContextProvider;
    submitTurns: SubmitTurnCoordinator;
    coordination: SubmitTurnPersistence;
    workspaceBrowser?: WorkspaceBrowser;
    workspaceReveal?: WorkspaceRevealAuthorityServicePort;
    robotCatalog?: RobotCatalogQuery;
    toolCatalog?: ToolCatalogQuery;
  }) {
    this.#clock = input.clock;
    this.#runtimeInstanceId = input.runtimeInstanceId;
    this.#coreVersion = input.coreVersion;
    this.#runtimeStatus = input.runtimeStatus;
    this.#pendingRuntimeActivation =
      input.pendingRuntimeActivation ?? (() => false);
    this.#workspaceSelections = input.workspaceSelections;
    this.#workspaces = input.workspaces;
    this.#sessions = input.sessions;
    this.#conversations = input.conversations;
    this.#tasks = input.tasks;
    this.#taskControl = input.taskControl;
    this.#catalog = input.catalog;
    this.#selectionContexts = input.selectionContexts;
    this.#submitTurns = input.submitTurns;
    this.#coordination = input.coordination;
    this.#workspaceBrowser = input.workspaceBrowser;
    this.#workspaceReveal = input.workspaceReveal;
    this.#robotCatalog = input.robotCatalog;
    this.#toolCatalog = input.toolCatalog;
  }

  get runtimeInstanceId(): string {
    return this.#runtimeInstanceId;
  }

  now(): string {
    return this.#clock.now();
  }

  registerWorkspaceSelection(input: {
    selectedPath: string;
    clientInstanceId: string;
    correlationId: string;
    ttlMs?: number;
  }): string {
    return this.#workspaceSelections.issue(input);
  }

  discardWorkspaceSelection(selectionHandle: string): void {
    this.#workspaceSelections.discard(selectionHandle);
  }

  compatibility(
    input: CompatibilityQuery,
  ): DesktopApplicationResult<CompatibilityProjection> {
    const parsed = CompatibilityQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    return {
      ok: true,
      value: CompatibilityProjectionSchema.parse({
        contractVersion: "v1alpha1",
        coreVersion: this.#coreVersion,
        supportedContractVersions: ["v1alpha1"],
        selectedContractVersion: "v1alpha1",
        features: [
          "workspace",
          "session",
          "catalog",
          "submit_turn",
          "durable_event_stream",
          "task_projection",
          "task_control",
          "user_confirmation",
          "artifact_preview",
        ],
        runtimeInstanceId: this.#runtimeInstanceId,
        pendingRuntimeActivation: this.#pendingRuntimeActivation(),
      }),
    };
  }

  compatibilityV1Alpha2(
    input: CompatibilityQueryV1Alpha2,
  ): DesktopApplicationResultV1Alpha2<CompatibilityProjectionV1Alpha2> {
    const parsed = CompatibilityQueryV1Alpha2Schema.safeParse(input);
    if (!parsed.success || !parsed.data.supportedContractVersions.includes("v1alpha2")) {
      return failV1Alpha2(
        "contract.unsupported_version",
        "Desktop v1alpha2 is not supported by this request.",
        input,
        "compatibility",
      );
    }
    const pending = this.#pendingRuntimeActivation();
    return {
      ok: true,
      value: CompatibilityProjectionV1Alpha2Schema.parse({
        contractVersion: "v1alpha2",
        coreVersion: this.#coreVersion,
        supportedContractVersions: ["v1alpha1", "v1alpha2"],
        selectedContractVersion: "v1alpha2",
        features: [
          "workspace",
          "session",
          "catalog",
          "submit_turn",
          "durable_event_stream",
          "enterprise_configuration_status",
          ...(this.#workspaceBrowser === undefined ? [] : ["task_workspace_browser" as const]),
          ...(this.#workspaceReveal === undefined ? [] : ["task_workspace_reveal" as const]),
          ...(this.#robotCatalog === undefined || this.#toolCatalog === undefined
            ? []
            : ["robot_tool_catalog" as const]),
        ],
        runtimeInstanceId: this.#runtimeInstanceId,
        activationState: pending ? "pending_restart" : "uninitialized",
        pendingRuntimeActivation: pending,
        enterpriseConfigurationStatusQueryRef: "enterprise-configuration-status:current",
      }),
    };
  }

  async listWorkspaceEntriesV1Alpha2(
    input: ListWorkspaceEntriesQuery,
    signal?: AbortSignal,
  ): Promise<DesktopApplicationResultV1Alpha2<WorkspaceDirectoryProjection>> {
    const parsed = ListWorkspaceEntriesQuerySchema.safeParse(input);
    if (!parsed.success) {
      return failV1Alpha2("contract.invalid", "Workspace query is invalid.", input);
    }
    if (this.#workspaceBrowser === undefined) {
      return failV1Alpha2(
        "contract.feature_unavailable",
        "Workspace browsing is unavailable.",
        input,
        "compatibility",
        true,
      );
    }
    try {
      return { ok: true, value: await this.#workspaceBrowser.listEntries(parsed.data, signal) };
    } catch (error) {
      return workspaceFailureV1Alpha2(error, parsed.data);
    }
  }

  async listRobotCatalogV1Alpha2(
    input: ListRobotCatalogQuery,
    signal?: AbortSignal,
  ): Promise<DesktopApplicationResultV1Alpha2<RobotCatalogPage>> {
    const parsed = ListRobotCatalogQuerySchema.safeParse(input);
    if (!parsed.success) {
      return failV1Alpha2("catalog.invalid_query", "Robot catalog query is invalid.", input);
    }
    if (this.#robotCatalog === undefined || this.#toolCatalog === undefined) {
      return failV1Alpha2(
        "contract.feature_unavailable",
        "Robot and Tool catalog is unavailable in this runtime.",
        input,
        "compatibility",
        true,
      );
    }
    if (signal?.aborted) {
      return failV1Alpha2("runtime.request_aborted", "Robot catalog request was cancelled.", input, "cancelled");
    }
    try {
      const value = await this.#robotCatalog.list(parsed.data);
      if (signal?.aborted) {
        return failV1Alpha2("runtime.request_aborted", "Robot catalog request was cancelled.", parsed.data, "cancelled");
      }
      return { ok: true, value: RobotCatalogPageSchema.parse(value) };
    } catch (error) {
      return catalogFailureV1Alpha2(error, parsed.data);
    }
  }

  async getRobotCatalogV1Alpha2(
    input: GetRobotCatalogQuery,
    signal?: AbortSignal,
  ): Promise<DesktopApplicationResultV1Alpha2<RobotCatalogDetail>> {
    const parsed = GetRobotCatalogQuerySchema.safeParse(input);
    if (!parsed.success) {
      return failV1Alpha2("catalog.invalid_query", "Robot catalog query is invalid.", input);
    }
    if (this.#robotCatalog === undefined || this.#toolCatalog === undefined) {
      return failV1Alpha2(
        "contract.feature_unavailable",
        "Robot and Tool catalog is unavailable in this runtime.",
        input,
        "compatibility",
        true,
      );
    }
    if (signal?.aborted) {
      return failV1Alpha2("runtime.request_aborted", "Robot catalog request was cancelled.", input, "cancelled");
    }
    try {
      const value = await this.#robotCatalog.get(parsed.data);
      if (signal?.aborted) {
        return failV1Alpha2("runtime.request_aborted", "Robot catalog request was cancelled.", parsed.data, "cancelled");
      }
      return { ok: true, value: RobotCatalogDetailSchema.parse(value) };
    } catch (error) {
      return catalogFailureV1Alpha2(error, parsed.data);
    }
  }

  async listToolCatalogV1Alpha2(
    input: ListToolCatalogQuery,
    signal?: AbortSignal,
  ): Promise<DesktopApplicationResultV1Alpha2<ToolCatalogPage>> {
    const parsed = ListToolCatalogQuerySchema.safeParse(input);
    if (!parsed.success) {
      return failV1Alpha2("catalog.invalid_query", "Tool catalog query is invalid.", input);
    }
    if (this.#robotCatalog === undefined || this.#toolCatalog === undefined) {
      return failV1Alpha2(
        "contract.feature_unavailable",
        "Robot and Tool catalog is unavailable in this runtime.",
        input,
        "compatibility",
        true,
      );
    }
    if (signal?.aborted) {
      return failV1Alpha2("runtime.request_aborted", "Tool catalog request was cancelled.", input, "cancelled");
    }
    try {
      const value = await this.#toolCatalog.list(parsed.data);
      if (signal?.aborted) {
        return failV1Alpha2("runtime.request_aborted", "Tool catalog request was cancelled.", parsed.data, "cancelled");
      }
      return { ok: true, value: ToolCatalogPageSchema.parse(value) };
    } catch (error) {
      return catalogFailureV1Alpha2(error, parsed.data);
    }
  }

  async getToolCatalogV1Alpha2(
    input: GetToolCatalogQuery,
    signal?: AbortSignal,
  ): Promise<DesktopApplicationResultV1Alpha2<ToolCatalogDetail>> {
    const parsed = GetToolCatalogQuerySchema.safeParse(input);
    if (!parsed.success) {
      return failV1Alpha2("catalog.invalid_query", "Tool catalog query is invalid.", input);
    }
    if (this.#robotCatalog === undefined || this.#toolCatalog === undefined) {
      return failV1Alpha2(
        "contract.feature_unavailable",
        "Robot and Tool catalog is unavailable in this runtime.",
        input,
        "compatibility",
        true,
      );
    }
    if (signal?.aborted) {
      return failV1Alpha2("runtime.request_aborted", "Tool catalog request was cancelled.", input, "cancelled");
    }
    try {
      const value = await this.#toolCatalog.get(parsed.data);
      if (signal?.aborted) {
        return failV1Alpha2("runtime.request_aborted", "Tool catalog request was cancelled.", parsed.data, "cancelled");
      }
      return { ok: true, value: ToolCatalogDetailSchema.parse(value) };
    } catch (error) {
      return catalogFailureV1Alpha2(error, parsed.data);
    }
  }

  async prepareWorkspaceRevealV1Alpha2(
    input: OpenTaskWorkspaceLocationCommand,
    signal?: AbortSignal,
  ) {
    const parsed = OpenTaskWorkspaceLocationCommandSchema.safeParse(input);
    if (!parsed.success) {
      return failV1Alpha2("contract.invalid", "Workspace reveal command is invalid.", input);
    }
    if (this.#workspaceReveal === undefined) {
      return failV1Alpha2(
        "contract.feature_unavailable",
        "Workspace reveal is unavailable.",
        input,
        "compatibility",
        true,
      );
    }
    try {
      return { ok: true as const, value: await this.#workspaceReveal.prepare(parsed.data, signal) };
    } catch (error) {
      return workspaceFailureV1Alpha2(error, parsed.data);
    }
  }

  async consumeWorkspaceRevealV1Alpha2(
    input: Readonly<{
      command: OpenTaskWorkspaceLocationCommand;
      authorityToken: string;
    }>,
    signal?: AbortSignal,
  ) {
    const parsed = OpenTaskWorkspaceLocationCommandSchema.safeParse(input.command);
    if (!parsed.success || !/^wra1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(input.authorityToken)) {
      return failV1Alpha2("contract.invalid", "Workspace reveal authority is invalid.", input.command);
    }
    if (this.#workspaceReveal === undefined) {
      return failV1Alpha2(
        "contract.feature_unavailable",
        "Workspace reveal is unavailable.",
        parsed.data,
        "compatibility",
        true,
      );
    }
    try {
      return {
        ok: true as const,
        value: await this.#workspaceReveal.consume({
          command: parsed.data,
          authorityToken: input.authorityToken,
        }, signal),
      };
    } catch (error) {
      return workspaceFailureV1Alpha2(error, parsed.data);
    }
  }

  runtimeStatus(
    input: RuntimeStatusQuery,
  ): DesktopApplicationResult<RuntimeStatusProjection> {
    const parsed = RuntimeStatusQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    return {
      ok: true,
      value: RuntimeStatusProjectionSchema.parse({
        contractVersion: "v1alpha1",
        status: this.#runtimeStatus(),
        runtimeInstanceId: this.#runtimeInstanceId,
        pendingRuntimeActivation: this.#pendingRuntimeActivation(),
      }),
    };
  }

  async createWorkspaceGrant(
    input: CreateWorkspaceGrantCommand,
  ): Promise<DesktopApplicationResult<WorkspaceGrantProjection>> {
    const parsed = CreateWorkspaceGrantCommandSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    return fromRuntimeResult(await this.#workspaces.create(parsed.data), input);
  }

  async revokeWorkspaceGrant(
    input: RevokeWorkspaceGrantCommand,
  ): Promise<DesktopApplicationResult<WorkspaceGrantProjection>> {
    const parsed = RevokeWorkspaceGrantCommandSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    return fromRuntimeResult(await this.#workspaces.revoke(parsed.data), input);
  }

  async listWorkspaceGrants(
    input: ListWorkspaceGrantsQuery,
  ): Promise<DesktopApplicationResult<readonly WorkspaceGrantProjection[]>> {
    const parsed = ListWorkspaceGrantsQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    return {
      ok: true,
      value: (await this.#workspaces.list()).map((item) =>
        WorkspaceGrantProjectionSchema.parse(item)),
    };
  }

  async createSession(
    input: CreateSessionCommand,
  ): Promise<DesktopApplicationResult<SessionSummary>> {
    const parsed = CreateSessionCommandSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    return fromRuntimeResult(await this.#sessions.create(parsed.data), input);
  }

  async renameSession(
    input: RenameSessionCommand,
  ): Promise<DesktopApplicationResult<SessionSummary>> {
    const parsed = RenameSessionCommandSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    return fromRuntimeResult(await this.#sessions.rename(parsed.data), input);
  }

  async deleteSession(
    input: DeleteSessionCommand,
  ): Promise<DesktopApplicationResult<SessionSummary>> {
    const parsed = DeleteSessionCommandSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    return fromRuntimeResult(await this.#sessions.delete(parsed.data), input);
  }

  async listSessions(
    input: ListSessionsQuery,
  ): Promise<DesktopApplicationResult<readonly SessionSummary[]>> {
    const parsed = ListSessionsQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    return {
      ok: true,
      value: (await this.#sessions.list(parsed.data.includeTombstoned ?? false))
        .map((item) => SessionSummarySchema.parse(item)),
    };
  }

  async openSession(
    input: OpenSessionQuery,
  ): Promise<DesktopApplicationResult<SessionSummary>> {
    const parsed = OpenSessionQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    const session = await this.#sessions.load(parsed.data.sessionId);
    if (session === undefined) {
      return fail("session.not_found", "Session is unavailable", input, false);
    }
    return { ok: true, value: SessionSummarySchema.parse(session) };
  }

  async listAgents(
    input: ListAgentsQuery,
  ): Promise<DesktopApplicationResult<readonly AgentProjection[]>> {
    const parsed = ListAgentsQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    const context = await this.#selectionContexts.resolve();
    if (context === undefined) return runtimeUnavailable(input);
    return {
      ok: true,
      value: (await this.#catalog.listAgents(context.liveModels)).map((item) =>
        AgentProjectionSchema.parse(item)),
    };
  }

  async listModels(
    input: ListModelsQuery,
  ): Promise<DesktopApplicationResult<readonly ModelProjection[]>> {
    const parsed = ListModelsQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    const context = await this.#selectionContexts.resolve();
    if (context === undefined) return runtimeUnavailable(input);
    return { ok: true, value: await this.#catalog.listModels(context.liveModels) };
  }

  async loadConversationSnapshot(
    input: ConversationSnapshotQuery,
  ): Promise<DesktopApplicationResult<ConversationSnapshot>> {
    const parsed = ConversationSnapshotQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    await this.#tasks?.syncDesktopSession(parsed.data.sessionId);
    const latestDurableCursor = await this.#latestDurableCursor();
    const result = await this.#conversations.loadSnapshot({
      desktopSessionId: parsed.data.sessionId,
      latestDurableCursor,
      ...(parsed.data.beforeSequence === undefined
        ? {}
        : { beforeSequence: parsed.data.beforeSequence }),
      ...(parsed.data.limit === undefined ? {} : { limit: parsed.data.limit }),
    });
    return fromRuntimeResult(result, input);
  }

  async listTasks(
    input: ListTasksQuery,
  ): Promise<DesktopApplicationResult<readonly TaskSummaryProjection[]>> {
    const parsed = ListTasksQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    if (this.#tasks === undefined) return runtimeUnavailable(input);
    const result = await this.#tasks.list(parsed.data);
    if (!result.ok) return { ok: false, error: mapError(result.error, input) };
    return {
      ok: true,
      value: result.value.map((item) => TaskSummaryProjectionSchema.parse(item)),
    };
  }

  async loadTaskDetail(
    input: TaskDetailQuery,
  ): Promise<DesktopApplicationResult<TaskDetailProjection>> {
    const parsed = TaskDetailQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    if (this.#tasks === undefined) return runtimeUnavailable(input);
    const result = await this.#tasks.loadDetail({
      desktopTaskId: parsed.data.taskId,
    });
    if (!result.ok) return { ok: false, error: mapError(result.error, input) };
    return { ok: true, value: TaskDetailProjectionSchema.parse(result.value) };
  }

  async listArtifacts(
    input: ListArtifactsQuery,
  ): Promise<DesktopApplicationResult<ArtifactCatalogProjection>> {
    const parsed = ListArtifactsQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    if (this.#tasks === undefined) return runtimeUnavailable(input);
    const result = await this.#tasks.listArtifactCatalog(parsed.data);
    if (!result.ok) return { ok: false, error: mapError(result.error, input) };
    return {
      ok: true,
      value: ArtifactCatalogProjectionSchema.parse(result.value),
    };
  }

  async listWorkspaceGrantAuthorities(
    input: { correlationId?: string },
  ): Promise<DesktopApplicationResult<readonly DesktopWorkspaceGrantAuthority[]>> {
    if (!isRecord(input) || Object.keys(input).some((key) => key !== "correlationId")) {
      return invalid("Workspace authority query is invalid", privateRouteInput());
    }
    const authorities = await this.#workspaces.listPrivateAuthorities();
    return {
      ok: true,
      value: authorities.map((authority) => Object.freeze({
        workspaceGrantId: authority.workspaceGrantId,
        displayName: authority.displayName,
        rootDisplayPath: authority.rootDisplayPath,
        rootRealPath: authority.rootRealPath,
        accessMode: authority.accessMode,
        status: "active" as const,
      })),
    };
  }

  async registerWorkspaceArtifact(
    input: unknown,
  ): Promise<DesktopApplicationResult<RegisterWorkspaceArtifactReceipt>> {
    const parsed = parsePrivateWorkspaceArtifactRegistration(input);
    if (!parsed.ok) return invalid(parsed.message, privateRouteInput());
    if (this.#tasks === undefined) return runtimeUnavailable(parsed.value.command);
    const result = await this.#tasks.registerManualArtifact(parsed.value);
    if (!result.ok) return { ok: false, error: mapError(result.error, parsed.value.command) };
    return {
      ok: true,
      value: RegisterWorkspaceArtifactReceiptSchema.parse(result.value),
    };
  }

  async previewArtifact(
    input: ArtifactPreviewQuery,
  ): Promise<DesktopApplicationResult<ArtifactTextPreviewProjection>> {
    const parsed = ArtifactPreviewQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    if (this.#tasks === undefined) return runtimeUnavailable(input);
    const result = await this.#tasks.previewArtifact(parsed.data);
    if (!result.ok) return { ok: false, error: mapError(result.error, input) };
    return {
      ok: true,
      value: ArtifactTextPreviewProjectionSchema.parse(result.value),
    };
  }

  async setArtifactLifecycle(
    input: SetArtifactLifecycleCommand,
  ): Promise<DesktopApplicationResult<ArtifactLifecycleReceipt>> {
    const parsed = SetArtifactLifecycleCommandSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    if (this.#tasks === undefined) return runtimeUnavailable(input);
    const result = await this.#tasks.setArtifactLifecycle(parsed.data);
    if (!result.ok) return { ok: false, error: mapError(result.error, input) };
    return {
      ok: true,
      value: ArtifactLifecycleReceiptSchema.parse(result.value),
    };
  }

  async deleteArtifactRecord(
    input: DeleteArtifactRecordCommand,
  ): Promise<DesktopApplicationResult<ArtifactLifecycleReceipt>> {
    const parsed = DeleteArtifactRecordCommandSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    if (this.#tasks === undefined) return runtimeUnavailable(input);
    const result = await this.#tasks.deleteArtifactRecord(parsed.data);
    if (!result.ok) return { ok: false, error: mapError(result.error, input) };
    return {
      ok: true,
      value: ArtifactLifecycleReceiptSchema.parse(result.value),
    };
  }

  async restoreArtifactRecord(
    input: RestoreArtifactRecordCommand,
  ): Promise<DesktopApplicationResult<ArtifactLifecycleReceipt>> {
    const parsed = RestoreArtifactRecordCommandSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    if (this.#tasks === undefined) return runtimeUnavailable(input);
    const result = await this.#tasks.restoreArtifactRecord(parsed.data);
    if (!result.ok) return { ok: false, error: mapError(result.error, input) };
    return {
      ok: true,
      value: ArtifactLifecycleReceiptSchema.parse(result.value),
    };
  }

  async prepareArtifactSourceFileDeletion(
    input: DeleteArtifactSourceFileCommand,
  ): Promise<DesktopApplicationResult<
    PreparedArtifactSourceFileDeletion | ArtifactSourceFileDeletionReceipt
  >> {
    const parsed = DeleteArtifactSourceFileCommandSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    if (this.#tasks === undefined) return runtimeUnavailable(input);
    const result = await this.#tasks.prepareArtifactSourceFileDeletion(parsed.data);
    if (!result.ok) return { ok: false, error: mapError(result.error, input) };
    if ("receipt" in result) {
      return {
        ok: true,
        value: ArtifactSourceFileDeletionReceiptSchema.parse(result.receipt),
      };
    }
    return { ok: true, value: result.value };
  }

  async commitArtifactSourceFileDeletion(
    input: DeleteArtifactSourceFileCommand,
  ): Promise<DesktopApplicationResult<ArtifactSourceFileDeletionReceipt>> {
    const parsed = DeleteArtifactSourceFileCommandSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    if (this.#tasks === undefined) return runtimeUnavailable(input);
    const result = await this.#tasks.commitArtifactSourceFileDeletion(parsed.data);
    if (!result.ok) return { ok: false, error: mapError(result.error, input) };
    return {
      ok: true,
      value: ArtifactSourceFileDeletionReceiptSchema.parse(result.value),
    };
  }

  async resolveArtifactFileSource(input: {
    artifactId: string;
  }): Promise<DesktopApplicationResult<{
    artifactId: string;
    taskId?: string;
    displayName: string;
    relativePath: string;
    workspaceGrantId: string;
    rootRealPath: string;
  }>> {
    if (
      !isRecord(input)
      || Object.keys(input).some((key) => key !== "artifactId")
      || typeof input.artifactId !== "string"
      || !/^artifact:[0-9a-f]{64}$/u.test(input.artifactId)
    ) return invalid("Artifact source request is invalid", privateRouteInput());
    if (this.#tasks === undefined) return runtimeUnavailable(privateRouteInput());
    const result = await this.#tasks.resolveArtifactFileSource({
      artifactId: input.artifactId,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: mapError(result.error, {
          correlationId: "00000000-0000-4000-8000-000000000000",
        }),
      };
    }
    return {
      ok: true,
      value: {
        artifactId: result.value.artifactId,
        ...(result.value.taskId === undefined ? {} : { taskId: result.value.taskId }),
        displayName: result.value.displayName,
        relativePath: result.value.relativePath,
        workspaceGrantId: result.value.workspaceGrantId,
        rootRealPath: result.value.rootRealPath,
      },
    };
  }

  async listPendingUserConfirmations(
    input: ListPendingUserConfirmationsQuery,
  ): Promise<DesktopApplicationResult<readonly UserConfirmationProjection[]>> {
    const parsed = ListPendingUserConfirmationsQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    if (this.#tasks === undefined) return runtimeUnavailable(input);
    const result = await this.#tasks.listPendingConfirmations(parsed.data);
    if (!result.ok) return { ok: false, error: mapError(result.error, input) };
    return {
      ok: true,
      value: result.value.map((item) =>
        UserConfirmationProjectionSchema.parse(item)),
    };
  }

  async controlTask(
    input: TaskControlCommand,
  ): Promise<DesktopApplicationResult<TaskControlReceipt>> {
    const parsed = TaskControlCommandSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    if (this.#taskControl === undefined) return runtimeUnavailable(input);
    const result = await this.#taskControl.execute(parsed.data);
    if (!result.ok) return { ok: false, error: mapError(result.error, input) };
    return {
      ok: true,
      value: TaskControlReceiptSchema.parse(result.value),
    };
  }

  async submitTurn(
    input: SubmitTurnCommand,
  ): Promise<DesktopApplicationResult<SubmitTurnReceipt>> {
    const parsed = SubmitTurnCommandSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    const result: SubmitTurnCoordinatorResult =
      await this.#submitTurns.submit(parsed.data);
    if (!result.ok) return { ok: false, error: mapError(result.error, input) };
    return { ok: true, value: SubmitTurnReceiptSchema.parse(result.receipt) };
  }

  async submitTurnV1Alpha2(
    input: SubmitTurnCommandV1Alpha2,
  ): Promise<DesktopApplicationResultV1Alpha2<SubmitTurnReceiptV1Alpha2>> {
    const parsed = SubmitTurnCommandV1Alpha2Schema.safeParse(input);
    if (!parsed.success) {
      return failV1Alpha2(
        "contract.invalid",
        parsed.error.issues[0]?.message ?? "SubmitTurn command is invalid.",
        input,
      );
    }
    const result = await this.#submitTurns.submitV1Alpha2(parsed.data);
    if (!result.ok) {
      return {
        ok: false,
        error: mapErrorV1Alpha2(result.error, input),
      };
    }
    const receipt = SubmitTurnReceiptV1Alpha2Schema.safeParse(result.receipt);
    return receipt.success
      ? { ok: true, value: receipt.data }
      : failV1Alpha2(
        "submit_turn.invalid_selection",
        "SubmitTurn receipt does not match the requested Contract version.",
        input,
        "internal",
      );
  }

  async querySubmitTurn(
    input: SubmitTurnStatusQuery,
  ): Promise<DesktopApplicationResult<SubmitTurnReceipt>> {
    const parsed = SubmitTurnStatusQuerySchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message, input);
    const receipt = await this.#coordination.loadReceipt(
      parsed.data.submitTurnCommandId,
    );
    if (receipt === undefined) {
      return fail("submit_turn.not_found", "SubmitTurn receipt is unavailable", input);
    }
    if ("contractVersion" in receipt) {
      return fail(
        "submit_turn.invalid_selection",
        "SubmitTurn receipt belongs to a different Contract version",
        input,
      );
    }
    const {
      requestDigest: _requestDigest,
      completedAt: _completedAt,
      terminalError: _terminalError,
      ...publicReceipt
    } = receipt;
    return { ok: true, value: SubmitTurnReceiptSchema.parse(publicReceipt) };
  }

  async querySubmitTurnV1Alpha2(
    input: SubmitTurnStatusQueryV1Alpha2,
  ): Promise<DesktopApplicationResultV1Alpha2<SubmitTurnReceiptV1Alpha2>> {
    const parsed = SubmitTurnStatusQueryV1Alpha2Schema.safeParse(input);
    if (!parsed.success) {
      return failV1Alpha2(
        "contract.invalid",
        parsed.error.issues[0]?.message ?? "SubmitTurn query is invalid.",
        input,
      );
    }
    const receipt = await this.#coordination.loadReceipt(
      parsed.data.submitTurnCommandId,
    );
    if (receipt === undefined) {
      return failV1Alpha2(
        "submit_turn.not_found",
        "SubmitTurn receipt is unavailable",
        input,
        "availability",
      );
    }
    const {
      requestDigest: _requestDigest,
      completedAt: _completedAt,
      terminalError: _terminalError,
      ...publicReceipt
    } = receipt;
    const result = SubmitTurnReceiptV1Alpha2Schema.safeParse(publicReceipt);
    return result.success
      ? { ok: true, value: result.data }
      : failV1Alpha2(
        "submit_turn.invalid_selection",
        "SubmitTurn receipt belongs to a different Contract version.",
        input,
        "internal",
      );
  }

  async listDurableEvents(
    durableCursor = "delivery:0",
    limit = 100,
  ): Promise<DesktopDurableEventPage> {
    await this.#tasks?.syncAll();
    const sequence = parseCursor(durableCursor);
    const bounds = await this.#coordination.deliveryBounds();
    if (sequence > bounds.latestSequence) {
      return resetPage("unknown_cursor", bounds.latestSequence);
    }
    if (
      bounds.latestSequence > 0
      && sequence < bounds.oldestSequence - 1
    ) {
      return resetPage("retention_window_exceeded", bounds.latestSequence);
    }
    const deliveries = await this.#coordination.listDeliveriesAfter(
      sequence,
      Math.min(Math.max(Math.trunc(limit), 1), 500),
    );
    const events = deliveries.map((delivery) => {
      const payload = delivery.type === "message.committed"
        ? {
            type: "message_committed" as const,
            sessionId: delivery.sessionId,
            messageId: delivery.messageId!,
            messageRevision: delivery.messageRevision!,
            status: delivery.messageStatus!,
            queryRef: `conversation:${delivery.sessionId}`,
          }
        : delivery.type === "task.status_changed"
          ? {
            type: "task_status_changed" as const,
            sessionId: delivery.sessionId,
            taskId: delivery.taskId!,
            taskRevision: delivery.taskRevision!,
            displayStatus: delivery.taskDisplayStatus!,
            queryRef: `task-detail:${delivery.taskId!}`,
          }
          : delivery.type === "tool.activity_changed"
            ? {
              type: "tool_activity_changed" as const,
              taskId: delivery.taskId!,
              activityId: delivery.activityId!,
              queryRef: `task-detail:${delivery.taskId!}`,
            }
            : delivery.type === "user_confirmation.changed"
              ? {
                type: "user_confirmation_changed" as const,
                taskId: delivery.taskId!,
                confirmationId: delivery.confirmationId!,
                queryRef: `task-detail:${delivery.taskId!}`,
              }
            : {
            type: "submit_turn_status_changed" as const,
            sessionId: delivery.sessionId,
            submitTurnCommandId: delivery.submitTurnCommandId,
            ...(delivery.taskId === undefined ? {} : { taskId: delivery.taskId }),
            status: delivery.type === "turn.accepted" ? "accepted" as const : "rejected" as const,
            queryRef: `submit-turn:${delivery.submitTurnCommandId}`,
            };
      return DurableDesktopEventEnvelopeSchema.parse({
        contractVersion: "v1alpha1",
        eventId: delivery.deliveryId,
        deliveryKind: "durable",
        durableCursor: `delivery:${delivery.sequence}`,
        runtimeInstanceId: this.#runtimeInstanceId,
        emittedAt: delivery.createdAt,
        payload,
      });
    });
    return {
      events,
      durableCursor: events.at(-1)?.durableCursor ?? durableCursor,
    };
  }

  async #latestDurableCursor(): Promise<string> {
    let cursor = "delivery:0";
    while (true) {
      const page = await this.listDurableEvents(cursor, 500);
      if (page.reset !== undefined || page.events.length === 0) {
        return page.durableCursor;
      }
      cursor = page.durableCursor;
      if (page.events.length < 500) return cursor;
    }
  }
}

function resetPage(
  reason: "unknown_cursor" | "retention_window_exceeded",
  latestSequence: number,
): DesktopDurableEventPage {
  const durableCursor = `delivery:${latestSequence}`;
  return {
    events: [],
    durableCursor,
    reset: ReplayResetRequiredSchema.parse({
      type: "replay_reset_required",
      reason,
      snapshotQueryRef: "conversation-snapshot:active-session",
      replacementCursor: durableCursor,
    }),
  };
}

function fromRuntimeResult<T>(
  result:
    | { ok: true; value: T }
    | { ok: false; error: RuntimeError },
  input: { correlationId?: string },
): DesktopApplicationResult<T> {
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, error: mapError(result.error, input) };
}

function invalid<T>(
  message: string | undefined,
  input: { correlationId?: string },
): DesktopApplicationResult<T> {
  return fail("contract.invalid", message ?? "Desktop request is invalid", input);
}

function failV1Alpha2<T>(
  code: string,
  safeSummary: string,
  input: { correlationId?: string },
  category: DesktopErrorEnvelopeV1Alpha2["category"] = "validation",
  retryable = false,
): DesktopApplicationResultV1Alpha2<T> {
  return {
    ok: false,
    error: {
      contractVersion: "v1alpha2",
      code,
      category,
      safeSummary,
      retryable,
      correlationId: validCorrelationId(input.correlationId),
    },
  };
}

function workspaceFailureV1Alpha2<T>(
  error: unknown,
  input: { correlationId?: string },
): DesktopApplicationResultV1Alpha2<T> {
  const code = error instanceof WorkspaceBrowserPortError
    ? error.code
    : "workspace.operation_unavailable";
  const category: DesktopErrorEnvelopeV1Alpha2["category"] = code.includes("cancel")
    ? "cancelled"
    : code.includes("stale") || code.includes("identity_changed")
      ? "conflict"
      : code.includes("invalid") || code.includes("proof") || code.includes("cursor")
        ? "validation"
        : code.includes("outside")
          ? "workspace_boundary"
          : code.includes("grant") || code.includes("unlocked") || code.includes("scope")
            ? "authorization"
            : "availability";
  return failV1Alpha2(
    code,
    category === "authorization"
      ? "This task cannot access the requested workspace."
      : category === "conflict"
        ? "The workspace changed. Refresh and try again."
        : category === "validation"
          ? "The workspace request is invalid or expired."
          : category === "cancelled"
            ? "The workspace request was cancelled."
            : "The workspace is temporarily unavailable.",
    input,
    category,
    category === "availability",
  );
}

function catalogFailureV1Alpha2<T>(
  error: unknown,
  input: { correlationId?: string },
): DesktopApplicationResultV1Alpha2<T> {
  const code = error instanceof CatalogQueryError
    ? error.code
    : "catalog.registry_unavailable";
  const category: DesktopErrorEnvelopeV1Alpha2["category"] =
    code === "catalog.invalid_query"
      ? "validation"
      : code === "catalog.cursor_invalid" || code === "catalog.stale_cursor"
        ? "conflict"
        : code === "catalog.robot_not_found" || code === "catalog.tool_not_found"
            || code === "catalog.registry_unavailable"
          ? "availability"
          : "internal";
  return failV1Alpha2(
    code,
    catalogSafeSummary(code),
    input,
    category,
    code === "catalog.registry_unavailable",
  );
}

function catalogSafeSummary(code: string): string {
  switch (code) {
    case "catalog.invalid_query":
      return "Catalog request is invalid.";
    case "catalog.cursor_invalid":
      return "The catalog page position does not belong to the current runtime. Refresh and try again.";
    case "catalog.stale_cursor":
      return "The catalog changed. Refresh and try again.";
    case "catalog.robot_not_found":
      return "The robot does not exist or is no longer visible.";
    case "catalog.tool_not_found":
      return "The tool does not exist or is no longer visible.";
    case "catalog.registry_unavailable":
      return "The catalog is temporarily unavailable.";
    case "catalog.integrity_violation":
      return "Trusted catalog integrity validation failed.";
    case "catalog.response_too_large":
      return "The catalog response exceeded the safe size limit.";
    default:
      return "The catalog request could not be completed safely.";
  }
}

function runtimeUnavailable<T>(
  input: { correlationId?: string },
): DesktopApplicationResult<T> {
  return fail("runtime.unavailable", "Runtime catalog is unavailable", input, true);
}

function fail<T>(
  code: DesktopErrorEnvelope["code"],
  safeSummary: string,
  input: { correlationId?: string },
  retryable = false,
): DesktopApplicationResult<T> {
  return {
    ok: false,
    error: DesktopErrorEnvelopeSchema.parse({
      contractVersion: "v1alpha1",
      code,
      category: code === "runtime.unavailable" ? "availability" : "validation",
      safeSummary,
      retryable,
      correlationId: validCorrelationId(input.correlationId),
    }),
  };
}

function mapError(
  error: RuntimeError,
  input: { correlationId?: string },
): DesktopErrorEnvelope {
  const code = mapErrorCode(error.code);
  return DesktopErrorEnvelopeSchema.parse({
    contractVersion: "v1alpha1",
    code,
    category: mapErrorCategory(error.category, code),
    safeSummary: safeSummaryFor(code),
    retryable: error.retryable,
    correlationId: validCorrelationId(input.correlationId),
  });
}

function mapErrorV1Alpha2(
  error: RuntimeError,
  input: { correlationId?: string },
): DesktopErrorEnvelopeV1Alpha2 {
  const code = mapErrorCode(error.code);
  const category: DesktopErrorEnvelopeV1Alpha2["category"] =
    code === "command.idempotency_conflict"
      ? "conflict"
      : error.category === "authorization"
        ? "authorization"
        : error.category === "timeout"
          ? "timeout"
          : error.category === "cancelled"
            ? "cancelled"
            : error.category === "validation"
              ? "validation"
              : error.category === "internal"
                ? "internal"
                : "availability";
  return DesktopErrorEnvelopeV1Alpha2Schema.parse({
    contractVersion: "v1alpha2",
    code,
    category,
    safeSummary: safeSummaryFor(code),
    retryable: error.retryable,
    correlationId: validCorrelationId(input.correlationId),
  });
}

function mapErrorCode(code: string): DesktopErrorEnvelope["code"] {
  if (code === "workspace.selection_expired") return "workspace.selection_expired";
  if (code === "workspace.selection_consumed") return "workspace.selection_consumed";
  if (code === "workspace.selection_context_mismatch") {
    return "workspace.selection_context_mismatch";
  }
  if (code.startsWith("workspace.selection_")) return "workspace.selection_invalid";
  if (code.includes("idempotency_conflict")) return "command.idempotency_conflict";
  if (code === "desktop.task_not_found") return "task.not_found";
  if (code === "desktop.artifact_not_found" || code === "desktop.artifact_unavailable") {
    return "task.not_found";
  }
  if (code === "desktop.artifact_revision_conflict") return "task.stale_revision";
  if (
    code === "desktop.artifact_deleted"
    || code === "desktop.artifact_already_deleted"
    || code === "desktop.artifact_restore_unavailable"
  ) return "task.invalid_state";
  if (code === "desktop.artifact_source_unavailable") return "artifact.source_unavailable";
  if (code === "desktop.artifact_source_changed") return "artifact.source_changed";
  if (code === "desktop.artifact_delete_confirmation_mismatch") {
    return "artifact.delete_confirmation_mismatch";
  }
  if (code === "desktop.artifact_delete_unsupported") return "artifact.delete_unsupported";
  if (code === "desktop.artifact_delete_failed") return "artifact.delete_failed";
  if (code === "desktop.artifact_delete_uncertain") return "artifact.delete_uncertain";
  if (code === "desktop.artifact_registration_conflict") return "command.idempotency_conflict";
  if (code === "desktop.artifact_registration_invalid") return "workspace.boundary_violation";
  if (code === "desktop.artifact_registration_unavailable") return "catalog.resource_unavailable";
  if (code === "desktop.workspace_unavailable") return "workspace.selection_invalid";
  if (code === "desktop.task_invalid_state") return "task.invalid_state";
  if (code === "desktop.task_stale_revision") return "task.stale_revision";
  if (code === "desktop.task_permission_denied") return "task.permission_denied";
  if (code === "desktop.confirmation_not_found"
    || code === "desktop.confirmation_task_mismatch") return "confirmation.not_found";
  if (code === "desktop.confirmation_expired") return "confirmation.expired";
  if (code === "desktop.confirmation_duplicate_decision") {
    return "confirmation.duplicate_decision";
  }
  if (code === "desktop.confirmation_digest_conflict") {
    return "confirmation.request_digest_conflict";
  }
  if (code === "desktop.confirmation_permission_denied") {
    return "confirmation.permission_denied";
  }
  if (code.includes("session")) return "session.not_found";
  if (code.startsWith("selection.") || code.startsWith("submit_turn.")) {
    return "submit_turn.invalid_selection";
  }
  return "runtime.unavailable";
}

function mapErrorCategory(
  category: RuntimeError["category"],
  code: DesktopErrorEnvelope["code"],
): DesktopErrorEnvelope["category"] {
  if (code.startsWith("workspace.selection_")) return "user_action_required";
  if (code === "workspace.boundary_violation") return "workspace_boundary";
  if (code === "catalog.resource_unavailable") return "availability";
  if (code === "command.idempotency_conflict") return "conflict";
  if (code === "artifact.delete_uncertain") return "uncertain";
  if (code.startsWith("artifact.delete_")) {
    return category === "validation" ? "validation" : "availability";
  }
  if (code === "artifact.source_unavailable" || code === "artifact.source_changed") {
    return category === "validation" ? "validation" : "availability";
  }
  if (category === "authorization") return "authorization";
  if (category === "timeout") return "timeout";
  if (category === "cancelled") return "cancelled";
  if (category === "validation") return "validation";
  return "availability";
}

function safeSummaryFor(code: DesktopErrorEnvelope["code"]): string {
  switch (code) {
    case "workspace.selection_expired":
      return "The selected workspace expired. Select the folder again.";
    case "workspace.selection_consumed":
      return "The selected workspace was already used. Select the folder again.";
    case "workspace.selection_context_mismatch":
      return "The selected workspace does not belong to this request.";
    case "workspace.selection_invalid":
      return "The selected workspace is no longer available.";
    case "workspace.boundary_violation":
      return "The selected file is outside the authorized workspace.";
    case "catalog.resource_unavailable":
      return "The artifact catalog is unavailable.";
    case "command.idempotency_conflict":
      return "This request conflicts with an earlier request.";
    case "session.not_found":
      return "The session is unavailable.";
    case "submit_turn.invalid_selection":
      return "The selected Agent or runtime capability is unavailable.";
    case "task.not_found":
      return "The task is unavailable.";
    case "task.invalid_state":
      return "The task cannot perform this operation in its current state.";
    case "task.stale_revision":
      return "The task changed. Refresh it and try again.";
    case "task.permission_denied":
      return "You do not have permission to control this task.";
    case "artifact.source_unavailable":
      return "The artifact source file is unavailable.";
    case "artifact.source_changed":
      return "The artifact source file changed. Refresh and try again.";
    case "artifact.delete_confirmation_mismatch":
      return "The delete confirmation text does not match.";
    case "artifact.delete_unsupported":
      return "Moving this artifact to Trash is not supported on this system.";
    case "artifact.delete_failed":
      return "The artifact source file could not be moved to Trash.";
    case "artifact.delete_uncertain":
      return "The artifact source deletion needs manual attention.";
    case "confirmation.not_found":
      return "The confirmation is no longer available.";
    case "confirmation.expired":
      return "The confirmation has expired.";
    case "confirmation.duplicate_decision":
      return "The confirmation already has another decision.";
    case "confirmation.request_digest_conflict":
      return "The confirmation request changed. Refresh it before deciding.";
    case "confirmation.permission_denied":
      return "The confirmation could not be applied.";
    default:
      return "The local runtime is temporarily unavailable.";
  }
}

function validCorrelationId(value?: string): string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    .test(value ?? "")
    ? value!
    : "00000000-0000-4000-8000-000000000000";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePrivateWorkspaceArtifactRegistration(input: unknown):
  | {
    ok: true;
    value: Parameters<DesktopTaskProjectionService["registerManualArtifact"]>[0];
  }
  | { ok: false; message: string } {
  if (!isRecord(input)) return { ok: false, message: "Artifact registration is invalid" };
  const allowedKeys = new Set([
    "command",
    "workspaceGrantId",
    "relativePath",
    "fileSha256",
    "byteSize",
    "mediaType",
    "displayName",
    "createdAt",
  ]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    return { ok: false, message: "Artifact registration contains unsupported fields" };
  }
  const parsedCommand = RegisterWorkspaceArtifactCommandSchema.safeParse(input.command);
  if (!parsedCommand.success) {
    return { ok: false, message: "Artifact registration command is invalid" };
  }
  if (
    typeof input.workspaceGrantId !== "string"
    || input.workspaceGrantId.length < 1
    || input.workspaceGrantId.length > 256
    || typeof input.relativePath !== "string"
    || input.relativePath.length < 1
    || input.relativePath.length > 1024
    || typeof input.fileSha256 !== "string"
    || !/^[0-9a-f]{64}$/u.test(input.fileSha256)
    || typeof input.byteSize !== "number"
    || !Number.isSafeInteger(input.byteSize)
    || input.byteSize < 0
    || typeof input.mediaType !== "string"
    || input.mediaType.length < 1
    || input.mediaType.length > 240
  ) {
    return { ok: false, message: "Artifact registration facts are invalid" };
  }
  if (
    input.displayName !== undefined
    && (typeof input.displayName !== "string"
      || input.displayName.length < 1
      || input.displayName.length > 320)
  ) {
    return { ok: false, message: "Artifact registration display name is invalid" };
  }
  if (
    input.createdAt !== undefined
    && (typeof input.createdAt !== "string" || Number.isNaN(Date.parse(input.createdAt)))
  ) {
    return { ok: false, message: "Artifact registration timestamp is invalid" };
  }
  return {
    ok: true,
    value: {
      command: parsedCommand.data,
      workspaceGrantId: input.workspaceGrantId,
      relativePath: input.relativePath,
      fileSha256: input.fileSha256,
      byteSize: input.byteSize,
      mediaType: input.mediaType,
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    },
  };
}

function privateRouteInput(): { correlationId: string } {
  return { correlationId: "00000000-0000-4000-8000-000000000000" };
}

function parseCursor(cursor: string): number {
  const match = /^delivery:(0|[1-9][0-9]*)$/u.exec(cursor);
  if (match === null) throw new Error("durableCursor is invalid");
  const sequence = Number(match[1]);
  if (!Number.isSafeInteger(sequence)) {
    throw new Error("durableCursor exceeds the safe integer range");
  }
  return sequence;
}
