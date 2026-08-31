// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  tasksAdapterKey,
  type TasksAdapter,
} from "../src/renderer/adapters/tasks-adapter.js";
import {
  workbenchAdapterKey,
  type WorkbenchAdapter,
} from "../src/renderer/adapters/workbench-adapter.js";
import {
  DesktopTaskWorkspaceAdapterError,
  taskWorkspaceAdapterKey,
  type TaskWorkspaceAdapter,
} from "../src/renderer/adapters/task-workspace-adapter.js";
import {
  createTaskPinStore,
  taskPinStoreKey,
} from "../src/renderer/app/task-pin-store.js";
import type { DesktopRendererEvent } from "../src/shared/foundation-api.js";
import {
  clearConversationSelections,
  rememberConversationSelection,
} from "../src/renderer/app/conversation-selection-store.js";
import TasksListPage from "../src/renderer/pages/tasks/TasksListPage.vue";

const timestamp = "2026-08-16T00:00:00.000Z";

describe("DFE-2B tasks list page", () => {
  beforeEach(() => clearConversationSelections());

  it("renders the unified task list with search, local pinning and delete gates", async () => {
    const adapter = createAdapter();
    const taskPins = createTaskPinStore();
    const wrapper = mount(TasksListPage, {
      global: {
        provide: {
          [tasksAdapterKey as symbol]: adapter,
          [taskPinStoreKey as symbol]: taskPins,
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
    expect(wrapper.text()).toContain("本次运行置顶");
    expect(taskPins.isPinned("task:one")).toBe(true);
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

    await wrapper.find("[data-task-action='rename']").trigger("click");
    await flushPromises();
    await wrapper.findAll("input")
      .find((input) => input.attributes("class")?.includes("r3-input"))
      ?.setValue("Renamed task");
    await wrapper.find("[data-dialog-confirm]").trigger("click");
    await flushPromises();
    await wrapper.find("[data-task-action='open']").trigger("click");
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
    expect(wrapper.text()).not.toContain("任务进程");
    expect(wrapper.text()).not.toContain("工具调用");
    expect(wrapper.find("[data-task-action='follow-up']").exists()).toBe(false);

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
    expect(adapter.continueTask).not.toHaveBeenCalled();
    expect(adapter.provideTaskInput).not.toHaveBeenCalled();
  });

  it("keeps completed tasks in a continuous same-session conversation", async () => {
    rememberConversationSelection("session:one", {
      agentId: "agent:normal",
      requestedModelId: "model:gpt",
      selectedSkillIds: ["skill:docs"],
      selectedKnowledgeIds: [],
      workspaceGrantId: "workspace:one",
    });
    const adapter = createAdapter({
      tasks: [task("task:done", "session:one", "completed")],
    });
    adapter.loadConversation.mockResolvedValue({
      sessionId: "session:one",
      sessionRevision: 2,
      messages: [{
        messageId: "message:one",
        sessionId: "session:one",
        sequence: 1,
        role: "user",
        status: "completed",
        content: "Create report",
        taskId: "task:done",
        createdAt: timestamp,
      }, {
        messageId: "message:assistant",
        sessionId: "session:one",
        sequence: 2,
        role: "assistant",
        status: "completed",
        content: "报告已经生成，可以继续告诉我修改要求。",
        taskId: "task:done",
        createdAt: timestamp,
      }],
      activeTaskSummaries: [],
      latestDurableCursor: "cursor:conversation",
      hasMoreBefore: false,
    });
    const workbenchAdapter = createWorkbenchAdapter();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/tasks", name: "tasks", component: TasksListPage },
      ],
    });
    await router.push("/tasks");
    await router.isReady();
    const wrapper = mount(TasksListPage, {
      global: {
        plugins: [router],
        provide: {
          [tasksAdapterKey as symbol]: adapter,
          [workbenchAdapterKey as symbol]: workbenchAdapter,
        },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();
    await wrapper.find("[data-task-action='open']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-task-action='follow-up']").exists()).toBe(false);
    expect(wrapper.find("[aria-label='任务对话']").text()).toContain(
      "报告已经生成，可以继续告诉我修改要求。",
    );
    expect(wrapper.find("[aria-label='任务右侧面板']").exists()).toBe(true);
    const composer = wrapper.find("[data-conversation-composer] textarea");
    expect(composer.exists()).toBe(true);
    await composer.setValue("请继续优化这份报告");
    await composer.trigger("keydown", { key: "Enter", shiftKey: true });
    expect(workbenchAdapter.submitTask).not.toHaveBeenCalled();
    await composer.trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(workbenchAdapter.submitTask).toHaveBeenCalledWith({
      sessionId: "session:one",
      sessionTitle: "Write report",
      userInput: "请继续优化这份报告",
      agentId: "agent:normal",
      requestedModelId: "model:gpt",
      selectedSkillIds: ["skill:docs"],
      selectedKnowledgeIds: [],
      workspaceGrantId: "workspace:one",
      attachments: [],
    });
    expect(adapter.continueTask).not.toHaveBeenCalled();
    expect(adapter.provideTaskInput).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe("tasks");
    expect(router.currentRoute.value.query).toEqual({
      sessionId: "session:one",
      taskId: "task:next",
    });
  });

  it("fails closed instead of dropping specialist resources after Renderer restart", async () => {
    const adapter = createAdapter({
      tasks: [task("task:done", "session:one", "completed")],
    });
    const workbenchAdapter = createWorkbenchAdapter();
    const wrapper = mount(TasksListPage, {
      global: {
        provide: {
          [tasksAdapterKey as symbol]: adapter,
          [workbenchAdapterKey as symbol]: workbenchAdapter,
        },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();
    await wrapper.find("[data-task-action='open']").trigger("click");
    await flushPromises();

    const composer = wrapper.find("[data-conversation-composer] textarea");
    await composer.setValue("继续修改");
    await composer.trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(workbenchAdapter.submitTask).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("缺少可安全复用的机器人资源");
  });

  it("shows streaming and committed Core replies without requiring a confirmation card", async () => {
    const adapter = createAdapter({
      tasks: [task("task:one", "session:one", "running")],
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/tasks", name: "tasks", component: TasksListPage }],
    });
    await router.push("/tasks");
    await router.isReady();
    const wrapper = mount(TasksListPage, {
      global: {
        plugins: [router],
        provide: { [tasksAdapterKey as symbol]: adapter },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();
    await wrapper.find("[data-task-action='open']").trigger("click");
    await flushPromises();

    adapter.emit({
      contractVersion: "v1alpha1",
      eventId: "00000000-0000-4000-8000-000000000010",
      deliveryKind: "ephemeral",
      runtimeInstanceId: "runtime:one",
      emittedAt: timestamp,
      payload: {
        type: "assistant_token_delta",
        sessionId: "session:one",
        messageId: "message:stream",
        deltaSequence: 0,
        delta: "正在生成真实回复",
      },
    });
    await flushPromises();
    expect(wrapper.find("[aria-label='任务对话']").text()).toContain("正在生成真实回复");

    adapter.loadConversation.mockResolvedValueOnce({
      sessionId: "session:one",
      sessionRevision: 2,
      messages: [{
        messageId: "message:stream",
        sessionId: "session:one",
        sequence: 2,
        role: "assistant",
        status: "completed",
        content: "这是 Core 持久化后的回复。",
        taskId: "task:one",
        createdAt: timestamp,
      }],
      activeTaskSummaries: [],
      latestDurableCursor: "cursor:two",
      hasMoreBefore: false,
    });
    adapter.emit({
      contractVersion: "v1alpha1",
      eventId: "00000000-0000-4000-8000-000000000011",
      deliveryKind: "durable",
      durableCursor: "cursor:two",
      runtimeInstanceId: "runtime:one",
      emittedAt: timestamp,
      payload: {
        type: "message_committed",
        sessionId: "session:one",
        messageId: "message:stream",
        messageRevision: 1,
        status: "completed",
        queryRef: "query:conversation",
      },
    });
    await flushPromises();

    const conversation = wrapper.find("[aria-label='任务对话']").text();
    expect(conversation).toContain("这是 Core 持久化后的回复。");
    expect(conversation).not.toContain("正在生成真实回复");
  });

  it("keeps workspace-source execution details out of the product conversation", async () => {
    const adapter = createAdapter({
      tasks: [task("task:done", "session:one", "completed")],
    });
    const detail = taskDetail("task:done");
    adapter.loadTaskDetail.mockResolvedValueOnce({
      ...detail,
      toolActivities: [{
        ...detail.toolActivities[0]!,
        activityId: "activity:read",
        toolName: "adapter.tool.document-worker",
        operationType: "tool.document.docx.read",
        status: "completed",
        endedAt: timestamp,
      }, {
        ...detail.toolActivities[0]!,
        activityId: "activity:write",
        toolName: "adapter.tool.document-worker",
        operationType: "tool.document.pptx.write",
        status: "completed",
        endedAt: timestamp,
      }],
      artifacts: [{
        ...detail.artifacts[0]!,
        displayName: "资料汇报.pptx",
        kind: "document",
        mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        metadata: { capabilityId: "tool.document.pptx.write" },
      }],
    });
    const wrapper = mount(TasksListPage, {
      global: {
        provide: { [tasksAdapterKey as symbol]: adapter },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    await wrapper.find("[data-task-action='open']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[aria-label='任务步骤']").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("任务进程");
    expect(wrapper.text()).not.toContain("工具调用");
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

    expect(wrapper.find("select[aria-label='面板内容']").exists()).toBe(true);
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
    await wrapper.find("select[aria-label='面板内容']").setValue("workspace");
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
    await wrapper.find("select[aria-label='面板内容']").setValue("workspace");
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
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/tasks", name: "tasks", component: { template: "<div />" } }],
    });
    await router.push("/tasks");
    await router.isReady();
    const wrapper = mount(TasksListPage, {
      global: {
        plugins: [router],
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
    await wrapper.find("select[aria-label='面板内容']").setValue("workspace");
    await flushPromises();
    await router.push({
      name: "tasks",
      query: { sessionId: "session:two", taskId: "task:done" },
    });
    await flushPromises();
    await wrapper.find("select[aria-label='面板内容']").setValue("workspace");
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
    await wrapper.find("select[aria-label='面板内容']").setValue("workspace");
    await flushPromises();
    await wrapper.find("[data-workspace-action='load-more']").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("目录已刷新");
    expect(wrapper.text()).toContain("refreshed.xlsx");
    expect(rootLoads).toBe(2);
  });

  it("explains irreversible task-message deletion without implying artifact deletion", async () => {
    const adapter = createAdapter({
      tasks: [task("task:done", "session:one", "completed")],
    });
    const wrapper = mount(TasksListPage, {
      global: {
        provide: { [tasksAdapterKey as symbol]: adapter },
        stubs: { Teleport: true },
      },
    });
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "删除")?.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("任务消息将被永久删除且无法恢复");
    expect(wrapper.text()).toContain("成果文件和工作空间文件不会被删除");
  });
});

const artifactId = `artifact:${"a".repeat(64)}`;

function createAdapter(
  overrides: Partial<Awaited<ReturnType<TasksAdapter["loadTasks"]>>> = {},
) {
  const session = sessionSummary("session:one", "Write report");
  let handler: ((event: DesktopRendererEvent) => void) | undefined;
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
    loadTaskReasoning: vi.fn(async (taskId: string) => ({
      state: "legacy" as const,
      taskId,
      safeSummary: "该任务创建时未记录 Max 推理摘要" as const,
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
    subscribe: vi.fn((nextHandler: (event: DesktopRendererEvent) => void) => {
      handler = nextHandler;
      return () => { handler = undefined; };
    }),
    emit(event: DesktopRendererEvent): void {
      handler?.(event);
    },
  };
}

function createWorkbenchAdapter(): WorkbenchAdapter {
  const revision = "c".repeat(64);
  return {
    loadWorkbenchData: vi.fn(async () => ({
      workspaces: [],
      sessions: [sessionSummary("session:one", "Write report")],
      agents: [{
        agentId: "agent:normal",
        revision,
        name: "Normal Agent",
        identity: "Normal",
        goal: "Help",
        defaultModelId: "model:gpt",
        allowModelOverride: true,
        eligibleModels: [{
          modelId: "model:gpt",
          revision,
          name: "GPT",
          source: "official" as const,
          capabilities: ["text", "tool_calling"] as const,
          available: true,
        }],
        requiredModelCapabilities: ["text"] as const,
        skills: [{
          id: "skill:docs",
          revision,
          name: "Docs",
          available: true,
        }],
        tools: [],
        knowledge: [],
        runnable: true,
      }],
      models: [{
        modelId: "model:gpt",
        revision,
        name: "GPT",
        source: "official" as const,
        capabilities: ["text", "tool_calling"] as const,
        available: true,
      }],
      recentTasks: [],
      recentArtifacts: [],
    })),
    createWorkspaceGrant: vi.fn(async () => undefined),
    pickWorkspaceAttachment: vi.fn(async () => undefined),
    submitTask: vi.fn(async () => ({
      session: sessionSummary("session:one", "Write report"),
      receipt: {
        submitTurnCommandId: "00000000-0000-4000-8000-000000000001",
        clientTurnId: "turn:00000000-0000-4000-8000-000000000002",
        userMessageId: "message:next",
        taskId: "task:next",
        runtimeSelectionId: "runtime:next",
        status: "accepted" as const,
        acceptedAt: timestamp,
      },
    })),
    recoverReasoningSubmit: vi.fn(),
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
