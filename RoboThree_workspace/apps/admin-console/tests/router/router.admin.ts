import { describe, expect, it } from 'vitest';
import { adminNavigation, getVisiblePrimaryNavigation, getSystemRedirectPath, systemNavigation } from '../../src/app/navigation';
import { createPermissionProjection, canAccessRoute, canUseOperation } from '../../src/app/permission-shell';
import { createRouter, routes } from '../../src/app/router';
import { provisionalPermissionAlias } from '../../src/app/route-meta';
import type { AdminRouteMeta } from '../../src/app/route-meta';

async function pushPath(router: ReturnType<typeof createRouter>, path: string): Promise<void> {
  await router.push(path).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Admin router shell', () => {
  it('defines six primary modules and three system children without a system overview page', () => {
    expect(adminNavigation.map((item) => item.label)).toEqual([
      '模型管理',
      '工具管理',
      '机器人管理',
      '技能管理',
      '知识管理',
      '系统管理'
    ]);
    expect(systemNavigation.map((item) => item.label)).toEqual(['用户与权限', '审计日志', '反馈管理']);
    expect(routes.some((route) => route.path === '/system' && route.name === 'admin.system.redirect')).toBe(true);
    expect(routes.some((route) => route.path === '/system/overview')).toBe(false);
  });

  it('redirects system to the first visible system child', () => {
    const projection = createPermissionProjection({
      authenticated: true,
      visibleMenuAliases: [systemNavigation[1].menuPermissionAlias]
    });

    expect(getSystemRedirectPath(projection)).toBe('/system/audit');
  });

  it('keeps menu visibility separate from route access', async () => {
    const toolsRoute = routes.find((route) => route.path === '/tools');
    const toolsMeta = toolsRoute?.meta as AdminRouteMeta;
    const projection = createPermissionProjection({
      authenticated: true,
      routeAliases: [toolsMeta.routePermissionAlias ?? provisionalPermissionAlias('missing')]
    });

    expect(getVisiblePrimaryNavigation(projection).some((item) => item.key === 'tools')).toBe(false);
    expect(canAccessRoute(toolsMeta, projection).kind).toBe('allowed');

    const router = createRouter(projection);
    await pushPath(router, '/tools');
    expect(router.currentRoute.path).toBe('/tools');
  });

  it('keeps operation permission separate from route access', () => {
    const routeAlias = provisionalPermissionAlias('admin.models.route');
    const operationAlias = provisionalPermissionAlias('admin.models.operate');
    const projection = createPermissionProjection({
      authenticated: true,
      routeAliases: [routeAlias],
      operationAliases: []
    });
    const meta: AdminRouteMeta = {
      module: 'models',
      navKey: 'models',
      pageTitle: '模型管理',
      implementationGate: 'shellImplemented',
      routePermissionAlias: routeAlias,
      operationPermissionAlias: operationAlias
    };

    expect(canAccessRoute(meta, projection).kind).toBe('allowed');
    expect(canUseOperation(operationAlias, projection)).toBe(false);
  });

  it('registers Tool management child shells as prototype-gated sensitive routes', () => {
    const childRoutes = routes.filter((route) =>
      ['/tools/new/api', '/tools/new/mcp', '/tools/:toolId/policy'].includes(route.path)
    );

    expect(childRoutes.map((route) => route.name)).toEqual([
      'admin.tools.newApi',
      'admin.tools.newMcp',
      'admin.tools.policy'
    ]);
    for (const route of childRoutes) {
      expect(route.meta).toMatchObject({
        module: 'tools',
        navKey: 'tools',
        implementationGate: 'prototype',
        sensitiveSurface: true
      });
      expect(route.meta.routePermissionAlias).toEqual(provisionalPermissionAlias('admin.tools.route'));
      expect(route.meta.operationPermissionAlias).toEqual(provisionalPermissionAlias('admin.tools.operate'));
    }
  });

  it('routes unauthenticated users to the login shell and denied users to permission denied', async () => {
    const unauthenticated = createRouter(
      createPermissionProjection({
        authenticated: false
      })
    );
    await pushPath(unauthenticated, '/models');
    expect(unauthenticated.currentRoute.path).toBe('/login');

    const denied = createRouter(
      createPermissionProjection({
        authenticated: true
      })
    );
    await pushPath(denied, '/models');
    expect(denied.currentRoute.path).toBe('/permission-denied');
  });
});
