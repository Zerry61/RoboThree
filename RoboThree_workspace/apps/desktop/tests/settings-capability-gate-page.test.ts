// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { createRouter, createWebHashHistory } from "vue-router";
import { describe, expect, it } from "vitest";

import { runtimeModeKey, type DesktopRuntimeMode } from "../src/renderer/app/runtime-mode.js";
import { createRoboThreeRoutes } from "../src/renderer/app/router.js";
import SettingsFeedbackPage from "../src/renderer/pages/settings/SettingsFeedbackPage.vue";
import SettingsMemoryPage from "../src/renderer/pages/settings/SettingsMemoryPage.vue";
import SettingsPersonalizationPage from "../src/renderer/pages/settings/SettingsPersonalizationPage.vue";

describe("DFE-8B settings prototype alignment", () => {
  it("keeps personalization read-only outside local demo", async () => {
    const wrapper = await mountPage(SettingsPersonalizationPage, "/settings/personalization", "standard");
    expect(wrapper.text()).toContain("个性化能力尚未接入");
    expect(wrapper.findAll("textarea")).toHaveLength(0);
    expect(wrapper.findAll("button[role='radio']")).toHaveLength(4);
    expect(wrapper.findAll("button[role='radio']:disabled")).toHaveLength(4);
  });

  it("updates only the local-demo personalization preview", async () => {
    const wrapper = await mountPage(SettingsPersonalizationPage, "/settings/personalization", "local_demo");
    await findButton(wrapper, "编辑").trigger("click");
    const textareas = wrapper.findAll("textarea");
    await textareas[0]!.setValue("结论优先");
    await textareas[1]!.setValue("周五复盘");
    await findButton(wrapper, "更新本页预览").trigger("click");
    expect(wrapper.text()).toContain("结论优先");
    expect(wrapper.text()).toContain("周五复盘");
    expect(wrapper.text()).toContain("离开页面后清除");
    expect(wrapper.text()).not.toMatch(/保存成功|已生效|已应用到 AI/u);
  });

  it("renders markdown preview through text interpolation", async () => {
    const wrapper = await mountPage(SettingsMemoryPage, "/settings/memory", "local_demo");
    await findButton(wrapper, "编辑").trigger("click");
    await wrapper.find("textarea").setValue("# 偏好\n- 简洁回复\n<script>bad()</script>");
    await findButton(wrapper, "更新本页预览").trigger("click");
    expect(wrapper.text()).toContain("偏好");
    expect(wrapper.text()).toContain("简洁回复");
    expect(wrapper.find("script").exists()).toBe(false);
    expect(wrapper.html()).toContain("&lt;script&gt;bad()&lt;/script&gt;");
  });

  it("keeps production feedback controls disabled and creates no file input", async () => {
    const wrapper = await mountPage(SettingsFeedbackPage, "/settings/feedback", "standard");
    expect(wrapper.text()).toContain("反馈接收系统尚未接入");
    expect(wrapper.find("textarea").attributes("disabled")).toBeDefined();
    expect(wrapper.find("input[type='file']").exists()).toBe(false);
    expect(wrapper.findAll("button[disabled]")).toHaveLength(2);
    expect(wrapper.text()).not.toMatch(/提交成功|已提交/u);
  });
});

async function mountPage(component: object, path: string, runtimeMode: DesktopRuntimeMode) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [...createRoboThreeRoutes({ includeDesignSystem: false, runtimeMode: "standard" })],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(component, {
    global: { plugins: [router], provide: { [runtimeModeKey as symbol]: runtimeMode } },
  });
  await flushPromises();
  return wrapper;
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll("button").find((candidate) => candidate.text() === text);
  if (button === undefined) throw new Error(`button not found: ${text}`);
  return button;
}
