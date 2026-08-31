import {
  createRouter,
  createWebHashHistory,
  type Router,
  type RouteRecordRaw,
} from "vue-router";

import LegacyWorkbench from "../legacy/LegacyWorkbench.js";
import {
  safeDemoReturnTarget,
  type DemoAuthSessionStore,
} from "./demo-auth-session.js";
import {
  configuredRuntimeMode,
  type DesktopRuntimeMode,
} from "./runtime-mode.js";

export const productionRouteNames = Object.freeze({
  workbench: "workbench",
  tasks: "tasks",
  intelligence: "intelligence",
  intelligenceCreateRobot: "intelligenceCreateRobot",
  intelligenceCreateSkill: "intelligenceCreateSkill",
  intelligenceRobotDetail: "intelligenceRobotDetail",
  intelligenceSkillDetail: "intelligenceSkillDetail",
  intelligenceToolDetail: "intelligenceToolDetail",
  knowledge: "knowledge",
  knowledgeDetail: "knowledgeDetail",
  settings: "settings",
  settingsModels: "settingsModels",
  settingsPersonalization: "settingsPersonalization",
  settingsMemory: "settingsMemory",
  settingsFeedback: "settingsFeedback",
  settingsIdentity: "settingsIdentity",
} as const);

export const demoRouteNames = Object.freeze({
  login: "login",
} as const);

export type RoboThreeRouteOptions = {
  includeDesignSystem?: boolean;
  runtimeMode?: DesktopRuntimeMode;
};

export function createRoboThreeRoutes(
  options: RoboThreeRouteOptions = {},
): readonly RouteRecordRaw[] {
  const includeDesignSystem = options.includeDesignSystem ?? import.meta.env.DEV;
  const runtimeMode = options.runtimeMode ?? configuredRuntimeMode();
  const routes: RouteRecordRaw[] = [
    {
      path: "/",
      redirect: "/workbench",
    },
    {
      path: "/legacy",
      component: LegacyWorkbench,
      meta: {
        title: "旧工作台",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/workbench",
      name: productionRouteNames.workbench,
      component: () => import("../pages/workbench/WorkbenchCreatePage.vue"),
      meta: {
        navKey: "workbench",
        title: "新建任务",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/tasks",
      name: productionRouteNames.tasks,
      redirect: (to) => ({
        name: productionRouteNames.workbench,
        query: {
          ...(typeof to.query.sessionId === "string"
            ? { sessionId: to.query.sessionId }
            : {}),
          ...(typeof to.query.taskId === "string"
            ? { taskId: to.query.taskId }
            : {}),
        },
      }),
      meta: {
        navKey: "workbench",
        title: "对话",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/intelligence",
      name: productionRouteNames.intelligence,
      component: () => import("../pages/intelligence/IntelligenceCenterPage.vue"),
      meta: {
        navKey: "intelligence",
        title: "智能中心",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/intelligence/create-robot",
      name: productionRouteNames.intelligenceCreateRobot,
      component: () => import("../pages/intelligence/IntelligenceCreationPage.vue"),
      meta: {
        navKey: "intelligence",
        title: "创建机器人",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/intelligence/create-skill",
      name: productionRouteNames.intelligenceCreateSkill,
      component: () => import("../pages/intelligence/IntelligenceCreationPage.vue"),
      meta: {
        navKey: "intelligence",
        title: "创建技能",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/intelligence/robots/:robotId",
      name: productionRouteNames.intelligenceRobotDetail,
      component: () => import("../pages/intelligence/IntelligenceDetailPage.vue"),
      meta: {
        navKey: "intelligence",
        title: "机器人详情",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/intelligence/skills/:skillId",
      name: productionRouteNames.intelligenceSkillDetail,
      component: () => import("../pages/intelligence/IntelligenceDetailPage.vue"),
      meta: {
        navKey: "intelligence",
        title: "技能详情",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/intelligence/tools/:toolId",
      name: productionRouteNames.intelligenceToolDetail,
      component: () => import("../pages/intelligence/IntelligenceDetailPage.vue"),
      meta: {
        navKey: "intelligence",
        title: "工具详情",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/knowledge",
      name: productionRouteNames.knowledge,
      component: () => import("../pages/knowledge/KnowledgeCenterPage.vue"),
      meta: {
        navKey: "knowledge",
        title: "知识中心",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/knowledge/:knowledgeId",
      name: productionRouteNames.knowledgeDetail,
      component: () => import("../pages/knowledge/KnowledgeDetailPage.vue"),
      meta: {
        navKey: "knowledge",
        title: "知识源详情",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/settings",
      name: productionRouteNames.settings,
      redirect: "/settings/models",
      meta: {
        navKey: "settings",
        title: "设置",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/settings/models",
      name: productionRouteNames.settingsModels,
      component: () => import("../pages/settings/SettingsModelPage.vue"),
      meta: {
        navKey: "settings",
        title: "模型管理",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/settings/personalization",
      name: productionRouteNames.settingsPersonalization,
      component: () => import("../pages/settings/SettingsPersonalizationPage.vue"),
      meta: {
        navKey: "settings",
        title: "个性化",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/settings/memory",
      name: productionRouteNames.settingsMemory,
      component: () => import("../pages/settings/SettingsMemoryPage.vue"),
      meta: {
        navKey: "settings",
        title: "个人记忆",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/settings/feedback",
      name: productionRouteNames.settingsFeedback,
      component: () => import("../pages/settings/SettingsFeedbackPage.vue"),
      meta: {
        navKey: "settings",
        title: "问题反馈",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/settings/identity",
      name: productionRouteNames.settingsIdentity,
      redirect: "/settings/models",
      meta: {
        navKey: "settings",
        title: "设置",
        runtimeStatus: "Ready",
      },
    },
  ];

  if (runtimeMode === "local_demo") {
    routes.push({
      path: "/login",
      name: demoRouteNames.login,
      component: () => import("../pages/auth/LoginPage.vue"),
      meta: {
        chrome: false,
        guestOnly: true,
        title: "进入本地演示",
      },
    });
  }

  if (includeDesignSystem && import.meta.env.DEV) {
    routes.push({
      path: "/__design-system",
      name: "__design-system",
      meta: { chrome: false },
      component: () => import("../pages/design-system/DesignSystemGallery.vue"),
    });
  }

  return routes;
}

export function createRoboThreeRouter(
  options: RoboThreeRouteOptions & { demoAuthSession?: DemoAuthSessionStore } = {},
) {
  const runtimeMode = options.runtimeMode ?? configuredRuntimeMode();
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [...createRoboThreeRoutes({ ...options, runtimeMode })],
  });
  if (runtimeMode === "local_demo" && options.demoAuthSession !== undefined) {
    installDemoAuthGuard(router, options.demoAuthSession);
  }
  return router;
}

export function installDemoAuthGuard(
  router: Router,
  sessionStore: DemoAuthSessionStore,
): void {
  router.beforeEach((to) => {
    if (to.name === demoRouteNames.login) {
      return sessionStore.session.value === null
        ? true
        : { name: productionRouteNames.workbench };
    }
    if (sessionStore.session.value !== null) return true;
    sessionStore.rememberTarget(safeDemoReturnTarget(to));
    return { name: demoRouteNames.login };
  });
}
