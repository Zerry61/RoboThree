import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import electron from "electron";

import { CorePrivateSupervisor } from
  "../apps/desktop/dist/main/core-private-supervisor.js";
import { DesktopV1Alpha4IpcRouter } from
  "../apps/desktop/dist/main/desktop-v1alpha4-ipc-router.js";
import { createSecureWindowOptions } from
  "../apps/desktop/dist/main/window-security.js";
import { DESKTOP_V1ALPHA4_IPC_CHANNELS } from
  "../apps/desktop/dist/shared/foundation-api.js";

const { app, BrowserWindow, ipcMain } = electron;
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
  const directory = await mkdtemp(join(tmpdir(), "robothree-r2dp3-electron-"));
  const supervisor = new CorePrivateSupervisor({
    entryPath: join(root, "services/core/dist/desktop-private-main.js"),
    databasePath: join(directory, "robothree.sqlite"),
    maxUnexpectedRestarts: 0,
  });
  const router = new DesktopV1Alpha4IpcRouter({
    resolveConnection: () => supervisor.connectionLease(),
    isCurrentConnection: (lease) => supervisor.isCurrentConnectionLease(lease),
  });
  const handlers = [];
  let window;
  try {
    await supervisor.start();
    for (const channel of Object.values(DESKTOP_V1ALPHA4_IPC_CHANNELS)) {
      const handler = (event, input) => router.dispatch(channel, input, event);
      ipcMain.handle(channel, handler);
      handlers.push(channel);
    }
    window = new BrowserWindow(createSecureWindowOptions(
      join(root, "apps/desktop/dist/preload/index.cjs"),
    ));
    await window.loadURL("data:text/html;charset=utf-8,<main>R2D-P.3</main>");
    const result = await window.webContents.executeJavaScript(`
      window.robothreeDesktopV1Alpha4.getCompatibility({
        contractVersion: "v1alpha4",
        queryId: "019f7447-a784-47b2-a716-000000000701",
        correlationId: "019f7447-a784-47b2-a716-000000000702",
        clientInstanceId: "019f7447-a784-47b2-a716-000000000703",
        supportedContractVersions: ["v1alpha4"]
      })
    `, true);
    if (result?.ok !== true
      || result.value?.features?.[0]?.state !== "unavailable"
      || result.value?.features?.[0]?.reasonCode !== "production_gate_disabled") {
      throw new Error("r2dp3_production_gate_electron_evidence_invalid");
    }
    const preferences = window.webContents.getLastWebPreferences();
    return {
      status: "PASS",
      realElectronMain: true,
      productionPreloadApiV1Alpha4: true,
      realMainIpc: true,
      realCoreChild: true,
      realSqliteFile: true,
      productionFeatureAvailable: false,
      productionGateReason: result.value.features[0].reasonCode,
      sandbox: preferences.sandbox === true,
      contextIsolation: preferences.contextIsolation === true,
      nodeIntegrationDisabled: preferences.nodeIntegration === false,
    };
  } finally {
    window?.destroy();
    for (const channel of handlers) ipcMain.removeHandler(channel);
    router.clear();
    await supervisor.stop().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
}

function safeCode(error) {
  const message = error instanceof Error ? error.message : "r2dp3_electron_failure";
  return /^[a-z0-9_.-]+$/u.test(message) ? message : "r2dp3_electron_failure";
}
