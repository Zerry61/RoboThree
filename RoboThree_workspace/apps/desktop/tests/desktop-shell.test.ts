// @vitest-environment happy-dom

import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import { primaryNavigationItems } from "../src/renderer/app/navigation.js";
import DesktopShell from "../src/renderer/components/shell/DesktopShell.vue";

function createShellRouter(initialPath = "/tasks") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: primaryNavigationItems.map((item) => ({
      path: `/${item.key}`,
      name: item.routeName,
      component: { template: `<section>${item.label}</section>` },
      meta: {
        navKey: item.key,
        title: item.label,
      },
    })),
  });
  router.push(initialPath);
  return router;
}

describe("DFE-1B Desktop shell", () => {
  it("renders five primary navigation entries and marks the current route", async () => {
    const router = createShellRouter("/tasks");
    await router.isReady();
    const wrapper = mount(DesktopShell, {
      props: { items: primaryNavigationItems },
      slots: { default: "<section data-testid='page'>Page content</section>" },
      global: { plugins: [router] },
    });

    expect(wrapper.text()).toContain("工作台");
    expect(wrapper.text()).toContain("任务");
    expect(wrapper.text()).toContain("智能中心");
    expect(wrapper.text()).toContain("知识中心");
    expect(wrapper.text()).toContain("设置");
    expect(wrapper.find("[aria-current='page']").text()).toContain("任务");
    expect(wrapper.find("aside").attributes("aria-label")).toBe("主导航");
    expect(wrapper.find("main").attributes("aria-label")).toBe("主内容");
    expect(wrapper.find("[data-testid='page']").text()).toContain("Page content");
  });

  it("collapses and expands the sidebar without removing route links", async () => {
    const router = createShellRouter("/workbench");
    await router.isReady();
    const wrapper = mount(DesktopShell, {
      props: { items: primaryNavigationItems },
      global: { plugins: [router] },
    });

    expect(wrapper.classes()).not.toContain("desktop-shell--collapsed");
    await wrapper.find("button[aria-label='收起侧栏']").trigger("click");
    expect(wrapper.classes()).toContain("desktop-shell--collapsed");
    expect(wrapper.findAll("a")).toHaveLength(5);
    expect(wrapper.text()).not.toContain("本地用户");

    await wrapper.find("button[aria-label='展开侧栏']").trigger("click");
    expect(wrapper.classes()).not.toContain("desktop-shell--collapsed");
    expect(wrapper.text()).toContain("本地用户");
  });
});
