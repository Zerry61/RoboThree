// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  desktopAgentLifecycleAdapter,
} from "../src/renderer/adapters/agent-lifecycle-adapter.js";
import type { AgentLifecycleAdapterError } from
  "../src/renderer/adapters/agent-lifecycle-adapter.js";

const revision = `sha256:${"a".repeat(64)}`;

describe("RSL-1 agent lifecycle adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends exact revisions for update, test, submit and withdraw commands", async () => {
    const api = createApi();
    vi.stubGlobal("window", { robothreeAgentLifecycleV1Alpha1: api });
    const material = materialFixture();

    await desktopAgentLifecycleAdapter.updateDraft({
      robotId: material.robotId,
      expectedDraftRevision: revision,
      material,
    });
    await desktopAgentLifecycleAdapter.startTest({
      robotId: material.robotId,
      expectedDraftRevision: revision,
      testInput: "测试任务",
    });
    await desktopAgentLifecycleAdapter.submitDraft({
      robotId: material.robotId,
      expectedDraftRevision: revision,
      semanticVersion: "1.0.0",
      changeSummary: "首次发布",
    });
    await desktopAgentLifecycleAdapter.withdrawSubmission({
      robotId: material.robotId,
      submissionId: "00000000-0000-4000-8000-000000000100",
      expectedSubmissionRevision: revision,
    });

    expect(api.updateRobotDraft).toHaveBeenCalledWith(expect.objectContaining({
      robotId: material.robotId,
      expectedDraftRevision: revision,
      material,
    }));
    expect(api.startRobotDraftTest).toHaveBeenCalledWith(expect.objectContaining({
      expectedDraftRevision: revision,
      testInput: "测试任务",
    }));
    expect(api.submitRobotDraft).toHaveBeenCalledWith(expect.objectContaining({
      expectedDraftRevision: revision,
      publicationScope: "enterprise",
    }));
    expect(api.withdrawRobotSubmission).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: "00000000-0000-4000-8000-000000000100",
      expectedSubmissionRevision: revision,
    }));
  });

  it("preserves the typed safe error instead of exposing an internal object", async () => {
    const api = createApi();
    api.createRobotDraft.mockResolvedValueOnce({
      ok: false,
      error: {
        contractVersion: "agent-lifecycle.v1alpha1",
        errorCode: "agentlifecycle.robot_id_reserved",
        safeSummary: "Reserved.",
        correlationId: "00000000-0000-4000-8000-000000000200",
      },
    });
    vi.stubGlobal("window", { robothreeAgentLifecycleV1Alpha1: api });

    await expect(desktopAgentLifecycleAdapter.createDraft({ material: materialFixture() }))
      .rejects.toMatchObject<Partial<AgentLifecycleAdapterError>>({
        code: "agentlifecycle.robot_id_reserved",
        message: "Reserved.",
      });
  });
});

function createApi() {
  const success = () => Promise.resolve({
    ok: true as const,
    value: {
      commandId: "00000000-0000-4000-8000-000000000001",
      correlationId: "00000000-0000-4000-8000-000000000002",
      robotId: "agent.personal-one",
      currentRevision: revision,
      state: "draft_saved" as const,
    },
  });
  return {
    contractVersion: "agent-lifecycle.v1alpha1" as const,
    listMyRobotDrafts: vi.fn(),
    getMyRobotDraft: vi.fn(),
    createRobotDraft: vi.fn(success),
    updateRobotDraft: vi.fn(success),
    startRobotDraftTest: vi.fn(success),
    submitRobotDraft: vi.fn(success),
    withdrawRobotSubmission: vi.fn(success),
  };
}

function materialFixture() {
  return {
    robotId: "agent.personal-one",
    name: "文档助手",
    description: "整理企业文档",
    behaviorRules: "仅输出已验证内容",
    avatar: { source: "system" as const, assetId: "robot-avatar.default" as const },
    tags: ["文档"],
    modelRestriction: { enabled: false, selectedReferences: [] },
    skillRestriction: { enabled: false, selectedReferences: [] },
    toolRestriction: { enabled: false, selectedReferences: [] },
    knowledgeRestriction: { enabled: false, selectedReferences: [] },
  };
}
