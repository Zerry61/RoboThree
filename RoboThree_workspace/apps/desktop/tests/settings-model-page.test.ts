// @vitest-environment happy-dom

import type { ModelProjection } from "@robothree/contracts";
import type { PersonalModelSafeProjectionV1Alpha1 } from "@robothree/contracts/desktop-local/personal-model-management/v1alpha1";
import { flushPromises, mount } from "@vue/test-utils";
import { createRouter, createWebHashHistory } from "vue-router";
import { describe, expect, it, vi } from "vitest";

import {
  personalModelSettingsAdapterKey,
  type PersonalModelSettingsAdapter,
} from "../src/renderer/adapters/personal-model-settings-adapter.js";
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
    expect(wrapper.text()).toContain("不会接收或显示 API Key");
    expect(wrapper.text()).toContain("模型显示名称");
    expect(wrapper.text()).toContain("精确标识");
    expect(wrapper.text()).not.toContain("测试连接");
    expect(wrapper.text()).not.toMatch(/保存成功|删除成功|已设为默认|Key 已查看/u);
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.findAll("button[disabled]")).toHaveLength(1);
  });

  it("renders the existing personal model catalog as read-only facts", async () => {
    const wrapper = await mountPage(
      createAdapter({ models: [] }),
      createPersonalAdapter({ catalogAvailable: true, models: [personalModel()] }),
    );
    await flushPromises();

    expect(wrapper.text()).toContain("我的 DeepSeek");
    expect(wrapper.text()).toContain("DeepSeek");
    expect(wrapper.text()).toContain("模型标识：deepseek-chat");
    expect(wrapper.text()).toContain("api.deepseek.com");
    expect(wrapper.text()).toContain("个人默认");
    expect(wrapper.findAll("button").map((button) => button.text())).not.toEqual(expect.arrayContaining([
      "查看 Key", "设为默认", "删除", "测试连接",
    ]));
    expect(wrapper.findAll("button[disabled]")).toHaveLength(1);
  });

  it("shows empty state with real settings navigation links", async () => {
    const wrapper = await mountPage(createAdapter({ models: [] }));
    await flushPromises();

    expect(wrapper.text()).toContain("当前没有可展示模型");
    expect(wrapper.text()).toContain("企业模型由后台配置");
    expect(wrapper.text()).toContain("个性化");
    expect(wrapper.text()).toContain("个人记忆");
    expect(wrapper.find("nav[aria-label='设置导航']").findAll("a")).toHaveLength(4);
    expect(wrapper.findAll("button[disabled]").length).toBe(1);
  });

  it("renders adapter errors without leaking sensitive transport fields", async () => {
    const adapter: SettingsAdapter = {
      loadSettingsModels: vi.fn(async () => {
        throw new Error('[ { "origin": "string", "code": "invalid_format", "path": [ "clientInstanceId" ], "pattern": "/uuid/" } ]');
      }),
    };
    const wrapper = await mountPage(adapter);
    await flushPromises();

    expect(wrapper.text()).toContain("模型管理加载失败");
    expect(wrapper.text()).toContain("模型管理暂不可用，请稍后重试。");
    expect(wrapper.html()).not.toMatch(/credentialReference|workspaceRoot|rootRealPath|clientInstanceId|invalid_format|pattern|sk-[A-Za-z0-9]/u);
  });

  it("does not render raw JavaScript failures from an unavailable Desktop API", async () => {
    const adapter: SettingsAdapter = {
      loadSettingsModels: vi.fn(async () => {
        throw new TypeError("Cannot read properties of undefined (reading 'listModels')");
      }),
    };
    const wrapper = await mountPage(adapter);
    await flushPromises();

    expect(wrapper.text()).toContain("模型管理暂不可用，请稍后重试。");
    expect(wrapper.text()).not.toContain("Cannot read properties");
    expect(wrapper.text()).not.toContain("listModels");
  });
});

async function mountPage(
  adapter: SettingsAdapter,
  personalAdapter: PersonalModelSettingsAdapter = createPersonalAdapter({
    catalogAvailable: false,
    models: [],
    unavailableMessage: "个人模型目录尚未开放。",
  }),
) {
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
        [personalModelSettingsAdapterKey as symbol]: personalAdapter,
      },
    },
  });
}

function createPersonalAdapter(
  input: Awaited<ReturnType<PersonalModelSettingsAdapter["loadPersonalModels"]>>,
): PersonalModelSettingsAdapter {
  return { loadPersonalModels: vi.fn(async () => input) };
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

function personalModel(): PersonalModelSafeProjectionV1Alpha1 {
  return {
    contractVersion: "personal-model-management.v1alpha1",
    personalModelId: "personal.model",
    configurationRevision: digest,
    displayName: "我的 DeepSeek",
    provider: "deepseek",
    protocol: "openai_compatible",
    providerModelId: "deepseek-chat",
    endpointDisplayHost: "api.deepseek.com",
    capabilities: ["text", "tool_calling"],
    status: "available",
    available: true,
    credentialState: "present_masked",
    preferenceSelected: true,
    permissions: { canConfigure: true, canUse: true, canReveal: true, canDelete: true },
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}
