// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";

import {
  agentLifecycleAdapterKey,
  AgentLifecycleAdapterError,
  type AgentLifecycleAdapter,
} from "../src/renderer/adapters/agent-lifecycle-adapter.js";
import {
  DesktopIntelligenceAdapterError,
  intelligenceAdapterKey,
  type IntelligenceCatalogAdapter,
} from "../src/renderer/adapters/intelligence-adapter.js";
import {
  skillLifecycleAdapterKey,
  SkillLifecycleAdapterError,
  type SkillLifecycleAdapter,
} from "../src/renderer/adapters/skill-lifecycle-adapter.js";
import IntelligenceCenterPage from "../src/renderer/pages/intelligence/IntelligenceCenterPage.vue";
import IntelligenceCreationPage from "../src/renderer/pages/intelligence/IntelligenceCreationPage.vue";
import IntelligenceDetailPage from "../src/renderer/pages/intelligence/IntelligenceDetailPage.vue";
import {
  createSkillLifecycleTestAdapter,
  marketplaceSkillFixture,
  skillDetailFixture,
  skillInstallationRevision,
} from "./skill-lifecycle-test-fixtures.js";

const digest = "a".repeat(64);

describe("DFE-7A intelligence catalog page", () => {
  it("loads real Robot/Tool catalog data and removes old mock semantics", async () => {
    const adapter = createAdapter();
    const skills = createSkillLifecycleTestAdapter();
    const wrapper = await mountPage("/intelligence", adapter, createLifecycleAdapter(), skills);

    expect(adapter.negotiateCatalog).toHaveBeenCalledOnce();
    expect(adapter.listRobots).toHaveBeenCalledWith({ limit: 50 });
    expect(adapter.listTools).toHaveBeenCalledWith({ limit: 50 });
    expect(wrapper.text()).toContain("通用机器人");
    expect(wrapper.text()).toContain("已加载机器人");
    expect(wrapper.find("[data-intelligence-detail]").exists()).toBe(false);
    expect(wrapper.text()).toContain("我创建的");
    expect(wrapper.findAll("button").find((button) => button.text() === "我创建的")?.attributes("disabled"))
      .toBeUndefined();
    expect(wrapper.text()).not.toMatch(/模型可调用工具|模型可调用|已接入|文档审阅|v1alpha2 Catalog|Capability ID/u);

    await wrapper.findAll("button").find((button) => button.text() === "技能")?.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("技能广场");
    expect(wrapper.text()).toContain("已安装");
    expect(wrapper.text()).toContain("本地目录");
    expect(wrapper.text()).toContain("我创建的");
    expect(wrapper.text()).toContain("企业演示文稿");
    expect(skills.listSkills).toHaveBeenLastCalledWith({ scope: "marketplace", limit: 50 });

    for (const scope of ["已安装", "本地目录", "我创建的"]) {
      await wrapper.findAll("button").find((button) => button.text() === scope)?.trigger("click");
      await flushPromises();
    }
    expect(skills.listSkills.mock.calls.map(([input]) => input.scope)).toEqual([
      "marketplace", "installed", "local", "created",
    ]);
    expect(wrapper.text()).not.toContain("全部");
  });

  it("opens tool detail through getTool without leaking authority fields", async () => {
    const adapter = createAdapter();
    const wrapper = await mountPage("/intelligence/tools/tool.document.xlsx.write", adapter);

    expect(adapter.getTool).toHaveBeenCalledWith({ toolId: "tool.document.xlsx.write" });
    expect(wrapper.text()).toContain("工具用途、读写边界和风险摘要");
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
    expect(wrapper.text()).toContain("返回智能中心");
  });

  it("loads real skill detail on its own child page", async () => {
    const adapter = createAdapter();
    const skills = createSkillLifecycleTestAdapter();
    const wrapper = await mountPage(
      "/intelligence/skills/skill.weekly-report?scope=created&sourceKind=personal_creator",
      adapter,
      createLifecycleAdapter(),
      skills,
    );

    expect(wrapper.text()).toContain("返回智能中心");
    expect(wrapper.text()).toContain("周报整理");
    expect(wrapper.text()).toContain("测试通过");
    expect(wrapper.text()).toContain("提交发布");
    expect(skills.getSkill).toHaveBeenCalledWith({
      skillId: "skill.weekly-report",
      sourceKind: "personal_creator",
    });
    expect(adapter.listRobots).not.toHaveBeenCalled();
    expect(adapter.listTools).not.toHaveBeenCalled();
  });

  it("keeps the production skill path explicitly unavailable without a Preload adapter", async () => {
    const wrapper = await mountPage("/intelligence", createAdapter());

    await wrapper.findAll("button").find((button) => button.text() === "技能")?.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("技能服务暂不可用");
    expect(wrapper.text()).toContain("不会展示示例数据");
  });

  it("keeps test and submit actions on created Skill detail and reloads after a revision conflict", async () => {
    const skills = createSkillLifecycleTestAdapter();
    skills.refreshSkillDraft.mockRejectedValueOnce(new SkillLifecycleAdapterError({
      contractVersion: "skill-lifecycle.v1alpha1",
      errorCode: "skilllifecycle.revision_conflict",
      safeSummary: "Revision conflict.",
      correlationId: "correlation.skill-conflict",
      retryable: true,
    }));
    skills.getSkill
      .mockResolvedValueOnce(skillDetailFixture())
      .mockResolvedValueOnce(skillDetailFixture({ displayTitle: "周报整理（最新）" }));
    const wrapper = await mountPage(
      "/intelligence/skills/skill.weekly-report?scope=created&sourceKind=personal_creator",
      createAdapter(),
      createLifecycleAdapter(),
      skills,
    );

    expect(wrapper.findAll("button").some((button) => button.text() === "运行测试")).toBe(true);
    expect(wrapper.findAll("button").some((button) => button.text() === "提交发布")).toBe(true);
    await wrapper.findAll("button").find((button) => button.text() === "刷新草稿")?.trigger("click");
    await flushPromises();

    expect(skills.refreshSkillDraft).toHaveBeenCalledWith({
      skillId: "skill.weekly-report",
      expectedDraftRevision: expect.stringMatching(/^sha256:/u),
    });
    expect(skills.getSkill).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("周报整理（最新）");
    expect(wrapper.text()).toContain("技能已被更新");
  });

  it("installs marketplace Skills, uninstalls exact installed revisions, and surfaces active Task locks", async () => {
    const marketplace = createSkillLifecycleTestAdapter();
    marketplace.getSkill.mockResolvedValue(marketplaceSkillFixture());
    const installPage = await mountPage(
      "/intelligence/skills/skill.enterprise-slides?scope=marketplace&sourceKind=admin_upload",
      createAdapter(),
      createLifecycleAdapter(),
      marketplace,
    );
    await installPage.findAll("button").find((button) => button.text() === "安装技能")?.trigger("click");
    await flushPromises();
    expect(marketplace.installSkillRelease).toHaveBeenCalledWith(expect.objectContaining({
      skillId: "skill.enterprise-slides",
      mode: "install_exact",
    }));
    expect(installPage.text()).toContain("技能安装完成");

    const installed = createSkillLifecycleTestAdapter();
    installed.getSkill.mockResolvedValue(marketplaceSkillFixture({
      installed: true,
      installationRevision: skillInstallationRevision,
    }));
    installed.uninstallSkillRelease.mockRejectedValueOnce(new SkillLifecycleAdapterError({
      contractVersion: "skill-lifecycle.v1alpha1",
      errorCode: "skilllifecycle.active_task_lock",
      safeSummary: "Active task lock.",
      correlationId: "correlation.skill-active-task",
      retryable: true,
    }));
    const uninstallPage = await mountPage(
      "/intelligence/skills/skill.enterprise-slides?scope=installed&sourceKind=admin_upload",
      createAdapter(),
      createLifecycleAdapter(),
      installed,
    );
    await uninstallPage.findAll("button").find((button) => button.text() === "卸载技能")?.trigger("click");
    await flushPromises();
    expect(installed.uninstallSkillRelease).toHaveBeenCalledWith(expect.objectContaining({
      expectedInstallationRevision: skillInstallationRevision,
    }));
    expect(uninstallPage.text()).toContain("正在被运行中的任务使用");
    expect(uninstallPage.html()).not.toMatch(/\/Users\/|workspaceRoot|packageDigest|installationRevision/u);
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

  it("lists personal drafts separately with safe lifecycle labels", async () => {
    const lifecycle = createLifecycleAdapter();
    const wrapper = await mountPage("/intelligence", createAdapter(), lifecycle);

    await wrapper.findAll("button").find((item) => item.text() === "我创建的")?.trigger("click");
    await flushPromises();

    expect(lifecycle.listDrafts).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("我的发布机器人");
    expect(wrapper.text()).toContain("已发布到企业机器人目录");
    expect(wrapper.text()).toContain("测试通过");
    expect(wrapper.text()).not.toMatch(/pending_review|approved|sha256:/u);
  });

  it("shows a real reconnect action instead of draft fixtures when lifecycle is unavailable", async () => {
    const lifecycle = createLifecycleAdapter();
    lifecycle.listDrafts
      .mockRejectedValueOnce(new AgentLifecycleAdapterError(
        "agentlifecycle.service_unavailable",
        "unavailable",
      ))
      .mockResolvedValueOnce({
        contractVersion: "agent-lifecycle.v1alpha1",
        queryRevision: `sha256:${digest}`,
        items: [],
      });
    const wrapper = await mountPage("/intelligence", createAdapter(), lifecycle);

    await wrapper.findAll("button").find((item) => item.text() === "我创建的")?.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("机器人生命周期服务不可用");
    expect(wrapper.text()).toContain("不会使用本地假数据代替");

    await wrapper.findAll("button").find((item) => item.text() === "重新连接")?.trigger("click");
    await flushPromises();
    expect(lifecycle.listDrafts).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("还没有个人机器人");
  });
});

async function mountPage(
  path: string,
  adapter: IntelligenceCatalogAdapter,
  lifecycle = createLifecycleAdapter(),
  skillLifecycle?: SkillLifecycleAdapter,
) {
  const router = createTestRouter();
  await router.push(path);
  await router.isReady();
  const page = path === "/intelligence" ? IntelligenceCenterPage : IntelligenceDetailPage;
  const wrapper = mount(page, {
    global: {
      plugins: [router],
      provide: {
        [intelligenceAdapterKey as symbol]: adapter,
        [agentLifecycleAdapterKey as symbol]: lifecycle,
        ...(skillLifecycle === undefined ? {} : {
          [skillLifecycleAdapterKey as symbol]: skillLifecycle,
        }),
      },
    },
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

function createLifecycleAdapter() {
  return {
    listDrafts: vi.fn(async () => ({
      contractVersion: "agent-lifecycle.v1alpha1",
      queryRevision: `sha256:${digest}`,
      items: [{
        robotId: "agent.personal-published",
        draftRevision: `sha256:${digest}`,
        instructionRevision: `sha256:${digest}`,
        name: "我的发布机器人",
        description: "只在个人草稿分区展示。",
        avatar: { source: "system" as const, assetId: "robot-avatar.default" as const },
        tags: ["文档"],
        testState: "passed" as const,
        submissionState: "approved" as const,
        updatedAt: "2026-08-31T00:00:00.000Z",
      }],
    })),
    getDraft: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    startTest: vi.fn(),
    submitDraft: vi.fn(),
    withdrawSubmission: vi.fn(),
  } as unknown as AgentLifecycleAdapter & { listDrafts: ReturnType<typeof vi.fn> };
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/intelligence", name: "intelligence", component: IntelligenceCenterPage },
      { path: "/intelligence/create-robot", name: "intelligenceCreateRobot", component: IntelligenceCreationPage },
      { path: "/intelligence/create-skill", name: "intelligenceCreateSkill", component: IntelligenceCreationPage },
      { path: "/intelligence/robots/:robotId", name: "intelligenceRobotDetail", component: IntelligenceDetailPage },
      { path: "/intelligence/skills/:skillId", name: "intelligenceSkillDetail", component: IntelligenceDetailPage },
      { path: "/intelligence/tools/:toolId", name: "intelligenceToolDetail", component: IntelligenceDetailPage },
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
