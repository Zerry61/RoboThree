import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { AdminApiError } from '../../src/adapters/admin-api-error';
import { createUnavailableAdminAdapter } from '../../src/adapters/unavailable-admin-adapter';
import { installAdminAdapter } from '../../src/app/admin-runtime';
import EnterpriseSkillDraftPage from '../../src/pages/skills/EnterpriseSkillDraftPage.vue';
import SkillSubmissionDetailPage from '../../src/pages/skills/SkillSubmissionDetailPage.vue';
import SkillUploadPage from '../../src/pages/skills/SkillUploadPage.vue';
import SkillsPage from '../../src/pages/skills/SkillsPage.vue';
import { presentEnterpriseSkillDraft, presentSkillLifecycleError, presentSkillSubmissionDetail, presentSkillSubmissionState, validateSkillRejectionReason } from '../../src/presentation/skill-lifecycle-presentation';
const revisionA = `sha256:${'a'.repeat(64)}`;
const revisionB = `sha256:${'b'.repeat(64)}`;
const correlationId = '11111111-1111-4111-8111-111111111111';
const forbiddenDisplayedText = [
    ['Tok', 'en'].join(''),
    ['Cred', 'ential'].join(''),
    ['End', 'point'].join(''),
    ['Bear', 'er'].join(''),
    ['/', 'Users', '/'].join(''),
    ['测试', '输入'].join(''),
    ['模型', '输出'].join(''),
    ['内部', 'stack'].join(''),
    ['SKILL', ' 全文'].join('')
];
async function flushAsync() {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}
describe('RSL-2 Admin skill lifecycle frontend closure', () => {
    it('renders pending, approved, rejected and withdrawn submission states', async () => {
        installSkillLifecycleAdapter({
            pageItems: ['pending_review', 'approved', 'rejected', 'withdrawn'].map((state) => createSubmission({ state }))
        });
        const wrapper = mount(SkillsPage);
        await flushAsync();
        const text = wrapper.text();
        expect(text).toContain('待审核');
        expect(text).toContain('已通过');
        expect(text).toContain('已驳回');
        expect(text).toContain('已撤回');
        expect(text).toContain('上传企业技能包');
        for (const value of forbiddenDisplayedText)
            expect(text).not.toContain(value);
    });
    it('loads submission detail and approves with exact expectedSubmissionRevision', async () => {
        const approved = createSubmission({ state: 'approved', submissionRevision: revisionB, reviewedAt: '2026-09-01T00:00:00.000Z' });
        const calls = installSkillLifecycleAdapter({ detailSequence: [createSubmission(), approved] });
        const wrapper = mountSubmissionDetail();
        await flushAsync();
        await wrapper.findAll('button').wrappers.find((button) => button.text() === '通过并发布')?.trigger('click');
        await flushAsync();
        await flushAsync();
        expect(calls.approve).toHaveLength(1);
        expect(calls.approve[0]?.expectedSubmissionRevision).toBe(revisionA);
        expect(calls.detailLoads).toBe(2);
        expect(calls.listLoads).toBe(1);
        expect(wrapper.text()).toContain('已通过');
        expect(wrapper.text()).toContain('服务端校验通过');
    });
    it('requires a safe rejection reason and reloads after rejection', async () => {
        const rejected = createSubmission({
            state: 'rejected',
            submissionRevision: revisionB,
            reviewedAt: '2026-09-01T00:00:00.000Z',
            rejectionReason: '说明缺少明确适用场景'
        });
        const calls = installSkillLifecycleAdapter({ detailSequence: [createSubmission(), rejected] });
        const wrapper = mountSubmissionDetail();
        await flushAsync();
        await wrapper.findAll('button').wrappers.find((button) => button.text() === '驳回')?.trigger('click');
        await wrapper.findAll('button').wrappers.find((button) => button.text() === '确认驳回')?.trigger('click');
        await flushAsync();
        expect(wrapper.text()).toContain('请填写安全驳回原因。');
        expect(calls.reject).toHaveLength(0);
        await wrapper.find('textarea').setValue('说明缺少明确适用场景');
        await wrapper.findAll('button').wrappers.find((button) => button.text() === '确认驳回')?.trigger('click');
        await flushAsync();
        await flushAsync();
        expect(calls.reject).toHaveLength(1);
        expect(calls.reject[0]).toMatchObject({
            expectedSubmissionRevision: revisionA,
            reason: '说明缺少明确适用场景'
        });
        expect(calls.detailLoads).toBe(2);
        expect(wrapper.text()).toContain('已驳回');
    });
    it('reloads list and detail after skill submission conflict', async () => {
        const calls = installSkillLifecycleAdapter({
            detailSequence: [createSubmission(), createSubmission({ state: 'approved', submissionRevision: revisionB })],
            approveError: new AdminApiError('skilllifecycle.revision_conflict', 'raw conflict')
        });
        const wrapper = mountSubmissionDetail();
        await flushAsync();
        await wrapper.findAll('button').wrappers.find((button) => button.text() === '通过并发布')?.trigger('click');
        await flushAsync();
        await flushAsync();
        expect(calls.approve).toHaveLength(1);
        expect(calls.detailLoads).toBe(2);
        expect(calls.listLoads).toBe(1);
        expect(wrapper.text()).toContain('审核状态已变化，请刷新后重试。');
        expect(wrapper.text()).toContain('已通过');
        expect(wrapper.text()).not.toContain('raw conflict');
    });
    it('hides review actions for terminal submissions and prevents duplicate inflight mutation', async () => {
        installSkillLifecycleAdapter({ detailSequence: [createSubmission({ state: 'withdrawn' })] });
        const terminal = mountSubmissionDetail();
        await flushAsync();
        expect(terminal.text()).toContain('该审核记录已结束，不能重复审批。');
        expect(terminal.findAll('button').wrappers.some((button) => button.text() === '通过并发布')).toBe(false);
        let releaseApprove;
        const calls = installSkillLifecycleAdapter({
            approveDelay: () => new Promise((resolve) => { releaseApprove = resolve; })
        });
        const pending = mountSubmissionDetail();
        await flushAsync();
        const approveButton = pending.findAll('button').wrappers.find((button) => button.text() === '通过并发布');
        await approveButton?.trigger('click');
        await approveButton?.trigger('click');
        expect(calls.approve).toHaveLength(1);
        expect(pending.findAll('button').wrappers.find((button) => button.text() === '通过并发布')?.attributes('disabled')).toBe('disabled');
        releaseApprove?.();
        await flushAsync();
        await flushAsync();
    });
    it('validates upload format and size before sending multipart archive', async () => {
        const calls = installSkillLifecycleAdapter();
        const wrapper = mount(SkillUploadPage);
        const input = wrapper.find('input[type="file"]');
        await setSelectedFile(input.element, new File(['x'], 'skill.txt', { type: 'text/plain' }));
        expect(wrapper.text()).toContain('请上传 ZIP、RAR、TAR.GZ 或 TGZ 格式的技能包。');
        expect(calls.upload).toHaveLength(0);
        const large = new File(['x'], 'skill.zip', { type: 'application/zip' });
        Object.defineProperty(large, 'size', { value: 201 * 1024 * 1024 });
        await setSelectedFile(input.element, large);
        expect(wrapper.text()).toContain('技能包超过 200 MiB');
        await setSelectedFile(input.element, new File(['safe'], 'skill.zip', { type: 'application/zip' }));
        await wrapper.findAll('button').wrappers.find((button) => button.text() === '上传并解析')?.trigger('click');
        await flushAsync();
        await flushAsync();
        expect(calls.upload).toHaveLength(1);
        expect(calls.upload[0]?.command.upload.archiveFormat).toBe('zip');
        expect(calls.upload[0]?.archive.name).toBe('skill.zip');
        expect(wrapper.text()).toContain('草稿已返回');
    });
    it('keeps upload, save, test and publish as separate draft states', async () => {
        const calls = installSkillLifecycleAdapter({ draftSequence: [createDraft(), createDraft({ metadata: { ...createDraft().metadata, displayTitle: '更新后标题' } }), createDraft({ testFact: passedTestFact() }), createDraft({ testFact: passedTestFact() })] });
        const wrapper = mountDraft();
        await flushAsync();
        expect(wrapper.text()).toContain('当前 exact revision 测试未通过，不能发布。');
        expect(wrapper.findAll('button').wrappers.find((button) => button.text() === '发布')?.attributes('disabled')).toBe('disabled');
        await wrapper.find('#skill-title').setValue('更新后标题');
        await wrapper.findAll('button').wrappers.find((button) => button.text() === '保存草稿')?.trigger('click');
        await flushAsync();
        await flushAsync();
        await wrapper.findAll('button').wrappers.find((button) => button.text() === '运行测试')?.trigger('click');
        await flushAsync();
        await flushAsync();
        await wrapper.findAll('button').wrappers.find((button) => button.text() === '发布')?.trigger('click');
        await flushAsync();
        await flushAsync();
        expect(calls.save).toHaveLength(1);
        expect(calls.save[0]?.expectedDraftRevision).toBe(revisionA);
        expect(calls.test).toHaveLength(1);
        expect(calls.publish).toHaveLength(1);
        expect(calls.publish[0]?.expectedDraftRevision).toBe(revisionA);
        expect(wrapper.text()).toContain('发布请求已返回');
    });
    it('keeps package facts immutable and rejects restricted scope without returned subjects', async () => {
        installSkillLifecycleAdapter();
        const wrapper = mountDraft();
        await flushAsync();
        expect(wrapper.text()).toContain('技术名称');
        expect(wrapper.text()).toContain('sales-analysis');
        expect(wrapper.text()).toContain('文件数量');
        expect(wrapper.text()).toContain('3');
        expect(wrapper.findAll('input').wrappers.some((input) => input.attributes('value') === 'sales-analysis')).toBe(false);
        await wrapper.find('#skill-usage-scope').setValue('restricted');
        await wrapper.findAll('button').wrappers.find((button) => button.text() === '保存草稿')?.trigger('click');
        await flushAsync();
        expect(wrapper.text()).toContain('受限范围需要后端返回授权对象后才能保存。');
    });
    it('keeps skill lifecycle presentation and pages free of forbidden display text', async () => {
        expect(['pending_review', 'approved', 'rejected', 'withdrawn'].map((state) => presentSkillSubmissionState(state).label))
            .toEqual(['待审核', '已通过', '已驳回', '已撤回']);
        expect(validateSkillRejectionReason('')).toBe('请填写安全驳回原因。');
        expect(presentSkillLifecycleError({ code: 'unknown', message: ['/', 'Users', '/leak'].join('') })).toBe('技能服务暂时不可用，请稍后重试');
        const serialized = JSON.stringify([
            presentSkillSubmissionDetail(createSubmission()),
            presentEnterpriseSkillDraft(createDraft())
        ]);
        for (const value of forbiddenDisplayedText)
            expect(serialized).not.toContain(value);
        const files = [
            'src/pages/skills/SkillsPage.vue',
            'src/pages/skills/SkillSubmissionDetailPage.vue',
            'src/pages/skills/SkillUploadPage.vue',
            'src/pages/skills/EnterpriseSkillDraftPage.vue',
            'src/presentation/skill-lifecycle-presentation.ts'
        ];
        for (const file of files) {
            const text = await readFile(path.join(process.cwd(), file), 'utf8');
            for (const value of forbiddenDisplayedText)
                expect(text).not.toContain(value);
        }
    });
});
function mountSubmissionDetail() {
    return mount(SkillSubmissionDetailPage, {
        propsData: { submissionId: '00000000-0000-4000-8000-000000000021' }
    });
}
async function setSelectedFile(input, file) {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flushAsync();
}
function mountDraft() {
    return mount(EnterpriseSkillDraftPage, {
        propsData: { skillId: 'skill.sales-analysis' }
    });
}
function installSkillLifecycleAdapter(options = {}) {
    const calls = { listLoads: 0, detailLoads: 0, approve: [], reject: [], upload: [], save: [], test: [], publish: [] };
    const detailQueue = [...(options.detailSequence ?? [createSubmission()])];
    const draftQueue = [...(options.draftSequence ?? [createDraft()])];
    installAdminAdapter({
        ...createUnavailableAdminAdapter(),
        async listSkillSubmissions() {
            calls.listLoads += 1;
            return {
                contractVersion: 'skill-lifecycle.v1alpha1',
                queryRevision: revisionA,
                items: [...(options.pageItems ?? [createSubmission()])]
            };
        },
        async getSkillSubmission() {
            calls.detailLoads += 1;
            return detailQueue.shift() ?? detailQueue.at(-1) ?? createSubmission();
        },
        async approveSkillSubmission(command) {
            calls.approve.push(command);
            if (options.approveDelay !== undefined)
                await options.approveDelay();
            if (options.approveError !== undefined)
                throw options.approveError;
            return receipt(command.commandId, command.correlationId, 'approved');
        },
        async rejectSkillSubmission(command) {
            calls.reject.push(command);
            return receipt(command.commandId, command.correlationId, 'rejected');
        },
        async uploadEnterpriseSkillPackage(command, archive) {
            calls.upload.push({ command, archive });
            return receipt(command.commandId, command.correlationId, 'upload_accepted');
        },
        async getEnterpriseSkillDraft() {
            return draftQueue.shift() ?? draftQueue.at(-1) ?? createDraft();
        },
        async updateEnterpriseSkillDraftMetadata(command) {
            calls.save.push(command);
            return receipt(command.commandId, command.correlationId, 'metadata_updated');
        },
        async startEnterpriseSkillDraftTest(command) {
            calls.test.push(command);
            return { ...receipt(command.commandId, command.correlationId, 'test_started'), operationId: '33333333-3333-4333-8333-333333333333' };
        },
        async queryEnterpriseSkillDraftTest(query) {
            return {
                contractVersion: 'skill-lifecycle.v1alpha1',
                operationId: query.operationId,
                correlationId: query.correlationId,
                operationKind: 'admin_draft_test',
                state: 'succeeded',
                skillId: 'skill.sales-analysis',
                targetRevision: revisionA,
                taskId: 'task.skill-test',
                updatedAt: '2026-09-01T00:00:00.000Z'
            };
        },
        async publishEnterpriseSkillDraft(command) {
            calls.publish.push(command);
            return receipt(command.commandId, command.correlationId, 'published');
        }
    });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(correlationId);
    if (crypto.subtle === undefined) {
        Object.defineProperty(crypto, 'subtle', {
            value: {
                async digest() {
                    return new Uint8Array(32).buffer;
                }
            },
            configurable: true
        });
    }
    return calls;
}
function receipt(commandId, id, state) {
    return {
        contractVersion: 'skill-lifecycle.v1alpha1',
        commandId,
        correlationId: id,
        skillId: 'skill.sales-analysis',
        currentRevision: revisionB,
        state
    };
}
function createSubmission(overrides = {}) {
    return {
        submissionId: '00000000-0000-4000-8000-000000000021',
        submissionRevision: revisionA,
        skillId: 'skill.sales-analysis',
        draftRevision: revisionA,
        displayTitle: '销售分析规范',
        technicalName: 'sales-analysis',
        creatorDisplayName: '内部试用创建者',
        semanticVersion: '1.0.0',
        state: 'pending_review',
        submittedAt: '2026-09-01T00:00:00.000Z',
        displayDescription: '用于整理销售数据分析流程',
        primaryFunction: '生成结构化销售分析步骤',
        packageFacts: packageFacts(),
        testFact: passedTestFact(),
        changeSummary: '首次提交企业技能',
        ...overrides
    };
}
function createDraft(overrides = {}) {
    return {
        contractVersion: 'skill-lifecycle.v1alpha1',
        skillId: 'skill.sales-analysis',
        draftRevision: revisionA,
        technicalName: 'sales-analysis',
        metadata: {
            displayTitle: '销售分析规范',
            displayDescription: '用于整理销售数据分析流程',
            semanticVersion: '1.0.0',
            usageScope: 'enterprise_all',
            allowedSubjectIds: []
        },
        packageFacts: packageFacts(),
        testFact: {
            draftRevision: revisionA,
            state: 'untested'
        },
        updatedAt: '2026-09-01T00:00:00.000Z',
        ...overrides
    };
}
function packageFacts() {
    return {
        packageDigest: revisionA,
        manifestDigest: revisionA,
        skillMarkdownDigest: revisionA,
        fileCount: 3,
        expandedByteCount: 4096
    };
}
function passedTestFact() {
    return {
        draftRevision: revisionA,
        state: 'passed',
        taskId: 'task.skill-test',
        testedAt: '2026-09-01T00:00:00.000Z'
    };
}
