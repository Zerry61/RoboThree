import type {
  AgentPackage,
  RobotReviewDetail,
  RobotReviewSummary
} from '@robothree/contracts/agent-lifecycle/v1alpha1';

type RobotSubmissionState = RobotReviewDetail['state'];
type AgentDefinition = AgentPackage['agentDefinition'];
type AgentResourceRestriction = AgentDefinition['modelRestriction']
  | AgentDefinition['skillRestriction']
  | AgentDefinition['toolRestriction']
  | AgentDefinition['knowledgeRestriction'];
type AgentResourceReference =
  | Extract<AgentDefinition['modelRestriction'], { mode: 'allowlist' }>['references'][number]
  | Extract<AgentDefinition['skillRestriction'], { mode: 'allowlist' }>['references'][number]
  | Extract<AgentDefinition['toolRestriction'], { mode: 'allowlist' }>['references'][number]
  | Extract<AgentDefinition['knowledgeRestriction'], { mode: 'allowlist' }>['references'][number];

export type RobotReviewTone = 'warning' | 'success' | 'danger' | 'neutral';

export type RobotReviewStatePresentation = Readonly<{
  label: string;
  tone: RobotReviewTone;
  terminal: boolean;
}>;

export type RobotReviewDecisionPresentation = Readonly<{
  canDecide: boolean;
  approveDisabled: boolean;
  rejectDisabled: boolean;
  disabledReason: string;
}>;

export type RobotReviewField = Readonly<{
  label: string;
  value: string;
}>;

export type RobotReviewDetailPresentation = Readonly<{
  title: string;
  state: RobotReviewStatePresentation;
  submissionFields: readonly RobotReviewField[];
  robotFields: readonly RobotReviewField[];
  testSummary: string;
  behaviorRules: string;
}>;

export const robotReviewStateOptions = Object.freeze([
  Object.freeze({ value: 'pending_review', label: '待审核' }),
  Object.freeze({ value: 'approved', label: '已通过' }),
  Object.freeze({ value: 'rejected', label: '已驳回' }),
  Object.freeze({ value: 'withdrawn', label: '已撤回' })
] as const);

export function presentRobotReviewState(state: RobotSubmissionState): RobotReviewStatePresentation {
  switch (state) {
    case 'pending_review':
      return { label: '待审核', tone: 'warning', terminal: false };
    case 'approved':
      return { label: '已通过', tone: 'success', terminal: true };
    case 'rejected':
      return { label: '已驳回', tone: 'danger', terminal: true };
    case 'withdrawn':
      return { label: '已撤回', tone: 'neutral', terminal: true };
    default:
      return assertNever(state);
  }
}

export function presentRobotReviewDecision(
  state: RobotSubmissionState,
  operationLoading: boolean
): RobotReviewDecisionPresentation {
  const statePresentation = presentRobotReviewState(state);
  if (statePresentation.terminal) {
    return {
      canDecide: false,
      approveDisabled: true,
      rejectDisabled: true,
      disabledReason: '该审核记录已结束，不能重复审批。'
    };
  }
  return {
    canDecide: true,
    approveDisabled: operationLoading,
    rejectDisabled: operationLoading,
    disabledReason: operationLoading ? '审核操作处理中，请勿重复提交。' : ''
  };
}

export function presentRobotReviewSummary(review: RobotReviewSummary): Readonly<{
  submissionId: string;
  robotId: string;
  name: string;
  creatorDisplayName: string;
  semanticVersion: string;
  submittedAt: string;
  state: RobotReviewStatePresentation;
}> {
  return {
    submissionId: review.submissionId,
    robotId: review.robotId,
    name: review.name,
    creatorDisplayName: review.creatorDisplayName,
    semanticVersion: review.semanticVersion,
    submittedAt: review.submittedAt,
    state: presentRobotReviewState(review.state)
  };
}

export function presentRobotReviewDetail(detail: RobotReviewDetail): RobotReviewDetailPresentation {
  const agentPackage = detail.agentPackage;
  return {
    title: detail.name,
    state: presentRobotReviewState(detail.state),
    submissionFields: [
      field('机器人标识', detail.robotId),
      field('创建者', detail.creatorDisplayName),
      field('版本', detail.semanticVersion),
      field('提交时间', detail.submittedAt),
      ...(detail.reviewedAt === undefined ? [] : [field('审核时间', detail.reviewedAt)]),
      ...(detail.rejectionReason === undefined ? [] : [field('驳回原因', detail.rejectionReason)])
    ],
    robotFields: [
      field('名称', agentPackage.name),
      field('说明', agentPackage.description),
      field('头像', presentAvatar(agentPackage.avatar)),
      field('变更摘要', agentPackage.changeSummary),
      field('标签', agentPackage.tags.length === 0 ? '无' : agentPackage.tags.join('、')),
      field('模型范围', presentRestriction(agentPackage.agentDefinition.modelRestriction)),
      field('技能范围', presentRestriction(agentPackage.agentDefinition.skillRestriction)),
      field('工具范围', presentRestriction(agentPackage.agentDefinition.toolRestriction)),
      field('知识范围', presentRestriction(agentPackage.agentDefinition.knowledgeRestriction))
    ],
    testSummary: '提交前测试门槛已满足；测试输入和模型输出不进入审核包。',
    behaviorRules: agentPackage.behaviorRules
  };
}

export function validateRejectionReason(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return '请填写安全驳回原因。';
  if (trimmed.length > 1000) return '驳回原因不能超过 1000 个字符。';
  return '';
}

export function presentRobotReviewOperationError(error: Readonly<{ code?: string; message?: string }>): string {
  if (error.code === 'agentlifecycle.revision_conflict') {
    return '审核状态已变化，请刷新后重试。';
  }
  return error.message && error.message.trim().length > 0 ? error.message : '审核操作暂不可用。';
}

function field(label: string, value: string): RobotReviewField {
  return { label, value };
}

function presentAvatar(avatar: AgentPackage['avatar']): string {
  switch (avatar.source) {
    case 'system':
      return '系统默认头像';
    case 'preset':
      return '预设头像';
    case 'uploaded':
      return '已上传头像';
    default:
      return assertNever(avatar);
  }
}

function presentRestriction(restriction: AgentResourceRestriction): string {
  switch (restriction.mode) {
    case 'unrestricted':
      return '不限制（仍受任务与企业策略约束）';
    case 'allowlist':
      if (restriction.references.length === 0) return '不允许使用';
      return restriction.references.map(presentRestrictionReference).join('、');
    default:
      return assertNever(restriction);
  }
}

function presentRestrictionReference(reference: AgentResourceReference): string {
  if ('modelId' in reference) return reference.modelId;
  if ('skillId' in reference) return reference.skillId;
  if ('capabilityId' in reference) return reference.capabilityId;
  if ('knowledgeId' in reference) return reference.knowledgeId;
  return '未知资源';
}

function assertNever(value: never): never {
  throw new Error(`Unhandled robot review presentation value: ${String(value)}`);
}
