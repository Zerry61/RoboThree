// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import type { ArtifactCatalogItemProjection } from "@robothree/contracts";
import { isProxy, reactive } from "vue";

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
      attachments: [],
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

  it("picks an attachment from the exact workspace and validates its durable identity before submit", async () => {
    const api = installDesktopApi();
    const attachment = artifactFixture();
    api.pickWorkbenchAttachment.mockResolvedValueOnce({
      ok: true,
      value: {
        commandId: "00000000-0000-4000-8000-000000000090",
        artifactId: attachment.artifactId,
        status: "accepted",
        artifact: attachment,
      },
    });

    await expect(desktopWorkbenchAdapter.pickWorkspaceAttachment("workspace:one"))
      .resolves.toEqual(attachment);
    expect(api.pickWorkbenchAttachment).toHaveBeenCalledWith(expect.objectContaining({
      type: "register_workspace_artifact",
      workspaceGrantId: "workspace:one",
    }));

    const reactiveAttachment = reactive(attachment);
    expect(isProxy(reactiveAttachment)).toBe(true);

    await desktopWorkbenchAdapter.submitTask({
      sessionId: "session:new",
      sessionTitle: "Create deck",
      userInput: "Create a deck",
      agentId: "agent:normal",
      requestedModelId: "model:gpt",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      workspaceGrantId: "workspace:one",
      attachments: [reactiveAttachment],
    });

    expect(api.validateWorkbenchAttachment).toHaveBeenCalledWith(expect.objectContaining({
      workspaceGrantId: "workspace:one",
      artifact: attachment,
    }));
    const validatedArtifact = api.validateWorkbenchAttachment.mock.calls[0]?.[0].artifact;
    expect(isProxy(validatedArtifact)).toBe(false);
    expect(() => structuredClone(validatedArtifact)).not.toThrow();
    expect(validatedArtifact).toEqual(attachment);
    expect(api.openSession).toHaveBeenCalledOnce();
    expect(api.validateWorkbenchAttachment.mock.invocationCallOrder[0])
      .toBeLessThan(api.openSession.mock.invocationCallOrder[0]!);
    const submitted = api.submitTurn.mock.calls[0]?.[0];
    expect(submitted.userInput).toContain("已选择的工作区资料");
    expect(submitted.userInput).toContain('"资料/项目资料.docx"');
    expect(JSON.stringify(submitted)).not.toContain("rootRealPath");
  });

  it("does not create a session when attachment identity validation fails", async () => {
    const api = installDesktopApi();
    api.validateWorkbenchAttachment.mockResolvedValueOnce({
      ok: false,
      error: {
        contractVersion: "v1alpha1",
        code: "artifact.source_changed",
        category: "conflict",
        safeSummary: "所选资料在提交前已发生变化，请重新添加。",
        retryable: false,
        correlationId: "00000000-0000-4000-8000-000000000091",
      },
    });

    await expect(desktopWorkbenchAdapter.submitTask({
      sessionId: "",
      sessionTitle: "Create deck",
      userInput: "Create a deck",
      agentId: "agent:normal",
      requestedModelId: "model:gpt",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      workspaceGrantId: "workspace:one",
      attachments: [artifactFixture()],
    })).rejects.toThrow("所选资料在提交前已发生变化");
    expect(api.createSession).not.toHaveBeenCalled();
    expect(api.submitTurn).not.toHaveBeenCalled();
  });

  it("uses the negotiated v1alpha4 default-only path without falling back to legacy submit", async () => {
    const legacyApi = installDesktopApi();
    const v1alpha4Api = installDesktopV1Alpha4Api();

    const result = await desktopWorkbenchAdapter.submitTask({
      sessionId: "session:new",
      sessionTitle: "Analyze report",
      userInput: "Analyze report",
      agentId: "agent:normal",
      requestedModelId: "model:gpt",
      selectedSkillIds: ["skill:docs"],
      selectedKnowledgeIds: ["knowledge:one"],
      workspaceGrantId: "workspace:one",
      attachments: [],
    });

    expect(v1alpha4Api.getCompatibility).toHaveBeenCalledOnce();
    expect(v1alpha4Api.submitTurn).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: "v1alpha4",
      type: "submit_turn",
      selectionRequest: expect.objectContaining({
        agentId: "agent:normal",
        requestedModelId: "model:gpt",
        reasoningPreference: { requestedMode: "default" },
      }),
    }));
    expect(legacyApi.submitTurn).not.toHaveBeenCalled();
    expect(result.receipt.contractVersion).toBe("v1alpha4");
  });

  it("maps the empty specialist selection to the stable built-in generic agent", async () => {
    const legacyApi = installDesktopApi();
    const v1alpha4Api = installDesktopV1Alpha4Api();

    await desktopWorkbenchAdapter.submitTask({
      sessionId: "session:new",
      sessionTitle: "Generic task",
      userInput: "Summarize the report",
      agentId: "",
      requestedModelId: "",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      workspaceGrantId: "workspace:one",
      attachments: [],
    });

    expect(v1alpha4Api.submitTurn).toHaveBeenCalledWith(expect.objectContaining({
      selectionRequest: expect.objectContaining({
        agentId: "agent.general",
      }),
    }));
    const selectionRequest = v1alpha4Api.submitTurn.mock.calls[0]?.[0].selectionRequest;
    expect(selectionRequest).not.toHaveProperty("requestedModelId");
    expect(legacyApi.submitTurn).not.toHaveBeenCalled();
  });

  it("omits workspace authority for a normal conversation in the default working directory", async () => {
    const legacyApi = installDesktopApi();
    const v1alpha4Api = installDesktopV1Alpha4Api();

    await desktopWorkbenchAdapter.submitTask({
      sessionId: "session:new",
      sessionTitle: "Default directory conversation",
      userInput: "Explain the current model capabilities",
      agentId: "",
      requestedModelId: "model:gpt",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      attachments: [],
    });

    const selectionRequest = v1alpha4Api.submitTurn.mock.calls[0]?.[0].selectionRequest;
    expect(selectionRequest).not.toHaveProperty("workspaceGrantId");
    expect(selectionRequest).toEqual(expect.objectContaining({
      agentId: "agent.general",
      requestedModelId: "model:gpt",
    }));
    expect(legacyApi.submitTurn).not.toHaveBeenCalled();
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
    pickWorkbenchAttachment: vi.fn(() => ok(undefined)),
    validateWorkbenchAttachment: vi.fn((input) => ok({
      commandId: input.commandId,
      artifactId: input.artifact.artifactId,
      status: "accepted",
      artifact: input.artifact,
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

function artifactFixture(): ArtifactCatalogItemProjection {
  return {
    artifactId: `artifact:${"1".repeat(64)}`,
    sourceKind: "workspace_file",
    sourceId: `sha256:${digest}`,
    sourceDigest: `sha256:${digest}`,
    displayName: "项目资料.docx",
    kind: "document",
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    relativePath: "资料/项目资料.docx",
    byteSize: 1024,
    createdAt: timestamp,
    previewState: "unsupported",
    lifecycle: {
      revision: 0,
      pinned: false,
      dismissed: false,
      deleted: false,
      sourceDeleted: false,
    },
    metadata: {},
  };
}

function installDesktopV1Alpha4Api() {
  const api = {
    getCompatibility: vi.fn(() => ok({
      contractVersion: "v1alpha4",
      coreVersion: "0.0.0-r2dp.3-pra.3",
      selectedContractVersion: "v1alpha4",
      runtimeInstanceId: "runtime:one",
      transportClientInstanceId: "00000000-0000-4000-8000-000000000010",
      features: [{
        feature: "r2d_submit_turn_default",
        state: "available",
        reasonCode: "ready",
      }],
    })),
    submitTurn: vi.fn(() => ok({
      contractVersion: "v1alpha4",
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
        requestedModelId: "model:gpt",
        resolvedModel: { id: "model:gpt", revision: digest },
        activeSkills: [],
        allowedTools: [],
        knowledge: [],
        workspaceGrantId: "workspace:one",
        resolvedAuthorization: {
          schemaVersion: "v1alpha2",
          resolution: "manual_review",
          authorizationProfileRevision: digest,
        },
        executionSelectionDigest: digest,
      },
      acceptedAt: timestamp,
    })),
    querySubmitTurn: vi.fn(),
  };
  Object.defineProperty(window, "robothreeDesktopV1Alpha4", {
    configurable: true,
    value: api,
  });
  return api;
}
