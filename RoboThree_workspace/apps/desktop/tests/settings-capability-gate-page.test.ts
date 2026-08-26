// @vitest-environment happy-dom

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { mount } from "@vue/test-utils";
import { createRouter, createWebHashHistory, type Router } from "vue-router";
import { describe, expect, it } from "vitest";

import { createRoboThreeRoutes } from "../src/renderer/app/router.js";
import SettingsFeedbackPage from "../src/renderer/pages/settings/SettingsFeedbackPage.vue";
import SettingsIdentityPage from "../src/renderer/pages/settings/SettingsIdentityPage.vue";
import SettingsMemoryPage from "../src/renderer/pages/settings/SettingsMemoryPage.vue";
import SettingsPersonalizationPage from "../src/renderer/pages/settings/SettingsPersonalizationPage.vue";

const gatePages = [
  { path: "/settings/personalization", component: SettingsPersonalizationPage, title: "个性化" },
  { path: "/settings/memory", component: SettingsMemoryPage, title: "个人记忆" },
  { path: "/settings/feedback", component: SettingsFeedbackPage, title: "问题反馈" },
  { path: "/settings/identity", component: SettingsIdentityPage, title: "登录与身份" },
] as const;

async function createRouterAt(path: string): Promise<Router> {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [...createRoboThreeRoutes({ includeDesignSystem: false })],
  });
  await router.push(path);
  await router.isReady();
  return router;
}

describe("DFE-5B.2 SettingsCapabilityGatePage", () => {
  it("renders the four gated settings pages from static product copy only", async () => {
    for (const page of gatePages) {
      const router = await createRouterAt(page.path);
      const wrapper = mount(page.component, {
        global: {
          plugins: [router],
        },
      });

      expect(wrapper.text()).toContain(page.title);
      expect(wrapper.text()).toContain("功能尚未接入");
      expect(wrapper.text()).toContain("static_product_copy");
      expect(wrapper.text()).toContain("Desktop/Core 正常");
      expect(wrapper.findAll("a")).toHaveLength(5);
      expect(wrapper.find("a[aria-current='page']").text()).toContain(page.title);
      expect(wrapper.findAll("input")).toHaveLength(0);
      expect(wrapper.findAll("textarea")).toHaveLength(0);
      expect(wrapper.findAll("button[disabled]").length).toBeGreaterThan(0);
      expect(wrapper.text()).not.toMatch(/保存成功|提交成功|同步完成|登录成功|已启用|已生效/u);
      expect(wrapper.html()).not.toMatch(/sk-[A-Za-z0-9]{12,}|credentialReference|workspaceRoot|rootRealPath|requestDigest|providerEndpoint/u);
    }
  });

  it("keeps the responsive settings layout shared instead of copied into each page", async () => {
    const [layout, gate, personalization, memory, feedback, identity] = await Promise.all([
      readFile(resolve("apps/desktop/src/renderer/pages/settings/SettingsSectionLayout.vue"), "utf8"),
      readFile(resolve("apps/desktop/src/renderer/pages/settings/SettingsCapabilityGatePage.vue"), "utf8"),
      readFile(resolve("apps/desktop/src/renderer/pages/settings/SettingsPersonalizationPage.vue"), "utf8"),
      readFile(resolve("apps/desktop/src/renderer/pages/settings/SettingsMemoryPage.vue"), "utf8"),
      readFile(resolve("apps/desktop/src/renderer/pages/settings/SettingsFeedbackPage.vue"), "utf8"),
      readFile(resolve("apps/desktop/src/renderer/pages/settings/SettingsIdentityPage.vue"), "utf8"),
    ]);

    expect(layout).toContain("@media (max-width: 980px)");
    expect(layout).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(layout).toContain("position: static");
    expect(`${layout}\n${gate}`).not.toContain("overflow-x");
    for (const thinPage of [personalization, memory, feedback, identity]) {
      expect(thinPage).not.toContain("<style");
      expect(thinPage).toContain("SettingsCapabilityGatePage");
    }
  });
});
