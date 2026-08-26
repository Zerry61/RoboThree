// @vitest-environment happy-dom

import { createRouter, createWebHashHistory } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import {
  fixtureKnowledgeAdapter,
  knowledgeAdapterKey,
  type KnowledgeAdapter,
} from "../src/renderer/adapters/knowledge-adapter.js";
import { createRoboThreeRoutes } from "../src/renderer/app/router.js";
import KnowledgeDetailPage from "../src/renderer/pages/knowledge/KnowledgeDetailPage.vue";

async function mountDetail(path: string, adapter?: KnowledgeAdapter) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [...createRoboThreeRoutes({ includeDesignSystem: false })],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(KnowledgeDetailPage, {
    global: {
      plugins: [router],
      provide: adapter === undefined ? {} : {
        [knowledgeAdapterKey as symbol]: adapter,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("DFE-5B.1 KnowledgeDetailPage", () => {
  it("keeps production default gated and does not expose detail fields", async () => {
    const wrapper = await mountDetail("/knowledge/enterprise-policy-demo");
    expect(wrapper.text()).toContain("知识能力未配置");
    expect(wrapper.text()).not.toContain("企业制度知识源示例");
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("检索结果样例：报销制度");
  });

  it("renders Fixture detail only for safe known ids", async () => {
    const wrapper = await mountDetail("/knowledge/enterprise-policy-demo", fixtureKnowledgeAdapter);
    expect(wrapper.text()).toContain("企业制度知识源示例");
    expect(wrapper.text()).toContain("检索结果样例");
    const input = wrapper.find("input");
    expect(input.attributes("aria-label")).toBe("过滤示例结果卡片");
    await input.setValue("差旅");
    expect(wrapper.text()).toContain("差旅申请");
    expect(wrapper.text()).not.toContain("报销制度");
  });

  it("does not reflect unsafe route params as source names", async () => {
    const wrapper = await mountDetail("/knowledge/..%2Fsecret", fixtureKnowledgeAdapter);
    expect(wrapper.text()).toContain("未找到该示例知识源");
    expect(wrapper.text()).not.toContain("../secret");
  });

  it("renders safe error detail without reflecting internal fields", async () => {
    const adapter: KnowledgeAdapter = {
      async loadKnowledgeSources() {
        throw new Error("providerEndpoint Token stack");
      },
    };
    const wrapper = await mountDetail("/knowledge/enterprise-policy-demo", adapter);

    expect(wrapper.text()).toContain("知识中心暂不可用，请稍后重试。");
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("providerEndpoint");
    expect(wrapper.text()).not.toContain("Token");
    expect(wrapper.text()).not.toContain("stack");
  });
});
