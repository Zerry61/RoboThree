import type {
  SessionSummary,
  TaskSummaryProjection,
  WorkspaceGrantProjection,
} from "@robothree/contracts";
import type { InjectionKey } from "vue";

import type {
  RendererSafeResult,
  RoboThreeDesktopApiV1Alpha1,
} from "../../shared/foundation-api.js";

declare global {
  interface Window {
    readonly robothreeDesktop: RoboThreeDesktopApiV1Alpha1;
  }
}

export type ShellNavigationData = Readonly<{
  workspaces: readonly WorkspaceGrantProjection[];
  sessions: readonly SessionSummary[];
  tasks: readonly TaskSummaryProjection[];
}>;

export type ShellNavigationAdapter = Readonly<{
  loadNavigation(): Promise<ShellNavigationData>;
}>;

export const shellNavigationAdapterKey: InjectionKey<ShellNavigationAdapter> =
  Symbol("RoboThreeShellNavigationAdapter");

const clientInstanceId = randomId();

export const desktopShellNavigationAdapter: ShellNavigationAdapter = {
  async loadNavigation(): Promise<ShellNavigationData> {
    const api = window.robothreeDesktop;
    const [workspaces, sessions, tasks] = await Promise.all([
      accept(api.listWorkspaceGrants({
        ...queryMeta(),
        type: "list_workspace_grants",
      })),
      accept(api.listSessions({
        ...queryMeta(),
        type: "list_sessions",
      })),
      accept(api.listTasks({
        ...queryMeta(),
        type: "list_tasks",
        limit: 40,
      })),
    ]);

    return {
      workspaces: workspaces.filter((workspace) => workspace.status === "active"),
      sessions: sessions.filter((session) => !session.tombstoned),
      tasks,
    };
  },
};

async function accept<T>(operation: Promise<RendererSafeResult<T>>): Promise<T> {
  const result = await operation;
  if (!result.ok) throw new Error(result.error.safeSummary);
  return result.value;
}

function queryMeta() {
  return {
    contractVersion: "v1alpha1" as const,
    queryId: randomId(),
    correlationId: randomId(),
    clientInstanceId,
  };
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? "00000000-0000-4000-8000-000000000000";
}
