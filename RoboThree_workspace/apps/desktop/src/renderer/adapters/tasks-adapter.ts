import type {
  ArtifactExportReceipt,
  ArtifactHtmlPreviewProjection,
  ArtifactLifecycleReceipt,
  ArtifactOpenLocationReceipt,
  ArtifactPreviewMode,
  ArtifactTextPreviewProjection,
  ConversationSnapshot,
  SessionSummary,
  TaskDetailProjection,
  TaskControlReceipt,
  TaskSummaryProjection,
  UserConfirmationProjection,
} from "@robothree/contracts";
import type { InjectionKey } from "vue";
import type { TaskReasoningModeProjectionV1Alpha1 } from
  "@robothree/contracts/desktop-local/task-reasoning/v1alpha1";

import type {
  DesktopRendererEvent,
  RendererSafeResult,
  RoboThreeDesktopApiV1Alpha1,
} from "../../shared/foundation-api.js";
import { desktopReasoningModeAdapter } from "./reasoning-mode-adapter.js";

declare global {
  interface Window {
    readonly robothreeDesktop: RoboThreeDesktopApiV1Alpha1;
  }
}

export type TasksAdapterData = {
  sessions: readonly SessionSummary[];
  tasks: readonly TaskSummaryProjection[];
};

export type TasksAdapter = {
  loadTasks(): Promise<TasksAdapterData>;
  loadConversation(sessionId: string): Promise<ConversationSnapshot>;
  loadTaskDetail(taskId: string): Promise<TaskDetailProjection>;
  loadTaskReasoning(taskId: string): Promise<TaskReasoningModeProjectionV1Alpha1>;
  openTask(sessionId: string): Promise<SessionSummary>;
  renameTask(input: {
    sessionId: string;
    expectedRevision: number;
    title: string;
  }): Promise<SessionSummary>;
  deleteTask(input: {
    sessionId: string;
    expectedRevision: number;
  }): Promise<SessionSummary>;
  cancelTask(input: {
    taskId: string;
    expectedTaskRevision: number;
  }): Promise<TaskControlReceipt>;
  retryTask(input: {
    taskId: string;
    expectedTaskRevision: number;
  }): Promise<TaskControlReceipt>;
  continueTask(input: {
    taskId: string;
    expectedTaskRevision: number;
  }): Promise<TaskControlReceipt>;
  provideTaskInput(input: {
    taskId: string;
    expectedTaskRevision: number;
    input: string;
  }): Promise<TaskControlReceipt>;
  decideUserConfirmation(input: {
    taskId: string;
    expectedTaskRevision: number;
    confirmation: Pick<UserConfirmationProjection, "confirmationId" | "requestDigest">;
    decision: "confirmed" | "rejected";
  }): Promise<TaskControlReceipt>;
  previewArtifact(input: {
    artifactId: string;
    mode: ArtifactPreviewMode;
  }): Promise<ArtifactTextPreviewProjection>;
  startArtifactHtmlPreview(input: {
    artifactId: string;
  }): Promise<ArtifactHtmlPreviewProjection>;
  closeArtifactPreview(input: {
    previewSessionId: string;
  }): Promise<void>;
  setArtifactLifecycle(input: {
    artifactId: string;
    pinned?: boolean;
    dismissed?: boolean;
  }): Promise<ArtifactLifecycleReceipt>;
  openArtifactLocation(input: {
    artifactId: string;
  }): Promise<ArtifactOpenLocationReceipt>;
  exportArtifact(input: {
    artifactId: string;
  }): Promise<ArtifactExportReceipt>;
  subscribe(handler: (event: DesktopRendererEvent) => void): () => void;
};

export const tasksAdapterKey: InjectionKey<TasksAdapter> =
  Symbol("RoboThreeTasksAdapter");

const clientInstanceId = randomId();

export const desktopTasksAdapter: TasksAdapter = {
  async loadTasks(): Promise<TasksAdapterData> {
    const api = getDesktopApi();
    const [sessions, tasks] = await Promise.all([
      accept(api.listSessions({
        ...queryMeta(),
        type: "list_sessions",
      })),
      accept(api.listTasks({
        ...queryMeta(),
        type: "list_tasks",
        limit: 200,
      })),
    ]);
    return {
      sessions: sessions.filter((session) => !session.tombstoned),
      tasks,
    };
  },

  async loadConversation(sessionId: string): Promise<ConversationSnapshot> {
    return accept(getDesktopApi().loadConversationSnapshot({
      ...queryMeta(),
      type: "conversation_snapshot",
      sessionId,
      limit: 200,
    }));
  },

  async loadTaskDetail(taskId: string): Promise<TaskDetailProjection> {
    return accept(getDesktopApi().loadTaskDetail({
      ...queryMeta(),
      type: "task_detail",
      taskId,
    }));
  },

  async loadTaskReasoning(taskId: string): Promise<TaskReasoningModeProjectionV1Alpha1> {
    return desktopReasoningModeAdapter.loadTaskReasoning({ taskId });
  },

  async openTask(sessionId: string): Promise<SessionSummary> {
    return accept(getDesktopApi().openSession({
      ...queryMeta(),
      type: "open_session",
      sessionId,
    }));
  },

  async renameTask(input): Promise<SessionSummary> {
    return accept(getDesktopApi().renameSession({
      ...commandMeta(),
      type: "rename_session",
      sessionId: input.sessionId,
      expectedRevision: input.expectedRevision,
      title: input.title,
    }));
  },

  async deleteTask(input): Promise<SessionSummary> {
    return accept(getDesktopApi().deleteSession({
      ...commandMeta(),
      type: "delete_session",
      sessionId: input.sessionId,
      expectedRevision: input.expectedRevision,
    }));
  },

  async cancelTask(input): Promise<TaskControlReceipt> {
    return accept(getDesktopApi().controlTask({
      ...commandMeta(),
      type: "cancel_task",
      taskId: input.taskId,
      expectedTaskRevision: input.expectedTaskRevision,
      reasonSummary: "Cancelled by the Desktop user.",
    }));
  },

  async retryTask(input): Promise<TaskControlReceipt> {
    return accept(getDesktopApi().controlTask({
      ...commandMeta(),
      type: "retry_task",
      taskId: input.taskId,
      expectedTaskRevision: input.expectedTaskRevision,
    }));
  },

  async continueTask(input): Promise<TaskControlReceipt> {
    return accept(getDesktopApi().controlTask({
      ...commandMeta(),
      type: "continue_task",
      taskId: input.taskId,
      expectedTaskRevision: input.expectedTaskRevision,
    }));
  },

  async provideTaskInput(input): Promise<TaskControlReceipt> {
    return accept(getDesktopApi().controlTask({
      ...commandMeta(),
      type: "provide_task_input",
      taskId: input.taskId,
      expectedTaskRevision: input.expectedTaskRevision,
      input: input.input,
    }));
  },

  async decideUserConfirmation(input): Promise<TaskControlReceipt> {
    return accept(getDesktopApi().controlTask({
      ...commandMeta(),
      type: "decide_user_confirmation",
      taskId: input.taskId,
      expectedTaskRevision: input.expectedTaskRevision,
      confirmationId: input.confirmation.confirmationId,
      requestDigest: input.confirmation.requestDigest,
      decision: input.decision,
    }));
  },

  async previewArtifact(input): Promise<ArtifactTextPreviewProjection> {
    return accept(getDesktopApi().previewArtifact({
      ...queryMeta(),
      type: "artifact_preview",
      artifactId: input.artifactId,
      mode: input.mode,
      maxBytes: 16 * 1024,
    }));
  },

  async startArtifactHtmlPreview(input): Promise<ArtifactHtmlPreviewProjection> {
    return accept(getDesktopApi().startArtifactHtmlPreview({
      ...queryMeta(),
      type: "artifact_html_preview",
      artifactId: input.artifactId,
      maxBytes: 16 * 1024,
      ttlMs: 5 * 60 * 1_000,
    }));
  },

  async closeArtifactPreview(input): Promise<void> {
    await accept(getDesktopApi().closeArtifactPreview({
      ...commandMeta(),
      type: "close_artifact_preview",
      previewSessionId: input.previewSessionId,
    }));
  },

  async setArtifactLifecycle(input): Promise<ArtifactLifecycleReceipt> {
    return accept(getDesktopApi().setArtifactLifecycle({
      ...commandMeta(),
      type: "set_artifact_lifecycle",
      artifactId: input.artifactId,
      ...(input.pinned === undefined ? {} : { pinned: input.pinned }),
      ...(input.dismissed === undefined ? {} : { dismissed: input.dismissed }),
    }));
  },

  async openArtifactLocation(input): Promise<ArtifactOpenLocationReceipt> {
    return accept(getDesktopApi().openArtifactLocation({
      ...commandMeta(),
      type: "open_artifact_location",
      artifactId: input.artifactId,
    }));
  },

  async exportArtifact(input): Promise<ArtifactExportReceipt> {
    return accept(getDesktopApi().exportArtifact({
      ...commandMeta(),
      type: "export_artifact",
      artifactId: input.artifactId,
    }));
  },

  subscribe(handler): () => void {
    return getDesktopApi().onDesktopEvent(handler);
  },
};

async function accept<T>(operation: Promise<RendererSafeResult<T>>): Promise<T> {
  const result = await operation;
  if (!result.ok) {
    throw new DesktopTasksAdapterError(result.error.safeSummary);
  }
  return result.value;
}

function getDesktopApi(): RoboThreeDesktopApiV1Alpha1 {
  return window.robothreeDesktop;
}

function queryMeta() {
  return {
    contractVersion: "v1alpha1" as const,
    queryId: randomId(),
    correlationId: randomId(),
    clientInstanceId,
  };
}

function commandMeta() {
  return {
    contractVersion: "v1alpha1" as const,
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

export class DesktopTasksAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesktopTasksAdapterError";
  }
}
