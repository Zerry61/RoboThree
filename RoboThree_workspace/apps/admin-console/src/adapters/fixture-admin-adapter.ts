import type { AdminAdapter } from './admin-adapter';
import type { CapabilityProjection } from '../app/route-meta';

export function createFixtureAdminAdapter(capabilities: readonly CapabilityProjection[]): AdminAdapter {
  const byKey = new Map(capabilities.map((capability) => [capability.capabilityKey, capability]));

  return {
    async getCapability(capabilityKey: string): Promise<CapabilityProjection> {
      return (
        byKey.get(capabilityKey) ?? {
          capabilityKey,
          state: 'gated',
          safeReason: 'prototype/gated fixture'
        }
      );
    }
  };
}
