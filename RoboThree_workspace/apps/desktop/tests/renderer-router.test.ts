import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createRoboThreeRoutes,
  demoRouteNames,
  productionRouteNames,
} from "../src/renderer/app/router.js";

describe("DFE renderer router", () => {
  it("keeps product routes while only three areas remain in primary navigation", () => {
    const routes = createRoboThreeRoutes({ includeDesignSystem: false });
    expect(routes.map((route) => route.path)).toEqual([
      "/",
      "/legacy",
      "/workbench",
      "/tasks",
      "/intelligence",
      "/intelligence/create-robot",
      "/intelligence/create-skill",
      "/intelligence/robots/:robotId",
      "/intelligence/skills/:skillId",
      "/intelligence/tools/:toolId",
      "/knowledge",
      "/knowledge/:knowledgeId",
      "/settings",
      "/settings/models",
      "/settings/personalization",
      "/settings/memory",
      "/settings/feedback",
      "/settings/identity",
    ]);
    expect(routes.find((route) => route.path === "/workbench")?.name).toBe(productionRouteNames.workbench);
    expect(routes.find((route) => route.path === "/tasks")?.name).toBe(productionRouteNames.tasks);
    expect(routes.find((route) => route.path === "/tasks")?.meta?.navKey).toBe("workbench");
    expect(routes.find((route) => route.path === "/tasks")?.component).toBeUndefined();
    expect(routes.find((route) => route.path === "/tasks")?.redirect).toBeTypeOf("function");
    expect(routes.find((route) => route.path === "/intelligence")?.name).toBe(productionRouteNames.intelligence);
    expect(routes.find((route) => route.path === "/intelligence/create-robot")?.name)
      .toBe(productionRouteNames.intelligenceCreateRobot);
    expect(routes.find((route) => route.path === "/intelligence/create-skill")?.name)
      .toBe(productionRouteNames.intelligenceCreateSkill);
    expect(routes.find((route) => route.path === "/intelligence/robots/:robotId")?.name)
      .toBe(productionRouteNames.intelligenceRobotDetail);
    expect(routes.find((route) => route.path === "/intelligence/skills/:skillId")?.name)
      .toBe(productionRouteNames.intelligenceSkillDetail);
    expect(routes.find((route) => route.path === "/intelligence/tools/:toolId")?.name)
      .toBe(productionRouteNames.intelligenceToolDetail);
    for (const path of [
      "/intelligence/robots/:robotId",
      "/intelligence/skills/:skillId",
      "/intelligence/tools/:toolId",
    ]) {
      expect(String(routes.find((route) => route.path === path)?.component))
        .toContain("IntelligenceDetailPage.vue");
    }
    expect(routes.find((route) => route.path === "/knowledge")?.name).toBe(productionRouteNames.knowledge);
    expect(routes.find((route) => route.path === "/knowledge/:knowledgeId")?.name)
      .toBe(productionRouteNames.knowledgeDetail);
    expect(routes.find((route) => route.path === "/knowledge/:knowledgeId")?.meta?.navKey).toBe("knowledge");
    expect(routes.find((route) => route.path === "/settings")?.name).toBe(productionRouteNames.settings);
    expect(routes.find((route) => route.path === "/settings/models")?.name)
      .toBe(productionRouteNames.settingsModels);
    expect(routes.find((route) => route.path === "/settings/personalization")?.name)
      .toBe(productionRouteNames.settingsPersonalization);
    expect(routes.find((route) => route.path === "/settings/memory")?.name)
      .toBe(productionRouteNames.settingsMemory);
    expect(routes.find((route) => route.path === "/settings/feedback")?.name)
      .toBe(productionRouteNames.settingsFeedback);
    expect(routes.find((route) => route.path === "/settings/identity")?.name)
      .toBe(productionRouteNames.settingsIdentity);
    expect(routes.find((route) => route.path === "/settings/identity")?.redirect)
      .toBe("/settings/models");
    for (const path of [
      "/settings/models",
      "/settings/personalization",
      "/settings/memory",
      "/settings/feedback",
      "/settings/identity",
    ]) {
      expect(routes.find((route) => route.path === path)?.meta?.navKey).toBe("settings");
      expect(routes.find((route) => route.path === path)?.meta?.runtimeStatus).toBe("Ready");
    }
    expect(routes.find((route) => route.path === "/")?.redirect).toBe("/workbench");
    expect(routes.find((route) => route.path === "/settings")?.redirect).toBe("/settings/models");
    expect(routes.find((route) => route.path === "/legacy")?.component).toBeDefined();
    expect(routes.some((route) => route.path === "/__design-system")).toBe(false);
    expect(routes.some((route) => route.path === "/login")).toBe(false);
  });

  it("registers the chrome-free demo entry only in explicit local_demo mode", () => {
    const routes = createRoboThreeRoutes({
      includeDesignSystem: false,
      runtimeMode: "local_demo",
    });
    const login = routes.find((route) => route.path === "/login");
    expect(login?.name).toBe(demoRouteNames.login);
    expect(login?.meta).toEqual(expect.objectContaining({
      chrome: false,
      guestOnly: true,
      title: "进入本地演示",
    }));
    expect(Object.values(productionRouteNames)).not.toContain(demoRouteNames.login);
  });

  it("keeps the Design System gallery behind a DEV-only dynamic import", async () => {
    const source = await readFile(
      resolve("apps/desktop/src/renderer/app/router.ts"),
      "utf8",
    );
    expect(source).toContain("includeDesignSystem && import.meta.env.DEV");
    expect(source).toContain("../pages/design-system/DesignSystemGallery.vue");
    expect(source).not.toContain("designSystemComponent");
  });
});
