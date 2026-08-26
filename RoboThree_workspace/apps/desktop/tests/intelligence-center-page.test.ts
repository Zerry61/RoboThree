// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";

import {
  DesktopIntelligenceAdapterError,
  intelligenceAdapterKey,
  type IntelligenceCatalogAdapter,
} from "../src/renderer/adapters/intelligence-adapter.js";
import IntelligenceCenterPage from "../src/renderer/pages/intelligence/IntelligenceCenterPage.vue";
import IntelligenceCreationPage from "../src/renderer/pages/intelligence/IntelligenceCreationPage.vue";

const digest = "a".repeat(64);

describe("DFE-7A intelligence catalog page", () => {
  it("loads real Robot/Tool catalog data and removes old mock semantics", async () => {
    const adapter = createAdapter();
    const wrapper = await mountPage("/intelligence", adapter);

    expect(adapter.negotiateCatalog).toHaveBeenCalledOnce();
    expect(adapter.listRobots).toHaveBeenCalledWith({ limit: 50 });
    expect(adapter.listTools).toHaveBeenCalledWith({ limit: 50 });
    expect(wrapper.text()).toContain("通用机器人");
    expect(wrapper.text()).toContain("已加载机器人");
    expect(wrapper.text()).not.toMatch(/我创建的|模型可调用工具|模型可调用|已接入|文档审阅/u);

    await wrapper.findAll("button").find((button) => button.text() === "技能")?.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("技能目录待接入");
    expect(wrapper.text()).toContain("不展示生产 Mock Skill 条目");
    expect(wrapper.text()).not.toContain("我的报告助手");
  });

  it("opens tool detail through getTool without leaking authority fields", async () => {
    const adapter = createAdapter();
    const wrapper = await mountPage("/intelligence/tools/tool.document.xlsx.write", adapter);

    expect(adapter.getTool).toHaveBeenCalledWith({ toolId: "tool.document.xlsx.write" });
    expect(wrapper.text()).toContain("工具详情来自真实 Catalog detail");
    expect(wrapper.text()).toContain("结构化输入");
    expect(wrapper.text()).toContain("结构化输出");
    expect(wrapper.text()).toContain("可能修改或删除文件");
    expect(JSON.stringify(wrapper.html())).not.toMatch(
      /workspaceRoot|rootRealPath|selectedPath|credentialReference|requestDigest|HMAC|stack/u,
    );
  });

  it("opens robot detail directly without requiring the first list page", async () => {
    const adapter = createAdapter({
      robotItems: [],
    });
    const wrapper = await mountPage("/intelligence/robots/agent.general", adapter);

    expect(adapter.getRobot).toHaveBeenCalledWith({ robotId: "agent.general" });
    expect(wrapper.text()).toContain("默认模型");
    expect(wrapper.text()).toContain("GPT Test");
    expect(wrapper.find("[data-intelligence-detail='robots']").exists()).toBe(true);
  });

  it("clears catalog state on runtime changed and waits for explicit refresh", async () => {
    const adapter = createAdapter({
      listRobotsError: new DesktopIntelligenceAdapterError({
        contractVersion: "v1alpha2",
        code: "catalog.runtime_changed",
        category: "conflict",
        safeSummary: "Runtime changed.",
        retryable: true,
        correlationId: uuid("901"),
      }),
    });
    const wrapper = await mountPage("/intelligence", adapter);

    expect(wrapper.text()).toContain("本地 Core 已重启");
    expect(wrapper.text()).not.toContain("通用机器人");
    expect(adapter.negotiateCatalog).toHaveBeenCalledTimes(1);
    expect(adapter.listRobots).toHaveBeenCalledTimes(1);
  });
});

async function mountPage(path: string, adapter: IntelligenceCatalogAdapter) {
  const router = createTestRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(IntelligenceCenterPage, {
    global: {
      plugins: [router],
      provide: {
        [intelligenceAdapterKey as symbol]: adapter,
      },
    },
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/intelligence", name: "intelligence", component: IntelligenceCenterPage },
      { path: "/intelligence/create-robot", name: "intelligenceCreateRobot", component: IntelligenceCreationPage },
      { path: "/intelligence/create-skill", name: "intelligenceCreateSkill", component: IntelligenceCreationPage },
      { path: "/intelligence/robots/:robotId", name: "intelligenceRobotDetail", component: IntelligenceCenterPage },
      { path: "/intelligence/skills/:skillId", name: "intelligenceSkillDetail", component: IntelligenceCenterPage },
      { path: "/intelligence/tools/:toolId", name: "intelligenceToolDetail", component: IntelligenceCenterPage },
    ],
  });
}

function createAdapter(input: {
  robotItems?: ReturnType<typeof robotSummary>[];
  listRobotsError?: Error;
} = {}): IntelligenceCatalogAdapter {
  return {
    negotiateCatalog: vi.fn(async () => ({
      contractVersion: "v1alpha2",
      runtimeInstanceId: "runtime.instance-dfe-7a",
      available: true,
      reasonCode: undefined,
      safeSummary: undefined,
    })),
    listRobots: vi.fn(async () => {
      if (input.listRobotsError !== undefined) throw input.listRobotsError;
      return {
        contractVersion: "v1alpha2",
        queryRevision: digest,
        items: input.robotItems ?? [robotSummary()],
      };
    }),
    getRobot: vi.fn(async () => robotDetail()),
    listTools: vi.fn(async () => ({
      contractVersion: "v1alpha2",
      queryRevision: digest,
      items: [toolSummary()],
    })),
    getTool: vi.fn(async () => toolDetail()),
  };
}

function robotSummary() {
  return {
    robotId: "agent.general",
    configurationRevision: digest,
    displayName: "通用机器人",
    description: "处理本地优先任务和文档工作流。",
    source: "local_trusted" as const,
    restrictionSummary: {
      models: "unrestricted" as const,
      skills: "restricted_nonempty" as const,
      tools: "restricted_empty" as const,
      knowledge: "unrestricted" as const,
    },
    runnable: true,
  };
}

function robotDetail() {
  return {
    ...robotSummary(),
    defaultModel: resource("model.gpt", "GPT Test"),
    allowModelOverride: true,
    eligibleModels: [resource("model.gpt", "GPT Test")],
    skills: [resource("skill.document.review", "文档审阅")],
    tools: [resource("tool.document.xlsx.write", "XLSX 写入")],
    knowledge: [],
  };
}

function toolSummary() {
  return {
    toolId: "tool.document.xlsx.write",
    capabilityRevision: digest,
    registryRevision: digest,
    displayName: "XLSX 写入",
    description: "创建或覆盖 XLSX。",
    source: "enterprise_package" as const,
    readOnly: false,
    riskSummary: ["routine_file", "destructive_file"] as const,
    availability: "available" as const,
  };
}

function toolDetail() {
  return {
    ...toolSummary(),
    inputShape: "structured_object" as const,
    outputShape: "structured_object" as const,
  };
}

function resource(resourceId: string, displayName: string) {
  return {
    resourceId,
    revision: digest,
    displayName,
    availability: "available" as const,
  };
}

function uuid(suffix: string): string {
  return `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
}
