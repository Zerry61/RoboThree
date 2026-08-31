import type {
  AgentProjection,
  ArtifactCatalogItemProjection,
  ModelProjection,
  SessionSummary,
  TaskAuthorizationMode,
  TaskDisplayStatus,
  TaskSummaryProjection,
  WorkspaceGrantProjection,
} from "@robothree/contracts";

export type WorkbenchAuthorizationMode = TaskAuthorizationMode;

export type WorkbenchSelection = {
  workspaceGrantId: string;
  sessionId: string;
  agentId: string;
  agentSelectionInitialized: boolean;
  requestedModelId: string;
  selectedSkillIds: readonly string[];
  selectedKnowledgeIds: readonly string[];
};

export type WorkbenchCatalog = {
  workspaces: readonly WorkspaceGrantProjection[];
  sessions: readonly SessionSummary[];
  agents: readonly AgentProjection[];
  models: readonly ModelProjection[];
  recentTasks: readonly TaskSummaryProjection[];
  recentArtifacts: readonly ArtifactCatalogItemProjection[];
};

export type WorkbenchComposerState = {
  sendDisabled: boolean;
  disabledReason: string;
  selectionSummary: string;
  availableSkillCount: number;
  selectedSkillCount: number;
  availableKnowledgeCount: number;
  selectedKnowledgeCount: number;
};

const CONVERSATION_INPUT_STATUSES = new Set<TaskDisplayStatus>([
  "waiting_input",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
]);

export function canSubmitConversationTurn(
  status: TaskDisplayStatus | undefined,
): boolean {
  return status === undefined || CONVERSATION_INPUT_STATUSES.has(status);
}

export const authorizationModes: ReadonlyArray<{
  value: WorkbenchAuthorizationMode;
  label: string;
  description: string;
}> = Object.freeze([
  {
    value: "smart_confirm",
    label: "智能授权",
    description: "普通操作自动执行，风险操作主动询问",
  },
  {
    value: "manual_review",
    label: "主动询问",
    description: "创建、修改和风险操作逐次询问",
  },
  {
    value: "task_scoped",
    label: "始终授权",
    description: "仅在当前任务的相同范围内复用授权",
  },
]);

export function normalizeWorkbenchSelection(
  catalog: WorkbenchCatalog,
  previous: Partial<WorkbenchSelection> = {},
): WorkbenchSelection {
  const activeWorkspaces = catalog.workspaces.filter((workspace) =>
    workspace.status === "active");
  const liveSessions = catalog.sessions.filter((session) => !session.tombstoned);

  const hasInitializedAgentSelection = previous.agentSelectionInitialized === true;
  const hasPreviousAgent = hasInitializedAgentSelection
    && previous.agentId !== undefined
    && previous.agentId !== "";
  const agent = hasPreviousAgent
    ? catalog.agents.find((item) => item.agentId === previous.agentId)
    : undefined;
  const modelId = agent === undefined
    ? (hasInitializedAgentSelection
      ? ""
      : selectModelId(catalog.models, undefined, previous.requestedModelId))
    : selectModelId(catalog.models, agent, previous.requestedModelId);
  const agentSelectionInitialized = hasInitializedAgentSelection;

  return {
    workspaceGrantId: activeWorkspaces.some((workspace) =>
      workspace.workspaceGrantId === previous.workspaceGrantId)
      ? String(previous.workspaceGrantId)
      : activeWorkspaces[0]?.workspaceGrantId ?? "",
    sessionId: liveSessions.some((session) => session.sessionId === previous.sessionId)
      ? String(previous.sessionId)
      : "",
    agentId: agent?.agentId ?? "",
    agentSelectionInitialized,
    requestedModelId: modelId,
    selectedSkillIds: normalizeSkillIds(agent, previous.selectedSkillIds),
    selectedKnowledgeIds: normalizeKnowledgeIds(agent, previous.selectedKnowledgeIds),
  };
}

export function presentWorkbenchComposer(input: {
  catalog: WorkbenchCatalog;
  selection: WorkbenchSelection;
  composerText: string;
  busy: boolean;
}): WorkbenchComposerState {
  const agent = findSelectedAgent(input.catalog, input.selection);
  const model = input.catalog.models.find((item) =>
    item.modelId === input.selection.requestedModelId);
  const availableSkillCount = agent?.skills.filter((skill) => skill.available).length ?? 0;
  const selectedSkillCount = input.selection.selectedSkillIds.length;
  const availableKnowledgeCount = agent?.knowledge.filter((knowledge) => knowledge.available).length ?? 0;
  const selectedKnowledgeCount = input.selection.selectedKnowledgeIds.length;
  const selectedToolCount = agent?.tools.filter((tool) => tool.available).length ?? 0;
  const hasEligibleModel = agent === undefined
    ? input.catalog.models.some((candidate) => candidate.available)
    : agent.eligibleModels.some((candidate) =>
      candidate.available
      && input.catalog.models.some((modelOption) =>
        modelOption.modelId === candidate.modelId && modelOption.available));
  const modelAllowedForAgent = isModelAllowedForAgent(input.catalog.models, agent, model?.modelId);

  let disabledReason = "";
  if (input.busy) {
    disabledReason = "任务正在提交中。";
  } else if (agent === undefined && input.selection.agentId !== "") {
    disabledReason = "原机器人已不可用，请重新选择。";
  } else if (
    agent === undefined
    && input.selection.agentId === ""
    && input.selection.agentSelectionInitialized
  ) {
    disabledReason = "请选择机器人，或切换为通用机器人。";
  } else if (!hasEligibleModel) {
    disabledReason = agent === undefined
      ? "当前没有可用模型，请联系管理员。"
      : "该机器人当前没有可用模型，请更换机器人或联系管理员。";
  } else if (agent !== undefined && !agent.runnable) {
    disabledReason = "请选择可运行的机器人。";
  } else if (
    agent !== undefined
    && (model === undefined || !model.available || !modelAllowedForAgent)
  ) {
    disabledReason = "请选择该机器人可用的模型。";
  } else if (
    agent === undefined
    && input.selection.requestedModelId !== ""
    && (model === undefined || !model.available || !modelAllowedForAgent)
  ) {
    disabledReason = "请选择该机器人可用的模型。";
  }

  return {
    sendDisabled: disabledReason !== "" || input.composerText.trim() === "",
    disabledReason,
    selectionSummary: [
      agent === undefined ? "通用机器人" : agent.name,
      `${selectedToolCount} 个工具`,
      `${selectedSkillCount}/${availableSkillCount} 个技能`,
      `${selectedKnowledgeCount}/${availableKnowledgeCount} 个知识源`,
      input.selection.workspaceGrantId === "" ? "RoboThree 默认工作区" : "已选择工作区",
    ].join(" · "),
    availableSkillCount,
    selectedSkillCount,
    availableKnowledgeCount,
    selectedKnowledgeCount,
  };
}

export function findSelectedAgent(
  catalog: WorkbenchCatalog,
  selection: Pick<WorkbenchSelection, "agentId">,
): AgentProjection | undefined {
  return catalog.agents.find((agent) => agent.agentId === selection.agentId);
}

export function normalizeSkillIds(
  agent: AgentProjection | undefined,
  requestedSkillIds: readonly string[] | undefined,
): readonly string[] {
  if (agent === undefined) return [];
  const availableIds = new Set(agent.skills
    .filter((skill) => skill.available)
    .map((skill) => skill.id));
  const requested = requestedSkillIds?.filter((id) => availableIds.has(id)) ?? [];
  return requested;
}

export function normalizeKnowledgeIds(
  agent: AgentProjection | undefined,
  requestedKnowledgeIds: readonly string[] | undefined,
): readonly string[] {
  if (agent === undefined) return [];
  const availableIds = new Set(agent.knowledge
    .filter((knowledge) => knowledge.available)
    .map((knowledge) => knowledge.id));
  return requestedKnowledgeIds?.filter((id) => availableIds.has(id)) ?? [];
}

export function selectModelId(
  models: readonly ModelProjection[],
  agent: AgentProjection | undefined,
  requestedModelId: string | undefined,
): string {
  if (agent !== undefined) {
    const eligibleIds = eligibleAvailableModelIds(models, agent);
    if (requestedModelId !== undefined && requestedModelId !== "") {
      if (!eligibleIds.includes(requestedModelId)) return "";
      return requestedModelId;
    }
    if (eligibleIds.includes(agent.defaultModelId)) {
      return agent.defaultModelId;
    }
    return eligibleIds[0] ?? "";
  }

  if (
    requestedModelId !== undefined
    && requestedModelId !== ""
    && models.some((model) => model.modelId === requestedModelId && model.available)
  ) {
    return requestedModelId;
  }
  return models.find((model) => model.available)?.modelId ?? "";
}

export function isModelAllowedForAgent(
  models: readonly ModelProjection[],
  agent: AgentProjection | undefined,
  modelId: string | undefined,
): boolean {
  if (modelId === undefined || modelId === "") return false;
  if (agent === undefined) {
    return models.some((model) => model.modelId === modelId && model.available);
  }
  return eligibleAvailableModelIds(models, agent).includes(modelId);
}

function eligibleAvailableModelIds(
  models: readonly ModelProjection[],
  agent: AgentProjection,
): readonly string[] {
  const availableGlobalIds = new Set(models
    .filter((model) => model.available)
    .map((model) => model.modelId));
  return agent.eligibleModels
    .filter((model) => model.available && availableGlobalIds.has(model.modelId))
    .map((model) => model.modelId);
}
