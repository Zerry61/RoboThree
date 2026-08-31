// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import {
  createDemoAuthSessionStore,
  demoAuthSessionKey,
} from "../src/renderer/app/demo-auth-session.js";
import LoginPage from "../src/renderer/pages/auth/LoginPage.vue";

describe("DFE-8A local demo entry", () => {
  it("shows demo language, reports inline errors, clears password and enters workbench", async () => {
    const store = createDemoAuthSessionStore();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/login", name: "login", component: LoginPage },
        { path: "/workbench", name: "workbench", component: { template: "<p>Workbench</p>" } },
      ],
    });
    await router.push("/login");
    await router.isReady();
    const wrapper = mount(LoginPage, {
      attachTo: document.body,
      global: { plugins: [router], provide: { [demoAuthSessionKey as symbol]: store } },
    });

    expect(wrapper.text()).toContain("进入本地演示");
    expect(wrapper.text()).toContain("不代表企业身份认证");
    expect(wrapper.text()).toContain("账号 admin，密码 123456");
    expect(wrapper.text()).not.toContain("登录 RoboThree");

    const password = wrapper.find("input[name='password']");
    await password.setValue("wrong");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.text()).toContain("账号或密码不正确");
    expect((password.element as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(password.element);

    await password.setValue("123456");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("workbench");
    expect(store.session.value?.sessionKind).toBe("local_demo");
    expect((password.element as HTMLInputElement).value).toBe("");
    wrapper.unmount();
  });

  it("toggles password visibility with an accessible pressed state", async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: LoginPage }] });
    await router.push("/");
    const wrapper = mount(LoginPage, { global: { plugins: [router] } });
    const toggle = wrapper.find("button[aria-label='显示密码']");
    expect(wrapper.find("input[name='password']").attributes("type")).toBe("password");
    await toggle.trigger("click");
    expect(wrapper.find("input[name='password']").attributes("type")).toBe("text");
    expect(wrapper.find("button[aria-label='隐藏密码']").attributes("aria-pressed")).toBe("true");
    wrapper.unmount();
  });
});
