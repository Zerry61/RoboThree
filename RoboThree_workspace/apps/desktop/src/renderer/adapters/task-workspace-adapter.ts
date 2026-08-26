import type {
  CompatibilityProjectionV1Alpha2,
  DesktopErrorEnvelopeV1Alpha2,
  TaskWorkspaceOpenReceipt,
  WorkspaceDirectoryProjection,
} from "@robothree/contracts";
import type { InjectionKey } from "vue";

import type {
  RendererSafeResultV1Alpha2,
  RoboThreeDesktopApiV1Alpha2,
} from "../../shared/foundation-api.js";

declare global {
  interface Window {
    readonly robothreeDesktopV1Alpha2?: RoboThreeDesktopApiV1Alpha2;
  }
}

export type TaskWorkspaceCompatibility = Readonly<{
  contractVersion: "v1alpha2";
  runtimeInstanceId: string;
  browserAvailable: boolean;
  revealAvailable: boolean;
  reasonCode: string | undefined;
  safeSummary: string | undefined;
}>;

export type TaskWorkspaceAdapter = {
  negotiate(): Promise<TaskWorkspaceCompatibility>;
  listEntries(input: {
    taskId: string;
    parentEntryId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<WorkspaceDirectoryProjection>;
  openTaskWorkspaceLocation(input: {
    taskId: string;
  }): Promise<TaskWorkspaceOpenReceipt>;
};

export const taskWorkspaceAdapterKey: InjectionKey<TaskWorkspaceAdapter> =
  Symbol("RoboThreeTaskWorkspaceAdapter");

const clientInstanceId = randomId();

export const desktopTaskWorkspaceAdapter: TaskWorkspaceAdapter = {
  async negotiate(): Promise<TaskWorkspaceCompatibility> {
    const api = getDesktopApi();
    if (api === undefined) {
      return unavailableCompatibility("contract.feature_unavailable", "工作空间文件浏览接口不可用。");
    }
    const compatibility = await accept(api.getCompatibility({
      ...queryMeta(),
      supportedContractVersions: ["v1alpha2", "v1alpha1"],
    }));
    return presentCompatibility(compatibility);
  },

  async listEntries(input): Promise<WorkspaceDirectoryProjection> {
    const api = requireDesktopApi();
    return accept(api.listWorkspaceEntries({
      ...queryMeta(),
      type: "list_workspace_entries",
      taskId: input.taskId,
      ...(input.parentEntryId === undefined ? {} : { parentEntryId: input.parentEntryId }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    }));
  },

  async openTaskWorkspaceLocation(input): Promise<TaskWorkspaceOpenReceipt> {
    const api = requireDesktopApi();
    return accept(api.openTaskWorkspaceLocation({
      ...commandMeta(),
      type: "open_task_workspace_location",
      taskId: input.taskId,
    }));
  },
};

function presentCompatibility(
  compatibility: CompatibilityProjectionV1Alpha2,
): TaskWorkspaceCompatibility {
  const selected = compatibility.selectedContractVersion === "v1alpha2";
  const browserAvailable = selected
    && compatibility.features.includes("task_workspace_browser");
  const revealAvailable = selected
    && compatibility.features.includes("task_workspace_reveal");
  return {
    contractVersion: "v1alpha2",
    runtimeInstanceId: compatibility.runtimeInstanceId,
    browserAvailable,
    revealAvailable,
    reasonCode: browserAvailable ? undefined : "contract.feature_unavailable",
    safeSummary: browserAvailable ? undefined : "工作空间文件浏览能力尚未启用。",
  };
}

function unavailableCompatibility(
  reasonCode: string,
  safeSummary: string,
): TaskWorkspaceCompatibility {
  return {
    contractVersion: "v1alpha2",
    runtimeInstanceId: "",
    browserAvailable: false,
    revealAvailable: false,
    reasonCode,
    safeSummary,
  };
}

async function accept<T>(
  operation: Promise<RendererSafeResultV1Alpha2<T>>,
): Promise<T> {
  const result = await operation;
  if (!result.ok) {
    throw new DesktopTaskWorkspaceAdapterError(result.error);
  }
  return result.value;
}

function getDesktopApi(): RoboThreeDesktopApiV1Alpha2 | undefined {
  return window.robothreeDesktopV1Alpha2;
}

function requireDesktopApi(): RoboThreeDesktopApiV1Alpha2 {
  const api = getDesktopApi();
  if (api === undefined) {
    throw new DesktopTaskWorkspaceAdapterError({
      contractVersion: "v1alpha2",
      code: "contract.feature_unavailable",
      category: "compatibility",
      safeSummary: "工作空间文件浏览接口不可用。",
      retryable: false,
      correlationId: randomId(),
    });
  }
  return api;
}

function queryMeta() {
  return {
    contractVersion: "v1alpha2" as const,
    queryId: randomId(),
    correlationId: randomId(),
    clientInstanceId,
  };
}

function commandMeta() {
  return {
    contractVersion: "v1alpha2" as const,
    commandId: randomId(),
    correlationId: randomId(),
    clientInstanceId,
  };
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? "00000000-0000-4000-8000-000000000000".replace(/[08]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      const value = char === "0" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
}

export class DesktopTaskWorkspaceAdapterError extends Error {
  readonly code: string;
  readonly category: DesktopErrorEnvelopeV1Alpha2["category"];
  readonly retryable: boolean;

  constructor(error: DesktopErrorEnvelopeV1Alpha2) {
    super(error.safeSummary);
    this.name = "DesktopTaskWorkspaceAdapterError";
    this.code = error.code;
    this.category = error.category;
    this.retryable = error.retryable;
  }
}
