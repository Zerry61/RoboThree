import type { ArtifactPreviewMode, ToolActivityProjection } from "@robothree/contracts";

export const WORKSPACE_TEXT_WRITE_OPERATION =
  "tool.workspace.file.write_text" as const;

export type WorkspaceTextWriteActivityPresentation = Readonly<{
  activityId: string;
  title: string;
  target: string;
  tone: "neutral" | "warning" | "danger" | "success";
  updatedAt: string;
}>;

export type WorkbenchArtifactOpenDecision =
  | Readonly<{ kind: "html" }>
  | Readonly<{ kind: "text"; mode: ArtifactPreviewMode }>
  | Readonly<{ kind: "open_location" }>;

export function presentWorkspaceTextWriteActivities(
  activities: readonly ToolActivityProjection[],
): readonly WorkspaceTextWriteActivityPresentation[] {
  return activities
    .filter((activity) => activity.operationType === WORKSPACE_TEXT_WRITE_OPERATION)
    .slice()
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)
      || left.activityId.localeCompare(right.activityId))
    .map(presentWorkspaceTextWriteActivity);
}

export function decideWorkbenchArtifactOpen(
  artifact: Readonly<{ kind: string }>,
): WorkbenchArtifactOpenDecision {
  switch (artifact.kind) {
    case "html":
      return { kind: "html" };
    case "markdown":
      return { kind: "text", mode: "markdown" };
    case "text":
      return { kind: "text", mode: "text" };
    default:
      return { kind: "open_location" };
  }
}

function presentWorkspaceTextWriteActivity(
  activity: ToolActivityProjection,
): WorkspaceTextWriteActivityPresentation {
  const target = activity.targetSummary?.trim() || "工作区文件";
  switch (activity.status) {
    case "preparing":
      return presentation(activity, "正在准备文件", target, "neutral");
    case "waiting_confirmation":
      return presentation(activity, "等待确认", target, "warning");
    case "running":
      return presentation(activity, "正在写入文件", target, "neutral");
    case "completed":
      return presentation(activity, "文件已生成", target, "success");
    case "failed":
      return presentation(activity, "文件生成失败", target, "danger");
    case "cancelled":
      return presentation(activity, "已取消文件生成", target, "neutral");
    case "timed_out":
      return presentation(activity, "文件生成超时", target, "danger");
    case "uncertain":
      return presentation(activity, "写入结果需要确认", target, "warning");
  }
}

function presentation(
  activity: ToolActivityProjection,
  title: string,
  target: string,
  tone: WorkspaceTextWriteActivityPresentation["tone"],
): WorkspaceTextWriteActivityPresentation {
  return {
    activityId: activity.activityId,
    title,
    target,
    tone,
    updatedAt: activity.updatedAt,
  };
}
