/* global Blob, FormData, clearTimeout, fetch */

import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { deflateRawSync } from "node:zlib";

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
import { AgentLifecycleV1Alpha1IpcRouter } from
  "../apps/desktop/dist/main/agent-lifecycle-v1alpha1-ipc-router.js";
import { SkillLifecycleV1Alpha1IpcRouter } from
  "../apps/desktop/dist/main/skill-lifecycle-v1alpha1-ipc-router.js";
import { SkillDraftWorkspaceService } from
  "../apps/desktop/dist/main/skill-draft-workspace-service.js";
import { SkillInstallationService } from
  "../apps/desktop/dist/main/skill-installation-service.js";
import { SkillLocalDiscoveryService } from
  "../apps/desktop/dist/main/skill-local-discovery-service.js";
import { AdminSkillDraftTestCoordinator } from
  "../apps/desktop/dist/main/admin-skill-draft-test-coordinator.js";
import { createSecureWindowOptions } from
  "../apps/desktop/dist/main/window-security.js";
import {
  DESKTOP_IPC_CHANNELS,
  AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS,
  SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS,
  DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS,
  DESKTOP_V1ALPHA4_IPC_CHANNELS,
  DESKTOP_V1ALPHA5_IPC_CHANNELS,
} from "../apps/desktop/dist/shared/foundation-api.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const deploymentEnvironmentName =
  "ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT";
const tokenEnvironmentName =
  "ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN";
const externalGatewayBaseUrlEnvironmentName =
  "ROBOTHREE_MVP_VS1_EXTERNAL_GATEWAY_BASE_URL";
const externalGatewayTokenEnvironmentName =
  "ROBOTHREE_MVP_VS1_EXTERNAL_GATEWAY_ACCESS_TOKEN";
const externalGatewayModelEnvironmentName =
  "ROBOTHREE_MVP_VS1_EXTERNAL_GATEWAY_MODEL_ID";
const adminDiscoveryModeEnvironmentName =
  "ROBOTHREE_MVP_ADMIN_VS1_DISCOVERY";
const rslLifecycleOriginEnvironmentName =
  "ROBOTHREE_MVP_RSL1_LIFECYCLE_ORIGIN";
const rslLifecycleTokenEnvironmentName =
  "ROBOTHREE_INTERNAL_TRIAL_AGENT_LIFECYCLE_ACCESS_TOKEN";
const rsl2LifecycleOriginEnvironmentName =
  "ROBOTHREE_MVP_RSL2_LIFECYCLE_ORIGIN";
const rsl2LifecycleTokenEnvironmentName =
  "ROBOTHREE_INTERNAL_TRIAL_SKILL_LIFECYCLE_ACCESS_TOKEN";
const rsl2AdminUploadE2eEnvironmentName =
  "ROBOTHREE_MVP_RSL2_ADMIN_UPLOAD_E2E";
const multiTurnE2eEnvironmentName =
  "ROBOTHREE_MVP_VS1_MULTITURN_E2E";
const artifactFileName = "项目汇报.pptx";
const source = Object.freeze({
  trust: "enterprise",
  packageId: "deployment.internal-trial.vs1",
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
  const directory = await mkdtemp(join(tmpdir(), "robothree-mvp-vs1-"));
  const multiTurnE2e = process.env[multiTurnE2eEnvironmentName] === "true";
  delete process.env[multiTurnE2eEnvironmentName];
  const rslLifecycleOrigin = process.env[rslLifecycleOriginEnvironmentName];
  delete process.env[rslLifecycleOriginEnvironmentName];
  const rslMode = rslLifecycleOrigin !== undefined;
  const rsl2LifecycleOrigin = process.env[rsl2LifecycleOriginEnvironmentName];
  delete process.env[rsl2LifecycleOriginEnvironmentName];
  const rsl2Mode = rsl2LifecycleOrigin !== undefined;
  const rsl2AdminUploadE2e = process.env[rsl2AdminUploadE2eEnvironmentName] === "true";
  delete process.env[rsl2AdminUploadE2eEnvironmentName];
  const lifecycleOrigin = rslLifecycleOrigin ?? rsl2LifecycleOrigin;
  const gateway = await startGateway(lifecycleOrigin,
    rsl2Mode ? (rsl2AdminUploadE2e ? "skill-admin" : "skill") : "robot");
  const adminDiscoveryMode = process.env[adminDiscoveryModeEnvironmentName] === "true";
  delete process.env[adminDiscoveryModeEnvironmentName];
  const now = Date.now();
  process.env[deploymentEnvironmentName] = JSON.stringify(
    adminDiscoveryMode
      ? adminDiscoveryRequest(gateway.origin)
      : deployment(gateway.origin, gateway.modelId),
  );
  process.env[tokenEnvironmentName] = gateway.accessToken ?? compactToken({
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
      ...(rsl2Mode ? {
        privateInstalledSkillRoot: join(directory, ".robothree", "skills", "installed"),
      } : {}),
      maxUnexpectedRestarts: 1,
    });
    if (process.env[deploymentEnvironmentName] !== undefined
      || process.env[tokenEnvironmentName] !== undefined
      || (rslMode && process.env[rslLifecycleTokenEnvironmentName] !== undefined)
      || (rsl2Mode && process.env[rsl2LifecycleTokenEnvironmentName] !== undefined)) {
      throw new Error("vs1_privileged_environment_not_consumed");
    }
    await supervisor.start();
    window = new BrowserWindow(createSecureWindowOptions(
      join(root, "apps/desktop/dist/preload/index.cjs"),
    ));
    routers = registerRouters(supervisor, handlers, directory,
      () => window?.webContents.id);
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
      hash: rslMode ? "/intelligence/create-robot"
        : rsl2Mode && !rsl2AdminUploadE2e ? "/intelligence/create-skill" : "/workbench",
    });
    if (rslMode) {
      return await runRobotLifecycleFlow({
        window,
        supervisor,
        gateway,
        directory,
      });
    }
    if (rsl2Mode) {
      if (rsl2AdminUploadE2e) {
        return await runAdminSkillLifecycleFlow({ window, supervisor, gateway, directory });
      }
      return await runSkillLifecycleFlow({ window, supervisor, gateway, directory });
    }
    if (multiTurnE2e) {
      await window.loadURL("about:blank");
      routers.v1alpha4.clear();
      routers.v1alpha5.removeWebContents(window.webContents.id);
      return await runMultiTurnConversationFlow({
        window,
        supervisor,
        gateway,
        directory,
      });
    }
    const submitted = await window.webContents.executeJavaScript(
      workbenchDriverScript(gateway.modelId),
      true,
    );
    await loadTaskRoute(window, submitted.taskId, submitted.sessionId);
    const confirmed = await window.webContents.executeJavaScript(
      confirmationDriverScript(submitted.taskId),
      true,
    );
    if (confirmed?.applied !== true && confirmed?.notRequired !== true) {
      const taskDiagnostic = readSafeTaskDiagnostic(
        join(directory, "robothree.sqlite"),
        submitted.taskId,
      );
      process.stderr.write(`${JSON.stringify({
        stage: "confirmation",
        gatewayInvocationRoundCount: gateway.requests?.length,
        taskStatus: confirmed?.taskStatus ?? "unknown",
        confirmationCount: confirmed?.confirmationCount ?? 0,
        detailVisible: confirmed?.detailVisible === true,
        taskDiagnostic,
      })}\n`);
      throw new Error("vs1_confirmation_not_applied");
    }
    const projected = await window.webContents.executeJavaScript(
      completedTaskProjectionScript(submitted.taskId, submitted.sessionId),
      true,
    );
    if (projected?.conformant !== true) {
      requireCompletedTaskEvidence(projected, "durable_projection");
    }
    await loadTaskRoute(window, submitted.taskId, submitted.sessionId);
    const beforeRestart = await window.webContents.executeJavaScript(
      completedTaskDomScript(submitted.taskId, submitted.sessionId),
      true,
    );
    requireCompletedTaskEvidence(beforeRestart, "before_restart");
    const file = await stat(join(directory, artifactFileName));
    if (!file.isFile() || file.size === 0) {
      throw new Error("vs1_pptx_artifact_file_invalid");
    }
    const firstRuntimeInstanceId = supervisor.runtimeInstanceId;
    const firstCorePid = findCoreChildPid();
    process.kill(firstCorePid, "SIGKILL");
    await observeExitedProcess(firstCorePid);
    await waitForSupervisorRecovery(supervisor, firstRuntimeInstanceId);
    const secondRuntimeInstanceId = supervisor.runtimeInstanceId;
    await loadTaskRoute(window, submitted.taskId, submitted.sessionId);
    const afterRestart = await window.webContents.executeJavaScript(
      completedTaskDomScript(submitted.taskId, submitted.sessionId),
      true,
    );
    requireCompletedTaskEvidence(afterRestart, "after_restart");
    const preferences = window.webContents.getLastWebPreferences();
    if (gateway.requests !== undefined && gateway.requests.length !== 2) {
      throw new Error("vs1_gateway_round_count_invalid");
    }
    return Object.freeze({
      status: "PASS",
      outcome: adminDiscoveryMode
        ? "ADMIN_MVP_VS1_DESKTOP_MODEL_E2E_CONFORMANT"
        : "MVP_VERTICAL_SLICE_1_E2E_CONFORMANT",
      realElectronMain: true,
      realRendererWorkbench: submitted.realRendererWorkbench === true,
      realRendererTaskDetail: beforeRestart.realRendererTaskDetail === true,
      realMainIpc: true,
      realCoreChild: true,
      realSqliteReopen: true,
      realGatewayHttpSse: true,
      gatewayMode: gateway.mode,
      adminModelDiscoveryUsed: adminDiscoveryMode,
      internalTrialEnvironmentConsumed: true,
      rendererSensitiveEnvironmentAbsent:
        submitted.rendererSensitiveEnvironmentAbsent === true,
      presentationAgentSelected: submitted.agentSelected === true,
      presentationSkillSelected: submitted.skillSelected === true,
      modelSelected: submitted.modelSelected === true,
      userConfirmationRequired: confirmed.notRequired !== true,
      userConfirmationApplied: confirmed.applied === true,
      gatewayInvocationRoundCount: gateway.requests?.length,
      pptxArtifactFilePresent: true,
      pptxArtifactSize: file.size,
      assistantReplyVisible: beforeRestart.assistantReplyVisible === true,
      artifactVisible: beforeRestart.artifactVisible === true,
      toolActivityVisible: beforeRestart.toolActivityVisible === true,
      restartAssistantReplyVisible: afterRestart.assistantReplyVisible === true,
      restartArtifactVisible: afterRestart.artifactVisible === true,
      restartToolActivityVisible: afterRestart.toolActivityVisible === true,
      firstRuntimeInstanceId,
      secondRuntimeInstanceId,
      firstCorePid,
      sigkillObserved: true,
      sandbox: preferences.sandbox === true,
      contextIsolation: preferences.contextIsolation === true,
      nodeIntegrationDisabled: preferences.nodeIntegration === false,
    });
  } finally {
    eventSubscription?.abort();
    window?.destroy();
    routers?.v1alpha5.clear();
    routers?.taskReasoning.clear();
    routers?.adminSkillTests.stop();
    for (const channel of handlers.splice(0)) ipcMain.removeHandler(channel);
    await supervisor?.stop().catch(() => undefined);
    await gateway.close().catch(() => undefined);
    delete process.env[deploymentEnvironmentName];
    delete process.env[tokenEnvironmentName];
    delete process.env[rslLifecycleTokenEnvironmentName];
    delete process.env[rsl2LifecycleTokenEnvironmentName];
    await rm(directory, { recursive: true, force: true });
  }
}

async function runMultiTurnConversationFlow({ window, supervisor, gateway, directory }) {
  let result;
  try {
    result = await window.webContents.executeJavaScript(
      multiTurnConversationDriverScript(gateway.modelId),
      true,
    );
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      stage: "five_turn_driver_exception",
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: String(error instanceof Error ? error.message : error).slice(0, 240),
    })}\n`);
    throw new Error("vs1_five_turn_driver_exception");
  }
  if (result?.conformant !== true) {
    process.stderr.write(`${JSON.stringify({
      stage: "five_turn_conversation",
      completedTurnCount: result?.completedTurnCount ?? 0,
      assistantMessageCount: result?.assistantMessageCount ?? 0,
      failedTurn: result?.failedTurn ?? 0,
      taskStatus: result?.taskStatus ?? "unknown",
      errorCode: result?.errorCode ?? "none",
      taskDiagnostic: result?.taskId === undefined
        ? undefined
        : readSafeTaskDiagnostic(
          join(directory, "robothree.sqlite"),
          result.taskId,
        ),
    })}\n`);
    throw new Error("vs1_five_turn_conversation_failed");
  }
  const preferences = window.webContents.getLastWebPreferences();
  return Object.freeze({
    status: "PASS",
    outcome: "DR2_FIVE_TURN_CONVERSATION_E2E_CONFORMANT",
    realElectronMain: true,
    realRenderer: true,
    realMainIpc: true,
    realCoreChild: true,
    realGatewayHttpSse: true,
    gatewayMode: gateway.mode,
    sessionId: result.sessionId,
    completedTurnCount: result.completedTurnCount,
    assistantMessageCount: result.assistantMessageCount,
    runtimeInstanceId: supervisor.runtimeInstanceId,
    sandbox: preferences.sandbox === true,
    contextIsolation: preferences.contextIsolation === true,
    nodeIntegrationDisabled: preferences.nodeIntegration === false,
  });
}

async function runRobotLifecycleFlow({ window, supervisor, gateway, directory }) {
  let draft;
  try {
    draft = await window.webContents.executeJavaScript(
      robotLifecycleDraftDriverScript(),
      true,
    );
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      stage: "robot_lifecycle_draft",
      lifecycleRequests: gateway.lifecycleRequests,
    })}\n`);
    throw error;
  }
  const testProjection = await window.webContents.executeJavaScript(
    waitForTextTaskScript(draft.taskId),
    true,
  );
  requireTextTaskCompleted(testProjection, "draft_test");

  await window.webContents.executeJavaScript(
    waitForRobotDraftTestPassedScript(draft.robotId),
    true,
  );

  await navigateRendererHash(
    window,
    `/intelligence/create-robot?robotId=${encodeURIComponent(draft.robotId)}`,
  );
  const submission = await window.webContents.executeJavaScript(
    robotLifecycleSubmitDriverScript(draft.robotId),
    true,
  );
  const review = await approveRobotReview(gateway.origin);

  await navigateRendererHash(window, "/workbench");
  const publishedTask = await window.webContents.executeJavaScript(
    publishedRobotWorkbenchDriverScript(draft.robotId, draft.name),
    true,
  );
  const publishedProjection = await window.webContents.executeJavaScript(
    waitForTextTaskScript(publishedTask.taskId),
    true,
  );
  requireTextTaskCompleted(publishedProjection, "published_task");

  const databasePath = join(directory, "robothree.sqlite");
  const beforeLock = readTaskAgentLock(databasePath, publishedTask.taskId);
  if (beforeLock.agentDefinitionId !== draft.robotId
    || beforeLock.agentRevision !== review.agentRevision) {
    throw new Error("rsl1_published_task_lock_invalid");
  }
  const firstRuntimeInstanceId = supervisor.runtimeInstanceId;
  const firstCorePid = findCoreChildPid();
  process.kill(firstCorePid, "SIGKILL");
  await observeExitedProcess(firstCorePid);
  await waitForSupervisorRecovery(supervisor, firstRuntimeInstanceId);
  const secondRuntimeInstanceId = supervisor.runtimeInstanceId;
  const afterLock = readTaskAgentLock(databasePath, publishedTask.taskId);
  if (JSON.stringify(afterLock) !== JSON.stringify(beforeLock)) {
    throw new Error("rsl1_restart_task_lock_drift");
  }
  await navigateRendererHash(
    window,
    `/tasks?sessionId=${encodeURIComponent(publishedTask.sessionId)}&taskId=${encodeURIComponent(publishedTask.taskId)}`,
  );
  const afterRestart = await window.webContents.executeJavaScript(
    waitForTextTaskScript(publishedTask.taskId),
    true,
  );
  requireTextTaskCompleted(afterRestart, "published_task_after_restart");
  if (gateway.requests?.length !== 2) {
    throw new Error("rsl1_gateway_request_count_invalid");
  }
  const preferences = window.webContents.getLastWebPreferences();
  return Object.freeze({
    status: "PASS",
    outcome: "MVP_RSL1_ROBOT_LIFECYCLE_E2E_CONFORMANT",
    realElectronMain: true,
    realRendererCreatorFlow: draft.realRendererCreatorFlow === true,
    realMainIpc: true,
    realCoreChild: true,
    realSqliteReopen: true,
    realGatewayHttpSse: true,
    realCentralLifecycleHttp: true,
    realAdminReviewHttp: true,
    draftRevisionCount: 2,
    draftTestTaskCompleted: testProjection.completed === true,
    immutableSubmissionApproved: submission.submitted === true
      && review.state === "approved",
    publishedRobotTaskCompleted: publishedProjection.completed === true,
    exactPublishedAgentLock: true,
    restartExactAgentLock: true,
    gatewayInvocationCount: gateway.requests.length,
    mainLifecycleTokenEnvironmentAbsent:
      process.env[rslLifecycleTokenEnvironmentName] === undefined,
    firstRuntimeInstanceId,
    secondRuntimeInstanceId,
    firstCorePid,
    sigkillObserved: true,
    sandbox: preferences.sandbox === true,
    contextIsolation: preferences.contextIsolation === true,
    nodeIntegrationDisabled: preferences.nodeIntegration === false,
  });
}

async function runSkillLifecycleFlow({ window, supervisor, gateway, directory }) {
  const stage = (value) => process.stderr.write(`RSL2_STAGE=${value}\n`);
  stage("creator_form");
  await window.webContents.executeJavaScript(skillCreatorFormDriverScript(), true);
  await waitFor(() => window.webContents.getURL().includes("#/workbench"),
    "rsl2_skill_creator_navigation_timeout");
  stage("creator_task_lookup");
  let created;
  try {
    created = await window.webContents.executeJavaScript(
      skillCreatorTaskAndLifecycleDriverScript(), true);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      stage: "rsl2_creator_task_driver_exception",
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: String(error instanceof Error ? error.message : error).slice(0, 240),
    })}\n`);
    const match = String(error instanceof Error ? error.message : error)
      .match(/rsl2_[a-z0-9_]+/u);
    throw new Error(match?.[0] ?? "rsl2_creator_task_driver_failed");
  }
  if (created?.errorCode) throw new Error(`rsl2_created_draft_list_${created.errorCode}`);
  stage("creator_task_wait");
  const creatorProjection = await window.webContents.executeJavaScript(
    waitForTextTaskScript(created.creatorTaskId), true);
  if (creatorProjection?.completed !== true) {
    process.stderr.write(`${JSON.stringify({
      stage: "rsl2_creator_task_diagnostic",
      taskDiagnostic: readSafeTaskDiagnostic(join(directory, "robothree.sqlite"),
        created.creatorTaskId),
    })}\n`);
  }
  requireTextTaskCompleted(creatorProjection, "rsl2_creator_task");
  stage("draft_refresh_test_start");
  let lifecycle;
  try {
    lifecycle = await window.webContents.executeJavaScript(
      personalSkillLifecycleDriverScript(created.workspaceGrantId), true);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      stage: "rsl2_draft_refresh_driver_exception",
      errorName: error instanceof Error ? error.name : "unknown",
      errorCode: typeof error === "object" && error !== null
        && "errorCode" in error && typeof error.errorCode === "string"
        ? error.errorCode : "unknown",
      safeSummary: typeof error === "object" && error !== null
        && "safeSummary" in error && typeof error.safeSummary === "string"
        ? error.safeSummary.slice(0, 160) : "unknown",
      errorMessage: String(error instanceof Error ? error.message : error).slice(0, 240),
    })}\n`);
    const exactCode = typeof error === "object" && error !== null
      && "errorCode" in error && typeof error.errorCode === "string"
      ? error.errorCode : undefined;
    const match = String(exactCode ?? (error instanceof Error ? error.message : error))
      .match(/(?:rsl2|skilllifecycle)[._][a-z0-9_.]+/u);
    throw new Error(match?.[0]?.replaceAll(".", "_")
      ?? "rsl2_draft_refresh_driver_failed");
  }
  stage("draft_test_wait");
  const testProjection = await window.webContents.executeJavaScript(
    waitForTextTaskScript(lifecycle.testTaskId), true);
  requireTextTaskCompleted(testProjection, "rsl2_draft_test");
  stage("draft_test_fact_wait");
  await waitFor(() => gateway.lifecycleRequests.some((request) =>
    request.kind === "complete_skill_draft_test" && request.status === 200),
  "rsl2_test_fact_completion_timeout");
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  const testFactRuntimeSnapshot = supervisor.snapshot();
  const testFactRuntimeInstanceId = testFactRuntimeSnapshot.coreReady
    ? supervisor.runtimeInstanceId : undefined;
  const testFactCorePid = testFactRuntimeSnapshot.coreReady ? findCoreChildPid() : undefined;
  try {
    await window.webContents.executeJavaScript(
      assertSkillTestPassedScript(lifecycle.skillId), true);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      stage: "rsl2_draft_test_fact_exception",
      errorMessage: String(error instanceof Error ? error.message : error).slice(0, 240),
      runtimeState: supervisor.snapshot().runtimeState,
      runtimeInstanceChanged: supervisor.snapshot().coreReady
        ? supervisor.runtimeInstanceId !== testFactRuntimeInstanceId : undefined,
      corePidChanged: supervisor.snapshot().coreReady
        ? findCoreChildPid() !== testFactCorePid : undefined,
      lifecycleRequests: gateway.lifecycleRequests.slice(-12),
    })}\n`);
    throw error;
  }
  stage("draft_submit_review");
  const submission = await window.webContents.executeJavaScript(
    submitSkillDraftScript(lifecycle.skillId), true);
  const review = await approveSkillReview(gateway.origin);
  stage("install_use");
  let installed;
  try {
    installed = await window.webContents.executeJavaScript(
      installSkillReleaseScript(lifecycle.skillId), true);
    await reloadWindow(window);
    installed = await window.webContents.executeJavaScript(
      useInstalledSkillScript(lifecycle.skillId, installed.releaseRevision,
        created.workspaceGrantId), true);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      stage: "rsl2_install_use_exception",
      errorMessage: String(error instanceof Error ? error.message : error).slice(0, 240),
      errorCode: typeof error === "object" && error !== null
        && "errorCode" in error && typeof error.errorCode === "string"
        ? error.errorCode : "unknown",
      safeSummary: typeof error === "object" && error !== null
        && "safeSummary" in error && typeof error.safeSummary === "string"
        ? error.safeSummary.slice(0, 160) : "unknown",
      operationDiagnostic: await readLatestSkillOperationDiagnostic(directory),
      lifecycleRequests: gateway.lifecycleRequests.slice(-12),
    })}\n`);
    throw error;
  }
  stage("installed_task_wait");
  const useProjection = await window.webContents.executeJavaScript(
    waitForTextTaskScript(installed.taskId), true);
  requireTextTaskCompleted(useProjection, "rsl2_installed_skill_task");
  const [draftDirectory] = await readdir(join(directory, ".robothree", "skills", "drafts"));
  if (draftDirectory === undefined) throw new Error("rsl2_draft_directory_missing");
  const artifact = await stat(join(directory, ".robothree", "skills", "drafts",
    draftDirectory, "rsl2-result.md"));
  if (!artifact.isFile() || artifact.size === 0) throw new Error("rsl2_artifact_missing");
  const markerObserved = gateway.requests.some((request) =>
    JSON.stringify(request).includes("RSL2-E2E-MARKER"));
  if (!markerObserved) throw new Error("rsl2_exact_skill_instruction_missing");
  const firstRuntimeInstanceId = supervisor.runtimeInstanceId;
  const firstCorePid = findCoreChildPid();
  process.kill(firstCorePid, "SIGKILL");
  await observeExitedProcess(firstCorePid);
  await waitForSupervisorRecovery(supervisor, firstRuntimeInstanceId);
  const preferences = window.webContents.getLastWebPreferences();
  return Object.freeze({
    status: "PASS",
    outcome: "MVP_RSL2_SKILL_LIFECYCLE_E2E_CONFORMANT",
    realElectronMain: true,
    realRendererSkillCreatorFlow: true,
    realMainIpc: true,
    realCoreChild: true,
    realSqliteReopen: true,
    realGatewayHttpSse: true,
    realCentralSkillLifecycleHttp: true,
    realAdminReviewHttp: true,
    creatorTaskCompleted: creatorProjection.completed === true,
    draftTestTaskCompleted: testProjection.completed === true,
    immutableSubmissionApproved: submission.submitted === true && review.state === "approved",
    exactInstalledSkillInstructionObserved: markerObserved,
    installedSkillTaskCompleted: useProjection.completed === true,
    wfwArtifactCreated: true,
    mainSkillLifecycleTokenEnvironmentAbsent:
      process.env[rsl2LifecycleTokenEnvironmentName] === undefined,
    firstRuntimeInstanceId,
    secondRuntimeInstanceId: supervisor.runtimeInstanceId,
    firstCorePid,
    sigkillObserved: true,
    sandbox: preferences.sandbox === true,
    contextIsolation: preferences.contextIsolation === true,
    nodeIntegrationDisabled: preferences.nodeIntegration === false,
  });
}

async function runAdminSkillLifecycleFlow({ window, supervisor, gateway, directory }) {
  const stage = (value) => process.stderr.write(`RSL2_ADMIN_STAGE=${value}\n`);
  stage("upload");
  const archive = canonicalSkillZip(Buffer.from(
    "---\nname: enterprise-weekly-brief\ndescription: Enterprise weekly brief skill.\n---\n"
      + "Apply RSL2-ADMIN-E2E-MARKER and produce a concise weekly brief.\n",
    "utf8",
  ));
  const archiveDigest = sha256Bytes(archive);
  const upload = await postAdminSkillArchive(gateway.origin, archive, archiveDigest);
  if (upload.state !== "upload_accepted") throw new Error("rsl2_admin_upload_not_accepted");

  stage("metadata");
  const initial = await getAdminSkillDraft(gateway.origin, upload.skillId);
  if (typeof initial.packageFacts?.packageDigest !== "string"
    || initial.packageFacts.fileCount !== 1) {
    throw new Error("rsl2_admin_package_fact_missing");
  }
  const metadataReceipt = await postAdminSkillJson(gateway.origin,
    `/admin/v1alpha2/skill-lifecycle/enterprise/drafts/${encodeURIComponent(upload.skillId)}/metadata`,
    {
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "update_enterprise_skill_draft_metadata",
      commandId: randomUUID(),
      correlationId: randomUUID(),
      skillId: upload.skillId,
      expectedDraftRevision: initial.draftRevision,
      metadata: {
        displayTitle: "企业周报整理技能",
        displayDescription: "将企业周报资料整理为简洁摘要。",
        semanticVersion: "1.0.0",
        usageScope: "enterprise_all",
        allowedSubjectIds: [],
      },
    });
  if (metadataReceipt.state !== "draft_refreshed"
    && metadataReceipt.state !== "metadata_updated") {
    throw new Error("rsl2_admin_metadata_not_updated");
  }

  stage("test_start");
  const testReceipt = await postAdminSkillJson(gateway.origin,
    `/admin/v1alpha2/skill-lifecycle/enterprise/drafts/${encodeURIComponent(upload.skillId)}/tests`,
    {
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "start_enterprise_skill_draft_test",
      commandId: randomUUID(),
      correlationId: randomUUID(),
      skillId: upload.skillId,
      expectedDraftRevision: metadataReceipt.currentRevision,
      testInput: "请按当前企业技能规则整理一份简洁周报。",
    });
  if (testReceipt.state !== "test_started" || testReceipt.operationId === undefined) {
    throw new Error("rsl2_admin_test_not_started");
  }
  const running = await waitForAdminSkillOperation(
    gateway.origin, testReceipt.operationId, (value) => value.taskId !== undefined);
  stage("test_task_wait");
  const testProjection = await window.webContents.executeJavaScript(
    waitForTextTaskScript(running.taskId), true);
  if (testProjection?.completed !== true) {
    process.stderr.write(`${JSON.stringify({
      stage: "rsl2_admin_test_task_diagnostic",
      taskDiagnostic: readSafeTaskDiagnostic(join(directory, "robothree.sqlite"),
        running.taskId),
      lifecycleRequests: gateway.lifecycleRequests.slice(-12),
      gatewayRequestCount: gateway.requests.length,
    })}\n`);
  }
  requireTextTaskCompleted(testProjection, "rsl2_admin_draft_test");
  const completed = await waitForAdminSkillOperation(
    gateway.origin, testReceipt.operationId,
    (value) => value.state === "succeeded" || value.state === "failed");
  if (completed.state !== "succeeded") throw new Error("rsl2_admin_test_failed");
  await waitForAdminTestMaterialCleanup(
    directory, upload.skillId, metadataReceipt.currentRevision, supervisor);

  stage("publish_install");
  const publish = await postAdminSkillJson(gateway.origin,
    `/admin/v1alpha2/skill-lifecycle/enterprise/drafts/${encodeURIComponent(upload.skillId)}/publish`,
    {
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "publish_enterprise_skill_draft",
      commandId: randomUUID(),
      correlationId: randomUUID(),
      skillId: upload.skillId,
      expectedDraftRevision: metadataReceipt.currentRevision,
    });
  if (publish.state !== "published") throw new Error("rsl2_admin_publish_failed");
  const grant = await window.webContents.executeJavaScript(
    createE2eWorkspaceGrantScript("RSL-2 Admin E2E Workspace"), true);
  let installed = await window.webContents.executeJavaScript(
    installSkillReleaseScript(upload.skillId), true);
  await reloadWindow(window);
  installed = await window.webContents.executeJavaScript(
    useInstalledSkillScript(upload.skillId, installed.releaseRevision,
      grant.workspaceGrantId, "rsl2-admin-result.md"), true);
  const useProjection = await window.webContents.executeJavaScript(
    waitForTextTaskScript(installed.taskId), true);
  requireTextTaskCompleted(useProjection, "rsl2_admin_installed_skill_task");
  const artifact = await stat(join(directory, "rsl2-admin-result.md"));
  if (!artifact.isFile() || artifact.size === 0) throw new Error("rsl2_admin_artifact_missing");
  const markerObserved = gateway.requests.some((request) =>
    JSON.stringify(request).includes("RSL2-ADMIN-E2E-MARKER"));
  if (!markerObserved) throw new Error("rsl2_admin_exact_skill_instruction_missing");

  const databasePath = join(directory, "robothree.sqlite");
  const beforeLock = readTaskSkillLock(databasePath, installed.taskId,
    upload.skillId, installed.releaseRevision);
  const firstRuntimeInstanceId = supervisor.runtimeInstanceId;
  const firstCorePid = findCoreChildPid();
  process.kill(firstCorePid, "SIGKILL");
  await observeExitedProcess(firstCorePid);
  await waitForSupervisorRecovery(supervisor, firstRuntimeInstanceId);
  const afterLock = readTaskSkillLock(databasePath, installed.taskId,
    upload.skillId, installed.releaseRevision);
  if (afterLock !== beforeLock) throw new Error("rsl2_admin_restart_skill_lock_drift");
  const afterRestart = await window.webContents.executeJavaScript(
    waitForTextTaskScript(installed.taskId), true);
  requireTextTaskCompleted(afterRestart, "rsl2_admin_installed_task_after_restart");
  const preferences = window.webContents.getLastWebPreferences();
  return Object.freeze({
    status: "PASS",
    outcome: "MVP_RSL2_ADMIN_UPLOAD_SKILL_E2E_CONFORMANT",
    realElectronMain: true,
    realMainIpc: true,
    realCoreChild: true,
    realSqliteReopen: true,
    realGatewayHttpSse: true,
    realCentralSkillLifecycleHttp: true,
    realAdminUploadHttp: true,
    archiveAdmitted: true,
    packageFactsVisible: initial.packageFacts !== undefined,
    metadataUpdated: true,
    draftTestTaskCompleted: testProjection.completed === true,
    adminDraftPublished: true,
    exactInstalledSkillInstructionObserved: markerObserved,
    installedSkillTaskCompleted: useProjection.completed === true,
    wfwArtifactCreated: true,
    packageScriptExecutionObserved: false,
    mainSkillLifecycleTokenEnvironmentAbsent:
      process.env[rsl2LifecycleTokenEnvironmentName] === undefined,
    firstRuntimeInstanceId,
    secondRuntimeInstanceId: supervisor.runtimeInstanceId,
    firstCorePid,
    sigkillObserved: true,
    sandbox: preferences.sandbox === true,
    contextIsolation: preferences.contextIsolation === true,
    nodeIntegrationDisabled: preferences.nodeIntegration === false,
  });
}

async function postAdminSkillArchive(origin, archive, archiveDigest) {
  const command = {
    contractVersion: "skill-lifecycle.v1alpha1",
    kind: "upload_enterprise_skill_package",
    commandId: randomUUID(),
    correlationId: randomUUID(),
    upload: {
      archiveFileName: "enterprise-weekly-brief.zip",
      archiveFormat: "zip",
      mediaType: "application/zip",
      byteLength: archive.byteLength,
      archiveDigest,
    },
  };
  const form = new FormData();
  form.append("metadata", JSON.stringify(command));
  form.append("archive", new Blob([archive], { type: "application/zip" }),
    command.upload.archiveFileName);
  return fetch(new URL("/admin/v1alpha2/skill-lifecycle/enterprise/uploads", origin), {
    method: "POST", headers: { accept: "application/json" }, body: form,
  }).then(requireJsonResponse);
}

function postAdminSkillJson(origin, path, command) {
  return fetch(new URL(path, origin), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(command),
  }).then(requireJsonResponse);
}

function getAdminSkillDraft(origin, skillId) {
  return fetch(new URL(
    `/admin/v1alpha2/skill-lifecycle/enterprise/drafts/${encodeURIComponent(skillId)}`,
    origin,
  )).then(requireJsonResponse);
}

async function waitForAdminSkillOperation(origin, operationId, predicate) {
  const deadline = Date.now() + 90_000;
  let latest;
  while (Date.now() < deadline) {
    latest = await fetch(new URL(
      `/admin/v1alpha2/skill-lifecycle/enterprise/operations/${encodeURIComponent(operationId)}`,
      origin,
    )).then(requireJsonResponse);
    if (predicate(latest)) return latest;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`rsl2_admin_operation_timeout_${latest?.state ?? "unknown"}`);
}

async function waitForAdminTestMaterialCleanup(directory, skillId, draftRevision, supervisor) {
  const target = join(directory, ".robothree", "skills", ".tests", skillId, draftRevision);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    let absent = false;
    try {
      await stat(target);
    } catch (error) {
      absent = error?.code === "ENOENT";
    }
    if (absent && supervisor.snapshot().runtimeState === "ready") return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error("rsl2_admin_test_material_cleanup_timeout");
}

async function readLatestSkillOperationDiagnostic(directory) {
  try {
    const root = join(directory, ".robothree", "skills", ".state", "operations");
    const names = (await readdir(root)).filter((name) => name.endsWith(".json")).sort();
    const value = JSON.parse(await readFile(join(root, names.at(-1)), "utf8"));
    return {
      operationKind: value.operationKind,
      state: value.state,
      safeReason: typeof value.safeReason === "string" ? value.safeReason.slice(0, 160) : undefined,
    };
  } catch {
    return undefined;
  }
}

function skillCreatorFormDriverScript() {
  return `(async () => {
    const waitFor = async (predicate, code, timeoutMs = 30000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = await predicate(); if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      throw new Error(code);
    };
    const button = (text) => [...document.querySelectorAll("button")]
      .find((item) => item.textContent?.trim() === text);
    if (document.body.innerText.includes("进入本地演示")) {
      const password = document.querySelector("input[name='password']");
      if (!(password instanceof HTMLInputElement)) throw new Error("rsl2_demo_login_missing");
      password.value = "123456"; password.dispatchEvent(new Event("input", { bubbles: true }));
      button("进入演示环境")?.click();
      await waitFor(() => !document.body.innerText.includes("进入本地演示"),
        "rsl2_demo_login_timeout");
      location.hash = "#/intelligence/create-skill";
    }
    await waitFor(() => document.body.innerText.includes("创建技能"), "rsl2_creator_missing");
    const setField = (label, value) => {
      const field = [...document.querySelectorAll("label.r3-field")]
        .find((item) => item.querySelector(".r3-field__label")?.textContent?.trim() === label);
      const control = field?.querySelector("input, textarea");
      if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
        throw new Error("rsl2_field_missing");
      }
      control.value = value; control.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setField("技能名称", "周报整理技能");
    setField("描述", "把工作资料整理为简洁周报。");
    setField("技能主要功能", "读取授权资料，提炼进展、风险和下一步，输出 Markdown。");
    const enter = await waitFor(() => {
      const candidate = button("进入创建对话");
      return candidate && !candidate.disabled ? candidate : undefined;
    }, "rsl2_creator_action_unavailable");
    enter.click();
    await waitFor(() => {
      if (location.hash.includes("#/workbench")) return true;
      const failure = document.querySelector(".intelligence-create__form .r3-inline-notice");
      if (failure?.textContent?.trim()) {
        const summary = failure.textContent.trim();
        if (summary.includes("请求无效")) throw new Error("rsl2_creator_invalid_request");
        if (summary.includes("没有执行此操作的权限")) throw new Error("rsl2_creator_unauthorized");
        if (summary.includes("服务暂时不可用")) throw new Error("rsl2_creator_service_unavailable");
        if (summary.includes("标识已被系统保留")) throw new Error("rsl2_creator_reserved_id");
        if (summary.includes("技能包未通过安全校验")) throw new Error("rsl2_creator_package_invalid");
        if (summary.includes("技能不存在")) throw new Error("rsl2_creator_not_found");
        if (summary.includes("技能已被更新")) throw new Error("rsl2_creator_revision_conflict");
        throw new Error("rsl2_creator_submit_failed");
      }
      return false;
    }, "rsl2_skill_creator_navigation_timeout");
    return true;
  })()`;
}

function skillCreatorTaskAndLifecycleDriverScript() {
  return `(async () => {
    const metadata = () => ({ contractVersion: "v1alpha1", queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(), clientInstanceId: crypto.randomUUID() });
    const deadline = Date.now() + 60000;
    let creatorTask;
    while (Date.now() < deadline) {
      const tasks = await window.robothreeDesktop.listTasks({ ...metadata(), type: "list_tasks",
        limit: 8 });
      if (tasks.ok && tasks.value.length > 0) { creatorTask = tasks.value[0]; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!creatorTask) throw new Error("rsl2_creator_task_missing");
    let created;
    while (Date.now() < deadline) {
      try {
        const page = await window.robothreeSkillLifecycleV1Alpha1.listSkills({
          contractVersion: "skill-lifecycle.v1alpha1", kind: "list_skills",
          queryId: crypto.randomUUID(), correlationId: crypto.randomUUID(),
          scope: "created", limit: 8,
        });
        if (page.items.length === 1) { created = page.items[0]; break; }
      } catch (error) {
        return { errorCode: typeof error?.errorCode === "string"
          ? error.errorCode.replaceAll(".", "_") : "invalid_envelope" };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!created) throw new Error("rsl2_created_draft_missing");
    const grants = await window.robothreeDesktop.listWorkspaceGrants({ ...metadata(),
      type: "list_workspace_grants" });
    const grant = grants.ok ? grants.value.find((item) => item.displayName === "周报整理技能") : undefined;
    if (!grant) throw new Error("rsl2_draft_workspace_missing");
    return { creatorTaskId: creatorTask.taskId, skillId: created.skillId,
      workspaceGrantId: grant.workspaceGrantId };
  })()`;
}

function personalSkillLifecycleDriverScript(workspaceGrantId) {
  return `(async () => {
    const api = window.robothreeSkillLifecycleV1Alpha1;
    const query = (kind) => ({ contractVersion: "skill-lifecycle.v1alpha1", kind,
      queryId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    const command = (kind) => ({ contractVersion: "skill-lifecycle.v1alpha1", kind,
      commandId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    const created = await api.listSkills({ ...query("list_skills"), scope: "created", limit: 8 });
    if (created.items.length !== 1) throw new Error("rsl2_draft_missing");
    const seed = created.items[0];
    try {
      await api.refreshSkillDraft({ ...command("refresh_skill_draft"),
        skillId: seed.skillId, expectedDraftRevision: seed.revision });
    } catch (error) {
      throw new Error("rsl2_refresh_" + String(error?.errorCode ?? "failed").replaceAll(".", "_"));
    }
    let detail;
    try {
      detail = await api.getSkill({ ...query("get_skill"), skillId: seed.skillId,
        sourceKind: "personal_creator" });
    } catch (error) {
      throw new Error("rsl2_detail_" + String(error?.errorCode ?? "failed").replaceAll(".", "_"));
    }
    if (detail.technicalName !== "weekly-brief" || detail.revision === seed.revision
      || detail.packageFacts?.packageDigest === undefined) {
      throw new Error("rsl2_refreshed_identity_missing");
    }
    try {
      await api.startSkillDraftTest({ ...command("start_skill_draft_test"),
        skillId: seed.skillId, expectedDraftRevision: detail.revision,
        testInput: "请使用当前技能整理一段简短周报。" });
    } catch (error) {
      throw new Error("rsl2_start_test_" + String(error?.errorCode ?? "failed").replaceAll(".", "_"));
    }
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const current = await api.getSkill({ ...query("get_skill"), skillId: seed.skillId,
        sourceKind: "personal_creator" });
      const taskId = current.draftTestFact?.taskId;
      if (taskId) return { skillId: seed.skillId, testTaskId: taskId,
        revision: detail.revision, workspaceGrantId: ${JSON.stringify(workspaceGrantId)} };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("rsl2_draft_test_task_missing");
  })()`;
}

function assertSkillTestPassedScript(skillId) {
  return `(async () => {
    const result = await window.robothreeSkillLifecycleV1Alpha1.getSkill({
      contractVersion: "skill-lifecycle.v1alpha1", kind: "get_skill",
      queryId: crypto.randomUUID(), correlationId: crypto.randomUUID(),
      skillId: ${JSON.stringify(skillId)}, sourceKind: "personal_creator",
    });
    if (result.draftTestFact?.state !== "passed") {
      throw new Error("rsl2_test_fact_not_passed");
    }
    return true;
  })()`;
}

function submitSkillDraftScript(skillId) {
  return `(async () => {
    const api = window.robothreeSkillLifecycleV1Alpha1;
    const detail = await api.getSkill({ contractVersion: "skill-lifecycle.v1alpha1",
      kind: "get_skill", queryId: crypto.randomUUID(), correlationId: crypto.randomUUID(),
      skillId: ${JSON.stringify(skillId)}, sourceKind: "personal_creator" });
    const result = await api.submitSkillDraft({ contractVersion: "skill-lifecycle.v1alpha1",
      kind: "submit_skill_draft", commandId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(), skillId: ${JSON.stringify(skillId)},
      expectedDraftRevision: detail.revision, semanticVersion: "1.0.0",
      changeSummary: "RSL-2 E2E release", publicationScope: "enterprise" });
    if (result.submissionId === undefined) {
      throw new Error("rsl2_submission_failed");
    }
    return { submitted: true, submissionId: result.submissionId };
  })()`;
}

async function approveSkillReview(origin) {
  const page = await fetch(new URL(
    "/admin/v1alpha2/skill-lifecycle/submissions?state=pending_review", origin,
  )).then(requireJsonResponse);
  if (!Array.isArray(page.items) || page.items.length !== 1) {
    throw new Error("rsl2_pending_review_missing");
  }
  const submission = page.items[0];
  const receipt = await fetch(new URL(
    "/admin/v1alpha2/skill-lifecycle/submissions/commands", origin,
  ), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "approve_skill_submission",
      commandId: randomUUID(), correlationId: randomUUID(),
      submissionId: submission.submissionId,
      expectedSubmissionRevision: submission.submissionRevision,
    }),
  }).then(requireJsonResponse);
  if (receipt.state !== "approved") throw new Error("rsl2_review_not_approved");
  return { state: receipt.state, releaseRevision: receipt.currentRevision };
}

function installSkillReleaseScript(skillId) {
  return `(async () => {
    const skillApi = window.robothreeSkillLifecycleV1Alpha1;
    const step = async (label, operation) => {
      try { return await operation(); }
      catch (error) {
        throw new Error("rsl2_" + label + "_" + String(error?.errorCode ?? "failed")
          .replaceAll(".", "_"));
      }
    };
    const query = (kind) => ({ contractVersion: "skill-lifecycle.v1alpha1", kind,
      queryId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    const marketplace = await step("marketplace", () => skillApi.listSkills({
      ...query("list_skills"), scope: "marketplace", limit: 8 }));
    const release = marketplace.items.find((item) =>
      item.skillId === ${JSON.stringify(skillId)});
    if (!release) throw new Error("rsl2_release_missing");
    const releaseDetail = await step("release_detail", () => skillApi.getSkill({
      ...query("get_skill"), skillId: release.skillId, revision: release.revision,
      sourceKind: release.sourceKind }));
    const installed = await step("install", () => skillApi.installSkillRelease({
      contractVersion: "skill-lifecycle.v1alpha1", kind: "install_skill_release",
      commandId: crypto.randomUUID(), correlationId: crypto.randomUUID(),
      skillId: release.skillId, releaseRevision: release.revision,
      packageDigest: releaseDetail.packageFacts.packageDigest, mode: "install_exact",
    }));
    if (installed.operationId) {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const operation = await step("install_query", () => skillApi.querySkillOperation({
          ...query("query_skill_operation"), operationId: installed.operationId }));
        if (operation.state === "succeeded") break;
        if (operation.state === "failed") throw new Error("rsl2_install_failed");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    return { releaseRevision: release.revision };
  })()`;
}

function useInstalledSkillScript(skillId, releaseRevision, workspaceGrantId,
  outputFileName = "rsl2-result.md") {
  return `(async () => {
    const step = async (label, operation) => {
      try { return await operation(); }
      catch (error) {
        throw new Error("rsl2_" + label + "_" + String(error?.errorCode ?? error?.code ?? "failed")
          .replaceAll(".", "_"));
      }
    };
    const clientInstanceId = crypto.randomUUID();
    const compatibility = await window.robothreeDesktopV1Alpha5.getCompatibility({
      contractVersion: "v1alpha5", queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(), clientInstanceId,
      supportedContractVersions: ["v1alpha5", "v1alpha4", "v1alpha3", "v1alpha2", "v1alpha1"],
    });
    if (!compatibility.ok) throw new Error("rsl2_use_compatibility_"
      + String(compatibility.error?.code ?? "unknown").replaceAll(".", "_"));
    const meta = () => ({ contractVersion: "v1alpha1", commandId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(), clientInstanceId: crypto.randomUUID() });
    const session = await step("use_session", () => window.robothreeDesktop.createSession({
      ...meta(), type: "create_session", title: "RSL-2 installed Skill Task" }));
    if (!session.ok) throw new Error("rsl2_use_session_failed");
    const submitted = await step("use_submit", () => window.robothreeDesktopV1Alpha5.submitTurn({
      contractVersion: "v1alpha5", commandId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(), clientInstanceId,
      type: "submit_turn", clientTurnId: "rsl2-use-" + crypto.randomUUID(),
      sessionId: session.value.sessionId,
      userInput: ${JSON.stringify(`使用已安装技能生成 ${outputFileName}。`)},
      selectionRequest: { agentId: "agent.general", selectedSkillIds: [${JSON.stringify(skillId)}],
        selectedKnowledgeIds: [], workspaceGrantId: ${JSON.stringify(workspaceGrantId)},
        authorizationPreference: { schemaVersion: "v1alpha1", requestedMode: "manual_review" },
        reasoningPreference: { requestedMode: "default" } },
    }));
    if (!submitted.ok) throw new Error("rsl2_use_submit_failed_"
      + String(submitted.error?.code ?? "unknown").replaceAll(".", "_"));
    return { taskId: submitted.value.taskId, releaseRevision: ${JSON.stringify(releaseRevision)} };
  })()`;
}

function createE2eWorkspaceGrantScript(displayName) {
  return `(async () => {
    const result = await window.robothreeDesktop.createWorkspaceGrantFromPicker({
      commandId: crypto.randomUUID(), correlationId: crypto.randomUUID(),
      clientInstanceId: crypto.randomUUID(), displayName: ${JSON.stringify(displayName)},
      accessMode: "read_write",
    });
    if (!result.ok || result.value === undefined) {
      throw new Error("rsl2_admin_workspace_grant_failed");
    }
    return { workspaceGrantId: result.value.workspaceGrantId };
  })()`;
}

function reloadWindow(window) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      rejectPromise(new Error("rsl2_renderer_reload_timeout"));
    }, 30_000);
    window.webContents.once("did-finish-load", () => {
      clearTimeout(timeout);
      resolvePromise();
    });
    window.webContents.reload();
  });
}

function waitForRobotDraftTestPassedScript(robotId) {
  return `(async () => {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const result = await window.robothreeAgentLifecycleV1Alpha1.getMyRobotDraft({
        contractVersion: "agent-lifecycle.v1alpha1",
        kind: "get_my_robot_draft",
        queryId: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        robotId: ${JSON.stringify(robotId)},
      });
      if (result.ok && result.value.testState === "passed") return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("rsl1_passed_test_fact_timeout");
  })()`;
}

function robotLifecycleDraftDriverScript() {
  return `(async () => {
    const waitFor = async (predicate, code, timeoutMs = 30000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = await predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      throw new Error(code);
    };
    const setField = (label, value) => {
      const field = [...document.querySelectorAll("label.r3-field")]
        .find((item) => item.querySelector(".r3-field__label")?.textContent?.trim() === label);
      const control = field?.querySelector("input, textarea");
      if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
        throw new Error("rsl1_field_missing_" + label);
      }
      control.value = value;
      control.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const button = (text) => [...document.querySelectorAll("button")]
      .find((item) => item.textContent?.trim() === text);
    await waitFor(() => document.body.innerText.includes("创建机器人")
      || document.body.innerText.includes("进入本地演示"), "rsl1_entry_timeout");
    if (document.body.innerText.includes("进入本地演示")) {
      const password = document.querySelector("input[name='password']");
      if (!(password instanceof HTMLInputElement)) throw new Error("rsl1_demo_login_missing");
      password.value = "123456";
      password.dispatchEvent(new Event("input", { bubbles: true }));
      const enter = button("进入演示环境");
      if (!(enter instanceof HTMLButtonElement)) throw new Error("rsl1_demo_login_button_missing");
      enter.click();
      await waitFor(() => !document.body.innerText.includes("进入本地演示"),
        "rsl1_demo_login_timeout");
      location.hash = "#/intelligence/create-robot";
    }
    await waitFor(() => document.body.innerText.includes("创建机器人"), "rsl1_creator_timeout");
    const firstSave = await waitFor(() => {
      const candidate = button("保存草稿");
      return candidate && !candidate.disabled ? candidate : undefined;
    }, "rsl1_lifecycle_connection_timeout");
    setField("机器人名称", "合同审阅助手");
    setField("简介", "帮助用户审阅合同并给出清晰建议。");
    setField("行为与规则", "只依据用户提供的信息，不编造条款。");
    firstSave.click();
    await waitFor(() => document.body.innerText.includes("草稿已保存")
      || document.body.innerText.includes("操作未完成"), "rsl1_first_save_timeout");
    if (document.body.innerText.includes("操作未完成")) {
      const diagnostic = await window.robothreeAgentLifecycleV1Alpha1.listMyRobotDrafts({
        contractVersion: "agent-lifecycle.v1alpha1",
        kind: "list_my_robot_drafts",
        queryId: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
      });
      const notice = document.querySelector(".r3-inline-notice__body")?.textContent?.trim();
      const safeDiagnostic = diagnostic.ok ? "unexpected_success" : diagnostic.error.errorCode;
      const encoded = [...new TextEncoder().encode(safeDiagnostic + ":" + (notice ?? "unknown"))]
        .map((value) => value.toString(16).padStart(2, "0")).join("");
      throw new Error("rsl1_first_save_failed." + encoded);
    }
    const query = () => ({ contractVersion: "agent-lifecycle.v1alpha1", kind: "list_my_robot_drafts",
      queryId: crypto.randomUUID(), correlationId: crypto.randomUUID() });
    const firstPage = await window.robothreeAgentLifecycleV1Alpha1.listMyRobotDrafts(query());
    if (!firstPage.ok || firstPage.value.items.length !== 1) throw new Error("rsl1_first_revision_missing");
    const firstRevision = firstPage.value.items[0].draftRevision;
    setField("简介", "帮助用户审阅合同并给出清晰、可追溯的建议。");
    setField("行为与规则", "只依据用户提供的信息给出建议；明确标注不确定内容，不编造条款。");
    await new Promise((resolve) => setTimeout(resolve, 0));
    button("保存草稿")?.click();
    const secondSave = await waitFor(async () => {
      if (document.body.innerText.includes("操作未完成")) return "failed";
      const page = await window.robothreeAgentLifecycleV1Alpha1.listMyRobotDrafts(query());
      return page.ok && page.value.items[0]?.draftRevision !== firstRevision ? "saved" : undefined;
    }, "rsl1_second_save_timeout");
    if (secondSave === "failed") {
      const notice = document.querySelector(".r3-inline-notice__body")?.textContent?.trim();
      const encoded = [...new TextEncoder().encode(notice ?? "unknown")]
        .map((value) => value.toString(16).padStart(2, "0")).join("");
      throw new Error("rsl1_second_save_failed." + encoded);
    }
    const secondPage = await window.robothreeAgentLifecycleV1Alpha1.listMyRobotDrafts(query());
    const item = secondPage.ok ? secondPage.value.items[0] : undefined;
    if (!item || item.draftRevision === firstRevision) throw new Error("rsl1_second_revision_missing");
    const run = await waitFor(() => {
      const candidate = button("运行测试");
      return candidate && !candidate.disabled ? candidate : undefined;
    }, "rsl1_test_button_unavailable");
    run.click();
    const detailQuery = () => ({
      contractVersion: "agent-lifecycle.v1alpha1",
      kind: "get_my_robot_draft",
      queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      robotId: item.robotId,
    });
    const testStart = await waitFor(async () => {
      if (document.body.innerText.includes("操作未完成")) return { state: "failed" };
      const detail = await window.robothreeAgentLifecycleV1Alpha1.getMyRobotDraft(detailQuery());
      if (!detail.ok) return undefined;
      const taskId = detail.value.testFact?.taskId;
      return taskId === undefined ? undefined : { state: "started", taskId };
    }, "rsl1_test_fact_timeout");
    if (testStart.state === "failed") {
      const notice = document.querySelector(".r3-inline-notice__body")?.textContent?.trim();
      const encoded = [...new TextEncoder().encode(notice ?? "unknown")]
        .map((value) => value.toString(16).padStart(2, "0")).join("");
      throw new Error("rsl1_test_start_failed." + encoded);
    }
    return { robotId: item.robotId, name: item.name, firstRevision,
      draftRevision: item.draftRevision, taskId: testStart.taskId,
      realRendererCreatorFlow: document.querySelector("#app") !== null };
  })()`;
}

function robotLifecycleSubmitDriverScript(robotId) {
  return `(async () => {
    const waitFor = async (predicate, code, timeoutMs = 30000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = await predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(code);
    };
    const detailQuery = () => ({ contractVersion: "agent-lifecycle.v1alpha1",
      kind: "get_my_robot_draft", queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(), robotId: ${JSON.stringify(robotId)} });
    await waitFor(async () => {
      const result = await window.robothreeAgentLifecycleV1Alpha1.getMyRobotDraft(detailQuery());
      return result.ok && result.value.testState === "passed";
    }, "rsl1_passed_test_fact_timeout", 60000);
    const refresh = await waitFor(() => {
      const candidate = [...document.querySelectorAll("button")]
        .find((item) => item.textContent?.trim() === "刷新状态");
      return candidate && !candidate.disabled ? candidate : undefined;
    }, "rsl1_refresh_button_unavailable");
    refresh.click();
    const submit = await waitFor(() => {
      const candidate = [...document.querySelectorAll("button")]
        .find((item) => item.textContent?.trim() === "提交发布");
      return candidate && !candidate.disabled ? candidate : undefined;
    }, "rsl1_submit_button_unavailable");
    submit.click();
    await waitFor(() => document.body.innerText.includes("已提交企业发布审核"),
      "rsl1_submission_timeout");
    const detail = await window.robothreeAgentLifecycleV1Alpha1.getMyRobotDraft(detailQuery());
    return { submitted: detail.ok && detail.value.submissionState === "pending_review" };
  })()`;
}

async function approveRobotReview(origin) {
  const page = await fetch(new URL(
    "/admin/v1alpha2/robot-reviews?state=pending_review",
    origin,
  )).then(requireJsonResponse);
  if (!Array.isArray(page.items) || page.items.length !== 1) {
    throw new Error("rsl1_pending_review_missing");
  }
  const summary = page.items[0];
  const detail = await fetch(new URL(
    `/admin/v1alpha2/robot-reviews/${encodeURIComponent(summary.submissionId)}`,
    origin,
  )).then(requireJsonResponse);
  const command = {
    contractVersion: "agent-lifecycle.v1alpha1",
    kind: "approve_robot_review",
    commandId: randomUUID(),
    correlationId: randomUUID(),
    submissionId: summary.submissionId,
    expectedSubmissionRevision: summary.submissionRevision,
  };
  const receipt = await fetch(new URL(
    "/admin/v1alpha2/robot-reviews/commands",
    origin,
  ), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(command),
  }).then(requireJsonResponse);
  if (receipt.state !== "approved") throw new Error("rsl1_review_not_approved");
  return {
    state: receipt.state,
    agentRevision: detail.agentPackage.agentDefinition.revision,
    releaseRevision: receipt.currentRevision,
  };
}

async function requireJsonResponse(response) {
  const document = await response.json();
  if (!response.ok) throw new Error(document?.errorCode ?? "rsl1_central_request_failed");
  return document;
}

function publishedRobotWorkbenchDriverScript(robotId, robotName) {
  return `(async () => {
    const waitFor = async (predicate, code, timeoutMs = 30000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = await predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(code);
    };
    await waitFor(() => document.body.innerText.includes("今天想完成什么？"),
      "rsl1_workbench_timeout");
    const resourceTrigger = document.querySelector('[aria-label="添加文件或选择资源"]');
    if (!(resourceTrigger instanceof HTMLButtonElement)) throw new Error("rsl1_resource_menu_missing");
    resourceTrigger.click();
    const robotMenu = await waitFor(() => [...document.querySelectorAll("button")]
      .find((item) => item.querySelector("strong")?.textContent?.trim() === "机器人"),
    "rsl1_robot_menu_missing");
    robotMenu.click();
    const robot = await waitFor(() => [...document.querySelectorAll('[aria-label="机器人选择"] button')]
      .find((item) => item.textContent?.includes(${JSON.stringify(robotName)}) && !item.disabled),
      "rsl1_published_robot_missing");
    robot.click();
    const modelTrigger = document.querySelector(".workbench-page__model-trigger");
    if (!(modelTrigger instanceof HTMLButtonElement)) throw new Error("rsl1_model_menu_missing");
    modelTrigger.click();
    const model = await waitFor(() => [...document.querySelectorAll(
      '[aria-label="模型选择"] .workbench-page__model-list button')]
      .find((item) => !item.disabled), "rsl1_published_model_missing");
    model.click();
    const textarea = document.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("rsl1_workbench_composer_missing");
    textarea.value = "请按你的审阅规则给出一段简短的合同审阅建议。";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    let submit;
    try {
      submit = await waitFor(() => [...document.querySelectorAll("button")]
        .find((item) => item.textContent?.includes("提交任务") && !item.disabled),
        "rsl1_published_task_submit_unavailable");
    } catch {
      const candidate = [...document.querySelectorAll("button")]
        .find((item) => item.textContent?.includes("提交任务"));
      const diagnostic = [candidate?.getAttribute("title") ?? "no-title",
        document.querySelector(".workbench-page__model-trigger strong")?.textContent ?? "no-model"]
        .join(":");
      const encoded = [...new TextEncoder().encode(diagnostic)]
        .map((value) => value.toString(16).padStart(2, "0")).join("");
      throw new Error("rsl1_published_task_submit_unavailable." + encoded);
    }
    const metadata = () => ({ contractVersion: "v1alpha1",
      queryId: crypto.randomUUID(), correlationId: crypto.randomUUID(),
      clientInstanceId: crypto.randomUUID() });
    const beforeTasks = await window.robothreeDesktop.listTasks({
      ...metadata(), type: "list_tasks", limit: 8,
    });
    if (!beforeTasks.ok) throw new Error("rsl1_published_task_baseline_missing");
    submit.click();
    const tasks = await waitFor(async () => {
      const result = await window.robothreeDesktop.listTasks({
        ...metadata(), type: "list_tasks", limit: 8,
      });
      return result.ok && result.value.length > beforeTasks.value.length ? result : undefined;
    }, "rsl1_published_task_receipt_timeout");
    const sessions = await window.robothreeDesktop.listSessions({
      ...metadata(), type: "list_sessions",
    });
    if (tasks.value.length === 0 || !sessions.ok) {
      throw new Error("rsl1_published_task_missing");
    }
    const task = tasks.value[0];
    const session = sessions.value.find((item) => item.sessionId === task.sessionId);
    if (!session) throw new Error("rsl1_published_session_missing");
    return { taskId: task.taskId, sessionId: session.sessionId,
      robotId: ${JSON.stringify(robotId)} };
  })()`;
}

function waitForTextTaskScript(taskId) {
  return `(async () => {
    const metadata = () => ({ contractVersion: "v1alpha1", queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(), clientInstanceId: crypto.randomUUID() });
    const deadline = Date.now() + 60000;
    let latest = "unknown";
    while (Date.now() < deadline) {
      const detail = await window.robothreeDesktop.loadTaskDetail({ ...metadata(),
        type: "task_detail", taskId: ${JSON.stringify(taskId)} });
      latest = detail.ok ? detail.value.summary.displayStatus : detail.error.code;
      if (latest === "completed") return { completed: true, status: latest };
      if (["failed", "cancelled", "timed_out", "manual_attention"].includes(latest)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { completed: false, status: latest };
  })()`;
}

function requireTextTaskCompleted(value, stage) {
  if (value?.completed === true) return;
  process.stderr.write(`${JSON.stringify({ stage, taskStatus: value?.status ?? "unknown" })}\n`);
  throw new Error("rsl1_text_task_not_completed");
}

function readTaskAgentLock(databasePath, desktopTaskId) {
  const taskId = desktopTaskId.startsWith("task:")
    ? desktopTaskId.slice("task:".length)
    : desktopTaskId;
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database.prepare(`
      SELECT agent_definition_id, agent_revision, selection_digest
      FROM task_runtime_selections WHERE task_id = ?
    `).get(taskId);
    if (row === undefined) throw new Error("rsl1_task_lock_missing");
    return {
      agentDefinitionId: row.agent_definition_id,
      agentRevision: row.agent_revision,
      selectionDigest: row.selection_digest,
    };
  } finally {
    database.close();
  }
}

function readTaskSkillLock(databasePath, desktopTaskId, skillId, releaseRevision) {
  const taskId = desktopTaskId.startsWith("task:")
    ? desktopTaskId.slice("task:".length)
    : desktopTaskId;
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database.prepare(`
      SELECT selection_json
      FROM task_runtime_selections WHERE task_id = ?
    `).get(taskId);
    if (row === undefined || typeof row.selection_json !== "string") {
      throw new Error("rsl2_admin_task_selection_missing");
    }
    const selection = JSON.parse(row.selection_json);
    const reference = Array.isArray(selection.activeSkillRevisions)
      ? selection.activeSkillRevisions.find((item) => item?.skillId === skillId)
      : undefined;
    if (reference === undefined) throw new Error("rsl2_admin_task_skill_id_missing");
    if (reference.revision !== releaseRevision) {
      throw new Error("rsl2_admin_task_skill_revision_mismatch");
    }
    return row.selection_json;
  } finally {
    database.close();
  }
}

function readSafeTaskDiagnostic(databasePath, desktopTaskId) {
  const taskId = desktopTaskId.startsWith("task:")
    ? desktopTaskId.slice("task:".length)
    : desktopTaskId;
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    const checkpoint = database.prepare(`
      SELECT state_json
      FROM task_checkpoints
      WHERE task_id = ?
      ORDER BY state_revision DESC
      LIMIT 1
    `).get(taskId);
    if (checkpoint === undefined) return { state: "checkpoint_missing" };
    const persisted = JSON.parse(checkpoint.state_json);
    const error = persisted?.state?.terminalError;
    const activeRun = persisted?.state?.runs?.find(
      (run) => run?.runId === persisted?.state?.activeRunId,
    );
    const activeStep = activeRun?.steps?.find(
      (step) => step?.stepId === activeRun?.activeStepId,
    );
    const submitTurn = database.prepare(`
      SELECT status, record_json
      FROM submit_turn_records
      WHERE submit_turn_command_id = (
        SELECT submit_turn_command_id
        FROM task_submit_turn_bindings
        WHERE task_id = ?
      )
      LIMIT 1
    `).get(taskId);
    const dispositions = database.prepare(`
      SELECT disposition, COUNT(*) AS count
      FROM tool_call_dispositions
      WHERE batch_id IN (
        SELECT batch_id FROM tool_call_batches WHERE task_id = ?
      )
      GROUP BY disposition
      ORDER BY disposition
    `).all(taskId);
    const conversationFacts = database.prepare(`
      SELECT
        COUNT(*) AS message_count,
        SUM(CASE WHEN json_extract(message_json, '$.message.role') = 'assistant'
          THEN 1 ELSE 0 END) AS assistant_count
      FROM conversation_messages
      WHERE task_id = ?
    `).get(taskId);
    const invocationFacts = database.prepare(`
      SELECT
        COUNT(*) AS invocation_count,
        SUM(CASE WHEN output_started_at IS NOT NULL THEN 1 ELSE 0 END)
          AS output_started_count,
        SUM(CASE WHEN message_committed_at IS NOT NULL THEN 1 ELSE 0 END)
          AS message_committed_count
      FROM model_invocation_links
      WHERE task_id = ?
    `).get(taskId);
    const invocationMessageFacts = database.prepare(`
      SELECT
        COUNT(*) AS persisted_count,
        SUM(CASE WHEN messages.task_id = links.task_id THEN 1 ELSE 0 END)
          AS task_identity_match_count
      FROM model_invocation_links AS links
      LEFT JOIN conversation_messages AS messages
        ON messages.message_id = links.assistant_message_id
      WHERE links.task_id = ?
        AND messages.message_id IS NOT NULL
    `).get(taskId);
    const deliveryFacts = database.prepare(`
      SELECT COUNT(*) AS delivery_count
      FROM desktop_delivery_records
      WHERE json_extract(delivery_json, '$.taskId') = ?
    `).get(`task:${taskId}`);
    return {
      state: "checkpoint_found",
      status: safeDiagnosticToken(persisted?.state?.status),
      activeRunStatus: safeDiagnosticToken(activeRun?.status),
      activeStepStatus: safeDiagnosticToken(activeStep?.status),
      submitTurnStatus: safeDiagnosticToken(submitTurn?.status),
      submitTurnLoopStarted: (() => {
        try {
          return typeof submitTurn?.record_json === "string"
            && typeof JSON.parse(submitTurn.record_json)?.loopStartedAt === "string";
        } catch {
          return false;
        }
      })(),
      waitReason: safeDiagnosticToken(activeStep?.wait?.reason),
      waitErrorCode: safeDiagnosticToken(activeStep?.wait?.context?.errorCode),
      waitDetailCode: safeDiagnosticToken(activeStep?.wait?.context?.detailCode),
      toolCallDispositions: dispositions.map((row) => ({
        disposition: safeDiagnosticToken(row.disposition),
        count: Number.isSafeInteger(row.count) ? row.count : 0,
      })),
      taskMessageCount: Number(conversationFacts?.message_count ?? 0),
      taskAssistantCount: Number(conversationFacts?.assistant_count ?? 0),
      invocationCount: Number(invocationFacts?.invocation_count ?? 0),
      invocationOutputStartedCount: Number(
        invocationFacts?.output_started_count ?? 0,
      ),
      invocationMessageCommittedCount: Number(
        invocationFacts?.message_committed_count ?? 0,
      ),
      invocationAssistantPersistedCount: Number(
        invocationMessageFacts?.persisted_count ?? 0,
      ),
      invocationAssistantTaskMatchCount: Number(
        invocationMessageFacts?.task_identity_match_count ?? 0,
      ),
      deliveryCount: Number(deliveryFacts?.delivery_count ?? 0),
      terminalError: error === undefined ? undefined : {
        code: safeDiagnosticToken(error.code),
        category: safeDiagnosticToken(error.category),
        retryable: error.retryable === true,
      },
    };
  } catch {
    return { state: "checkpoint_unavailable" };
  } finally {
    database?.close();
  }
}

function safeDiagnosticToken(value) {
  return typeof value === "string" && /^[a-z0-9_.-]{1,96}$/u.test(value)
    ? value
    : "unknown";
}

function registerRouters(supervisor, handlers, workspacePath, authorizedWebContentsId) {
  const privateRootPath = join(workspacePath, ".robothree");
  const skillDraftWorkspaces = new SkillDraftWorkspaceService({
    privateRootPath,
    onSynced: () => supervisor.restart(),
  });
  const skillInstallations = new SkillInstallationService({
    privateRootPath,
    onInstalled: () => supervisor.restart(),
  });
  const adminSkillTests = new AdminSkillDraftTestCoordinator({
    core: supervisor,
    installations: skillInstallations,
  });
  adminSkillTests.start();
  const skillLocalDiscovery = new SkillLocalDiscoveryService({
    privateRootPath,
    onChanged: () => supervisor.restart(),
  });
  const base = new DesktopIpcRouter({
    core: {
      get client() { return supervisor.client; },
      snapshot: () => supervisor.snapshot(),
    },
    chooseWorkspaceDirectory: async () => workspacePath,
  });
  for (const channel of Object.values(DESKTOP_IPC_CHANNELS)) {
    if (channel === DESKTOP_IPC_CHANNELS.desktopEvent) continue;
    ipcMain.handle(channel, (_event, input) => base.dispatch(channel, input));
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
  const lifecycle = new AgentLifecycleV1Alpha1IpcRouter({
    resolveConnection: () => supervisor.connectionLease(),
    isCurrentConnection: (lease) => supervisor.isCurrentConnectionLease(lease),
    isAuthorizedWebContents: (webContentsId) =>
      webContentsId === authorizedWebContentsId(),
  });
  for (const channel of Object.values(AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS)) {
    ipcMain.handle(channel, (event, input) => lifecycle.dispatch(channel, input, event));
    handlers.push(channel);
  }
  const skillLifecycle = new SkillLifecycleV1Alpha1IpcRouter({
    resolveConnection: () => supervisor.connectionLease(),
    isCurrentConnection: (lease) => supervisor.isCurrentConnectionLease(lease),
    isAuthorizedWebContents: (webContentsId) =>
      webContentsId === authorizedWebContentsId(),
    draftWorkspaces: skillDraftWorkspaces,
    installations: skillInstallations,
    localDiscovery: skillLocalDiscovery,
  });
  for (const channel of Object.values(SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS)) {
    ipcMain.handle(channel, (event, input) => skillLifecycle.dispatch(channel, input, event));
    handlers.push(channel);
  }
  return { v1alpha4, v1alpha5, taskReasoning, lifecycle, skillLifecycle,
    adminSkillTests };
}

async function loadTaskRoute(window, taskId, sessionId) {
  await window.loadFile(join(root, "apps/desktop/dist/renderer/index.html"), {
    hash: `/tasks?sessionId=${encodeURIComponent(sessionId)}&taskId=${encodeURIComponent(taskId)}`,
  });
}

async function navigateRendererHash(window, hash) {
  await window.webContents.executeJavaScript(
    `location.hash = ${JSON.stringify(`#${hash}`)}`,
    true,
  );
}

function workbenchDriverScript(modelId) {
  return `(async () => {
    const waitFor = async (predicate, code, timeoutMs = 20000) => {
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
      if (!(select instanceof HTMLSelectElement)) throw new Error("vs1_select_missing");
      if (![...select.options].some((option) => option.value === value && !option.disabled)) {
        throw new Error("vs1_select_option_missing");
      }
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };
    await waitFor(() => document.body.innerText.includes("今天想完成什么？"),
      "vs1_workbench_dom_timeout");
    await waitFor(() => button("选择空间") && !button("选择空间").disabled,
      "vs1_workspace_picker_unavailable");
    button("选择空间").click();
    await waitFor(() => {
      const select = [...document.querySelectorAll("label.r3-field")]
        .find((item) => item.textContent.includes("工作区"))?.querySelector("select");
      return select instanceof HTMLSelectElement && select.options.length > 0;
    }, "vs1_workspace_grant_timeout");
    selectByLabel("专项机器人（可选）", "agent.presentation");
    await waitFor(() => document.body.innerText.includes("演示文稿助手")
      && document.querySelector("[aria-label='技能选择'] input"),
    "vs1_presentation_agent_unavailable");
    selectByLabel("模型", ${JSON.stringify(modelId)});
    const skill = await waitFor(() => document.querySelector(
      "[aria-label='技能选择'] input"),
      "vs1_presentation_skill_unavailable");
    if (!(skill instanceof HTMLInputElement)) throw new Error("vs1_skill_input_invalid");
    if (!skill.checked) skill.click();
    const textarea = document.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("vs1_composer_missing");
    textarea.value = "请必须调用已提供的 PPTX 创建工具，生成一份两页项目汇报演示文稿，并保存为项目汇报.pptx。不要只回复制作建议。";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const submit = await waitFor(() => {
      const candidate = [...document.querySelectorAll("button")]
        .find((item) => item.textContent?.includes("提交任务"));
      return candidate && !candidate.disabled ? candidate : undefined;
    }, "vs1_submit_unavailable");
    submit.click();
    await waitFor(() => document.body.innerText.includes("任务已提交"),
      "vs1_submit_receipt_timeout");
    const meta = () => ({
      contractVersion: "v1alpha1", queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(), clientInstanceId: crypto.randomUUID(),
    });
    const tasks = await window.robothreeDesktop.listTasks({
      ...meta(), type: "list_tasks", limit: 8,
    });
    const sessions = await window.robothreeDesktop.listSessions({
      ...meta(), type: "list_sessions",
    });
    if (!tasks.ok || tasks.value.length === 0 || !sessions.ok) {
      throw new Error("vs1_submitted_task_missing");
    }
    const task = tasks.value[0];
    const session = sessions.value.find((item) => item.sessionId === task.sessionId);
    if (!session) throw new Error("vs1_submitted_session_missing");
    return {
      taskId: task.taskId,
      sessionId: session.sessionId,
      realRendererWorkbench: document.querySelector("#app") !== null,
      agentSelected: document.body.innerText.includes("演示文稿助手"),
      skillSelected: skill.checked,
      modelSelected: [...document.querySelectorAll("select")]
        .some((item) => item.value === ${JSON.stringify(modelId)}),
      rendererSensitiveEnvironmentAbsent:
        !("ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT" in window)
        && !("ROBOTHREE_INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN" in window)
        && typeof window.process === "undefined",
    };
  })()`;
}

function multiTurnConversationDriverScript(modelId) {
  return `(async () => {
    const wait = (milliseconds) => new Promise((resolve) =>
      setTimeout(resolve, milliseconds));
    const randomId = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      (character) => {
        const value = Math.floor(Math.random() * 16);
        return (character === "x" ? value : (value & 3) | 8).toString(16);
      },
    );
    const meta = (contractVersion = "v1alpha1") => ({
      contractVersion,
      queryId: randomId(),
      correlationId: randomId(),
      clientInstanceId,
    });
    const clientInstanceId = randomId();
    const commandClientInstanceId = randomId();
    const compatibility = await window.robothreeDesktopV1Alpha5.getCompatibility({
      contractVersion: "v1alpha5",
      queryId: randomId(),
      correlationId: randomId(),
      clientInstanceId,
      supportedContractVersions: ["v1alpha5", "v1alpha4", "v1alpha3", "v1alpha2", "v1alpha1"],
    });
    if (!compatibility.ok
      || compatibility.value.selectedContractVersion !== "v1alpha5"
      || !compatibility.value.features.some((feature) =>
        feature.feature === "max_reasoning_mode_core" && feature.state === "available")) {
      return {
        conformant: false,
        errorCode: compatibility.ok
          ? "compatibility_unavailable"
          : compatibility.error.code,
      };
    }
    const created = await window.robothreeDesktop.createSession({
      contractVersion: "v1alpha1",
      commandId: randomId(),
      correlationId: randomId(),
      clientInstanceId: commandClientInstanceId,
      type: "create_session",
      title: "五轮连续对话验证",
    });
    if (!created.ok) {
      return { conformant: false, errorCode: created.error.code };
    }
    const sessionId = created.value.sessionId;
    let completedTurnCount = 0;
    let assistantMessageCount = 0;
    const prompts = [
      "这是连续对话第 1 轮，请只回复：第1轮收到。",
      "这是连续对话第 2 轮，请只回复：第2轮收到。",
      "这是连续对话第 3 轮，请只回复：第3轮收到。",
      "这是连续对话第 4 轮，请只回复：第4轮收到。",
      "这是连续对话第 5 轮，请只回复：第5轮收到。",
    ];
    for (let index = 0; index < prompts.length; index += 1) {
      const submitted = await window.robothreeDesktopV1Alpha5.submitTurn({
        contractVersion: "v1alpha5",
        commandId: randomId(),
        correlationId: randomId(),
        clientInstanceId,
        type: "submit_turn",
        clientTurnId: "turn:" + randomId(),
        sessionId,
        userInput: prompts[index],
        selectionRequest: {
          agentId: "agent.general",
          requestedModelId: ${JSON.stringify(modelId)},
          selectedSkillIds: [],
          selectedKnowledgeIds: [],
          authorizationPreference: {
            schemaVersion: "v1alpha1",
            requestedMode: "manual_review",
          },
          reasoningPreference: { requestedMode: "default" },
        },
      });
      if (!submitted.ok) {
        return {
          conformant: false,
          sessionId,
          completedTurnCount,
          assistantMessageCount,
          failedTurn: index + 1,
          errorCode: submitted.error.code,
        };
      }
      const taskId = submitted.value.taskId;
      const deadline = Date.now() + 90000;
      let taskStatus = "queued";
      while (Date.now() < deadline) {
        const detail = await window.robothreeDesktop.loadTaskDetail({
          ...meta(),
          type: "task_detail",
          taskId,
        });
        if (!detail.ok) {
          return {
            conformant: false,
            sessionId,
            completedTurnCount,
            assistantMessageCount,
            failedTurn: index + 1,
            errorCode: detail.error.code,
          };
        }
        taskStatus = detail.value.summary.displayStatus;
        if (taskStatus === "completed") break;
        if (["failed", "cancelled", "timed_out", "manual_attention"]
          .includes(taskStatus)) {
          return {
            conformant: false,
            sessionId,
            completedTurnCount,
            assistantMessageCount,
            failedTurn: index + 1,
            taskId,
            taskStatus,
          };
        }
        await wait(100);
      }
      if (taskStatus !== "completed") {
        return {
          conformant: false,
          sessionId,
          completedTurnCount,
          assistantMessageCount,
          failedTurn: index + 1,
          taskId,
          taskStatus: "timeout:" + taskStatus,
        };
      }
      const snapshot = await window.robothreeDesktop.loadConversationSnapshot({
        ...meta(),
        type: "conversation_snapshot",
        sessionId,
        limit: 100,
      });
      if (!snapshot.ok) {
        return {
          conformant: false,
          sessionId,
          completedTurnCount,
          assistantMessageCount,
          failedTurn: index + 1,
          errorCode: snapshot.error.code,
        };
      }
      assistantMessageCount = snapshot.value.messages.filter((message) =>
        message.role === "assistant"
        && message.status === "completed"
        && message.content.trim().length > 0).length;
      if (assistantMessageCount !== index + 1) {
        return {
          conformant: false,
          sessionId,
          completedTurnCount,
          assistantMessageCount,
          failedTurn: index + 1,
          errorCode: "assistant_reply_missing",
        };
      }
      completedTurnCount = index + 1;
    }
    return {
      conformant: completedTurnCount === 5 && assistantMessageCount === 5,
      sessionId,
      completedTurnCount,
      assistantMessageCount,
    };
  })()`;
}

function confirmationDriverScript(taskId) {
  return `(async () => {
    const waitFor = async (predicate, timeoutMs = 20000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const value = predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return undefined;
    };
    const metadata = () => ({
      contractVersion: "v1alpha1",
      queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      clientInstanceId: crypto.randomUUID(),
    });
    const deadline = Date.now() + 90000;
    let latest = {
      applied: false,
      notRequired: false,
      taskStatus: "confirmation_timeout",
      confirmationCount: 0,
      detailVisible: document.body.innerText.includes("任务对话"),
    };
    while (Date.now() < deadline) {
      const allow = document.querySelector(
        "[data-confirmation-action='confirmed']");
      if (allow instanceof HTMLButtonElement && !allow.disabled) {
        allow.click();
        const confirm = await waitFor(() => document.querySelector(
          "[data-dialog-confirm]"));
        if (!confirm) return { applied: false, taskStatus: "dialog_missing" };
        confirm.click();
        const applied = await waitFor(() =>
          document.body.innerText.includes("操作已允许"));
        return { applied: applied === true, taskStatus: "confirmation_decided" };
      }
      const detail = await window.robothreeDesktop.loadTaskDetail({
        ...metadata(), type: "task_detail", taskId: ${JSON.stringify(taskId)},
      });
      latest = {
        applied: false,
        notRequired: detail.ok
          && detail.value.summary.displayStatus === "completed"
          && detail.value.userConfirmations.length === 0,
        taskStatus: detail.ok ? detail.value.summary.displayStatus : detail.error.code,
        confirmationCount: detail.ok ? detail.value.userConfirmations.length : 0,
        detailVisible: document.body.innerText.includes("任务对话"),
      };
      if (latest.notRequired) return latest;
      if (["failed", "cancelled", "timed_out", "manual_attention"]
        .includes(latest.taskStatus)) return latest;
      const sync = [...document.querySelectorAll("button")]
        .find((item) => item.textContent?.trim() === "同步" && !item.disabled);
      sync?.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return latest;
  })()`;
}

function completedTaskDomScript(taskId, sessionId) {
  return `(async () => {
    const metadata = () => ({
      contractVersion: "v1alpha1",
      queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      clientInstanceId: crypto.randomUUID(),
    });
    const inspect = async () => {
      const [detail, snapshot] = await Promise.all([
        window.robothreeDesktop.loadTaskDetail({
          ...metadata(), type: "task_detail", taskId: ${JSON.stringify(taskId)},
        }),
        window.robothreeDesktop.loadConversationSnapshot({
          ...metadata(), type: "conversation_snapshot",
          sessionId: ${JSON.stringify(sessionId)}, limit: 100,
        }),
      ]);
      if (!detail.ok || !snapshot.ok) {
        return {
          conformant: false,
          taskStatus: detail.ok ? "projection_error" : detail.error.code,
          artifactCount: 0,
          toolActivityCount: 0,
          assistantMessageCount: 0,
        };
      }
      const pptx = detail.value.artifacts.some((item) =>
        item.mediaType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        && item.displayName === "项目汇报.pptx"
        && item.metadata.capabilityId === "tool.document.pptx.write");
      const tool = detail.value.toolActivities.some((item) =>
        item.toolName === "adapter.tool.document-worker");
      const assistants = snapshot.value.messages.filter((item) =>
        item.taskId === ${JSON.stringify(taskId)}
        && item.role === "assistant"
        && item.status === "completed"
        && item.content.trim().length > 0);
      const text = document.body.innerText;
      const artifactVisible = pptx
        && text.includes("项目汇报.pptx")
        && text.includes("1 个成果");
      const toolActivityList = document.querySelector('ul[aria-label="工具调用"]');
      const toolActivityVisible = tool
        && toolActivityList !== null
        && toolActivityList.querySelector("li") !== null;
      const assistantReplyVisible = assistants.some((item) =>
        text.includes(item.content.trim().slice(0, 24)));
      const panelSelect = document.querySelector('select[aria-label="面板内容"]');
      return {
        conformant: detail.value.summary.displayStatus === "completed"
          && pptx && tool && assistants.length > 0
          && artifactVisible && toolActivityVisible && assistantReplyVisible,
        taskStatus: detail.value.summary.displayStatus,
        artifactCount: detail.value.artifacts.length,
        toolActivityCount: detail.value.toolActivities.length,
        assistantMessageCount: assistants.length,
        realRendererTaskDetail: document.querySelector("#app") !== null,
        assistantReplyVisible,
        artifactVisible,
        toolActivityVisible,
        sidePanelPresent: document.querySelector('[aria-label="任务右侧面板"]') !== null,
        sidePanelRestorePresent: document.querySelector("[data-side-panel-restore]") !== null,
        overviewSelected: panelSelect instanceof HTMLSelectElement
          && panelSelect.value === "overview",
        toolSectionPresent: toolActivityList !== null,
      };
    };
    const deadline = Date.now() + 45000;
    let latest;
    while (Date.now() < deadline) {
      const restore = document.querySelector("[data-side-panel-restore]");
      restore?.click();
      const panelSelect = document.querySelector('select[aria-label="面板内容"]');
      if (panelSelect instanceof HTMLSelectElement && panelSelect.value !== "overview") {
        panelSelect.value = "overview";
        panelSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const sync = [...document.querySelectorAll("button")]
        .find((item) => item.textContent?.trim() === "同步" && !item.disabled);
      sync?.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      latest = await inspect();
      if (latest.conformant) return latest;
      if (["failed", "cancelled", "timed_out", "manual_attention"]
        .includes(latest.taskStatus)) return latest;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return latest ?? {
      conformant: false,
      taskStatus: "projection_timeout",
      artifactCount: 0,
      toolActivityCount: 0,
      assistantMessageCount: 0,
    };
  })()`;
}

function completedTaskProjectionScript(taskId, sessionId) {
  return `(async () => {
    const metadata = () => ({
      contractVersion: "v1alpha1",
      queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      clientInstanceId: crypto.randomUUID(),
    });
    const deadline = Date.now() + 45000;
    let latest;
    while (Date.now() < deadline) {
      const [detail, snapshot] = await Promise.all([
        window.robothreeDesktop.loadTaskDetail({
          ...metadata(), type: "task_detail", taskId: ${JSON.stringify(taskId)},
        }),
        window.robothreeDesktop.loadConversationSnapshot({
          ...metadata(), type: "conversation_snapshot",
          sessionId: ${JSON.stringify(sessionId)}, limit: 100,
        }),
      ]);
      if (!detail.ok || !snapshot.ok) {
        latest = {
          conformant: false,
          taskStatus: detail.ok ? "projection_error" : detail.error.code,
          artifactCount: 0,
          toolActivityCount: 0,
          assistantMessageCount: 0,
        };
      } else {
        const pptx = detail.value.artifacts.some((item) =>
          item.mediaType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          && item.displayName === "项目汇报.pptx"
          && item.metadata.capabilityId === "tool.document.pptx.write");
        const tool = detail.value.toolActivities.some((item) =>
          item.toolName === "adapter.tool.document-worker");
        const assistantMessageCount = snapshot.value.messages.filter((item) =>
          item.taskId === ${JSON.stringify(taskId)}
          && item.role === "assistant"
          && item.status === "completed"
          && item.content.trim().length > 0).length;
        latest = {
          conformant: detail.value.summary.displayStatus === "completed"
            && pptx && tool && assistantMessageCount > 0,
          taskStatus: detail.value.summary.displayStatus,
          artifactCount: detail.value.artifacts.length,
          toolActivityCount: detail.value.toolActivities.length,
          assistantMessageCount,
        };
      }
      if (latest.conformant) return latest;
      if (["failed", "cancelled", "timed_out", "manual_attention"]
        .includes(latest.taskStatus)) return latest;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return latest ?? {
      conformant: false,
      taskStatus: "projection_timeout",
      artifactCount: 0,
      toolActivityCount: 0,
      assistantMessageCount: 0,
    };
  })()`;
}

function requireCompletedTaskEvidence(value, stage) {
  if (value?.conformant === true) return;
  process.stderr.write(`${JSON.stringify({
    stage,
    taskStatus: value?.taskStatus ?? "unknown",
    artifactCount: value?.artifactCount ?? 0,
    toolActivityCount: value?.toolActivityCount ?? 0,
    assistantMessageCount: value?.assistantMessageCount ?? 0,
    assistantReplyVisible: value?.assistantReplyVisible === true,
    artifactVisible: value?.artifactVisible === true,
    toolActivityVisible: value?.toolActivityVisible === true,
    sidePanelPresent: value?.sidePanelPresent === true,
    sidePanelRestorePresent: value?.sidePanelRestorePresent === true,
    overviewSelected: value?.overviewSelected === true,
    toolSectionPresent: value?.toolSectionPresent === true,
  })}\n`);
  throw new Error("vs1_completed_task_evidence_missing");
}

function findCoreChildPid() {
  const rows = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], {
    encoding: "utf8",
  }).split("\n");
  const matches = rows.map((row) => row.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/u))
    .filter((match) => match !== null
      && Number(match[2]) === process.pid
      && match[3].includes("desktop-private-main.js"));
  if (matches.length !== 1) throw new Error("vs1_core_child_identity_invalid");
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
  }, "vs1_sigkill_not_observed");
}

async function waitForSupervisorRecovery(supervisor, previousRuntimeInstanceId) {
  await waitFor(() => supervisor.snapshot().runtimeState === "ready"
    && supervisor.runtimeInstanceId !== previousRuntimeInstanceId,
  "vs1_core_recovery_timeout");
}

async function waitFor(predicate, code) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error(code);
}

async function startGatewayFixture(lifecycleOrigin, lifecycleKind = "robot") {
  const requests = [];
  const lifecycleRequests = [];
  const acceptedInvocations = new Map();
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (lifecycleOrigin !== undefined
      && (requestUrl.pathname.startsWith("/internal-trial/v1/agent-lifecycle/")
        || requestUrl.pathname.startsWith("/admin/v1alpha2/robot-reviews")
        || requestUrl.pathname.startsWith("/internal-trial/v1/skill-lifecycle/")
        || requestUrl.pathname.startsWith("/admin/v1alpha2/skill-lifecycle"))) {
      await forwardLifecycleRequest(request, response, lifecycleOrigin, requestUrl,
        lifecycleRequests);
      return;
    }
    if (!isAuthorized(request.headers.authorization)) {
      json(response, 401, { code: "unauthorized" });
      return;
    }
    if (request.method === "GET"
      && requestUrl.pathname === "/internal-trial/v1/admin-models/default") {
      json(response, 200, {
        schemaVersion: "mvp-admin-vs1.internal-trial.v1",
        configurationRevision: `sha256:${"c".repeat(64)}`,
        modelId: "model.internal-trial",
        modelCreatedAt: "2026-08-30T00:00:00.000Z",
        displayName: "Admin Managed Internal Trial Model",
        supportsToolCalling: true,
        contextWindowTokens: 128_000,
        maxOutputTokens: 8_192,
      });
      return;
    }
    if (request.method === "POST") {
      const body = JSON.parse(await readBody(request));
      requests.push(body);
      const accepted = Object.freeze({
        invocationId: randomUUID(),
        clientRequestId: body.clientRequestId,
        requestDigest: body.requestDigest,
        ...body.modelRequest.model,
      });
      acceptedInvocations.set(accepted.invocationId, Object.freeze({
        accepted,
        round: requests.length,
      }));
      json(response, 202, {
        contractVersion: "v1alpha3",
        invocationId: accepted.invocationId,
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
    const invocation = [...acceptedInvocations.values()].find(({ accepted }) =>
      requestUrl.pathname.includes(accepted.invocationId));
    if (invocation === undefined) {
      json(response, 409, { code: "invocation_missing" });
      return;
    }
    if (requestUrl.pathname.endsWith("/events")) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      for (const event of gatewayEvents(
        invocation.accepted.invocationId,
        invocation.round,
        lifecycleOrigin === undefined ? undefined : lifecycleKind,
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
    throw new Error("vs1_gateway_listen_failed");
  }
  return {
    mode: "controlled_fixture",
    origin: `http://127.0.0.1:${address.port}`,
    modelId: "model.internal-trial",
    requests,
    lifecycleRequests,
    close: () => new Promise((resolvePromise) => {
      server.closeAllConnections();
      server.close(() => resolvePromise());
    }),
  };
}

async function startGateway(lifecycleOrigin, lifecycleKind = "robot") {
  const external = consumeExternalGateway();
  if (external !== undefined) {
    return {
      mode: "external_gateway",
      origin: external.origin,
      modelId: external.modelId,
      accessToken: external.accessToken,
      close: async () => undefined,
    };
  }
  return startGatewayFixture(lifecycleOrigin, lifecycleKind);
}

async function forwardLifecycleRequest(request, response, lifecycleOrigin, requestUrl,
  lifecycleRequests) {
  const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, lifecycleOrigin);
  const body = request.method === "POST" ? await readBodyBytes(request) : undefined;
  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      accept: typeof request.headers.accept === "string"
        ? request.headers.accept : "application/json",
      ...(request.headers.authorization === undefined
        ? {}
        : { authorization: request.headers.authorization }),
      ...(request.headers["content-type"] === undefined
        ? {}
        : { "content-type": request.headers["content-type"] }),
      ...(request.headers["x-robothree-correlation-id"] === undefined
        ? {}
        : { "x-robothree-correlation-id": request.headers["x-robothree-correlation-id"] }),
    },
    ...(body === undefined ? {} : { body }),
    redirect: "manual",
  });
  const bytes = Buffer.from(await upstream.arrayBuffer());
  let errorCode;
  let lifecycleKind;
  let taskId;
  if (body !== undefined) {
    try {
      const parsedBody = JSON.parse(body.toString("utf8"));
      if (typeof parsedBody?.kind === "string") lifecycleKind = parsedBody.kind;
      if (lifecycleKind === "begin_robot_draft_test"
        && typeof parsedBody?.taskId === "string") taskId = parsedBody.taskId;
    } catch {
      lifecycleKind = undefined;
    }
  }
  try {
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (typeof parsed?.errorCode === "string" && /^[a-z0-9_.-]{1,96}$/u.test(parsed.errorCode)) {
      errorCode = parsed.errorCode;
    }
  } catch {
    errorCode = undefined;
  }
  lifecycleRequests.push(Object.freeze({
    method: request.method ?? "UNKNOWN",
    route: requestUrl.pathname,
    status: upstream.status,
    ...(lifecycleKind === undefined ? {} : { kind: lifecycleKind }),
    ...(taskId === undefined ? {} : { taskId }),
    ...(errorCode === undefined ? {} : { errorCode }),
  }));
  if (lifecycleRequests.length > 64) lifecycleRequests.shift();
  response.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") ?? "application/json",
    "cache-control": "no-store",
    "content-length": String(bytes.length),
    ...(upstream.headers.get("x-robothree-package-digest") === null ? {} : {
      "x-robothree-package-digest": upstream.headers.get("x-robothree-package-digest"),
    }),
    ...(upstream.headers.get("x-robothree-manifest-digest") === null ? {} : {
      "x-robothree-manifest-digest": upstream.headers.get("x-robothree-manifest-digest"),
    }),
  });
  response.end(bytes);
}

function consumeExternalGateway() {
  const baseUrl = process.env[externalGatewayBaseUrlEnvironmentName];
  const accessToken = process.env[externalGatewayTokenEnvironmentName];
  const modelId = process.env[externalGatewayModelEnvironmentName];
  delete process.env[externalGatewayBaseUrlEnvironmentName];
  delete process.env[externalGatewayTokenEnvironmentName];
  delete process.env[externalGatewayModelEnvironmentName];
  if (baseUrl === undefined && accessToken === undefined && modelId === undefined) {
    return undefined;
  }
  if (baseUrl === undefined || accessToken === undefined || modelId === undefined) {
    throw new Error("vs1_external_gateway_configuration_incomplete");
  }
  const origin = new URL(baseUrl);
  const loopback = origin.protocol === "http:"
    && (origin.hostname === "127.0.0.1" || origin.hostname === "localhost");
  if ((!loopback && origin.protocol !== "https:")
    || origin.username !== "" || origin.password !== ""
    || origin.search !== "" || origin.hash !== "") {
    throw new Error("vs1_external_gateway_origin_invalid");
  }
  if (!/^model\.[A-Za-z0-9._:-]{1,154}$/u.test(modelId)
    || accessToken.length < 32 || accessToken.length > 8_192
    || /\s/u.test(accessToken)) {
    throw new Error("vs1_external_gateway_configuration_invalid");
  }
  return Object.freeze({
    origin: origin.toString(),
    modelId,
    accessToken,
  });
}

function gatewayEvents(invocationId, round, lifecycleKind) {
  const occurredAt = new Date().toISOString();
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
  }, lifecycleKind === "robot"
    ? {
      contractVersion: "v1alpha3",
      invocationId,
      eventId: randomUUID(),
      eventClass: "ephemeral",
      streamSequence: 2,
      eventType: "text_delta",
      eventPayload: { delta: "已按机器人规则完成本次任务" },
      eventDigest: "2".repeat(64),
      occurredAt,
    }
    : lifecycleKind === "skill-admin" && round === 2
      ? workspaceTextToolCallEvent(invocationId, occurredAt, round, "rsl2-admin-result.md")
    : lifecycleKind === "skill-admin"
      ? {
        contractVersion: "v1alpha3",
        invocationId,
        eventId: randomUUID(),
        eventClass: "ephemeral",
        streamSequence: 2,
        eventType: "text_delta",
        eventPayload: { delta: "企业技能测试已完成" },
        eventDigest: "2".repeat(64),
        occurredAt,
      }
    : lifecycleKind === "skill" && (round === 1 || round === 4)
      ? workspaceTextToolCallEvent(invocationId, occurredAt, round)
    : round === 1
    ? pptxToolCallEvent(invocationId, occurredAt)
    : {
      contractVersion: "v1alpha3",
      invocationId,
      eventId: randomUUID(),
      eventClass: "ephemeral",
      streamSequence: 2,
      eventType: "text_delta",
      eventPayload: { delta: "PPTX 已真实生成" },
      eventDigest: "2".repeat(64),
      occurredAt,
    }, {
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

function workspaceTextToolCallEvent(invocationId, occurredAt, round,
  outputFileName = "rsl2-result.md") {
  const args = round === 1
    ? {
      relativePath: "SKILL.md",
      content: "---\nname: weekly-brief\ndescription: RSL2-E2E-MARKER weekly brief skill.\n---\nUse RSL2-E2E-MARKER and produce concise weekly briefs.\n",
      mode: "create_new",
    }
    : {
      relativePath: outputFileName,
      content: "# RSL-2 Result\n\nGenerated with the exact installed Skill.\n",
      mode: "create_new",
    };
  return {
    contractVersion: "v1alpha3",
    invocationId,
    eventId: randomUUID(),
    eventClass: "ephemeral",
    streamSequence: 2,
    eventType: "tool_call",
    eventPayload: { call: {
      toolCallId: randomUUID(),
      name: projectEnterpriseProviderToolName("tool.workspace.file.write_text"),
      arguments: args,
      argumentsDigest: sha256CanonicalJson(JsonValueSchema.parse(args))
        .replace(/^sha256:/u, ""),
    } },
    eventDigest: "2".repeat(64),
    occurredAt,
  };
}

function canonicalSkillZip(content) {
  const nameBytes = Buffer.from("SKILL.md", "utf8");
  const compressed = deflateRawSync(content, { level: 9 });
  const crc = crc32(content);
  const local = Buffer.alloc(30 + nameBytes.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  nameBytes.copy(local, 30);
  const central = Buffer.alloc(46 + nameBytes.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE((0o100600 << 16) >>> 0, 38);
  nameBytes.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + compressed.length, 16);
  return Buffer.concat([local, compressed, central, eocd]);
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) !== 0
    ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function pptxToolCallEvent(invocationId, occurredAt) {
  const args = {
    relativePath: artifactFileName,
    presentation: {
      title: "项目汇报",
      layout: "wide",
      templateRef: "robothree.default",
      slides: [{
        title: "项目概览",
        elements: [{
          type: "text",
          text: "RoboThree MVP 真实垂直闭环",
          x: 0.8,
          y: 1.2,
          w: 8.8,
          h: 0.8,
          style: { fontSize: 24, bold: true, color: "111827" },
        }],
      }],
    },
  };
  return {
    contractVersion: "v1alpha3",
    invocationId,
    eventId: randomUUID(),
    eventClass: "ephemeral",
    streamSequence: 2,
    eventType: "tool_call",
    eventPayload: { call: {
      toolCallId: randomUUID(),
      name: projectEnterpriseProviderToolName("tool.document.pptx.write"),
      arguments: args,
      argumentsDigest: sha256CanonicalJson(JsonValueSchema.parse(args))
        .replace(/^sha256:/u, ""),
    } },
    eventDigest: "2".repeat(64),
    occurredAt,
  };
}

function adminDiscoveryRequest(origin) {
  return {
    schemaVersion: "mvp-admin-vs1.discovery.v1",
    centralBaseUrl: origin,
  };
}

function deployment(origin, modelId) {
  const capability = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: modelId,
    kind: "model",
    name: "Internal Trial Model",
    description: "MVP VS1 controlled enterprise Model",
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

function isAuthorized(value) {
  return typeof value === "string" && value.startsWith("Bearer ");
}

async function readBody(request) {
  return (await readBodyBytes(request)).toString("utf8");
}

async function readBodyBytes(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  }).end(body);
}

function safeCode(error) {
  const message = error instanceof Error ? error.message : "vs1_electron_failure";
  return /^[a-z0-9_.-]+$/u.test(message) ? message : "vs1_electron_failure";
}
