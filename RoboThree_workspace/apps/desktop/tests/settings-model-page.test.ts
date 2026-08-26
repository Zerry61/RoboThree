// @vitest-environment happy-dom

import type { ModelProjection } from "@robothree/contracts";
import { flushPromises, mount } from "@vue/test-utils";
import { createRouter, createWebHashHistory } from "vue-router";
import { describe, expect, it, vi } from "vitest";

import {
  settingsAdapterKey,
  type SettingsAdapter,
} from "../src/renderer/adapters/settings-adapter.js";
import { createRoboThreeRoutes } from "../src/renderer/app/router.js";
import SettingsModelPage from "../src/renderer/pages/settings/SettingsModelPage.vue";

const digest = "a".repeat(64);

describe("DFE-5A.1 settings model page", () => {
  it("renders real model projections as read-only model management", async () => {
    const adapter = createAdapter({
      models: [
        model({ name: "Enterprise GPT", source: "enterprise", capabilities: ["text", "streaming"] }),
        model({ name: "Platform Baseline", source: "official", modelId: "model.official" }),
      ],
    });
    const wrapper = await mountPage(adapter);
    await flushPromises();

    expect(adapter.loadSettingsModels).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("模型管理");
    expect(wrapper.text()).toContain("Enterprise GPT");
    expect(wrapper.text()).toContain("企业模型");
    expect(wrapper.text()).toContain("Platform Baseline");
    expect(wrapper.text()).toContain("平台基线模型");
    expect(wrapper.text()).toContain("待接入");
    expect(wrapper.text()).toContain("不接收真实 API Key");
    expect(wrapper.text()).toContain("Provider");
    expect(wrapper.text()).toContain("模型标识");
    expect(wrapper.text()).toContain("显示名称");
    expect(wrapper.text()).not.toContain("测试连接");
    expect(wrapper.text()).not.toMatch(/保存成功|删除成功|已设为默认|Key 已查看/u);
    expect(wrapper.find("input").exists()).toBe(false);
  });

  it("shows empty state with real settings navigation links", async () => {
    const wrapper = await mountPage(createAdapter({ models: [] }));
    await flushPromises();

    expect(wrapper.text()).toContain("当前没有可展示模型");
    expect(wrapper.text()).toContain("企业模型由后台配置");
    expect(wrapper.text()).toContain("个性化");
    expect(wrapper.text()).toContain("个人记忆");
    expect(wrapper.find("nav[aria-label='设置导航']").findAll("a")).toHaveLength(5);
    expect(wrapper.findAll("button[disabled]").length).toBe(4);
  });

  it("renders adapter errors without leaking sensitive transport fields", async () => {
    const adapter: SettingsAdapter = {
      loadSettingsModels: vi.fn(async () => {
        throw new Error("模型服务暂不可用，请稍后重试。");
      }),
    };
    const wrapper = await mountPage(adapter);
    await flushPromises();

    expect(wrapper.text()).toContain("模型管理加载失败");
    expect(wrapper.text()).toContain("模型服务暂不可用");
    expect(wrapper.html()).not.toMatch(/credentialReference|workspaceRoot|rootRealPath|sk-[A-Za-z0-9]/u);
  });
});

async function mountPage(adapter: SettingsAdapter) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [...createRoboThreeRoutes({ includeDesignSystem: false })],
  });
  await router.push("/settings/models");
  await router.isReady();
  return mount(SettingsModelPage, {
    global: {
      plugins: [router],
      provide: {
        [settingsAdapterKey as symbol]: adapter,
      },
    },
  });
}

function createAdapter(input: { models: readonly ModelProjection[] }): SettingsAdapter {
  return {
    loadSettingsModels: vi.fn(async () => input),
  };
}

function model(overrides: Partial<ModelProjection> = {}): ModelProjection {
  return {
    modelId: "model.test",
    revision: digest,
    name: "Test Model",
    source: "official",
    capabilities: ["text", "tool_calling"],
    available: true,
    ...overrides,
  };
}
