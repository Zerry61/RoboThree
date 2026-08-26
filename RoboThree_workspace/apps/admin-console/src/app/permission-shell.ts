import type { AdminRouteMeta, ProvisionalPermissionAlias } from './route-meta';

export type PermissionProjection = Readonly<{
  authenticated: boolean;
  visibleMenuAliases: ReadonlySet<ProvisionalPermissionAlias>;
  routeAliases: ReadonlySet<ProvisionalPermissionAlias>;
  operationAliases: ReadonlySet<ProvisionalPermissionAlias>;
}>;

export type RouteAccessDecision =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'loginRequired' }>
  | Readonly<{ kind: 'permissionDenied'; safeReason: string }>;

export function createPermissionProjection(input: {
  authenticated: boolean;
  visibleMenuAliases?: readonly ProvisionalPermissionAlias[];
  routeAliases?: readonly ProvisionalPermissionAlias[];
  operationAliases?: readonly ProvisionalPermissionAlias[];
}): PermissionProjection {
  return {
    authenticated: input.authenticated,
    visibleMenuAliases: new Set(input.visibleMenuAliases ?? []),
    routeAliases: new Set(input.routeAliases ?? []),
    operationAliases: new Set(input.operationAliases ?? [])
  };
}

export function createUnavailablePermissionProjection(): PermissionProjection {
  return createPermissionProjection({
    authenticated: true
  });
}

export function canShowMenu(
  alias: ProvisionalPermissionAlias | undefined,
  projection: PermissionProjection
): boolean {
  return alias === undefined || projection.visibleMenuAliases.has(alias);
}

export function canAccessRoute(meta: AdminRouteMeta, projection: PermissionProjection): RouteAccessDecision {
  if (!projection.authenticated) {
    return { kind: 'loginRequired' };
  }

  if (meta.routePermissionAlias === undefined || projection.routeAliases.has(meta.routePermissionAlias)) {
    return { kind: 'allowed' };
  }

  return {
    kind: 'permissionDenied',
    safeReason: '当前账号没有访问该页面的权限'
  };
}

export function canUseOperation(
  alias: ProvisionalPermissionAlias | undefined,
  projection: PermissionProjection
): boolean {
  return alias === undefined || projection.operationAliases.has(alias);
}
