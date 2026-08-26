// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const { ipcRenderer } = require("electron");

const PORT_CHANNEL = "robothree:personal-credential-transport:port-v1";
const REQUEST_CHANNEL = "robothree:strm21:request";
const READY_CHANNEL = "robothree:strm21:ready";
// eslint-disable-next-line no-undef
const scenario = process.env.ROBOTHREE_STRM21_SCENARIO ?? "unknown";

ipcRenderer.on(PORT_CHANNEL, (event, offer) => {
  void acceptOffer(event, offer).catch((error) => {
    ipcRenderer.send(READY_CHANNEL, {
      code: "preload_error",
      reason: error instanceof Error ? error.name : "UnknownError",
    });
  });
});

async function acceptOffer(event, offer) {
  const port = event.ports[0];
  if (event.ports.length !== 1 || port === undefined) {
    ipcRenderer.send(READY_CHANNEL, { code: "invalid_port_offer" });
    return;
  }
  port.onmessage = (messageEvent) => {
    const message = messageEvent.data;
    if (message?.controlType === "terminal_ack") {
      ipcRenderer.send(READY_CHANNEL, { code: "terminal_ack" });
    }
  };
  port.start();
  port.postMessage(offer.readyControl);
  ipcRenderer.send(READY_CHANNEL, { code: "ready" });
  if (scenario === "ready_cancel") {
    port.postMessage(offer.cancelControl);
  }
}

ipcRenderer.send(REQUEST_CHANNEL, { scenario });
