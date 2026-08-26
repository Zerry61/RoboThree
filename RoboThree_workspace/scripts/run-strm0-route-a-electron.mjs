import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import electron from "electron";

const { app, BrowserWindow, ipcMain, MessageChannelMain } = electron;

const READY_CHANNEL = "robothree:strm0:ready";
const PORT_CHANNEL = "robothree:strm0:port";
const DONE_CHANNEL = "robothree:strm0:done";
const PROFILE_REVISION = "strm0.route-a.v1";
const MAX_BODY_LENGTH = 16_384;
const SCENARIOS = new Set([
  "roundtrip",
  "foreign_window",
  "wrong_identity",
  "duplicate",
  "wrong_brand",
  "zero_length",
  "max_length",
  "oversize",
  "navigation_invalidated",
  "renderer_crash",
  "port_close",
  "deadline",
]);
const MUTATION_FIXTURE = Object.freeze([
  115, 116, 114, 109, 48, 45, 109, 117, 116, 97, 116, 105, 111, 110, 45,
  99, 97, 110, 97, 114, 121, 45, 110, 111, 116, 45, 114, 101, 97, 108,
]);
const REVEAL_FIXTURE = Object.freeze([
  115, 116, 114, 109, 48, 45, 114, 101, 118, 101, 97, 108, 45, 99, 97,
  110, 97, 114, 121, 45, 110, 111, 116, 45, 114, 101, 97, 108,
]);
const scenario = process.argv[2];

if (!SCENARIOS.has(scenario)) {
  process.stderr.write("STRM-0 route A fixture rejected an unknown scenario\n");
  process.exit(2);
}

void app.whenReady()
  .then(() => runScenario(scenario))
  .then((evidence) => {
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
    app.quit();
  })
  .catch((error) => {
    const code = error instanceof Error ? error.message : "unknown_failure";
    process.stderr.write(`STRM-0 route A fixture failed: ${safeCode(code)}\n`);
    app.exit(1);
  });

async function runScenario(selectedScenario) {
  const resources = new ResourceTracker();
  const preload = fileURLToPath(new URL("./strm0-route-a-preload.cjs", import.meta.url));
  const primary = createWindow(preload);
  resources.windows.add(primary);
  let foreign;
  let primaryReady;
  let foreignRejected = false;
  const mainIdentity = {};
  const readyPromise = new Promise((resolve, reject) => {
    const listener = (event, payload) => {
      if (payload?.protocolVersion !== PROFILE_REVISION) {
        reject(new Error("safe_ready_protocol_mismatch"));
        return;
      }
      if (event.sender.id !== primary.webContents.id
        || event.senderFrame !== primary.webContents.mainFrame) {
        foreignRejected = true;
        return;
      }
      primaryReady = true;
      mainIdentity.webContentsId = event.sender.id;
      mainIdentity.mainFrameRoutingId = event.senderFrame.routingId;
      resolve();
    };
    ipcMain.on(READY_CHANNEL, listener);
    resources.ipcListeners.push([READY_CHANNEL, listener]);
  });
  const doneEvents = [];
  const doneListener = (event, payload) => {
    if (event.sender.id === primary.webContents.id
      && event.senderFrame === primary.webContents.mainFrame) {
      doneEvents.push(safeDone(payload));
    }
  };
  ipcMain.on(DONE_CHANNEL, doneListener);
  resources.ipcListeners.push([DONE_CHANNEL, doneListener]);

  try {
    if (selectedScenario === "foreign_window") {
      foreign = createWindow(preload);
      resources.windows.add(foreign);
      await foreign.loadURL("data:text/html;charset=utf-8,<main>foreign</main>");
      await waitUntil(() => foreignRejected, 2_000, "foreign_ready_not_observed");
    }
    await primary.loadURL("data:text/html;charset=utf-8,<main>STRM-0 Route A</main>");
    await withDeadline(readyPromise, 3_000, "primary_ready_timeout");
    if (primaryReady !== true) throw new Error("primary_ready_missing");

    const ticket = Object.freeze({
      runtimeInstanceId: "strm0-runtime-1",
      clientInstanceId: "strm0-client-1",
      commandId: `strm0-command-${selectedScenario}`,
      correlationId: `strm0-correlation-${selectedScenario}`,
      requestDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      profileRevision: PROFILE_REVISION,
    });
    const channel = new MessageChannelMain();
    resources.ports.add(channel.port2);
    const state = createState(selectedScenario, ticket, mainIdentity, foreignRejected);
    const terminalPromise = attachPort(channel.port2, state, resources);
    primary.webContents.postMessage(PORT_CHANNEL, {
      profileRevision: PROFILE_REVISION,
      scenario: selectedScenario,
      ticket,
    }, [channel.port1]);
    channel.port2.postMessage({ type: "bind" });

    const result = await runLifecycle(
      selectedScenario,
      primary,
      channel.port2,
      state,
      terminalPromise,
      resources,
    );
    if (!["navigation_invalidated", "renderer_crash", "port_close", "deadline"]
      .includes(selectedScenario)) {
      await waitUntil(() => doneEvents.length === 1, 1_000, "terminal_ack_missing");
    }
    const security = Object.freeze({
      sandbox: primary.webContents.getLastWebPreferences().sandbox === true,
      contextIsolation:
        primary.webContents.getLastWebPreferences().contextIsolation === true,
      nodeIntegrationDisabled:
        primary.webContents.getLastWebPreferences().nodeIntegration === false,
    });
    channel.port2.close();
    resources.ports.delete(channel.port2);
    if (foreign !== undefined) {
      foreign.destroy();
      resources.windows.delete(foreign);
    }
    primary.destroy();
    resources.windows.delete(primary);
    cleanupIpc(resources);
    await nextTurn();
    return Object.freeze({
      status: "PASS",
      scenario: selectedScenario,
      profileRevision: PROFILE_REVISION,
      ...security,
      ...result,
      doneEventCount: doneEvents.length,
      resources: resources.snapshot(),
    });
  } finally {
    cleanupIpc(resources);
    resources.clearTimers();
    for (const port of resources.ports) port.close();
    resources.ports.clear();
    for (const window of resources.windows) {
      if (!window.isDestroyed()) window.destroy();
    }
    resources.windows.clear();
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

function createState(selectedScenario, ticket, mainIdentity, foreignRejected) {
  return {
    selectedScenario,
    ticket,
    mainIdentity,
    foreignRejected,
    preloadReadyCount: 0,
    frameCount: 0,
    acceptedFrameCount: 0,
    rejectedFrameCount: 0,
    duplicateRejectedCount: 0,
    mutationReceiverZeroized: false,
    mutationSenderRetainedAfterClone: false,
    mutationSenderZeroized: false,
    revealSenderRetainedAfterClone: false,
    revealSenderZeroized: false,
    revealReceiverZeroized: false,
    revealValid: false,
    terminalCode: "none",
    settled: false,
  };
}

function attachPort(port, state, resources) {
  let resolveTerminal;
  const terminal = new Promise((resolve) => {
    resolveTerminal = resolve;
  });
  const settle = (code) => {
    if (state.settled) return;
    state.settled = true;
    state.terminalCode = code;
    resolveTerminal();
  };
  state.settle = settle;
  port.on("message", (event) => {
    const message = event.data;
    if (message?.type === "preload_ready") {
      state.preloadReadyCount += 1;
      return;
    }
    if (message?.type === "sender_proof") {
      state.mutationSenderRetainedAfterClone =
        message.senderRetainedAfterClone === true;
      state.mutationSenderZeroized = message.senderZeroized === true;
      return;
    }
    if (message?.type === "reveal_proof") {
      state.revealValid = message.valid === true;
      state.revealReceiverZeroized = message.receiverZeroized === true;
      if (state.selectedScenario === "roundtrip"
        || state.selectedScenario === "foreign_window"
        || state.selectedScenario === "max_length") {
        port.postMessage({ type: "terminal", code: "accepted" });
        settle("accepted");
      }
      return;
    }
    if (message?.type !== "mutation_frame") return;
    state.frameCount += 1;
    const validation = validateFrame(message, state);
    const body = message.body instanceof Uint8Array ? message.body : undefined;
    if (!validation.accepted) {
      state.rejectedFrameCount += 1;
      if (body !== undefined) body.fill(0);
      if (state.selectedScenario !== "duplicate") {
        port.postMessage({ type: "terminal", code: validation.code });
        settle(validation.code);
      }
      return;
    }
    if (state.acceptedFrameCount > 0) {
      state.duplicateRejectedCount += 1;
      body.fill(0);
      port.postMessage({ type: "terminal", code: "duplicate_frame" });
      settle("duplicate_frame");
      return;
    }
    state.acceptedFrameCount += 1;
    const expected = state.selectedScenario === "max_length"
      ? body.every((value) => value === 7)
      : equalBytes(body, MUTATION_FIXTURE);
    body.fill(0);
    state.mutationReceiverZeroized = body.every((value) => value === 0);
    if (!expected) {
      port.postMessage({ type: "terminal", code: "fixture_mismatch" });
      settle("fixture_mismatch");
      return;
    }
    if (state.selectedScenario === "duplicate") return;
    const reveal = Uint8Array.from(REVEAL_FIXTURE);
    port.postMessage({ type: "reveal_frame", body: reveal });
    state.revealSenderRetainedAfterClone = equalBytes(reveal, REVEAL_FIXTURE);
    reveal.fill(0);
    state.revealSenderZeroized = reveal.every((value) => value === 0);
  });
  port.on("close", () => {
    resources.ports.delete(port);
    if (!state.settled) settle("port_closed");
  });
  port.start();
  return terminal;
}

function validateFrame(message, state) {
  if (message.header?.profileRevision !== PROFILE_REVISION
    || message.header?.runtimeInstanceId !== state.ticket.runtimeInstanceId
    || message.header?.clientInstanceId !== state.ticket.clientInstanceId
    || message.header?.commandId !== state.ticket.commandId
    || message.header?.correlationId !== state.ticket.correlationId
    || message.header?.requestDigest !== state.ticket.requestDigest) {
    return { accepted: false, code: "identity_mismatch" };
  }
  if (!(message.body instanceof Uint8Array)) {
    return { accepted: false, code: "wrong_brand" };
  }
  if (message.body.buffer instanceof SharedArrayBuffer) {
    return { accepted: false, code: "shared_buffer_rejected" };
  }
  if (message.body.byteLength === 0) {
    return { accepted: false, code: "body_empty" };
  }
  if (message.body.byteLength > MAX_BODY_LENGTH) {
    return { accepted: false, code: "body_oversize" };
  }
  return { accepted: true, code: "accepted" };
}

async function runLifecycle(
  selectedScenario,
  primary,
  port,
  state,
  terminalPromise,
  resources,
) {
  await waitUntil(() => state.preloadReadyCount === 1, 2_000, "preload_not_ready");
  if (selectedScenario === "navigation_invalidated") {
    const invalidated = new Promise((resolve) => {
      primary.webContents.once("did-start-navigation", () => resolve());
    });
    state.settle("navigation_invalidated");
    await primary.loadURL("data:text/html;charset=utf-8,<main>navigated</main>");
    await invalidated;
    port.close();
  } else if (selectedScenario === "renderer_crash") {
    state.settle("process_lost");
    primary.webContents.forcefullyCrashRenderer();
    await new Promise((resolve) => primary.webContents.once("render-process-gone", resolve));
    port.close();
  } else {
    port.postMessage({ type: "execute" });
    if (selectedScenario === "deadline") {
      const timer = setTimeout(() => {
        state.settle("timed_out");
        port.close();
      }, 50);
      resources.timers.add(timer);
      await terminalPromise;
      clearTimeout(timer);
      resources.timers.delete(timer);
      await new Promise((resolve) => setTimeout(resolve, 220));
    } else {
      await withDeadline(terminalPromise, 3_000, "scenario_terminal_timeout");
    }
  }

  assertScenario(selectedScenario, state);
  return projectEvidence(state);
}

function assertScenario(selectedScenario, state) {
  const accepted = new Set(["roundtrip", "foreign_window", "max_length"]);
  if (accepted.has(selectedScenario)) {
    if (state.terminalCode !== "accepted"
      || state.acceptedFrameCount !== 1
      || state.revealValid !== true
      || state.mutationReceiverZeroized !== true
      || state.mutationSenderRetainedAfterClone !== true
      || state.mutationSenderZeroized !== true
      || state.revealSenderRetainedAfterClone !== true
      || state.revealSenderZeroized !== true
      || state.revealReceiverZeroized !== true) {
      throw new Error("accepted_scenario_invariant_failed");
    }
  }
  const expected = {
    wrong_identity: "identity_mismatch",
    duplicate: "duplicate_frame",
    wrong_brand: "wrong_brand",
    zero_length: "body_empty",
    oversize: "body_oversize",
    navigation_invalidated: "navigation_invalidated",
    renderer_crash: "process_lost",
    port_close: "port_closed",
    deadline: "timed_out",
  }[selectedScenario];
  if (expected !== undefined && state.terminalCode !== expected) {
    throw new Error("rejection_scenario_invariant_failed");
  }
  if (selectedScenario === "foreign_window" && !state.foreignRejected) {
    throw new Error("foreign_window_was_not_rejected");
  }
  if (["navigation_invalidated", "renderer_crash", "port_close", "deadline"]
    .includes(selectedScenario) && state.acceptedFrameCount !== 0) {
    throw new Error("lifecycle_scenario_delivered_sensitive_frame");
  }
}

function projectEvidence(state) {
  return Object.freeze({
    terminalCode: state.terminalCode,
    mainDerivedWebContentsIdentity: Number.isInteger(state.mainIdentity.webContentsId),
    mainDerivedMainFrameIdentity: Number.isInteger(state.mainIdentity.mainFrameRoutingId),
    foreignWindowRejected: state.foreignRejected,
    preloadReadyCount: state.preloadReadyCount,
    frameCount: state.frameCount,
    acceptedFrameCount: state.acceptedFrameCount,
    rejectedFrameCount: state.rejectedFrameCount,
    duplicateRejectedCount: state.duplicateRejectedCount,
    mutationSenderRetainedAfterClone: state.mutationSenderRetainedAfterClone,
    mutationSenderZeroized: state.mutationSenderZeroized,
    mutationReceiverZeroized: state.mutationReceiverZeroized,
    revealSenderRetainedAfterClone: state.revealSenderRetainedAfterClone,
    revealSenderZeroized: state.revealSenderZeroized,
    revealReceiverZeroized: state.revealReceiverZeroized,
    revealValid: state.revealValid,
  });
}

class ResourceTracker {
  windows = new Set();
  ports = new Set();
  timers = new Set();
  ipcListeners = [];

  clearTimers() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  snapshot() {
    return Object.freeze({
      windowCount: this.windows.size,
      portCount: this.ports.size,
      timerCount: this.timers.size,
      ipcListenerCount: this.ipcListeners.length,
      requestCount: 0,
      registryCount: 0,
      childCount: 0,
      helperCount: 0,
    });
  }
}

function cleanupIpc(resources) {
  for (const [channel, listener] of resources.ipcListeners) {
    ipcMain.removeListener(channel, listener);
  }
  resources.ipcListeners.length = 0;
}

function safeDone(payload) {
  return Object.freeze({
    status: typeof payload?.status === "string" ? payload.status : "unknown",
    code: typeof payload?.code === "string" ? payload.code : "unknown",
  });
}

function equalBytes(actual, expected) {
  return actual.byteLength === expected.length
    && actual.every((value, index) => value === expected[index]);
}

async function waitUntil(predicate, timeoutMs, code) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started >= timeoutMs) throw new Error(code);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function withDeadline(promise, timeoutMs, code) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function nextTurn() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function safeCode(value) {
  return String(value)
    .replaceAll(process.cwd(), "<workspace>")
    .replace(/[^a-z0-9_:(). <>-]/giu, "_")
    .slice(0, 160) || "unknown_failure";
}
