export type AdminModule = 'models' | 'tools' | 'robots' | 'skills' | 'knowledge' | 'system';
export type AdminNavKey = AdminModule;
export type SystemSubKey = 'users' | 'audit' | 'feedback';
export type ImplementationGate = 'planned' | 'prototype' | 'shellImplemented';
export type CapabilityState = 'ready' | 'unavailable' | 'gated' | 'partial';

export type ProvisionalPermissionAlias = string & {
  readonly __provisionalPermissionAlias: unique symbol;
};

export type AdminRouteMeta = Readonly<{
  module: AdminModule;
  navKey: AdminNavKey | 'not-found' | 'login' | 'permission-denied';
  pageTitle: string;
  implementationGate: ImplementationGate;
  routePermissionAlias?: ProvisionalPermissionAlias;
  menuPermissionAlias?: ProvisionalPermissionAlias;
  operationPermissionAlias?: ProvisionalPermissionAlias;
  systemSubKey?: SystemSubKey;
  capabilityKey?: string;
  sensitiveSurface?: boolean;
}>;

export type CapabilityProjection = Readonly<{
  capabilityKey: string;
  state: CapabilityState;
  safeReason?: string;
}>;

export function provisionalPermissionAlias(value: string): ProvisionalPermissionAlias {
  return value as ProvisionalPermissionAlias;
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
