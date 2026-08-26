import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers";
import electron from "electron";

import {
  PersonalCredentialTransportProductionController,
} from "../apps/desktop/dist/main/personal-credential-transport-controller.js";

const { app, BrowserWindow, ipcMain, MessageChannelMain } = electron;
const scenario = process.env.ROBOTHREE_STRM21_SCENARIO ?? "unknown";
const REQUEST_CHANNEL = "robothree:strm21:request";
const READY_CHANNEL = "robothree:strm21:ready";
const supported = new Set([
  "production_disabled",
  "ready_cancel",
  "hash_navigation",
  "renderer_crash",
  "foreign_window",
]);

if (!supported.has(scenario)) {
  process.stderr.write("STRM-2.1 lifecycle fixture rejected an unknown scenario\n");
  process.exit(2);
}

void app.whenReady()
  .then(run)
  .then((evidence) => {
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
    app.quit();
  })
  .catch((error) => {
    process.stderr.write(`STRM-2.1 lifecycle fixture failed: ${safeCode(error)}\n`);
    app.exit(1);
  });

async function run() {
  const preload = fileURLToPath(new URL("./strm21-lifecycle-preload.cjs", import.meta.url));
  const fixturePage = fileURLToPath(new URL("./strm21-lifecycle.html", import.meta.url));
  const foundationEnabled = scenario !== "production_disabled";
  const controller = new PersonalCredentialTransportProductionController({
    foundationEnabled,
    createMessageChannel: () => new MessageChannelMain(),
  });
  const primary = createWindow(preload);
  const detach = controller.attachWebContents(primary.webContents);
  let foreign;
  let requestCount = 0;
  let readyCount = 0;
  let rejectionCode = "none";
  let preloadErrorCode = "none";

  const onRequest = (event) => {
    requestCount += 1;
    if (requestCount > 1) return;
    try {
      controller.openPreparedCommand(prepared(), event);
    } catch (error) {
      rejectionCode = safeCode(error);
    }
  };
  const onReady = (event, payload) => {
    if (event.senderFrame !== event.sender.mainFrame) return;
    if (payload?.code === "ready") readyCount += 1;
    if (payload?.code === "preload_error") {
      preloadErrorCode = typeof payload.reason === "string" ? payload.reason : "UnknownError";
    }
  };
  ipcMain.on(REQUEST_CHANNEL, onRequest);
  ipcMain.on(READY_CHANNEL, onReady);

  try {
    if (scenario === "foreign_window") {
      foreign = createWindow(preload);
      await foreign.loadFile(fixturePage);
      await waitUntil(
        () => rejectionCode === "personal_credential_transport_identity_mismatch",
        2_000,
        "foreign_identity_rejection_missing",
      );
      return evidence(controller, requestCount, readyCount, rejectionCode, preloadErrorCode);
    }

    await primary.loadFile(fixturePage);
    if (scenario === "production_disabled") {
      await waitUntil(
        () => rejectionCode === "personal_credential_transport_unavailable",
        2_000,
        "production_disabled_rejection_missing",
      );
      return evidence(controller, requestCount, readyCount, rejectionCode, preloadErrorCode);
    }

    await waitUntil(
      () => readyCount === 1 || preloadErrorCode !== "none",
      2_000,
      "preload_ready_missing",
    );
    if (preloadErrorCode !== "none") throw new Error(`preload_${preloadErrorCode}`);
    if (scenario === "ready_cancel") {
      await waitUntil(() => controller.snapshot().sessionCount === 0, 2_000, "cancel_not_closed");
    } else if (scenario === "hash_navigation") {
      await primary.webContents.executeJavaScript("location.hash = '#next'", true);
      await waitUntil(
        () => controller.snapshot().sessionCount === 0,
        2_000,
        "hash_navigation_not_invalidated",
      );
    } else if (scenario === "renderer_crash") {
      primary.webContents.forcefullyCrashRenderer();
      await waitUntil(
        () => controller.snapshot().sessionCount === 0,
        2_000,
        "renderer_crash_not_invalidated",
      );
    }
    return evidence(controller, requestCount, readyCount, rejectionCode, preloadErrorCode);
  } finally {
    ipcMain.off(REQUEST_CHANNEL, onRequest);
    ipcMain.off(READY_CHANNEL, onReady);
    detach();
    controller.close();
    if (foreign !== undefined && !foreign.isDestroyed()) foreign.destroy();
    if (!primary.isDestroyed()) primary.destroy();
  }
}

function createWindow(preload) {
  return new BrowserWindow({
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
}

function prepared() {
  return {
    schemaVersion: "personal-credential-transport-prepared-command.v1",
    runtimeInstanceId: "019f9a00-0000-4000-8000-000000000001",
    clientInstanceId: "019f9a00-0000-4000-8000-000000000002",
    commandId: "019f9a00-0000-4000-8000-000000000003",
    correlationId: "019f9a00-0000-4000-8000-000000000004",
    operationType: "create",
    personalModelId: "model.personal.strm21",
    expectedConfigurationRevision: `sha256:${"a".repeat(64)}`,
    requestDigest: `sha256:${"b".repeat(64)}`,
    deadlineAt: new Date(Date.now() + 4_000).toISOString(),
  };
}

function evidence(controller, requestCount, readyCount, rejectionCode, preloadErrorCode) {
  return Object.freeze({
    status: "PASS",
    scenario,
    requestCount,
    readyCount,
    rejectionCode,
    preloadErrorCode,
    productionFeatureEnabled: false,
    productionSensitiveTransportReady: false,
    transportBlockerClosed: false,
    snapshot: controller.snapshot(),
  });
}

async function waitUntil(predicate, timeoutMs, code) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(code);
}

function safeCode(error) {
  if (typeof error === "object" && error !== null && typeof error.code === "string") {
    return error.code.replaceAll(/[^a-z0-9_.-]/giu, "_").slice(0, 96);
  }
  if (error instanceof Error) {
    return error.message.replaceAll(/[^a-z0-9_.-]/giu, "_").slice(0, 96);
  }
  return "unknown_failure";
}
