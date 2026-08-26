"use strict";

// Electron sandboxed preloads are CommonJS and expose only Electron's allowlisted require.
// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const { ipcRenderer } = require("electron");

const READY_CHANNEL = "robothree:dfi4a40:message-port-ready";
const PORT_CHANNEL = "robothree:dfi4a40:message-port";
const DONE_CHANNEL = "robothree:dfi4a40:message-port-done";
const TRACE_CHANNEL = "robothree:dfi4a40:message-port-trace";

ipcRenderer.once(PORT_CHANNEL, (event, envelope) => {
  const port = event.ports?.[0];
  if (port === undefined
    || envelope?.protocolVersion !== "dfi4a40-message-port-v1") {
    ipcRenderer.send(DONE_CHANNEL, { status: "rejected" });
    return;
  }

  ipcRenderer.send(TRACE_CHANNEL, { stage: "port_received" });
  let sent = false;
  port.onmessage = (messageEvent) => {
    if (messageEvent.data?.type === "ready" && !sent) {
      port.postMessage({ type: "preload-ready" });
      return;
    }
    if (messageEvent.data?.type === "send-bytes" && !sent) {
      sent = true;
      sendBytes(port);
      return;
    }
    if (messageEvent.data?.type !== "consumed") return;
    ipcRenderer.send(DONE_CHANNEL, { status: "completed" });
    port.close();
  };
  port.start();
});

function sendBytes(port) {
  try {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const transferred = bytes.buffer;
    port.postMessage({
      type: "secret-bytes",
      secret: bytes,
    }, [transferred]);
    port.postMessage({
      type: "detachment-proof",
      detached: transferred.byteLength === 0,
    });
    ipcRenderer.send(TRACE_CHANNEL, {
      stage: transferred.byteLength === 0
        ? "buffer_transferred"
        : "buffer_not_detached",
    });
  } catch {
    ipcRenderer.send(DONE_CHANNEL, {
      status: "rejected",
      typedErrorCode: "preload_transfer_failed",
    });
    port.close();
  }
}

ipcRenderer.send(READY_CHANNEL, {
  protocolVersion: "dfi4a40-message-port-v1",
});
