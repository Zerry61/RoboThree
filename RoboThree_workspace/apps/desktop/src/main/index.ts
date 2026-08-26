import { fileURLToPath } from "node:url";
import { join } from "node:path";
import electron from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";

import {
  DESKTOP_IPC_CHANNELS,
  DESKTOP_V1ALPHA2_IPC_CHANNELS,
  FOUNDATION_STATUS_CHANNEL,
  type DesktopInvokeChannel,
  type DesktopV1Alpha2InvokeChannel,
} from "../shared/foundation-api.js";
import { CorePrivateSupervisor } from "./core-private-supervisor.js";
import { DesktopEventReconnectController } from "./desktop-event-reconnect-controller.js";
import { DesktopIpcRouter } from "./desktop-ipc-router.js";
import { DesktopV1Alpha2IpcRouter } from "./desktop-v1alpha2-ipc-router.js";
import { HtmlPreviewSandbox } from "./html-preview-sandbox.js";
import { PersonalCredentialTransportProductionController } from "./personal-credential-transport-controller.js";
import { createSecureWindowOptions } from "./window-security.js";

const { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, shell } = electron;

const demoMode = process.env.ROBOTHREE_DCF2C_DEMO === "1";
if (demoMode) {
  app.setPath("userData", join(app.getPath("userData"), "dcf2c-demo"));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let supervisor: CorePrivateSupervisor | undefined;
let eventSubscription: AbortController | undefined;
const htmlPreviewSandbox = new HtmlPreviewSandbox();
const personalCredentialTransport = new PersonalCredentialTransportProductionController({
  foundationEnabled: false,
  createMessageChannel: () => new MessageChannelMain(),
  brokerLeaseProvider: {
    current: () => {
      if (supervisor === undefined) {
        throw new Error("Personal Credential Broker is unavailable");
      }
      const client = supervisor.personalCredentialBroker;
      return Object.freeze({
        runtimeInstanceId: supervisor.runtimeInstanceId,
        channelInstanceId: client.channelInstanceId,
        clientInstanceId: client.clientInstanceId,
        client,
      });
    },
  },
});

let mainWindow: BrowserWindowType | undefined;
let quitting = false;

if (hasSingleInstanceLock) {
  ipcMain.handle(
    FOUNDATION_STATUS_CHANNEL,
    async () => supervisor?.probe() ?? unavailableFoundationStatus(),
  );

  app.on("second-instance", () => {
    if (mainWindow !== undefined) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.on("before-quit", (event) => {
    if (quitting) {
      return;
    }
    event.preventDefault();
    quitting = true;
    eventSubscription?.abort();
    void Promise.allSettled([
      htmlPreviewSandbox.closeAll(),
      supervisor?.stop(),
    ]).finally(() => app.quit());
    personalCredentialTransport.close();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  void app.whenReady().then(async () => {
    supervisor = new CorePrivateSupervisor({
      entryPath: fileURLToPath(new URL(
        "../../../../services/core/dist/desktop-private-main.js",
        import.meta.url,
      )),
      databasePath: join(app.getPath("userData"), "robothree.sqlite"),
      ...(demoMode ? { demoMode: "dcf2c" as const } : {}),
      maxUnexpectedRestarts: 1,
    });
    let coreReady = false;
    try {
      await supervisor.start();
      coreReady = true;
    } catch {
      coreReady = false;
    }
    mainWindow = createMainWindow();
    personalCredentialTransport.attachWebContents(mainWindow.webContents);
    registerBusinessIpc(supervisor);
    if (coreReady) {
      eventSubscription = startDesktopEventForwarding(mainWindow, supervisor);
    }
  });
}

function unavailableFoundationStatus() {
  return {
    fixtureSchema: "robothree.desktop.foundation-fixture.v1" as const,
    fixtureOnly: false,
    runtimeState: "starting" as const,
    coreReady: false,
    compatible: false,
    unexpectedRestartCount: 0,
  };
}

function createMainWindow(): BrowserWindowType {
  const preloadPath = fileURLToPath(new URL("../preload/index.cjs", import.meta.url));
  const rendererPath = fileURLToPath(new URL("../renderer/index.html", import.meta.url));
  const window = new BrowserWindow(createSecureWindowOptions(preloadPath));

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  window.webContents.session.on("will-download", (event) => {
    event.preventDefault();
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:")) {
      event.preventDefault();
    }
  });
  window.once("ready-to-show", () => window.show());
  window.once("closed", () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
    void htmlPreviewSandbox.closeAll();
  });
  void window.loadFile(rendererPath);
  return window;
}

function registerBusinessIpc(core: CorePrivateSupervisor): void {
  const router = new DesktopIpcRouter({
    core: {
      get client() {
        return core.client;
      },
      htmlPreviewSandbox,
      snapshot: () => core.snapshot(),
    },
    chooseWorkspaceDirectory: async () => {
      if (mainWindow === undefined || mainWindow.isDestroyed()) return undefined;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "选择 RoboThree 工作目录",
        buttonLabel: "授权此目录",
        properties: ["openDirectory", "createDirectory"],
      });
      return result.canceled ? undefined : result.filePaths[0];
    },
    openFileLocation: (realPath) => {
      shell.showItemInFolder(realPath);
    },
    trashArtifactSourceFile: async (realPath) => {
      await shell.trashItem(realPath);
    },
    chooseArtifactExportPath: async (defaultFileName) => {
      if (mainWindow === undefined || mainWindow.isDestroyed()) return undefined;
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "导出 Artifact",
        buttonLabel: "导出",
        defaultPath: defaultFileName,
        properties: ["showOverwriteConfirmation"],
      });
      return result.canceled ? undefined : result.filePath;
    },
    chooseWorkspaceArtifactFile: async (authorities) => {
      if (mainWindow === undefined || mainWindow.isDestroyed()) return undefined;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "注册工作区 Artifact",
        buttonLabel: "注册",
        ...(authorities[0]?.rootRealPath === undefined
          ? {}
          : { defaultPath: authorities[0].rootRealPath }),
        properties: ["openFile"],
        filters: [
          {
            name: "Supported Documents",
            extensions: ["pdf", "xlsx", "docx", "md", "markdown", "txt", "html", "htm"],
          },
        ],
      });
      return result.canceled ? undefined : result.filePaths[0];
    },
  });
  const channels = Object.values(DESKTOP_IPC_CHANNELS)
    .filter((channel): channel is DesktopInvokeChannel =>
      channel !== DESKTOP_IPC_CHANNELS.desktopEvent);
  for (const channel of channels) {
    ipcMain.handle(channel, (_event, input: unknown) =>
      router.dispatch(channel, input));
  }
  const v1alpha2Router = new DesktopV1Alpha2IpcRouter({
    resolveConnection: () => core.connectionLease(),
    isCurrentConnection: (lease) => core.isCurrentConnectionLease(lease),
    openTaskWorkspaceDirectory: (rootRealPath) => shell.openPath(rootRealPath),
  });
  if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
    v1alpha2Router.registerCatalogWebContents(mainWindow.webContents);
  }
  const v1alpha2Channels = Object.values(
    DESKTOP_V1ALPHA2_IPC_CHANNELS,
  ) as DesktopV1Alpha2InvokeChannel[];
  for (const channel of v1alpha2Channels) {
    ipcMain.handle(channel, (event, input: unknown) =>
      v1alpha2Router.dispatch(channel, input, event));
  }
}

function startDesktopEventForwarding(
  window: BrowserWindowType,
  core: CorePrivateSupervisor,
): AbortController {
  const controller = new DesktopEventReconnectController({
    resolveConnection: () => ({
      client: core.client,
      clientInstanceId: core.clientInstanceId,
    }),
    canReconnect: () => {
      const state = core.snapshot().runtimeState;
      return state !== "failed" && state !== "stopped";
    },
  }).start((value) => {
    if (!window.isDestroyed()) {
      window.webContents.send(DESKTOP_IPC_CHANNELS.desktopEvent, value);
    }
  });
  window.once("closed", () => controller.abort());
  return controller;
}
