import type {
  TaskDetailProjection,
  TaskDisplayStatus,
  TaskStepProjection,
  ToolActivityProjection,
} from "@robothree/contracts";

import { presentToolActivity } from "../../presentation/tool-activity-presentation.js";

export type WorkbenchExecutionItem = Readonly<{
  id: string;
  title: string;
  detail: string;
  state: "active" | "completed" | "attention" | "failed";
}>;

export function presentWorkbenchModelProgress(progressKey: string): string {
  if (progressKey.startsWith("context.preparing.")) return "正在整理对话内容";
  if (progressKey.startsWith("model.request_started.")) return "已向模型发出请求，正在等待响应";
  if (progressKey.startsWith("model.stream_started.")) return "模型已开始处理当前请求";
  if (progressKey.startsWith("model.first_content.")) return "模型正在生成回复";
  if (progressKey.startsWith("model.first_tool_call.")) return "模型正在准备调用已授权工具";
  return "任务正在继续处理";
}

export function presentWorkbenchExecution(
  detail: TaskDetailProjection | undefined,
): readonly WorkbenchExecutionItem[] {
  if (detail === undefined) return [];

  const activities = detail.toolActivities
    .slice()
    .sort(compareUpdatedAt)
    .map(presentActivity);
  const hasToolActivities = activities.length > 0;
  const steps = detail.runs
    .flatMap((run) => run.steps)
    .sort((left, right) => left.sequence - right.sequence)
    .filter((step) => !isModelStep(step) || isActiveStep(step))
    .filter((step) => !hasToolActivities || !isToolStep(step))
    .map(presentStep);

  return [...steps, ...activities];
}

function presentStep(step: TaskStepProjection): WorkbenchExecutionItem {
  if (isModelStep(step)) {
    return {
      id: `step:${step.stepId}`,
      title: "正在处理当前请求",
      detail: step.displayStatus === "queued" ? "等待模型响应" : "模型正在生成下一步内容",
      state: "active",
    };
  }
  return {
    id: `step:${step.stepId}`,
    title: stepTitle(step),
    detail: step.observationSummary ?? stepDetail(step.displayStatus),
    state: taskState(step.displayStatus),
  };
}

function presentActivity(activity: ToolActivityProjection): WorkbenchExecutionItem {
  const presentation = presentToolActivity(activity);
  return {
    id: `tool:${activity.activityId}`,
    title: toolTitle(activity),
    detail: activityDetail(activity, presentation.statusLabel),
    state: toolState(activity.status),
  };
}

function activityDetail(
  activity: ToolActivityProjection,
  fallback: string,
): string {
  const status = activity.statusSummary ?? fallback;
  if (
    (activity.operationType === "tool.workspace.file.read_text"
      || activity.operationType === "tool.workspace.file.write_text")
    && activity.targetSummary !== undefined
  ) return `${status} · ${activity.targetSummary}`;
  return activity.statusSummary ?? activity.targetSummary ?? fallback;
}

function stepTitle(step: TaskStepProjection): string {
  if (step.actionType.includes("tool")) return "调用已授权工具";
  if (isBusinessSummary(step.actionSummary)) return step.actionSummary;
  return "处理任务";
}

function toolTitle(activity: ToolActivityProjection): string {
  switch (activity.operationType) {
    case "tool.document.pptx.write": return "生成演示文稿";
    case "tool.document.docx.write": return "生成文档";
    case "tool.document.xlsx.write": return "生成表格";
    case "tool.document.pdf.write": return "生成 PDF";
    case "tool.workspace.file.write_text": return "写入工作区文件";
    case "tool.workspace.file.read_text": return "读取工作区文件";
    case "tool.document.docx.read":
    case "tool.document.xlsx.read":
    case "tool.document.pdf.read": return "读取工作区资料";
    default: return isBusinessSummary(activity.toolName)
      ? activity.toolName
      : "执行已授权工具";
  }
}

function stepDetail(status: TaskDisplayStatus): string {
  switch (status) {
    case "preparing": return "正在准备";
    case "queued": return "等待执行";
    case "running": return "正在进行";
    case "waiting_input": return "等待继续输入";
    case "waiting_confirmation": return "等待你的确认";
    case "recovering": return "正在恢复";
    case "completed": return "已完成";
    case "failed": return "未能完成";
    case "cancelled": return "已终止";
    case "timed_out": return "执行超时";
    case "manual_attention": return "需要你处理";
    default: return assertNever(status);
  }
}

function taskState(status: TaskDisplayStatus): WorkbenchExecutionItem["state"] {
  switch (status) {
    case "preparing":
    case "queued":
    case "running":
    case "recovering": return "active";
    case "completed":
    case "waiting_input":
    case "cancelled": return "completed";
    case "waiting_confirmation":
    case "manual_attention": return "attention";
    case "failed":
    case "timed_out": return "failed";
    default: return assertNever(status);
  }
}

function toolState(
  status: ToolActivityProjection["status"],
): WorkbenchExecutionItem["state"] {
  switch (status) {
    case "preparing":
    case "running": return "active";
    case "completed":
    case "cancelled": return "completed";
    case "waiting_confirmation":
    case "uncertain": return "attention";
    case "failed":
    case "timed_out": return "failed";
    default: return assertNever(status);
  }
}

function isToolStep(step: TaskStepProjection): boolean {
  return step.actionType.includes("tool");
}

function isModelStep(step: TaskStepProjection): boolean {
  return step.actionType.includes("model");
}

function isActiveStep(step: TaskStepProjection): boolean {
  return step.displayStatus === "preparing"
    || step.displayStatus === "queued"
    || step.displayStatus === "running"
    || step.displayStatus === "recovering";
}

function isBusinessSummary(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0
    && !/^[a-z0-9_.:/-]+$/iu.test(normalized)
    && !/^action\b/iu.test(normalized);
}

function compareUpdatedAt(
  left: ToolActivityProjection,
  right: ToolActivityProjection,
): number {
  return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Workbench execution state: ${String(value)}`);
}
