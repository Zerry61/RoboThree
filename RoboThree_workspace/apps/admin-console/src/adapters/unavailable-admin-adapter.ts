import type { AdminAdapter } from './admin-adapter';
import type { CapabilityProjection } from '../app/route-meta';

export function createUnavailableAdminAdapter(): AdminAdapter {
  return {
    async getCapability(capabilityKey: string): Promise<CapabilityProjection> {
      return {
        capabilityKey,
        state: 'unavailable',
        safeReason: '真实管理能力待接入'
      };
    }
  };
}
