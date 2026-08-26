// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import {
  fixtureKnowledgeAdapter,
  knowledgeAdapterKey,
  type KnowledgeAdapter,
} from "../src/renderer/adapters/knowledge-adapter.js";
import KnowledgeCenterPage from "../src/renderer/pages/knowledge/KnowledgeCenterPage.vue";

function mountPage(adapter?: KnowledgeAdapter) {
  return mount(KnowledgeCenterPage, {
    global: {
      provide: adapter === undefined ? {} : {
        [knowledgeAdapterKey as symbol]: adapter,
      },
      stubs: {
        RouterLink: {
          props: ["to"],
          template: "<a href='#'><slot /></a>",
        },
      },
    },
  });
}

describe("DFE-5B.1 KnowledgeCenterPage", () => {
  it("renders production default unconfigured/gated with no Fixture list or search", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("企业知识能力尚未配置");
    expect(wrapper.text()).toContain("知识中心未接入");
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.findAll("a")).toHaveLength(0);
    expect(wrapper.text()).not.toContain("企业制度知识源示例");
    expect(wrapper.text()).not.toContain("检索结果样例");
  });

  it("renders explicit Fixture data and filters locally", async () => {
    const wrapper = mountPage(fixtureKnowledgeAdapter);
    await flushPromises();

    expect(wrapper.text()).toContain("示例数据");
    expect(wrapper.text()).toContain("企业制度知识源示例");
    const input = wrapper.find("input");
    expect(input.attributes("aria-label")).toBe("搜索知识源示例");
    await input.setValue("产品");
    expect(wrapper.text()).toContain("产品问答知识源示例");
    expect(wrapper.text()).not.toContain("企业制度知识源示例");
  });

  it("renders safe error summaries without internal object output", async () => {
    const adapter: KnowledgeAdapter = {
      async loadKnowledgeSources() {
        throw new Error("providerEndpoint Token stack");
      },
    };
    const wrapper = mountPage(adapter);
    await flushPromises();

    expect(wrapper.text()).toContain("知识中心暂不可用，请稍后重试。");
    expect(wrapper.text()).not.toContain("providerEndpoint");
    expect(wrapper.text()).not.toContain("Token");
    expect(wrapper.text()).not.toContain("stack");
  });

  it("does not show search or Fixture rows for permission denied state", async () => {
    const adapter: KnowledgeAdapter = {
      async loadKnowledgeSources() {
        return { state: "permission_denied", sources: [] };
      },
    };
    const wrapper = mountPage(adapter);
    await flushPromises();

    expect(wrapper.text()).toContain("无权查看示例知识源");
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.findAll("a")).toHaveLength(0);
    expect(wrapper.text()).not.toContain("企业制度知识源示例");
  });
});
