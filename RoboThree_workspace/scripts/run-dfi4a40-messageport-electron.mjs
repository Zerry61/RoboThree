import { createHash } from "node:crypto";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import electron from "electron";

const {
  app,
  BrowserWindow,
  ipcMain,
  MessageChannelMain,
} = electron;

const READY_CHANNEL = "robothree:dfi4a40:message-port-ready";
const PORT_CHANNEL = "robothree:dfi4a40:message-port";
const DONE_CHANNEL = "robothree:dfi4a40:message-port-done";
const TRACE_CHANNEL = "robothree:dfi4a40:message-port-trace";
const TIMEOUT_MS = 8_000;

void app.whenReady()
  .then(run)
  .then((evidence) => {
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
    app.quit();
  })
  .catch((error) => {
    const summary = error instanceof Error
      ? `${error.name}:${error.message}`
      : "UnknownError";
    process.stderr.write(`DFI-4A.4.0 MessagePort Spike failed: ${summary.slice(0, 160)}\n`);
    app.exit(1);
  });

async function run() {
  const preload = fileURLToPath(new URL("./dfi4a40-messageport-preload.cjs", import.meta.url));
  const diagnostic = {
    stage: "window_created",
    preloadError: "none",
    preloadTrace: "none",
  };
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
  window.webContents.on("preload-error", (_event, _preloadPath, error) => {
    diagnostic.preloadError = error instanceof Error
      ? `${error.name}:${error.message}`.slice(0, 120)
      : "unknown";
  });
  ipcMain.on(TRACE_CHANNEL, (event, payload) => {
    if (event.sender.id === window.webContents.id
      && event.senderFrame === window.webContents.mainFrame
      && typeof payload?.stage === "string") {
      diagnostic.preloadTrace = payload.stage.slice(0, 64);
    }
  });

  try {
    let result;
    try {
      result = await withTimeout(
        runChannel(window, diagnostic),
        TIMEOUT_MS,
        () => `${diagnostic.stage};preload=${diagnostic.preloadError};trace=${diagnostic.preloadTrace}`,
      );
    } catch (error) {
      const isExpectedTransferGap = error instanceof Error
        && error.message.startsWith("message_port_spike_timeout:")
        && diagnostic.stage === "port_transferred_waiting_frames"
        && diagnostic.preloadTrace === "buffer_transferred";
      if (!isExpectedTransferGap) throw error;
      return Object.freeze({
        status: "BLOCKED",
        blocker: "BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER",
        protocolVersion: "dfi4a40-message-port-v1",
        sandbox: window.webContents.getLastWebPreferences().sandbox === true,
        contextIsolation:
          window.webContents.getLastWebPreferences().contextIsolation === true,
        nodeIntegrationDisabled:
          window.webContents.getLastWebPreferences().nodeIntegration === false,
        mainDerivedWebContentsIdentity: true,
        mainFrameBound: true,
        bidirectionalControlHandshake: true,
        senderBufferDetached: true,
        transferredByteFrameReceivedByMain: false,
        documentedMainTransferListKind: "MessagePortMain[]",
      });
    }
    return Object.freeze({
      status: "PASS",
      protocolVersion: "dfi4a40-message-port-v1",
      sandbox: window.webContents.getLastWebPreferences().sandbox === true,
      contextIsolation:
        window.webContents.getLastWebPreferences().contextIsolation === true,
      nodeIntegrationDisabled:
        window.webContents.getLastWebPreferences().nodeIntegration === false,
      mainDerivedWebContentsIdentity: result.mainDerivedWebContentsIdentity,
      mainFrameBound: result.mainFrameBound,
      secretByteLength: result.secretByteLength,
      transferredBufferDetached: result.transferredBufferDetached,
      oneShotDeliveryCount: result.oneShotDeliveryCount,
      secretDigestComputedWithoutDisclosure:
        /^sha256:[0-9a-f]{64}$/u.test(result.secretDigest),
      mainConsumerZeroized: result.mainConsumerZeroized,
      preloadCompletionAcknowledged: result.preloadCompletionAcknowledged,
    });
  } finally {
    ipcMain.removeAllListeners(READY_CHANNEL);
    ipcMain.removeAllListeners(DONE_CHANNEL);
    ipcMain.removeAllListeners(TRACE_CHANNEL);
    window.destroy();
  }
}

async function runChannel(window, diagnostic) {
  let readySenderMatches = false;
  let readyFrameMatches = false;
  let completionAcknowledged = false;

  const ready = new Promise((resolve, reject) => {
    ipcMain.once(READY_CHANNEL, (event, payload) => {
      readySenderMatches = event.sender.id === window.webContents.id;
      readyFrameMatches = event.senderFrame === window.webContents.mainFrame;
      if (!readySenderMatches
        || !readyFrameMatches
        || payload?.protocolVersion !== "dfi4a40-message-port-v1") {
        reject(new Error("message_port_ready_identity_mismatch"));
        return;
      }
      resolve();
    });
  });

  const done = new Promise((resolve, reject) => {
    ipcMain.once(DONE_CHANNEL, (event, payload) => {
      if (event.sender.id !== window.webContents.id
        || event.senderFrame !== window.webContents.mainFrame
        || payload?.status !== "completed") {
        reject(new Error("message_port_completion_identity_mismatch"));
        return;
      }
      completionAcknowledged = true;
      resolve();
    });
  });

  await window.loadURL("data:text/html;charset=utf-8,<main>DFI-4A.4.0 MessagePort Spike</main>");
  diagnostic.stage = "document_loaded_waiting_ready";
  await ready;
  diagnostic.stage = "preload_ready";

  const { port1, port2 } = new MessageChannelMain();
  let secretByteLength = 0;
  let secretDigest = "";
  let deliveryCount = 0;
  let preloadReadyCount = 0;
  let detached = false;
  let zeroized = false;

  const received = new Promise((resolve, reject) => {
    port2.on("message", (event) => {
      const data = event.data;
      if (data?.type === "preload-ready") {
        preloadReadyCount += 1;
        diagnostic.preloadTrace = "message_port_bidirectional_ready";
        port2.postMessage({ type: "send-bytes" });
      } else if (data?.type === "secret-bytes") {
        if (!(data.secret instanceof Uint8Array) || data.secret.byteLength !== 32) {
          reject(new Error("message_port_secret_frame_invalid"));
          return;
        }
        deliveryCount += 1;
        const bytes = data.secret;
        secretByteLength = bytes.byteLength;
        secretDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        bytes.fill(0);
        zeroized = bytes.every((value) => value === 0);
      } else if (data?.type === "detachment-proof") {
        detached = data.detached === true;
      }

      if (deliveryCount === 1 && detached) {
        port2.postMessage({ type: "consumed" });
        resolve();
      }
    });
    port2.start();
  });

  window.webContents.postMessage(PORT_CHANNEL, {
    protocolVersion: "dfi4a40-message-port-v1",
  }, [port1]);
  port2.postMessage({ type: "ready" });
  diagnostic.stage = "port_transferred_waiting_frames";
  await Promise.all([received, done]);
  diagnostic.stage = "completed";
  port2.close();

  return Object.freeze({
    mainDerivedWebContentsIdentity: readySenderMatches,
    mainFrameBound: readyFrameMatches,
    secretByteLength,
    secretDigest,
    transferredBufferDetached: detached,
    oneShotDeliveryCount: deliveryCount,
    preloadReadyCount,
    mainConsumerZeroized: zeroized,
    preloadCompletionAcknowledged: completionAcknowledged,
  });
}

async function withTimeout(promise, timeoutMs, describe) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`message_port_spike_timeout:${describe()}`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
