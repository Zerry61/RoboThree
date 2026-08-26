import type { DesktopErrorEnvelope } from "@robothree/contracts";

export type DesktopErrorPresentationInput = Readonly<
  Omit<DesktopErrorEnvelope, "code">
  & { code: string }
>;

const DESKTOP_ERROR_HINT = {
  "contract.invalid": "请刷新页面后重试。",
  "contract.unsupported_version": "请重启桌面并更新到最新版本。",
  "command.idempotency_conflict": "检测到重复请求幂等冲突，请使用新请求重试。",
  "workspace.selection_invalid": "授权目录选择记录无效，请重新授权。",
  "workspace.selection_expired": "授权会话已过期，请重新授权目录。",
  "workspace.selection_consumed": "授权令牌已消费，请重新发起目录授权。",
  "workspace.selection_context_mismatch": "授权上下文不一致，请重新授权目录。",
  "session.not_found": "会话不存在，请重新打开会话。",
  "session_has_active_task": "当前会话仍有未结束任务，请先暂停或取消后再操作。",
  "workspace.boundary_violation": "目标路径超出授权边界，请调整授权目录。",
  "catalog.resource_unavailable": "所选能力当前不可用，请切换 Agent/Model。",
  "submit_turn.invalid_selection": "提交参数无效，请重新选择运行时能力。",
  "submit_turn.not_found": "提交上下文不存在，请刷新会话后重试。",
  "task.not_found": "任务不存在或已关闭，请刷新任务列表。",
  "task.invalid_state": "任务状态不允许该操作。",
  "task.stale_revision": "任务版本已变更，请刷新后按最新状态操作。",
  "task.permission_denied": "没有执行该任务操作的权限。",
  "artifact.source_unavailable": "Artifact 源文件当前不可用，请刷新后重试。",
  "artifact.source_changed": "Artifact 源文件状态已变化，请刷新后重试。",
  "artifact.delete_confirmation_mismatch": "确认文本不匹配，未移动源文件。",
  "artifact.delete_unsupported": "当前系统不支持将该文件移动到废纸篓。",
  "artifact.delete_failed": "移动源文件到废纸篓失败，请检查文件状态后重试。",
  "artifact.delete_uncertain": "源文件删除结果需要人工确认，请刷新工作区后核对。",
  "confirmation.not_found": "该确认请求不存在或已过期。",
  "confirmation.expired": "确认窗口已过期，请重新进入任务。",
  "confirmation.duplicate_decision": "该确认已经决策，不可重复处理。",
  "confirmation.request_digest_conflict": "确认请求签名不一致，请刷新任务后重试。",
  "confirmation.permission_denied": "没有决策该确认的权限。",
  "replay_reset_required": "会话状态回放失败，请刷新后重试。",
  "runtime.unavailable": "Local Core 不可用，请重启 RoboThree。",
} as const satisfies Readonly<Record<DesktopErrorEnvelope["code"], string>>;

export function explainDesktopError(error: DesktopErrorPresentationInput): string {
  const hint = knownDesktopErrorHint(error.code);
  const suffix = error.retryable ? "可重试。" : "请先检查环境后重试。";
  return `${error.code}: ${error.safeSummary} ${hint ?? suffix}`;
}

function knownDesktopErrorHint(code: string): string | undefined {
  return Object.hasOwn(DESKTOP_ERROR_HINT, code)
    ? DESKTOP_ERROR_HINT[code as DesktopErrorEnvelope["code"]]
    : undefined;
}
