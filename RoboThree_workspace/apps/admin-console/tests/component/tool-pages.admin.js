import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ToolDetailPage from '../../src/pages/tools/ToolDetailPage.vue';
import ToolsPage from '../../src/pages/tools/ToolsPage.vue';
import { installAdminAdapter } from '../../src/app/admin-runtime';
import { createUnavailableAdminAdapter } from '../../src/adapters/unavailable-admin-adapter';
import { AdminApiError } from '../../src/adapters/admin-api-error';
const revision = `sha256:${'a'.repeat(64)}`;
const toolSummary = {
    toolId: 'tool.business.query',
    toolDefinitionRevision: revision,
    displayName: '业务系统查询',
    description: '读取经过授权的业务摘要',
    source: 'enterprise_package',
    lifecycle: 'published',
    readOnly: true,
    riskSummary: ['routine_file'],
    policyState: 'configured',
    connectionState: 'gated',
    credentialStatus: 'unavailable',
    healthState: 'unavailable'
};
async function flushAsync() {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}
function installToolAdapter(overrides = {}) {
    installAdminAdapter({
        ...createUnavailableAdminAdapter(),
        async listTools() {
            return page([toolSummary]);
        },
        async getTool() {
            return { ...toolSummary, inputSummary: '结构化查询条件', outputSummary: '安全业务摘要' };
        },
        ...overrides
    });
}
function page(items, nextCursor) {
    return nextCursor === undefined
        ? { contractVersion: 'admin-control.v1alpha1', queryRevision: revision, items: [...items] }
        : { contractVersion: 'admin-control.v1alpha1', queryRevision: revision, items: [...items], nextCursor };
}
const forbiddenBusinessSuccessText = ['创建成功', '保存成功', '发布成功', '安装成功', '测试成功', '同步成功'];
const forbiddenSensitiveText = [
    ['API', ' Key'].join(''),
    ['Credential', ' Reference'].join(''),
    ['End', 'point'].join(''),
    ['To', 'ken'].join(''),
    ['Bear', 'er'].join(''),
    ['Capability', 'Lock'].join('')
];
function expectNoForbiddenText(text) {
    for (const fragment of [...forbiddenBusinessSuccessText, ...forbiddenSensitiveText]) {
        expect(text).not.toContain(fragment);
    }
}
describe('Admin Tool read-only pages', () => {
    it('renders the real read-only Tool projection without prototype fallback', async () => {
        installToolAdapter();
        const wrapper = mount(ToolsPage);
        await flushAsync();
        const text = wrapper.text();
        expect(text).toContain('工具目录');
        expect(text).toContain('测试身份 / 非生产环境');
        expect(text).toContain('业务系统查询');
        expect(text).toContain('读取经过授权的业务摘要');
        expect(text).toContain('企业工具包');
        expect(text).toContain('待接入');
        expect(text).not.toContain('文档内容读取');
        expect(wrapper.findAll('tbody tr')).toHaveLength(1);
        expectNoForbiddenText(text);
    });
    it('renders Tool detail from the adapter without leaking sensitive fields', async () => {
        installToolAdapter();
        const wrapper = mount(ToolDetailPage, {
            mocks: {
                $route: {
                    params: {
                        toolId: 'tool.business.query'
                    }
                }
            }
        });
        await flushAsync();
        const text = wrapper.text();
        expect(text).toContain('业务系统查询详情');
        expect(text).toContain('治理状态');
        expect(text).toContain('常规文件读取');
        expect(text).toContain('安全业务摘要');
        expect(wrapper.findAll('button')).toHaveLength(0);
        expectNoForbiddenText(text);
    });
    it('keeps already loaded rows when stale pagination fails', async () => {
        installToolAdapter({
            async listTools(options) {
                if (options?.cursor !== undefined) {
                    throw new AdminApiError('stale_cursor', 'cursor expired', 'corr-stale');
                }
                return page([toolSummary], 'opaque-cursor');
            }
        });
        const wrapper = mount(ToolsPage);
        await flushAsync();
        await wrapper.find('button').trigger('click');
        await flushAsync();
        const text = wrapper.text();
        expect(text).toContain('业务系统查询');
        expect(text).toContain('列表或详情状态已变化，请重新加载。');
        expect(text).not.toContain('opaque-cursor');
        expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    });
    it('renders permission, missing detail and unavailable errors as safe states', async () => {
        installToolAdapter({
            async listTools() {
                throw new AdminApiError('permission_denied', 'raw stack /Users/example', 'corr-denied');
            }
        });
        const denied = mount(ToolsPage);
        await flushAsync();
        expect(denied.text()).toContain('权限不足');
        expect(denied.text()).not.toContain('/Users/example');
        installToolAdapter({
            async getTool() {
                throw new AdminApiError('not_found', 'missing raw', 'corr-missing');
            }
        });
        const missing = mount(ToolDetailPage, {
            mocks: { $route: { params: { toolId: 'tool.missing' } } }
        });
        await flushAsync();
        expect(missing.text()).toContain('未找到记录');
        expect(missing.text()).not.toContain('暂无数据');
        installToolAdapter({
            async getTool() {
                throw new AdminApiError('service_unavailable', '服务维护', 'corr-down');
            }
        });
        const unavailable = mount(ToolDetailPage, {
            mocks: { $route: { params: { toolId: 'tool.down' } } }
        });
        await flushAsync();
        expect(unavailable.text()).toContain('服务暂不可用');
        expect(unavailable.text()).toContain('管理服务暂不可用，请稍后重试。');
        expect(unavailable.text()).not.toContain('服务维护');
        expectNoForbiddenText(unavailable.text());
    });
});
