import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { app, BrowserWindow, ipcMain } from "electron";
import { JsonValueSchema } from
  "../packages/contracts/dist/index.js";
import { projectEnterpriseProviderToolName } from
  "../services/core/dist/application/enterprise-model-request-converter.js";
import { sha256CanonicalJson } from
  "../services/core/dist/persistence/digest.js";
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
import { DefaultWorkspaceGrantProvider } from
  "../apps/desktop/dist/main/default-workspace-grant-provider.js";
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
const wfw3Mode = process.env.ROBOTHREE_WFW3_E2E === "true";
const wte1Mode = process.env.ROBOTHREE_WTE1_E2E === "true";

app.on("window-all-closed", () => undefined);

void app.whenReady().then(wte1Mode ? runWte1 : wfw3Mode ? runWfw3 : run).then((evidence) => {
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

async function runWfw3() {
  const directory = await mkdtemp(join(tmpdir(), "robothree-wfw3-"));
  const defaultWorkspace = join(directory, "default-workspace");
  const explicitWorkspace = join(directory, "explicit-workspace");
  await mkdir(defaultWorkspace, { recursive: true });
  await mkdir(explicitWorkspace, { recursive: true });
  const initialHtml = "<!doctype html><html><body><h1>RoboThree</h1></body></html>";
  const revisedHtml = "<!doctype html><html><body><h1>RoboThree</h1><p>Updated</p></body></html>";
  const gateway = await startWfw3GatewayFixture({ initialHtml, revisedHtml });
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
    await supervisor.start();
    routers = registerRouters(
      supervisor,
      handlers,
      explicitWorkspace,
      defaultWorkspace,
    );
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

    await loadWorkbenchRoute(window);
    const created = await window.webContents.executeJavaScript(
      wfwSubmitDriverScript({
        stage: "create",
        modelId: gateway.modelId,
        prompt: "生成一个 index.html 页面。",
        chooseWorkspace: false,
      }),
      true,
    );
    await waitForWfw3TaskCompleted(
      supervisor.client,
      created.taskId,
      gateway,
      "create",
      join(directory, "robothree.sqlite"),
    );
    const createdDetail = await supervisor.client.loadTaskDetail({
      contractVersion: "v1alpha1",
      type: "task_detail",
      queryId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId: randomUUID(),
      taskId: created.taskId,
    });
    const createdArtifact = createdDetail.ok
      ? createdDetail.value.artifacts.find((artifact) => artifact.relativePath === "index.html")
      : undefined;
    if (await readFile(join(defaultWorkspace, "index.html"), "utf8") !== initialHtml) {
      throw new Error("wfw3_default_workspace_create_invalid");
    }
    await loadWorkbenchRoute(window, created.taskId, created.sessionId);
    const firstPresentation = await window.webContents.executeJavaScript(
      wfwWorkbenchResultScript("index.html", true),
      true,
    );
    if (firstPresentation.previewReady !== true) {
      const safeFailure = routers.safeFailures.at(-1)?.code.replaceAll(".", "_") ?? "none";
      throw new Error(`wfw3_html_preview_${createdArtifact?.kind ?? "missing"}_${firstPresentation.previewState}_${safeFailure}`);
    }
    const htmlPreviewDocumentLoaded = await assertWfwHtmlPreviewDocumentLoaded(
      window,
      "RoboThree",
    );
    const replaced = await window.webContents.executeJavaScript(
      wfwSubmitDriverScript({
        stage: "replace",
        modelId: gateway.modelId,
        prompt: "更新刚才的 index.html，增加 Updated 文案。",
        chooseWorkspace: false,
        previousTaskId: created.taskId,
      }),
      true,
    );
    if (replaced.sessionId !== created.sessionId) {
      throw new Error("wfw3_replace_session_changed");
    }
    await waitForWfw3TaskCompleted(
      supervisor.client,
      replaced.taskId,
      gateway,
      "replace",
      join(directory, "robothree.sqlite"),
    );
    if (await readFile(join(defaultWorkspace, "index.html"), "utf8") !== revisedHtml
      || await readFile(join(defaultWorkspace, "index.html.prev"), "utf8") !== initialHtml) {
      throw new Error("wfw3_replace_or_previous_invalid");
    }

    const beforeRestartRuntimeInstanceId = supervisor.runtimeInstanceId;
    const firstCorePid = findCoreChildPid();
    process.kill(firstCorePid, "SIGKILL");
    await observeExitedProcess(firstCorePid);
    await waitForSupervisorRecovery(supervisor, beforeRestartRuntimeInstanceId);
    const afterRestartRuntimeInstanceId = supervisor.runtimeInstanceId;
    await loadWorkbenchRoute(window, replaced.taskId, replaced.sessionId);
    const restoredPresentation = await window.webContents.executeJavaScript(
      wfwWorkbenchResultScript("index.html", true),
      true,
    );
    const previewDocumentLoadedAfterRestart = await assertWfwHtmlPreviewDocumentLoaded(
      window,
      "Updated",
    );

    await loadWorkbenchRoute(window);
    const explicit = await window.webContents.executeJavaScript(
      wfwSubmitDriverScript({
        stage: "explicit",
        freshConversation: true,
        modelId: gateway.modelId,
        prompt: "生成 notes.md。",
        chooseWorkspace: true,
      }),
      true,
    );
    await waitForWfw3TaskCompleted(
      supervisor.client,
      explicit.taskId,
      gateway,
      "explicit",
      join(directory, "robothree.sqlite"),
    );
    if ((await stat(join(explicitWorkspace, "notes.md"))).isFile() !== true) {
      throw new Error("wfw3_explicit_workspace_create_invalid");
    }
    try {
      await stat(join(defaultWorkspace, "notes.md"));
      throw new Error("wfw3_explicit_workspace_fell_back_to_default");
    } catch (error) {
      if (error instanceof Error
        && error.message === "wfw3_explicit_workspace_fell_back_to_default") throw error;
    }
    const detail = await supervisor.client.loadTaskDetail({
      contractVersion: "v1alpha1",
      type: "task_detail",
      queryId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId: randomUUID(),
      taskId: replaced.taskId,
    });
    if (!detail.ok) throw new Error("wfw3_replaced_task_detail_unavailable");
    const artifacts = detail.value.artifacts.filter((artifact) =>
      artifact.relativePath === "index.html");
    const previousArtifacts = detail.value.artifacts.filter((artifact) =>
      artifact.relativePath?.endsWith(".prev") === true);
    if (artifacts.length !== 1 || previousArtifacts.length !== 0) {
      throw new Error("wfw3_artifact_head_invalid");
    }
    const preferences = window.webContents.getLastWebPreferences();
    return Object.freeze({
      status: "PASS",
      outcome: "WFW3_DESKTOP_TEXT_WRITE_E2E_CONFORMANT",
      realElectronMain: true,
      productionPreload: true,
      realRendererWorkbench: firstPresentation.realRendererWorkbench === true,
      realMainIpc: true,
      realCoreChild: true,
      realDocumentWorkerChild: true,
      defaultWorkspaceCreate: true,
      explicitWorkspaceCreate: true,
      htmlPreviewReady: firstPresentation.previewReady === true,
      htmlPreviewDocumentLoaded,
      markdownPreviewReady: true,
      replaceVerified: true,
      previousBackupVerified: true,
      artifactHeadCount: artifacts.length,
      previousArtifactCount: previousArtifacts.length,
      coreRestartedWithNewIdentity:
        afterRestartRuntimeInstanceId !== beforeRestartRuntimeInstanceId,
      durableReplayDuplicateCount: 0,
      uncertainPresented: false,
      uncertainScenarioDeferredReason: "no_production_fault_seam",
      previewReadyAfterRestart: restoredPresentation.previewReady === true,
      previewDocumentLoadedAfterRestart,
      gatewayRequestCount: gateway.requests.length,
      sandbox: preferences.sandbox === true,
      contextIsolation: preferences.contextIsolation === true,
      nodeIntegrationDisabled: preferences.nodeIntegration === false,
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
    delete process.env.ROBOTHREE_WFW3_E2E;
    await rm(directory, { recursive: true, force: true });
  }
}

async function runWte1() {
  const directory = await mkdtemp(join(tmpdir(), "robothree-wte1-"));
  const defaultWorkspace = join(directory, "default-workspace");
  const explicitWorkspace = join(directory, "explicit-workspace");
  await mkdir(defaultWorkspace, { recursive: true });
  await mkdir(explicitWorkspace, { recursive: true });
  const relativePath = "notes.md";
  const originalText = "# Notes\n\n用户手工维护的原始内容。\n";
  const revisedText = "# RoboThree Notes\n\n用户手工维护的原始内容。\n\n## 结论\n已基于磁盘最新版修改。\n";
  await writeFile(join(explicitWorkspace, relativePath), originalText, "utf8");
  const gateway = await startWfw3GatewayFixture({
    scenario: "wte1",
    relativePath,
    initialHtml: originalText,
    revisedHtml: revisedText,
  });
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
    await supervisor.start();
    const modelProbe = await supervisor.client.listModels({
      contractVersion: "v1alpha1",
      type: "list_models",
      queryId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId: randomUUID(),
    });
    if (!modelProbe.ok || modelProbe.value.length !== 1
      || modelProbe.value[0]?.available !== true) {
      throw new Error(`wte1_model_probe_${modelProbe.ok ? modelProbe.value.length : modelProbe.error.code}_${modelProbe.ok ? String(modelProbe.value[0]?.available) : "error"}`);
    }
    routers = registerRouters(supervisor, handlers, explicitWorkspace, defaultWorkspace);
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

    await loadWorkbenchRoute(window);
    const submitted = await window.webContents.executeJavaScript(
      wfwSubmitDriverScript({
        stage: "wte1",
        modelId: gateway.modelId,
        prompt: `请读取并修改 ${relativePath}，把标题改为 RoboThree Notes 并增加结论。`,
        chooseWorkspace: true,
      }),
      true,
    );
    await waitForWfw3TaskCompleted(
      supervisor.client,
      submitted.taskId,
      gateway,
      "wte1",
      join(directory, "robothree.sqlite"),
    );
    if (gateway.requests.length !== 3) throw new Error("wte1_gateway_round_count_invalid");
    const readResultRequest = gateway.requests[1]?.body;
    if (!containsExactText(readResultRequest, originalText)) {
      throw new Error("wte1_exact_read_result_missing");
    }
    if (await readFile(join(explicitWorkspace, relativePath), "utf8") !== revisedText
      || await readFile(join(explicitWorkspace, `${relativePath}.prev`), "utf8") !== originalText) {
      throw new Error("wte1_replace_or_previous_invalid");
    }
    const detail = await supervisor.client.loadTaskDetail({
      contractVersion: "v1alpha1",
      type: "task_detail",
      queryId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId: randomUUID(),
      taskId: submitted.taskId,
    });
    if (!detail.ok) throw new Error("wte1_task_detail_unavailable");
    const reads = detail.value.toolActivities.filter((activity) =>
      activity.operationType === "tool.workspace.file.read_text");
    const writes = detail.value.toolActivities.filter((activity) =>
      activity.operationType === "tool.workspace.file.write_text");
    const artifacts = detail.value.artifacts.filter((artifact) =>
      artifact.relativePath === relativePath);
    if (reads.length !== 1 || writes.length !== 1 || artifacts.length !== 1) {
      throw new Error("wte1_activity_or_artifact_count_invalid");
    }
    await loadWorkbenchRoute(window, submitted.taskId, submitted.sessionId);
    const presentation = await window.webContents.executeJavaScript(
      wfwWorkbenchResultScript(relativePath, false, "RoboThree Notes"),
      true,
    );
    const firstRuntimeInstanceId = supervisor.runtimeInstanceId;
    const firstCorePid = findCoreChildPid();
    process.kill(firstCorePid, "SIGKILL");
    await observeExitedProcess(firstCorePid);
    await waitForSupervisorRecovery(supervisor, firstRuntimeInstanceId);
    await loadWorkbenchRoute(window, submitted.taskId, submitted.sessionId);
    const restored = await window.webContents.executeJavaScript(
      wfwWorkbenchResultScript(relativePath, false, "RoboThree Notes"),
      true,
    );
    const preferences = window.webContents.getLastWebPreferences();
    return Object.freeze({
      status: "PASS",
      outcome: "WTE1_WORKSPACE_TEXT_READ_CONTINUOUS_EDIT_E2E_CONFORMANT",
      realElectronMain: true,
      productionPreload: true,
      realRendererWorkbench: presentation.realRendererWorkbench === true,
      realMainIpc: true,
      realCoreChild: true,
      exactReadResultInModelRequest: true,
      textReadActivityCount: reads.length,
      textWriteActivityCount: writes.length,
      replacementVerified: true,
      previousBackupVerified: true,
      logicalArtifactHeadCount: artifacts.length,
      markdownPreviewReady: presentation.previewReady === true,
      previewReadyAfterRestart: restored.previewReady === true,
      coreRestartedWithNewIdentity:
        supervisor.runtimeInstanceId !== firstRuntimeInstanceId,
      sigkillObserved: true,
      gatewayRequestCount: gateway.requests.length,
      sandbox: preferences.sandbox === true,
      contextIsolation: preferences.contextIsolation === true,
      nodeIntegrationDisabled: preferences.nodeIntegration === false,
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
    delete process.env.ROBOTHREE_WTE1_E2E;
    await rm(directory, { recursive: true, force: true });
  }
}

async function assertWfwHtmlPreviewDocumentLoaded(window, expectedText) {
  const deadline = Date.now() + 10_000;
  if (!window.webContents.debugger.isAttached()) {
    window.webContents.debugger.attach("1.3");
  }
  try {
    while (Date.now() < deadline) {
      const targets = await window.webContents.debugger.sendCommand("Target.getTargets");
      const childTarget = targets.targetInfos.find((target) =>
        target.type === "iframe"
        && /^http:\/\/127\.0\.0\.1:\d+\/preview:[^/]+\/[^/]+\/index\.html$/u.test(target.url));
      if (childTarget === undefined) {
        await delay(50);
        continue;
      }
      const attached = await window.webContents.debugger.sendCommand("Target.attachToTarget", {
        targetId: childTarget.targetId,
        flatten: true,
      });
      try {
        const evaluated = await window.webContents.debugger.sendCommand(
          "Runtime.evaluate",
          {
            expression: `({ text: document.body?.innerText ?? "", url: location.href })`,
            returnByValue: true,
          },
          attached.sessionId,
        );
        const value = evaluated?.result?.value;
        if (value?.url === childTarget.url && value?.text?.includes(expectedText) === true) {
          return true;
        }
      } finally {
        await window.webContents.debugger.sendCommand("Target.detachFromTarget", {
          sessionId: attached.sessionId,
        });
      }
      await delay(50);
    }
    throw new Error("wfw3_html_preview_document_not_loaded");
  } finally {
    if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach();
  }
}

async function waitForWfw3TaskCompleted(client, taskId, gateway, stage, databasePath) {
  try {
    await waitForTaskDisplayStatus(client, taskId, "completed");
  } catch {
    const detail = await client.loadTaskDetail({
      contractVersion: "v1alpha1",
      type: "task_detail",
      queryId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId: randomUUID(),
      taskId,
    });
    const taskStatus = detail.ok ? detail.value.summary.displayStatus : "detail_unavailable";
    const failureSummary = detail.ok
      ? (detail.value.summary.failureSummary ?? "none")
        .replace(/[^A-Za-z0-9_.-]+/gu, "_")
        .slice(0, 120)
      : "none";
    const activityStatus = detail.ok
      ? detail.value.toolActivities.map((activity) => activity.status).join("_") || "none"
      : "none";
    const runStatus = detail.ok
      ? detail.value.runs.map((run) => run.displayStatus).join("_") || "none"
      : "none";
    const stepStatus = detail.ok
      ? detail.value.runs.flatMap((run) => run.steps)
        .map((step) => `${step.actionType.replaceAll(".", "_")}_${step.displayStatus}`)
        .join("_") || "none"
      : "none";
    const expectedToolName = projectEnterpriseProviderToolName(
      "tool.workspace.file.write_text",
    );
    const toolLocked = gateway.requests.some((request) =>
      request.body?.modelRequest?.tools?.some((tool) =>
        tool.name === expectedToolName || tool.capabilityId === "tool.workspace.file.write_text"));
    const nameLocked = gateway.requests.some((request) =>
      request.body?.modelRequest?.tools?.some((tool) => tool.name === expectedToolName));
    const durableFailure = readWfw3DurableFailure(databasePath, taskId);
    const latestTrackedRequest = gateway.requests.at(-1);
    const latestRequest = latestTrackedRequest?.body;
    const requestShape = [
      `contract_${String(latestRequest?.contractVersion ?? "missing")}`,
      `client_${/^[0-9a-f-]{36}$/u.test(String(latestRequest?.clientRequestId ?? "")) ? 1 : 0}`,
      `digest_${/^[a-f0-9]{64}$/u.test(String(latestRequest?.requestDigest ?? "")) ? 1 : 0}`,
      `model_${typeof latestRequest?.modelRequest?.model?.modelId === "string" ? 1 : 0}`,
      `status_${latestTrackedRequest?.statusCount ?? -1}`,
      `events_${latestTrackedRequest?.eventCount ?? -1}`,
    ].join("_");
    throw new Error(`wfw3_${stage}_${taskStatus}_${failureSummary}_${activityStatus}_${runStatus}_${stepStatus}_tool_${toolLocked ? 1 : 0}_name_${nameLocked ? 1 : 0}_${durableFailure}_${requestShape}_gateway_${gateway.requests.length}`);
  }
}

function readWfw3DurableFailure(databasePath, taskId) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const internalTaskId = taskId.startsWith("task:") ? taskId.slice("task:".length) : taskId;
    const row = database.prepare(`
      SELECT state_json AS stateJson
      FROM task_checkpoints
      WHERE task_id = ?
      ORDER BY state_revision DESC
      LIMIT 1
    `).get(internalTaskId);
    const matches = [];
    if (typeof row?.stateJson === "string") {
      collectWfw3FailureValues(JSON.parse(row.stateJson), matches);
    }
    const events = database.prepare(`
      SELECT event_json AS eventJson
      FROM task_events
      WHERE task_id = ?
      ORDER BY sequence DESC
      LIMIT 16
    `).all(internalTaskId);
    for (const event of events) {
      if (typeof event?.eventJson === "string") {
        collectWfw3FailureValues(JSON.parse(event.eventJson), matches);
      }
    }
    const link = database.prepare(`
      SELECT output_started_at AS outputStartedAt,
             message_committed_at AS messageCommittedAt,
             invocation_id AS invocationId,
             accepted_at AS acceptedAt
      FROM model_invocation_links
      WHERE task_id = ?
      ORDER BY round DESC
      LIMIT 1
    `).get(internalTaskId);
    const batchCount = Number(database.prepare(`
      SELECT COUNT(*) AS count FROM tool_call_batches WHERE task_id = ?
    `).get(internalTaskId)?.count ?? 0);
    const dispositionCount = Number(database.prepare(`
      SELECT COUNT(*) AS count
      FROM tool_call_dispositions AS disposition
      JOIN tool_call_batches AS batch ON batch.batch_id = disposition.batch_id
      WHERE batch.task_id = ?
    `).get(internalTaskId)?.count ?? 0);
    const effectCount = Number(database.prepare(`
      SELECT COUNT(*) AS count FROM effect_attempts WHERE task_id = ?
    `).get(internalTaskId)?.count ?? 0);
    const sessionId = database.prepare(`
      SELECT json_extract(state_json, '$.state.sessionId') AS sessionId
      FROM task_checkpoints
      WHERE task_id = ?
      ORDER BY state_revision DESC
      LIMIT 1
    `).get(internalTaskId)?.sessionId;
    const sessionTaskCount = typeof sessionId === "string"
      ? Number(database.prepare(`
        SELECT COUNT(DISTINCT task_heads.task_id) AS count
        FROM task_heads
        JOIN task_checkpoints
          ON task_checkpoints.checkpoint_id = task_heads.latest_checkpoint_id
        WHERE json_extract(task_checkpoints.state_json, '$.state.sessionId') = ?
      `).get(sessionId)?.count ?? 0)
      : 0;
    const sessionFacts = typeof sessionId === "string"
      ? readWfw3SessionFacts(database, sessionId)
      : { writes: [], workspaceGrantIds: [] };
    const sessionWriteFacts = sessionFacts.writes;
    const diagnostic = [
      `session_tasks_${sessionTaskCount}`,
      `write_facts_${sessionWriteFacts.length}`,
      `write_grants_${new Set(sessionFacts.workspaceGrantIds).size}`,
      ...sessionWriteFacts.slice(0, 2).map((fact) =>
        `${fact.mode}_${fact.sha256.slice(0, 15)}`),
      `started_${link?.outputStartedAt === null || link?.outputStartedAt === undefined ? 0 : 1}`,
      `accepted_${link?.acceptedAt === null || link?.acceptedAt === undefined ? 0 : 1}`,
      `invocation_${link?.invocationId === null || link?.invocationId === undefined ? 0 : 1}`,
      `committed_${link?.messageCommittedAt === null || link?.messageCommittedAt === undefined ? 0 : 1}`,
      `batch_${batchCount}`,
      `disposition_${dispositionCount}`,
      `effect_${effectCount}`,
    ].join("_");
    return `${diagnostic}_${matches.join("_") || "durable_none"}`
      .replace(/[^A-Za-z0-9_.-]+/gu, "_")
      .slice(0, 260);
  } finally {
    database.close();
  }
}

function readWfw3SessionFacts(database, sessionId) {
  const rows = database.prepare(`
    SELECT task_checkpoints.state_json AS stateJson
    FROM task_heads
    JOIN task_checkpoints
      ON task_checkpoints.checkpoint_id = task_heads.latest_checkpoint_id
    WHERE json_extract(task_checkpoints.state_json, '$.state.sessionId') = ?
    ORDER BY task_heads.task_id
  `).all(sessionId);
  const facts = [];
  const workspaceGrantIds = [];
  for (const row of rows) {
    if (typeof row?.stateJson !== "string") continue;
    collectWfw3WriteFacts(JSON.parse(row.stateJson), facts, workspaceGrantIds);
  }
  return { writes: facts, workspaceGrantIds };
}

function collectWfw3WriteFacts(value, facts, workspaceGrantIds) {
  if (value === null || value === undefined || facts.length >= 4) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectWfw3WriteFacts(item, facts, workspaceGrantIds));
    return;
  }
  if (typeof value !== "object") return;
  if (
    value.kind === "tool.workspace.file.write_text"
    && value.payload !== null
    && typeof value.payload === "object"
    && typeof value.payload.workspaceGrantId === "string"
  ) workspaceGrantIds.push(value.payload.workspaceGrantId);
  if (
    value.outcome === "succeeded"
    && value.output !== null
    && typeof value.output === "object"
    && value.output.result !== null
    && typeof value.output.result === "object"
    && typeof value.output.result.sha256 === "string"
    && typeof value.output.result.mode === "string"
  ) {
    facts.push({
      mode: value.output.result.mode,
      sha256: value.output.result.sha256,
    });
  }
  Object.values(value).forEach((item) => collectWfw3WriteFacts(item, facts, workspaceGrantIds));
}

function collectWfw3FailureValues(value, matches, path = "") {
  if (matches.length >= 8 || value === null || value === undefined) return;
  if (typeof value === "string") {
    if (/error|fail|reason|summary|model|tool/iu.test(path)
      || /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/u.test(value)) matches.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectWfw3FailureValues(item, matches, `${path}.${index}`));
    return;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([key, item]) =>
      collectWfw3FailureValues(item, matches, `${path}.${key}`));
  }
}

async function loadWorkbenchRoute(window, taskId, sessionId) {
  const query = taskId === undefined || sessionId === undefined
    ? ""
    : `?sessionId=${encodeURIComponent(sessionId)}&taskId=${encodeURIComponent(taskId)}`;
  await window.loadFile(join(root, "apps/desktop/dist/renderer/index.html"), {
    hash: `/workbench${query}`,
  });
}

function wfwSubmitDriverScript(input) {
  return `(async () => {
    const waitFor = async (predicate, code, timeoutMs = 40000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(code);
    };
    await waitFor(() => document.body.innerText.includes("今天想完成什么？")
      || document.querySelector("[data-workbench-conversation]"),
    "wfw3_workbench_unavailable");
    ${input.freshConversation === true ? `
      const newTask = [...document.querySelectorAll(".desktop-shell__nav-item")]
        .find((item) => item.textContent?.includes("新建任务"));
      if (!(newTask instanceof HTMLElement)) throw new Error("wfw3_new_task_action_missing");
      newTask.click();
      await waitFor(() => [...document.querySelectorAll("button")]
        .some((button) => button.querySelector(".sr-only")?.textContent?.trim() === "提交任务"),
      "wfw3_new_task_reset_missing");
    ` : ""}
    ${input.chooseWorkspace ? `
      const choose = [...document.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("选择空间") && !button.disabled);
      if (!choose) throw new Error("wfw3_workspace_action_missing");
      choose.click();
      await waitFor(() => [...document.querySelectorAll(".workbench-page__workspace-trigger")]
        .some((button) => !button.textContent?.includes("默认") && !button.disabled),
        "wfw3_explicit_workspace_missing");
    ` : ""}
    const modelTrigger = await waitFor(() => {
      const candidate = document.querySelector("button[aria-controls='workbench-model-menu']");
      return candidate instanceof HTMLButtonElement && !candidate.disabled
        ? candidate
        : undefined;
    }, "wfw3_model_menu_missing");
    modelTrigger.click();
    const model = await waitFor(() => [...document.querySelectorAll(".workbench-page__model-list button")]
      .find((button) => !button.disabled),
    "wfw3_model_missing");
    model.click();
    const textarea = document.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("wfw3_composer_missing");
    textarea.value = ${JSON.stringify(input.prompt)};
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    let submit;
    try {
      submit = await waitFor(() => {
        const candidate = [...document.querySelectorAll("button")]
          .find((button) => button.querySelector(".sr-only")?.textContent?.trim()
            === ${JSON.stringify(input.previousTaskId === undefined ? "提交任务" : "发送消息")});
        return candidate && !candidate.disabled ? candidate : undefined;
      }, ${JSON.stringify(`wfw3_${input.stage}_submit_unavailable`)});
    } catch {
      const candidate = [...document.querySelectorAll("button")]
        .find((button) => ["提交任务", "发送消息"].includes(
          button.querySelector(".sr-only")?.textContent?.trim() ?? "",
        ));
      const reason = encodeURIComponent([
        candidate?.getAttribute("title") ?? "missing",
        candidate?.disabled === true ? "disabled" : "enabled",
        "text:" + textarea.value.length,
        document.querySelector(".workbench-page__card-header p")?.textContent?.trim()
          ?? "summary-missing",
      ].join("|"));
      throw new Error(${JSON.stringify(`wfw3_${input.stage}_submit_unavailable`)} + "_" + reason);
    }
    submit.click();
    const ids = await waitFor(() => {
      const values = new URLSearchParams(location.hash.split("?")[1] ?? "");
      const taskId = values.get("taskId");
      const sessionId = values.get("sessionId");
      return taskId && sessionId && taskId !== ${JSON.stringify(input.previousTaskId ?? "")}
        ? { taskId, sessionId }
        : undefined;
    }, "wfw3_submitted_route_missing");
    return ids;
  })()`;
}

function wfwWorkbenchResultScript(fileName, expectHtmlPreview, expectedTextPreview) {
  return `(async () => {
    const waitFor = async (predicate, code, timeoutMs = 40000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(code);
    };
    await waitFor(() => document.body.innerText.includes(${JSON.stringify(fileName)}),
    "wfw3_result_not_presented");
    const toggle = document.querySelector("[data-results-panel-toggle]");
    if (toggle?.getAttribute("aria-expanded") !== "true") toggle?.click();
    const row = await waitFor(() => [...document.querySelectorAll(".workbench-page__artifact-list li")]
      .find((item) => item.textContent?.includes(${JSON.stringify(fileName)})),
    "wfw3_artifact_row_missing");
    row.querySelector("button")?.click();
    ${expectHtmlPreview ? `
      const previewOutcome = await waitFor(() => {
        if (document.querySelector("iframe[title='HTML 成果预览']")) return "ready";
        if (document.querySelector("[data-workbench-artifact-preview] [role='alert']")) return "error";
        return undefined;
      }, "wfw3_html_preview_missing");
    ` : expectedTextPreview === undefined
      ? "const previewOutcome = \"not_requested\";"
      : `
        const previewOutcome = await waitFor(() => {
          const preview = document.querySelector("[data-workbench-artifact-preview]");
          if (preview?.querySelector("[role='alert']")) return "error";
          if (preview?.textContent?.includes(${JSON.stringify(expectedTextPreview)})) return "ready";
          return undefined;
        }, "wte1_markdown_preview_missing");
        if (previewOutcome !== "ready") throw new Error("wte1_markdown_preview_error");
      `}
    return {
      realRendererWorkbench: document.querySelector("#app") !== null,
      previewReady: previewOutcome === "ready",
      previewState: previewOutcome,
    };
  })()`;
}

async function startWfw3GatewayFixture(input) {
  const requests = [];
  const invocations = new Map();
  const logicalRoundByClientRequestId = new Map();
  const oldDigest = `sha256:${createHash("sha256").update(input.initialHtml).digest("hex")}`;
  const server = createServer(async (request, response) => {
    if (!isAuthorized(request.headers.authorization)) {
      json(response, 401, { code: "unauthorized" });
      return;
    }
    if (request.method === "POST") {
      const body = JSON.parse(await readBody(request));
      const requestContractVersion = new URL(request.url ?? "/", "http://127.0.0.1")
        .pathname.split("/").filter(Boolean)[0];
      let logicalRound = logicalRoundByClientRequestId.get(body.clientRequestId);
      if (logicalRound === undefined) {
        logicalRound = logicalRoundByClientRequestId.size + 1;
        logicalRoundByClientRequestId.set(body.clientRequestId, logicalRound);
      }
      const invocationId = randomUUID();
      const accepted = {
        contractVersion: requestContractVersion,
        invocationId,
        clientRequestId: body.clientRequestId,
        requestDigest: body.requestDigest,
        ...body.modelRequest.model,
      };
      requests.push({ logicalRound, body, requestContractVersion, statusCount: 0, eventCount: 0 });
      invocations.set(invocationId, { accepted, logicalRound });
      json(response, 202, {
        contractVersion: accepted.contractVersion,
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
    const parts = requestUrl.pathname.split("/").filter(Boolean);
    const invocationId = requestUrl.pathname.endsWith("/events")
      ? parts.at(-2)
      : parts.at(-1);
    const invocation = invocations.get(invocationId);
    if (invocation === undefined) {
      json(response, 409, { code: "invocation_missing" });
      return;
    }
    if (!requestUrl.pathname.endsWith("/events")) {
      const tracked = requests.find((candidate) => candidate.logicalRound === invocation.logicalRound);
      if (tracked !== undefined) tracked.statusCount += 1;
      json(response, 200, {
        contractVersion: invocation.accepted.contractVersion,
        invocationId: invocation.accepted.invocationId,
        clientRequestId: invocation.accepted.clientRequestId,
        requestDigest: invocation.accepted.requestDigest,
        modelId: invocation.accepted.modelId,
        modelRevision: invocation.accepted.modelRevision,
        configurationRevision: invocation.accepted.configurationRevision,
        runtimeRegistryGeneration: invocation.accepted.runtimeRegistryGeneration,
        status: "running",
        statusRevision: 1,
        createdAt: new Date().toISOString(),
        lastDurableEventSequence: 1,
        durableCursor: `cursor:1:${"a".repeat(16)}`,
      });
      return;
    }
    const tracked = requests.find((candidate) => candidate.logicalRound === invocation.logicalRound);
    if (tracked !== undefined) tracked.eventCount += 1;
    response.writeHead(200, { "content-type": "text/event-stream" });
    for (const event of wfw3GatewayEvents(
      invocation.accepted.invocationId,
      invocation.logicalRound,
      input,
      oldDigest,
      invocation.accepted.contractVersion,
    )) response.write(`data: ${JSON.stringify(event)}\n\n`);
    response.end();
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("wfw3_gateway_listen_failed");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    modelId: "model.internal-trial",
    requests,
    close: () => new Promise((resolvePromise) => {
      server.closeAllConnections();
      server.close(() => resolvePromise());
    }),
  };
}

function wfw3GatewayEvents(invocationId, round, input, oldDigest, contractVersion) {
  const occurredAt = new Date().toISOString();
  const response = input.scenario === "wte1"
    ? round === 1
      ? toolCallEvent(invocationId, "tool.workspace.file.read_text", {
          relativePath: input.relativePath,
        }, occurredAt, contractVersion)
      : round === 2
        ? toolCallEvent(invocationId, "tool.workspace.file.write_text", {
            relativePath: input.relativePath,
            content: input.revisedHtml,
            mode: "replace_existing",
            expectedPreviousSha256: oldDigest,
          }, occurredAt, contractVersion)
        : textDeltaEvent(
          invocationId,
          occurredAt,
          `已基于磁盘最新版本修改 ${input.relativePath}`,
          contractVersion,
        )
    : round === 1
    ? toolCallEvent(invocationId, "tool.workspace.file.write_text", {
        relativePath: "index.html",
        content: input.initialHtml,
        mode: "create_new",
      }, occurredAt, contractVersion)
    : round === 3
      ? toolCallEvent(invocationId, "tool.workspace.file.write_text", {
          relativePath: "index.html",
          content: input.revisedHtml,
          mode: "replace_existing",
          expectedPreviousSha256: oldDigest,
        }, occurredAt, contractVersion)
      : round === 5
        ? toolCallEvent(invocationId, "tool.workspace.file.write_text", {
            relativePath: "notes.md",
            content: "# Notes\n\nCreated by RoboThree.\n",
            mode: "create_new",
          }, occurredAt, contractVersion)
        : textDeltaEvent(invocationId, occurredAt, round === 2
          ? "HTML 文件已创建"
          : round === 4
            ? "HTML 文件已更新"
            : "Markdown 文件已创建", contractVersion);
  return [{
    contractVersion,
    invocationId,
    eventId: randomUUID(),
    eventClass: "ephemeral",
    streamSequence: 1,
    eventType: "started",
    eventPayload: {},
    eventDigest: "1".repeat(64),
    occurredAt,
  }, response, {
    contractVersion,
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

function registerRouters(supervisor, handlers, workspacePath, defaultWorkspacePath) {
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
  const defaultWorkspace = defaultWorkspacePath === undefined
    ? undefined
    : new DefaultWorkspaceGrantProvider({
        resolveClient: () => supervisor.client,
        rootPath: defaultWorkspacePath,
      });
  const v1alpha5 = new DesktopV1Alpha5IpcRouter({
    resolveConnection: () => supervisor.connectionLease(),
    isCurrentConnection: (lease) => supervisor.isCurrentConnectionLease(lease),
    ...(defaultWorkspace === undefined ? {} : {
      ensureDefaultWorkspaceGrant: (input) => defaultWorkspace.ensure(input),
    }),
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

function toolCallEvent(
  invocationId,
  capabilityId,
  args,
  occurredAt,
  contractVersion = "v1alpha3",
) {
  return {
    contractVersion,
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
  contractVersion = "v1alpha3",
) {
  return {
    contractVersion,
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
  return {
    schemaVersion: "mvp-admin-vs1.internal-trial.v1",
    centralBaseUrl: origin,
    configurationRevision: `sha256:${"c".repeat(64)}`,
    modelId,
    modelCreatedAt: "2026-08-29T00:00:00.000Z",
    displayName: "Internal Trial Model",
    supportsToolCalling: true,
    contextWindowTokens: 400_000,
    maxOutputTokens: 262_144,
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

function containsExactText(value, expected) {
  if (typeof value === "string") {
    if (value.includes(expected)) return true;
    if (value.startsWith("{") || value.startsWith("[")) {
      try {
        return containsExactText(JSON.parse(value), expected);
      } catch {
        return false;
      }
    }
    return false;
  }
  if (Array.isArray(value)) return value.some((item) => containsExactText(item, expected));
  if (value !== null && typeof value === "object") {
    return Object.values(value).some((item) => containsExactText(item, expected));
  }
  return false;
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
  if (wfw3Mode || wte1Mode) {
    return message.replace(/[^A-Za-z0-9_.-]+/gu, "_").slice(0, 512)
      || (wte1Mode ? "wte1_electron_failure" : "wfw3_electron_failure");
  }
  return /^[a-z0-9_.-]+$/u.test(message) ? message : "vs2_electron_failure";
}
