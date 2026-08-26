// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import {
  desktopWorkbenchAdapter,
} from "../src/renderer/adapters/workbench-adapter.js";

const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value });
const digest = "a".repeat(64);
const timestamp = "2026-08-16T00:00:00.000Z";

describe("DFE-2A Desktop workbench adapter", () => {
  it("loads only renderer-safe projections through existing Desktop API calls", async () => {
    const api = installDesktopApi();
    const data = await desktopWorkbenchAdapter.loadWorkbenchData();

    expect(api.listWorkspaceGrants).toHaveBeenCalledWith(expect.objectContaining({
      type: "list_workspace_grants",
    }));
    expect(api.listArtifacts).toHaveBeenCalledWith(expect.objectContaining({
      type: "list_artifacts",
      sourceKinds: ["tool_observation", "workspace_file"],
      includeDeleted: false,
    }));
    expect(data.workspaces).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain("workspaceRoot");
    expect(JSON.stringify(data)).not.toContain("rootRealPath");
  });

  it("creates a session when needed and submits through the high-level submitTurn command", async () => {
    const api = installDesktopApi();
    const result = await desktopWorkbenchAdapter.submitTask({
      sessionId: "",
      sessionTitle: "Analyze report",
      userInput: "Analyze report",
      agentId: "agent:normal",
      requestedModelId: "model:gpt",
      selectedSkillIds: ["skill:docs"],
      selectedKnowledgeIds: ["knowledge:one"],
      workspaceGrantId: "workspace:one",
    });

    expect(api.createSession).toHaveBeenCalledWith(expect.objectContaining({
      type: "create_session",
      title: "Analyze report",
    }));
    expect(api.submitTurn).toHaveBeenCalledWith(expect.objectContaining({
      type: "submit_turn",
      sessionId: "session:new",
      userInput: "Analyze report",
      selectionRequest: {
        agentId: "agent:normal",
        requestedModelId: "model:gpt",
        selectedSkillIds: ["skill:docs"],
        selectedKnowledgeIds: ["knowledge:one"],
        workspaceGrantId: "workspace:one",
      },
    }));
    expect(JSON.stringify(api.submitTurn.mock.calls[0]?.[0])).not.toContain("limits");
    expect(result.receipt.status).toBe("accepted");
  });
});

function installDesktopApi() {
  const session = {
    sessionId: "session:new",
    revision: 0,
    title: "New",
    tombstoned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const api = {
    listWorkspaceGrants: vi.fn(() => ok([{
      workspaceGrantId: "workspace:one",
      displayName: "Workspace One",
      rootDisplayPath: "Workspace One",
      accessMode: "read_write",
      status: "active",
      createdAt: timestamp,
    }])),
    listSessions: vi.fn(() => ok([session])),
    listAgents: vi.fn(() => ok([])),
    listModels: vi.fn(() => ok([])),
    listTasks: vi.fn(() => ok([])),
    listArtifacts: vi.fn(() => ok({
      artifacts: [],
      generatedAt: timestamp,
    })),
    createWorkspaceGrantFromPicker: vi.fn(() => ok(undefined)),
    createSession: vi.fn(() => ok(session)),
    openSession: vi.fn(() => ok(session)),
    submitTurn: vi.fn(() => ok({
      submitTurnCommandId: "00000000-0000-4000-8000-000000000001",
      clientTurnId: "turn:00000000-0000-4000-8000-000000000002",
      userMessageId: "message:user",
      taskId: "task:one",
      runtimeSelectionId: "runtime:one",
      status: "accepted",
      runtimeSelectionSummary: {
        runtimeSelectionId: "runtime:one",
        digest,
        agent: { id: "agent:normal", revision: digest },
        defaultModelId: "model:gpt",
        resolvedModel: { id: "model:gpt", revision: digest },
        activeSkills: [],
        allowedTools: [],
        knowledge: [],
        workspaceGrantId: "workspace:one",
      },
      acceptedAt: timestamp,
    })),
  };
  Object.defineProperty(window, "robothreeDesktop", {
    configurable: true,
    value: api,
  });
  return api;
}
