// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import {
  workbenchAdapterKey,
  type WorkbenchAdapter,
} from "../src/renderer/adapters/workbench-adapter.js";
import WorkbenchCreatePage from "../src/renderer/pages/workbench/WorkbenchCreatePage.vue";

const digest = "a".repeat(64);
const timestamp = "2026-08-16T00:00:00.000Z";

describe("DFE-2A Workbench create page", () => {
  it("renders real catalog projections and submits a task through the adapter", async () => {
    const adapter = createAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("新建任务");
    expect(wrapper.text()).toContain("Workspace One");
    expect(wrapper.text()).toContain("Normal Agent");
    expect(wrapper.text()).toContain("2 Tools · 0/1 Skills · 0/1 Knowledge · Workspace Bound");
    expect(wrapper.text()).toContain("手动复核");
    expect(wrapper.text()).toContain("待接入");
    expect(wrapper.text()).toContain("智能确认");
    expect(wrapper.text()).toContain("任务内授权");
    expect(wrapper.text()).not.toContain("工作区授权");
    expect(wrapper.text()).toContain("当前不改变任务执行");
    expect(wrapper.find("[aria-pressed]").exists()).toBe(false);

    await wrapper.find("textarea").setValue("Create an XLSX report");
    await wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"))
      ?.trigger("click");
    await flushPromises();

    expect(adapter.submitTask).toHaveBeenCalledWith(expect.objectContaining({
      userInput: "Create an XLSX report",
      agentId: "agent:normal",
      requestedModelId: "model:gpt",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      workspaceGrantId: "workspace:one",
    }));
    expect(JSON.stringify(adapter.submitTask.mock.calls[0]?.[0])).not.toContain("workspaceRoot");
    expect(wrapper.text()).toContain("已进入本地运行队列");
  });

  it("keeps submit disabled until required task context is present", async () => {
    const adapter = createAdapter({ workspaces: [] });
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();
    await wrapper.find("textarea").setValue("Do work");

    const submitButton = wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"));
    expect(submitButton?.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("请选择一个已授权工作区。");
  });

  it("submits only explicitly selected Skill and Knowledge ids", async () => {
    const adapter = createAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    await wrapper.find("section[aria-label='技能选择'] input").setValue(true);
    await wrapper.find("section[aria-label='知识库选择'] input").setValue(true);
    await wrapper.find("textarea").setValue("Use selected resources");
    await wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"))
      ?.trigger("click");
    await flushPromises();

    expect(adapter.submitTask).toHaveBeenCalledWith(expect.objectContaining({
      selectedSkillIds: ["skill:docs"],
      selectedKnowledgeIds: ["knowledge:one"],
    }));
  });

  it("keeps explicit empty resource selections empty after users clear the final item", async () => {
    const adapter = createAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    const skill = wrapper.find("section[aria-label='技能选择'] input");
    await skill.setValue(true);
    await skill.setValue(false);
    const knowledge = wrapper.find("section[aria-label='知识库选择'] input");
    await knowledge.setValue(true);
    await knowledge.setValue(false);
    await wrapper.find("textarea").setValue("Run without resources");
    await wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"))
      ?.trigger("click");
    await flushPromises();

    expect(adapter.submitTask).toHaveBeenCalledWith(expect.objectContaining({
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
    }));
  });

  it("does not offer global models when the selected agent has no eligible model", async () => {
    const adapter = createAdapter({
      agents: [{
        ...agentFixture(),
        eligibleModels: [],
      }],
    });
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();
    await wrapper.find("textarea").setValue("Do work");

    const submitButton = wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"));
    expect(submitButton?.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("该机器人当前没有可用模型，请更换机器人或联系管理员。");
  });

  it("keeps a selected robot when refresh marks it unavailable and does not switch to another runnable robot", async () => {
    const brokenAgent = {
      ...agentFixture(),
      agentId: "agent:broken",
      name: "Broken Agent",
    };
    const generalAgent = {
      ...agentFixture(),
      agentId: "agent:general",
      name: "General Agent",
    };
    const adapter = createAdapter({
      agents: [brokenAgent, generalAgent],
    });
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    expect((wrapper.findAll("select")[2]?.element as HTMLSelectElement).value)
      .toBe("agent:broken");

    adapter.loadWorkbenchData.mockResolvedValueOnce(workbenchData({
      agents: [{
        ...brokenAgent,
        eligibleModels: [],
        runnable: false,
      }, generalAgent],
    }));
    await wrapper.findAll("button")
      .find((button) => button.text().includes("刷新"))
      ?.trigger("click");
    await flushPromises();

    expect((wrapper.findAll("select")[2]?.element as HTMLSelectElement).value)
      .toBe("agent:broken");
    expect((wrapper.findAll("select")[3]?.element as HTMLSelectElement).value)
      .toBe("");
    expect(wrapper.text()).toContain("该机器人当前没有可用模型，请更换机器人或联系管理员。");

    await wrapper.find("textarea").setValue("Do not switch robots");
    await wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"))
      ?.trigger("click");
    await flushPromises();

    expect(adapter.submitTask).not.toHaveBeenCalled();
  });

  it("keeps robot selection empty across repeated refreshes after the selected robot disappears", async () => {
    const brokenAgent = {
      ...agentFixture(),
      agentId: "agent:broken",
      name: "Broken Agent",
    };
    const generalAgent = {
      ...agentFixture(),
      agentId: "agent:general",
      name: "General Agent",
    };
    const adapter = createAdapter({
      agents: [brokenAgent, generalAgent],
    });
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    expect((wrapper.findAll("select")[2]?.element as HTMLSelectElement).value)
      .toBe("agent:broken");

    const disappearedCatalog = workbenchData({
      agents: [generalAgent],
    });
    adapter.loadWorkbenchData
      .mockResolvedValueOnce(disappearedCatalog)
      .mockResolvedValueOnce(disappearedCatalog);

    const refreshButton = wrapper.findAll("button")
      .find((button) => button.text().includes("刷新"));
    await refreshButton?.trigger("click");
    await flushPromises();

    expect((wrapper.findAll("select")[2]?.element as HTMLSelectElement).value)
      .toBe("");
    expect((wrapper.findAll("select")[3]?.element as HTMLSelectElement).value)
      .toBe("");
    expect(wrapper.text()).toContain("请选择可运行的机器人。");

    await refreshButton?.trigger("click");
    await flushPromises();

    expect((wrapper.findAll("select")[2]?.element as HTMLSelectElement).value)
      .toBe("");
    expect((wrapper.findAll("select")[3]?.element as HTMLSelectElement).value)
      .toBe("");
    expect(wrapper.text()).toContain("请选择可运行的机器人。");
  });

  it("shows a real submit failure without local success text", async () => {
    const adapter = createAdapter();
    adapter.submitTask.mockRejectedValueOnce(new Error("Core rejected the task."));
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();
    await wrapper.find("textarea").setValue("Submit failure");
    await wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"))
      ?.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Core rejected the task.");
    expect(wrapper.text()).not.toContain("已进入本地运行队列");
  });
});

function createAdapter(
  overrides: Partial<Awaited<ReturnType<WorkbenchAdapter["loadWorkbenchData"]>>> = {},
) {
  const adapter = {
    loadWorkbenchData: vi.fn(async () => workbenchData(overrides)),
    createWorkspaceGrant: vi.fn(async () => undefined),
    submitTask: vi.fn(async () => ({
      session: sessionFixture(),
      receipt: {
        submitTurnCommandId: "00000000-0000-4000-8000-000000000001",
        clientTurnId: "turn:00000000-0000-4000-8000-000000000002",
        userMessageId: "message:user",
        taskId: "task:one",
        runtimeSelectionId: "runtime:one",
        status: "accepted",
        acceptedAt: timestamp,
      },
    })),
  };
  return adapter;
}

function workbenchData(
  overrides: Partial<Awaited<ReturnType<WorkbenchAdapter["loadWorkbenchData"]>>> = {},
) {
  return {
    workspaces: [{
      workspaceGrantId: "workspace:one",
      displayName: "Workspace One",
      rootDisplayPath: "Workspace One",
      accessMode: "read_write",
      status: "active",
      createdAt: timestamp,
    }],
    sessions: [sessionFixture()],
    agents: [agentFixture()],
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
    ...overrides,
  };
}

function sessionFixture() {
  const session = {
    sessionId: "session:one",
    revision: 1,
    title: "Planning",
    tombstoned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return session;
}

function agentFixture() {
  return {
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
      source: "official" as const,
      capabilities: ["text", "tool_calling"] as const,
      available: true,
    }],
    requiredModelCapabilities: ["text"] as const,
    skills: [
      { id: "skill:docs", revision: digest, name: "Docs", available: true },
    ],
    tools: [
      { id: "tool.document.pdf.extract_text", revision: digest, name: "PDF", available: true },
      { id: "tool.document.xlsx.write", revision: digest, name: "XLSX", available: true },
    ],
    knowledge: [
      { id: "knowledge:one", revision: digest, name: "Knowledge", available: true },
    ],
    runnable: true,
  };
}
