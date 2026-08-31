import type {
  AdminAuditEventSummary,
  AdminControlCredentialStatus,
  AdminControlLifecycle,
  AdminControlRestrictionState,
  AdminKnowledgeDetail,
  AdminKnowledgeState,
  AdminKnowledgeSummary,
  AdminModelDetail,
  AdminModelSummary,
  AdminRobotDetail,
  AdminRobotSource,
  AdminRobotSummary,
  AdminSkillPackageValidationState,
  AdminSkillDetail,
  AdminSkillSummary,
  AdminToolConfigurationState,
  AdminToolDetail,
  AdminToolSource,
  AdminToolSummary
} from '@robothree/contracts/admin-control/v1alpha1';
import type { AdminPageStatus, SafeErrorSummary } from '../adapters/admin-adapter';
import type { AdminBadgeTone, TableColumn } from '../types/admin-ui';

export type ReadOnlyInventoryModule = 'models' | 'robots' | 'skills' | 'tools' | 'knowledge' | 'audit';
export type DetailModule = Exclude<ReadOnlyInventoryModule, 'audit'>;
export type InventoryMeta = Readonly<{ label: string; value: string }>;
export type InventoryRow = Readonly<{
  id: string;
  title: string;
  summary: string;
  state: string;
  stateTone: AdminBadgeTone;
  detailPath?: string;
  meta: readonly InventoryMeta[];
}>;
export type DetailRow = Readonly<{ label: string; value: string }>;
export type DetailSection = Readonly<{ title: string; rows: readonly DetailRow[] }>;
export type DetailPresentation = Readonly<{
  title: string;
  description: string;
  notices: readonly string[];
  sections: readonly DetailSection[];
}>;
export type InventoryErrorPresentation = Readonly<{
  status: AdminPageStatus;
  safeError: SafeErrorSummary;
  keepRows: boolean;
}>;

export const inventoryCopy: Readonly<Record<ReadOnlyInventoryModule, Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyMessage: string;
}>>> = {
  models: { eyebrow: '模型管理', title: '模型目录', description: '查看当前可用于任务编排的模型摘要。本页只读，不配置凭据。', emptyTitle: '暂无模型记录', emptyMessage: '当前身份没有可展示的模型投影。' },
  robots: { eyebrow: '机器人管理', title: '机器人目录', description: '查看已发布或内置机器人的能力和资源限制摘要。本页只读，不编辑机器人。', emptyTitle: '暂无机器人记录', emptyMessage: '当前身份没有可展示的机器人投影。' },
  skills: { eyebrow: '技能管理', title: '技能目录', description: '查看技能包校验和生命周期摘要。本页只读，不上传或解析技能包。', emptyTitle: '暂无技能记录', emptyMessage: '当前身份没有可展示的技能投影。' },
  tools: { eyebrow: '工具管理', title: '工具目录', description: '查看工具来源、风险和治理状态。本页只读，不连接、测试或启停工具。', emptyTitle: '暂无工具记录', emptyMessage: '当前身份没有可展示的工具投影。' },
  knowledge: { eyebrow: '知识管理', title: '知识目录', description: '查看知识库投影状态。知识库真实检索、上传、同步和索引能力仍待接入。', emptyTitle: '暂无知识库记录', emptyMessage: '当前身份没有可展示的知识库投影。' },
  audit: { eyebrow: '系统管理', title: '审计日志', description: '查看不含正文和敏感值的系统审计摘要。本页只读，不展示原始审计数据。', emptyTitle: '暂无审计记录', emptyMessage: '当前身份没有可展示的审计摘要。' }
};

export const inventoryColumns: readonly TableColumn[] = [
  { key: 'name', label: '名称' },
  { key: 'summary', label: '业务摘要' },
  { key: 'meta', label: '关键信息' },
  { key: 'state', label: '状态' }
];

export const nonProductionNotice = '测试身份 / 非生产环境：当前页面只展示服务端允许的只读投影，不代表生产管理能力已就绪。';

export function presentInventoryItem(module: ReadOnlyInventoryModule, item: unknown): InventoryRow {
  switch (module) {
    case 'models': {
      const value = item as AdminModelSummary;
      return row(value.modelId, value.displayName, value.safeSummary, presentLifecycle(value.lifecycle), toneForLifecycle(value.lifecycle), `/models/${value.modelId}`, [
        meta('供应方', value.providerLabel),
        meta('凭据', presentCredentialStatus(value.credentialStatus))
      ]);
    }
    case 'robots': {
      const value = item as AdminRobotSummary;
      return row(value.robotId, value.displayName, value.description, presentLifecycle(value.lifecycle), toneForLifecycle(value.lifecycle), `/robots/${value.robotId}`, [
        meta('来源', presentRobotSource(value.source)),
        meta('模型限制', presentRestriction(value.restrictionSummary.models)),
        meta('工具限制', presentRestriction(value.restrictionSummary.tools))
      ]);
    }
    case 'skills': {
      const value = item as AdminSkillSummary;
      return row(value.skillId, value.displayName, value.description, presentSkillValidation(value.packageValidationState), toneForSkillValidation(value.packageValidationState), `/skills/${value.skillId}`, [
        meta('生命周期', presentLifecycle(value.lifecycle))
      ]);
    }
    case 'tools': {
      const value = item as AdminToolSummary;
      return row(value.toolId, value.displayName, value.description, presentToolConfigurationState(value.policyState), toneForToolState(value.policyState), `/tools/${value.toolId}`, [
        meta('来源', presentToolSource(value.source)),
        meta('只读性', value.readOnly ? '只读' : '可能产生变更'),
        meta('连接', presentToolConfigurationState(value.connectionState)),
        meta('健康', presentToolConfigurationState(value.healthState))
      ]);
    }
    case 'knowledge': {
      const value = item as AdminKnowledgeSummary;
      return row(value.knowledgeId, value.displayName, value.safeSummary, presentKnowledgeState(value.state), toneForKnowledgeState(value.state), `/knowledge/${value.knowledgeId}`, [
        meta('检索能力', presentKnowledgeState(value.state))
      ]);
    }
    case 'audit': {
      const value = item as AdminAuditEventSummary;
      return row(value.auditEventId, value.actionSummary, formatAuditTime(value.occurredAt), presentAuditResult(value.result), toneForAuditResult(value.result), undefined, [
        meta('操作者', value.actorSummary)
      ]);
    }
    default:
      return assertNever(module);
  }
}

export function presentDetail(module: DetailModule, item: unknown): DetailPresentation {
  switch (module) {
    case 'models': {
      const value = item as AdminModelDetail;
      return detail(`${value.displayName}详情`, '只读模型摘要，不展示凭据引用或连接材料。', [], [
        section('基本信息', [field('名称', value.displayName), field('供应方', value.providerLabel), field('说明', value.safeSummary)]),
        section('运行状态', [field('生命周期', presentLifecycle(value.lifecycle)), field('凭据状态', presentCredentialStatus(value.credentialStatus)), field('上下文窗口', presentContextWindowState(value.contextWindowState)), field('新任务默认', yesNo(value.defaultForNewTasks))])
      ]);
    }
    case 'robots': {
      const value = item as AdminRobotDetail;
      return detail(`${value.displayName}详情`, '只读机器人摘要，不编辑提示词、发布范围或资源限制。', noticesForRestrictions(value.restrictionSummary), [
        section('基本信息', [field('名称', value.displayName), field('来源', presentRobotSource(value.source)), field('说明', value.description)]),
        section('治理状态', [field('生命周期', presentLifecycle(value.lifecycle)), field('审核状态', presentReviewState(value.reviewState)), field('策略状态', presentCredentialStatus(value.policyState))]),
        section('资源限制', [field('默认模型', presentRestriction(value.restrictionSummary.models)), field('技能', presentRestriction(value.restrictionSummary.skills)), field('工具', presentRestriction(value.restrictionSummary.tools)), field('知识', presentRestriction(value.restrictionSummary.knowledge))])
      ]);
    }
    case 'skills': {
      const value = item as AdminSkillDetail;
      return detail(`${value.displayName}详情`, '只读技能摘要，不上传、不解析、不执行技能包。', [], [
        section('基本信息', [field('名称', value.displayName), field('说明', value.description)]),
        section('包校验', [field('生命周期', presentLifecycle(value.lifecycle)), field('校验状态', presentSkillValidation(value.packageValidationState)), field('校验说明', value.validationSummary ?? '暂无可展示说明')])
      ]);
    }
    case 'tools': {
      const value = item as AdminToolDetail;
      return detail(`${value.displayName}详情`, '只读工具摘要，不连接、不测试、不启停工具。', noticesForTool(value), [
        section('基本信息', [field('名称', value.displayName), field('来源', presentToolSource(value.source)), field('说明', value.description), field('只读性', value.readOnly ? '只读' : '可能产生变更')]),
        section('治理状态', [field('生命周期', presentLifecycle(value.lifecycle)), field('风险摘要', value.riskSummary.map(presentRisk).join('、') || '无已投影风险'), field('策略状态', presentToolConfigurationState(value.policyState)), field('连接状态', presentToolConfigurationState(value.connectionState)), field('凭据状态', presentCredentialStatus(value.credentialStatus)), field('健康状态', presentToolConfigurationState(value.healthState))]),
        section('输入输出摘要', [field('输入摘要', value.inputSummary ?? '暂无可展示说明'), field('输出摘要', value.outputSummary ?? '暂无可展示说明')])
      ]);
    }
    case 'knowledge': {
      const value = item as AdminKnowledgeDetail;
      return detail(`${value.displayName}详情`, '只读知识库摘要。真实检索、上传、同步和索引能力仍待接入。', noticesForKnowledge(value), [
        section('基本信息', [field('名称', value.displayName), field('说明', value.safeSummary)]),
        section('能力状态', [field('知识库状态', presentKnowledgeState(value.state)), field('检索状态', presentKnowledgeState(value.retrievalState))])
      ]);
    }
    default:
      return assertNever(module);
  }
}

export function presentInventoryNotices(rows: readonly InventoryRow[]): readonly string[] {
  const hasPartial = rows.some((row) => row.stateTone === 'info');
  const hasGatedOrUnavailable = rows.some((row) => row.stateTone === 'warning' || row.stateTone === 'neutral');
  return [
    ...(hasPartial ? ['部分记录只有有限字段可展示，页面不会猜测缺失信息。'] : []),
    ...(hasGatedOrUnavailable ? ['部分能力仍待接入或暂不可用，当前仅展示已投影事实。'] : [])
  ];
}

export function presentInventoryError(error: { code?: string; message?: string; correlationId?: string | undefined }, context: 'list' | 'detail' | 'pagination'): InventoryErrorPresentation {
  const safeError = {
    title: titleForErrorCode(error.code, context),
    message: messageForErrorCode(error.code),
    ...(error.correlationId === undefined ? {} : { correlationId: error.correlationId })
  };
  switch (error.code) {
    case 'admin_session_required':
    case 'permission_denied':
      return { status: 'permissionDenied', safeError, keepRows: context === 'pagination' };
    case 'not_found':
      return { status: 'notFound', safeError, keepRows: context === 'pagination' };
    case 'revision_conflict':
    case 'stale_cursor':
      return { status: 'stale', safeError, keepRows: context === 'pagination' };
    case 'business_rule_unavailable':
    case 'service_unavailable':
    case 'internal':
      return { status: 'unavailable', safeError, keepRows: context === 'pagination' };
    case 'invalid_request':
    case undefined:
      return { status: 'error', safeError, keepRows: context === 'pagination' };
    default:
      return { status: 'error', safeError: { title: '无法读取管理数据', message: '管理数据暂不可用' }, keepRows: context === 'pagination' };
  }
}

function row(id: string, title: string, summary: string, state: string, stateTone: AdminBadgeTone, detailPath: string | undefined, metaItems: readonly InventoryMeta[]): InventoryRow {
  return detailPath === undefined ? { id, title, summary, state, stateTone, meta: metaItems } : { id, title, summary, state, stateTone, detailPath, meta: metaItems };
}

function field(label: string, value: string): DetailRow {
  return { label, value };
}

function meta(label: string, value: string): InventoryMeta {
  return { label, value };
}

function section(title: string, rows: readonly DetailRow[]): DetailSection {
  return { title, rows };
}

function detail(title: string, description: string, notices: readonly string[], sections: readonly DetailSection[]): DetailPresentation {
  return { title, description, notices, sections };
}

function yesNo(value: boolean): string {
  return value ? '是' : '否';
}

function presentLifecycle(value: AdminControlLifecycle): string {
  switch (value) {
    case 'draft': return '草稿';
    case 'review': return '审核中';
    case 'published': return '已发布';
    case 'disabled': return '已停用';
    case 'gated': return '待接入';
    case 'unavailable': return '暂不可用';
    default: return assertNever(value);
  }
}

function toneForLifecycle(value: AdminControlLifecycle): AdminBadgeTone {
  switch (value) {
    case 'published': return 'success';
    case 'review':
    case 'gated': return 'warning';
    case 'disabled': return 'danger';
    case 'draft':
    case 'unavailable': return 'neutral';
    default: return assertNever(value);
  }
}

function presentCredentialStatus(value: AdminControlCredentialStatus | 'configured' | 'missing' | 'unavailable'): string {
  switch (value) {
    case 'configured': return '已配置';
    case 'missing': return '未配置';
    case 'unavailable': return '暂不可用';
    default: return assertNever(value);
  }
}


function presentRestriction(value: AdminControlRestrictionState): string {
  switch (value) {
    case 'unrestricted': return '未设置限制';
    case 'restricted_nonempty': return '已限制范围';
    case 'restricted_empty': return '限制为空';
    default: return assertNever(value);
  }
}

function noticesForRestrictions(value: AdminRobotDetail['restrictionSummary']): readonly string[] {
  return Object.values(value).some((state) => state === 'restricted_empty')
    ? ['部分资源限制已开启但允许列表为空，对应资源将不可使用。']
    : [];
}

function presentRobotSource(value: AdminRobotSource): string {
  switch (value) {
    case 'local_trusted': return '本地可信';
    case 'enterprise_published': return '企业发布';
    case 'official_builtin': return '官方内置';
    default: return assertNever(value);
  }
}

function presentReviewState(value: AdminRobotDetail['reviewState']): string {
  switch (value) {
    case 'not_required': return '无需审核';
    case 'pending': return '待审核';
    case 'approved': return '已通过';
    case 'rejected': return '已拒绝';
    case 'unavailable': return '暂不可用';
    default: return assertNever(value);
  }
}

function presentSkillValidation(value: AdminSkillPackageValidationState): string {
  switch (value) {
    case 'not_started': return '未开始';
    case 'valid': return '校验通过';
    case 'invalid': return '校验失败';
    case 'unavailable': return '暂不可用';
    default: return assertNever(value);
  }
}

function toneForSkillValidation(value: AdminSkillPackageValidationState): AdminBadgeTone {
  switch (value) {
    case 'valid': return 'success';
    case 'invalid': return 'danger';
    case 'not_started':
    case 'unavailable': return 'neutral';
    default: return assertNever(value);
  }
}

function presentToolSource(value: AdminToolSource): string {
  switch (value) {
    case 'enterprise_package': return '企业工具包';
    case 'official_package': return '官方工具包';
    default: return assertNever(value);
  }
}

function presentToolConfigurationState(value: AdminToolConfigurationState): string {
  switch (value) {
    case 'configured': return '已配置';
    case 'missing': return '未配置';
    case 'unavailable': return '暂不可用';
    case 'gated': return '待接入';
    default: return assertNever(value);
  }
}

function toneForToolState(value: AdminToolConfigurationState): AdminBadgeTone {
  switch (value) {
    case 'configured': return 'success';
    case 'gated': return 'warning';
    case 'missing':
    case 'unavailable': return 'neutral';
    default: return assertNever(value);
  }
}

function presentRisk(value: string): string {
  switch (value) {
    case 'routine_file': return '常规文件读取';
    case 'destructive_file': return '文件变更';
    case 'protected_resource': return '受保护资源';
    case 'local_execution': return '本地执行';
    case 'external_send': return '外部发送';
    case 'unknown': return '未知风险';
    default: return '已投影风险';
  }
}

function noticesForTool(value: AdminToolDetail): readonly string[] {
  return value.readOnly ? [] : ['该工具被投影为可能产生变更；当前页面仍只读，不提供执行、测试或启停。'];
}

function presentKnowledgeState(value: AdminKnowledgeState): string {
  switch (value) {
    case 'unconfigured': return '未配置';
    case 'unavailable': return '暂不可用';
    case 'gated': return '待接入';
    case 'partial': return '部分可用';
    case 'ready': return '可用';
    default: return assertNever(value);
  }
}

function toneForKnowledgeState(value: AdminKnowledgeState): AdminBadgeTone {
  switch (value) {
    case 'ready': return 'success';
    case 'partial': return 'info';
    case 'gated': return 'warning';
    case 'unconfigured':
    case 'unavailable': return 'neutral';
    default: return assertNever(value);
  }
}

function noticesForKnowledge(value: AdminKnowledgeDetail): readonly string[] {
  return value.state === 'ready' && value.retrievalState === 'ready'
    ? ['本页仅展示知识库投影摘要，不提供真实检索、上传、同步或索引操作。']
    : ['知识库真实检索、上传、同步和索引能力仍待接入。'];
}

function presentContextWindowState(value: AdminModelDetail['contextWindowState']): string {
  switch (value) {
    case 'known': return '已知';
    case 'unknown': return '未知';
    case 'unavailable': return '暂不可用';
    default: return assertNever(value);
  }
}

function presentAuditResult(value: AdminAuditEventSummary['result']): string {
  switch (value) {
    case 'allowed': return '已允许';
    case 'denied': return '已拒绝';
    case 'failed': return '失败';
    case 'unavailable': return '暂不可用';
    default: return assertNever(value);
  }
}

function toneForAuditResult(value: AdminAuditEventSummary['result']): AdminBadgeTone {
  switch (value) {
    case 'allowed': return 'success';
    case 'denied': return 'warning';
    case 'failed': return 'danger';
    case 'unavailable': return 'neutral';
    default: return assertNever(value);
  }
}

function formatAuditTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function titleForErrorCode(code: string | undefined, context: 'list' | 'detail' | 'pagination'): string {
  switch (code) {
    case 'admin_session_required': return '管理身份不可验证';
    case 'permission_denied': return '权限不足';
    case 'not_found': return context === 'detail' ? '未找到记录' : '无法读取管理数据';
    case 'revision_conflict':
    case 'stale_cursor': return context === 'pagination' ? '列表状态已变化' : '详情状态已变化';
    case 'business_rule_unavailable': return '管理能力待接入';
    case 'service_unavailable':
    case 'internal': return '服务暂不可用';
    case 'invalid_request': return '请求不可用';
    case undefined: return '无法读取管理数据';
    default: return '无法读取管理数据';
  }
}

function messageForErrorCode(code: string | undefined): string {
  switch (code) {
    case 'admin_session_required': return '当前联调身份不可验证，请重新进入管理后台。';
    case 'permission_denied': return '当前身份没有访问该管理数据的权限。';
    case 'not_found': return '该记录不存在，或当前身份不可见。';
    case 'revision_conflict':
    case 'stale_cursor': return '列表或详情状态已变化，请重新加载。';
    case 'business_rule_unavailable': return '该管理能力仍在门禁中，当前只展示已可用的只读投影。';
    case 'service_unavailable':
    case 'internal': return '管理服务暂不可用，请稍后重试。';
    case 'invalid_request': return '当前请求不可用，请返回列表后重试。';
    case undefined: return '管理数据暂不可用。';
    default: return '管理数据暂不可用。';
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled admin inventory presentation value: ${String(value)}`);
}
