import type {
  AgentProjection,
  ArtifactCatalogItemProjection,
  ModelProjection,
  SessionSummary,
  TaskSummaryProjection,
  WorkspaceGrantProjection,
} from "@robothree/contracts";

export type WorkbenchAuthorizationMode =
  | "manual_review"
  | "smart_confirm"
  | "task_scoped";

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

export const authorizationModes: ReadonlyArray<{
  value: WorkbenchAuthorizationMode;
  label: string;
  description: string;
  status: string;
}> = Object.freeze([
  {
    value: "manual_review",
    label: "手动复核",
    description: "创建、修改和风险动作逐次确认",
    status: "待接入",
  },
  {
    value: "smart_confirm",
    label: "智能确认",
    description: "普通创建和修改可直接执行，风险动作逐次确认",
    status: "待接入",
  },
  {
    value: "task_scoped",
    label: "任务内授权",
    description: "精确范围内的可复用动作首次确认后在当前任务内复用",
    status: "待接入",
  },
]);

export function normalizeWorkbenchSelection(
  catalog: WorkbenchCatalog,
  previous: Partial<WorkbenchSelection> = {},
): WorkbenchSelection {
  const activeWorkspaces = catalog.workspaces.filter((workspace) =>
    workspace.status === "active");
  const liveSessions = catalog.sessions.filter((session) => !session.tombstoned);
  const runnableAgents = catalog.agents.filter((agent) => agent.runnable);

  const hasInitializedAgentSelection = previous.agentSelectionInitialized === true;
  const hasPreviousAgent = hasInitializedAgentSelection
    && previous.agentId !== undefined
    && previous.agentId !== "";
  const agent = hasPreviousAgent
    ? catalog.agents.find((item) => item.agentId === previous.agentId)
    : hasInitializedAgentSelection
      ? undefined
    : runnableAgents[0];
  const modelId = agent === undefined
    ? ""
    : selectModelId(catalog.models, agent, previous.requestedModelId);
  const agentSelectionInitialized = hasInitializedAgentSelection
    || catalog.agents.length > 0;

  return {
    workspaceGrantId: activeWorkspaces.some((workspace) =>
      workspace.workspaceGrantId === previous.workspaceGrantId)
      ? String(previous.workspaceGrantId)
      : activeWorkspaces[0]?.workspaceGrantId ?? "",
    sessionId: liveSessions.some((session) => session.sessionId === previous.sessionId)
      ? String(previous.sessionId)
      : liveSessions[0]?.sessionId ?? "",
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
  } else if (input.selection.workspaceGrantId === "") {
    disabledReason = "请选择一个已授权工作区。";
  } else if (agent === undefined) {
    disabledReason = "请选择可运行的机器人。";
  } else if (!hasEligibleModel) {
    disabledReason = "该机器人当前没有可用模型，请更换机器人或联系管理员。";
  } else if (!agent.runnable) {
    disabledReason = "请选择可运行的机器人。";
  } else if (model === undefined || !model.available || !modelAllowedForAgent) {
    disabledReason = "请选择该机器人可用的模型。";
  } else if (input.composerText.trim() === "") {
    disabledReason = "输入任务内容后即可提交。";
  }

  return {
    sendDisabled: disabledReason !== "",
    disabledReason,
    selectionSummary: [
      `${selectedToolCount} Tools`,
      `${selectedSkillCount}/${availableSkillCount} Skills`,
      `${selectedKnowledgeCount}/${availableKnowledgeCount} Knowledge`,
      input.selection.workspaceGrantId === "" ? "No Workspace" : "Workspace Bound",
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
    if (requestedModelId !== undefined && eligibleIds.includes(requestedModelId)) {
      return requestedModelId;
    }
    if (eligibleIds.includes(agent.defaultModelId)) {
      return agent.defaultModelId;
    }
    return eligibleIds[0] ?? "";
  }

  if (
    requestedModelId !== undefined
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
