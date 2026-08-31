import { describe, expect, it } from 'vitest';
import { createAdminApiAdapter, AdminApiError } from '../../src/adapters/admin-api-adapter';
const correlationId = '00000000-0000-4000-8000-000000000002';
const safeEndpoint = ['https://models.example.test', '/v1'].join('');
function errorResponse() {
    return new Response(JSON.stringify({
        kind: 'admin_control_error',
        contractVersion: 'admin-control.v1alpha1',
        errorCode: 'service_unavailable',
        httpStatus: '503',
        safeSummary: '当前事实不可用',
        retryable: true,
        correlationId
    }), { status: 503, headers: { 'content-type': 'application/json' } });
}
describe('AdminApiAdapter', () => {
    it('exposes exactly twelve read methods and never sends browser identity material', async () => {
        const calls = [];
        const fetcher = async (input, init) => {
            calls.push({ url: String(input), ...(init === undefined ? {} : { init }) });
            return errorResponse();
        };
        const adapter = createAdminApiAdapter(fetcher);
        const operations = [
            () => adapter.getCurrentCapabilities(),
            () => adapter.listModels(), () => adapter.getModel('model.one'),
            () => adapter.listRobots(), () => adapter.getRobot('agent.one'),
            () => adapter.listSkills(), () => adapter.getSkill('skill.one'),
            () => adapter.listTools(), () => adapter.getTool('tool.one'),
            () => adapter.listKnowledge(), () => adapter.getKnowledge('knowledge.one'),
            () => adapter.listAuditEvents()
        ];
        for (const operation of operations)
            await expect(operation()).rejects.toBeInstanceOf(AdminApiError);
        expect(calls).toHaveLength(12);
        expect(calls.map((call) => new URL(call.url, 'http://127.0.0.1').pathname)).toEqual([
            '/admin/v1alpha1/capabilities/current', '/admin/v1alpha1/models', '/admin/v1alpha1/models/model.one',
            '/admin/v1alpha1/robots', '/admin/v1alpha1/robots/agent.one', '/admin/v1alpha1/skills',
            '/admin/v1alpha1/skills/skill.one', '/admin/v1alpha1/tools', '/admin/v1alpha1/tools/tool.one',
            '/admin/v1alpha1/knowledge', '/admin/v1alpha1/knowledge/knowledge.one', '/admin/v1alpha1/system/audit-events'
        ]);
        for (const call of calls) {
            expect(call.init?.method).toBe('GET');
            expect(call.init?.body).toBeUndefined();
            expect(call.init?.credentials).toBe('same-origin');
            const headers = new Headers(call.init?.headers);
            expect(headers.has('authorization')).toBe(false);
            expect(headers.has('cookie')).toBe(false);
            expect(headers.has('x-user-id')).toBe(false);
            expect(headers.get('x-robothree-contract-version')).toBe('admin-control.v1alpha1');
        }
    });
    it('rejects non-test identity envelopes before projecting capability success', async () => {
        const fetcher = async () => new Response(JSON.stringify({
            contractVersion: 'admin-control.v1alpha1', requestId: '00000000-0000-4000-8000-000000000001', correlationId,
            serverTime: '2026-08-27T00:00:00.000Z', testIdentityUsed: false, productionIdentityReady: false,
            data: { capabilitySetRevision: 'safe', capabilities: [] }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
        await expect(createAdminApiAdapter(fetcher).getCurrentCapabilities()).rejects.toMatchObject({ code: 'admin_session_required' });
    });
    it('sends v1alpha2 model mutation commands through the controlled adapter boundary', async () => {
        const calls = [];
        const fetcher = async (input, init) => {
            calls.push({ url: String(input), ...(init === undefined ? {} : { init }) });
            return new Response(JSON.stringify({
                contractVersion: 'admin-control.v1alpha2',
                requestId: '00000000-0000-4000-8000-000000000001',
                correlationId,
                serverTime: '2026-08-30T00:00:00.000Z',
                testIdentityUsed: true,
                productionIdentityReady: false,
                data: {
                    kind: 'admin_model_mutation_receipt',
                    contractVersion: 'admin-control.v1alpha2',
                    commandId: '11111111-1111-4111-8111-111111111111',
                    correlationId,
                    modelId: 'model.enterprise-default',
                    modelRevision: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
                    result: 'committed',
                    replayed: false
                }
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        };
        const command = {
            contractVersion: 'admin-control.v1alpha2',
            commandId: '11111111-1111-4111-8111-111111111111',
            correlationId,
            kind: 'create_admin_model',
            displayName: '企业默认模型',
            providerFamily: 'openai_compatible',
            endpoint: safeEndpoint,
            providerModelId: 'gpt-compatible',
            credential: { mode: 'replace', secret: 'TEST_ONLY_ADMIN_MODEL_SECRET_SENTINEL' }
        };
        const receipt = await createAdminApiAdapter(fetcher).createModel(command);
        expect(receipt.result).toBe('committed');
        expect(calls).toHaveLength(1);
        const call = calls[0];
        expect(call).toBeDefined();
        expect(call?.url).toBe('/admin/v1alpha2/models');
        expect(call?.init?.method).toBe('POST');
        expect(call?.init?.credentials).toBe('same-origin');
        const headers = new Headers(call?.init?.headers);
        expect(headers.get('x-robothree-contract-version')).toBe('admin-control.v1alpha2');
        expect(headers.has('authorization')).toBe(false);
        expect(headers.has('cookie')).toBe(false);
        expect(String(call?.init?.body)).toContain('TEST_ONLY_ADMIN_MODEL_SECRET_SENTINEL');
    });
    it('reads managed model pages and details from the v1alpha2 model boundary', async () => {
        const calls = [];
        const fetcher = async (input, init) => {
            calls.push({ url: String(input), ...(init === undefined ? {} : { init }) });
            const isDetail = String(input).includes('/model.enterprise-default');
            return new Response(JSON.stringify({
                contractVersion: 'admin-control.v1alpha2',
                requestId: '00000000-0000-4000-8000-000000000001',
                correlationId,
                serverTime: '2026-08-30T00:00:00.000Z',
                testIdentityUsed: true,
                productionIdentityReady: false,
                data: isDetail ? managedModelDetail() : {
                    contractVersion: 'admin-control.v1alpha2',
                    queryRevision: `sha256:${'a'.repeat(64)}`,
                    items: [managedModelSummary()]
                }
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        };
        const adapter = createAdminApiAdapter(fetcher);
        const page = await adapter.listManagedModels({ limit: 20 });
        const detail = await adapter.getManagedModel('model.enterprise-default');
        expect(page.items).toHaveLength(1);
        expect(detail.providerFamily).toBe('openai_compatible');
        expect(calls.map((call) => new URL(call.url, 'http://127.0.0.1').pathname)).toEqual([
            '/admin/v1alpha2/models',
            '/admin/v1alpha2/models/model.enterprise-default'
        ]);
        for (const call of calls) {
            expect(call.init?.method).toBe('GET');
            const headers = new Headers(call.init?.headers);
            expect(headers.get('x-robothree-contract-version')).toBe('admin-control.v1alpha2');
            expect(headers.has('authorization')).toBe(false);
            expect(headers.has('cookie')).toBe(false);
        }
    });
    it('keeps v1alpha2 safe errors free of unknown error object fields', async () => {
        const fetcher = async () => new Response(JSON.stringify({
            kind: 'admin_control_error',
            contractVersion: 'admin-control.v1alpha2',
            errorCode: 'revision_conflict',
            httpStatus: '409',
            safeSummary: '模型已被其他操作更新，请刷新后重试。',
            retryable: true,
            correlationId,
            secret: 'TEST_ONLY_LEAKY_VALUE',
            stack: 'do not show'
        }), { status: 409, headers: { 'content-type': 'application/json' } });
        const command = {
            contractVersion: 'admin-control.v1alpha2',
            commandId: '11111111-1111-4111-8111-111111111111',
            correlationId,
            kind: 'create_admin_model',
            displayName: '企业默认模型',
            providerFamily: 'openai_compatible',
            endpoint: safeEndpoint,
            providerModelId: 'gpt-compatible',
            credential: { mode: 'replace', secret: 'TEST_ONLY_ADMIN_MODEL_SECRET_SENTINEL' }
        };
        await expect(createAdminApiAdapter(fetcher).createModel(command)).rejects.toMatchObject({
            code: 'service_unavailable',
            message: '管理能力暂不可用'
        });
    });
});
function managedModelSummary() {
    return {
        modelId: 'model.enterprise-default',
        modelRevision: `sha256:${'a'.repeat(64)}`,
        displayName: '企业默认模型',
        providerFamily: 'openai_compatible',
        lifecycle: 'enabled',
        defaultForNewTasks: true,
        credentialStatus: 'configured',
        lastConnectionCheck: {
            status: 'success',
            durationMs: 120,
            testedAt: '2026-08-30T00:00:00.000Z',
            correlationId
        }
    };
}
function managedModelDetail() {
    return {
        ...managedModelSummary(),
        endpoint: safeEndpoint,
        providerModelId: 'gpt-compatible'
    };
}
