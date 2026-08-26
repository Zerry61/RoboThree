// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import IntelligenceCreationPage from "../src/renderer/pages/intelligence/IntelligenceCreationPage.vue";

describe("DFE-4B intelligence creation page", () => {
  it("renders the robot draft form with avatar controls and gated save actions", async () => {
    const router = createTestRouter();
    await router.push("/intelligence/create-robot");
    await router.isReady();

    const wrapper = mount(IntelligenceCreationPage, {
      global: {
        plugins: [router],
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("创建机器人");
    expect(wrapper.text()).toContain("机器人名称");
    expect(wrapper.text()).toContain("上传头像");
    expect(wrapper.text()).not.toMatch(/输入要求|输出要求|风险说明/u);
    expect(wrapper.findAll("button").find((button) => button.text() === "保存草稿")?.attributes("disabled")).toBeDefined();
    expect(wrapper.findAll("button").find((button) => button.text() === "保存并测试")?.attributes("disabled")).toBeDefined();
    expect(wrapper.findAll("button").find((button) => button.text() === "提交发布")?.attributes("disabled")).toBeDefined();

    const skillsToggle = wrapper.findAll("button").find((button) => button.text().includes("技能"));
    expect(skillsToggle?.attributes("aria-expanded")).toBe("false");
    await skillsToggle?.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("1 项已保留");
    expect(skillsToggle?.attributes("aria-expanded")).toBe("true");
    expect(JSON.stringify(wrapper.html())).not.toMatch(/workspaceRoot|rootRealPath|selectionHandle|selectedPath|submitTurn/u);
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

  it("moves skill creation from validated form to local conversation without test or publish actions", async () => {
    const router = createTestRouter();
    await router.push("/intelligence/create-skill");
    await router.isReady();

    const wrapper = mount(IntelligenceCreationPage, {
      global: {
        plugins: [router],
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

    expect(wrapper.text()).toContain("技能创建助手");
    expect(wrapper.text()).toContain("请创建技能「周报整理技能」");
    expect(wrapper.text()).toContain("SKILL.md");
    expect(wrapper.text()).not.toContain("运行测试");
    expect(wrapper.text()).not.toContain("提交发布");
    expect(JSON.stringify(wrapper.html())).not.toMatch(/workspaceRoot|rootRealPath|selectionHandle|selectedPath|submitTurn/u);
  });

  it("renders skill creation failure with a real retry action in the same form state", async () => {
    const router = createTestRouter();
    await router.push("/intelligence/create-skill");
    await router.isReady();

    const wrapper = mount(IntelligenceCreationPage, {
      global: {
        plugins: [router],
      },
    });
    await flushPromises();

    (wrapper.vm as unknown as { previewSkillCreateFailure(): void }).previewSkillCreateFailure();
    await flushPromises();

    expect(wrapper.text()).toContain("创建会话失败");
    expect(wrapper.findAll("button").find((button) => button.text() === "重试")).toBeDefined();
  });
});

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/intelligence/create-robot", name: "intelligenceCreateRobot", component: IntelligenceCreationPage },
      { path: "/intelligence/create-skill", name: "intelligenceCreateSkill", component: IntelligenceCreationPage },
      { path: "/intelligence", name: "intelligence", component: { template: "<div>智能中心</div>" } },
    ],
  });
}
