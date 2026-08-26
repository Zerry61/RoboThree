import type {
  WorkspaceDirectoryProjection,
  WorkspaceEntryProjection,
} from "@robothree/contracts";

import { DesktopTaskWorkspaceAdapterError } from "../../adapters/task-workspace-adapter.js";

export type TaskWorkspaceEntryView = Readonly<{
  id: string;
  displayName: string;
  kind: WorkspaceEntryProjection["kind"];
  kindLabel: string;
  navigable: boolean;
  meta: string;
  unavailableReason: string | undefined;
}>;

export type TaskWorkspaceDirectoryView = Readonly<{
  breadcrumbLabel: string;
  entries: readonly TaskWorkspaceEntryView[];
  empty: boolean;
  nextCursor: string | undefined;
  truncated: boolean;
  snapshotDigest: string;
}>;

export type TaskWorkspaceErrorView = Readonly<{
  state: "permission_denied" | "unavailable" | "error";
  title: string;
  description: string;
  retryable: boolean;
}>;

export function buildTaskWorkspaceDirectoryView(
  projection: WorkspaceDirectoryProjection,
): TaskWorkspaceDirectoryView {
  return {
    breadcrumbLabel: projection.breadcrumbDisplayNames.length === 0
      ? "工作空间"
      : projection.breadcrumbDisplayNames.join(" / "),
    entries: projection.entries.map(presentEntry),
    empty: projection.entries.length === 0,
    nextCursor: projection.nextCursor,
    truncated: projection.truncated,
    snapshotDigest: projection.snapshotDigest,
  };
}

export function presentEntry(
  entry: WorkspaceEntryProjection,
): TaskWorkspaceEntryView {
  return {
    id: entry.entryId,
    displayName: entry.displayName,
    kind: entry.kind,
    kindLabel: entry.kind === "directory"
      ? "文件夹"
      : entry.kind === "file" ? "文件" : "链接",
    navigable: entry.kind === "directory" && entry.navigable,
    meta: entry.kind === "file"
      ? formatFileMeta(entry)
      : entry.kind === "directory" ? "可进入" : "不可导航",
    unavailableReason: entry.unavailableReason === undefined
      ? undefined
      : presentUnavailableReason(entry.unavailableReason),
  };
}

export function presentWorkspaceError(caught: unknown): TaskWorkspaceErrorView {
  if (caught instanceof DesktopTaskWorkspaceAdapterError) {
    if (caught.category === "authorization") {
      return {
        state: "permission_denied",
        title: "没有权限查看工作空间文件",
        description: caught.message || "当前任务没有可用的工作空间授权。",
        retryable: caught.retryable,
      };
    }
    if (
      caught.category === "compatibility"
      || caught.category === "availability"
      || caught.code === "contract.feature_unavailable"
    ) {
      return {
        state: "unavailable",
        title: "工作空间文件不可用",
        description: caught.message || "当前运行时尚未提供工作空间文件浏览能力。",
        retryable: caught.retryable,
      };
    }
    if (caught.code === "workspace.browser_cursor_stale") {
      return {
        state: "unavailable",
        title: "目录快照已变化",
        description: "已重新加载当前目录，请再试一次。",
        retryable: false,
      };
    }
    return {
      state: "error",
      title: "工作空间文件加载失败",
      description: caught.message || "请刷新后再试。",
      retryable: caught.retryable,
    };
  }
  return {
    state: "error",
    title: "工作空间文件加载失败",
    description: "请刷新后再试。",
    retryable: false,
  };
}

export function presentUnavailableReason(reason: string): string {
  switch (reason) {
    case "workspace_entry.symlink":
    case "workspace.symlink":
      return "链接不可导航";
    case "workspace_entry.permission_denied":
    case "workspace.permission_denied":
      return "权限不足";
    case "workspace_entry.unavailable":
    case "workspace.unavailable":
      return "暂不可用";
    default:
      return "不可导航";
  }
}

function formatFileMeta(entry: WorkspaceEntryProjection): string {
  const size = entry.sizeBytes === undefined ? "大小未知" : formatBytes(entry.sizeBytes);
  if (entry.modifiedAt === undefined) return size;
  const timestamp = Date.parse(entry.modifiedAt);
  if (Number.isNaN(timestamp)) return size;
  const modified = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
  return `${size} · ${modified}`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
