import { describe, expect, it } from 'vitest';
import { presentCapability } from '../../src/app/capability-projection';
import { presentButton, presentOperationGate, presentPagination, presentSecretStatus } from '../../src/presentation/admin-ui-presentation';
import { presentPageState } from '../../src/presentation/page-state-presentation';
import { presentUnknownError } from '../../src/presentation/safe-error-presentation';
import { nonProductionNotice, presentDetail, presentInventoryError, presentInventoryItem, presentInventoryNotices } from '../../src/presentation/read-only-inventory';
const revision = `sha256:${'a'.repeat(64)}`;
describe('Admin presentation functions', () => {
    it('covers all capability states with explicit labels', () => {
        const states = ['ready', 'unavailable', 'gated', 'partial'];
        const labels = states.map((state) => presentCapability({ capabilityKey: state, state }).label);
        expect(labels).toEqual(['可用', '暂不可用', '待接入', '部分可用']);
    });
    it('covers all page states with safe summaries', () => {
        const statuses = [
            'loading',
            'empty',
            'ready',
            'unavailable',
            'permissionDenied',
            'notFound',
            'stale',
            'error',
            'disabled',
            'partial',
            'gated'
        ];
        for (const status of statuses) {
            const presentation = presentPageState(status);
            expect(presentation.title.length).toBeGreaterThan(0);
            expect(presentation.message).not.toContain('{');
        }
    });
    it('does not expose unknown error object fields', () => {
        const summary = presentUnknownError({
            code: 'unknown',
            retryable: true,
            correlationId: 'corr-admin-1'
        });
        expect(summary.message).toBe('当前请求可以稍后重试');
        expect(JSON.stringify(summary)).not.toContain('unknown');
    });
    it('covers secret status with enum-only labels', () => {
        const statuses = ['configured', 'missing', 'unavailable'];
        const labels = statuses.map((status) => presentSecretStatus(status).label);
        expect(labels).toEqual(['已配置', '未配置', '暂不可用']);
        expect(JSON.stringify(labels)).not.toContain('cred_');
    });
    it('keeps button and operation presentation safe', () => {
        expect(presentButton({
            variant: 'primary',
            size: 'md',
            disabled: false,
            loading: true
        })).toMatchObject({
            disabled: true,
            ariaBusy: 'true'
        });
        expect(presentOperationGate({ allowed: false, disabledReason: '待接入' })).toEqual({
            showAction: true,
            disabled: true,
            reason: '待接入'
        });
    });
    it('presents pagination without creating cursor semantics', () => {
        expect(presentPagination({ page: 1, pageSize: 20, total: 0 })).toEqual({
            page: 1,
            pageSize: 20,
            total: 0,
            canGoPrevious: false,
            canGoNext: false,
            summary: '第 1 页 / 共 1 页'
        });
    });
    it('presents six read-only inventory modules with Chinese business labels', () => {
        const rows = [
            presentInventoryItem('models', modelDetail),
            presentInventoryItem('robots', robotDetail),
            presentInventoryItem('skills', skillDetail),
            presentInventoryItem('tools', toolDetail),
            presentInventoryItem('knowledge', knowledgeDetail),
            presentInventoryItem('audit', {
                auditEventId: '00000000-0000-4000-8000-000000000001',
                auditRevision: revision,
                occurredAt: '2026-08-27T00:00:00.000Z',
                actorSummary: '测试管理员',
                actionSummary: '读取模型目录',
                result: 'allowed'
            })
        ];
        expect(rows.map((row) => row.title)).toEqual(['通用模型', '业务机器人', '文档技能', '业务查询工具', '制度知识库', '读取模型目录']);
        expect(JSON.stringify(rows)).toContain('供应方');
        expect(JSON.stringify(rows)).toContain('已限制范围');
        expect(JSON.stringify(rows)).toContain('检索能力');
        expect(nonProductionNotice).toContain('测试身份');
    });
    it('presents detail sections without raw technical or sensitive fields', () => {
        const details = [
            presentDetail('models', modelDetail),
            presentDetail('robots', robotDetail),
            presentDetail('skills', skillDetail),
            presentDetail('tools', toolDetail),
            presentDetail('knowledge', knowledgeDetail)
        ];
        const serialized = JSON.stringify(details);
        expect(serialized).toContain('供应方');
        expect(serialized).toContain('资源限制');
        expect(serialized).toContain('常规文件读取');
        expect(serialized).not.toContain('Provider');
        expect(serialized).not.toContain('Credential Reference');
        expect(serialized).not.toContain(['Capability', 'Lock'].join(''));
        expect(serialized).not.toContain(['Bear', 'er'].join(''));
        expect(serialized).not.toContain('requestDigest');
        expect(serialized).not.toContain('stack');
        expect(serialized).not.toContain(['End', 'point'].join(''));
    });
    it('maps read-only inventory errors to safe states and keeps pagination rows', () => {
        expect(presentInventoryError({ code: 'permission_denied', message: 'secret stack' }, 'list')).toMatchObject({ status: 'permissionDenied', keepRows: false });
        expect(presentInventoryError({ code: 'not_found', message: 'missing' }, 'detail')).toMatchObject({ status: 'notFound', keepRows: false });
        expect(presentInventoryError({ code: 'stale_cursor', message: 'stale' }, 'pagination')).toMatchObject({ status: 'stale', keepRows: true });
        expect(presentInventoryError({ code: 'service_unavailable', message: '服务维护' }, 'detail')).toMatchObject({ status: 'unavailable', keepRows: false });
        expect(JSON.stringify(presentInventoryError({ code: 'unknown', message: 'raw stack /Users/example' }, 'list'))).not.toContain('/Users/example');
    });
    it('summarizes partial and gated inventory rows without guessing missing fields', () => {
        const notices = presentInventoryNotices([
            presentInventoryItem('knowledge', { ...knowledgeDetail, state: 'partial' }),
            presentInventoryItem('tools', { ...toolDetail, policyState: 'gated' })
        ]);
        expect(notices).toEqual([
            '部分记录只有有限字段可展示，页面不会猜测缺失信息。',
            '部分能力仍待接入或暂不可用，当前仅展示已投影事实。'
        ]);
    });
});
const modelDetail = {
    modelId: 'model.general',
    modelRevision: revision,
    displayName: '通用模型',
    providerLabel: '企业模型服务',
    lifecycle: 'published',
    credentialStatus: 'configured',
    safeSummary: '用于常规任务处理',
    contextWindowState: 'known',
    defaultForNewTasks: true
};
const robotDetail = {
    robotId: 'robot.business',
    publishedRobotRevision: revision,
    displayName: '业务机器人',
    description: '处理日常业务问题',
    source: 'enterprise_published',
    lifecycle: 'published',
    restrictionSummary: {
        models: 'restricted_nonempty',
        skills: 'unrestricted',
        tools: 'restricted_empty',
        knowledge: 'unrestricted'
    },
    reviewState: 'approved',
    policyState: 'configured'
};
const skillDetail = {
    skillId: 'skill.document',
    skillRevision: revision,
    displayName: '文档技能',
    description: '整理文档摘要',
    lifecycle: 'published',
    packageValidationState: 'valid',
    validationSummary: '校验摘要可用'
};
const toolDetail = {
    toolId: 'tool.business.query',
    toolDefinitionRevision: revision,
    displayName: '业务查询工具',
    description: '读取经过授权的业务摘要',
    source: 'enterprise_package',
    lifecycle: 'published',
    readOnly: true,
    riskSummary: ['routine_file'],
    policyState: 'configured',
    connectionState: 'gated',
    credentialStatus: 'unavailable',
    healthState: 'unavailable',
    inputSummary: '结构化查询条件',
    outputSummary: '安全业务摘要'
};
const knowledgeDetail = {
    knowledgeId: 'knowledge.policy',
    knowledgeRevision: revision,
    displayName: '制度知识库',
    safeSummary: '提供制度摘要投影',
    state: 'ready',
    retrievalState: 'gated'
};
