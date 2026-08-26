import type {
  AgentProjection,
  ArtifactCatalogItemProjection,
  ModelProjection,
  SessionSummary,
  SubmitTurnReceipt,
  TaskSummaryProjection,
  WorkspaceGrantProjection,
} from "@robothree/contracts";
import type { InjectionKey } from "vue";

import type {
  RendererSafeResult,
  RoboThreeDesktopApiV1Alpha1,
} from "../../shared/foundation-api.js";
import { createWorkspacePickerRequest } from "../workspace-picker-request.js";

declare global {
  interface Window {
    readonly robothreeDesktop: RoboThreeDesktopApiV1Alpha1;
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
  workspaceGrantId: string;
};

export type WorkbenchSubmitResult = {
  session: SessionSummary;
  receipt: SubmitTurnReceipt;
};

export type WorkbenchAdapter = {
  loadWorkbenchData(): Promise<WorkbenchAdapterData>;
  createWorkspaceGrant(): Promise<WorkspaceGrantProjection | undefined>;
  submitTask(request: WorkbenchSubmitRequest): Promise<WorkbenchSubmitResult>;
};

export const workbenchAdapterKey: InjectionKey<WorkbenchAdapter> =
  Symbol("RoboThreeWorkbenchAdapter");

const clientInstanceId = `renderer:dfe2a:${randomId()}`;

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

  async submitTask(request: WorkbenchSubmitRequest): Promise<WorkbenchSubmitResult> {
    const api = getDesktopApi();
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

    const receipt = await accept(api.submitTurn({
      ...commandMeta(),
      type: "submit_turn",
      clientTurnId: `turn:${randomId()}`,
      sessionId: session.sessionId,
      userInput: request.userInput,
      selectionRequest: {
        agentId: request.agentId,
        requestedModelId: request.requestedModelId,
        selectedSkillIds: [...request.selectedSkillIds],
        selectedKnowledgeIds: [...request.selectedKnowledgeIds],
        workspaceGrantId: request.workspaceGrantId,
      },
    }));

    return { session, receipt };
  },
};

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
  constructor(message: string) {
    super(message);
    this.name = "DesktopWorkbenchAdapterError";
  }
}
