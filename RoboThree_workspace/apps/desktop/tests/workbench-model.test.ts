import { describe, expect, it } from "vitest";

import {
  authorizationModes,
  canSubmitConversationTurn,
  normalizeKnowledgeIds,
  normalizeSkillIds,
  normalizeWorkbenchSelection,
  presentWorkbenchComposer,
  selectModelId,
  type WorkbenchCatalog,
} from "../src/renderer/pages/workbench/workbench-model.js";

const digest = "a".repeat(64);
const timestamp = "2026-08-16T00:00:00.000Z";

describe("conversation input availability", () => {
  it.each([
    "waiting_input",
    "completed",
    "failed",
    "cancelled",
    "timed_out",
  ] as const)("allows a later turn after %s", (status) => {
    expect(canSubmitConversationTurn(status)).toBe(true);
  });

  it.each([
    "preparing",
    "queued",
    "running",
    "waiting_confirmation",
    "recovering",
    "manual_attention",
  ] as const)("keeps the composer locked while status is %s", (status) => {
    expect(canSubmitConversationTurn(status)).toBe(false);
  });
});

const catalog: WorkbenchCatalog = {
  workspaces: [{
    workspaceGrantId: "workspace:one",
    displayName: "Workspace One",
    rootDisplayPath: "Workspace One",
    accessMode: "read_write",
    status: "active",
    createdAt: timestamp,
  }],
  sessions: [{
    sessionId: "session:one",
    revision: 1,
    title: "Planning",
    tombstoned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }],
  agents: [{
    agentId: "agent:normal",
    revision: digest,
    name: "Normal Agent",
    identity: "Normal",
    goal: "Help",
    defaultModelId: "model:gpt",
    allowModelOverride: true,
    eligibleModels: [{
      modelId: "model:gpt",
      revision: digest,
      name: "GPT",
      source: "official",
      capabilities: ["text", "tool_calling"],
      available: true,
    }],
    requiredModelCapabilities: ["text"],
    skills: [
      { id: "skill:docs", revision: digest, name: "Docs", available: true },
      { id: "skill:blocked", revision: digest, name: "Blocked", available: false },
    ],
    tools: [
      { id: "tool.document.pdf.extract_text", revision: digest, name: "PDF", available: true },
      { id: "tool.document.xlsx.write", revision: digest, name: "XLSX", available: true },
    ],
    knowledge: [
      { id: "knowledge:one", revision: digest, name: "Knowledge", available: true },
    ],
    runnable: true,
  }],
  models: [{
    modelId: "model:gpt",
    revision: digest,
    name: "GPT",
    source: "official",
    capabilities: ["text", "tool_calling"],
    available: true,
  }],
  recentTasks: [],
  recentArtifacts: [],
};

describe("DFE-2A Workbench view model", () => {
  it("uses the frozen Workspace Authorization mode names and order as read-only metadata", () => {
    expect(authorizationModes.map((mode) => [mode.value, mode.label])).toEqual([
      ["smart_confirm", "智能授权"],
      ["manual_review", "主动询问"],
      ["task_scoped", "始终授权"],
    ]);
  });

  it("uses the generic robot with the first available model and no specialist resources", () => {
    const selection = normalizeWorkbenchSelection(catalog, {
      workspaceGrantId: "missing",
      selectedSkillIds: ["skill:blocked"],
      selectedKnowledgeIds: ["knowledge:missing"],
    });

    expect(selection.workspaceGrantId).toBe("");
    expect(selection.sessionId).toBe("");
    expect(selection.agentId).toBe("");
    expect(selection.requestedModelId).toBe("model:gpt");
    expect(selection.agentSelectionInitialized).toBe(false);
    expect(selection.selectedSkillIds).toEqual([]);
    expect(selection.selectedKnowledgeIds).toEqual([]);
  });

  it("keeps explicit empty Skill and Knowledge selections empty", () => {
    const agent = catalog.agents[0];
    expect(normalizeSkillIds(agent, [])).toEqual([]);
    expect(normalizeSkillIds(agent, ["skill:blocked"])).toEqual([]);
    expect(normalizeKnowledgeIds(agent, [])).toEqual([]);
    expect(normalizeKnowledgeIds(agent, ["knowledge:missing"])).toEqual([]);
  });

  it("presents disabled reason and bounded runtime selection summary", () => {
    const selection = normalizeWorkbenchSelection(catalog);
    expect(presentWorkbenchComposer({
      catalog,
      selection,
      composerText: "",
      busy: false,
    })).toMatchObject({
      sendDisabled: true,
      disabledReason: "",
      selectionSummary: "通用机器人 · 0 个工具 · 0/0 个技能 · 0/0 个知识源 · RoboThree 默认工作区",
    });

    expect(presentWorkbenchComposer({
      catalog,
      selection,
      composerText: "Read this document",
      busy: false,
    })).toMatchObject({
      sendDisabled: false,
      disabledReason: "",
    });
  });

  it("fails closed for the generic robot when no model is available", () => {
    const nextCatalog = {
      ...catalog,
      models: [{
        ...catalog.models[0]!,
        available: false,
        unavailableReason: "Model is unavailable",
      }],
    };
    const selection = normalizeWorkbenchSelection(nextCatalog);

    expect(selection.agentId).toBe("");
    expect(selection.requestedModelId).toBe("");
    expect(presentWorkbenchComposer({
      catalog: nextCatalog,
      selection,
      composerText: "Do work",
      busy: false,
    })).toMatchObject({
      sendDisabled: true,
      disabledReason: "当前没有可用模型，请联系管理员。",
    });
  });

  it("preserves an explicitly selected unavailable agent instead of switching to another robot", () => {
    const unavailableAgent = {
      ...catalog.agents[0],
      agentId: "agent:broken",
      name: "Broken Agent",
      eligibleModels: [],
      defaultModelId: "model:gpt",
      runnable: false,
    };
    const generalAgent = {
      ...catalog.agents[0],
      agentId: "agent:general",
      name: "General Agent",
    };
    const nextCatalog = {
      ...catalog,
      agents: [unavailableAgent, generalAgent],
    };
    const selection = normalizeWorkbenchSelection(nextCatalog, {
      agentId: "agent:broken",
      agentSelectionInitialized: true,
      requestedModelId: "model:gpt",
    });

    expect(selection.agentId).toBe("agent:broken");
    expect(selection.agentSelectionInitialized).toBe(true);
    expect(selection.requestedModelId).toBe("");
    expect(selectModelId(nextCatalog.models, unavailableAgent, "model:gpt")).toBe("");
    expect(presentWorkbenchComposer({
      catalog: nextCatalog,
      selection,
      composerText: "Do work",
      busy: false,
    })).toMatchObject({
      sendDisabled: true,
      disabledReason: "该机器人当前没有可用模型，请更换机器人或联系管理员。",
    });
  });

  it("clears an unavailable requested model instead of silently falling back to another model", () => {
    const fallbackModel = {
      ...catalog.models[0]!,
      modelId: "model:fallback",
      name: "Fallback",
    };
    const requestedUnavailableModel = {
      ...catalog.models[0]!,
      available: false,
      unavailableReason: "Model is unavailable",
    };
    const agent = {
      ...catalog.agents[0]!,
      defaultModelId: "model:fallback",
      eligibleModels: [requestedUnavailableModel, fallbackModel],
    };
    const nextCatalog = {
      ...catalog,
      agents: [agent],
      models: [requestedUnavailableModel, fallbackModel],
    };
    const selection = normalizeWorkbenchSelection(nextCatalog, {
      agentId: "agent:normal",
      agentSelectionInitialized: true,
      requestedModelId: "model:gpt",
    });

    expect(selection.agentId).toBe("agent:normal");
    expect(selection.requestedModelId).toBe("");
    expect(presentWorkbenchComposer({
      catalog: nextCatalog,
      selection,
      composerText: "Do work",
      busy: false,
    })).toMatchObject({
      sendDisabled: true,
      disabledReason: "请选择该机器人可用的模型。",
    });
  });

  it("clears a disappeared selected agent instead of switching to another robot", () => {
    const generalAgent = {
      ...catalog.agents[0],
      agentId: "agent:general",
      name: "General Agent",
    };
    const nextCatalog = {
      ...catalog,
      agents: [generalAgent],
    };
    const selection = normalizeWorkbenchSelection(nextCatalog, {
      agentId: "agent:missing",
      agentSelectionInitialized: true,
      requestedModelId: "model:gpt",
      selectedSkillIds: ["skill:docs"],
      selectedKnowledgeIds: ["knowledge:one"],
    });

    expect(selection.agentId).toBe("");
    expect(selection.agentSelectionInitialized).toBe(true);
    expect(selection.requestedModelId).toBe("");
    expect(selection.selectedSkillIds).toEqual([]);
    expect(selection.selectedKnowledgeIds).toEqual([]);
    expect(presentWorkbenchComposer({
      catalog: nextCatalog,
      selection,
      composerText: "Do work",
      busy: false,
    })).toMatchObject({
      sendDisabled: true,
      disabledReason: "请选择机器人，或切换为通用机器人。",
    });

    const secondRefreshSelection = normalizeWorkbenchSelection(nextCatalog, selection);
    expect(secondRefreshSelection.agentId).toBe("");
    expect(secondRefreshSelection.agentSelectionInitialized).toBe(true);
    expect(secondRefreshSelection.requestedModelId).toBe("");
  });

  it("keeps only the resource intersection when switching agents", () => {
    const otherAgent = {
      ...catalog.agents[0],
      agentId: "agent:other",
      defaultModelId: "model:gpt",
      skills: [
        { id: "skill:other", revision: digest, name: "Other", available: true },
      ],
      knowledge: [
        { id: "knowledge:other", revision: digest, name: "Other Knowledge", available: true },
      ],
    };

    expect(normalizeSkillIds(otherAgent, ["skill:docs"])).toEqual([]);
    expect(normalizeKnowledgeIds(otherAgent, ["knowledge:one"])).toEqual([]);
  });
});
