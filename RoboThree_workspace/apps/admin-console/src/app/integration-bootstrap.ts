import type { AdminCapabilitySet } from '../adapters/admin-adapter';
import { createPermissionProjection } from './permission-shell';
import { provisionalPermissionAlias } from './route-meta';
import type { PermissionProjection } from './permission-shell';

const aliasesByCapability = {
  'admin.model.read': ['admin.models.menu', 'admin.models.route'],
  'admin.robot.read': ['admin.robots.menu', 'admin.robots.route'],
  'admin.robot.write': ['admin.robots.menu', 'admin.robots.route', 'admin.robots.operate'],
  'admin.skill.read': ['admin.skills.menu', 'admin.skills.route'],
  'admin.tool.read': ['admin.tools.menu', 'admin.tools.route'],
  'admin.knowledge.read': ['admin.knowledge.menu', 'admin.knowledge.route'],
  'admin.system.audit.read': ['admin.system.audit.menu', 'admin.system.audit.route']
} as const;

export function permissionProjectionFromCapabilities(capabilitySet: AdminCapabilitySet): PermissionProjection {
  if (!capabilitySet.testIdentityUsed || capabilitySet.productionIdentityReady) {
    return createPermissionProjection({ authenticated: false });
  }
  const visibleMenuAliases: ReturnType<typeof provisionalPermissionAlias>[] = [];
  const routeAliases: ReturnType<typeof provisionalPermissionAlias>[] = [];
  const operationAliases: ReturnType<typeof provisionalPermissionAlias>[] = [];
  for (const capability of capabilitySet.capabilities) {
    if (capability.state !== 'ready' && capability.state !== 'partial') continue;
    const aliases = aliasesByCapability[capability.capabilityKey as keyof typeof aliasesByCapability];
    if (aliases === undefined) continue;
    visibleMenuAliases.push(provisionalPermissionAlias(aliases[0]));
    routeAliases.push(provisionalPermissionAlias(aliases[1]));
    if (aliases.length > 2 && aliases[2] !== undefined) operationAliases.push(provisionalPermissionAlias(aliases[2]));
  }
  return createPermissionProjection({ authenticated: true, visibleMenuAliases, routeAliases, operationAliases });
}
