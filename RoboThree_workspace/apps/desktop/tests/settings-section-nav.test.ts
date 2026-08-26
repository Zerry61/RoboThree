// @vitest-environment happy-dom

import { mount } from "@vue/test-utils";
import { createRouter, createWebHashHistory } from "vue-router";
import { describe, expect, it } from "vitest";

import { createRoboThreeRoutes } from "../src/renderer/app/router.js";
import SettingsSectionNav from "../src/renderer/pages/settings/SettingsSectionNav.vue";

async function mountNav(path: string) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [...createRoboThreeRoutes({ includeDesignSystem: false })],
  });
  await router.push(path);
  await router.isReady();
  return mount(SettingsSectionNav, {
    global: {
      plugins: [router],
    },
  });
}

describe("DFE-5B.2 SettingsSectionNav", () => {
  it("uses RouterLink anchors with aria-current for the active settings route", async () => {
    const wrapper = await mountNav("/settings/memory");
    const links = wrapper.findAll("a");

    expect(wrapper.find("nav").attributes("aria-label")).toBe("设置导航");
    expect(links).toHaveLength(5);
    expect(links.map((link) => link.text())).toEqual([
      "模型管理已接入",
      "个性化待接入",
      "个人记忆待接入",
      "问题反馈待接入",
      "登录与身份待接入",
    ]);
    expect(links[2]?.attributes("aria-current")).toBe("page");
    expect(wrapper.findAll("button[disabled]")).toHaveLength(0);
  });
});
