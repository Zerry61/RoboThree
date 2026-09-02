import type {
  EnterpriseSkillDraft,
  SkillLifecycleErrorCode,
  SkillOperation,
  SkillSubmissionDetail,
  SkillSubmissionPage,
} from '@robothree/contracts/skill-lifecycle/v1alpha1';
import type { AdminBadgeTone, TableColumn } from '../types/admin-ui';

export type SkillLifecycleField = Readonly<{ label: string; value: string }>;
export type SkillLifecycleSection = Readonly<{ title: string; rows: readonly SkillLifecycleField[] }>;
export type SkillSubmissionRow = Readonly<{
  id: string;
  title: string;
  summary: string;
  stateLabel: string;
  stateTone: AdminBadgeTone;
  detailPath: string;
  meta: readonly SkillLifecycleField[];
}>;
export type SkillSubmissionDetailPresentation = Readonly<{
  title: string;
  stateLabel: string;
  stateTone: AdminBadgeTone;
  canDecide: boolean;
  decisionHint: string;
  sections: readonly SkillLifecycleSection[];
}>;
export type EnterpriseSkillDraftPresentation = Readonly<{
  title: string;
  testLabel: string;
  testTone: AdminBadgeTone;
  canPublish: boolean;
  publishHint: string;
  immutableSections: readonly SkillLifecycleSection[];
}>;
type SkillSubmissionSummary = SkillSubmissionPage['items'][number];
type SkillSubmissionState = SkillSubmissionDetail['state'];
type SkillPackageFacts = SkillSubmissionDetail['packageFacts'];

export const skillSubmissionColumns: readonly TableColumn[] = [
  { key: 'name', label: '技能' },
  { key: 'summary', label: '提交信息' },
  { key: 'meta', label: '关键信息' },
  { key: 'state', label: '状态' }
];

export const skillSubmissionStateOptions: readonly Readonly<{ value: SkillSubmissionState | ''; label: string }>[] = [
  { value: '', label: '全部状态' },
  { value: 'pending_review', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'withdrawn', label: '已撤回' }
];

export const skillUsageScopeOptions: readonly Readonly<{ value: EnterpriseSkillDraft['metadata']['usageScope']; label: string; disabled?: boolean }>[] = [
  { value: 'enterprise_all', label: '全企业' },
  { value: 'restricted', label: '受限范围（权限模块接入后开放）', disabled: true }
];

export function presentSkillSubmissionRow(item: SkillSubmissionSummary): SkillSubmissionRow {
  const state = presentSkillSubmissionState(item.state);
  return {
    id: item.submissionId,
    title: item.displayTitle,
    summary: item.creatorDisplayName,
    stateLabel: state.label,
    stateTone: state.tone,
    detailPath: `/skills/reviews/${item.submissionId}`,
    meta: [
      field('技术名称', item.technicalName),
      field('企业版本', item.semanticVersion),
      field('提交时间', formatDateTime(item.submittedAt))
    ]
  };
}

export function presentSkillSubmissionDetail(detail: SkillSubmissionDetail): SkillSubmissionDetailPresentation {
  const state = presentSkillSubmissionState(detail.state);
  return {
    title: `${detail.displayTitle} 审核`,
    stateLabel: state.label,
    stateTone: state.tone,
    canDecide: detail.state === 'pending_review',
    decisionHint: detail.state === 'pending_review' ? '请基于包事实、测试结果和展示信息完成审核。' : '该审核记录已结束，不能重复审批。',
    sections: [
      section('展示信息', [
        field('技能标题', detail.displayTitle),
        field('技能描述', detail.displayDescription),
        field('主要功能', detail.primaryFunction),
        field('创建人', detail.creatorDisplayName),
        field('企业版本', detail.semanticVersion),
        field('变更说明', detail.changeSummary)
      ]),
      section('不可变包事实', packageFactFields(detail.packageFacts)),
      section('测试结果摘要', testFactFields(detail.testFact)),
      ...(detail.rejectionReason === undefined ? [] : [section('驳回原因', [field('安全原因', detail.rejectionReason)])])
    ]
  };
}

export function presentEnterpriseSkillDraft(draft: EnterpriseSkillDraft): EnterpriseSkillDraftPresentation {
  const test = presentSkillDraftTestState(draft.testFact.state);
  const canPublish = draft.testFact.state === 'passed' && draft.testFact.draftRevision === draft.draftRevision;
  return {
    title: `${draft.metadata.displayTitle} 草稿`,
    testLabel: test.label,
    testTone: test.tone,
    canPublish,
    publishHint: canPublish ? '当前草稿测试已通过，可以发布。' : '当前 exact revision 测试未通过，不能发布。',
    immutableSections: [
      section('不可变包事实', [
        field('技术名称', draft.technicalName),
        ...packageFactFields(draft.packageFacts)
      ]),
      section('测试状态', testFactFields(draft.testFact))
    ]
  };
}

export function presentSkillSubmissionState(state: SkillSubmissionState): Readonly<{ label: string; tone: AdminBadgeTone }> {
  switch (state) {
    case 'pending_review': return { label: '待审核', tone: 'warning' };
    case 'approved': return { label: '已通过', tone: 'success' };
    case 'rejected': return { label: '已驳回', tone: 'danger' };
    case 'withdrawn': return { label: '已撤回', tone: 'neutral' };
    default: return assertNever(state);
  }
}

export function presentSkillDraftTestState(state: EnterpriseSkillDraft['testFact']['state']): Readonly<{ label: string; tone: AdminBadgeTone }> {
  switch (state) {
    case 'untested': return { label: '未测试', tone: 'neutral' };
    case 'running': return { label: '测试中', tone: 'info' };
    case 'passed': return { label: '测试通过', tone: 'success' };
    case 'failed': return { label: '测试未通过', tone: 'danger' };
    case 'stale': return { label: '测试已过期', tone: 'warning' };
    default: return assertNever(state);
  }
}

export function presentSkillOperationState(state: SkillOperation['state']): string {
  switch (state) {
    case 'accepted': return '已受理';
    case 'running': return '进行中';
    case 'succeeded': return '已完成';
    case 'failed': return '未完成';
    default: return assertNever(state);
  }
}

export function validateSkillRejectionReason(value: string): string | undefined {
  const text = value.trim();
  if (text.length === 0) return '请填写安全驳回原因。';
  if (text.length > 1000) return '驳回原因不能超过 1000 个字符。';
  return undefined;
}

export function validateEnterpriseSkillMetadata(value: EnterpriseSkillDraft['metadata']): string | undefined {
  if (value.displayTitle.trim().length === 0) return '请填写技能标题。';
  if (value.displayDescription.trim().length === 0) return '请填写技能描述。';
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(value.semanticVersion)) return '企业版本格式应为 X.Y.Z。';
  if (value.usageScope === 'restricted' && value.allowedSubjectIds.length === 0) return '受限范围需要后端返回授权对象后才能保存。';
  return undefined;
}

export function presentSkillLifecycleError(error: { code?: string; message?: string }): string {
  switch (error.code as SkillLifecycleErrorCode | undefined) {
    case 'skilllifecycle.revision_conflict':
    case 'skilllifecycle.submission_conflict':
    case 'skilllifecycle.release_conflict':
      return '审核状态已变化，请刷新后重试。';
    case 'skilllifecycle.package_too_large':
      return '技能包超过 200 MiB，请重新选择。';
    case 'skilllifecycle.archive_unsupported':
      return '请上传 ZIP、RAR、TAR.GZ 或 TGZ 格式的技能包。';
    case 'skilllifecycle.package_invalid':
      return '技能包校验未通过，请重新上传。';
    case 'skilllifecycle.test_required':
      return '当前草稿测试未通过，不能发布。';
    case 'skilllifecycle.unauthorized':
      return '当前身份无权执行该技能操作。';
    case 'skilllifecycle.not_found':
      return '技能记录不存在或已不可见。';
    case 'skilllifecycle.invalid_request':
    case 'skilllifecycle.service_unavailable':
    case 'skilllifecycle.skill_id_reserved':
    case 'skilllifecycle.draft_incomplete':
    case 'skilllifecycle.installation_conflict':
    case 'skilllifecycle.active_task_lock':
    case 'skilllifecycle.local_source_changed':
    case 'skilllifecycle.operation_failed':
      return error.message ?? '技能服务暂时不可用，请稍后重试';
    case undefined:
    default:
      return '技能服务暂时不可用，请稍后重试';
  }
}

export function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${value} B`;
}

function packageFactFields(value: SkillPackageFacts): readonly SkillLifecycleField[] {
  return [
    field('包摘要', value.packageDigest),
    field('清单摘要', value.manifestDigest),
    field('技能说明摘要', value.skillMarkdownDigest),
    field('文件数量', `${value.fileCount}`),
    field('展开总量', formatBytes(value.expandedByteCount)),
    field('验证结果', '服务端校验通过')
  ];
}

function testFactFields(value: SkillSubmissionDetail['testFact']): readonly SkillLifecycleField[] {
  return [
    field('测试状态', presentSkillDraftTestState(value.state).label),
    field('测试修订', value.draftRevision),
    ...(value.testedAt === undefined ? [] : [field('测试时间', formatDateTime(value.testedAt))]),
    ...(value.taskId === undefined ? [] : [field('测试任务', value.taskId)]),
    ...(value.safeReason === undefined ? [] : [field('安全说明', value.safeReason)])
  ];
}

function field(label: string, value: string): SkillLifecycleField {
  return { label, value };
}

function section(title: string, rows: readonly SkillLifecycleField[]): SkillLifecycleSection {
  return { title, rows };
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled skill lifecycle state: ${String(value)}`);
}
