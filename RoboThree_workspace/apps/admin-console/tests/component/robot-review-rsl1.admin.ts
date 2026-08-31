import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { AdminApiError } from '../../src/adapters/admin-api-error';
import type { AdminAdapter } from '../../src/adapters/admin-adapter';
import { createUnavailableAdminAdapter } from '../../src/adapters/unavailable-admin-adapter';
import { installAdminAdapter } from '../../src/app/admin-runtime';
import RobotDetailPage from '../../src/pages/robots/RobotDetailPage.vue';
import RobotsPage from '../../src/pages/robots/RobotsPage.vue';
import {
  presentRobotReviewDecision,
  presentRobotReviewDetail,
  presentRobotReviewOperationError,
  presentRobotReviewState,
  validateRejectionReason
} from '../../src/presentation/robot-review-presentation';
import type {
  ApproveRobotReviewCommand,
  RejectRobotReviewCommand,
  RobotReviewDetail
} from '@robothree/contracts/agent-lifecycle/v1alpha1';
import type VueType from 'vue';
import type { VueConstructor } from 'vue';

const revisionA = `sha256:${'a'.repeat(64)}`;
const revisionB = `sha256:${'b'.repeat(64)}`;
type RobotSubmissionState = RobotReviewDetail['state'];
const forbiddenDisplayedText = [
  ['Tok', 'en'].join(''),
  ['Cred', 'ential'].join(''),
  ['End', 'point'].join(''),
  ['Bear', 'er'].join(''),
  ['/', 'Users', '/'].join(''),
  ['任务', '正文'].join(''),
  ['内部', '堆栈'].join('')
] as const;

async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
}

describe('RSL-1 robot review frontend closure', () => {
  it('covers all robot review states in list presentation', async () => {
    const states: readonly RobotSubmissionState[] = ['pending_review', 'approved', 'rejected', 'withdrawn'];
    installRobotReviewAdapter({ pageItems: states.map((state) => createReview({ state })) });

    const wrapper = mount(RobotsPage as unknown as VueConstructor<VueType>);
    await flushAsync();

    const text = wrapper.text();
    expect(text).toContain('待审核');
    expect(text).toContain('已通过');
    expect(text).toContain('已驳回');
    expect(text).toContain('已撤回');
    for (const value of forbiddenDisplayedText) expect(text).not.toContain(value);
  });

  it('renders review detail with safe business fields, avatar and test summary', async () => {
    installRobotReviewAdapter();

    const wrapper = mountReviewDetail();
    await flushAsync();

    const text = wrapper.text();
    expect(text).toContain('业务机器人');
    expect(text).toContain('处理日常业务问题');
    expect(text).toContain('只处理明确的业务请求。');
    expect(text).toContain('业务、文档');
    expect(text).toContain('系统默认头像');
    expect(text).toContain('测试结果摘要');
    expect(text).toContain('提交前测试门槛已满足');
    expect(text).not.toContain(['任务', '正文'].join(''));
    expect(text).not.toContain(['/', 'Users', '/'].join(''));
    expect(text).not.toContain('stack');
  });

  it('approves with exact expectedSubmissionRevision and reloads detail plus list', async () => {
    const approved = createReview({ state: 'approved', submissionRevision: revisionB, reviewedAt: '2026-08-31T00:00:00.000Z' });
    const calls = installRobotReviewAdapter({ detailSequence: [createReview(), approved] });

    const wrapper = mountReviewDetail();
    await flushAsync();
    await wrapper.findAll('button').wrappers.find((button) => button.text() === '通过并发布')?.trigger('click');
    await flushAsync();
    await flushAsync();

    expect(calls.approve).toHaveLength(1);
    expect(calls.approve[0]?.expectedSubmissionRevision).toBe(revisionA);
    expect(calls.detailLoads).toBe(2);
    expect(calls.listLoads).toBe(1);
    expect(wrapper.text()).toContain('审核结果已返回');
    expect(wrapper.text()).toContain('已通过');
  });

  it('requires a safe rejection reason and reloads after rejection', async () => {
    const rejected = createReview({
      state: 'rejected',
      submissionRevision: revisionB,
      reviewedAt: '2026-08-31T00:00:00.000Z',
      rejectionReason: '业务规则描述不完整'
    });
    const calls = installRobotReviewAdapter({ detailSequence: [createReview(), rejected] });

    const wrapper = mountReviewDetail();
    await flushAsync();
    await wrapper.findAll('button').wrappers.find((button) => button.text() === '驳回')?.trigger('click');
    await wrapper.findAll('button').wrappers.find((button) => button.text() === '确认驳回')?.trigger('click');
    await flushAsync();

    expect(wrapper.text()).toContain('请填写安全驳回原因。');
    expect(calls.reject).toHaveLength(0);

    await wrapper.find('textarea').setValue('业务规则描述不完整');
    await wrapper.findAll('button').wrappers.find((button) => button.text() === '确认驳回')?.trigger('click');
    await flushAsync();
    await flushAsync();

    expect(calls.reject).toHaveLength(1);
    expect(calls.reject[0]).toMatchObject({
      expectedSubmissionRevision: revisionA,
      reason: '业务规则描述不完整'
    });
    expect(calls.detailLoads).toBe(2);
    expect(calls.listLoads).toBe(1);
    expect(wrapper.text()).toContain('已驳回');
    expect(wrapper.text()).toContain('业务规则描述不完整');
  });

  it('reloads current detail after revision conflict with exact safe message', async () => {
    const calls = installRobotReviewAdapter({
      detailSequence: [createReview(), createReview({ state: 'approved', submissionRevision: revisionB })],
      approveError: new AdminApiError('agentlifecycle.revision_conflict', 'raw conflict')
    });

    const wrapper = mountReviewDetail();
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

  it('does not expose actions for terminal review states and ignores duplicate clicks while loading', async () => {
    installRobotReviewAdapter({ detailSequence: [createReview({ state: 'approved' })] });
    const terminal = mountReviewDetail();
    await flushAsync();
    expect(terminal.text()).toContain('该审核记录已结束，不能重复审批。');
    expect(terminal.findAll('button').wrappers.some((button) => button.text() === '通过并发布')).toBe(false);

    let releaseApprove: (() => void) | undefined;
    const calls = installRobotReviewAdapter({
      approveDelay: () => new Promise<void>((resolve) => { releaseApprove = resolve; })
    });
    const pending = mountReviewDetail();
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

  it('keeps robot review presentation exhaustive and free of sensitive fields', () => {
    const labels = (['pending_review', 'approved', 'rejected', 'withdrawn'] as const)
      .map((state) => presentRobotReviewState(state).label);
    expect(labels).toEqual(['待审核', '已通过', '已驳回', '已撤回']);
    expect(presentRobotReviewDecision('approved', false)).toMatchObject({ canDecide: false });
    expect(validateRejectionReason('')).toBe('请填写安全驳回原因。');
    expect(presentRobotReviewOperationError({ code: 'agentlifecycle.revision_conflict', message: ['stack ', '/', 'Users', '/leak'].join('') }))
      .toBe('审核状态已变化，请刷新后重试。');

    const detail = presentRobotReviewDetail(createReview({
      agentPackage: {
        ...createReview().agentPackage,
        avatar: { source: 'uploaded', assetId: 'robot-avatar.uploaded.safe', contentDigest: revisionA }
      }
    }));
    const serialized = JSON.stringify(detail);
    expect(serialized).toContain('已上传头像');
    expect(serialized).not.toContain('contentDigest');
    for (const value of forbiddenDisplayedText) expect(serialized).not.toContain(value);
  });

  it('keeps robot review pages and presentation free of forbidden displayed text', async () => {
    const files = [
      'src/pages/robots/RobotsPage.vue',
      'src/pages/robots/RobotDetailPage.vue',
      'src/presentation/robot-review-presentation.ts'
    ];
    for (const file of files) {
      const text = await readFile(path.join(process.cwd(), file), 'utf8');
      for (const value of forbiddenDisplayedText) {
        expect(text).not.toContain(value);
      }
    }
  });
});

function mountReviewDetail() {
  return mount(RobotDetailPage as unknown as VueConstructor<VueType>, {
    mocks: { $route: { params: { robotId: '00000000-0000-4000-8000-000000000009' } } }
  });
}

function installRobotReviewAdapter(options: Readonly<{
  pageItems?: readonly RobotReviewDetail[];
  detailSequence?: readonly RobotReviewDetail[];
  approveError?: AdminApiError;
  approveDelay?: () => Promise<void>;
}> = {}) {
  const calls: {
    detailLoads: number;
    listLoads: number;
    approve: ApproveRobotReviewCommand[];
    reject: RejectRobotReviewCommand[];
  } = { detailLoads: 0, listLoads: 0, approve: [], reject: [] };
  const detailQueue = [...(options.detailSequence ?? [createReview()])];

  installAdminAdapter({
    ...createUnavailableAdminAdapter(),
    async listRobotReviews() {
      calls.listLoads += 1;
      return {
        contractVersion: 'agent-lifecycle.v1alpha1',
        queryRevision: revisionA,
        items: [...(options.pageItems ?? [createReview()])]
      };
    },
    async getRobotReview() {
      calls.detailLoads += 1;
      return detailQueue.shift() ?? detailQueue.at(-1) ?? createReview();
    },
    async approveRobotReview(command) {
      calls.approve.push(command);
      if (options.approveDelay !== undefined) await options.approveDelay();
      if (options.approveError !== undefined) throw options.approveError;
      return {
        commandId: command.commandId,
        correlationId: command.correlationId,
        robotId: 'agent.business',
        currentRevision: revisionB,
        state: 'approved'
      };
    },
    async rejectRobotReview(command) {
      calls.reject.push(command);
      return {
        commandId: command.commandId,
        correlationId: command.correlationId,
        robotId: 'agent.business',
        currentRevision: revisionB,
        state: 'rejected'
      };
    }
  } satisfies AdminAdapter);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
  return calls;
}

function createReview(overrides: Partial<RobotReviewDetail> = {}): RobotReviewDetail {
  return {
    submissionId: '00000000-0000-4000-8000-000000000009',
    submissionRevision: revisionA,
    robotId: 'agent.business',
    name: '业务机器人',
    creatorDisplayName: '内部试用创建者',
    state: 'pending_review',
    semanticVersion: '1.0.0',
    submittedAt: '2026-08-30T00:00:00.000Z',
    agentPackage: createAgentPackage(),
    ...overrides
  };
}

function createAgentPackage(): RobotReviewDetail['agentPackage'] {
  return {
    robotId: 'agent.business',
    draftRevision: revisionA,
    packageRevision: revisionA,
    packageDigest: revisionA,
    origin: 'personal_draft',
    name: '业务机器人',
    description: '处理日常业务问题',
    behaviorRules: '只处理明确的业务请求。',
    avatar: { source: 'system', assetId: 'robot-avatar.default' },
    tags: ['业务', '文档'],
    publicationScope: 'enterprise',
    semanticVersion: '1.0.0',
    changeSummary: '首次发布',
    createdAt: '2026-08-30T00:00:00.000Z',
    submittedAt: '2026-08-30T00:00:00.000Z',
    agentDefinition: {
      schemaVersion: 'v1alpha2',
      agentDefinitionId: 'agent.business',
      managementClass: 'managed',
      name: '业务机器人',
      identity: '处理日常业务问题',
      goal: '完成业务任务',
      instructions: '只处理明确的业务请求。',
      modelRestriction: { mode: 'unrestricted' },
      skillRestriction: { mode: 'unrestricted' },
      toolRestriction: { mode: 'unrestricted' },
      knowledgeRestriction: { mode: 'unrestricted' },
      requiredModelCapabilities: {
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsToolCalling: true,
        supportsStreaming: true
      },
      createdAt: '2026-08-30T00:00:00.000Z',
      revision: revisionA,
      digest: revisionA
    }
  };
}
