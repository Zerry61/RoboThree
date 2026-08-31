// @vitest-environment happy-dom

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { KeepAlive, defineComponent } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRouter,
  RouterView,
} from "vue-router";

import {
  DesktopWorkbenchAdapterError,
  workbenchAdapterKey,
  type WorkbenchAdapter,
} from "../src/renderer/adapters/workbench-adapter.js";
import WorkbenchCreatePage from "../src/renderer/pages/workbench/WorkbenchCreatePage.vue";
import { setFollowUpIntent } from
  "../src/renderer/pages/workbench/follow-up-intent.js";
import {
  ReasoningModeAdapter,
  reasoningModeAdapterKey,
} from "../src/renderer/adapters/reasoning-mode-adapter.js";
import { clearConversationSelections, rememberConversationSelection } from
  "../src/renderer/app/conversation-selection-store.js";
import { notifyWorkbenchNewTaskRequested } from
  "../src/renderer/app/shell-navigation-events.js";
import {
  tasksAdapterKey,
  type TasksAdapter,
} from "../src/renderer/adapters/tasks-adapter.js";
import type { TaskDetailProjection } from "@robothree/contracts";

const digest = "a".repeat(64);
const timestamp = "2026-08-16T00:00:00.000Z";

describe("DFE-2A Workbench create page", () => {
  beforeEach(() => clearConversationSelections());

  it("keeps task actions inside one composer with separate resource and model popovers", async () => {
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: createAdapter(),
        },
      },
    });
    await flushPromises();

    const composer = wrapper.find(".workbench-page__composer-card");
    const resourceButton = composer.find("button[aria-controls='workbench-resource-menu']");
    const modelButton = composer.find("button[aria-controls='workbench-model-menu']");
    expect(composer.find("textarea").exists()).toBe(true);
    expect(composer.find("button[title='提交任务']").exists()).toBe(true);
    expect(resourceButton.attributes("aria-expanded")).toBe("false");
    expect(modelButton.attributes("aria-expanded")).toBe("false");
    expect(composer.text()).not.toContain("手动复核");
    expect(composer.text()).not.toContain("已选资源");
    expect(composer.text()).not.toContain("输入任务内容后即可提交");
    expect(composer.text()).not.toContain("本次推理模式");
    expect(composer.text()).toContain("智能授权");

    await resourceButton.trigger("click");
    expect(resourceButton.attributes("aria-expanded")).toBe("true");
    expect(composer.text()).toContain("添加文件");
    expect(composer.text()).toContain("机器人");
    expect(composer.text()).toContain("技能");

    await modelButton.trigger("click");
    expect(resourceButton.attributes("aria-expanded")).toBe("false");
    expect(modelButton.attributes("aria-expanded")).toBe("true");
    expect(composer.text()).toContain("Max");
    expect(composer.text()).toContain("GPT");
  });

  it("does not render the obsolete document category shortcut buttons", async () => {
    const adapter = createAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("分析表格");
    expect(wrapper.text()).not.toContain("整理文档");
    expect(wrapper.text()).not.toContain("生成报告");
    expect(wrapper.text()).not.toContain("制作演示");
    expect(adapter.submitTask).not.toHaveBeenCalled();
  });

  it("renders the user message immediately and keeps the composer editable while submit is pending", async () => {
    type SubmitResult = Awaited<ReturnType<WorkbenchAdapter["submitTask"]>>;
    let resolveSubmit!: (value: SubmitResult) => void;
    const adapter = createAdapter();
    adapter.submitTask.mockImplementationOnce(() => new Promise<SubmitResult>((resolve) => {
      resolveSubmit = resolve;
    }));
    const wrapper = mount(WorkbenchCreatePage, {
      global: { provide: { [workbenchAdapterKey as symbol]: adapter } },
    });
    await flushPromises();

    await wrapper.find("textarea").setValue("立即显示这条消息");
    await wrapper.find("button[title='提交任务']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-workbench-conversation]").text()).toContain("立即显示这条消息");
    expect(wrapper.find("textarea").attributes("disabled")).toBeUndefined();
    await wrapper.find("textarea").setValue("可以先输入下一条消息");
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value)
      .toBe("可以先输入下一条消息");

    resolveSubmit({
      session: sessionFixture(),
      receipt: {
        submitTurnCommandId: "00000000-0000-4000-8000-000000000001",
        clientTurnId: "turn:00000000-0000-4000-8000-000000000002",
        userMessageId: "message:user",
        taskId: "task:one",
        runtimeSelectionId: "runtime:one",
        status: "accepted",
        acceptedAt: timestamp,
      },
    });
    await flushPromises();
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value)
      .toBe("可以先输入下一条消息");
  });

  it("submits the selected real authorization mode and defaults to smart authorization", async () => {
    const adapter = createAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: { provide: { [workbenchAdapterKey as symbol]: adapter } },
    });
    await flushPromises();

    const trigger = wrapper.find("button[aria-controls='workbench-authorization-menu']");
    expect(trigger.text()).toContain("智能授权");
    await trigger.trigger("click");
    const manualReview = wrapper.find("[data-authorization-mode='manual_review']");
    expect(manualReview.exists()).toBe(true);
    await manualReview.trigger("click");
    await flushPromises();
    expect(wrapper.find("button[aria-controls='workbench-authorization-menu']").text())
      .toContain("主动询问");
    await wrapper.find("textarea").setValue("需要主动询问的任务");
    await wrapper.find("button[title='提交任务']").trigger("click");
    await flushPromises();

    expect(adapter.submitTask).toHaveBeenCalledWith(expect.objectContaining({
      authorizationMode: "manual_review",
    }));
  });

  it("consumes a follow-up once, validates candidates and requires explicit resources", async () => {
    setFollowUpIntent({
      sessionId: "session:one",
      originTaskId: "task:done",
      candidateAgentId: "agent:normal",
      candidateModelId: "model:gpt",
      previousArtifact: {
        displayName: "项目汇报.pptx",
        relativePath: "成果/项目汇报.pptx",
      },
    });
    const adapter = createAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: { [workbenchAdapterKey as symbol]: adapter },
      },
    });
    await flushPromises();

    expect(wrapper.find("[data-follow-up-context]").text()).toContain("项目汇报.pptx");
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("");
    expect(wrapper.find("textarea").attributes("placeholder")).toContain("项目汇报-v2.pptx");
    expect(wrapper.find("button[aria-controls='workbench-model-menu']").text()).toContain("GPT");

    adapter.createWorkspaceGrant.mockResolvedValueOnce({
      workspaceGrantId: "workspace:one",
      displayName: "Workspace One",
      rootDisplayPath: "Workspace One",
      accessMode: "read_write",
      status: "active",
    });
    await wrapper.find(".workbench-page__workspace-trigger").trigger("click");
    await flushPromises();
    await selectSkill(wrapper, "Docs");
    await wrapper.find("textarea").setValue(
      "将第 3 页改为风险与下一步，并生成项目汇报-v2.pptx，不覆盖原文件。",
    );
    await wrapper.find("button[title='提交任务']").trigger("click");
    await flushPromises();

    expect(adapter.submitTask).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session:one",
      agentId: "agent:normal",
      requestedModelId: "model:gpt",
      workspaceGrantId: "workspace:one",
      selectedSkillIds: ["skill:docs"],
      selectedKnowledgeIds: [],
      userInput:
        "将第 3 页改为风险与下一步，并生成项目汇报-v2.pptx，不覆盖原文件。",
    }));
  });

  it.each([
    {
      name: "agent is no longer runnable",
      catalog: {
        agents: [{ ...agentFixture(), runnable: false }],
      },
    },
    {
      name: "model is no longer available",
      catalog: {
        models: [{
          modelId: "model:gpt",
          revision: digest,
          name: "GPT",
          source: "official" as const,
          capabilities: ["text", "tool_calling"] as const,
          available: false,
          unavailableReason: "Model is unavailable",
        }],
      },
    },
  ])("keeps follow-up fail-closed when the prior $name", async ({ catalog }) => {
    setFollowUpIntent({
      sessionId: "session:one",
      originTaskId: "task:done",
      candidateAgentId: "agent:normal",
      candidateModelId: "model:gpt",
    });
    const adapter = createAdapter(catalog);
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: { [workbenchAdapterKey as symbol]: adapter },
      },
    });
    await flushPromises();

    expect(wrapper.find("button[aria-controls='workbench-model-menu']").text())
      .not.toContain("模型自动选择");
    await wrapper.find("textarea").setValue("生成修订版，不覆盖旧文件。");

    const submitButton = wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"));
    expect(submitButton?.attributes("disabled")).toBeDefined();
    await submitButton?.trigger("click");
    await flushPromises();
    expect(adapter.submitTask).not.toHaveBeenCalled();
  });

  it("presents a missing prior artifact honestly without inventing revision context", async () => {
    setFollowUpIntent({
      sessionId: "session:one",
      originTaskId: "task:done",
      candidateAgentId: "agent:normal",
      candidateModelId: "model:gpt",
    });
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: { [workbenchAdapterKey as symbol]: createAdapter() },
      },
    });
    await flushPromises();

    expect(wrapper.find("[data-follow-up-context]").text())
      .toContain("上一成果当前不可用");
    expect(wrapper.find("[data-follow-up-context]").text())
      .toContain("请重新说明目标并选择本次资源");
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("");
  });

  it("renders real catalog projections and submits a task through the adapter", async () => {
    const adapter = createAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("RoboThree · 新建任务");
    expect(wrapper.text()).not.toContain("Workspace One");
    expect(wrapper.text()).not.toContain("使用通用机器人");
    expect(wrapper.text()).not.toContain("通用机器人 · 0 个工具");
    expect(wrapper.text()).not.toContain("手动复核");
    expect(wrapper.text()).not.toContain("已选资源");
    expect(wrapper.text()).not.toContain("工作区授权");
    expect(wrapper.find("[aria-pressed]").exists()).toBe(false);
    expect(wrapper.find(".workbench-page__workspace-trigger").exists()).toBe(false);

    await wrapper.find("textarea").setValue("Create an XLSX report");
    await wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"))
      ?.trigger("click");
    await flushPromises();

    expect(adapter.submitTask).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "",
      userInput: "Create an XLSX report",
      agentId: "",
      requestedModelId: "model:gpt",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      workspaceGrantId: "workspace:one",
      authorizationMode: "smart_confirm",
    }));
    expect(JSON.stringify(adapter.submitTask.mock.calls[0]?.[0])).not.toContain("workspaceRoot");
    expect(wrapper.text()).not.toContain("已进入本地运行队列");
    expect(wrapper.find("[data-workbench-conversation]").exists()).toBe(true);
    expect(wrapper.find(".workbench-page__composer-card textarea").exists()).toBe(true);
    expect(wrapper.find("button[aria-controls='workbench-model-menu']").exists()).toBe(true);
  });

  it("starts a new Session after returning to the kept-alive new-task page", async () => {
    const adapter = createAdapter();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/workbench", name: "workbench", component: WorkbenchCreatePage },
        { path: "/tasks", name: "tasks", component: { template: "<section>任务对话</section>" } },
      ],
    });
    const host = defineComponent({
      components: { KeepAlive, RouterView },
      template: `
        <RouterView v-slot="{ Component }">
          <KeepAlive include="RoboThreeWorkbench">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      `,
    });
    await router.push("/workbench");
    await router.isReady();
    const wrapper = mount(host, {
      global: {
        plugins: [router],
        provide: { [workbenchAdapterKey as symbol]: adapter },
      },
    });
    await flushPromises();

    await wrapper.find("textarea").setValue("第一条新任务");
    await wrapper.find("button[title='提交任务']").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("workbench");

    notifyWorkbenchNewTaskRequested();
    await flushPromises();
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("");
    await wrapper.find("textarea").setValue("第二条新任务");
    await wrapper.find("button[title='提交任务']").trigger("click");
    await flushPromises();

    expect(adapter.submitTask).toHaveBeenCalledTimes(2);
    expect(adapter.submitTask.mock.calls.map(([request]) => request.sessionId)).toEqual(["", ""]);
  });

  it("keeps real replies, resources and reasoning in one Workbench conversation", async () => {
    const adapter = createAdapter();
    const tasks = createConversationTasksAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
          [tasksAdapterKey as symbol]: tasks.adapter,
        },
      },
    });
    await flushPromises();

    await selectAgent(wrapper, "Normal Agent");
    await selectSkill(wrapper, "Docs");
    await wrapper.find("textarea").setValue("第一条消息");
    await wrapper.find("button[title='提交任务']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-workbench-conversation]").text()).toContain("第一条消息");
    expect(wrapper.find("[data-workbench-conversation]").text()).toContain("第一条真实回复");
    expect(wrapper.find(".workbench-page__composer-card").exists()).toBe(true);
    expect(wrapper.find("button[aria-controls='workbench-resource-menu']").exists()).toBe(true);
    expect(wrapper.find("button[aria-controls='workbench-model-menu']").exists()).toBe(true);

    await wrapper.find("textarea").setValue("第二条消息");
    await wrapper.find("button[title='发送消息']").trigger("click");
    await flushPromises();

    await wrapper.find("textarea").setValue("第三条消息");
    await wrapper.find("button[title='发送消息']").trigger("click");
    await flushPromises();

    expect(adapter.submitTask).toHaveBeenCalledTimes(3);
    expect(adapter.submitTask.mock.calls.map(([request]) => request.sessionId))
      .toEqual(["", "session:one", "session:one"]);
    expect(adapter.submitTask.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      agentId: "agent:normal",
      requestedModelId: "model:gpt",
      selectedSkillIds: ["skill:docs"],
      reasoning: expect.objectContaining({ requestedMode: "default" }),
    }));
    expect(adapter.submitTask.mock.calls[2]?.[0]).toEqual(expect.objectContaining({
      userInput: "第三条消息",
      agentId: "agent:normal",
      requestedModelId: "model:gpt",
      selectedSkillIds: ["skill:docs"],
    }));
    expect(wrapper.text()).not.toContain("任务进程");
    expect(wrapper.text()).not.toContain("工具调用");
    expect(wrapper.text()).not.toContain("当前模型 ·");
    expect(wrapper.text()).not.toContain("继续对话");

    const panelToggle = wrapper.find("[data-results-panel-toggle]");
    expect(panelToggle.attributes("aria-expanded")).toBe("false");
    await panelToggle.trigger("click");
    expect(wrapper.find("[aria-label='成果面板']").exists()).toBe(true);
    expect(wrapper.find("[aria-label='成果面板']").text()).toContain("暂无成果");
  });

  it("presents WFW activity and opens HTML and Markdown with existing safe preview APIs", async () => {
    const adapter = createAdapter();
    const htmlArtifactId = `artifact:${"2".repeat(64)}`;
    const markdownArtifactId = `artifact:${"3".repeat(64)}`;
    const tasks = createConversationTasksAdapter("completed", {
      detail: {
        toolActivities: [{
          activityId: "activity:wfw",
          taskId: "task:one",
          toolName: "文件写入",
          operationType: "tool.workspace.file.write_text",
          status: "completed",
          targetSummary: "成果/index.html",
          startedAt: timestamp,
          updatedAt: timestamp,
          endedAt: timestamp,
        }],
        artifacts: [
          artifactFixture(htmlArtifactId, "index.html", "html", "text/html"),
          artifactFixture(markdownArtifactId, "notes.md", "markdown", "text/markdown"),
        ],
      },
    });
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
          [tasksAdapterKey as symbol]: tasks.adapter,
        },
      },
    });
    await flushPromises();

    await wrapper.find("textarea").setValue("生成 HTML 和 Markdown 文件");
    await wrapper.find("button[title='提交任务']").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-task-progress]").exists()).toBe(false);

    await wrapper.find("[data-results-panel-toggle]").trigger("click");
    const artifactRows = wrapper.findAll(".workbench-page__artifact-list li");
    await artifactRows[0]?.find("button").trigger("click");
    await flushPromises();
    expect(tasks.adapter.startArtifactHtmlPreview).toHaveBeenCalledWith({
      artifactId: htmlArtifactId,
    });
    const iframe = wrapper.find("iframe[title='HTML 成果预览']");
    expect(iframe.attributes("src")).toBe("http://127.0.0.1:43123/preview/token");
    expect(iframe.attributes("sandbox")).toBe("");

    await artifactRows[1]?.find("button").trigger("click");
    await flushPromises();
    expect(tasks.adapter.closeArtifactPreview).toHaveBeenCalledWith({
      previewSessionId: "preview:00000000-0000-4000-8000-000000000099",
    });
    expect(tasks.adapter.previewArtifact).toHaveBeenCalledWith({
      artifactId: markdownArtifactId,
      mode: "markdown",
    });
    expect(wrapper.find("[data-workbench-artifact-preview]").text()).toContain("安全预览");
    expect(wrapper.html()).not.toContain("v-html");
  });

  it("shows live task feedback and replaces send with the real cancel command while running", async () => {
    const adapter = createAdapter();
    const tasks = createConversationTasksAdapter("running", {
      detail: {
        runs: [{
          runId: "run:one",
          attempt: 1,
          displayStatus: "running",
          steps: [{
            stepId: "step:model",
            sequence: 1,
            displayStatus: "running",
            actionType: "model.generate",
            actionSummary: "Action succeeded",
            observationSummary: "已理解任务目标",
            startedAt: timestamp,
            updatedAt: timestamp,
          }],
          startedAt: timestamp,
          updatedAt: timestamp,
        }],
        toolActivities: [{
          activityId: "activity:pptx",
          taskId: "task:one",
          toolName: "document.pptx.write",
          operationType: "tool.document.pptx.write",
          status: "running",
          targetSummary: "robothree-intro.pptx",
          statusSummary: "正在生成演示文稿",
          startedAt: timestamp,
          updatedAt: timestamp,
        }],
      },
    });
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
          [tasksAdapterKey as symbol]: tasks.adapter,
        },
      },
    });
    await flushPromises();

    await selectAgent(wrapper, "Normal Agent");
    await wrapper.find("textarea").setValue("执行一个长任务");
    await wrapper.find("button[title='提交任务']").trigger("click");
    await flushPromises();

    const progress = wrapper.find("[data-task-progress]");
    expect(progress.exists()).toBe(true);
    expect(progress.text()).toContain("RoboThree 正在处理");
    expect(progress.text()).toContain("已处理");
    expect(progress.text()).toContain("正在处理当前请求");
    expect(progress.text()).not.toContain("分析任务并组织回复");
    expect(progress.text()).not.toContain("Action succeeded");
    expect(progress.text()).toContain("生成演示文稿");
    expect(progress.text()).toContain("正在生成演示文稿");
    expect(progress.text()).not.toContain("model.generate");
    expect(progress.text()).not.toContain("tool.document.pptx.write");
    expect(wrapper.text()).not.toContain("RoboThree 正在回复");
    expect(wrapper.find("button[title='发送消息']").exists()).toBe(false);

    tasks.emit({
      contractVersion: "v1alpha1",
      eventId: "00000000-0000-4000-8000-000000000077",
      deliveryKind: "ephemeral",
      runtimeInstanceId: "runtime.instance-00000000-0000-4000-8000-000000000077",
      emittedAt: timestamp,
      payload: {
        type: "progress_delta",
        taskId: "task:one",
        progressKey: "model.stream_started.round_1",
        safeSummary: "模型已开始处理当前请求",
      },
    });
    await flushPromises();
    expect(wrapper.find("[data-task-progress]").text()).toContain("模型已开始处理当前请求");

    const stop = wrapper.find("[data-stop-task]");
    expect(stop.attributes("title")).toBe("终止任务");
    expect(stop.attributes("disabled")).toBeUndefined();
    await stop.trigger("click");
    await flushPromises();

    expect(tasks.adapter.cancelTask).toHaveBeenCalledWith({
      taskId: "task:one",
      expectedTaskRevision: 2,
    });
    expect(wrapper.find("[data-task-progress]").text()).toContain("正在终止任务");
  });

  it("polls the durable conversation while a task is active when Desktop events are missed", async () => {
    vi.useFakeTimers();
    try {
      const adapter = createAdapter();
      const tasks = createConversationTasksAdapter("running");
      const wrapper = mount(WorkbenchCreatePage, {
        global: {
          provide: {
            [workbenchAdapterKey as symbol]: adapter,
            [tasksAdapterKey as symbol]: tasks.adapter,
          },
        },
      });
      await flushPromises();

      await selectAgent(wrapper, "Normal Agent");
      await wrapper.find("textarea").setValue("生成一个需要工具执行的文件");
      await wrapper.find("button[title='提交任务']").trigger("click");
      await flushPromises();
      const callsBeforePoll = vi.mocked(tasks.adapter.loadTaskDetail).mock.calls.length;

      tasks.setDisplayStatus("completed");
      await vi.advanceTimersByTimeAsync(2_100);
      await flushPromises();

      expect(tasks.adapter.loadTaskDetail).toHaveBeenCalledTimes(callsBeforePoll + 1);
      expect(wrapper.find("[data-task-progress]").exists()).toBe(false);
      expect(wrapper.find("button[title='发送消息']").exists()).toBe(true);
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the confirmed cancellation in the conversation and restores input", async () => {
    const adapter = createAdapter();
    const tasks = createConversationTasksAdapter("running", {
      cancelTransitionsTo: "cancelled",
    });
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
          [tasksAdapterKey as symbol]: tasks.adapter,
        },
      },
    });
    await flushPromises();

    await selectAgent(wrapper, "Normal Agent");
    await wrapper.find("textarea").setValue("执行一个长任务");
    await wrapper.find("button[title='提交任务']").trigger("click");
    await flushPromises();
    await wrapper.find("[data-stop-task]").trigger("click");
    await flushPromises();

    const outcome = wrapper.find("[data-task-termination]");
    expect(outcome.exists()).toBe(true);
    expect(outcome.text()).toContain("任务已终止");
    expect(outcome.text()).toContain("你可以继续输入新的消息");
    expect(wrapper.find("[data-task-progress]").exists()).toBe(false);
    expect(wrapper.find("button[title='发送消息']").exists()).toBe(true);
  });

  it("submits a third turn when Core is waiting for the next user input", async () => {
    const adapter = createAdapter();
    const tasks = createConversationTasksAdapter("waiting_input");
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
          [tasksAdapterKey as symbol]: tasks.adapter,
        },
      },
    });
    await flushPromises();

    await selectAgent(wrapper, "Normal Agent");
    for (const message of ["第一条消息", "第二条消息", "第三条消息"]) {
      await wrapper.find("textarea").setValue(message);
      const submit = wrapper.find("button[title='发送消息']").exists()
        ? wrapper.find("button[title='发送消息']")
        : wrapper.find("button[title='提交任务']");
      expect(submit.attributes("disabled")).toBeUndefined();
      await submit.trigger("click");
      await flushPromises();
    }

    expect(adapter.submitTask).toHaveBeenCalledTimes(3);
    expect(adapter.submitTask.mock.calls.map(([request]) => request.sessionId))
      .toEqual(["", "session:one", "session:one"]);
    expect(adapter.submitTask.mock.calls[2]?.[0].userInput).toBe("第三条消息");
  });

  it("opens a sidebar conversation in the same Workbench and keeps its composer", async () => {
    rememberConversationSelection("session:one", {
      agentId: "agent:normal",
      requestedModelId: "model:gpt",
      selectedSkillIds: ["skill:docs"],
      selectedKnowledgeIds: [],
    });
    const adapter = createAdapter();
    const tasks = createConversationTasksAdapter();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/workbench", name: "workbench", component: WorkbenchCreatePage }],
    });
    await router.push({
      name: "workbench",
      query: { sessionId: "session:one", taskId: "task:one" },
    });
    await router.isReady();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        plugins: [router],
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
          [tasksAdapterKey as symbol]: tasks.adapter,
        },
      },
    });
    await flushPromises();

    expect(wrapper.find("[data-workbench-conversation]").text()).toContain("第一条真实回复");
    expect(wrapper.find(".workbench-page__composer-card textarea").exists()).toBe(true);
    expect(wrapper.find(".tasks-page").exists()).toBe(false);
    expect(wrapper.find("button[title='发送消息']").exists()).toBe(true);
  });

  it("submits a normal conversation from the default working directory", async () => {
    const adapter = createAdapter({ workspaces: [] });
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    await selectAgent(wrapper, "Normal Agent");
    await wrapper.find("textarea").setValue("Do work");

    const submitButton = wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"));
    expect(submitButton?.attributes("disabled")).toBeUndefined();
    expect(wrapper.text()).toContain("选择工作空间");
    expect(wrapper.text()).not.toContain("请选择一个已授权工作区");
    await submitButton?.trigger("click");
    await flushPromises();
    const request = adapter.submitTask.mock.calls[0]?.[0];
    expect(request).toBeDefined();
    expect(request).not.toHaveProperty("workspaceGrantId");
  });

  it("recovers from a default workspace failure without exposing a path", async () => {
    const adapter = createAdapter({ workspaces: [] });
    adapter.submitTask.mockRejectedValueOnce(new DesktopWorkbenchAdapterError(
      "The default workspace is unavailable.",
      "workspace.default_unavailable",
    ));
    adapter.createWorkspaceGrant.mockResolvedValueOnce({
      workspaceGrantId: "workspace:chosen",
      revision: digest,
      displayName: "已选择工作区",
      status: "active",
      accessMode: "read_write",
    });
    adapter.loadWorkbenchData.mockResolvedValueOnce(workbenchData({
      workspaces: [{
        workspaceGrantId: "workspace:chosen",
        revision: digest,
        displayName: "已选择工作区",
        status: "active",
        accessMode: "read_write",
      }],
    }));
    const wrapper = mount(WorkbenchCreatePage, {
      global: { provide: { [workbenchAdapterKey as symbol]: adapter } },
    });
    await flushPromises();

    await wrapper.find("textarea").setValue("创建一份 PPTX 汇报");
    await wrapper.find("button[title='提交任务']").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("默认工作目录暂时不可用，请选择一个工作区后重试。");
    expect(wrapper.text()).not.toMatch(/\.robothree|\/Users\/|workspaceRoot/u);
    await wrapper.find("[data-select-workspace-recovery]").trigger("click");
    await flushPromises();
    expect(adapter.createWorkspaceGrant).toHaveBeenCalledTimes(1);
  });

  it("allows the generic robot to request common document artifacts", async () => {
    const adapter = createAdapter({ workspaces: [] });
    const wrapper = mount(WorkbenchCreatePage, {
      global: { provide: { [workbenchAdapterKey as symbol]: adapter } },
    });
    await flushPromises();

    await wrapper.find("textarea").setValue("生成 PPTX、DOCX、XLSX 和 PDF 成果");
    expect(wrapper.find("button[title='提交任务']").attributes("disabled")).toBeUndefined();
    expect(wrapper.text()).not.toMatch(/通用机器人不能创建文件|请选择工作区后才能生成/u);
    await wrapper.find("button[title='提交任务']").trigger("click");
    await flushPromises();

    const request = adapter.submitTask.mock.calls[0]?.[0];
    expect(request).toMatchObject({ agentId: "" });
    expect(request).not.toHaveProperty("workspaceGrantId");
  });

  it("allows a published personal robot after it appears in the real Catalog", async () => {
    const published = {
      ...agentFixture(),
      agentId: "agent.personal-published",
      name: "已发布文档助手",
    };
    const adapter = createAdapter({ agents: [published] });
    const wrapper = mount(WorkbenchCreatePage, {
      global: { provide: { [workbenchAdapterKey as symbol]: adapter } },
    });
    await flushPromises();

    await selectAgent(wrapper, "已发布文档助手");
    await wrapper.find("textarea").setValue("整理本周项目进展");
    await wrapper.find("button[title='提交任务']").trigger("click");
    await flushPromises();

    expect(adapter.submitTask).toHaveBeenCalledWith(expect.objectContaining({
      agentId: "agent.personal-published",
    }));
  });

  it("submits with Enter and keeps Shift+Enter for a newline", async () => {
    const adapter = createAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: { provide: { [workbenchAdapterKey as symbol]: adapter } },
    });
    await flushPromises();

    const textarea = wrapper.find("textarea");
    await textarea.setValue("第一行");
    await textarea.trigger("keydown", { key: "Enter", shiftKey: true });
    await flushPromises();
    expect(adapter.submitTask).not.toHaveBeenCalled();

    await textarea.trigger("keydown", { key: "Enter", shiftKey: false });
    await flushPromises();
    expect(adapter.submitTask).toHaveBeenCalledTimes(1);
  });

  it("fails closed on the generic robot when the model catalog has no available model", async () => {
    const adapter = createAdapter({
      models: [{
        modelId: "model:gpt",
        revision: digest,
        name: "GPT",
        source: "official",
        capabilities: ["text", "tool_calling"],
        available: false,
        unavailableReason: "Model is unavailable",
      }],
    });
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    await wrapper.find("textarea").setValue("Do work");
    const submitButton = wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"));
    expect(submitButton?.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("当前没有可用模型，请联系管理员。");

    await submitButton?.trigger("click");
    await flushPromises();

    expect(adapter.submitTask).not.toHaveBeenCalled();
  });

  it("submits only explicitly selected Skill and Knowledge ids", async () => {
    const adapter = createAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    await selectAgent(wrapper, "Normal Agent");
    await selectSkill(wrapper, "Docs");
    await selectKnowledge(wrapper, "Knowledge");
    await wrapper.find("textarea").setValue("Use selected resources");
    await wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"))
      ?.trigger("click");
    await flushPromises();

    expect(adapter.submitTask).toHaveBeenCalledWith(expect.objectContaining({
      selectedSkillIds: ["skill:docs"],
      selectedKnowledgeIds: ["knowledge:one"],
    }));
  });

  it("adds and removes one exact workspace attachment and submits it without a real path", async () => {
    const adapter = createAdapter();
    const attachment = workspaceAttachmentFixture();
    adapter.pickWorkspaceAttachment.mockResolvedValueOnce(attachment);
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    await addAttachment(wrapper);
    await flushPromises();

    expect(adapter.pickWorkspaceAttachment).toHaveBeenCalledWith("workspace:one");
    expect(wrapper.text()).toContain("项目资料.docx");
    expect(wrapper.text()).toContain("DOCX");
    expect(wrapper.text()).not.toContain("/Users/");

    await wrapper.find("textarea").setValue("Create a presentation");
    await wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"))
      ?.trigger("click");
    await flushPromises();

    expect(adapter.submitTask).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [attachment],
      workspaceGrantId: "workspace:one",
    }));

    adapter.pickWorkspaceAttachment.mockResolvedValueOnce(attachment);
    await addAttachment(wrapper);
    await flushPromises();
    await wrapper.find(`[aria-label='移除资料 ${attachment.displayName}']`).trigger("click");
    expect(wrapper.text()).not.toContain("项目资料.docx");
  });

  it("keeps explicit empty resource selections empty after users clear the final item", async () => {
    const adapter = createAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    await selectAgent(wrapper, "Normal Agent");
    await openResourceSection(wrapper, "技能");
    const skill = wrapper.find("[aria-label='技能选择'] input");
    await skill.setValue(true);
    await skill.setValue(false);
    await closeWithEscape();
    await openResourceSection(wrapper, "知识");
    const knowledge = wrapper.find("[aria-label='知识选择'] input");
    await knowledge.setValue(true);
    await knowledge.setValue(false);
    await wrapper.find("textarea").setValue("Run without resources");
    await wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"))
      ?.trigger("click");
    await flushPromises();

    expect(adapter.submitTask).toHaveBeenCalledWith(expect.objectContaining({
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
    }));
  });

  it("does not offer global models when the selected agent has no eligible model", async () => {
    const adapter = createAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();
    await selectAgent(wrapper, "Normal Agent");
    adapter.loadWorkbenchData.mockResolvedValueOnce(workbenchData({
      agents: [{ ...agentFixture(), eligibleModels: [], runnable: false }],
    }));
    await wrapper.findAll("button").find((button) => button.text().includes("刷新"))?.trigger("click");
    await flushPromises();
    await wrapper.find("textarea").setValue("Do work");

    const submitButton = wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"));
    expect(submitButton?.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("该机器人当前没有可用模型，请更换机器人或联系管理员。");
  });

  it("keeps a selected robot when refresh marks it unavailable and does not switch to another runnable robot", async () => {
    const brokenAgent = {
      ...agentFixture(),
      agentId: "agent:broken",
      name: "Broken Agent",
    };
    const generalAgent = {
      ...agentFixture(),
      agentId: "agent:general",
      name: "General Agent",
    };
    const adapter = createAdapter({
      agents: [brokenAgent, generalAgent],
    });
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    await selectAgent(wrapper, "Broken Agent");
    adapter.loadWorkbenchData.mockResolvedValueOnce(workbenchData({
      agents: [{
        ...brokenAgent,
        eligibleModels: [],
        runnable: false,
      }, generalAgent],
    }));
    await wrapper.findAll("button")
      .find((button) => button.text().includes("刷新"))
      ?.trigger("click");
    await flushPromises();

    expect(wrapper.find("button[aria-controls='workbench-model-menu']").text())
      .toContain("选择模型");
    expect(wrapper.text()).toContain("该机器人当前没有可用模型，请更换机器人或联系管理员。");

    await wrapper.find("textarea").setValue("Do not switch robots");
    await wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"))
      ?.trigger("click");
    await flushPromises();

    expect(adapter.submitTask).not.toHaveBeenCalled();
  });

  it("keeps robot selection empty across repeated refreshes after the selected robot disappears", async () => {
    const brokenAgent = {
      ...agentFixture(),
      agentId: "agent:broken",
      name: "Broken Agent",
    };
    const generalAgent = {
      ...agentFixture(),
      agentId: "agent:general",
      name: "General Agent",
    };
    const adapter = createAdapter({
      agents: [brokenAgent, generalAgent],
    });
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    await selectAgent(wrapper, "Broken Agent");
    const disappearedCatalog = workbenchData({
      agents: [generalAgent],
    });
    adapter.loadWorkbenchData
      .mockResolvedValueOnce(disappearedCatalog)
      .mockResolvedValueOnce(disappearedCatalog);

    const refreshButton = wrapper.findAll("button")
      .find((button) => button.text().includes("刷新"));
    await refreshButton?.trigger("click");
    await flushPromises();

    expect(wrapper.find("button[aria-controls='workbench-model-menu']").text())
      .toContain("选择模型");
    expect(wrapper.text()).toContain("请选择机器人，或切换为通用机器人。");

    await refreshButton?.trigger("click");
    await flushPromises();

    expect(wrapper.find("button[aria-controls='workbench-model-menu']").text())
      .toContain("选择模型");
    expect(wrapper.text()).toContain("请选择机器人，或切换为通用机器人。");

    expect(wrapper.find("[data-use-general-agent]").exists()).toBe(true);
    await wrapper.find("[data-use-general-agent]").trigger("click");
    await wrapper.find("textarea").setValue("Use the generic agent");
    await wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"))
      ?.trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("使用通用机器人");
    expect(adapter.submitTask).toHaveBeenCalledWith(expect.objectContaining({
      agentId: "",
      requestedModelId: "model:gpt",
    }));
  });

  it("shows a real submit failure without local success text", async () => {
    const adapter = createAdapter();
    adapter.submitTask.mockRejectedValueOnce(new DesktopWorkbenchAdapterError("任务未能提交。"));
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
        },
      },
    });
    await flushPromises();

    await selectAgent(wrapper, "Normal Agent");
    await selectModel(wrapper, "GPT");
    await flushPromises();
    await wrapper.find("textarea").setValue("Submit failure");
    await wrapper.findAll("button")
      .find((button) => button.text().includes("提交任务"))
      ?.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("任务未能提交。");
    expect(wrapper.text()).not.toContain("已进入本地运行队列");
  });

  it("renders one accessible Max switch and saves the exact preference revision", async () => {
    const adapter = createAdapter();
    const reasoning = createReasoningAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
          [reasoningModeAdapterKey as symbol]: reasoning.adapter,
        },
      },
    });
    await flushPromises();

    await selectAgent(wrapper, "Normal Agent");
    await selectModel(wrapper, "GPT");
    await wrapper.find("button[aria-controls='workbench-model-menu']").trigger("click");
    const switches = wrapper.findAll("[role='switch']");
    expect(switches).toHaveLength(1);
    expect(wrapper.text()).toContain("当前模型支持 Max");
    await switches[0]!.trigger("click");
    await flushPromises();

    expect(switches[0]!.attributes("aria-checked")).toBe("true");
    expect(reasoning.save).toHaveBeenCalledWith(expect.objectContaining({
      requestedMode: "max",
      expectedPreferenceRevision: 7,
    }));
    expect(wrapper.text()).toContain("已保存为后续新任务的默认选择");
  });

  it("previews and enables Max for the built-in general agent", async () => {
    const adapter = createAdapter({ agents: [] });
    const reasoning = createReasoningAdapter();
    const wrapper = mount(WorkbenchCreatePage, {
      global: {
        provide: {
          [workbenchAdapterKey as symbol]: adapter,
          [reasoningModeAdapterKey as symbol]: reasoning.adapter,
        },
      },
    });
    await flushPromises();

    expect(reasoning.preview).toHaveBeenCalledWith(expect.objectContaining({
      agentId: "agent.general",
      requestedModelId: "model:gpt",
    }));
    await wrapper.find("button[aria-controls='workbench-model-menu']").trigger("click");
    const maxSwitch = wrapper.find("[role='switch']");
    expect(maxSwitch.attributes("disabled")).toBeUndefined();
    expect(wrapper.text()).toContain("当前模型支持 Max");
    await maxSwitch.trigger("click");
    await flushPromises();

    expect(maxSwitch.attributes("aria-checked")).toBe("true");
    expect(reasoning.save).toHaveBeenCalledWith(expect.objectContaining({
      requestedMode: "max",
      expectedPreferenceRevision: 7,
    }));
  });
});

async function openResourceSection(wrapper: VueWrapper, section: string): Promise<void> {
  const trigger = wrapper.find("button[aria-controls='workbench-resource-menu']");
  if (trigger.attributes("aria-expanded") !== "true") await trigger.trigger("click");
  const sectionButton = wrapper.findAll("#workbench-resource-menu button")
    .find((button) => button.text().includes(section));
  if (sectionButton === undefined) throw new Error(`Missing resource section: ${section}`);
  await sectionButton.trigger("click");
  await flushPromises();
}

async function selectAgent(wrapper: VueWrapper, label: string): Promise<void> {
  await openResourceSection(wrapper, "机器人");
  const option = wrapper.findAll("[aria-label='机器人选择'] button")
    .find((button) => button.text().includes(label));
  if (option === undefined) throw new Error(`Missing agent option: ${label}`);
  await option.trigger("click");
  await flushPromises();
}

async function selectSkill(wrapper: VueWrapper, label: string): Promise<void> {
  await openResourceSection(wrapper, "技能");
  const option = wrapper.findAll("[aria-label='技能选择'] label")
    .find((item) => item.text().includes(label));
  if (option === undefined) throw new Error(`Missing skill option: ${label}`);
  await option.find("input").setValue(true);
  await closeWithEscape();
}

async function selectKnowledge(wrapper: VueWrapper, label: string): Promise<void> {
  await openResourceSection(wrapper, "知识");
  const option = wrapper.findAll("[aria-label='知识选择'] label")
    .find((item) => item.text().includes(label));
  if (option === undefined) throw new Error(`Missing knowledge option: ${label}`);
  await option.find("input").setValue(true);
  await closeWithEscape();
}

async function selectModel(wrapper: VueWrapper, label: string): Promise<void> {
  const trigger = wrapper.find("button[aria-controls='workbench-model-menu']");
  if (trigger.attributes("aria-expanded") !== "true") await trigger.trigger("click");
  const option = wrapper.findAll("#workbench-model-menu .workbench-page__option-list button")
    .find((button) => button.text().includes(label));
  if (option === undefined) throw new Error(`Missing model option: ${label}`);
  await option.trigger("click");
  await flushPromises();
}

async function addAttachment(wrapper: VueWrapper): Promise<void> {
  const trigger = wrapper.find("button[aria-controls='workbench-resource-menu']");
  if (trigger.attributes("aria-expanded") !== "true") await trigger.trigger("click");
  await wrapper.findAll("#workbench-resource-menu button")
    .find((button) => button.text().includes("添加文件"))
    ?.trigger("click");
  await flushPromises();
}

async function closeWithEscape(): Promise<void> {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await flushPromises();
}

function createAdapter(
  overrides: Partial<Awaited<ReturnType<WorkbenchAdapter["loadWorkbenchData"]>>> = {},
) {
  const adapter = {
    loadWorkbenchData: vi.fn(async () => workbenchData(overrides)),
    createWorkspaceGrant: vi.fn(async () => undefined),
    pickWorkspaceAttachment: vi.fn(async () => undefined),
    submitTask: vi.fn(async () => ({
      session: sessionFixture(),
      receipt: {
        submitTurnCommandId: "00000000-0000-4000-8000-000000000001",
        clientTurnId: "turn:00000000-0000-4000-8000-000000000002",
        userMessageId: "message:user",
        taskId: "task:one",
        runtimeSelectionId: "runtime:one",
        status: "accepted",
        acceptedAt: timestamp,
      },
    })),
    recoverReasoningSubmit: vi.fn(),
  };
  return adapter;
}

function createConversationTasksAdapter(
  displayStatus: "completed" | "waiting_input" | "running" | "cancelled" = "completed",
  options: Readonly<{
    cancelTransitionsTo?: "completed" | "waiting_input" | "running" | "cancelled";
    detail?: Partial<Pick<TaskDetailProjection, "runs" | "toolActivities" | "artifacts">>;
  }> = {},
) {
  let currentDisplayStatus = displayStatus;
  let eventHandler: Parameters<TasksAdapter["subscribe"]>[0] | undefined;
  const adapter = {
    loadConversation: vi.fn(async () => ({
      sessionId: "session:one",
      sessionRevision: 2,
      messages: [{
        messageId: "message:user",
        sessionId: "session:one",
        sequence: 1,
        role: "user" as const,
        status: "completed" as const,
        content: "第一条消息",
        taskId: "task:one",
        createdAt: timestamp,
      }, {
        messageId: "message:assistant",
        sessionId: "session:one",
        sequence: 2,
        role: "assistant" as const,
        status: "completed" as const,
        content: "第一条真实回复",
        taskId: "task:one",
        createdAt: timestamp,
      }],
      activeTaskSummaries: [],
      latestDurableCursor: "cursor:conversation",
      hasMoreBefore: false,
    })),
    loadTaskDetail: vi.fn(async () => ({
      summary: {
        taskId: "task:one",
        sessionId: "session:one",
        userMessageId: "message:user",
        revision: 2,
        displayStatus: currentDisplayStatus,
        createdAt: timestamp,
        updatedAt: timestamp,
        resolvedAgentId: "agent:normal",
        resolvedModelId: "model:gpt",
      },
      goalSummary: "第一条消息",
      runs: options.detail?.runs ?? [],
      toolActivities: options.detail?.toolActivities ?? [],
      userConfirmations: [],
      artifacts: options.detail?.artifacts ?? [],
      latestDurableCursor: "cursor:task",
    })),
    previewArtifact: vi.fn(async ({ artifactId, mode }) => ({
      artifactId,
      mode,
      content: "## 安全预览",
      byteSize: 17,
      truncated: false,
      warnings: [],
    })),
    startArtifactHtmlPreview: vi.fn(async ({ artifactId }) => ({
      artifactId,
      previewSessionId: "preview:00000000-0000-4000-8000-000000000099",
      localOrigin: "http://127.0.0.1" as const,
      previewUrl: "http://127.0.0.1:43123/preview/token",
      csp: "default-src 'none'; script-src 'none'; connect-src 'none'",
      expiresAt: "2026-08-31T10:10:00.000Z",
      warnings: [],
    })),
    closeArtifactPreview: vi.fn(async () => undefined),
    openArtifactLocation: vi.fn(async () => ({
      commandId: "00000000-0000-4000-8000-000000000099",
      artifactId: `artifact:${"1".repeat(64)}`,
      opened: true,
    })),
    cancelTask: vi.fn(async () => {
      if (options.cancelTransitionsTo !== undefined) {
        currentDisplayStatus = options.cancelTransitionsTo;
      }
      return {
        commandId: "00000000-0000-4000-8000-000000000088",
        taskId: "task:one",
        commandType: "cancel_task" as const,
        status: "accepted" as const,
        taskRevision: 3,
        acceptedAt: timestamp,
      };
    }),
    subscribe: vi.fn((handler: Parameters<TasksAdapter["subscribe"]>[0]) => {
      eventHandler = handler;
      return () => {
        eventHandler = undefined;
      };
    }),
  } as unknown as TasksAdapter;
  return {
    adapter,
    emit: (event: Parameters<TasksAdapter["subscribe"]>[0] extends
      (value: infer Event) => void ? Event : never) => eventHandler?.(event),
    setDisplayStatus: (status: typeof currentDisplayStatus) => {
      currentDisplayStatus = status;
    },
  };
}

function artifactFixture(
  artifactId: string,
  displayName: string,
  kind: "html" | "markdown" | "text",
  mediaType: string,
) {
  return {
    artifactId,
    taskId: "task:one",
    sourceKind: "tool_observation" as const,
    sourceId: `source:${artifactId}`,
    sourceDigest: `sha256:${digest}` as const,
    displayName,
    kind,
    mediaType,
    relativePath: `成果/${displayName}`,
    byteSize: 128,
    createdAt: timestamp,
    previewState: "ready" as const,
    lifecycle: {
      revision: 0,
      pinned: false,
      dismissed: false,
      deleted: false,
      sourceDeleted: false,
    },
    metadata: {},
  };
}

function workspaceAttachmentFixture() {
  return {
    artifactId: `artifact:${"1".repeat(64)}`,
    sourceKind: "workspace_file" as const,
    sourceId: `sha256:${digest}` as const,
    sourceDigest: `sha256:${digest}` as const,
    displayName: "项目资料.docx",
    kind: "document" as const,
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    relativePath: "资料/项目资料.docx",
    byteSize: 1024,
    createdAt: timestamp,
    previewState: "unsupported" as const,
    lifecycle: {
      revision: 0,
      pinned: false,
      dismissed: false,
      deleted: false,
      sourceDeleted: false,
    },
    metadata: {},
  };
}

function createReasoningAdapter() {
  const save = vi.fn(async (input) => ({
    ok: true,
    value: {
      contractVersion: "v1alpha5",
      commandId: input.commandId,
      requestDigest: `sha256:${digest}`,
      expectedPreferenceRevision: input.expectedPreferenceRevision,
      committedPreferenceRevision: input.expectedPreferenceRevision + 1,
      requestedMode: input.requestedMode,
      outcome: "preference_committed",
      committedAt: timestamp,
      receiptDigest: `sha256:${digest}`,
    },
  }));
  const preview = vi.fn(async () => ({ ok: true, value: {
    effectiveModelId: "model:gpt", effectiveModelRevision: `sha256:${digest}`,
    maxSupport: "supported", maxSupportRevision: `sha256:${digest}`,
    preference: "default", preferenceRevision: 7,
    preferencePersistence: "available", testIdentityUsed: false,
    productionIdentityReady: true,
  } }));
  const api = {
    contractVersion: "v1alpha5",
    getCompatibility: vi.fn(async () => ({ ok: true, value: {
      contractVersion: "v1alpha5", coreVersion: "test",
      selectedContractVersion: "v1alpha5", runtimeInstanceId: "runtime:test",
      transportClientInstanceId: crypto.randomUUID(),
      features: [{ feature: "max_reasoning_mode_core", state: "available", reasonCode: "ready" }],
    } })),
    getReasoningModePreference: vi.fn(async () => ({ ok: true, value: {
      contractVersion: "v1alpha5", requestedMode: "default", preferenceRevision: 7,
      preferencePersistence: "available", testIdentityUsed: false,
      productionIdentityReady: true,
    } })),
    previewReasoningMode: preview,
    updateReasoningModePreference: save,
  } as never;
  return { adapter: new ReasoningModeAdapter({ api, taskApi: undefined }), preview, save };
}

function workbenchData(
  overrides: Partial<Awaited<ReturnType<WorkbenchAdapter["loadWorkbenchData"]>>> = {},
) {
  return {
    workspaces: [{
      workspaceGrantId: "workspace:one",
      displayName: "Workspace One",
      rootDisplayPath: "Workspace One",
      accessMode: "read_write",
      status: "active",
      createdAt: timestamp,
    }],
    sessions: [sessionFixture()],
    agents: [agentFixture()],
    models: [{
      modelId: "model:gpt",
      revision: digest,
      name: "GPT",
      source: "official",
      capabilities: ["text", "tool_calling"],
      available: true,
    }],
    recentTasks: [],
    recentArtifacts: [],
    ...overrides,
  };
}

function sessionFixture() {
  const session = {
    sessionId: "session:one",
    revision: 1,
    title: "Planning",
    tombstoned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return session;
}

function agentFixture() {
  return {
    agentId: "agent:normal",
    revision: digest,
    name: "Normal Agent",
    identity: "Normal",
    goal: "Help",
    defaultModelId: "model:gpt",
    allowModelOverride: true,
    eligibleModels: [{
      modelId: "model:gpt",
      revision: digest,
      name: "GPT",
      source: "official" as const,
      capabilities: ["text", "tool_calling"] as const,
      available: true,
    }],
    requiredModelCapabilities: ["text"] as const,
    skills: [
      { id: "skill:docs", revision: digest, name: "Docs", available: true },
    ],
    tools: [
      { id: "tool.document.pdf.extract_text", revision: digest, name: "PDF", available: true },
      { id: "tool.document.xlsx.write", revision: digest, name: "XLSX", available: true },
    ],
    knowledge: [
      { id: "knowledge:one", revision: digest, name: "Knowledge", available: true },
    ],
    runnable: true,
  };
}
