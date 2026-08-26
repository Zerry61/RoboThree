// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import {
  desktopTasksAdapter,
} from "../src/renderer/adapters/tasks-adapter.js";

const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value });
const timestamp = "2026-08-16T00:00:00.000Z";

describe("DFE-2B tasks adapter", () => {
  it("loads sessions and task summaries through existing Desktop APIs", async () => {
    const api = installDesktopApi();
    const data = await desktopTasksAdapter.loadTasks();

    expect(api.listSessions).toHaveBeenCalledWith(expect.objectContaining({
      type: "list_sessions",
    }));
    expect(api.listTasks).toHaveBeenCalledWith(expect.objectContaining({
      type: "list_tasks",
      limit: 200,
    }));
    expect(data.sessions).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain("workspaceRoot");
  });

  it("loads task detail and conversation through existing queries", async () => {
    const api = installDesktopApi();
    await desktopTasksAdapter.loadConversation("session:one");
    await desktopTasksAdapter.loadTaskDetail("task:one");

    expect(api.loadConversationSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      type: "conversation_snapshot",
      sessionId: "session:one",
      limit: 200,
    }));
    expect(api.loadTaskDetail).toHaveBeenCalledWith(expect.objectContaining({
      type: "task_detail",
      taskId: "task:one",
    }));
  });

  it("renames, deletes and controls tasks with existing high-level commands", async () => {
    const api = installDesktopApi();
    await desktopTasksAdapter.renameTask({
      sessionId: "session:one",
      expectedRevision: 3,
      title: "New title",
    });
    await desktopTasksAdapter.deleteTask({
      sessionId: "session:one",
      expectedRevision: 4,
    });
    await desktopTasksAdapter.cancelTask({
      taskId: "task:one",
      expectedTaskRevision: 5,
    });
    await desktopTasksAdapter.retryTask({
      taskId: "task:one",
      expectedTaskRevision: 6,
    });
    await desktopTasksAdapter.continueTask({
      taskId: "task:one",
      expectedTaskRevision: 7,
    });
    await desktopTasksAdapter.provideTaskInput({
      taskId: "task:one",
      expectedTaskRevision: 8,
      input: "More context",
    });
    await desktopTasksAdapter.decideUserConfirmation({
      taskId: "task:one",
      expectedTaskRevision: 9,
      confirmation: {
        confirmationId: "confirmation:one",
        requestDigest: "a".repeat(64),
      },
      decision: "confirmed",
    });

    expect(api.renameSession).toHaveBeenCalledWith(expect.objectContaining({
      type: "rename_session",
      sessionId: "session:one",
      expectedRevision: 3,
      title: "New title",
    }));
    expect(api.deleteSession).toHaveBeenCalledWith(expect.objectContaining({
      type: "delete_session",
      sessionId: "session:one",
      expectedRevision: 4,
    }));
    expect(api.controlTask).toHaveBeenCalledWith(expect.objectContaining({
      type: "cancel_task",
      taskId: "task:one",
      expectedTaskRevision: 5,
    }));
    expect(api.controlTask).toHaveBeenCalledWith(expect.objectContaining({
      type: "retry_task",
      expectedTaskRevision: 6,
    }));
    expect(api.controlTask).toHaveBeenCalledWith(expect.objectContaining({
      type: "continue_task",
      expectedTaskRevision: 7,
    }));
    expect(api.controlTask).toHaveBeenCalledWith(expect.objectContaining({
      type: "provide_task_input",
      input: "More context",
    }));
    expect(api.controlTask).toHaveBeenCalledWith(expect.objectContaining({
      type: "decide_user_confirmation",
      confirmationId: "confirmation:one",
      requestDigest: "a".repeat(64),
      decision: "confirmed",
    }));
  });

  it("subscribes through the existing Desktop event bridge", () => {
    const api = installDesktopApi();
    const unsubscribe = desktopTasksAdapter.subscribe(() => {});

    expect(api.onDesktopEvent).toHaveBeenCalledOnce();
    unsubscribe();
    expect(api.unsubscribe).toHaveBeenCalledOnce();
  });

  it("uses existing pathless artifact APIs for preview, lifecycle, open and export", async () => {
    const api = installDesktopApi();
    const artifactId = `artifact:${"a".repeat(64)}`;

    await desktopTasksAdapter.previewArtifact({ artifactId, mode: "markdown" });
    await desktopTasksAdapter.startArtifactHtmlPreview({ artifactId });
    await desktopTasksAdapter.closeArtifactPreview({
      previewSessionId: "preview:00000000-0000-4000-8000-000000000001",
    });
    await desktopTasksAdapter.setArtifactLifecycle({ artifactId, pinned: true });
    await desktopTasksAdapter.openArtifactLocation({ artifactId });
    await desktopTasksAdapter.exportArtifact({ artifactId });

    expect(api.previewArtifact).toHaveBeenCalledWith(expect.objectContaining({
      type: "artifact_preview",
      artifactId,
      mode: "markdown",
      maxBytes: 16 * 1024,
    }));
    expect(api.startArtifactHtmlPreview).toHaveBeenCalledWith(expect.objectContaining({
      type: "artifact_html_preview",
      artifactId,
      ttlMs: 5 * 60 * 1_000,
    }));
    expect(api.closeArtifactPreview).toHaveBeenCalledWith(expect.objectContaining({
      type: "close_artifact_preview",
      previewSessionId: "preview:00000000-0000-4000-8000-000000000001",
    }));
    expect(api.setArtifactLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      type: "set_artifact_lifecycle",
      artifactId,
      pinned: true,
    }));
    expect(api.openArtifactLocation).toHaveBeenCalledWith(expect.objectContaining({
      type: "open_artifact_location",
      artifactId,
    }));
    expect(api.exportArtifact).toHaveBeenCalledWith(expect.objectContaining({
      type: "export_artifact",
      artifactId,
    }));
    expect(JSON.stringify([
      api.previewArtifact.mock.calls,
      api.startArtifactHtmlPreview.mock.calls,
      api.setArtifactLifecycle.mock.calls,
      api.openArtifactLocation.mock.calls,
      api.exportArtifact.mock.calls,
    ])).not.toMatch(/workspaceRoot|rootRealPath|selectionHandle/u);
  });
});

function installDesktopApi() {
  const session = {
    sessionId: "session:one",
    revision: 1,
    title: "Report",
    tombstoned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const api = {
    listSessions: vi.fn(() => ok([session])),
    listTasks: vi.fn(() => ok([])),
    loadConversationSnapshot: vi.fn(() => ok({
      sessionId: "session:one",
      sessionRevision: 1,
      messages: [],
      activeTaskSummaries: [],
      latestDurableCursor: "cursor:one",
      hasMoreBefore: false,
    })),
    loadTaskDetail: vi.fn(() => ok(taskDetail())),
    previewArtifact: vi.fn(() => ok({
      artifactId: `artifact:${"a".repeat(64)}`,
      mode: "markdown",
      content: "## Report",
      byteSize: new TextEncoder().encode("## Report").byteLength,
      truncated: false,
      warnings: [],
    })),
    startArtifactHtmlPreview: vi.fn(() => ok({
      artifactId: `artifact:${"a".repeat(64)}`,
      previewSessionId: "preview:00000000-0000-4000-8000-000000000001",
      localOrigin: "http://127.0.0.1",
      previewUrl: "http://127.0.0.1:49152/preview/token/index.html",
      csp: "default-src 'none'",
      expiresAt: timestamp,
      warnings: [],
    })),
    closeArtifactPreview: vi.fn(() => ok({
      commandId: "00000000-0000-4000-8000-000000000010",
      previewSessionId: "preview:00000000-0000-4000-8000-000000000001",
      closed: true,
    })),
    setArtifactLifecycle: vi.fn(() => ok({
      commandId: "00000000-0000-4000-8000-000000000011",
      artifactId: `artifact:${"a".repeat(64)}`,
      status: "accepted",
      lifecycle: {
        revision: 2,
        pinned: true,
        dismissed: false,
        deleted: false,
        sourceDeleted: false,
      },
    })),
    openArtifactLocation: vi.fn(() => ok({
      commandId: "00000000-0000-4000-8000-000000000012",
      artifactId: `artifact:${"a".repeat(64)}`,
      opened: true,
    })),
    exportArtifact: vi.fn(() => ok({
      commandId: "00000000-0000-4000-8000-000000000013",
      artifactId: `artifact:${"a".repeat(64)}`,
      exported: true,
      fileName: "report.md",
    })),
    openSession: vi.fn(() => ok(session)),
    renameSession: vi.fn(() => ok(session)),
    deleteSession: vi.fn(() => ok(session)),
    controlTask: vi.fn(() => ok({
      commandId: "00000000-0000-4000-8000-000000000001",
      taskId: "task:one",
      commandType: "cancel_task",
      status: "accepted",
      taskRevision: 6,
      acceptedAt: timestamp,
    })),
    unsubscribe: vi.fn(),
    onDesktopEvent: vi.fn(function onDesktopEvent() {
      return api.unsubscribe;
    }),
  };
  Object.defineProperty(window, "robothreeDesktop", {
    configurable: true,
    value: api,
  });
  return api;
}

function taskDetail() {
  return {
    summary: {
      taskId: "task:one",
      sessionId: "session:one",
      userMessageId: "message:one",
      revision: 1,
      displayStatus: "running",
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAgentId: "agent:normal",
      resolvedModelId: "model:gpt",
    },
    goalSummary: "Write report",
    runs: [],
    toolActivities: [],
    userConfirmations: [],
    artifacts: [],
    latestDurableCursor: "cursor:task",
  };
}
