import Vue from 'vue';
import Router from 'vue-router';
import { canAccessRoute } from './permission-shell';
import { getSystemRedirectPath } from './navigation';
import { provisionalPermissionAlias } from './route-meta';
import LoginPage from '../pages/system/LoginPage.vue';
import ModelsPage from '../pages/models/ModelsPage.vue';
import ModelDetailPage from '../pages/models/ModelDetailPage.vue';
import ToolsPage from '../pages/tools/ToolsPage.vue';
import ToolDetailPage from '../pages/tools/ToolDetailPage.vue';
import ToolApiCreatePage from '../pages/tools/ToolApiCreatePage.vue';
import ToolMcpCreatePage from '../pages/tools/ToolMcpCreatePage.vue';
import ToolPolicyPage from '../pages/tools/ToolPolicyPage.vue';
import RobotsPage from '../pages/robots/RobotsPage.vue';
import RobotDetailPage from '../pages/robots/RobotDetailPage.vue';
import SkillsPage from '../pages/skills/SkillsPage.vue';
import SkillDetailPage from '../pages/skills/SkillDetailPage.vue';
import KnowledgePage from '../pages/knowledge/KnowledgePage.vue';
import KnowledgeDetailPage from '../pages/knowledge/KnowledgeDetailPage.vue';
import SystemUsersPage from '../pages/system/SystemUsersPage.vue';
import SystemAuditPage from '../pages/system/SystemAuditPage.vue';
import SystemFeedbackPage from '../pages/system/SystemFeedbackPage.vue';
import PermissionDeniedPage from '../pages/system/PermissionDeniedPage.vue';
import NotFoundPage from '../pages/system/NotFoundPage.vue';
import type { PermissionProjection } from './permission-shell';
import type { AdminRouteMeta } from './route-meta';
import type { RouteConfig } from 'vue-router';

Vue.use(Router);

type AdminRouteRecord = RouteConfig & {
  meta: AdminRouteMeta;
};

export const routes: readonly AdminRouteRecord[] = [
  {
    path: '/',
    redirect: '/models',
    meta: {
      module: 'models',
      navKey: 'models',
      pageTitle: '模型管理',
      implementationGate: 'shellImplemented'
    }
  },
  {
    path: '/login',
    name: 'admin.login',
    component: LoginPage,
    meta: {
      module: 'system',
      navKey: 'login',
      pageTitle: '登录待接入',
      implementationGate: 'shellImplemented'
    }
  },
  {
    path: '/models',
    name: 'admin.models.list',
    component: ModelsPage,
    meta: {
      module: 'models',
      navKey: 'models',
      pageTitle: '模型管理',
      implementationGate: 'shellImplemented',
      menuPermissionAlias: provisionalPermissionAlias('admin.models.menu'),
      routePermissionAlias: provisionalPermissionAlias('admin.models.route'),
      operationPermissionAlias: provisionalPermissionAlias('admin.models.operate'),
      capabilityKey: 'admin.models'
    }
  },
  {
    path: '/models/:modelId',
    name: 'admin.models.detail',
    component: ModelDetailPage,
    meta: {
      module: 'models',
      navKey: 'models',
      pageTitle: '模型详情',
      implementationGate: 'shellImplemented',
      routePermissionAlias: provisionalPermissionAlias('admin.models.route'),
      capabilityKey: 'admin.models.detail'
    }
  },
  {
    path: '/tools',
    name: 'admin.tools.list',
    component: ToolsPage,
    meta: {
      module: 'tools',
      navKey: 'tools',
      pageTitle: '工具管理',
      implementationGate: 'shellImplemented',
      menuPermissionAlias: provisionalPermissionAlias('admin.tools.menu'),
      routePermissionAlias: provisionalPermissionAlias('admin.tools.route'),
      operationPermissionAlias: provisionalPermissionAlias('admin.tools.operate'),
      capabilityKey: 'admin.tools',
      sensitiveSurface: true
    }
  },
  {
    path: '/tools/new/api',
    name: 'admin.tools.newApi',
    component: ToolApiCreatePage,
    meta: {
      module: 'tools',
      navKey: 'tools',
      pageTitle: '连接 API',
      implementationGate: 'prototype',
      routePermissionAlias: provisionalPermissionAlias('admin.tools.route'),
      operationPermissionAlias: provisionalPermissionAlias('admin.tools.operate'),
      capabilityKey: 'admin.tools.newApi',
      sensitiveSurface: true
    }
  },
  {
    path: '/tools/new/mcp',
    name: 'admin.tools.newMcp',
    component: ToolMcpCreatePage,
    meta: {
      module: 'tools',
      navKey: 'tools',
      pageTitle: '连接 MCP',
      implementationGate: 'prototype',
      routePermissionAlias: provisionalPermissionAlias('admin.tools.route'),
      operationPermissionAlias: provisionalPermissionAlias('admin.tools.operate'),
      capabilityKey: 'admin.tools.newMcp',
      sensitiveSurface: true
    }
  },
  {
    path: '/tools/:toolId/policy',
    name: 'admin.tools.policy',
    component: ToolPolicyPage,
    meta: {
      module: 'tools',
      navKey: 'tools',
      pageTitle: 'Tool 策略',
      implementationGate: 'prototype',
      routePermissionAlias: provisionalPermissionAlias('admin.tools.route'),
      operationPermissionAlias: provisionalPermissionAlias('admin.tools.operate'),
      capabilityKey: 'admin.tools.policy',
      sensitiveSurface: true
    }
  },
  {
    path: '/tools/:toolId',
    name: 'admin.tools.detail',
    component: ToolDetailPage,
    meta: {
      module: 'tools',
      navKey: 'tools',
      pageTitle: '工具详情',
      implementationGate: 'shellImplemented',
      routePermissionAlias: provisionalPermissionAlias('admin.tools.route'),
      capabilityKey: 'admin.tools.detail',
      sensitiveSurface: true
    }
  },
  {
    path: '/robots',
    name: 'admin.robots.list',
    component: RobotsPage,
    meta: {
      module: 'robots',
      navKey: 'robots',
      pageTitle: '机器人管理',
      implementationGate: 'shellImplemented',
      menuPermissionAlias: provisionalPermissionAlias('admin.robots.menu'),
      routePermissionAlias: provisionalPermissionAlias('admin.robots.route'),
      capabilityKey: 'admin.robots'
    }
  },
  {
    path: '/robots/:robotId',
    name: 'admin.robots.detail',
    component: RobotDetailPage,
    meta: {
      module: 'robots',
      navKey: 'robots',
      pageTitle: '机器人详情',
      implementationGate: 'shellImplemented',
      routePermissionAlias: provisionalPermissionAlias('admin.robots.route'),
      capabilityKey: 'admin.robots.detail'
    }
  },
  {
    path: '/skills',
    name: 'admin.skills.list',
    component: SkillsPage,
    meta: {
      module: 'skills',
      navKey: 'skills',
      pageTitle: '技能管理',
      implementationGate: 'shellImplemented',
      menuPermissionAlias: provisionalPermissionAlias('admin.skills.menu'),
      routePermissionAlias: provisionalPermissionAlias('admin.skills.route'),
      capabilityKey: 'admin.skills'
    }
  },
  {
    path: '/skills/:skillId',
    name: 'admin.skills.detail',
    component: SkillDetailPage,
    meta: {
      module: 'skills',
      navKey: 'skills',
      pageTitle: '技能详情',
      implementationGate: 'shellImplemented',
      routePermissionAlias: provisionalPermissionAlias('admin.skills.route'),
      capabilityKey: 'admin.skills.detail'
    }
  },
  {
    path: '/knowledge',
    name: 'admin.knowledge.list',
    component: KnowledgePage,
    meta: {
      module: 'knowledge',
      navKey: 'knowledge',
      pageTitle: '知识管理',
      implementationGate: 'shellImplemented',
      menuPermissionAlias: provisionalPermissionAlias('admin.knowledge.menu'),
      routePermissionAlias: provisionalPermissionAlias('admin.knowledge.route'),
      capabilityKey: 'admin.knowledge'
    }
  },
  {
    path: '/knowledge/:knowledgeId',
    name: 'admin.knowledge.detail',
    component: KnowledgeDetailPage,
    meta: {
      module: 'knowledge',
      navKey: 'knowledge',
      pageTitle: '知识详情',
      implementationGate: 'shellImplemented',
      routePermissionAlias: provisionalPermissionAlias('admin.knowledge.route'),
      capabilityKey: 'admin.knowledge.detail'
    }
  },
  {
    path: '/system',
    name: 'admin.system.redirect',
    component: SystemUsersPage,
    meta: {
      module: 'system',
      navKey: 'system',
      pageTitle: '系统管理',
      implementationGate: 'shellImplemented',
      routePermissionAlias: provisionalPermissionAlias('admin.system.route')
    }
  },
  {
    path: '/system/users',
    name: 'admin.system.users',
    component: SystemUsersPage,
    meta: {
      module: 'system',
      navKey: 'system',
      systemSubKey: 'users',
      pageTitle: '用户与权限',
      implementationGate: 'shellImplemented',
      menuPermissionAlias: provisionalPermissionAlias('admin.system.users.menu'),
      routePermissionAlias: provisionalPermissionAlias('admin.system.users.route'),
      capabilityKey: 'admin.system.users'
    }
  },
  {
    path: '/system/audit',
    name: 'admin.system.audit',
    component: SystemAuditPage,
    meta: {
      module: 'system',
      navKey: 'system',
      systemSubKey: 'audit',
      pageTitle: '审计日志',
      implementationGate: 'shellImplemented',
      menuPermissionAlias: provisionalPermissionAlias('admin.system.audit.menu'),
      routePermissionAlias: provisionalPermissionAlias('admin.system.audit.route'),
      capabilityKey: 'admin.system.audit',
      sensitiveSurface: true
    }
  },
  {
    path: '/system/feedback',
    name: 'admin.system.feedback',
    component: SystemFeedbackPage,
    meta: {
      module: 'system',
      navKey: 'system',
      systemSubKey: 'feedback',
      pageTitle: '反馈管理',
      implementationGate: 'prototype',
      menuPermissionAlias: provisionalPermissionAlias('admin.system.feedback.menu'),
      routePermissionAlias: provisionalPermissionAlias('admin.system.feedback.route'),
      capabilityKey: 'admin.system.feedback'
    }
  },
  {
    path: '/permission-denied',
    name: 'admin.permissionDenied',
    component: PermissionDeniedPage,
    meta: {
      module: 'system',
      navKey: 'permission-denied',
      pageTitle: '权限不足',
      implementationGate: 'shellImplemented'
    }
  },
  {
    path: '*',
    name: 'admin.notFound',
    component: NotFoundPage,
    meta: {
      module: 'system',
      navKey: 'not-found',
      pageTitle: '页面不存在',
      implementationGate: 'shellImplemented'
    }
  }
] as const;

export function createRouter(permissionProjection: PermissionProjection): Router {
  const router = new Router({
    mode: 'hash',
    routes: routes as unknown as RouteConfig[]
  });

  router.beforeEach((to, _from, next) => {
    if (to.path === '/system') {
      next(getSystemRedirectPath(permissionProjection));
      return;
    }

    const meta = to.meta as AdminRouteMeta | undefined;
    if (meta === undefined || to.path === '/login' || to.path === '/permission-denied') {
      next();
      return;
    }

    const decision = canAccessRoute(meta, permissionProjection);
    if (decision.kind === 'allowed') {
      next();
      return;
    }
    if (decision.kind === 'loginRequired') {
      next('/login');
      return;
    }
    next('/permission-denied');
  });

  return router;
}
