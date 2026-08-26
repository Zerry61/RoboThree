import type {
  RuntimeStatusProjection,
  WorkspaceGrantProjection,
} from "@robothree/contracts";

export type ShellRuntimePresentation = Readonly<{
  isReady: boolean;
  sidebarStatusLabel: string;
  corePillLabel: string;
  enterpriseConfigPillLabel: string;
}>;

export function presentShellRuntime(
  runtime: RuntimeStatusProjection | undefined,
): ShellRuntimePresentation {
  const isReady = runtime?.status === "ready";
  return {
    isReady,
    sidebarStatusLabel: isReady ? "Local Core 已就绪" : "连接 Local Core",
    corePillLabel: isReady ? "就绪" : "连接中",
    enterpriseConfigPillLabel: runtime?.pendingRuntimeActivation
      ? "待激活"
      : "本地基线",
  };
}

export function workspaceOptionLabel(
  workspace: Pick<WorkspaceGrantProjection, "displayName" | "rootDisplayPath">,
): string {
  return `${workspace.displayName} · ${workspace.rootDisplayPath}`;
}
