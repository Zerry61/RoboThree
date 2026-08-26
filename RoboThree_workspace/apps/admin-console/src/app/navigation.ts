import { canShowMenu } from './permission-shell';
import { provisionalPermissionAlias } from './route-meta';
import type { PermissionProjection } from './permission-shell';
import type { AdminModule, ProvisionalPermissionAlias, SystemSubKey } from './route-meta';

export type PrimaryNavigationItem = Readonly<{
  key: AdminModule;
  label: string;
  path: string;
  menuPermissionAlias: ProvisionalPermissionAlias;
}>;

export type SystemNavigationItem = Readonly<{
  key: SystemSubKey;
  label: string;
  path: string;
  menuPermissionAlias: ProvisionalPermissionAlias;
}>;

export const adminNavigation = [
  {
    key: 'models',
    label: '模型管理',
    path: '/models',
    menuPermissionAlias: provisionalPermissionAlias('admin.models.menu')
  },
  {
    key: 'tools',
    label: '工具管理',
    path: '/tools',
    menuPermissionAlias: provisionalPermissionAlias('admin.tools.menu')
  },
  {
    key: 'robots',
    label: '机器人管理',
    path: '/robots',
    menuPermissionAlias: provisionalPermissionAlias('admin.robots.menu')
  },
  {
    key: 'skills',
    label: '技能管理',
    path: '/skills',
    menuPermissionAlias: provisionalPermissionAlias('admin.skills.menu')
  },
  {
    key: 'knowledge',
    label: '知识管理',
    path: '/knowledge',
    menuPermissionAlias: provisionalPermissionAlias('admin.knowledge.menu')
  },
  {
    key: 'system',
    label: '系统管理',
    path: '/system',
    menuPermissionAlias: provisionalPermissionAlias('admin.system.menu')
  }
] as const satisfies readonly PrimaryNavigationItem[];

export const systemNavigation = [
  {
    key: 'users',
    label: '用户与权限',
    path: '/system/users',
    menuPermissionAlias: provisionalPermissionAlias('admin.system.users.menu')
  },
  {
    key: 'audit',
    label: '审计日志',
    path: '/system/audit',
    menuPermissionAlias: provisionalPermissionAlias('admin.system.audit.menu')
  },
  {
    key: 'feedback',
    label: '反馈管理',
    path: '/system/feedback',
    menuPermissionAlias: provisionalPermissionAlias('admin.system.feedback.menu')
  }
] as const satisfies readonly SystemNavigationItem[];

export function getVisibleSystemNavigation(projection: PermissionProjection): readonly SystemNavigationItem[] {
  return systemNavigation.filter((item) => canShowMenu(item.menuPermissionAlias, projection));
}

export function getVisiblePrimaryNavigation(projection: PermissionProjection): readonly PrimaryNavigationItem[] {
  return adminNavigation.filter((item) => {
    if (item.key === 'system') {
      return getVisibleSystemNavigation(projection).length > 0;
    }
    return canShowMenu(item.menuPermissionAlias, projection);
  });
}

export function getSystemRedirectPath(projection: PermissionProjection): string {
  return getVisibleSystemNavigation(projection)[0]?.path ?? '/permission-denied';
}
