// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const { ipcRenderer } = require("electron");

const PORT_CHANNEL = "robothree:personal-credential-transport:port-v1";
const REQUEST_CHANNEL = "robothree:strm22:request";
const EVIDENCE_CHANNEL = "robothree:strm22:evidence";
// eslint-disable-next-line no-undef
const scenario = process.env.ROBOTHREE_STRM22_SCENARIO ?? "unknown";

ipcRenderer.on(PORT_CHANNEL, (event, offer) => {
  void acceptOffer(event, offer).catch(() => {
    ipcRenderer.send(EVIDENCE_CHANNEL, { code: "preload_error" });
  });
});

async function acceptOffer(event, offer) {
  const port = event.ports[0];
  if (event.ports.length !== 1 || port === undefined) {
    ipcRenderer.send(EVIDENCE_CHANNEL, { code: "invalid_port_offer" });
    return;
  }
  let revealAuthorization;
  port.onmessage = (messageEvent) => {
    const message = messageEvent.data;
    if (message?.schemaVersion === "personal-credential-transport-frame-authorization.v1") {
      if (message.direction === "mutation_to_main") {
        const body = Uint8Array.from([17, 34, 51, 68]);
        port.postMessage({ header: message.frameHeader, body });
        body.fill(0);
      } else {
        revealAuthorization = message;
      }
      return;
    }
    if (message?.header?.frameType === "reveal_secret" && revealAuthorization !== undefined) {
      const exact = message.header.commandId === revealAuthorization.commandId
        && message.header.correlationId === revealAuthorization.correlationId
        && message.header.frameDigest === revealAuthorization.frameDigest
        && message.body instanceof Uint8Array
        && message.body.byteLength === revealAuthorization.bodyLength;
      message.body.fill(0);
      port.postMessage(exact
        ? revealAuthorization.revealCompletedAck
        : revealAuthorization.revealUncertainAck);
      ipcRenderer.send(EVIDENCE_CHANNEL, {
        code: exact ? "reveal_consumed" : "reveal_rejected",
      });
      revealAuthorization = undefined;
      return;
    }
    if (message?.controlType === "terminal_ack") {
      ipcRenderer.send(EVIDENCE_CHANNEL, {
        code: "terminal",
        terminal: message.terminal,
      });
    }
  };
  port.start();
  port.postMessage(offer.readyControl);
  if (scenario === "mutation_completed" || scenario === "broker_rejected") {
    port.postMessage({
      schemaVersion: "personal-credential-transport-frame-authorization-request.v1",
      protocolVersion: offer.protocolVersion,
      transportProfileRevision: offer.transportProfileRevision,
      commandId: offer.ticket.commandId,
      correlationId: offer.ticket.correlationId,
      direction: "mutation_to_main",
      frameType: "mutation_secret",
      bodyLength: 4,
    });
  }
}

ipcRenderer.send(REQUEST_CHANNEL, { scenario });
