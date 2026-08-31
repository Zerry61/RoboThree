import type {
  AgentLifecycleErrorCode,
  RobotDraftDetail,
} from "@robothree/contracts/agent-lifecycle/v1alpha1";

export type LifecycleStatusView = Readonly<{
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
}>;

export function presentRobotTestState(
  state: RobotDraftDetail["testState"],
): LifecycleStatusView {
  switch (state) {
    case "untested": return { label: "待测试", tone: "neutral" };
    case "running": return { label: "测试中", tone: "warning" };
    case "passed": return { label: "测试通过", tone: "success" };
    case "failed": return { label: "测试未通过", tone: "danger" };
    case "stale": return { label: "测试结果已过期", tone: "warning" };
  }
}

export function presentRobotSubmissionState(
  state: RobotDraftDetail["submissionState"],
): LifecycleStatusView | undefined {
  switch (state) {
    case undefined: return undefined;
    case "pending_review": return { label: "审核中", tone: "warning" };
    case "approved": return { label: "已发布", tone: "success" };
    case "rejected": return { label: "已驳回", tone: "danger" };
    case "withdrawn": return { label: "已撤回", tone: "neutral" };
  }
}

export function presentAgentLifecycleError(
  code: AgentLifecycleErrorCode,
  fallback: string,
): string {
  switch (code) {
    case "agentlifecycle.robot_id_reserved":
      return "agent.general 是系统保留标识，请更换机器人标识。";
    case "agentlifecycle.revision_conflict":
      return "草稿已被更新，已重新加载最新内容。请确认后再操作。";
    case "agentlifecycle.submission_conflict":
      return "发布状态已经变化，已重新加载最新内容。请确认后再操作。";
    case "agentlifecycle.test_required":
      return "只有当前保存版本测试通过后才能提交发布。";
    case "agentlifecycle.resource_unavailable":
      return "机器人引用的资源当前不可用，请调整资源范围后重试。";
    case "agentlifecycle.draft_incomplete":
      return "请补全机器人简介、行为规则和发布所需字段。";
    case "agentlifecycle.avatar_invalid":
      return "头像不可用，请重新选择 PNG 或 JPG 图片。";
    case "agentlifecycle.unauthorized":
      return "当前账号无权执行该机器人操作。";
    case "agentlifecycle.not_found":
      return "该机器人草稿已不存在，请返回列表刷新。";
    case "agentlifecycle.service_unavailable":
      return "机器人服务暂时不可用，请稍后重试。";
    case "agentlifecycle.invalid_request":
      return "机器人资料不符合要求，请检查后重试。";
    default:
      return fallback;
  }
}
