import { describe, expect, it } from 'vitest';
import { permissionProjectionFromCapabilities } from '../../src/app/integration-bootstrap';
describe('integration capability bootstrap', () => {
    it('maps only read-ready and partial capabilities and never grants operations', () => {
        const projection = permissionProjectionFromCapabilities({
            capabilitySetRevision: 'test', testIdentityUsed: true, productionIdentityReady: false,
            capabilities: [
                { capabilityKey: 'admin.model.read', state: 'ready' },
                { capabilityKey: 'admin.tool.read', state: 'partial' },
                { capabilityKey: 'admin.robot.read', state: 'gated' },
                { capabilityKey: 'admin.model.write', state: 'ready' }
            ]
        });
        expect([...projection.routeAliases]).toEqual(['admin.models.route', 'admin.tools.route']);
        expect([...projection.visibleMenuAliases]).toEqual(['admin.models.menu', 'admin.tools.menu']);
        expect(projection.operationAliases.size).toBe(0);
    });
});
