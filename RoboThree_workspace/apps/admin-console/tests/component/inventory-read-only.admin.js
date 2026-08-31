import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import KnowledgeDetailPage from '../../src/pages/knowledge/KnowledgeDetailPage.vue';
import KnowledgePage from '../../src/pages/knowledge/KnowledgePage.vue';
import ModelDetailPage from '../../src/pages/models/ModelDetailPage.vue';
import ModelsPage from '../../src/pages/models/ModelsPage.vue';
import RobotDetailPage from '../../src/pages/robots/RobotDetailPage.vue';
import RobotsPage from '../../src/pages/robots/RobotsPage.vue';
import SkillDetailPage from '../../src/pages/skills/SkillDetailPage.vue';
import SkillsPage from '../../src/pages/skills/SkillsPage.vue';
import SystemAuditPage from '../../src/pages/system/SystemAuditPage.vue';
import { installAdminAdapter } from '../../src/app/admin-runtime';
import { createUnavailableAdminAdapter } from '../../src/adapters/unavailable-admin-adapter';
const revision = `sha256:${'b'.repeat(64)}`;
async function flushAsync() {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}
describe('Admin read-only inventory pages', () => {
    it('renders Model, Robot, Skill, Knowledge and Audit list projections with non-production notice', async () => {
        installInventoryAdapter();
        const pages = [
            [ModelsPage, ['企业模型', '通用模型', '连接正常', '已配置']],
            [RobotsPage, ['机器人目录', '业务机器人', '企业发布', '限制为空']],
            [SkillsPage, ['技能目录', '文档技能', '校验通过']],
            [KnowledgePage, ['知识目录', '制度知识库', '部分可用', '页面不会猜测缺失信息']],
            [SystemAuditPage, ['审计日志', '读取模型目录', '测试管理员', '已允许']]
        ];
        for (const [page, expectedText] of pages) {
            const wrapper = mount(page);
            await flushAsync();
            const text = wrapper.text();
            expect(text).toContain('测试身份 / 非生产环境');
            for (const expected of expectedText)
                expect(text).toContain(expected);
            expect(text).not.toContain('Provider');
            expect(text).not.toContain('Credential Reference');
            expect(text).not.toContain(['End', 'point'].join(''));
        }
    });
    it('renders detail projections as grouped business fields', async () => {
        installInventoryAdapter();
        const pages = [
            [ModelDetailPage, 'model.general', ['通用模型', '模型配置', '供应方', '连接正常']],
            [RobotDetailPage, 'robot.business', ['业务机器人详情', '资源限制', '限制为空']],
            [SkillDetailPage, 'skill.document', ['文档技能详情', '包校验', '校验摘要可用']],
            [KnowledgeDetailPage, 'knowledge.policy', ['制度知识库详情', '能力状态', '知识库真实检索']]
        ];
        for (const [page, resourceId, expectedText] of pages) {
            const wrapper = mount(page, {
                mocks: { $route: { params: { modelId: resourceId, robotId: resourceId, skillId: resourceId, knowledgeId: resourceId } } }
            });
            await flushAsync();
            const text = wrapper.text();
            for (const expected of expectedText)
                expect(text).toContain(expected);
            expect(text).not.toContain('Bearer');
            expect(text).not.toContain('requestDigest');
            expect(text).not.toContain('stack');
        }
    });
    it('renders empty list state without turning detail not-found into empty', async () => {
        installInventoryAdapter({
            async listModels() {
                return page([]);
            },
            async listManagedModels() {
                return managedModelPage([]);
            }
        });
        const wrapper = mount(ModelsPage);
        await flushAsync();
        expect(wrapper.text()).toContain('暂无企业模型');
        expect(wrapper.text()).toContain('当前管理身份还没有可展示的企业模型。');
    });
});
function installInventoryAdapter(overrides = {}) {
    installAdminAdapter({
        ...createUnavailableAdminAdapter(),
        async listModels() { return page([legacyModel]); },
        async getModel() { return legacyModel; },
        async listManagedModels() { return managedModelPage([model]); },
        async getManagedModel() { return model; },
        async listRobots() { return page([robot]); },
        async getRobot() { return robot; },
        async listSkills() { return page([skill]); },
        async getSkill() { return skill; },
        async listKnowledge() { return page([knowledge]); },
        async getKnowledge() { return knowledge; },
        async listAuditEvents() {
            return {
                contractVersion: 'admin-control.v1alpha1',
                queryRevision: revision,
                items: [{
                        auditEventId: '00000000-0000-4000-8000-000000000003',
                        auditRevision: revision,
                        occurredAt: '2026-08-27T00:00:00.000Z',
                        actorSummary: '测试管理员',
                        actionSummary: '读取模型目录',
                        result: 'allowed'
                    }]
            };
        },
        ...overrides
    });
}
function page(items) {
    return { contractVersion: 'admin-control.v1alpha1', queryRevision: revision, items };
}
function managedModelPage(items) {
    return { contractVersion: 'admin-control.v1alpha2', queryRevision: revision, items };
}
const model = {
    modelId: 'model.general',
    modelRevision: revision,
    displayName: '通用模型',
    providerFamily: 'openai_compatible',
    lifecycle: 'enabled',
    credentialStatus: 'configured',
    defaultForNewTasks: true,
    lastConnectionCheck: {
        status: 'success',
        durationMs: 123,
        testedAt: '2026-08-30T00:00:00.000Z',
        correlationId: '00000000-0000-4000-8000-000000000004'
    },
    endpoint: ['https://service.example.test', '/v1'].join(''),
    providerModelId: 'gpt-compatible'
};
const legacyModel = {
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
const robot = {
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
const skill = {
    skillId: 'skill.document',
    skillRevision: revision,
    displayName: '文档技能',
    description: '整理文档摘要',
    lifecycle: 'published',
    packageValidationState: 'valid',
    validationSummary: '校验摘要可用'
};
const knowledge = {
    knowledgeId: 'knowledge.policy',
    knowledgeRevision: revision,
    displayName: '制度知识库',
    safeSummary: '提供制度摘要投影',
    state: 'partial',
    retrievalState: 'gated'
};
