// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import { primaryNavigationItems } from "../src/renderer/app/navigation.js";
import {
  createDemoAuthSessionStore,
  demoAuthSessionKey,
} from "../src/renderer/app/demo-auth-session.js";
import { runtimeModeKey } from "../src/renderer/app/runtime-mode.js";
import { subscribeWorkbenchNewTaskRequested } from
  "../src/renderer/app/shell-navigation-events.js";
import {
  createTaskPinStore,
  taskPinStoreKey,
} from "../src/renderer/app/task-pin-store.js";
import {
  shellNavigationAdapterKey,
  type ShellNavigationAdapter,
} from "../src/renderer/adapters/shell-navigation-adapter.js";
import DesktopShell from "../src/renderer/components/shell/DesktopShell.vue";

function createShellRouter(initialPath = "/intelligence") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...primaryNavigationItems.map((item) => ({
        path: `/${item.key}`,
        name: item.routeName,
        component: { template: `<section>${item.label}</section>` },
        meta: {
          navKey: item.key,
          title: item.label,
        },
      })),
      { path: "/tasks", name: "tasks", component: { template: "<section>任务</section>" } },
      { path: "/settings/models", name: "settingsModels", component: { template: "<section>模型设置</section>" } },
      { path: "/login", name: "login", component: { template: "<section>进入本地演示</section>" } },
    ],
  });

  router.push(initialPath);
  return router;
}

describe("DFE-1B Desktop shell", () => {
  it("turns the primary new-task entry into an explicit fresh-conversation request", async () => {
    const router = createShellRouter("/workbench");
    await router.isReady();
    let requestCount = 0;
    const unsubscribe = subscribeWorkbenchNewTaskRequested(() => {
      requestCount += 1;
    });
    const wrapper = mount(DesktopShell, {
      props: { items: primaryNavigationItems },
      global: { plugins: [router] },
    });

    await wrapper.findAll("nav[aria-label='主要功能'] a")
      .find((link) => link.text().includes("新建任务"))!
      .trigger("click");
    await flushPromises();

    expect(requestCount).toBe(1);
    expect(router.currentRoute.value.name).toBe("workbench");
    unsubscribe();
  });

  it("renders three primary entries and keeps settings in the user menu", async () => {
    const router = createShellRouter("/intelligence");
    await router.isReady();
    const wrapper = mount(DesktopShell, {
      props: { items: primaryNavigationItems },
      slots: { default: "<section data-testid='page'>Page content</section>" },
      global: { plugins: [router] },
    });

    expect(wrapper.text()).toContain("新建任务");
    expect(wrapper.text()).toContain("智能中心");
    expect(wrapper.text()).toContain("知识中心");
    await wrapper.findAll("nav[aria-label='主要功能'] a")
      .find((link) => link.text().includes("知识中心"))!
      .trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("knowledge");
    await wrapper.find("button[aria-haspopup='menu']").trigger("click");
    expect(wrapper.text()).toContain("设置");
    await wrapper.findAll("button[role='menuitem']")
      .find((button) => button.text() === "设置")!
      .trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("settingsModels");
    expect(wrapper.find("[role='menu']").exists()).toBe(false);
    expect(wrapper.findAll("nav[aria-label='主要功能'] a")).toHaveLength(3);
    expect(wrapper.find("aside").attributes("aria-label")).toBe("主导航");
    expect(wrapper.find("main").attributes("aria-label")).toBe("主内容");
    expect(wrapper.find("[data-testid='page']").text()).toContain("Page content");
  });

  it("shows and clears the local-demo session from the user menu", async () => {
    const router = createShellRouter("/workbench");
    await router.isReady();
    const session = createDemoAuthSessionStore();
    session.signIn("admin", "123456");
    const wrapper = mount(DesktopShell, {
      props: { items: primaryNavigationItems },
      global: {
        plugins: [router],
        provide: {
          [runtimeModeKey as symbol]: "local_demo",
          [demoAuthSessionKey as symbol]: session,
        },
      },
    });

    expect(wrapper.text()).toContain("管理员 · 本地演示");
    await wrapper.find("button[aria-haspopup='menu']").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "退出登录")!.trigger("click");
    await flushPromises();
    expect(session.session.value).toBeNull();
    expect(router.currentRoute.value.name).toBe("login");
  });

  it("keeps settings and sign-out reachable in compact 680px navigation", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 680 });
    const router = createShellRouter("/workbench");
    await router.isReady();
    const session = createDemoAuthSessionStore();
    session.signIn("admin", "123456");
    const wrapper = mount(DesktopShell, {
      props: { items: primaryNavigationItems },
      global: {
        plugins: [router],
        provide: {
          [runtimeModeKey as symbol]: "local_demo",
          [demoAuthSessionKey as symbol]: session,
        },
      },
    });

    await wrapper.find("button[aria-label='收起侧栏']").trigger("click");
    const compactUserTrigger = wrapper.find("button[aria-haspopup='menu']");
    expect(compactUserTrigger.exists()).toBe(true);
    expect(compactUserTrigger.attributes("aria-label")).toBe("管理员 · 本地演示");

    await compactUserTrigger.trigger("click");
    await wrapper.findAll("button[role='menuitem']")
      .find((button) => button.text() === "设置")!
      .trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("settingsModels");

    await wrapper.find("button[aria-haspopup='menu']").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "退出登录")!.trigger("click");
    await flushPromises();
    expect(session.session.value).toBeNull();
    expect(router.currentRoute.value.name).toBe("login");
  });

  it("closes the user menu after an outside pointer action", async () => {
    const router = createShellRouter("/workbench");
    await router.isReady();
    const wrapper = mount(DesktopShell, {
      props: { items: primaryNavigationItems },
      global: { plugins: [router] },
    });

    await wrapper.find("button[aria-haspopup='menu']").trigger("click");
    expect(wrapper.find("[role='menu']").exists()).toBe(true);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await Promise.resolve();
    expect(wrapper.find("[role='menu']").exists()).toBe(false);
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
    expect(wrapper.findAll("nav[aria-label='主要功能'] a")).toHaveLength(3);
    expect(wrapper.text()).not.toContain("本地用户");

    await wrapper.find("button[aria-label='展开侧栏']").trigger("click");
    expect(wrapper.classes()).not.toContain("desktop-shell--collapsed");
    expect(wrapper.text()).toContain("本地用户");
  });

  it("shows real task and workspace projections without persisting local pins", async () => {
    const router = createShellRouter("/workbench");
    await router.isReady();
    const adapter: ShellNavigationAdapter = {
      loadNavigation: async () => ({
        workspaces: [{
          workspaceGrantId: "workspace:one",
          displayName: "季度报告",
          accessMode: "read_write",
        }],
        sessions: [{
          sessionId: "session:one",
          revision: 1,
          title: "整理季度报告",
          createdAt: "2026-08-28T00:00:00.000Z",
          updatedAt: "2026-08-28T01:00:00.000Z",
        }],
        tasks: [{
          taskId: "task:one",
          sessionId: "session:one",
          revision: 1,
          displayStatus: "running",
          createdAt: "2026-08-28T00:00:00.000Z",
          updatedAt: "2026-08-28T01:00:00.000Z",
        }, {
          taskId: "task:two",
          sessionId: "session:one",
          revision: 1,
          displayStatus: "completed",
          createdAt: "2026-08-28T01:05:00.000Z",
          updatedAt: "2026-08-28T01:06:00.000Z",
        }],
      }),
    };
    const taskPins = createTaskPinStore();
    const wrapper = mount(DesktopShell, {
      props: { items: primaryNavigationItems },
      global: {
        plugins: [router],
        provide: {
          [shellNavigationAdapterKey as symbol]: adapter,
          [taskPinStoreKey as symbol]: taskPins,
        },
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(wrapper.text()).toContain("季度报告");
    expect(wrapper.text()).toContain("整理季度报告");
    expect(wrapper.findAll(".desktop-shell__recent-row")).toHaveLength(1);
    expect(wrapper.find("section[aria-labelledby='recent-conversations-title']").text())
      .toContain("已完成");
    expect(wrapper.text()).not.toContain("当前没有置顶任务");
    expect(wrapper.find("section[aria-labelledby='pinned-tasks-title']").exists()).toBe(false);
    taskPins.toggle("task:one");
    await Promise.resolve();
    expect(wrapper.text()).toContain("本次运行");
    expect(wrapper.find("section[aria-labelledby='pinned-tasks-title']").text())
      .toContain("整理季度报告");
    await wrapper.find("section[aria-labelledby='recent-conversations-title'] .desktop-shell__task-link")
      .trigger("click");
    await flushPromises();
    expect(router.currentRoute.value).toEqual(expect.objectContaining({
      name: "workbench",
      query: { sessionId: "session:one", taskId: "task:two" },
    }));
    expect(wrapper.html()).not.toMatch(/localStorage|workspaceRoot|rootRealPath/u);
  });

  it("refreshes recent tasks automatically after a successful task route transition", async () => {
    const router = createShellRouter("/workbench");
    await router.isReady();
    let loads = 0;
    const adapter: ShellNavigationAdapter = {
      loadNavigation: async () => {
        loads += 1;
        return loads === 1
          ? { workspaces: [], sessions: [], tasks: [] }
          : {
              workspaces: [],
              sessions: [{
                sessionId: "session:new",
                revision: 1,
                title: "实时出现的新任务",
                createdAt: "2026-08-30T00:00:00.000Z",
                updatedAt: "2026-08-30T00:00:01.000Z",
              }],
              tasks: [{
                taskId: "task:new",
                sessionId: "session:new",
                revision: 1,
                displayStatus: "queued",
                createdAt: "2026-08-30T00:00:00.000Z",
                updatedAt: "2026-08-30T00:00:01.000Z",
              }],
            };
      },
    };
    const wrapper = mount(DesktopShell, {
      props: { items: primaryNavigationItems },
      global: {
        plugins: [router],
        provide: { [shellNavigationAdapterKey as symbol]: adapter },
      },
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain("实时出现的新任务");

    await router.push({ name: "tasks", query: { sessionId: "session:new", taskId: "task:new" } });
    await flushPromises();

    expect(loads).toBeGreaterThanOrEqual(2);
    expect(wrapper.text()).toContain("实时出现的新任务");
  });
});
