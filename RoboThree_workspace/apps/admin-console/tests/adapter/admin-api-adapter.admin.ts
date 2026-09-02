import { describe, expect, it } from 'vitest';
import { createAdminApiAdapter, AdminApiError } from '../../src/adapters/admin-api-adapter';
import type { CreateAdminModelCommand } from '@robothree/contracts/admin-control/v1alpha2';
import type {
  ApproveSkillSubmissionCommand,
  PublishEnterpriseSkillDraftCommand,
  RejectSkillSubmissionCommand,
  StartEnterpriseSkillDraftTestCommand,
  UpdateEnterpriseSkillDraftMetadataCommand,
  UploadEnterpriseSkillPackageCommand
} from '@robothree/contracts/skill-lifecycle/v1alpha1';

const correlationId = '00000000-0000-4000-8000-000000000002';
const safeEndpoint = ['https://models.example.test', '/v1'].join('');

function errorResponse(): Response {
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
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
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
    for (const operation of operations) await expect(operation()).rejects.toBeInstanceOf(AdminApiError);
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
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      contractVersion: 'admin-control.v1alpha1', requestId: '00000000-0000-4000-8000-000000000001', correlationId,
      serverTime: '2026-08-27T00:00:00.000Z', testIdentityUsed: false, productionIdentityReady: false,
      data: { capabilitySetRevision: 'safe', capabilities: [] }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    await expect(createAdminApiAdapter(fetcher).getCurrentCapabilities()).rejects.toMatchObject({ code: 'admin_session_required' });
  });

  it('sends v1alpha2 model mutation commands through the controlled adapter boundary', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
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
    const command: CreateAdminModelCommand = {
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
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
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
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
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
    const command: CreateAdminModelCommand = {
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

  it('reads and mutates robot reviews through the exact agent lifecycle boundary', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), ...(init === undefined ? {} : { init }) });
      return new Response(JSON.stringify(init?.method === 'POST' ? {
        commandId: '11111111-1111-4111-8111-111111111111', correlationId,
        robotId: 'agent.business', currentRevision: `sha256:${'b'.repeat(64)}`, state: 'approved'
      } : {
        contractVersion: 'agent-lifecycle.v1alpha1', queryRevision: `sha256:${'a'.repeat(64)}`, items: []
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const adapter = createAdminApiAdapter(fetcher);
    await adapter.listRobotReviews('pending_review');
    await adapter.approveRobotReview({
      contractVersion: 'agent-lifecycle.v1alpha1', kind: 'approve_robot_review',
      commandId: '11111111-1111-4111-8111-111111111111', correlationId,
      submissionId: '22222222-2222-4222-8222-222222222222',
      expectedSubmissionRevision: `sha256:${'a'.repeat(64)}`
    });
    expect(calls.map((call) => call.url)).toEqual([
      '/admin/v1alpha2/robot-reviews?state=pending_review',
      '/admin/v1alpha2/robot-reviews/commands'
    ]);
    expect(new Headers(calls[0]?.init?.headers).get('x-robothree-contract-version')).toBe('agent-lifecycle.v1alpha1');
    expect(calls[1]?.init?.method).toBe('POST');
    expect(new Headers(calls[1]?.init?.headers).has('authorization')).toBe(false);
  });

  it('uses the exact skill lifecycle boundary for ten Admin methods', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), ...(init === undefined ? {} : { init }) });
      return new Response(JSON.stringify(skillLifecycleResponse(String(input), init)), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };
    const adapter = createAdminApiAdapter(fetcher);

    await adapter.listSkillSubmissions({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'list_skill_submissions',
      queryId: correlationId,
      correlationId,
      state: 'pending_review',
      limit: 50
    });
    await adapter.getSkillSubmission({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'get_skill_submission',
      queryId: correlationId,
      correlationId,
      submissionId: '22222222-2222-4222-8222-222222222222'
    });
    await adapter.approveSkillSubmission(skillApproveCommand());
    await adapter.rejectSkillSubmission(skillRejectCommand());
    await adapter.uploadEnterpriseSkillPackage(skillUploadCommand(), new File(['safe'], 'skill.zip', { type: 'application/zip' }));
    await adapter.getEnterpriseSkillDraft({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'get_enterprise_skill_draft',
      queryId: correlationId,
      correlationId,
      skillId: 'skill.sales-analysis'
    });
    await adapter.updateEnterpriseSkillDraftMetadata(skillMetadataCommand());
    await adapter.startEnterpriseSkillDraftTest(skillTestCommand());
    await adapter.queryEnterpriseSkillDraftTest({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'query_enterprise_skill_draft_test',
      queryId: correlationId,
      correlationId,
      operationId: '33333333-3333-4333-8333-333333333333'
    });
    await adapter.publishEnterpriseSkillDraft(skillPublishCommand());

    expect(calls.map((call) => new URL(call.url, 'http://127.0.0.1').pathname)).toEqual([
      '/admin/v1alpha2/skill-lifecycle/submissions',
      '/admin/v1alpha2/skill-lifecycle/submissions/22222222-2222-4222-8222-222222222222',
      '/admin/v1alpha2/skill-lifecycle/submissions/commands',
      '/admin/v1alpha2/skill-lifecycle/submissions/commands',
      '/admin/v1alpha2/skill-lifecycle/enterprise/uploads',
      '/admin/v1alpha2/skill-lifecycle/enterprise/drafts/skill.sales-analysis',
      '/admin/v1alpha2/skill-lifecycle/enterprise/drafts/skill.sales-analysis/metadata',
      '/admin/v1alpha2/skill-lifecycle/enterprise/drafts/skill.sales-analysis/tests',
      '/admin/v1alpha2/skill-lifecycle/enterprise/operations/33333333-3333-4333-8333-333333333333',
      '/admin/v1alpha2/skill-lifecycle/enterprise/drafts/skill.sales-analysis/publish'
    ]);
    expect(new URL(calls[0]?.url ?? '', 'http://127.0.0.1').searchParams.get('state')).toBe('pending_review');
    expect(calls.map((call) => call.init?.method)).toEqual(['GET', 'GET', 'POST', 'POST', 'POST', 'GET', 'POST', 'POST', 'GET', 'POST']);
    for (const call of calls) {
      const headers = new Headers(call.init?.headers);
      expect(headers.get('x-robothree-contract-version')).toBe('skill-lifecycle.v1alpha1');
      expect(headers.has('authorization')).toBe(false);
      expect(headers.has('cookie')).toBe(false);
    }
    expect(calls[4]?.init?.body).toBeInstanceOf(FormData);
    expect(String(calls[4]?.init?.body)).not.toContain('safe');
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

function skillLifecycleResponse(input: string, init?: RequestInit): unknown {
  const path = new URL(input, 'http://127.0.0.1').pathname;
  if (path.endsWith('/submissions') && init?.method !== 'POST') {
    return {
      contractVersion: 'skill-lifecycle.v1alpha1',
      queryRevision: `sha256:${'a'.repeat(64)}`,
      items: [skillSubmissionSummary()]
    };
  }
  if (path.includes('/submissions/') && !path.endsWith('/commands')) return skillSubmission();
  if (path.includes('/enterprise/drafts/') && init?.method !== 'POST') return enterpriseDraft();
  if (path.includes('/enterprise/operations/')) {
    return {
      contractVersion: 'skill-lifecycle.v1alpha1',
      operationId: '33333333-3333-4333-8333-333333333333',
      correlationId,
      operationKind: 'admin_draft_test',
      state: 'succeeded',
      skillId: 'skill.sales-analysis',
      targetRevision: `sha256:${'a'.repeat(64)}`,
      updatedAt: '2026-09-01T00:00:00.000Z'
    };
  }
  return {
    contractVersion: 'skill-lifecycle.v1alpha1',
    commandId: '11111111-1111-4111-8111-111111111111',
    correlationId,
    skillId: 'skill.sales-analysis',
    currentRevision: `sha256:${'b'.repeat(64)}`,
    state: path.endsWith('/publish') ? 'published' : path.endsWith('/uploads') ? 'upload_accepted' : path.endsWith('/metadata') ? 'metadata_updated' : path.endsWith('/tests') ? 'test_started' : 'approved',
    ...(path.endsWith('/uploads') ? { submissionId: '22222222-2222-4222-8222-222222222222' } : {})
  };
}

function skillSubmission() {
  return {
    ...skillSubmissionSummary(),
    displayDescription: '用于整理销售数据分析流程',
    primaryFunction: '生成结构化销售分析步骤',
    packageFacts: skillPackageFacts(),
    testFact: {
      draftRevision: `sha256:${'a'.repeat(64)}`,
      state: 'passed',
      taskId: 'task.skill-test',
      testedAt: '2026-09-01T00:00:00.000Z'
    },
    changeSummary: '首次提交企业技能'
  };
}

function skillSubmissionSummary() {
  return {
    submissionId: '22222222-2222-4222-8222-222222222222',
    submissionRevision: `sha256:${'a'.repeat(64)}`,
    skillId: 'skill.sales-analysis',
    draftRevision: `sha256:${'a'.repeat(64)}`,
    displayTitle: '销售分析规范',
    technicalName: 'sales-analysis',
    creatorDisplayName: '内部试用创建者',
    semanticVersion: '1.0.0',
    state: 'pending_review',
    submittedAt: '2026-09-01T00:00:00.000Z'
  };
}

function enterpriseDraft() {
  return {
    contractVersion: 'skill-lifecycle.v1alpha1',
    skillId: 'skill.sales-analysis',
    draftRevision: `sha256:${'a'.repeat(64)}`,
    technicalName: 'sales-analysis',
    metadata: {
      displayTitle: '销售分析规范',
      displayDescription: '用于整理销售数据分析流程',
      semanticVersion: '1.0.0',
      usageScope: 'enterprise_all' as const,
      allowedSubjectIds: []
    },
    packageFacts: skillPackageFacts(),
    testFact: {
      draftRevision: `sha256:${'a'.repeat(64)}`,
      state: 'passed',
      taskId: 'task.skill-test',
      testedAt: '2026-09-01T00:00:00.000Z'
    },
    updatedAt: '2026-09-01T00:00:00.000Z'
  };
}

function skillPackageFacts() {
  return {
    packageDigest: `sha256:${'a'.repeat(64)}`,
    manifestDigest: `sha256:${'a'.repeat(64)}`,
    skillMarkdownDigest: `sha256:${'a'.repeat(64)}`,
    fileCount: 3,
    expandedByteCount: 4096
  };
}

function skillApproveCommand(): ApproveSkillSubmissionCommand {
  return {
    contractVersion: 'skill-lifecycle.v1alpha1',
    kind: 'approve_skill_submission',
    commandId: '11111111-1111-4111-8111-111111111111',
    correlationId,
    submissionId: '22222222-2222-4222-8222-222222222222',
    expectedSubmissionRevision: `sha256:${'a'.repeat(64)}`
  };
}

function skillRejectCommand(): RejectSkillSubmissionCommand {
  return {
    ...skillApproveCommand(),
    kind: 'reject_skill_submission',
    reason: '说明缺少明确适用场景'
  };
}

function skillUploadCommand(): UploadEnterpriseSkillPackageCommand {
  return {
    contractVersion: 'skill-lifecycle.v1alpha1',
    kind: 'upload_enterprise_skill_package',
    commandId: '11111111-1111-4111-8111-111111111111',
    correlationId,
    upload: {
      archiveFileName: 'skill.zip',
      archiveFormat: 'zip',
      mediaType: 'application/zip',
      byteLength: 4,
      archiveDigest: `sha256:${'a'.repeat(64)}`
    }
  };
}

function skillMetadataCommand(): UpdateEnterpriseSkillDraftMetadataCommand {
  return {
    contractVersion: 'skill-lifecycle.v1alpha1',
    kind: 'update_enterprise_skill_draft_metadata',
    commandId: '11111111-1111-4111-8111-111111111111',
    correlationId,
    skillId: 'skill.sales-analysis',
    expectedDraftRevision: `sha256:${'a'.repeat(64)}`,
    metadata: enterpriseDraft().metadata
  };
}

function skillTestCommand(): StartEnterpriseSkillDraftTestCommand {
  return {
    contractVersion: 'skill-lifecycle.v1alpha1',
    kind: 'start_enterprise_skill_draft_test',
    commandId: '11111111-1111-4111-8111-111111111111',
    correlationId,
    skillId: 'skill.sales-analysis',
    expectedDraftRevision: `sha256:${'a'.repeat(64)}`,
    testInput: '请执行企业技能草稿安全验证。'
  };
}

function skillPublishCommand(): PublishEnterpriseSkillDraftCommand {
  return {
    contractVersion: 'skill-lifecycle.v1alpha1',
    kind: 'publish_enterprise_skill_draft',
    commandId: '11111111-1111-4111-8111-111111111111',
    correlationId,
    skillId: 'skill.sales-analysis',
    expectedDraftRevision: `sha256:${'a'.repeat(64)}`
  };
}
