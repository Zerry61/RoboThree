import type { ToolActivityProjection } from "@robothree/contracts";

export type ToolActivityPresentationStatus =
  | ToolActivityProjection["status"]
  | "manual_attention";

export type ToolActivityPresentationInput = Readonly<
  Omit<ToolActivityProjection, "status">
  & { status: ToolActivityPresentationStatus }
>;

export type ToolActivityTone =
  | "manual_attention"
  | "failed"
  | "waiting_confirmation"
  | "running"
  | "completed";

export type ToolActivityMetaItem = Readonly<{
  label: string;
  value: string;
}>;

export type ToolActivityPresentation = Readonly<{
  statusLabel: string;
  tone: ToolActivityTone;
  statusIcon: string;
  summary: string;
  meta: readonly ToolActivityMetaItem[];
}>;

export function presentToolActivity(
  activity: ToolActivityPresentationInput,
): ToolActivityPresentation {
  const statusLabel = toolActivityStatusLabel(activity.status);
  return {
    statusLabel,
    tone: toolActivityTone(activity.status),
    statusIcon: toolActivityStatusIcon(activity.status),
    summary: activity.statusSummary ?? statusLabel,
    meta: toolActivityMeta(activity),
  };
}

export function toolActivityStatusLabel(
  status: ToolActivityPresentationStatus,
): string {
  switch (status) {
    case "uncertain":
    case "manual_attention":
      return "需要人工处理";
    case "preparing":
      return "准备中";
    case "waiting_confirmation":
      return "等待确认";
    case "running":
      return "执行中";
    case "completed":
      return "成功";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "timed_out":
      return "超时";
    default:
      return assertNever(status);
  }
}

export function toolActivityTone(
  status: ToolActivityPresentationStatus,
): ToolActivityTone {
  switch (status) {
    case "manual_attention":
    case "uncertain":
      return "manual_attention";
    case "failed":
    case "timed_out":
      return "failed";
    case "waiting_confirmation":
      return "waiting_confirmation";
    case "running":
      return "running";
    case "preparing":
    case "completed":
    case "cancelled":
      return "completed";
    default:
      return assertNever(status);
  }
}

export function toolActivityStatusIcon(
  status: ToolActivityPresentationStatus,
): string {
  switch (status) {
    case "manual_attention":
    case "uncertain":
    case "waiting_confirmation":
      return "!";
    case "running":
      return "↗";
    case "completed":
      return "✓";
    case "failed":
    case "timed_out":
      return "✕";
    case "cancelled":
      return "−";
    case "preparing":
      return "…";
    default:
      return assertNever(status);
  }
}

export function toolActivityMeta(
  activity: Pick<ToolActivityPresentationInput, "targetSummary" | "safetySummary">,
): readonly ToolActivityMetaItem[] {
  const meta: ToolActivityMetaItem[] = [];
  if (activity.targetSummary !== undefined) {
    meta.push({ label: "目标", value: activity.targetSummary });
  }
  if (activity.safetySummary !== undefined) {
    meta.push({ label: "安全", value: activity.safetySummary });
  }
  return meta;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled tool activity status: ${String(value)}`);
}
