import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { clearTimeout, setImmediate, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import electron from "electron";

import {
  CorePrivateSupervisor,
} from "../apps/desktop/dist/main/core-private-supervisor.js";
import {
  PersonalCredentialTransportProductionController,
} from "../apps/desktop/dist/main/personal-credential-transport-controller.js";
import {
  PersonalCredentialTransportMainAdapter,
} from "../apps/desktop/dist/main/personal-credential-transport.js";

const { app, BrowserWindow, ipcMain, MessageChannelMain } = electron;
const scenario = process.env.ROBOTHREE_STRM23_SCENARIO ?? "unknown";
const scenarioId = process.env.ROBOTHREE_STRM23_SCENARIO_ID ?? scenario;
const REQUEST_CHANNEL = "robothree:strm23:request";
const EVENT_CHANNEL = "robothree:strm23:event";
const supported = new Set([
  "s1_mutation", "s1_reveal",
  "s2_mutation", "s2_reveal",
  "s3_mutation", "s3_reveal",
  "s4_mutation",
  "s5_mutation", "s5_reveal",
  "s6_mutation", "s6_reveal",
  "s7_mutation", "s7_reveal",
  "s8_navigation", "s8_reload", "s8_renderer_crash", "s8_core_restart",
  "s8_main_close", "s8_profile_change",
]);

if (!supported.has(scenario)) {
  process.stderr.write("strm23_unknown_scenario\n");
  process.exit(2);
}

app.disableHardwareAcceleration();
app.on("window-all-closed", () => undefined);
void app.whenReady()
  .then(run)
  .then(async (evidence) => {
    await new Promise((resolve) => process.stdout.write(
      `${JSON.stringify({ type: "evidence", ...evidence })}\n`,
      resolve,
    ));
    app.quit();
  })
  .catch((error) => {
    process.stderr.write(`strm23_fixture_failed:${safeCode(error)}\n`);
    app.exit(1);
  });

async function run() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const preload = join(scriptDirectory, "..", "apps", "desktop", "dist", "strm23", "preload.cjs");
  const page = join(scriptDirectory, "strm23-process.html");
  const childEntry = join(scriptDirectory, "strm23-controlled-core-child.mjs");
  const coreProcesses = new Set();
  const brokerClients = new Set();
  const sensitiveStreams = new Set();
  const helperProcesses = new Set();
  const actionBus = new EventEmitter();
  const coreBus = new EventEmitter();
  const commandReader = createInterface({ input: process.stdin });
  let currentCore;
  let coreStartCount = 0;
  let coreExitCount = 0;
  let brokerDispatchCount = 0;
  let barrierReachedCount = 0;
  let actionCount = 0;
  let terminalObserved = false;
  let requestCount = 0;
  let runtimeChanged = false;
  let channelChanged = false;
  let result;

  commandReader.on("line", (line) => {
    try {
      const command = JSON.parse(line);
      if (command?.scenarioId === scenarioId && typeof command.action === "string") {
        actionBus.emit("action", command.action);
      }
    } catch {
      actionBus.emit("invalid_action");
    }
  });

  const spawnChild = (entryPath) => {
    const child = fork(entryPath, [], {
      cwd: dirname(entryPath),
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "test",
        ROBOTHREE_STRM23_SCENARIO: scenario,
      },
      execArgv: [],
      serialization: "json",
      stdio: ["ignore", "ignore", "pipe", "ipc", "pipe", "pipe"],
    });
    currentCore = child;
    coreStartCount += 1;
    coreProcesses.add(child);
    for (const stream of [child.stdio?.[4], child.stdio?.[5]]) {
      if (stream !== null && stream !== undefined) sensitiveStreams.add(stream);
    }
    child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    child.on("message", (message) => {
      if (message?.type === "desktop.core.ready") {
        coreBus.emit("ready", { ordinal: coreStartCount });
      }
      if (message?.type === "strm23.core_barrier") {
        void handleAsyncBarrier({
          window: message.window,
          direction: message.direction,
          phase: message.phase,
          brokerInflightCount: message.brokerInflightCount,
        });
      }
    });
    child.once("exit", () => {
      coreExitCount += 1;
      coreProcesses.delete(child);
      for (const stream of [child.stdio?.[4], child.stdio?.[5]]) {
        if (stream !== null && stream !== undefined) sensitiveStreams.delete(stream);
      }
    });
    return child;
  };

  const supervisor = new CorePrivateSupervisor({
    entryPath: childEntry,
    databasePath: join(scriptDirectory, `strm23-${scenario}.sqlite`),
    maxUnexpectedRestarts: 1,
    dependencies: {
      spawnChild,
      createClient: () => Object.freeze({}),
      restartDelayMs: 5,
    },
  });
  await supervisor.start();

  const adapter = new PersonalCredentialTransportMainAdapter({ foundationEnabled: true });
  const diagnosticAdapter = new Proxy(adapter, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === "createFrameAuthorization" && typeof value === "function") {
        return (...args) => {
          if (scenario === "s5_reveal" && args[2]?.direction === "reveal_to_preload") {
            blockAt("S5", "reveal", "broker_bytes_at_main_before_port_post");
          }
          return value.apply(target, args);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  const createMessageChannel = () => {
    if (scenario === "s2_mutation" || scenario === "s2_reveal") {
      blockAt("S2", directionOf(scenario), "ticket_created_before_port_bind");
    }
    const channel = new MessageChannelMain();
    return {
      port1: channel.port1,
      port2: new HarnessPortProxy(channel.port2, {
        scenario,
        blockAt,
      }),
    };
  };

  const controller = new PersonalCredentialTransportProductionController({
    foundationEnabled: true,
    adapter: diagnosticAdapter,
    createMessageChannel,
    brokerLeaseProvider: {
      current: () => {
        if (scenario === "s3_reveal") {
          blockAt("S3", "reveal", "port_ready_before_broker_dispatch");
        }
        if (scenario === "s5_mutation") {
          blockAt("S5", "mutation", "main_received_before_broker_dispatch");
        }
        const client = supervisor.personalCredentialBroker;
        brokerClients.add(client);
        const countedClient = new Proxy(client, {
          get(target, property) {
            const value = Reflect.get(target, property, target);
            if (property === "execute" && typeof value === "function") {
              return (...args) => {
                brokerDispatchCount += 1;
                return value.apply(target, args);
              };
            }
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return {
          runtimeInstanceId: supervisor.runtimeInstanceId,
          channelInstanceId: client.channelInstanceId,
          clientInstanceId: supervisor.clientInstanceId,
          client: countedClient,
        };
      },
    },
  });

  const window = new BrowserWindow({
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
  const initialPageLoaded = onceEvent(window.webContents, "did-finish-load");
  const detach = controller.attachWebContents(window.webContents);
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });
  const timeout = setTimeout(() => resolveDone({
    classification: "fixture_timeout",
    typedErrorCode: "strm23_fixture_timeout",
  }), 12_000);

  const onRequest = (event) => {
    requestCount += 1;
    try {
      controller.openPreparedCommand(prepared(supervisor), event);
    } catch (error) {
      if (scenario === "s8_reload" && requestCount > 1) return;
      resolveDone({ classification: "request_rejected", typedErrorCode: safeCode(error) });
    }
  };
  const onEvent = (_event, input) => {
    if (input?.type === "barrier") {
      void handleAsyncBarrier({
        window: windowName(scenario),
        direction: input.direction ?? directionOf(scenario),
        phase: input.phase,
      });
      return;
    }
    if (input?.type === "terminal" || input?.type === "terminal_error") {
      terminalObserved = true;
      if ((scenario === "s6_mutation" || scenario === "s6_reveal") && runtimeChanged) {
        resolveDone({
          classification: scenario.endsWith("reveal")
            ? "reveal_uncertain_no_replay"
            : "business_reconciliation_required",
          typedErrorCode: input.typedErrorCode ?? "personal_credential_transport_uncertain",
        });
      }
      return;
    }
    if (input?.type === "reveal_consumed") {
      terminalObserved = true;
    }
  };
  ipcMain.on(REQUEST_CHANNEL, onRequest);
  ipcMain.on(EVENT_CHANNEL, onEvent);

  async function handleAsyncBarrier(barrier) {
    if (barrierReachedCount > 0) return;
    barrierReachedCount += 1;
    const actionPromise = nextAction(actionBus);
    announceBarrier(barrier);
    const action = await actionPromise;
    actionCount += 1;
    if (action === "continue") {
      resolveDone({ classification: classificationFor(scenario) });
      return;
    }
    if (action === "close_port") {
      controller.close();
      resolveDone({ classification: "closed_without_secret_delivery" });
      return;
    }
    if (action === "navigate") {
      await window.webContents.executeJavaScript("location.hash = '#strm23-next'", true);
      resolveDone({ classification: "old_navigation_invalidated" });
      return;
    }
    if (action === "reload") {
      await initialPageLoaded;
      const reloaded = onceEvent(window.webContents, "did-finish-load");
      window.webContents.reload();
      await reloaded;
      resolveDone({ classification: "old_navigation_invalidated" });
      return;
    }
    if (action === "crash_renderer") {
      const rendererGone = onceEvent(window.webContents, "render-process-gone");
      window.webContents.forcefullyCrashRenderer();
      await rendererGone;
      resolveDone({ classification: "renderer_process_lost" });
      return;
    }
    if (action === "close_main") {
      controller.close();
      resolveDone({ classification: "main_closed" });
      return;
    }
    if (action === "kill_core") {
      const oldRuntime = supervisor.runtimeInstanceId;
      const oldChannel = supervisor.personalCredentialBroker.channelInstanceId;
      const readyPromise = nextCoreReady(coreBus, coreStartCount + 1);
      currentCore?.kill("SIGKILL");
      await readyPromise;
      await new Promise((resolve) => setImmediate(resolve));
      runtimeChanged = supervisor.runtimeInstanceId !== oldRuntime;
      channelChanged = supervisor.personalCredentialBroker.channelInstanceId !== oldChannel;
      if (scenario === "s6_mutation" || scenario === "s6_reveal") {
        resolveDone({
          classification: scenario.endsWith("reveal")
            ? "reveal_uncertain_no_replay"
            : "business_reconciliation_required",
          typedErrorCode: "personal_credential_transport_uncertain",
        });
        return;
      }
      return;
    }
    if (action === "restart_core") {
      const oldRuntime = supervisor.runtimeInstanceId;
      const oldChannel = supervisor.personalCredentialBroker.channelInstanceId;
      await supervisor.restart();
      runtimeChanged = supervisor.runtimeInstanceId !== oldRuntime;
      channelChanged = supervisor.personalCredentialBroker.channelInstanceId !== oldChannel;
      resolveDone({ classification: "old_core_lease_invalidated" });
    }
  }

  function announceBarrier(barrier) {
    const controllerSnapshot = controller.snapshot();
    process.stdout.write(`${JSON.stringify({
      type: "barrier",
      scenario,
      scenarioId,
      window: barrier.window,
      direction: barrier.direction,
      phase: barrier.phase,
      safeIdentityDigest: safeIdentityDigest(scenarioId, barrier.window, barrier.direction),
      barrierReachedCount,
      brokerDispatchCount,
      lateCleanupCount: controllerSnapshot.lateCallbackCount,
      processTopology: {
        electronProcessId: process.pid,
        coreChildProcessIds: [...coreProcesses]
          .map((child) => child.pid)
          .filter(Number.isInteger),
        helperProcessIds: [...helperProcesses]
          .map((child) => child.pid)
          .filter(Number.isInteger),
      },
      resourceCounts: barrierResources(
        controllerSnapshot,
        adapter.snapshot(),
        brokerClients,
        coreProcesses,
        helperProcesses,
        sensitiveStreams,
      ),
    })}\n`);
  }

  function blockAt(windowNameValue, direction, phase) {
    barrierReachedCount += 1;
    announceBarrier({ window: windowNameValue, direction, phase });
    const lock = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(lock, 0, 0);
  }

  await window.loadFile(page);
  result = await done;
  clearTimeout(timeout);

  ipcMain.off(REQUEST_CHANNEL, onRequest);
  ipcMain.off(EVENT_CHANNEL, onEvent);
  commandReader.close();
  detach();
  controller.close();
  if (!window.isDestroyed()) window.destroy();
  await supervisor.stop();
  await Promise.all([...coreProcesses].map(waitForExit));

  const controllerResources = controller.snapshot();
  const adapterResources = adapter.snapshot();
  const resourceCounts = {
    windowCount: BrowserWindow.getAllWindows().filter((item) => !item.isDestroyed()).length,
    messagePortCount: controllerResources.messagePortCount,
    ipcListenerCount: ipcMain.listenerCount(REQUEST_CHANNEL) + ipcMain.listenerCount(EVENT_CHANNEL),
    navigationListenerCount: controllerResources.navigationListenerCount,
    timerCount: controllerResources.timerCount,
    transportSessionCount: controllerResources.sessionCount,
    transportRegistryCount: adapterResources.registryCount,
    frameAuthorizationCount: controllerResources.frameAuthorizationCount,
    brokerInflightCount: [...brokerClients]
      .reduce((sum, client) => sum + client.resourceSnapshot().inflight, 0),
    brokerCompletedCount: [...brokerClients]
      .reduce((sum, client) => sum + client.resourceSnapshot().completed, 0),
    brokerRevealTombstoneCount: [...brokerClients]
      .reduce((sum, client) => sum + client.resourceSnapshot().revealTombstones, 0),
    childProcessCount: coreProcesses.size,
    helperProcessCount: helperProcesses.size,
    openSensitiveStreamCount: [...sensitiveStreams]
      .filter((stream) => stream.destroyed !== true).length,
  };
  if (Object.values(resourceCounts).some((value) => value !== 0)) {
    throw new Error("strm23_resource_not_zero");
  }
  return {
    status: result.classification === "fixture_timeout" ? "FAIL" : "PASS",
    scenario,
    window: windowName(scenario),
    direction: directionOf(scenario),
    classification: result.classification,
    typedErrorCode: result.typedErrorCode ?? "none",
    barrierReachedCount,
    actionCount,
    brokerDispatchCount,
    terminalObserved,
    runtimeChanged,
    channelChanged,
    coreStartCount,
    coreExitCount,
    sandbox: true,
    contextIsolation: true,
    nodeIntegrationDisabled: true,
    realCorePrivateSupervisor: true,
    jsonLifecycleFd3: true,
    binaryBrokerFd4Fd5: true,
    resourceCounts,
    resourceAccountingSources: [
      "electron_app_windows",
      "controller_snapshot",
      "adapter_snapshot",
      "broker_client_snapshot",
      "core_child_exit_handles",
      "helper_process_handle_registry",
      "sensitive_stream_handles",
    ],
    lateCleanupCount: controllerResources.lateCallbackCount,
    productionFeatureEnabled: false,
    productionSensitiveTransportReady: false,
    productionBusinessHandlerReady: false,
    transportBlockerClosed: false,
    rendererBusinessApiExposed: false,
    zeroCopyClaimed: false,
  };
}

class HarnessPortProxy extends EventEmitter {
  constructor(port, input) {
    super();
    this.port = port;
    this.input = input;
    port.on("message", (event) => {
      if (input.scenario === "s4_mutation"
        && event.data?.header?.frameType === "mutation_secret") {
        input.blockAt("S4", "mutation", "preload_posted_before_main_receive");
        return;
      }
      this.emit("message", event);
    });
    port.once("close", () => this.emit("close"));
  }

  start() { this.port.start(); }

  postMessage(message) {
    this.port.postMessage(message);
    if (this.input.scenario === "s7_mutation"
      && message?.controlType === "terminal_ack") {
      this.input.blockAt("S7", "mutation", "terminal_posted_before_peer_settle");
    }
    if (this.input.scenario === "s7_reveal"
      && message?.header?.frameType === "reveal_secret") {
      this.input.blockAt("S7", "reveal", "reveal_posted_before_peer_ack");
    }
  }

  close() { this.port.close(); }
}

function prepared(supervisor) {
  const direction = directionOf(scenario);
  return {
    schemaVersion: "personal-credential-transport-prepared-command.v1",
    runtimeInstanceId: supervisor.runtimeInstanceId,
    clientInstanceId: supervisor.clientInstanceId,
    commandId: stableUuid(`${scenario}:command`),
    correlationId: stableUuid(`${scenario}:correlation`),
    operationType: direction === "reveal" ? "reveal" : "create",
    personalModelId: `model.personal.${scenario.replaceAll("_", ".")}`,
    expectedConfigurationRevision: stableDigest(`${scenario}:configuration`),
    ...(direction === "reveal"
      ? { expectedExecutionDefinitionDigest: stableDigest(`${scenario}:execution`) }
      : {}),
    requestDigest: stableDigest(`${scenario}:request`),
    deadlineAt: new Date(Date.now() + 10_000).toISOString(),
  };
}

function windowName(value) {
  return value.slice(0, 2).toUpperCase();
}

function directionOf(value) {
  return value.endsWith("reveal") || value === "s8_core_restart"
    ? "reveal"
    : "mutation";
}

function classificationFor(value) {
  if (value.startsWith("s1_")) return "no_transport_fact";
  if (value === "s8_profile_change") return "profile_mismatch_rejected";
  return "transport_closed";
}

function barrierResources(
  controllerSnapshot,
  adapterSnapshot,
  brokerClients,
  coreProcesses,
  helperProcesses,
  sensitiveStreams,
) {
  return {
    windowCount: BrowserWindow.getAllWindows().filter((item) => !item.isDestroyed()).length,
    messagePortCount: controllerSnapshot.messagePortCount,
    ipcListenerCount: ipcMain.listenerCount(REQUEST_CHANNEL) + ipcMain.listenerCount(EVENT_CHANNEL),
    navigationListenerCount: controllerSnapshot.navigationListenerCount,
    timerCount: controllerSnapshot.timerCount,
    transportSessionCount: controllerSnapshot.sessionCount,
    transportRegistryCount: adapterSnapshot.registryCount,
    frameAuthorizationCount: controllerSnapshot.frameAuthorizationCount,
    brokerInflightCount: [...brokerClients]
      .reduce((sum, client) => sum + client.resourceSnapshot().inflight, 0),
    brokerCompletedCount: [...brokerClients]
      .reduce((sum, client) => sum + client.resourceSnapshot().completed, 0),
    brokerRevealTombstoneCount: [...brokerClients]
      .reduce((sum, client) => sum + client.resourceSnapshot().revealTombstones, 0),
    childProcessCount: coreProcesses.size,
    helperProcessCount: helperProcesses.size,
    openSensitiveStreamCount: [...sensitiveStreams]
      .filter((stream) => stream.destroyed !== true).length,
  };
}

function nextAction(bus) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      bus.off("action", onAction);
      reject(new Error("strm23_action_timeout"));
    }, 5_000);
    const onAction = (action) => {
      clearTimeout(timer);
      resolve(action);
    };
    bus.once("action", onAction);
  });
}

function onceEvent(emitter, event) {
  return new Promise((resolve) => emitter.once(event, resolve));
}

function nextCoreReady(bus, expectedOrdinal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      bus.off("ready", onReady);
      reject(new Error("strm23_core_restart_timeout"));
    }, 5_000);
    const onReady = (event) => {
      if (event.ordinal !== expectedOrdinal) return;
      clearTimeout(timer);
      bus.off("ready", onReady);
      resolve(event);
    };
    bus.on("ready", onReady);
  });
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return onceEvent(child, "exit");
}

function stableDigest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function safeIdentityDigest(id, window, direction) {
  return stableDigest(JSON.stringify({ id, window, direction }));
}

function stableUuid(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
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
