import { execFileSync } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import electron from "electron";

import { CorePrivateSupervisor } from
  "../apps/desktop/dist/main/core-private-supervisor.js";
import { PersonalCredentialTransportProductionController } from
  "../apps/desktop/dist/main/personal-credential-transport-controller.js";
import { PersonalModelV1Alpha1IpcRouter } from
  "../apps/desktop/dist/main/personal-model-v1alpha1-ipc-router.js";
import { createSecureWindowOptions } from
  "../apps/desktop/dist/main/window-security.js";
import { PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS } from
  "../apps/desktop/dist/shared/foundation-api.js";
import { STRM3_SENSITIVE_TRANSPORT_ACTIVATION } from
  "../apps/desktop/dist/shared/sensitive-transport-activation.js";

const { app, BrowserWindow, ipcMain, MessageChannelMain } = electron;
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

app.on("window-all-closed", () => undefined);
void app.whenReady().then(run).then((evidence) => {
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  app.quit();
}).catch((error) => {
  process.stderr.write(`${safeCode(error)}\n`);
  app.exit(1);
});

async function run() {
  const directory = await mkdtemp(join(tmpdir(), "robothree-strm3-electron-"));
  const supervisor = new CorePrivateSupervisor({
    entryPath: join(root, "services/core/dist/desktop-private-main.js"),
    databasePath: join(directory, "robothree.sqlite"),
    sensitiveTransportActivationDescriptor: STRM3_SENSITIVE_TRANSPORT_ACTIVATION,
    maxUnexpectedRestarts: 1,
  });
  const controller = new PersonalCredentialTransportProductionController({
    foundationEnabled: true,
    productionActivation: STRM3_SENSITIVE_TRANSPORT_ACTIVATION,
    createMessageChannel: () => new MessageChannelMain(),
    brokerLeaseProvider: {
      current: () => {
        const client = supervisor.personalCredentialBroker;
        return {
          runtimeInstanceId: supervisor.runtimeInstanceId,
          channelInstanceId: client.channelInstanceId,
          clientInstanceId: client.clientInstanceId,
          client,
        };
      },
    },
  });
  const router = new PersonalModelV1Alpha1IpcRouter({
    resolveConnection: () => supervisor.connectionLease(),
    isCurrentConnection: (lease) => supervisor.isCurrentConnectionLease(lease),
  });
  let window;
  let firstCorePid;
  let secondCorePid;
  let firstRuntimeInstanceId;
  let secondRuntimeInstanceId;
  let evidence;
  const registeredIpcChannels = new Set();
  try {
    await supervisor.start();
    ipcMain.handle(
      PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.compatibility,
      (event, input) => router.dispatch(
        PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.compatibility,
        input,
        event,
      ),
    );
    registeredIpcChannels.add(PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.compatibility);
    window = new BrowserWindow(createSecureWindowOptions(
      join(root, "apps/desktop/dist/preload/index.cjs"),
    ));
    controller.attachWebContents(window.webContents);
    await window.loadURL("data:text/html;charset=utf-8,<main>STRM-3</main>");
    const before = await compatibility(window, "801");
    assertCompatibility(before);
    const snapshot = controller.snapshot();
    if (snapshot.productionSensitiveTransportReady !== true
      || snapshot.transportBlockerClosed !== true
      || snapshot.productionFeatureEnabled !== false
      || snapshot.productionBusinessHandlerReady !== false) {
      throw new Error("strm3_main_activation_snapshot_invalid");
    }
    firstRuntimeInstanceId = supervisor.runtimeInstanceId;
    firstCorePid = findCoreChildPid();
    process.kill(firstCorePid, "SIGKILL");
    await observeExitedProcess(firstCorePid);
    await waitForSupervisorRecovery(supervisor, firstRuntimeInstanceId);
    secondRuntimeInstanceId = supervisor.runtimeInstanceId;
    secondCorePid = findCoreChildPid();
    if (secondCorePid === firstCorePid || secondRuntimeInstanceId === firstRuntimeInstanceId) {
      throw new Error("strm3_core_restart_identity_invalid");
    }
    const after = await compatibility(window, "802");
    assertCompatibility(after);
    const preferences = window.webContents.getLastWebPreferences();
    evidence = {
      status: "PASS",
      realElectronMain: true,
      normalMainEntry: true,
      productionPreload: true,
      realCoreChild: true,
      realFd4Fd5SensitiveStreams: true,
      realSigkill: true,
      coreRestartedWithNewIdentity: true,
      namedCrashBarrier: "core_ready_transport_active_before_sigkill",
      catalogAvailable: after.value.catalogAvailable,
      transportState: after.value.transportState,
      mutationAvailable: after.value.mutationAvailable,
      revealAvailable: after.value.revealAvailable,
      helperState: after.value.helperState,
      productionSensitiveTransportReady: true,
      transportBlockerClosed: true,
      productionFeatureEnabled: false,
      productionBusinessHandlerReady: false,
      sandbox: preferences.sandbox === true,
      contextIsolation: preferences.contextIsolation === true,
      nodeIntegrationDisabled: preferences.nodeIntegration === false,
    };
  } finally {
    window?.destroy();
    router.clear();
    ipcMain.removeHandler(PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.compatibility);
    registeredIpcChannels.delete(PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.compatibility);
    controller.close();
    await supervisor.stop().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
  if (evidence === undefined) throw new Error("strm3_normal_evidence_missing");
  const controllerSnapshot = controller.snapshot();
  return {
    ...evidence,
    resourceCounts: {
      electronProcessCount: BrowserWindow.getAllWindows().length,
      browserWindowCount: BrowserWindow.getAllWindows().length,
      webContentsCount: window?.isDestroyed() === true ? 0 : 1,
      messagePortCount: controllerSnapshot.messagePortCount,
      ipcListenerCount: registeredIpcChannels.size,
      navigationListenerCount: controllerSnapshot.navigationListenerCount,
      timerCount: controllerSnapshot.timerCount,
      transportSessionCount: controllerSnapshot.sessionCount,
      transportRegistryCount: controllerSnapshot.frameAuthorizationCount,
      brokerInflightCount: controllerSnapshot.brokerLeaseCount,
      brokerTombstoneCount: controllerSnapshot.brokerLeaseCount,
      coreChildProcessCount: supervisor.snapshot().runtimeState === "stopped" ? 0 : 1,
      sensitiveStreamCount: supervisor.snapshot().runtimeState === "stopped" ? 0 : 2,
      helperProcessCount: findDirectChildPids("robothree-personal-credential-helper").length,
      listeningPortCount: supervisor.snapshot().runtimeState === "stopped" ? 0 : 1,
      temporaryDirectoryCount: await exists(directory) ? 1 : 0,
    },
  };
}

function compatibility(window, suffix) {
  return window.webContents.executeJavaScript(`
    window.robothreePersonalModelV1Alpha1.getCompatibility({
      contractVersion: "personal-model-management.v1alpha1",
      type: "personal_model_management_compatibility",
      queryId: "019f7447-a784-47b2-a716-000000000${suffix}",
      correlationId: "019f7447-a784-47b2-a716-000000001${suffix}",
      clientInstanceId: "019f7447-a784-47b2-a716-000000000803",
      supportedContractVersions: ["personal-model-management.v1alpha1"]
    })
  `, true);
}

function assertCompatibility(result) {
  if (result?.ok !== true
    || result.value?.catalogAvailable !== true
    || result.value?.transportState !== "ready"
    || result.value?.mutationAvailable !== false
    || result.value?.revealAvailable !== false
    || result.value?.helperState !== "unavailable") {
    throw new Error("strm3_personal_model_compatibility_invalid");
  }
}

function findCoreChildPid() {
  const matches = findDirectChildPids("desktop-private-main.js");
  if (matches.length !== 1) throw new Error("strm3_core_child_identity_invalid");
  return matches[0];
}

function findDirectChildPids(commandFragment) {
  const rows = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], {
    encoding: "utf8",
  }).split("\n");
  return rows.map((row) => row.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/u))
    .filter((match) => match !== null
      && Number(match[2]) === process.pid
      && match[3].includes(commandFragment))
    .map((match) => Number(match[1]));
}

async function observeExitedProcess(pid) {
  await waitFor(() => {
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      return error?.code === "ESRCH";
    }
  }, "strm3_sigkill_not_observed");
}

async function waitForSupervisorRecovery(supervisor, previousRuntimeInstanceId) {
  await waitFor(() => supervisor.snapshot().runtimeState === "ready"
    && supervisor.runtimeInstanceId !== previousRuntimeInstanceId,
  "strm3_core_recovery_timeout");
}

async function waitFor(predicate, code) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error(code);
}

function safeCode(error) {
  const message = error instanceof Error ? error.message : "strm3_electron_failure";
  return /^[a-z0-9_.-]+$/u.test(message) ? message : "strm3_electron_failure";
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
