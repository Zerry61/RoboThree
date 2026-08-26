// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import {
  tasksAdapterKey,
  type TasksAdapter,
} from "../src/renderer/adapters/tasks-adapter.js";
import {
  DesktopTaskWorkspaceAdapterError,
  taskWorkspaceAdapterKey,
  type TaskWorkspaceAdapter,
} from "../src/renderer/adapters/task-workspace-adapter.js";
import TasksListPage from "../src/renderer/pages/tasks/TasksListPage.vue";

const timestamp = "2026-08-16T00:00:00.000Z";

describe("DFE-2B tasks list page", () => {
  it("renders the unified task list with search, local pinning and delete gates", async () => {
    const adapter = createAdapter();
    const wrapper = mount(TasksListPage, {
      global: {
        provide: {
          [tasksAdapterKey as symbol]: adapter,
        },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("任务");
    expect(wrapper.text()).toContain("Write report");
    expect(wrapper.text()).toContain("执行中");
    expect(wrapper.text()).toContain("仍有未结束任务");
    expect(wrapper.text()).not.toContain("会话");

    const deleteButton = wrapper.findAll("button")
      .find((button) => button.text() === "删除");
    expect(deleteButton?.attributes("disabled")).toBeDefined();

    await wrapper.find("input[type='search']").setValue("missing");
    expect(wrapper.text()).toContain("没有匹配任务");
    await wrapper.find("input[type='search']").setValue("");

    await wrapper.findAll("button")
      .find((button) => button.text() === "置顶")
      ?.trigger("click");
    expect(wrapper.text()).toContain("本次视图置顶");
  });

  it("renames and opens tasks through the adapter without exposing paths", async () => {
    const adapter = createAdapter({
      tasks: [task("task:done", "session:one", "completed")],
    });
    const wrapper = mount(TasksListPage, {
      global: {
        provide: {
          [tasksAdapterKey as symbol]: adapter,
        },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    await wrapper.find("[data-task-action='open']").trigger("click");
    await flushPromises();
    await wrapper.find("[data-task-action='rename']").trigger("click");
    await flushPromises();
    await wrapper.findAll("input")
      .find((input) => input.attributes("class")?.includes("r3-input"))
      ?.setValue("Renamed task");
    await wrapper.find("[data-dialog-confirm]").trigger("click");
    await flushPromises();

    expect(adapter.openTask).toHaveBeenCalledWith("session:one");
    expect(adapter.loadTaskDetail).toHaveBeenCalledWith("task:done");
    expect(adapter.loadConversation).toHaveBeenCalledWith("session:one");
    expect(adapter.renameTask).toHaveBeenCalledWith({
      sessionId: "session:one",
      expectedRevision: 1,
      title: "Renamed task",
    });
    expect(JSON.stringify(adapter.renameTask.mock.calls[0]?.[0])).not.toContain("workspaceRoot");
  });

  it("renders task detail controls and sends confirmation decisions through the adapter", async () => {
    const adapter = createAdapter({
      tasks: [task("task:waiting", "session:one", "waiting_confirmation")],
    });
    const wrapper = mount(TasksListPage, {
      global: {
        provide: {
          [tasksAdapterKey as symbol]: adapter,
        },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    await wrapper.find("[data-task-action='open']").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("等待你的确认");
    expect(wrapper.text()).toContain("任务进程");
    expect(wrapper.text()).toContain("工具活动");

    await wrapper.find("[data-confirmation-action='confirmed']").trigger("click");
    await flushPromises();
    await wrapper.find("[data-dialog-confirm]").trigger("click");
    await flushPromises();

    expect(adapter.decideUserConfirmation).toHaveBeenCalledWith({
      taskId: "task:waiting",
      expectedTaskRevision: 1,
      confirmation: expect.objectContaining({
        confirmationId: "confirmation:one",
        requestDigest: "a".repeat(64),
      }),
      decision: "confirmed",
    });
  });

  it("renders the right artifact panel and uses pathless preview/open/export actions", async () => {
    const adapter = createAdapter({
      tasks: [task("task:done", "session:one", "completed")],
    });
    const wrapper = mount(TasksListPage, {
      global: {
        provide: {
          [tasksAdapterKey as symbol]: adapter,
        },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    await wrapper.find("[data-task-action='open']").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("右侧面板");
    expect(wrapper.text()).toContain("report.md");
    expect(wrapper.text()).toContain("工作空间文件");

    await wrapper.find("[data-artifact-action='preview-markdown']").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Preview Report");
    expect(adapter.previewArtifact).toHaveBeenCalledWith({
      artifactId,
      mode: "markdown",
    });

    await wrapper.find("[data-artifact-action='open-location']").trigger("click");
    await flushPromises();
    await wrapper.find("[data-artifact-action='export']").trigger("click");
    await flushPromises();

    expect(adapter.openArtifactLocation).toHaveBeenCalledWith({ artifactId });
    expect(adapter.exportArtifact).toHaveBeenCalledWith({ artifactId });
    expect(JSON.stringify([
      adapter.previewArtifact.mock.calls,
      adapter.openArtifactLocation.mock.calls,
      adapter.exportArtifact.mock.calls,
    ])).not.toMatch(/workspaceRoot|rootRealPath|selectionHandle/u);
  });

  it("loads DFI-1B workspace entries and reveals only the task workspace location", async () => {
    const adapter = createAdapter({
      tasks: [task("task:done", "session:one", "completed")],
    });
    const workspaceAdapter = createWorkspaceAdapter();
    const wrapper = mount(TasksListPage, {
      global: {
        provide: {
          [tasksAdapterKey as symbol]: adapter,
          [taskWorkspaceAdapterKey as symbol]: workspaceAdapter,
        },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    await wrapper.find("[data-task-action='open']").trigger("click");
    await flushPromises();
    await wrapper.findAll("[role='tab']")
      .find((tab) => tab.text() === "工作空间文件")
      ?.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("src");
    expect(wrapper.text()).toContain("report.xlsx");
    expect(wrapper.text()).toContain("outside-link");
    expect(wrapper.text()).toContain("链接不可导航");
    expect(wrapper.text()).not.toContain("项目根目录");
    expect(wrapper.text()).not.toContain("成果输出目录");
    expect(wrapper.text()).not.toContain("最近引用文件");

    await wrapper.find("[data-workspace-action='open-directory']").trigger("click");
    await flushPromises();
    expect(workspaceAdapter.listEntries).toHaveBeenCalledWith({
      taskId: "task:done",
      parentEntryId: directoryEntryId,
      limit: 50,
    });

    await wrapper.find("[data-workspace-action='reveal-root']").trigger("click");
    await flushPromises();
    expect(workspaceAdapter.openTaskWorkspaceLocation).toHaveBeenCalledWith({
      taskId: "task:done",
    });
    expect(JSON.stringify(workspaceAdapter.openTaskWorkspaceLocation.mock.calls)).not.toMatch(
      /entryId|cursor|workspaceGrantId|workspaceRoot|rootRealPath|path/u,
    );
  });

  it("shows real unavailable state when the workspace browser feature is missing", async () => {
    const adapter = createAdapter({
      tasks: [task("task:done", "session:one", "completed")],
    });
    const workspaceAdapter = createWorkspaceAdapter({
      compatibility: {
        browserAvailable: false,
        revealAvailable: false,
        reasonCode: "contract.feature_unavailable",
        safeSummary: "工作空间文件浏览能力尚未启用。",
      },
    });
    const wrapper = mount(TasksListPage, {
      global: {
        provide: {
          [tasksAdapterKey as symbol]: adapter,
          [taskWorkspaceAdapterKey as symbol]: workspaceAdapter,
        },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    await wrapper.find("[data-task-action='open']").trigger("click");
    await flushPromises();
    await wrapper.findAll("[role='tab']")
      .find((tab) => tab.text() === "工作空间文件")
      ?.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("工作空间文件不可用");
    expect(wrapper.text()).toContain("工作空间文件浏览能力尚未启用");
    expect(wrapper.find("[data-workspace-action='open-directory']").exists()).toBe(false);
    expect(workspaceAdapter.listEntries).not.toHaveBeenCalled();
  });

  it("discards late workspace responses after switching selected tasks", async () => {
    const adapter = createAdapter({
      sessions: [
        sessionSummary("session:one", "Write report"),
        sessionSummary("session:two", "Final report"),
      ],
      tasks: [
        task("task:one", "session:one", "completed"),
        task("task:done", "session:two", "completed"),
      ],
    });
    let releaseFirst: ((value: ReturnType<typeof directoryProjection>) => void) | undefined;
    const first = new Promise<ReturnType<typeof directoryProjection>>((resolve) => {
      releaseFirst = resolve;
    });
    const workspaceAdapter = createWorkspaceAdapter({
      listEntries: vi.fn(async (input) => {
        if (input.taskId === "task:one") return first;
        return directoryProjection({
          entries: [fileEntry("final.xlsx")],
        });
      }),
    });
    const wrapper = mount(TasksListPage, {
      global: {
        provide: {
          [tasksAdapterKey as symbol]: adapter,
          [taskWorkspaceAdapterKey as symbol]: workspaceAdapter,
        },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    await wrapper.find("[data-task-action='open']").trigger("click");
    await flushPromises();
    await wrapper.findAll("[role='tab']")
      .find((tab) => tab.text() === "工作空间文件")
      ?.trigger("click");
    await flushPromises();
    await wrapper.findAll("[data-task-action='open']")[1]?.trigger("click");
    await flushPromises();
    await wrapper.findAll("[role='tab']")
      .find((tab) => tab.text() === "工作空间文件")
      ?.trigger("click");
    releaseFirst?.(directoryProjection({
      entries: [fileEntry("stale.xlsx")],
    }));
    await flushPromises();

    expect(wrapper.text()).toContain("final.xlsx");
    expect(wrapper.text()).not.toContain("stale.xlsx");
  });

  it("refreshes the current directory once when a workspace cursor is stale", async () => {
    const adapter = createAdapter({
      tasks: [task("task:done", "session:one", "completed")],
    });
    let rootLoads = 0;
    const workspaceAdapter = createWorkspaceAdapter({
      listEntries: vi.fn(async (input) => {
        if (input.cursor !== undefined) {
          throw workspaceError("workspace.browser_cursor_stale", "conflict");
        }
        rootLoads += 1;
        return directoryProjection({
          entries: [fileEntry(rootLoads === 1 ? "first-page.xlsx" : "refreshed.xlsx")],
          nextCursor: rootLoads === 1 ? nextCursor : undefined,
          truncated: rootLoads === 1,
        });
      }),
    });
    const wrapper = mount(TasksListPage, {
      global: {
        provide: {
          [tasksAdapterKey as symbol]: adapter,
          [taskWorkspaceAdapterKey as symbol]: workspaceAdapter,
        },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    await wrapper.find("[data-task-action='open']").trigger("click");
    await flushPromises();
    await wrapper.findAll("[role='tab']")
      .find((tab) => tab.text() === "工作空间文件")
      ?.trigger("click");
    await flushPromises();
    await wrapper.find("[data-workspace-action='load-more']").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("目录已刷新");
    expect(wrapper.text()).toContain("refreshed.xlsx");
    expect(rootLoads).toBe(2);
  });
});

const artifactId = `artifact:${"a".repeat(64)}`;

function createAdapter(
  overrides: Partial<Awaited<ReturnType<TasksAdapter["loadTasks"]>>> = {},
) {
  const session = sessionSummary("session:one", "Write report");
  return {
    loadTasks: vi.fn(async () => ({
      sessions: [session],
      tasks: [task("task:one", "session:one", "running")],
      ...overrides,
    })),
    loadConversation: vi.fn(async () => ({
      sessionId: "session:one",
      sessionRevision: 1,
      messages: [{
        messageId: "message:one",
        sessionId: "session:one",
        sequence: 1,
        role: "user",
        status: "completed",
        content: "Create report",
        taskId: "task:done",
        createdAt: timestamp,
      }],
      activeTaskSummaries: [],
      latestDurableCursor: "cursor:conversation",
      hasMoreBefore: false,
    })),
    loadTaskDetail: vi.fn(async (taskId: string) => taskDetail(taskId)),
    openTask: vi.fn(async () => session),
    renameTask: vi.fn(async () => ({ ...session, title: "Renamed task" })),
    deleteTask: vi.fn(async () => session),
    cancelTask: vi.fn(async () => ({
      commandId: "00000000-0000-4000-8000-000000000001",
      taskId: "task:one",
      commandType: "cancel_task",
      status: "accepted",
      taskRevision: 2,
      acceptedAt: timestamp,
    })),
    retryTask: vi.fn(async () => receipt("retry_task")),
    continueTask: vi.fn(async () => receipt("continue_task")),
    provideTaskInput: vi.fn(async () => receipt("provide_task_input")),
    decideUserConfirmation: vi.fn(async () => receipt("decide_user_confirmation")),
    previewArtifact: vi.fn(async () => ({
      artifactId,
      mode: "markdown",
      content: "## Preview Report\n\nSafe preview text.",
      byteSize: new TextEncoder().encode("## Preview Report\n\nSafe preview text.").byteLength,
      truncated: false,
      warnings: [],
    })),
    startArtifactHtmlPreview: vi.fn(async () => ({
      artifactId,
      previewSessionId: "preview:00000000-0000-4000-8000-000000000001",
      localOrigin: "http://127.0.0.1",
      previewUrl: "http://127.0.0.1:49152/preview/token/index.html",
      csp: "default-src 'none'",
      expiresAt: timestamp,
      warnings: [],
    })),
    closeArtifactPreview: vi.fn(async () => undefined),
    setArtifactLifecycle: vi.fn(async () => ({
      commandId: "00000000-0000-4000-8000-000000000003",
      artifactId,
      status: "accepted",
      lifecycle: {
        revision: 2,
        pinned: true,
        dismissed: false,
        deleted: false,
        sourceDeleted: false,
      },
    })),
    openArtifactLocation: vi.fn(async () => ({
      commandId: "00000000-0000-4000-8000-000000000004",
      artifactId,
      opened: true,
    })),
    exportArtifact: vi.fn(async () => ({
      commandId: "00000000-0000-4000-8000-000000000005",
      artifactId,
      exported: true,
      fileName: "report.md",
    })),
    subscribe: vi.fn(() => () => {}),
  };
}

function sessionSummary(sessionId: string, title: string) {
  return {
    sessionId,
    revision: 1,
    title,
    tombstoned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const directoryEntryId = `wse1.${"a".repeat(24)}.${"b".repeat(24)}`;
const nextCursor = `wsc1.${"c".repeat(24)}.${"d".repeat(24)}`;

function createWorkspaceAdapter(input: {
  compatibility?: Partial<Awaited<ReturnType<TaskWorkspaceAdapter["negotiate"]>>>;
  listEntries?: TaskWorkspaceAdapter["listEntries"];
} = {}) {
  return {
    negotiate: vi.fn(async () => ({
      contractVersion: "v1alpha2",
      runtimeInstanceId: "runtime.instance-dfi-1b",
      browserAvailable: true,
      revealAvailable: true,
      reasonCode: undefined,
      safeSummary: undefined,
      ...input.compatibility,
    })),
    listEntries: vi.fn(input.listEntries ?? (async (query) => query.parentEntryId === directoryEntryId
      ? directoryProjection({
        parentEntryId: directoryEntryId,
        breadcrumbDisplayNames: ["src"],
        entries: [fileEntry("index.ts")],
      })
      : directoryProjection({
        entries: [
          {
            entryId: directoryEntryId,
            displayName: "src",
            kind: "directory",
            navigable: true,
          },
          fileEntry("report.xlsx"),
          {
            entryId: `wse1.${"e".repeat(24)}.${"f".repeat(24)}`,
            displayName: "outside-link",
            kind: "symlink",
            navigable: false,
            unavailableReason: "workspace_entry.symlink",
          },
        ],
        nextCursor,
        truncated: true,
      }))),
    openTaskWorkspaceLocation: vi.fn(async () => ({
      contractVersion: "v1alpha2",
      commandId: "55555555-5555-4555-8555-555555555555",
      taskId: "task:done",
      workspaceGrantId: "workspace:66666666-6666-4666-8666-666666666666",
      openedAt: timestamp,
    })),
  };
}

function directoryProjection(input: {
  parentEntryId?: string;
  breadcrumbDisplayNames?: readonly string[];
  entries?: readonly ReturnType<typeof fileEntry>[];
  nextCursor?: string;
  truncated?: boolean;
} = {}) {
  return {
    contractVersion: "v1alpha2" as const,
    workspaceGrantId: "workspace:66666666-6666-4666-8666-666666666666",
    ...(input.parentEntryId === undefined ? {} : { parentEntryId: input.parentEntryId }),
    breadcrumbDisplayNames: input.breadcrumbDisplayNames ?? [],
    entries: input.entries ?? [],
    ...(input.nextCursor === undefined ? {} : { nextCursor: input.nextCursor }),
    truncated: input.truncated ?? input.nextCursor !== undefined,
    snapshotDigest: `sha256:${"a".repeat(64)}`,
  };
}

function fileEntry(displayName: string) {
  return {
    entryId: `wse1.${displayName.replace(/[^a-z]/gu, "a").padEnd(24, "a")}.${"b".repeat(24)}`,
    displayName,
    kind: "file" as const,
    navigable: false,
    sizeBytes: 4096,
    modifiedAt: timestamp,
  };
}

function workspaceError(
  code: string,
  category: ConstructorParameters<typeof DesktopTaskWorkspaceAdapterError>[0]["category"],
) {
  return new DesktopTaskWorkspaceAdapterError({
    contractVersion: "v1alpha2",
    code,
    category,
    safeSummary: "目录快照已变化。",
    retryable: false,
    correlationId: "11111111-1111-4111-8111-111111111111",
  });
}

function task(
  taskId: string,
  sessionId: string,
  displayStatus: "completed" | "running" | "waiting_confirmation",
) {
  return {
    taskId,
    sessionId,
    userMessageId: `message:${taskId}`,
    revision: 1,
    displayStatus,
    createdAt: timestamp,
    updatedAt: timestamp,
    resolvedAgentId: "agent:normal",
    resolvedModelId: "model:gpt",
  };
}

function receipt(commandType: string) {
  return {
    commandId: "00000000-0000-4000-8000-000000000002",
    taskId: "task:one",
    commandType,
    status: "accepted",
    taskRevision: 2,
    acceptedAt: timestamp,
  };
}

function taskDetail(taskId: string) {
  const waiting = taskId === "task:waiting";
  return {
    summary: {
      taskId,
      sessionId: "session:one",
      userMessageId: "message:one",
      revision: 1,
      displayStatus: waiting ? "waiting_confirmation" : "completed",
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAgentId: "agent:normal",
      resolvedModelId: "model:gpt",
    },
    goalSummary: "Write report",
    runs: [{
      runId: "run:one",
      attempt: 1,
      displayStatus: waiting ? "waiting_confirmation" : "completed",
      startedAt: timestamp,
      updatedAt: timestamp,
      steps: [{
        stepId: "step:one",
        sequence: 1,
        displayStatus: waiting ? "waiting_confirmation" : "completed",
        actionType: "tool",
        actionSummary: "检查文件",
        observationSummary: "等待用户确认。",
        startedAt: timestamp,
        updatedAt: timestamp,
      }],
    }],
    toolActivities: [{
      activityId: "activity:one",
      taskId,
      toolName: "document.xlsx.write",
      operationType: "write",
      status: waiting ? "waiting_confirmation" : "completed",
      targetSummary: "report.xlsx",
      safetySummary: "单次操作",
      statusSummary: "等待确认",
      startedAt: timestamp,
      updatedAt: timestamp,
      ...(waiting ? {} : { endedAt: timestamp }),
    }],
    userConfirmations: waiting ? [{
      confirmationId: "confirmation:one",
      taskId,
      requestDigest: "a".repeat(64),
      status: "pending",
      reasonSummary: "需要确认写入文件。",
      riskSummary: "会创建工作区文件。",
      targetSummary: "report.xlsx",
      consequenceSummary: "只执行这一次写入。",
      requestedAt: timestamp,
    }] : [],
    artifacts: [{
      artifactId,
      taskId,
      sourceKind: "tool_observation",
      sourceId: "019fa000-0000-7000-8000-000000000111",
      sourceDigest: `sha256:${"b".repeat(64)}`,
      displayName: "report.md",
      kind: "markdown",
      mediaType: "text/markdown",
      relativePath: "reports/report.md",
      byteSize: 64,
      createdAt: timestamp,
      previewState: "available",
      lifecycle: {
        revision: 1,
        pinned: false,
        dismissed: false,
        deleted: false,
        sourceDeleted: false,
      },
      metadata: {
        capabilityId: "tool.document.docx.read",
      },
    }],
    latestDurableCursor: "cursor:task",
  };
}
