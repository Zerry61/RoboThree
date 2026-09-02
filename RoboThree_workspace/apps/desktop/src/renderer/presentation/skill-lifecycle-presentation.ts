import type {
  SkillDetail,
  SkillLifecycleErrorCode,
  SkillListScope,
  SkillSummary,
} from "@robothree/contracts/skill-lifecycle/v1alpha1";

type SkillAvailability = SkillSummary["availability"];
type SkillSourceKind = SkillSummary["sourceKind"];
type SkillDraftTestState = NonNullable<SkillDetail["draftTestFact"]>["state"];
type SkillSubmissionState = NonNullable<SkillDetail["submission"]>["state"];

export const skillScopeTabs: readonly Readonly<{ value: SkillListScope; label: string }>[] =
  Object.freeze([
    { value: "marketplace", label: "技能广场" },
    { value: "installed", label: "已安装" },
    { value: "local", label: "本地目录" },
    { value: "created", label: "我创建的" },
  ]);

const sourceLabels = {
  code_owned: "平台内置",
  personal_creator: "个人创建",
  admin_upload: "企业发布",
  local_user_directory: "用户技能目录",
  local_workspace_directory: "当前工作区",
} satisfies Record<SkillSourceKind, string>;

const availabilityLabels = {
  available: "可用",
  invalid: "内容不完整",
  source_changed: "来源已变化",
  conflicting: "存在同名冲突",
  unavailable: "暂不可用",
} satisfies Record<SkillAvailability, string>;

const testLabels = {
  untested: "未测试",
  running: "测试中",
  passed: "测试通过",
  failed: "测试未通过",
  stale: "测试结果已过期",
} satisfies Record<SkillDraftTestState, string>;

const submissionLabels = {
  pending_review: "审核中",
  approved: "已发布",
  rejected: "已驳回",
  withdrawn: "已撤回",
} satisfies Record<SkillSubmissionState, string>;

const errorLabels = {
  "skilllifecycle.invalid_request": "技能请求无效，请刷新后重试。",
  "skilllifecycle.unauthorized": "当前账号没有执行此操作的权限。",
  "skilllifecycle.not_found": "技能不存在或当前不可见。",
  "skilllifecycle.revision_conflict": "技能已被更新，正在重新加载最新状态。",
  "skilllifecycle.service_unavailable": "技能服务暂时不可用，请稍后重试。",
  "skilllifecycle.skill_id_reserved": "该技能标识已被系统保留，请修改技能名称后重试。",
  "skilllifecycle.draft_incomplete": "技能草稿尚不完整，请继续完善后重试。",
  "skilllifecycle.package_invalid": "技能包未通过安全校验。",
  "skilllifecycle.package_too_large": "技能包超过允许大小。",
  "skilllifecycle.archive_unsupported": "该技能包格式暂不支持。",
  "skilllifecycle.test_required": "当前保存版本需要先通过测试。",
  "skilllifecycle.submission_conflict": "提交状态已经变化，正在重新加载。",
  "skilllifecycle.release_conflict": "该发布版本与现有版本冲突。",
  "skilllifecycle.installation_conflict": "本机已有不同版本，请刷新后选择更新方式。",
  "skilllifecycle.active_task_lock": "该技能正在被运行中的任务使用，暂时不能卸载。",
  "skilllifecycle.local_source_changed": "本地技能来源已经变化，请刷新后重新确认。",
  "skilllifecycle.operation_failed": "技能操作未能完成，请稍后重试。",
} satisfies Record<SkillLifecycleErrorCode, string>;

export type SkillSummaryCard = Readonly<{
  skillId: string;
  title: string;
  technicalName: string;
  description: string;
  sourceLabel: string;
  availabilityLabel: string;
  versionLabel: string;
  creatorLabel?: string;
  installed: boolean;
}>;

export function presentSkillSummary(skill: SkillSummary): SkillSummaryCard {
  return {
    skillId: skill.skillId,
    title: skill.displayTitle,
    technicalName: skill.technicalName,
    description: skill.displayDescription,
    sourceLabel: sourceLabels[skill.sourceKind],
    availabilityLabel: availabilityLabels[skill.availability],
    versionLabel: skill.semanticVersion === undefined ? "当前保存版本" : `版本 ${skill.semanticVersion}`,
    ...(skill.creatorDisplayName === undefined ? {} : { creatorLabel: skill.creatorDisplayName }),
    installed: skill.installed,
  };
}

export function presentSkillAvailability(value: SkillAvailability): string {
  return availabilityLabels[value];
}

export function presentSkillSource(value: SkillSourceKind): string {
  return sourceLabels[value];
}

export function presentSkillTest(value: SkillDraftTestState | undefined): string {
  return value === undefined ? "未测试" : testLabels[value];
}

export function presentSkillSubmission(value: SkillSubmissionState | undefined): string {
  return value === undefined ? "尚未提交" : submissionLabels[value];
}

export function canSubmitSkill(detail: SkillDetail): boolean {
  return detail.sourceKind === "personal_creator"
    && detail.draftTestFact?.state === "passed"
    && detail.draftTestFact.draftRevision === detail.revision
    && detail.submission?.state !== "pending_review"
    && detail.submission?.state !== "approved";
}

export function presentSkillLifecycleError(input: {
  code?: SkillLifecycleErrorCode;
  safeSummary?: string;
}): string {
  if (input.code === undefined) return "技能服务暂时不可用，请稍后重试。";
  return errorLabels[input.code] ?? "技能服务暂时不可用，请稍后重试。";
}
