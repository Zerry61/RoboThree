import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";
import { CONTRACT_VERSION, JsonValueSchema } from
  "../packages/contracts/dist/index.js";
import { projectEnterpriseProviderToolName } from
  "../services/core/dist/application/enterprise-model-request-converter.js";
import { sha256CanonicalJson } from
  "../services/core/dist/persistence/digest.js";
import {
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "../services/core/dist/registry/capability-revision.js";
import { RegistryBuilder } from
  "../services/core/dist/registry/registry-builder.js";
import { CorePrivateSupervisor } from
  "../apps/desktop/dist/main/core-private-supervisor.js";
import { DesktopEventReconnectController } from
  "../apps/desktop/dist/main/desktop-event-reconnect-controller.js";
import { DesktopIpcRouter } from
  "../apps/desktop/dist/main/desktop-ipc-router.js";
import { DesktopV1Alpha4IpcRouter } from
  "../apps/desktop/dist/main/desktop-v1alpha4-ipc-router.js";
import { DesktopV1Alpha5IpcRouter } from
  "../apps/desktop/dist/main/desktop-v1alpha5-ipc-router.js";
import { DesktopTaskReasoningV1Alpha1IpcRouter } from
  "../apps/desktop/dist/main/desktop-task-reasoning-v1alpha1-ipc-router.js";
import { createSecureWindowOptions } from
  "../apps/desktop/dist/main/window-security.js";
import {
  DESKTOP_IPC_CHANNELS,
  DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS,
  DESKTOP_V1ALPHA4_IPC_CHANNELS,
  DESKTOP_V1ALPHA5_IPC_CHANNELS,
} from "../apps/desktop/dist/shared/foundation-api.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const deploymentEnvironmentName =
  "ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT";
const tokenEnvironmentName =
  "ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN";
const sourceFileName = "项目资料.docx";
const artifactFileName = "资料汇报.pptx";
const revisedArtifactFileName = "资料汇报-v2.pptx";
const followUpUserInput =
  "将第 3 页改为风险与下一步，并生成资料汇报-v2.pptx，不覆盖原文件。";
const expectedSourceText = "段落 Unicode 你好 β";
const source = Object.freeze({
  trust: "enterprise",
  packageId: "deployment.internal-trial.vs2",
  packageRevision: `sha256:${"a".repeat(64)}`,
});

app.on("window-all-closed", () => undefined);

void app.whenReady().then(run).then((evidence) => {
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  app.quit();
}).catch((error) => {
  process.stderr.write(`${safeCode(error)}\n`);
  app.exit(1);
});

async function run() {
  const directory = await mkdtemp(join(tmpdir(), "robothree-mvp-vs2-"));
  await writeDocxFixture(join(directory, sourceFileName));
  const gateway = await startGatewayFixture();
  const now = Date.now();
  process.env[deploymentEnvironmentName] = JSON.stringify(
    deployment(gateway.origin, gateway.modelId),
  );
  process.env[tokenEnvironmentName] = compactToken({
    issuedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 3_600_000).toISOString(),
  });
  let supervisor;
  let window;
  let eventSubscription;
  const handlers = [];
  let routers;
  try {
    supervisor = new CorePrivateSupervisor({
      entryPath: join(root, "services/core/dist/desktop-private-main.js"),
      databasePath: join(directory, "robothree.sqlite"),
      maxUnexpectedRestarts: 2,
    });
    if (process.env[deploymentEnvironmentName] !== undefined
      || process.env[tokenEnvironmentName] !== undefined) {
      throw new Error("vs2_privileged_environment_not_consumed");
    }
    await supervisor.start();
    routers = registerRouters(supervisor, handlers, directory);
    window = new BrowserWindow(createSecureWindowOptions(
      join(root, "apps/desktop/dist/preload/index.cjs"),
    ));
    const clearBindings = () => {
      routers.v1alpha5.removeWebContents(window.webContents.id);
      routers.taskReasoning.removeWebContents(window.webContents.id);
    };
    window.webContents.on("did-start-navigation", clearBindings);
    window.webContents.on("render-process-gone", clearBindings);
    eventSubscription = new DesktopEventReconnectController({
      resolveConnection: () => ({
        client: supervisor.client,
        clientInstanceId: supervisor.clientInstanceId,
      }),
      canReconnect: () => {
        const state = supervisor.snapshot().runtimeState;
        return state !== "failed" && state !== "stopped";
      },
    }).start((value) => {
      if (!window.isDestroyed()) {
        window.webContents.send(DESKTOP_IPC_CHANNELS.desktopEvent, value);
      }
    });

    await window.loadFile(join(root, "apps/desktop/dist/renderer/index.html"), {
      hash: "/workbench",
    });
    let submitted;
    try {
      submitted = await window.webContents.executeJavaScript(
        workbenchDriverScript(gateway.modelId),
        true,
      );
    } catch (error) {
      const failures = routers.safeFailures.slice(-3);
      if (failures.length > 0) {
        throw new Error(`vs2_${failures.map((failure) =>
          `${failure.channel.replaceAll(":", "_")}_${failure.code.replaceAll(".", "_")}`)
          .join("__")}`);
      }
      throw error;
    }
    await gateway.waitForRoundTwoEventAttempt(1);
    Object.assign(submitted, await loadLatestSubmittedTask(supervisor.client));
    const firstRoundTwo = gateway.requests.find((request) =>
      request.logicalRound === 2 && request.transportAttempt === 1);
    if (firstRoundTwo === undefined
      || !JSON.stringify(firstRoundTwo.body).includes(expectedSourceText)) {
      throw new Error("vs2_first_round_two_observation_missing");
    }

    const firstRuntimeInstanceId = supervisor.runtimeInstanceId;
    const firstCorePid = findCoreChildPid();
    process.kill(firstCorePid, "SIGKILL");
    await observeExitedProcess(firstCorePid);
    await waitForSupervisorRecovery(supervisor, firstRuntimeInstanceId);
    const secondRuntimeInstanceId = supervisor.runtimeInstanceId;
    try {
      await gateway.waitForRoundTwoEventAttempt(2);
    } catch {
      const detail = await supervisor.client.loadTaskDetail({
        contractVersion: "v1alpha1",
        type: "task_detail",
        queryId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId: randomUUID(),
        taskId: submitted.taskId,
      });
      const status = detail.ok ? detail.value.summary.displayStatus : detail.error.code;
      throw new Error(`vs2_round_two_recovery_${status.replaceAll(".", "_")}`);
    }
    gateway.releaseRoundTwo();

    await loadTaskRoute(window, submitted.taskId, submitted.sessionId);
    const confirmed = await window.webContents.executeJavaScript(
      confirmationDriverScript(submitted.taskId),
      true,
    );
    if (confirmed?.applied !== true && confirmed?.notRequired !== true) {
      throw new Error("vs2_confirmation_not_applied");
    }
    await waitForTaskDisplayStatus(supervisor.client, submitted.taskId, "completed");
    await loadTaskRoute(window, submitted.taskId, submitted.sessionId);
    let completed;
    try {
      completed = await window.webContents.executeJavaScript(
        completedTaskDomScript(),
        true,
      );
    } catch (error) {
      const dom = await window.webContents.executeJavaScript(`({
        assistant: document.body.innerText.includes("已根据工作空间资料生成 PPTX"),
        artifact: document.body.innerText.includes(${JSON.stringify(artifactFileName)}),
        readStage: document.body.innerText.includes("读取资料"),
        writeStage: document.body.innerText.includes("生成成果"),
      })`, true);
      const detail = await supervisor.client.loadTaskDetail({
        contractVersion: "v1alpha1",
        type: "task_detail",
        queryId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId: randomUUID(),
        taskId: submitted.taskId,
      });
      const status = detail.ok ? detail.value.summary.displayStatus : detail.error.code;
      const counts = gateway.requestCounts();
      const latestSafeFailure = routers.safeFailures.at(-1)?.code
        .replaceAll(".", "_") ?? "none";
      const driverCode = error instanceof Error
        ? error.message.match(/vs2_[a-z0-9_]+/u)?.[0] ?? "vs2_driver_unknown"
        : "vs2_driver_unknown";
      const readActivityCount = detail.ok
        ? detail.value.toolActivities.filter((activity) => [
          "tool.document.docx.read",
          "tool.document.xlsx.read",
          "tool.document.pdf.extract_text",
        ].includes(activity.operationType)).length
        : 0;
      const writeActivityCount = detail.ok
        ? detail.value.toolActivities.filter((activity) =>
          activity.operationType === "tool.document.pptx.write").length
        : 0;
      throw new Error([
        "vs2_completed_task_dom_timeout",
        driverCode,
        status.replaceAll(".", "_"),
        `round_three_${counts.roundThree}`,
        `assistant_${dom.assistant === true ? 1 : 0}`,
        `artifact_${dom.artifact === true ? 1 : 0}`,
        `read_${dom.readStage === true ? 1 : 0}`,
        `write_${dom.writeStage === true ? 1 : 0}`,
        `read_activity_${readActivityCount}`,
        `write_activity_${writeActivityCount}`,
        `safe_failure_${latestSafeFailure}`,
      ].join("_"));
    }
    const file = await stat(join(directory, artifactFileName));
    if (!file.isFile() || file.size === 0) {
      throw new Error("vs2_pptx_artifact_file_invalid");
    }
    const requestCounts = gateway.requestCounts();
    if (requestCounts.roundOne !== 1
      || requestCounts.roundTwo !== 1
      || requestCounts.roundThree !== 1
      || requestCounts.total !== 3
      || requestCounts.roundTwoEventSubscriptions !== 2) {
      throw new Error("vs2_gateway_round_count_invalid");
    }
    const roundTwoRequests = gateway.requests.filter((request) =>
      request.logicalRound === 2);
    if (roundTwoRequests.length !== 1) throw new Error("vs2_round_two_accept_count_invalid");

    const followUpWorkbench = await window.webContents.executeJavaScript(
      followUpWorkbenchDriverScript(gateway.modelId),
      true,
    );
    const revisedTask = await loadLatestSubmittedTaskExcluding(
      supervisor.client,
      submitted.taskId,
    );
    await waitFor(() => gateway.requestCounts().roundFour === 1,
      "vs3_follow_up_gateway_request_missing", 40_000);
    const followUpRequest = gateway.requests.find((request) =>
      request.logicalRound === 4);
    const followUpRequestText = JSON.stringify(followUpRequest?.body);
    if (!followUpRequestText.includes("请根据已添加的资料生成一份项目汇报 PPT。")
      || !followUpRequestText.includes("已根据工作空间资料生成 PPTX")
      || !followUpRequestText.includes(artifactFileName)) {
      throw new Error("vs3_same_session_context_incomplete");
    }
    await loadTaskRoute(window, revisedTask.taskId, revisedTask.sessionId);
    const revisedConfirmation = await window.webContents.executeJavaScript(
      confirmationDriverScript(revisedTask.taskId),
      true,
    );
    if (revisedConfirmation?.applied !== true
      && revisedConfirmation?.notRequired !== true) {
      throw new Error("vs3_revision_confirmation_not_applied");
    }
    await waitForTaskDisplayStatus(supervisor.client, revisedTask.taskId, "completed");
    await loadTaskRoute(window, revisedTask.taskId, revisedTask.sessionId);
    const revisedCompleted = await window.webContents.executeJavaScript(
      revisedTaskDomScript(revisedTask.taskId),
      true,
    );
    const revisedFile = await stat(join(directory, revisedArtifactFileName));
    if (!revisedFile.isFile() || revisedFile.size === 0) {
      throw new Error("vs3_revised_pptx_artifact_file_invalid");
    }

    const preClosureRuntimeInstanceId = supervisor.runtimeInstanceId;
    const preClosureCorePid = findCoreChildPid();
    process.kill(preClosureCorePid, "SIGKILL");
    await observeExitedProcess(preClosureCorePid);
    await waitForSupervisorRecovery(supervisor, preClosureRuntimeInstanceId);
    const closureRuntimeInstanceId = supervisor.runtimeInstanceId;
    await loadTaskRoute(window, submitted.taskId, submitted.sessionId);
    const restoredOriginal = await window.webContents.executeJavaScript(
      completedTaskDomScript(),
      true,
    );
    await loadTaskRoute(window, revisedTask.taskId, revisedTask.sessionId);
    const restoredRevision = await window.webContents.executeJavaScript(
      revisedTaskDomScript(revisedTask.taskId),
      true,
    );
    const finalRequestCounts = gateway.requestCounts();
    if (finalRequestCounts.roundFour !== 1
      || finalRequestCounts.roundFive !== 1
      || finalRequestCounts.total !== 5) {
      throw new Error("vs3_gateway_round_count_invalid");
    }
    const preferences = window.webContents.getLastWebPreferences();
    return Object.freeze({
      status: "PASS",
      outcome: "MVP_VS3_COMPLETED_TASK_FOLLOW_UP_E2E_CONFORMANT",
      upstreamOutcome: "MVP_VS2_WORKSPACE_SOURCE_TO_ARTIFACT_E2E_CONFORMANT",
      realElectronMain: true,
      realRendererWorkbench: submitted.realRendererWorkbench === true,
      realRendererTaskDetail: completed.realRendererTaskDetail === true,
      realMainIpc: true,
      realCoreChild: true,
      realSqliteReopen: true,
      realDocumentWorker: true,
      realGatewayHttpSse: true,
      appLevelWebContentsDriver: true,
      osInputAutomationClaimed: false,
      nativeFileDialogAutomationClaimed: false,
      internalTrialEnvironmentConsumed: true,
      rendererSensitiveEnvironmentAbsent:
        submitted.rendererSensitiveEnvironmentAbsent === true,
      attachmentSelected: submitted.attachmentSelected === true,
      roundOneRequestCount: requestCounts.roundOne,
      roundTwoRequestCount: requestCounts.roundTwo,
      roundTwoEventSubscriptionCount: requestCounts.roundTwoEventSubscriptions,
      roundThreeRequestCount: requestCounts.roundThree,
      gatewayRequestCount: requestCounts.total,
      roundTwoInvocationReused: true,
      readToolExecutionCount: completed.readToolCount,
      writeToolExecutionCount: completed.writeToolCount,
      pptxArtifactCount: completed.pptxArtifactCount,
      businessStageCount: completed.businessStageCount,
      readBusinessStageVisible: completed.readBusinessStageVisible === true,
      writeBusinessStageVisible: completed.writeBusinessStageVisible === true,
      pptxPreviewReady: completed.pptxPreviewReady === true,
      pptxArtifactFilePresent: true,
      pptxArtifactSize: file.size,
      firstRuntimeInstanceId,
      secondRuntimeInstanceId,
      firstCorePid,
      sigkillObserved: true,
      sandbox: preferences.sandbox === true,
      contextIsolation: preferences.contextIsolation === true,
      nodeIntegrationDisabled: preferences.nodeIntegration === false,
      followUpComposerInitiallyEmpty:
        followUpWorkbench.composerInitiallyEmpty === true,
      followUpSameSession: revisedTask.sessionId === submitted.sessionId,
      originalTaskId: submitted.taskId,
      revisedTaskId: revisedTask.taskId,
      distinctTaskCount: revisedTask.taskId === submitted.taskId ? 1 : 2,
      originalArtifactFileName: artifactFileName,
      revisedArtifactFileName,
      originalArtifactPreserved: file.size > 0,
      revisedArtifactFilePresent: true,
      revisedArtifactSize: revisedFile.size,
      followUpContextUserGoalPresent: true,
      followUpContextAssistantSummaryPresent: true,
      followUpContextArtifactPathPresent: true,
      revisedWriteToolExecutionCount: revisedCompleted.writeToolCount,
      revisedPptxArtifactCount: revisedCompleted.pptxArtifactCount,
      originalPreviewReadyAfterRestart: restoredOriginal.pptxPreviewReady === true,
      revisedPreviewReadyAfterRestart: restoredRevision.pptxPreviewReady === true,
      preClosureCorePid,
      closureRuntimeInstanceId,
      postRevisionSigkillObserved: true,
      gatewayRequestCountAfterFollowUp: finalRequestCounts.total,
    });
  } finally {
    eventSubscription?.abort();
    window?.destroy();
    routers?.v1alpha5.clear();
    routers?.taskReasoning.clear();
    for (const channel of handlers.splice(0)) ipcMain.removeHandler(channel);
    await supervisor?.stop().catch(() => undefined);
    await gateway.close().catch(() => undefined);
    delete process.env[deploymentEnvironmentName];
    delete process.env[tokenEnvironmentName];
    await rm(directory, { recursive: true, force: true });
  }
}

function registerRouters(supervisor, handlers, workspacePath) {
  const safeFailures = [];
  const base = new DesktopIpcRouter({
    core: {
      get client() { return supervisor.client; },
      snapshot: () => supervisor.snapshot(),
    },
    chooseWorkspaceDirectory: async () => workspacePath,
    chooseWorkspaceArtifactFile: async () => join(workspacePath, sourceFileName),
  });
  for (const channel of Object.values(DESKTOP_IPC_CHANNELS)) {
    if (channel === DESKTOP_IPC_CHANNELS.desktopEvent) continue;
    ipcMain.handle(channel, async (_event, input) => {
      const result = await base.dispatch(channel, input);
      if (result?.ok === false && typeof result.error?.code === "string") {
        safeFailures.push({ channel, code: result.error.code });
      }
      return result;
    });
    handlers.push(channel);
  }
  const v1alpha4 = new DesktopV1Alpha4IpcRouter({
    resolveConnection: () => supervisor.connectionLease(),
    isCurrentConnection: (lease) => supervisor.isCurrentConnectionLease(lease),
  });
  for (const channel of Object.values(DESKTOP_V1ALPHA4_IPC_CHANNELS)) {
    ipcMain.handle(channel, (event, input) =>
      v1alpha4.dispatch(channel, input, event));
    handlers.push(channel);
  }
  const v1alpha5 = new DesktopV1Alpha5IpcRouter({
    resolveConnection: () => supervisor.connectionLease(),
    isCurrentConnection: (lease) => supervisor.isCurrentConnectionLease(lease),
  });
  for (const channel of Object.values(DESKTOP_V1ALPHA5_IPC_CHANNELS)) {
    ipcMain.handle(channel, (event, input) =>
      v1alpha5.dispatch(channel, input, event));
    handlers.push(channel);
  }
  const taskReasoning = new DesktopTaskReasoningV1Alpha1IpcRouter({
    resolveConnection: () => supervisor.connectionLease(),
    isCurrentConnection: (lease) => supervisor.isCurrentConnectionLease(lease),
  });
  for (const channel of Object.values(
    DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS,
  )) {
    ipcMain.handle(channel, (event, input) =>
      taskReasoning.dispatch(channel, input, event));
    handlers.push(channel);
  }
  return { v1alpha4, v1alpha5, taskReasoning, safeFailures };
}

async function loadTaskRoute(window, taskId, sessionId) {
  await window.loadFile(join(root, "apps/desktop/dist/renderer/index.html"), {
    hash: `/tasks?sessionId=${encodeURIComponent(sessionId)}&taskId=${encodeURIComponent(taskId)}`,
  });
}

async function waitForTaskDisplayStatus(client, taskId, expectedStatus) {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const detail = await client.loadTaskDetail({
      contractVersion: "v1alpha1",
      type: "task_detail",
      queryId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId: randomUUID(),
      taskId,
    });
    if (detail.ok && detail.value.summary.displayStatus === expectedStatus) return;
    await delay(100);
  }
  throw new Error(`vs2_task_status_${expectedStatus}_timeout`);
}

async function loadLatestSubmittedTask(client) {
  const meta = () => ({
    contractVersion: "v1alpha1",
    queryId: randomUUID(),
    correlationId: randomUUID(),
    clientInstanceId: randomUUID(),
  });
  const tasks = await client.listTasks({
    ...meta(),
    type: "list_tasks",
    limit: 8,
  });
  const sessions = await client.listSessions({
    ...meta(),
    type: "list_sessions",
  });
  if (!tasks.ok || tasks.value.length === 0 || !sessions.ok) {
    throw new Error("vs2_submitted_task_missing");
  }
  const task = tasks.value[0];
  const session = sessions.value.find((item) => item.sessionId === task.sessionId);
  if (session === undefined) throw new Error("vs2_submitted_session_missing");
  return {
    taskId: task.taskId,
    sessionId: session.sessionId,
  };
}

async function loadLatestSubmittedTaskExcluding(client, excludedTaskId) {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const tasks = await client.listTasks({
      contractVersion: "v1alpha1",
      type: "list_tasks",
      queryId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId: randomUUID(),
      limit: 8,
    });
    if (tasks.ok) {
      const task = tasks.value.find((item) => item.taskId !== excludedTaskId);
      if (task !== undefined) {
        return { taskId: task.taskId, sessionId: task.sessionId };
      }
    }
    await delay(50);
  }
  throw new Error("vs3_revised_task_missing");
}

function workbenchDriverScript(modelId) {
  return `(async () => {
    const waitFor = async (predicate, code, timeoutMs = 30000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(code);
    };
    const button = (text) => [...document.querySelectorAll("button")]
      .find((item) => item.textContent?.trim() === text);
    const selectByLabel = (label, value) => {
      const field = [...document.querySelectorAll("label.r3-field")]
        .find((item) => item.querySelector(".r3-field__label")?.textContent?.trim() === label);
      const select = field?.querySelector("select");
      if (!(select instanceof HTMLSelectElement)) throw new Error("vs2_select_missing");
      if (![...select.options].some((option) => option.value === value && !option.disabled)) {
        throw new Error("vs2_select_option_missing");
      }
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };
    await waitFor(() => document.body.innerText.includes("今天想完成什么？"),
      "vs2_workbench_dom_timeout");
    await waitFor(() => button("选择空间") && !button("选择空间").disabled,
      "vs2_workspace_picker_unavailable");
    button("选择空间").click();
    await waitFor(() => {
      const select = [...document.querySelectorAll("label.r3-field")]
        .find((item) => item.textContent.includes("工作区"))?.querySelector("select");
      return select instanceof HTMLSelectElement && select.options.length > 0;
    }, "vs2_workspace_grant_timeout");
    selectByLabel("专项机器人（可选）", "agent.presentation");
    await waitFor(() => document.body.innerText.includes("演示文稿助手")
      && document.querySelector("[aria-label='技能选择'] input"),
    "vs2_presentation_agent_unavailable");
    selectByLabel("模型", ${JSON.stringify(modelId)});
    const skill = await waitFor(() => document.querySelector(
      "[aria-label='技能选择'] input"), "vs2_presentation_skill_unavailable");
    if (!(skill instanceof HTMLInputElement)) throw new Error("vs2_skill_input_invalid");
    if (!skill.checked) skill.click();
    const addAttachment = await waitFor(() => {
      const candidate = document.querySelector("[aria-label='附件资料'] button");
      return candidate && !candidate.disabled ? candidate : undefined;
    }, "vs2_attachment_picker_unavailable");
    addAttachment.click();
    await waitFor(() => document.querySelector("[aria-label='附件资料']")
      ?.textContent?.includes(${JSON.stringify(sourceFileName)}),
    "vs2_attachment_missing");
    const attachmentSelected = document.querySelector("[aria-label='附件资料']")
      ?.textContent?.includes(${JSON.stringify(sourceFileName)}) === true;
    const textarea = document.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("vs2_composer_missing");
    textarea.value = "请根据已添加的资料生成一份项目汇报 PPT。";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const submit = await waitFor(() => {
      const candidate = document.querySelector("button[title='提交任务']");
      return candidate && !candidate.disabled ? candidate : undefined;
    }, "vs2_submit_unavailable");
    submit.click();
    return {
      realRendererWorkbench: document.querySelector("#app") !== null,
      attachmentSelected,
      rendererSensitiveEnvironmentAbsent:
        !("ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT" in window)
        && !("ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN" in window)
        && typeof window.process === "undefined",
    };
  })()`;
}

function followUpWorkbenchDriverScript(modelId) {
  return `(async () => {
    const waitFor = async (predicate, code, timeoutMs = 30000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(code);
    };
    const button = (text) => [...document.querySelectorAll("button")]
      .find((item) => item.textContent?.trim() === text);
    const followUp = await waitFor(() => button("继续修改"),
      "vs3_follow_up_action_missing");
    followUp.click();
    try {
      await waitFor(() => document.body.innerText.includes("继续修改上一成果")
        && document.body.innerText.includes(${JSON.stringify(artifactFileName)}),
      "vs3_follow_up_context_missing");
    } catch {
      const text = document.body.innerText;
      throw new Error([
        "vs3_follow_up_context_missing",
        location.hash.includes("workbench") ? "route_1" : "route_0",
        text.includes("今天想完成什么") ? "workbench_1" : "workbench_0",
        text.includes("任务") ? "task_text_1" : "task_text_0",
        document.querySelector("#app")?.childElementCount > 0 ? "app_1" : "app_0",
        text.includes("继续修改上一成果") ? "title_1" : "title_0",
        text.includes(${JSON.stringify(artifactFileName)}) ? "artifact_1" : "artifact_0",
      ].join("_"));
    }
    const textarea = document.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("vs3_composer_missing");
    const composerInitiallyEmpty = textarea.value === "";
    if (!composerInitiallyEmpty) throw new Error("vs3_composer_was_prefilled");
    const fields = [...document.querySelectorAll("label.r3-field")];
    const select = (label) => fields.find((item) =>
      item.querySelector(".r3-field__label")?.textContent?.trim() === label)
      ?.querySelector("select");
    const workspace = select("工作区");
    if (!(workspace instanceof HTMLSelectElement)) throw new Error("vs3_workspace_missing");
    const workspaceOption = [...workspace.options].find((option) => option.value !== "");
    if (workspaceOption === undefined) throw new Error("vs3_workspace_option_missing");
    workspace.value = workspaceOption.value;
    workspace.dispatchEvent(new Event("change", { bubbles: true }));
    const agent = select("专项机器人（可选）");
    const model = select("模型");
    if (!(agent instanceof HTMLSelectElement) || agent.value !== "agent.presentation") {
      throw new Error("vs3_candidate_agent_not_selected");
    }
    if (!(model instanceof HTMLSelectElement) || model.value !== ${JSON.stringify(modelId)}) {
      throw new Error("vs3_candidate_model_not_selected");
    }
    const skill = document.querySelector("[aria-label='技能选择'] input");
    if (!(skill instanceof HTMLInputElement)) throw new Error("vs3_skill_missing");
    if (!skill.checked) skill.click();
    textarea.value = ${JSON.stringify(followUpUserInput)};
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const submit = await waitFor(() => {
      const candidate = document.querySelector("button[title='提交任务']");
      return candidate && !candidate.disabled ? candidate : undefined;
    }, "vs3_submit_unavailable");
    submit.click();
    return {
      composerInitiallyEmpty,
      workspaceExplicitlySelected: workspace.value !== "",
      skillExplicitlySelected: skill.checked,
    };
  })()`;
}

function confirmationDriverScript(taskId) {
  return `(async () => {
    const waitFor = async (predicate, timeoutMs = 30000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = predicate();
        if (value) return value;
        const sync = [...document.querySelectorAll("button")]
          .find((item) => item.textContent?.trim() === "同步" && !item.disabled);
        sync?.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return undefined;
    };
    const allow = await waitFor(() => document.querySelector(
      "[data-confirmation-action='confirmed']"));
    if (!allow) {
      const detail = await window.robothreeDesktop.loadTaskDetail({
        contractVersion: "v1alpha1", type: "task_detail",
        queryId: crypto.randomUUID(), correlationId: crypto.randomUUID(),
        clientInstanceId: crypto.randomUUID(), taskId: ${JSON.stringify(taskId)},
      });
      return {
        applied: false,
        notRequired: detail.ok
          && detail.value.summary.displayStatus === "completed"
          && detail.value.userConfirmations.length === 0,
      };
    }
    allow.click();
    const confirm = await waitFor(() => document.querySelector("[data-dialog-confirm]"));
    if (!confirm) return { applied: false };
    confirm.click();
    const applied = await waitFor(() => document.body.innerText.includes("操作已允许"));
    return { applied: applied === true };
  })()`;
}

function completedTaskDomScript() {
  return `(async () => {
    const waitFor = async (predicate, code, timeoutMs = 40000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = predicate();
        if (value) return value;
        const sync = [...document.querySelectorAll("button")]
          .find((item) => item.textContent?.trim() === "同步" && !item.disabled);
        sync?.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(code);
    };
    await waitFor(() => {
      const text = document.body.innerText;
      return text.includes("已根据工作空间资料生成 PPTX")
        && text.includes(${JSON.stringify(artifactFileName)})
        && text.includes("读取资料")
        && text.includes("生成成果");
    }, "vs2_completed_task_dom_timeout");
    const open = [...document.querySelectorAll("[data-artifact-action='open-tab']")]
      .find((item) => item.textContent?.includes(${JSON.stringify(artifactFileName)}));
    open?.click();
    const preview = await waitFor(() => document.querySelector(
      "[data-artifact-action='preview-html']"), "vs2_preview_action_missing");
    preview.click();
    await waitFor(() => document.querySelector("iframe[title='HTML 成果预览']"),
      "vs2_pptx_preview_not_ready");
    const detail = await window.robothreeDesktop.loadTaskDetail({
      contractVersion: "v1alpha1", type: "task_detail",
      queryId: crypto.randomUUID(), correlationId: crypto.randomUUID(),
      clientInstanceId: crypto.randomUUID(),
      taskId: new URLSearchParams(location.hash.split("?")[1] ?? "").get("taskId"),
    });
    if (!detail.ok) throw new Error("vs2_task_detail_unavailable");
    const readToolCount = detail.value.toolActivities.filter((activity) =>
      ["tool.document.docx.read", "tool.document.xlsx.read", "tool.document.pdf.extract_text"]
        .includes(activity.operationType)).length;
    const writeToolCount = detail.value.toolActivities.filter((activity) =>
      activity.operationType === "tool.document.pptx.write").length;
    const pptxArtifactCount = detail.value.artifacts.filter((artifact) =>
      artifact.mediaType === "application/vnd.openxmlformats-officedocument.presentationml.presentation")
      .length;
    const text = document.body.innerText;
    return {
      realRendererTaskDetail: document.querySelector("#app") !== null,
      readToolCount,
      writeToolCount,
      pptxArtifactCount,
      businessStageCount: text.includes("读取资料") && text.includes("生成成果") ? 2 : 0,
      readBusinessStageVisible: text.includes("读取资料"),
      writeBusinessStageVisible: text.includes("生成成果"),
      pptxPreviewReady: document.querySelector("iframe[title='HTML 成果预览']") !== null,
    };
  })()`;
}

function revisedTaskDomScript(taskId) {
  return `(async () => {
    const waitFor = async (predicate, code, timeoutMs = 40000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = predicate();
        if (value) return value;
        const sync = [...document.querySelectorAll("button")]
          .find((item) => item.textContent?.trim() === "同步" && !item.disabled);
        sync?.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(code);
    };
    await waitFor(() => document.body.innerText.includes("已生成修订版 PPTX")
      && document.body.innerText.includes(${JSON.stringify(revisedArtifactFileName)}),
    "vs3_revised_task_dom_timeout");
    const open = [...document.querySelectorAll("[data-artifact-action='open-tab']")]
      .find((item) => item.textContent?.includes(${JSON.stringify(revisedArtifactFileName)}));
    open?.click();
    const preview = await waitFor(() => document.querySelector(
      "[data-artifact-action='preview-html']"), "vs3_preview_action_missing");
    preview.click();
    await waitFor(() => document.querySelector("iframe[title='HTML 成果预览']"),
      "vs3_pptx_preview_not_ready");
    const detail = await window.robothreeDesktop.loadTaskDetail({
      contractVersion: "v1alpha1", type: "task_detail",
      queryId: crypto.randomUUID(), correlationId: crypto.randomUUID(),
      clientInstanceId: crypto.randomUUID(), taskId: ${JSON.stringify(taskId)},
    });
    if (!detail.ok) throw new Error("vs3_task_detail_unavailable");
    return {
      writeToolCount: detail.value.toolActivities.filter((activity) =>
        activity.operationType === "tool.document.pptx.write").length,
      pptxArtifactCount: detail.value.artifacts.filter((artifact) =>
        artifact.mediaType
          === "application/vnd.openxmlformats-officedocument.presentationml.presentation")
        .length,
      pptxPreviewReady: document.querySelector("iframe[title='HTML 成果预览']") !== null,
    };
  })()`;
}

function findCoreChildPid() {
  const rows = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], {
    encoding: "utf8",
  }).split("\n");
  const matches = rows.map((row) => row.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/u))
    .filter((match) => match !== null
      && Number(match[2]) === process.pid
      && match[3].includes("desktop-private-main.js"));
  if (matches.length !== 1) throw new Error("vs2_core_child_identity_invalid");
  return Number(matches[0][1]);
}

async function observeExitedProcess(pid) {
  await waitFor(() => {
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      return error?.code === "ESRCH";
    }
  }, "vs2_sigkill_not_observed");
}

async function waitForSupervisorRecovery(supervisor, previousRuntimeInstanceId) {
  await waitFor(() => supervisor.snapshot().runtimeState === "ready"
    && supervisor.runtimeInstanceId !== previousRuntimeInstanceId,
  "vs2_core_recovery_timeout");
}

async function waitFor(predicate, code, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error(code);
}

async function startGatewayFixture() {
  const requests = [];
  const logicalRoundByClientRequestId = new Map();
  const attemptsByLogicalRound = new Map();
  const eventSubscriptionsByLogicalRound = new Map();
  const invocations = new Map();
  const roundTwoEventAttempts = new Set();
  let releasedRoundTwo = false;
  const server = createServer(async (request, response) => {
    if (!isAuthorized(request.headers.authorization)) {
      json(response, 401, { code: "unauthorized" });
      return;
    }
    if (request.method === "POST") {
      const body = JSON.parse(await readBody(request));
      let logicalRound = logicalRoundByClientRequestId.get(body.clientRequestId);
      if (logicalRound === undefined) {
        logicalRound = logicalRoundByClientRequestId.size + 1;
        logicalRoundByClientRequestId.set(body.clientRequestId, logicalRound);
      }
      const transportAttempt = (attemptsByLogicalRound.get(logicalRound) ?? 0) + 1;
      attemptsByLogicalRound.set(logicalRound, transportAttempt);
      const invocationId = randomUUID();
      const accepted = Object.freeze({
        invocationId,
        clientRequestId: body.clientRequestId,
        requestDigest: body.requestDigest,
        ...body.modelRequest.model,
      });
      requests.push({ body, logicalRound, transportAttempt, invocationId });
      invocations.set(invocationId, { accepted, logicalRound, transportAttempt });
      json(response, 202, {
        contractVersion: "v1alpha3",
        invocationId,
        clientRequestId: accepted.clientRequestId,
        requestDigest: accepted.requestDigest,
        status: "accepted",
        statusRevision: 0,
        createdAt: new Date().toISOString(),
        lastDurableEventSequence: 1,
        durableCursor: `cursor:1:${"a".repeat(16)}`,
      });
      return;
    }
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathParts = requestUrl.pathname.split("/").filter(Boolean);
    const invocationId = requestUrl.pathname.endsWith("/events")
      ? pathParts.at(-2)
      : pathParts.at(-1);
    const invocation = invocations.get(invocationId);
    if (invocation === undefined) {
      json(response, 409, { code: "invocation_missing" });
      return;
    }
    if (requestUrl.pathname.endsWith("/events")) {
      const eventSubscriptionAttempt =
        (eventSubscriptionsByLogicalRound.get(invocation.logicalRound) ?? 0) + 1;
      eventSubscriptionsByLogicalRound.set(
        invocation.logicalRound,
        eventSubscriptionAttempt,
      );
      if (invocation.logicalRound === 2) {
        roundTwoEventAttempts.add(eventSubscriptionAttempt);
      }
      if (invocation.logicalRound === 2 && eventSubscriptionAttempt === 1) {
        await new Promise((resolvePromise) => {
          request.once("close", resolvePromise);
          response.once("close", resolvePromise);
        });
        return;
      }
      if (invocation.logicalRound === 2 && eventSubscriptionAttempt === 2) {
        await waitFor(() => releasedRoundTwo, "vs2_round_two_release_timeout");
      }
      if (response.destroyed) return;
      response.writeHead(200, { "content-type": "text/event-stream" });
      for (const event of gatewayEvents(
        invocation.accepted.invocationId,
        invocation.logicalRound,
      )) {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      response.end();
      return;
    }
    json(response, 200, {
      contractVersion: "v1alpha3",
      ...invocation.accepted,
      status: "running",
      statusRevision: 1,
      createdAt: new Date().toISOString(),
      lastDurableEventSequence: 1,
      durableCursor: `cursor:1:${"a".repeat(16)}`,
    });
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("vs2_gateway_listen_failed");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    modelId: "model.internal-trial",
    requests,
    waitForRoundTwoEventAttempt: async (attempt) => waitFor(() =>
      roundTwoEventAttempts.has(attempt),
    `vs2_round_two_event_attempt_${attempt}_missing`, 40_000),
    releaseRoundTwo: () => { releasedRoundTwo = true; },
    requestCounts: () => ({
      roundOne: requests.filter((item) => item.logicalRound === 1).length,
      roundTwo: requests.filter((item) => item.logicalRound === 2).length,
      roundThree: requests.filter((item) => item.logicalRound === 3).length,
      roundFour: requests.filter((item) => item.logicalRound === 4).length,
      roundFive: requests.filter((item) => item.logicalRound === 5).length,
      total: requests.length,
      roundTwoEventSubscriptions: eventSubscriptionsByLogicalRound.get(2) ?? 0,
    }),
    close: () => new Promise((resolvePromise) => {
      server.closeAllConnections();
      server.close(() => resolvePromise());
    }),
  };
}

function gatewayEvents(invocationId, round) {
  const occurredAt = new Date().toISOString();
  const response = round === 1
    ? documentReadToolCallEvent(invocationId, occurredAt)
    : round === 2
      ? pptxToolCallEvent(invocationId, occurredAt)
      : round === 4
        ? pptxToolCallEvent(invocationId, occurredAt, revisedArtifactFileName)
        : textDeltaEvent(invocationId, occurredAt, round === 5
          ? "已生成修订版 PPTX"
          : "已根据工作空间资料生成 PPTX");
  return [{
    contractVersion: "v1alpha3",
    invocationId,
    eventId: randomUUID(),
    eventClass: "ephemeral",
    streamSequence: 1,
    eventType: "started",
    eventPayload: {},
    eventDigest: "1".repeat(64),
    occurredAt,
  }, response, {
    contractVersion: "v1alpha3",
    invocationId,
    eventId: randomUUID(),
    eventClass: "durable",
    durableSequence: 2,
    eventType: "completed",
    eventPayload: { status: "completed", statusRevision: 2 },
    eventDigest: "3".repeat(64),
    durableCursor: `cursor:2:${"b".repeat(16)}`,
    occurredAt,
  }];
}

function documentReadToolCallEvent(invocationId, occurredAt) {
  const args = { relativePath: sourceFileName, options: {} };
  return toolCallEvent(
    invocationId,
    "tool.document.docx.read",
    args,
    occurredAt,
  );
}

function pptxToolCallEvent(
  invocationId,
  occurredAt,
  relativePath = artifactFileName,
) {
  const args = {
    relativePath,
    presentation: {
      title: "项目资料汇报",
      layout: "wide",
      templateRef: "robothree.default",
      slides: [{
        title: "资料概览",
        elements: [{
          type: "text",
          text: "基于已授权工作空间资料生成",
          x: 0.8,
          y: 1.2,
          w: 8.8,
          h: 0.8,
          style: { fontSize: 24, bold: true, color: "111827" },
        }],
      }],
    },
  };
  return toolCallEvent(
    invocationId,
    "tool.document.pptx.write",
    args,
    occurredAt,
  );
}

function toolCallEvent(invocationId, capabilityId, args, occurredAt) {
  return {
    contractVersion: "v1alpha3",
    invocationId,
    eventId: randomUUID(),
    eventClass: "ephemeral",
    streamSequence: 2,
    eventType: "tool_call",
    eventPayload: { call: {
      toolCallId: randomUUID(),
      name: projectEnterpriseProviderToolName(capabilityId),
      arguments: args,
      argumentsDigest: sha256CanonicalJson(JsonValueSchema.parse(args))
        .replace(/^sha256:/u, ""),
    } },
    eventDigest: "2".repeat(64),
    occurredAt,
  };
}

function textDeltaEvent(
  invocationId,
  occurredAt,
  delta = "已根据工作空间资料生成 PPTX",
) {
  return {
    contractVersion: "v1alpha3",
    invocationId,
    eventId: randomUUID(),
    eventClass: "ephemeral",
    streamSequence: 2,
    eventType: "text_delta",
    eventPayload: { delta },
    eventDigest: "2".repeat(64),
    occurredAt,
  };
}

function deployment(origin, modelId) {
  const capability = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: modelId,
    kind: "model",
    name: "Internal Trial Model",
    description: "MVP VS2 controlled enterprise Model",
    source,
    model: {
      family: "openai-compatible",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 128_000,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.internal-trial",
    adapterKind: "model_provider",
    source,
    implementationRef: "enterprise:model-gateway",
    runtimeBoundary: "remote",
    protocol: { name: "robothree-enterprise-model", version: "v1alpha1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.internal-trial",
    capability: {
      capabilityId: capability.capabilityId,
      capabilityRevision: capability.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "model_provider",
    source,
  });
  return {
    schemaVersion: "mvp-vs1.internal-trial.v1",
    centralBaseUrl: origin,
    configurationRevision: `sha256:${"c".repeat(64)}`,
    modelId: capability.capabilityId,
    modelCreatedAt: "2026-08-29T00:00:00.000Z",
    supportsToolCalling: true,
    registrySnapshot: new RegistryBuilder({ trustedSources: [source] })
      .registerCapability(capability)
      .registerAdapterDescriptor(descriptor)
      .registerBinding(binding)
      .finalize(),
  };
}

function compactToken(input) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return [encode({ alg: "ES256", typ: "JWT" }), encode({
    contractVersion: "v1alpha1",
    issuer: "central.internal-trial",
    audience: "enterprise-model-gateway",
    enterpriseId: "enterprise.internal-trial",
    userId: "user.internal-trial",
    deviceId: "device.internal-trial",
    clientInstanceId: "019f7447-a784-77b2-a716-000000002103",
    tokenId: randomUUID(),
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    permissions: ["model.use"],
  }), "controlled-fixture-signature"].join(".");
}

async function writeDocxFixture(targetPath) {
  const packageDirectory = await mkdtemp(join(tmpdir(), "robothree-vs2-docx-"));
  try {
    await mkdir(join(packageDirectory, "_rels"), { recursive: true });
    await mkdir(join(packageDirectory, "word", "_rels"), { recursive: true });
    await writeFile(join(packageDirectory, "[Content_Types].xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`);
    await writeFile(join(packageDirectory, "_rels", ".rels"), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
    await writeFile(join(packageDirectory, "word", "_rels", "document.xml.rels"), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
    await writeFile(join(packageDirectory, "word", "document.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>项目资料</w:t></w:r></w:p>
    <w:p><w:r><w:t>${expectedSourceText}</w:t></w:r></w:p>
  </w:body>
</w:document>`);
    await writeFile(join(packageDirectory, "word", "styles.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`);
    await writeFile(join(packageDirectory, "word", "numbering.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`);
    // List files explicitly: the Document Worker intentionally rejects ZIP
    // directory entries (names ending in "/") as unsafe package members.
    execFileSync("/usr/bin/zip", [
      "-q",
      targetPath,
      "[Content_Types].xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
      "word/document.xml",
      "word/styles.xml",
      "word/numbering.xml",
    ], {
      cwd: packageDirectory,
    });
  } finally {
    await rm(packageDirectory, { recursive: true, force: true });
  }
}

function isAuthorized(value) {
  return typeof value === "string" && value.startsWith("Bearer ");
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  }).end(body);
}

function safeCode(error) {
  const message = error instanceof Error ? error.message : "vs2_electron_failure";
  return /^[a-z0-9_.-]+$/u.test(message) ? message : "vs2_electron_failure";
}
