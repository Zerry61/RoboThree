import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from "vue-router";

import LegacyWorkbench from "../legacy/LegacyWorkbench.js";

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

export type RoboThreeRouteOptions = {
  includeDesignSystem?: boolean;
};

export function createRoboThreeRoutes(
  options: RoboThreeRouteOptions = {},
): readonly RouteRecordRaw[] {
  const includeDesignSystem = options.includeDesignSystem ?? import.meta.env.DEV;
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
        title: "工作台",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/tasks",
      name: productionRouteNames.tasks,
      component: () => import("../pages/tasks/TasksListPage.vue"),
      meta: {
        navKey: "tasks",
        title: "任务",
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
      component: () => import("../pages/intelligence/IntelligenceCenterPage.vue"),
      meta: {
        navKey: "intelligence",
        title: "机器人详情",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/intelligence/skills/:skillId",
      name: productionRouteNames.intelligenceSkillDetail,
      component: () => import("../pages/intelligence/IntelligenceCenterPage.vue"),
      meta: {
        navKey: "intelligence",
        title: "技能详情",
        runtimeStatus: "Ready",
      },
    },
    {
      path: "/intelligence/tools/:toolId",
      name: productionRouteNames.intelligenceToolDetail,
      component: () => import("../pages/intelligence/IntelligenceCenterPage.vue"),
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
      component: () => import("../pages/settings/SettingsIdentityPage.vue"),
      meta: {
        navKey: "settings",
        title: "登录与身份",
        runtimeStatus: "Ready",
      },
    },
  ];

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

export function createRoboThreeRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [...createRoboThreeRoutes()],
  });
}
