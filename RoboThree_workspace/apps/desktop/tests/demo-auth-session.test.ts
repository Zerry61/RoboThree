import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";

import { createDemoAuthSessionStore } from "../src/renderer/app/demo-auth-session.js";
import {
  createRoboThreeRoutes,
  installDemoAuthGuard,
} from "../src/renderer/app/router.js";

describe("DFE-8A local demo session", () => {
  it("keeps the fixed demo session in memory only", () => {
    const store = createDemoAuthSessionStore();
    expect(store.session.value).toBeNull();
    expect(store.signIn("admin", "wrong")).toEqual({ ok: false, message: "账号或密码不正确" });
    expect(store.session.value).toBeNull();
    expect(store.signIn("admin", "123456")).toEqual({ ok: true });
    expect(store.session.value).toEqual({ username: "admin", displayName: "管理员", sessionKind: "local_demo" });
    store.signOut();
    expect(store.session.value).toBeNull();
  });

  it("guards local-demo business routes and preserves only safe targets", async () => {
    const store = createDemoAuthSessionStore();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [...createRoboThreeRoutes({ includeDesignSystem: false, runtimeMode: "local_demo" })],
    });
    installDemoAuthGuard(router, store);

    await router.push({ name: "tasks", query: { taskId: "task:one", unsafe: "https://bad.example" } });
    expect(router.currentRoute.value.name).toBe("login");
    expect(store.signIn("admin", "123456")).toEqual({ ok: true });
    await router.replace(store.consumeTarget()!);
    expect(router.currentRoute.value.name).toBe("tasks");
    expect(router.currentRoute.value.query).toEqual({ taskId: "task:one" });
  });

  it("does not preserve legacy or unknown targets", async () => {
    const store = createDemoAuthSessionStore();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [...createRoboThreeRoutes({ includeDesignSystem: false, runtimeMode: "local_demo" })],
    });
    installDemoAuthGuard(router, store);
    await router.push("/legacy");
    expect(router.currentRoute.value.name).toBe("login");
    expect(store.signIn("admin", "123456")).toEqual({ ok: true });
    await router.replace(store.consumeTarget()!);
    expect(router.currentRoute.value.name).toBe("workbench");
  });
});

