import {
  ArtifactCatalogItemProjectionSchema,
  type AgentProjection,
  type ArtifactCatalogItemProjection,
  type ModelProjection,
  type SessionSummary,
  type SubmitTurnReceipt,
  type TaskAuthorizationMode,
  type TaskSummaryProjection,
  type WorkspaceGrantProjection,
} from "@robothree/contracts";
import type { SubmitTurnReceiptV1Alpha4 } from
  "@robothree/contracts/desktop-local/v1alpha4";
import type { SubmitTurnReceiptV1Alpha5 } from
  "@robothree/contracts/desktop-local/v1alpha5";
import type { InjectionKey } from "vue";

import type {
  RendererSafeResult,
  RoboThreeDesktopApiV1Alpha1,
  RoboThreeDesktopApiV1Alpha4,
} from "../../shared/foundation-api.js";
import { createWorkspacePickerRequest } from "../workspace-picker-request.js";
import {
  desktopReasoningModeAdapter,
  type ReasoningSubmitDraft,
} from "./reasoning-mode-adapter.js";

declare global {
  interface Window {
    readonly robothreeDesktop: RoboThreeDesktopApiV1Alpha1;
    readonly robothreeDesktopV1Alpha4: RoboThreeDesktopApiV1Alpha4;
  }
}

export type WorkbenchAdapterData = {
  workspaces: readonly WorkspaceGrantProjection[];
  sessions: readonly SessionSummary[];
  agents: readonly AgentProjection[];
  models: readonly ModelProjection[];
  recentTasks: readonly TaskSummaryProjection[];
  recentArtifacts: readonly ArtifactCatalogItemProjection[];
};

export type WorkbenchSubmitRequest = {
  sessionId: string;
  sessionTitle: string;
  userInput: string;
  agentId: string;
  requestedModelId: string;
  selectedSkillIds: readonly string[];
  selectedKnowledgeIds: readonly string[];
  workspaceGrantId?: string;
  attachments: readonly ArtifactCatalogItemProjection[];
  authorizationMode: TaskAuthorizationMode;
  reasoning?: ReasoningSubmitDraft;
};

export type WorkbenchSubmitResult = {
  session: SessionSummary;
  receipt: SubmitTurnReceipt | SubmitTurnReceiptV1Alpha4 | SubmitTurnReceiptV1Alpha5;
};

export type WorkbenchAdapter = {
  loadWorkbenchData(): Promise<WorkbenchAdapterData>;
  createWorkspaceGrant(): Promise<WorkspaceGrantProjection | undefined>;
  pickWorkspaceAttachment(
    workspaceGrantId: string,
  ): Promise<ArtifactCatalogItemProjection | undefined>;
  submitTask(request: WorkbenchSubmitRequest): Promise<WorkbenchSubmitResult>;
  recoverReasoningSubmit(commandId: string): Promise<SubmitTurnReceiptV1Alpha5>;
};

export const workbenchAdapterKey: InjectionKey<WorkbenchAdapter> =
  Symbol("RoboThreeWorkbenchAdapter");

const clientInstanceId = randomId();
const v1alpha4ClientInstanceId = randomId();
let negotiatedV1Alpha4RuntimeId: string | undefined;

export const desktopWorkbenchAdapter: WorkbenchAdapter = {
  async loadWorkbenchData(): Promise<WorkbenchAdapterData> {
    const api = getDesktopApi();
    const [
      workspaces,
      sessions,
      agents,
      models,
      recentTasks,
      artifacts,
    ] = await Promise.all([
      accept(api.listWorkspaceGrants({
        ...queryMeta(),
        type: "list_workspace_grants",
      })),
      accept(api.listSessions({
        ...queryMeta(),
        type: "list_sessions",
      })),
      accept(api.listAgents({
        ...queryMeta(),
        type: "list_agents",
      })),
      accept(api.listModels({
        ...queryMeta(),
        type: "list_models",
      })),
      accept(api.listTasks({
        ...queryMeta(),
        type: "list_tasks",
        limit: 8,
      })),
      accept(api.listArtifacts({
        ...queryMeta(),
        type: "list_artifacts",
        sourceKinds: ["tool_observation", "workspace_file"],
        includeDeleted: false,
        limit: 8,
      })),
    ]);

    return {
      workspaces: workspaces.filter((workspace) => workspace.status === "active"),
      sessions: sessions.filter((session) => !session.tombstoned),
      agents,
      models,
      recentTasks,
      recentArtifacts: artifacts.artifacts,
    };
  },

  async createWorkspaceGrant(): Promise<WorkspaceGrantProjection | undefined> {
    const meta = commandMeta();
    return accept(getDesktopApi().createWorkspaceGrantFromPicker(
      createWorkspacePickerRequest({
        contractVersion: meta.contractVersion,
        commandId: meta.commandId,
        correlationId: meta.correlationId,
        clientInstanceId: meta.clientInstanceId,
        displayName: "RoboThree 工作区",
        accessMode: "read_write",
      }),
    ));
  },

  async pickWorkspaceAttachment(
    workspaceGrantId: string,
  ): Promise<ArtifactCatalogItemProjection | undefined> {
    const meta = commandMeta();
    const receipt = await accept(getDesktopApi().pickWorkbenchAttachment({
      ...meta,
      type: "register_workspace_artifact",
      workspaceGrantId,
    }));
    if (receipt === undefined) return undefined;
    assertSupportedWorkspaceAttachment(receipt.artifact);
    return receipt.artifact;
  },

  async submitTask(request: WorkbenchSubmitRequest): Promise<WorkbenchSubmitResult> {
    const api = getDesktopApi();
    const agentId = request.agentId === "" ? "agent.general" : request.agentId;
    if (request.attachments.length > 0 && request.workspaceGrantId === undefined) {
      throw new DesktopWorkbenchAdapterError("添加工作区文件前，请先选择工作区。");
    }
    for (const attachment of request.attachments) {
      // Vue may wrap catalog items in proxies that the Desktop bridge cannot clone.
      const plainAttachment = ArtifactCatalogItemProjectionSchema.parse(attachment);
      assertSupportedWorkspaceAttachment(plainAttachment);
      const meta = commandMeta();
      await accept(api.validateWorkbenchAttachment({
        ...meta,
        type: "register_workspace_artifact",
        workspaceGrantId: request.workspaceGrantId!,
        artifact: plainAttachment,
      }));
    }
    const durableUserInput = bindWorkspaceAttachments(
      request.userInput,
      request.attachments,
    );
    const session = request.sessionId === ""
      ? await accept(api.createSession({
        ...commandMeta(),
        type: "create_session",
        title: request.sessionTitle,
      }))
      : await accept(api.openSession({
        ...queryMeta(),
        type: "open_session",
        sessionId: request.sessionId,
      }));

    if (request.reasoning !== undefined) {
      const compatibility = await desktopReasoningModeAdapter.negotiate();
      if (compatibility.state === "available") {
        const commandId = randomId();
        try {
          const receipt = await desktopReasoningModeAdapter.submitTask({
            commandId,
            clientTurnId: `turn:${randomId()}`,
            sessionId: session.sessionId,
            userInput: durableUserInput,
            agentId,
            requestedModelId: request.requestedModelId,
            selectedSkillIds: request.selectedSkillIds,
            selectedKnowledgeIds: request.selectedKnowledgeIds,
            ...(request.workspaceGrantId === undefined
              ? {}
              : { workspaceGrantId: request.workspaceGrantId }),
            reasoning: request.reasoning,
            authorizationMode: request.authorizationMode,
          });
          return { session, receipt };
        } catch (error) {
          if (error instanceof Error
            && "code" in error
            && (error.code === "runtime.request_aborted"
              || error.code === "reasoning.runtime_changed")) {
            throw new DesktopWorkbenchSubmitUncertainError(
              error.message,
              commandId,
              session,
            );
          }
          throw error;
        }
      }
      if (request.reasoning.requestedMode === "max") {
        throw new DesktopWorkbenchAdapterError("Max 推理当前不可用，请改用模型默认模式。");
      }
    }

    const v1alpha4 = await negotiateV1Alpha4();
    if (v1alpha4 !== undefined) {
      const result = await window.robothreeDesktopV1Alpha4.submitTurn({
        contractVersion: "v1alpha4",
        commandId: randomId(),
        correlationId: randomId(),
        clientInstanceId: v1alpha4ClientInstanceId,
        type: "submit_turn",
        clientTurnId: `turn:${randomId()}`,
        sessionId: session.sessionId,
        userInput: durableUserInput,
        selectionRequest: {
          agentId,
          ...(request.requestedModelId === ""
            ? {}
            : { requestedModelId: request.requestedModelId }),
          selectedSkillIds: [...request.selectedSkillIds],
          selectedKnowledgeIds: [...request.selectedKnowledgeIds],
          ...(request.workspaceGrantId === undefined
            ? {}
            : { workspaceGrantId: request.workspaceGrantId }),
          authorizationPreference: {
            schemaVersion: "v1alpha1",
            requestedMode: request.authorizationMode,
          },
          reasoningPreference: { requestedMode: "default" },
        },
      });
      if (!result.ok) {
        if (result.error.code === "runtime_changed") {
          negotiatedV1Alpha4RuntimeId = undefined;
        }
        throw new DesktopWorkbenchAdapterError(
          result.error.safeSummary,
          result.error.code,
        );
      }
      return { session, receipt: result.value };
    }

    if (request.authorizationMode !== "manual_review") {
      throw new DesktopWorkbenchAdapterError(
        "当前运行时暂不支持所选智能授权模式，请刷新后重试。",
      );
    }

    const receipt = await accept(api.submitTurn({
      ...commandMeta(),
      type: "submit_turn",
      clientTurnId: `turn:${randomId()}`,
      sessionId: session.sessionId,
      userInput: durableUserInput,
      selectionRequest: {
        agentId,
        ...(request.requestedModelId === ""
          ? {}
          : { requestedModelId: request.requestedModelId }),
        selectedSkillIds: [...request.selectedSkillIds],
        selectedKnowledgeIds: [...request.selectedKnowledgeIds],
        ...(request.workspaceGrantId === undefined
          ? {}
          : { workspaceGrantId: request.workspaceGrantId }),
      },
    }));

    return { session, receipt };
  },

  async recoverReasoningSubmit(commandId: string) {
    const compatibility = await desktopReasoningModeAdapter.negotiate();
    if (compatibility.state !== "available") {
      throw new DesktopWorkbenchAdapterError("暂时无法确认任务提交结果，请稍后重试。");
    }
    return desktopReasoningModeAdapter.recoverSubmit({ submitTurnCommandId: commandId });
  },
};

const SUPPORTED_WORKSPACE_ATTACHMENT_MEDIA_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/pdf",
  "text/markdown",
  "text/plain",
  "text/html",
  "text/css",
  "text/javascript",
  "text/csv",
  "text/x-python",
  "text/x-java-source",
  "text/x-csharp",
  "text/x-go",
  "text/x-rust",
  "text/x-sql",
  "text/xml",
  "application/json",
  "application/yaml",
  "application/toml",
  "image/svg+xml",
]);

function assertSupportedWorkspaceAttachment(
  artifact: ArtifactCatalogItemProjection,
): void {
  if (
    artifact.sourceKind !== "workspace_file"
    || artifact.relativePath === undefined
    || !SUPPORTED_WORKSPACE_ATTACHMENT_MEDIA_TYPES.has(artifact.mediaType)
  ) {
    throw new DesktopWorkbenchAdapterError(
      "当前仅支持添加工作区内的文档或 UTF-8 文本文件。",
    );
  }
}

export function bindWorkspaceAttachments(
  userInput: string,
  attachments: readonly ArtifactCatalogItemProjection[],
): string {
  if (attachments.length === 0) return userInput;
  const paths = attachments.map((attachment) => {
    assertSupportedWorkspaceAttachment(attachment);
    return `- ${JSON.stringify(attachment.relativePath)}`;
  });
  return [
    userInput,
    "",
    "已选择的工作区资料（请先使用匹配的读取工具读取，再完成任务）：",
    ...paths,
  ].join("\n");
}

async function negotiateV1Alpha4(): Promise<string | undefined> {
  const api = (window as Window & { robothreeDesktopV1Alpha4?: RoboThreeDesktopApiV1Alpha4 })
    .robothreeDesktopV1Alpha4;
  if (api === undefined) return undefined;
  const result = await api.getCompatibility({
    contractVersion: "v1alpha4",
    queryId: randomId(),
    correlationId: randomId(),
    clientInstanceId: v1alpha4ClientInstanceId,
    supportedContractVersions: ["v1alpha4", "v1alpha3", "v1alpha2", "v1alpha1"],
  });
  if (!result.ok) {
    negotiatedV1Alpha4RuntimeId = undefined;
    return undefined;
  }
  const feature = result.value.features.find((item) =>
    item.feature === "r2d_submit_turn_default");
  if (feature?.state !== "available") {
    negotiatedV1Alpha4RuntimeId = undefined;
    return undefined;
  }
  negotiatedV1Alpha4RuntimeId = result.value.runtimeInstanceId;
  return negotiatedV1Alpha4RuntimeId;
}

async function accept<T>(operation: Promise<RendererSafeResult<T>>): Promise<T> {
  const result = await operation;
  if (!result.ok) {
    throw new DesktopWorkbenchAdapterError(result.error.safeSummary);
  }
  return result.value;
}

function getDesktopApi(): RoboThreeDesktopApiV1Alpha1 {
  return window.robothreeDesktop;
}

function queryMeta() {
  return {
    contractVersion: "v1alpha1" as const,
    queryId: randomId(),
    correlationId: randomId(),
    clientInstanceId,
  };
}

function commandMeta() {
  return {
    contractVersion: "v1alpha1" as const,
    commandId: randomId(),
    correlationId: randomId(),
    clientInstanceId,
  };
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? "00000000-0000-4000-8000-000000000000".replace(/[08]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      const value = char === "0" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
}

export class DesktopWorkbenchAdapterError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "DesktopWorkbenchAdapterError";
  }
}

export class DesktopWorkbenchSubmitUncertainError extends DesktopWorkbenchAdapterError {
  public constructor(
    message: string,
    public readonly commandId: string,
    public readonly session: SessionSummary,
  ) {
    super(message);
    this.name = "DesktopWorkbenchSubmitUncertainError";
  }
}
