"use strict";

// This is an isolated STRM-0 Electron Spike fixture. It is not loaded by the
// production Desktop preload and intentionally exposes no contextBridge API.
// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const { ipcRenderer } = require("electron");

const READY_CHANNEL = "robothree:strm0:ready";
const PORT_CHANNEL = "robothree:strm0:port";
const DONE_CHANNEL = "robothree:strm0:done";
const MUTATION_FIXTURE = Object.freeze([
  115, 116, 114, 109, 48, 45, 109, 117, 116, 97, 116, 105, 111, 110, 45,
  99, 97, 110, 97, 114, 121, 45, 110, 111, 116, 45, 114, 101, 97, 108,
]);
const REVEAL_FIXTURE = Object.freeze([
  115, 116, 114, 109, 48, 45, 114, 101, 118, 101, 97, 108, 45, 99, 97,
  110, 97, 114, 121, 45, 110, 111, 116, 45, 114, 101, 97, 108,
]);

ipcRenderer.once(PORT_CHANNEL, (event, envelope) => {
  const port = event.ports?.[0];
  if (port === undefined || envelope?.profileRevision !== "strm0.route-a.v1") {
    ipcRenderer.send(DONE_CHANNEL, { status: "rejected", code: "invalid_port" });
    return;
  }

  let terminal = false;
  port.onmessage = (messageEvent) => {
    const message = messageEvent.data;
    if (message?.type === "bind") {
      port.postMessage({ type: "preload_ready" });
      return;
    }
    if (message?.type === "execute" && !terminal) {
      executeScenario(port, envelope.scenario, envelope.ticket);
      return;
    }
    if (message?.type === "reveal_frame" && !terminal) {
      const body = message.body;
      const valid = body instanceof Uint8Array && equalBytes(body, REVEAL_FIXTURE);
      const receivedLength = body instanceof Uint8Array ? body.byteLength : 0;
      if (body instanceof Uint8Array) body.fill(0);
      port.postMessage({
        type: "reveal_proof",
        valid,
        receivedLength,
        receiverZeroized: body instanceof Uint8Array
          && body.every((value) => value === 0),
      });
      return;
    }
    if (message?.type === "terminal" && !terminal) {
      terminal = true;
      ipcRenderer.send(DONE_CHANNEL, {
        status: "terminal",
        code: typeof message.code === "string" ? message.code : "unknown",
      });
      port.close();
    }
  };
  port.start();
});

function executeScenario(port, scenario, ticket) {
  if (scenario === "port_close") {
    port.close();
    ipcRenderer.send(DONE_CHANNEL, { status: "closed", code: "port_closed" });
    return;
  }
  if (scenario === "deadline") {
    globalThis.setTimeout(() => sendMutation(port, scenario, ticket), 200);
    return;
  }
  sendMutation(port, scenario, ticket);
}

function sendMutation(port, scenario, ticket) {
  let body;
  if (scenario === "wrong_brand") body = new ArrayBuffer(8);
  else if (scenario === "zero_length") body = new Uint8Array(0);
  else if (scenario === "max_length") body = new Uint8Array(16_384).fill(7);
  else if (scenario === "oversize") body = new Uint8Array(16_385).fill(7);
  else body = Uint8Array.from(MUTATION_FIXTURE);

  const original = body instanceof Uint8Array ? body : undefined;
  const header = {
    ...ticket,
    commandId: scenario === "wrong_identity" ? "strm0-command-wrong" : ticket.commandId,
  };
  port.postMessage({ type: "mutation_frame", header, body });
  const senderRetainedAfterClone = original !== undefined
    && original.byteLength > 0
    && original.every((value, index) => {
      if (scenario === "max_length" || scenario === "oversize") return value === 7;
      return value === MUTATION_FIXTURE[index];
    });
  if (original !== undefined) original.fill(0);
  port.postMessage({
    type: "sender_proof",
    senderRetainedAfterClone,
    senderZeroized: original !== undefined
      && original.every((value) => value === 0),
    senderLength: original?.byteLength ?? 0,
  });
  if (scenario === "duplicate") {
    const duplicate = Uint8Array.from(MUTATION_FIXTURE);
    port.postMessage({ type: "mutation_frame", header, body: duplicate });
    duplicate.fill(0);
  }
}

function equalBytes(actual, expected) {
  return actual.byteLength === expected.length
    && actual.every((value, index) => value === expected[index]);
}

ipcRenderer.send(READY_CHANNEL, { protocolVersion: "strm0.route-a.v1" });
