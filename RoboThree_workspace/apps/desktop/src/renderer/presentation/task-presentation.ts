import type { TaskDisplayStatus } from "@robothree/contracts";

export type TaskStatusTone =
  | "active"
  | "attention"
  | "completed"
  | "failed";

export type TaskControlVisibility = Readonly<{
  canCancel: boolean;
  canRetry: boolean;
  canContinue: boolean;
  canProvideInput: boolean;
}>;

export type TaskStatusPresentation = Readonly<{
  label: string;
  guidance: string | undefined;
  isTerminal: boolean;
  statusClass: TaskDisplayStatus;
  tone: TaskStatusTone;
  icon: string;
  controls: TaskControlVisibility;
}>;

export function presentTaskStatus(
  status: TaskDisplayStatus,
): TaskStatusPresentation {
  return {
    label: taskStatusLabel(status),
    guidance: taskStatusGuidance(status),
    isTerminal: isTerminalTaskStatus(status),
    statusClass: status,
    tone: taskStatusTone(status),
    icon: taskStatusIcon(status),
    controls: taskControlVisibility(status),
  };
}

export function taskStatusLabel(status: TaskDisplayStatus): string {
  switch (status) {
    case "preparing":
      return "准备中";
    case "queued":
      return "排队中";
    case "running":
      return "执行中";
    case "waiting_input":
      return "等待输入";
    case "waiting_confirmation":
      return "等待确认";
    case "recovering":
      return "正在恢复";
    case "completed":
      return "成功";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "timed_out":
      return "已超时";
    case "manual_attention":
      return "需要人工处理";
    default:
      return assertNever(status);
  }
}

export function taskStatusGuidance(
  status: TaskDisplayStatus,
): string | undefined {
  switch (status) {
    case "waiting_input":
      return "任务正在等待补充信息。请选择“补充输入”，说明下一步所需内容。";
    case "waiting_confirmation":
      return "请检查下方操作的目标、风险和后果；允许或拒绝只作用于这一次操作。";
    case "recovering":
      return "Local Core 正从持久记录恢复任务，无需重复提交；恢复完成后状态会自动刷新。";
    case "manual_attention":
      return "外部结果无法安全确认。请检查已完成内容，再决定是否重试或人工处理。";
    case "timed_out":
      return "任务执行超时，可重试。";
    case "preparing":
    case "queued":
    case "running":
    case "completed":
    case "failed":
    case "cancelled":
      return undefined;
    default:
      return assertNever(status);
  }
}

export function isTerminalTaskStatus(status: TaskDisplayStatus): boolean {
  switch (status) {
    case "completed":
    case "failed":
    case "cancelled":
    case "timed_out":
      return true;
    case "preparing":
    case "queued":
    case "running":
    case "waiting_input":
    case "waiting_confirmation":
    case "recovering":
    case "manual_attention":
      return false;
    default:
      return assertNever(status);
  }
}

export function taskControlVisibility(
  status: TaskDisplayStatus,
): TaskControlVisibility {
  return {
    canCancel: !isTerminalTaskStatus(status),
    canRetry: canRetryTask(status),
    canContinue: canContinueTask(status),
    canProvideInput: canProvideTaskInput(status),
  };
}

export function taskStatusTone(status: TaskDisplayStatus): TaskStatusTone {
  switch (status) {
    case "preparing":
    case "queued":
    case "running":
    case "recovering":
      return "active";
    case "waiting_input":
    case "waiting_confirmation":
    case "manual_attention":
      return "attention";
    case "completed":
      return "completed";
    case "failed":
    case "cancelled":
    case "timed_out":
      return "failed";
    default:
      return assertNever(status);
  }
}

export function taskStatusIcon(status: TaskDisplayStatus): string {
  switch (status) {
    case "preparing":
    case "queued":
      return "…";
    case "running":
    case "recovering":
      return "↗";
    case "waiting_input":
    case "waiting_confirmation":
    case "manual_attention":
      return "!";
    case "completed":
      return "✓";
    case "failed":
    case "timed_out":
      return "✕";
    case "cancelled":
      return "−";
    default:
      return assertNever(status);
  }
}

function canRetryTask(status: TaskDisplayStatus): boolean {
  switch (status) {
    case "failed":
    case "cancelled":
    case "timed_out":
      return true;
    case "preparing":
    case "queued":
    case "running":
    case "waiting_input":
    case "waiting_confirmation":
    case "recovering":
    case "completed":
    case "manual_attention":
      return false;
    default:
      return assertNever(status);
  }
}

function canContinueTask(status: TaskDisplayStatus): boolean {
  switch (status) {
    case "recovering":
      return true;
    case "preparing":
    case "queued":
    case "running":
    case "waiting_input":
    case "waiting_confirmation":
    case "completed":
    case "failed":
    case "cancelled":
    case "timed_out":
    case "manual_attention":
      return false;
    default:
      return assertNever(status);
  }
}

function canProvideTaskInput(status: TaskDisplayStatus): boolean {
  switch (status) {
    case "waiting_input":
      return true;
    case "preparing":
    case "queued":
    case "running":
    case "waiting_confirmation":
    case "recovering":
    case "completed":
    case "failed":
    case "cancelled":
    case "timed_out":
    case "manual_attention":
      return false;
    default:
      return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled task display status: ${String(value)}`);
}
