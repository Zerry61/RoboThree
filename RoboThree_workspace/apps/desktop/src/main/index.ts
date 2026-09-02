import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  MessageChannelMain,
  shell,
} from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";

import {
  DESKTOP_IPC_CHANNELS,
  AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS,
  SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS,
  DESKTOP_V1ALPHA2_IPC_CHANNELS,
  DESKTOP_V1ALPHA4_IPC_CHANNELS,
  DESKTOP_V1ALPHA5_IPC_CHANNELS,
  DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS,
  PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS,
  PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS,
  FOUNDATION_STATUS_CHANNEL,
  type DesktopInvokeChannel,
  type DesktopV1Alpha2InvokeChannel,
  type DesktopV1Alpha4InvokeChannel,
  type DesktopV1Alpha5InvokeChannel,
  type DesktopTaskReasoningV1Alpha1InvokeChannel,
  type PersonalModelV1Alpha1InvokeChannel,
  type PersonalModelV1Alpha2InvokeChannel,
  type AgentLifecycleV1Alpha1InvokeChannel,
  type SkillLifecycleV1Alpha1InvokeChannel,
} from "../shared/foundation-api.js";
import { CorePrivateSupervisor } from "./core-private-supervisor.js";
import { DesktopEventReconnectController } from "./desktop-event-reconnect-controller.js";
import { DesktopIpcRouter } from "./desktop-ipc-router.js";
import { DefaultWorkspaceGrantProvider } from "./default-workspace-grant-provider.js";
import { DesktopV1Alpha2IpcRouter } from "./desktop-v1alpha2-ipc-router.js";
import { DesktopV1Alpha4IpcRouter } from "./desktop-v1alpha4-ipc-router.js";
import { DesktopV1Alpha5IpcRouter } from "./desktop-v1alpha5-ipc-router.js";
import { DesktopTaskReasoningV1Alpha1IpcRouter } from
  "./desktop-task-reasoning-v1alpha1-ipc-router.js";
import { PersonalModelV1Alpha1IpcRouter } from
  "./personal-model-v1alpha1-ipc-router.js";
import { PersonalModelV1Alpha2IpcRouter } from
  "./personal-model-v1alpha2-ipc-router.js";
import { AgentLifecycleV1Alpha1IpcRouter } from
  "./agent-lifecycle-v1alpha1-ipc-router.js";
import { SkillLifecycleV1Alpha1IpcRouter } from
  "./skill-lifecycle-v1alpha1-ipc-router.js";
import { SkillDraftWorkspaceService } from "./skill-draft-workspace-service.js";
import { SkillInstallationService } from "./skill-installation-service.js";
import { SkillLocalDiscoveryService } from "./skill-local-discovery-service.js";
import { AdminSkillDraftTestCoordinator } from "./admin-skill-draft-test-coordinator.js";
import { HtmlPreviewSandbox } from "./html-preview-sandbox.js";
import { PersonalCredentialTransportProductionController } from "./personal-credential-transport-controller.js";
import { resolvePackagedPersonalCredentialHelper } from
  "./personal-credential-helper-package.js";
import { createSecureWindowOptions } from "./window-security.js";
import { STRM3_SENSITIVE_TRANSPORT_ACTIVATION } from
  "../shared/sensitive-transport-activation.js";

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
let adminSkillTests: AdminSkillDraftTestCoordinator | undefined;
const htmlPreviewSandbox = new HtmlPreviewSandbox();
const personalCredentialTransport = new PersonalCredentialTransportProductionController({
  // Historical STRM-2 snapshot: foundationEnabled: false.
  foundationEnabled: true,
  productionActivation: STRM3_SENSITIVE_TRANSPORT_ACTIVATION,
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
    adminSkillTests?.stop();
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
    const credentialHelperDescriptor = await resolvePackagedPersonalCredentialHelper(
      process.resourcesPath,
    );
    supervisor = new CorePrivateSupervisor({
      entryPath: fileURLToPath(new URL(
        "../../../../services/core/dist/desktop-private-main.js",
        import.meta.url,
      )),
      databasePath: join(app.getPath("userData"), "robothree.sqlite"),
      privateInstalledSkillRoot: join(app.getPath("home"), ".robothree", "skills", "installed"),
      sensitiveTransportActivationDescriptor: STRM3_SENSITIVE_TRANSPORT_ACTIVATION,
      ...(credentialHelperDescriptor === undefined
        ? {}
        : { credentialHelperDescriptor }),
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
  const privateRootPath = join(app.getPath("home"), ".robothree");
  const defaultWorkspace = new DefaultWorkspaceGrantProvider({
    resolveClient: () => core.client,
    rootPath: privateRootPath,
  });
  const skillDraftWorkspaces = new SkillDraftWorkspaceService({
    privateRootPath,
    onSynced: () => core.restart(),
  });
  const skillInstallations = new SkillInstallationService({
    privateRootPath,
    onInstalled: () => core.restart(),
  });
  adminSkillTests?.stop();
  adminSkillTests = new AdminSkillDraftTestCoordinator({ core, installations: skillInstallations });
  adminSkillTests.start();
  const skillLocalDiscovery = new SkillLocalDiscoveryService({
    privateRootPath,
    onChanged: () => core.restart(),
  });
  const ensureDefaultWorkspaceGrant = (input: Readonly<{
    clientInstanceId: string;
    correlationId: string;
  }>) => defaultWorkspace.ensure(input);
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
    chooseWorkspaceArtifactFile: async (authorities, options) => {
      if (mainWindow === undefined || mainWindow.isDestroyed()) return undefined;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: options?.documentSourcesOnly === true ? "选择任务资料" : "注册工作区 Artifact",
        buttonLabel: options?.documentSourcesOnly === true ? "添加资料" : "注册",
        ...(authorities[0]?.rootRealPath === undefined
          ? {}
          : { defaultPath: authorities[0].rootRealPath }),
        properties: ["openFile"],
        filters: [
          {
            name: "Supported Documents",
            extensions: options?.documentSourcesOnly === true
              ? [
                "pdf", "xlsx", "docx",
                "md", "markdown", "txt", "html", "htm", "css",
                "js", "ts", "jsx", "tsx", "vue", "json", "yaml", "yml",
                "xml", "svg", "csv", "sql", "py", "java", "cs", "go", "rs",
                "toml", "ini",
              ]
              : [
                "pdf", "xlsx", "docx",
                "md", "markdown", "txt", "html", "htm", "css",
                "js", "ts", "jsx", "tsx", "vue", "json", "yaml", "yml",
                "xml", "svg", "csv", "sql", "py", "java", "cs", "go", "rs",
                "toml", "ini",
              ],
          },
        ],
      });
      return result.canceled ? undefined : result.filePaths[0];
    },
    ensureDefaultWorkspaceGrant,
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
  const v1alpha4Router = new DesktopV1Alpha4IpcRouter({
    resolveConnection: () => core.connectionLease(),
    isCurrentConnection: (lease) => core.isCurrentConnectionLease(lease),
    ensureDefaultWorkspaceGrant,
  });
  const v1alpha4Channels = Object.values(
    DESKTOP_V1ALPHA4_IPC_CHANNELS,
  ) as DesktopV1Alpha4InvokeChannel[];
  for (const channel of v1alpha4Channels) {
    ipcMain.handle(channel, (event, input: unknown) =>
      v1alpha4Router.dispatch(channel, input, event));
  }
  const v1alpha5Router = new DesktopV1Alpha5IpcRouter({
    resolveConnection: () => core.connectionLease(),
    isCurrentConnection: (lease) => core.isCurrentConnectionLease(lease),
    ensureDefaultWorkspaceGrant,
  });
  const v1alpha5Channels = Object.values(
    DESKTOP_V1ALPHA5_IPC_CHANNELS,
  ) as DesktopV1Alpha5InvokeChannel[];
  for (const channel of v1alpha5Channels) {
    ipcMain.handle(channel, (event, input: unknown) =>
      v1alpha5Router.dispatch(channel, input, event));
  }
  const taskReasoningRouter = new DesktopTaskReasoningV1Alpha1IpcRouter({
    resolveConnection: () => core.connectionLease(),
    isCurrentConnection: (lease) => core.isCurrentConnectionLease(lease),
  });
  const taskReasoningChannels = Object.values(
    DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS,
  ) as DesktopTaskReasoningV1Alpha1InvokeChannel[];
  for (const channel of taskReasoningChannels) {
    ipcMain.handle(channel, (event, input: unknown) =>
      taskReasoningRouter.dispatch(channel, input, event));
  }
  const personalModelRouter = new PersonalModelV1Alpha1IpcRouter({
    resolveConnection: () => core.connectionLease(),
    isCurrentConnection: (lease) => core.isCurrentConnectionLease(lease),
    isAuthorizedWebContents: (webContentsId) =>
      mainWindow !== undefined
      && !mainWindow.isDestroyed()
      && mainWindow.webContents.id === webContentsId,
  });
  const personalModelChannels = Object.values(
    PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS,
  ) as PersonalModelV1Alpha1InvokeChannel[];
  for (const channel of personalModelChannels) {
    ipcMain.handle(channel, (event, input: unknown) =>
      personalModelRouter.dispatch(channel, input, event));
  }
  const personalModelV1Alpha2Router = new PersonalModelV1Alpha2IpcRouter({
    resolveConnection: () => core.connectionLease(),
    isCurrentConnection: (lease) => core.isCurrentConnectionLease(lease),
    transport: personalCredentialTransport,
    isAuthorizedWebContents: (webContentsId) => mainWindow !== undefined
      && !mainWindow.isDestroyed()
      && mainWindow.webContents.id === webContentsId,
  });
  const personalModelV1Alpha2Channels = Object.values(
    PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS,
  ) as PersonalModelV1Alpha2InvokeChannel[];
  for (const channel of personalModelV1Alpha2Channels) {
    ipcMain.handle(channel, (event, input: unknown) =>
      personalModelV1Alpha2Router.dispatch(channel, input, event));
  }
  const agentLifecycleRouter = new AgentLifecycleV1Alpha1IpcRouter({
    resolveConnection: () => core.connectionLease(),
    isCurrentConnection: (lease) => core.isCurrentConnectionLease(lease),
    isAuthorizedWebContents: (webContentsId) => mainWindow !== undefined
      && !mainWindow.isDestroyed()
      && mainWindow.webContents.id === webContentsId,
  });
  const agentLifecycleChannels = Object.values(
    AGENT_LIFECYCLE_V1ALPHA1_IPC_CHANNELS,
  ) as AgentLifecycleV1Alpha1InvokeChannel[];
  for (const channel of agentLifecycleChannels) {
    ipcMain.handle(channel, (event, input: unknown) =>
      agentLifecycleRouter.dispatch(channel, input, event));
  }
  const skillLifecycleRouter = new SkillLifecycleV1Alpha1IpcRouter({
    resolveConnection: () => core.connectionLease(),
    isCurrentConnection: (lease) => core.isCurrentConnectionLease(lease),
    isAuthorizedWebContents: (webContentsId) => mainWindow !== undefined
      && !mainWindow.isDestroyed()
      && mainWindow.webContents.id === webContentsId,
    draftWorkspaces: skillDraftWorkspaces,
      installations: skillInstallations,
      localDiscovery: skillLocalDiscovery,
  });
  const skillLifecycleChannels = Object.values(
    SKILL_LIFECYCLE_V1ALPHA1_IPC_CHANNELS,
  ) as SkillLifecycleV1Alpha1InvokeChannel[];
  for (const channel of skillLifecycleChannels) {
    ipcMain.handle(channel, (event, input: unknown) =>
      skillLifecycleRouter.dispatch(channel, input, event));
  }
  if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
    const webContents = mainWindow.webContents;
    const clearBinding = (): void => {
      v1alpha5Router.removeWebContents(webContents.id);
      taskReasoningRouter.removeWebContents(webContents.id);
      personalModelRouter.removeWebContents(webContents.id);
      personalModelV1Alpha2Router.removeWebContents(webContents.id);
    };
    webContents.on("did-start-navigation", clearBinding);
    webContents.on("render-process-gone", clearBinding);
    webContents.once("destroyed", clearBinding);
    mainWindow.once("closed", () => {
      v1alpha5Router.clear();
      taskReasoningRouter.clear();
      personalModelRouter.clear();
      personalModelV1Alpha2Router.clear();
    });
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
