// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";

import type { RobotDraftDetail } from
  "@robothree/contracts/agent-lifecycle/v1alpha1";
import {
  agentLifecycleAdapterKey,
  AgentLifecycleAdapterError,
  type AgentLifecycleAdapter,
} from "../src/renderer/adapters/agent-lifecycle-adapter.js";
import {
  skillLifecycleAdapterKey,
  SkillLifecycleAdapterError,
} from "../src/renderer/adapters/skill-lifecycle-adapter.js";
import { workbenchAdapterKey } from
  "../src/renderer/adapters/workbench-adapter.js";

import IntelligenceCreationPage from "../src/renderer/pages/intelligence/IntelligenceCreationPage.vue";
import { consumeSkillCreatorWorkbenchIntent } from
  "../src/renderer/pages/workbench/skill-creator-intent.js";
import { createSkillLifecycleTestAdapter } from "./skill-lifecycle-test-fixtures.js";

describe("DFE-4B intelligence creation page", () => {
  it("renders the robot draft form with real save and correctly gated test/publish actions", async () => {
    const router = createTestRouter();
    await router.push("/intelligence/create-robot");
    await router.isReady();

    const wrapper = mount(IntelligenceCreationPage, {
      global: {
        plugins: [router],
        provide: {
          [agentLifecycleAdapterKey as symbol]: createLifecycleAdapter(),
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("创建机器人");
    expect(wrapper.text()).toContain("机器人名称");
    expect(wrapper.text()).toContain("上传头像");
    expect(wrapper.text()).not.toMatch(/输入要求|输出要求|风险说明/u);
    expect(wrapper.findAll("button").find((button) => button.text() === "保存草稿")?.attributes("disabled")).toBeUndefined();
    expect(wrapper.findAll("button").find((button) => button.text() === "运行测试")?.attributes("disabled")).toBeDefined();
    expect(wrapper.findAll("button").find((button) => button.text() === "提交发布")?.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("草稿会保存到 Central");
    expect(wrapper.text()).not.toContain("请输入机器人名称");
    expect(wrapper.text()).not.toContain("请输入机器人简介");

    const skillsToggle = wrapper.findAll("button").find((button) => button.text().includes("技能"));
    expect(skillsToggle?.attributes("role")).toBe("switch");
    expect(skillsToggle?.attributes("aria-checked")).toBe("false");
    await skillsToggle?.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("尚未选择（0 项）");
    expect(skillsToggle?.attributes("aria-checked")).toBe("true");
    expect(JSON.stringify(wrapper.html())).not.toMatch(/workspaceRoot|rootRealPath|selectionHandle|selectedPath|submitTurn/u);

    await wrapper.findAll("label.r3-field")[0]?.trigger("focusout");
    expect(wrapper.text()).toContain("请输入机器人名称");
  });

  it("keeps uploaded avatar removal scoped to uploaded avatars", async () => {
    const router = createTestRouter();
    await router.push("/intelligence/create-robot");
    await router.isReady();

    const wrapper = mount(IntelligenceCreationPage, {
      global: {
        plugins: [router],
      },
    });
    await flushPromises();

    expect(wrapper.find("[aria-label='移除上传头像']").exists()).toBe(false);
  });

  it("creates a real draft workspace and hands the exact creator intent to Workbench", async () => {
    const router = createTestRouter();
    await router.push("/intelligence/create-skill");
    await router.isReady();
    const skills = createSkillLifecycleTestAdapter();

    const wrapper = mount(IntelligenceCreationPage, {
      global: {
        plugins: [router],
        provide: {
          [skillLifecycleAdapterKey as symbol]: skills,
        },
      },
    });
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "进入创建对话")?.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("请输入技能名称");

    await wrapper.find("input").setValue("周报整理技能");
    const textareas = wrapper.findAll("textarea");
    await textareas[0]?.setValue("整理项目周报");
    await textareas[1]?.setValue("提取进展、风险和下周计划");
    await wrapper.findAll("button").find((button) => button.text() === "进入创建对话")?.trigger("click");
    await flushPromises();

    expect(skills.createSkillDraftWorkspace).toHaveBeenCalledWith({
      displayTitle: "周报整理技能",
      displayDescription: "整理项目周报",
      primaryFunction: "提取进展、风险和下周计划",
    });
    expect(router.currentRoute.value.name).toBe("workbench");
    expect(consumeSkillCreatorWorkbenchIntent()).toMatchObject({
      skillId: "skill.weekly-report",
      draftId: "draft.skill-weekly-report",
      workspaceGrantId: "workspace.skill-weekly-report",
      agentId: "agent.skill-creator",
      firstUserMessage: expect.stringContaining("请创建技能「周报整理技能」"),
    });
  });

  it("keeps the skill form after a real create failure", async () => {
    const router = createTestRouter();
    await router.push("/intelligence/create-skill");
    await router.isReady();
    const skills = createSkillLifecycleTestAdapter();
    skills.createSkillDraftWorkspace.mockRejectedValueOnce(new SkillLifecycleAdapterError({
      contractVersion: "skill-lifecycle.v1alpha1",
      errorCode: "skilllifecycle.operation_failed",
      safeSummary: "Create failed.",
      correlationId: "correlation.skill-create-failed",
      retryable: true,
    }));

    const wrapper = mount(IntelligenceCreationPage, {
      global: {
        plugins: [router],
        provide: {
          [skillLifecycleAdapterKey as symbol]: skills,
        },
      },
    });
    await flushPromises();

    await wrapper.find("input").setValue("失败后保留技能");
    const textareas = wrapper.findAll("textarea");
    await textareas[0]?.setValue("保留描述");
    await textareas[1]?.setValue("保留主要功能");
    await clickButton(wrapper, "进入创建对话");
    await flushPromises();

    expect(wrapper.text()).toContain("创建技能失败");
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("失败后保留技能");
    expect((textareas[0]!.element as HTMLTextAreaElement).value).toBe("保留描述");
    expect(wrapper.findAll("button").find((button) => button.text() === "重试")).toBeDefined();
    expect(router.currentRoute.value.name).toBe("intelligenceCreateSkill");
  });

  it("runs the real create, test and submit sequence against one saved revision", async () => {
    const router = createTestRouter();
    await router.push("/intelligence/create-robot");
    await router.isReady();
    const draft = draftFixture();
    const passed = draftFixture({
      testState: "passed",
      testFact: {
        draftRevision: draft.draftRevision,
        state: "passed",
        taskId: "task:lifecycle-test",
        testedAt: timestamp,
      },
    });
    const submitted = draftFixture({
      ...passed,
      submissionState: "pending_review",
    });
    const lifecycle = createLifecycleAdapter();
    lifecycle.getDraft
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(passed)
      .mockResolvedValueOnce(submitted);

    const wrapper = mount(IntelligenceCreationPage, {
      global: {
        plugins: [router],
        provide: {
          [agentLifecycleAdapterKey as symbol]: lifecycle,
          [workbenchAdapterKey as symbol]: createWorkbenchAdapter(),
        },
      },
    });
    await flushPromises();

    await wrapper.find("input[placeholder='例如：合同审阅助手']").setValue("文档助手");
    await wrapper.findAll("textarea")[0]!.setValue("帮助整理企业文档");
    await wrapper.findAll("textarea")[1]!.setValue("只输出已验证的信息");
    await wrapper.find("button[aria-label='模型限制开关']").trigger("click");
    await wrapper.find(".intelligence-create__model-option input").setValue(true);
    await clickButton(wrapper, "保存草稿");

    expect(lifecycle.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      material: expect.objectContaining({
        name: "文档助手",
        modelRestriction: {
          enabled: true,
          selectedReferences: [{
            modelId: "model.deepseek",
            revision,
            digest: revision,
          }],
        },
      }),
    }));
    expect(wrapper.text()).toContain("已保存");
    expect(wrapper.text()).not.toContain(draft.draftRevision);

    await clickButton(wrapper, "运行测试");
    expect(lifecycle.startTest).toHaveBeenCalledWith({
      robotId: draft.robotId,
      expectedDraftRevision: draft.draftRevision,
      testInput: expect.any(String),
    });
    expect(wrapper.text()).toContain("测试通过");

    await clickButton(wrapper, "提交发布");
    expect(lifecycle.submitDraft).toHaveBeenCalledWith({
      robotId: draft.robotId,
      expectedDraftRevision: draft.draftRevision,
      semanticVersion: "1.0.0",
      changeSummary: "首次提交企业发布审核",
    });
    expect(wrapper.text()).toContain("审核中");
    expect(wrapper.text()).toContain("撤回暂不可用");
    expect(wrapper.text()).not.toMatch(/task:lifecycle-test|sha256:/u);
  });

  it("blocks testing and publishing while the saved draft has unsaved changes", async () => {
    const router = createTestRouter();
    await router.push({ path: "/intelligence/create-robot", query: { robotId: "agent.personal-one" } });
    await router.isReady();
    const lifecycle = createLifecycleAdapter();
    lifecycle.getDraft.mockResolvedValueOnce(draftFixture({
      testState: "passed",
      testFact: {
        draftRevision: revision,
        state: "passed",
        taskId: "task:test",
        testedAt: timestamp,
      },
    }));
    const wrapper = mount(IntelligenceCreationPage, {
      global: {
        plugins: [router],
        provide: {
          [agentLifecycleAdapterKey as symbol]: lifecycle,
          [workbenchAdapterKey as symbol]: createWorkbenchAdapter(),
        },
      },
    });
    await flushPromises();

    await wrapper.find("input[placeholder='例如：合同审阅助手']").setValue("修改后的名称");
    expect(button(wrapper, "运行测试").attributes("disabled")).toBeDefined();
    expect(button(wrapper, "提交发布").attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("有未保存修改");
    expect(lifecycle.startTest).not.toHaveBeenCalled();
    expect(lifecycle.submitDraft).not.toHaveBeenCalled();
  });

  it("reloads after an exact revision conflict without silently retrying the update", async () => {
    const router = createTestRouter();
    await router.push({ path: "/intelligence/create-robot", query: { robotId: "agent.personal-one" } });
    await router.isReady();
    const lifecycle = createLifecycleAdapter();
    const latest = draftFixture();
    latest.name = "服务端最新名称";
    latest.material.name = "服务端最新名称";
    lifecycle.getDraft
      .mockResolvedValueOnce(draftFixture())
      .mockResolvedValueOnce(latest);
    lifecycle.updateDraft.mockRejectedValueOnce(new AgentLifecycleAdapterError(
      "agentlifecycle.revision_conflict",
      "conflict",
    ));
    const wrapper = mount(IntelligenceCreationPage, {
      global: {
        plugins: [router],
        provide: {
          [agentLifecycleAdapterKey as symbol]: lifecycle,
          [workbenchAdapterKey as symbol]: createWorkbenchAdapter(),
        },
      },
    });
    await flushPromises();

    await wrapper.find("input[placeholder='例如：合同审阅助手']").setValue("本地修改");
    await clickButton(wrapper, "保存草稿");

    expect(lifecycle.updateDraft).toHaveBeenCalledTimes(1);
    expect(lifecycle.updateDraft).toHaveBeenCalledWith(expect.objectContaining({
      expectedDraftRevision: revision,
    }));
    expect(wrapper.text()).toContain("已重新加载最新内容");
    expect(wrapper.text()).toContain("服务端最新名称");
  });

  it("fails closed when Central lifecycle is unavailable and reconnects through the real adapter", async () => {
    const router = createTestRouter();
    await router.push("/intelligence/create-robot");
    await router.isReady();
    const lifecycle = createLifecycleAdapter();
    lifecycle.listDrafts
      .mockRejectedValueOnce(new AgentLifecycleAdapterError(
        "agentlifecycle.service_unavailable",
        "unavailable",
      ))
      .mockResolvedValueOnce(undefined);

    const wrapper = mount(IntelligenceCreationPage, {
      global: {
        plugins: [router],
        provide: {
          [agentLifecycleAdapterKey as symbol]: lifecycle,
          [workbenchAdapterKey as symbol]: createWorkbenchAdapter(),
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("机器人生命周期服务不可用");
    expect(wrapper.text()).toContain("不会使用本地假数据代替");
    expect(button(wrapper, "保存草稿").attributes("disabled")).toBeDefined();

    await clickButton(wrapper, "重新连接");

    expect(lifecycle.listDrafts).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("机器人生命周期服务已重新连接");
    expect(button(wrapper, "保存草稿").attributes("disabled")).toBeUndefined();
  });
});

const revision = `sha256:${"a".repeat(64)}`;
const timestamp = "2026-08-31T00:00:00.000Z";

function draftFixture(overrides: Record<string, unknown> = {}): RobotDraftDetail {
  const base = {
    robotId: "agent.personal-one",
    draftRevision: revision,
    instructionRevision: revision,
    name: "文档助手",
    description: "帮助整理企业文档",
    avatar: { source: "system", assetId: "robot-avatar.default" },
    tags: ["文档"],
    testState: "untested",
    updatedAt: timestamp,
    material: {
      robotId: "agent.personal-one",
      name: "文档助手",
      description: "帮助整理企业文档",
      behaviorRules: "只输出已验证的信息",
      avatar: { source: "system", assetId: "robot-avatar.default" },
      tags: ["文档"],
      modelRestriction: { enabled: false, selectedReferences: [] },
      skillRestriction: { enabled: false, selectedReferences: [] },
      toolRestriction: { enabled: false, selectedReferences: [] },
      knowledgeRestriction: { enabled: false, selectedReferences: [] },
    },
  };
  return { ...base, ...overrides } as RobotDraftDetail;
}

function createLifecycleAdapter() {
  return {
    listDrafts: vi.fn(),
    getDraft: vi.fn(),
    createDraft: vi.fn(async () => ({ state: "draft_saved" })),
    updateDraft: vi.fn(async () => ({ state: "draft_saved" })),
    startTest: vi.fn(async () => ({ state: "test_started" })),
    submitDraft: vi.fn(async () => ({ state: "submitted" })),
    withdrawSubmission: vi.fn(async () => ({ state: "withdrawn" })),
  } as unknown as AgentLifecycleAdapter & Record<string, ReturnType<typeof vi.fn>>;
}

function createWorkbenchAdapter() {
  return {
    loadWorkbenchData: vi.fn(async () => ({
      workspaces: [], sessions: [], agents: [], recentTasks: [], recentArtifacts: [],
      models: [{
        modelId: "model.deepseek",
        revision,
        name: "DeepSeek",
        source: "enterprise",
        capabilities: ["text", "tool_calling"],
        available: true,
      }],
    })),
  };
}

function button(wrapper: ReturnType<typeof mount>, label: string) {
  const target = wrapper.findAll("button").find((item) => item.text() === label);
  if (target === undefined) throw new Error(`Missing button: ${label}`);
  return target;
}

async function clickButton(wrapper: ReturnType<typeof mount>, label: string): Promise<void> {
  await button(wrapper, label).trigger("click");
  await flushPromises();
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/intelligence/create-robot", name: "intelligenceCreateRobot", component: IntelligenceCreationPage },
      { path: "/intelligence/create-skill", name: "intelligenceCreateSkill", component: IntelligenceCreationPage },
      { path: "/intelligence", name: "intelligence", component: { template: "<div>智能中心</div>" } },
      { path: "/workbench", name: "workbench", component: { template: "<div>Workbench</div>" } },
    ],
  });
}
